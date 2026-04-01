import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { reconcileFeishuAdminGroups } from '~~/server/services/feishu/admin-sync'
import {
  decryptFeishuEventPayload,
  verifyFeishuWebhookSignature,
} from '~~/server/services/feishu/security'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { withClient } from '~~/server/utils/db'
import {
  listActiveFeishuBitableSyncItemsBySource,
  readFeishuIntegrationConfig,
  registerFeishuBitableEventDedup,
} from '~~/server/utils/feishu-integration-store'

function parseJsonText(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, unknown>
  }
  catch {
    return {}
  }
}

function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    return raw as Record<string, unknown>
  if (typeof raw === 'string')
    return parseJsonText(raw)
  return {}
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function shouldTriggerReconcile(eventType: string): boolean {
  const normalized = eventType.toLowerCase()
  if (!normalized)
    return true
  return normalized.includes('group')
    || normalized.includes('user')
    || normalized.includes('contact')
    || normalized.includes('department')
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(item => toText(item)).filter(Boolean))]
  }
  const single = toText(raw)
  return single ? [single] : []
}

function extractBitableEventPayload(payload: Record<string, unknown>): {
  eventId: string
  eventType: string
  appToken: string
  tableId: string
  recordIds: string[]
} {
  const header = asObject(payload.header)
  const event = asObject(payload.event)
  const eventData = asObject(event.data)
  const eventBody = Object.keys(eventData).length ? eventData : event
  const eventType = toText(header.event_type || payload.event_type)
  const eventId = toText(header.event_id || payload.event_id || eventBody.event_id || eventBody.uuid)
  const appToken = toText(
    eventBody.app_token
    || eventBody.base_id
    || eventBody.appToken
    || eventBody.appId,
  )
  const tableId = toText(
    eventBody.table_id
    || eventBody.tableId
    || eventBody.table,
  )
  const recordIds = [
    ...toStringArray(eventBody.record_ids),
    ...toStringArray(eventBody.record_id),
    ...toStringArray(asObject(eventBody.record).record_id),
  ]

  return {
    eventId,
    eventType,
    appToken,
    tableId,
    recordIds: [...new Set(recordIds)],
  }
}

function isBitableRecordEvent(eventType: string): boolean {
  const normalized = toText(eventType).toLowerCase()
  if (!normalized)
    return false
  return (normalized.includes('bitable') || normalized.includes('base'))
    && normalized.includes('record')
}

function buildInvalidSignatureResponse(event: H3Event) {
  setResponseStatus(event, 401)
  return {
    code: 401,
    msg: 'invalid_signature',
  }
}

export default defineEventHandler(async (event) => {
  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })

  if (!config.enabled)
    return { code: 0, msg: 'ignored_disabled' }

  const rawBody = String(await readRawBody(event) || '').trim()
  if (!rawBody)
    return { code: 0, msg: 'ignored_empty' }

  const signatureValid = verifyFeishuWebhookSignature({
    event,
    encryptKey: config.eventEncryptKey,
    rawBody,
  })
  if (!signatureValid) {
    return buildInvalidSignatureResponse(event)
  }

  let payload = parseJsonText(rawBody)
  const encrypted = toText(payload.encrypt)
  if (encrypted) {
    try {
      payload = decryptFeishuEventPayload({
        encryptKey: config.eventEncryptKey,
        encrypted,
      })
    }
    catch (error) {
      setResponseStatus(event, 400)
      return {
        code: 400,
        msg: error instanceof Error ? error.message : 'decrypt_failed',
      }
    }
  }

  const requestType = toText(payload.type)
  const challenge = toText(payload.challenge)
  if (requestType === 'url_verification' && challenge)
    return { challenge }

  const tokenInBody = toText(payload.token || asObject(payload.header).token)
  if (config.eventToken && tokenInBody && tokenInBody !== config.eventToken) {
    setResponseStatus(event, 403)
    return {
      code: 403,
      msg: 'invalid_token',
    }
  }

  const eventType = toText(asObject(payload.header).event_type || payload.event_type)
  if (isBitableRecordEvent(eventType)) {
    const parsed = extractBitableEventPayload(payload)
    if (!parsed.appToken || !parsed.tableId || parsed.recordIds.length === 0) {
      return {
        code: 0,
        msg: 'ignored_bitable_payload_invalid',
      }
    }

    const safeEventId = parsed.eventId
      || createHash('sha256').update(rawBody).digest('hex')
    const dedupInserted = await withClient(event, async (db) => {
      return registerFeishuBitableEventDedup(db, {
        eventId: safeEventId,
        eventType: parsed.eventType,
        appToken: parsed.appToken,
        tableId: parsed.tableId,
        recordIds: parsed.recordIds,
        payload,
      })
    })
    if (!dedupInserted) {
      return {
        code: 0,
        msg: 'ignored_duplicate_event',
      }
    }

    const items = await withClient(event, async (db) => {
      return listActiveFeishuBitableSyncItemsBySource(db, {
        appToken: parsed.appToken,
        tableId: parsed.tableId,
      })
    })
    for (const item of items) {
      const actorUserId = item.updatedByUserId || item.createdByUserId
      if (!actorUserId)
        continue
      await runWorkflow({
        providerName: 'feishu_bitable',
        syncItemId: item.id,
        actorUserId,
        triggerSource: 'webhook',
        mode: 'delta',
        recordIds: parsed.recordIds,
      }).catch((error) => {
        console.error('[feishu-events] delta sync failed:', {
          syncItemId: item.id,
          error: error instanceof Error ? error.message : String(error || 'UNKNOWN_ERROR'),
        })
      })
    }

    return {
      code: 0,
      msg: 'ok',
      mode: 'delta',
      matchedTasks: items.length,
    }
  }

  if (shouldTriggerReconcile(eventType)) {
    await reconcileFeishuAdminGroups(event)
  }

  return {
    code: 0,
    msg: 'ok',
  }
})
