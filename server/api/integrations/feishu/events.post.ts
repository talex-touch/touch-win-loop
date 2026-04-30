import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { reconcileFeishuAdminGroups } from '~~/server/services/feishu/admin-sync'
import { handleFeishuBitableAutoSyncForItem } from '~~/server/services/feishu/bitable-auto-sync'
import { getFeishuTenantAccessToken, listFeishuBitableRecordsByIds } from '~~/server/services/feishu/client'
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
  updateFeishuMarketplaceAppTicket,
} from '~~/server/utils/feishu-integration-store'
import {
  registerIntegrationEventDedup,
  updateFeishuWorkspaceConnectionStatusByTenantKey,
} from '~~/server/utils/workspace-integration-store'

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

function mergeRecordEventAction(currentAction: string, nextAction: string): string {
  const current = toText(currentAction)
  const next = toText(nextAction)
  if (next === 'record_deleted' || current === 'record_deleted')
    return 'record_deleted'
  if (next === 'record_added')
    return current || next
  return next || current
}

function extractActionRecordId(raw: Record<string, unknown>): string {
  return toText(
    raw.record_id
    || raw.recordId
    || asObject(raw.record).record_id
    || asObject(raw.record).recordId
    || asObject(raw.target).record_id
    || asObject(raw.target).recordId
    || asObject(raw.meta).record_id
    || asObject(raw.meta).recordId,
  )
}

function collectChangedFieldNames(raw: unknown, target: Set<string>): void {
  if (!raw)
    return

  if (Array.isArray(raw)) {
    for (const item of raw)
      collectChangedFieldNames(item, target)
    return
  }

  if (typeof raw === 'string') {
    const value = toText(raw)
    if (value)
      target.add(value)
    return
  }

  if (typeof raw !== 'object')
    return

  const source = raw as Record<string, unknown>
  const directFieldName = toText(
    source.field_name
    || source.fieldName
    || source.column_name
    || source.columnName
    || source.name,
  )
  if (directFieldName)
    target.add(directFieldName)

  for (const key of ['changed_fields', 'changedFields', 'field_names', 'fieldNames', 'fields']) {
    if (source[key] !== undefined)
      collectChangedFieldNames(source[key], target)
  }

  const beforeValue = asObject(source.before_value || source.beforeValue || source.old_value || source.oldValue)
  const afterValue = asObject(source.after_value || source.afterValue || source.new_value || source.newValue)
  for (const key of [...Object.keys(beforeValue), ...Object.keys(afterValue)]) {
    const normalizedKey = toText(key)
    if (normalizedKey)
      target.add(normalizedKey)
  }
}

function extractActionChangedFieldNames(raw: Record<string, unknown>): string[] {
  const changedFields = new Set<string>()
  collectChangedFieldNames(raw, changedFields)
  return [...changedFields]
}

function extractBitableEventPayload(payload: Record<string, unknown>): {
  eventId: string
  eventType: string
  appToken: string
  tableId: string
  recordIds: string[]
  recordEvents: Array<{
    recordId: string
    action: string
    changedFieldNames: string[]
  }>
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
  const fallbackAction = toText(eventBody.action || eventBody.action_type || eventBody.actionType)
  const recordEventsMap = new Map<string, { recordId: string, action: string, changedFieldNames: string[] }>()
  const actionList = Array.isArray(eventBody.action_list) ? eventBody.action_list : []

  for (const actionItem of actionList) {
    if (!actionItem || typeof actionItem !== 'object' || Array.isArray(actionItem))
      continue
    const actionRaw = actionItem as Record<string, unknown>
    const recordId = extractActionRecordId(actionRaw)
    if (!recordId)
      continue

    const current = recordEventsMap.get(recordId)
    const changedFieldNames = [
      ...(current?.changedFieldNames || []),
      ...extractActionChangedFieldNames(actionRaw),
    ]
    recordEventsMap.set(recordId, {
      recordId,
      action: mergeRecordEventAction(current?.action || '', toText(actionRaw.action || actionRaw.action_type || actionRaw.actionType || fallbackAction)),
      changedFieldNames: [...new Set(changedFieldNames)],
    })
  }

  for (const recordId of recordIds) {
    if (!recordId)
      continue
    if (!recordEventsMap.has(recordId)) {
      recordEventsMap.set(recordId, {
        recordId,
        action: fallbackAction,
        changedFieldNames: [],
      })
    }
  }

  return {
    eventId,
    eventType,
    appToken,
    tableId,
    recordIds: [...new Set([...recordIds, ...recordEventsMap.keys()])],
    recordEvents: [...recordEventsMap.values()],
  }
}

function isBitableRecordEvent(eventType: string): boolean {
  const normalized = toText(eventType).toLowerCase()
  if (!normalized)
    return false
  return (normalized.includes('bitable') || normalized.includes('base'))
    && normalized.includes('record')
}

function extractTenantKey(payload: Record<string, unknown>): string {
  const header = asObject(payload.header)
  const event = asObject(payload.event)
  return toText(
    header.tenant_key
    || header.tenantKey
    || event.tenant_key
    || event.tenantKey
    || payload.tenant_key
    || payload.tenantKey,
  )
}

function extractAppTicket(payload: Record<string, unknown>): string {
  const header = asObject(payload.header)
  const event = asObject(payload.event)
  return toText(
    event.app_ticket
    || event.appTicket
    || header.app_ticket
    || header.appTicket
    || payload.app_ticket
    || payload.appTicket,
  )
}

function extractGenericEventId(payload: Record<string, unknown>, rawBody: string): string {
  const header = asObject(payload.header)
  const event = asObject(payload.event)
  return toText(
    header.event_id
    || header.eventId
    || event.event_id
    || event.eventId
    || payload.event_id
    || payload.eventId,
  ) || createHash('sha256').update(rawBody).digest('hex')
}

function resolveWorkspaceConnectionStatusByFeishuEvent(eventType: string): 'connected' | 'uninstalled' | '' {
  const normalized = eventType.toLowerCase()
  if (normalized.includes('app') && (normalized.includes('open') || normalized.includes('installed') || normalized.includes('enabled')))
    return 'connected'
  if (normalized.includes('app') && (normalized.includes('close') || normalized.includes('uninstall') || normalized.includes('disabled')))
    return 'uninstalled'
  return ''
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
  const appTicket = extractAppTicket(payload)
  if (appTicket) {
    const eventId = extractGenericEventId(payload, rawBody)
    const dedup = await withClient(event, async (db) => {
      return registerIntegrationEventDedup(db, {
        provider: 'feishu',
        eventId,
        eventType,
        payload,
      })
    })
    if (!dedup.inserted) {
      return {
        code: 0,
        msg: 'ignored_duplicate_app_ticket_event',
      }
    }

    await withClient(event, async (db) => {
      await updateFeishuMarketplaceAppTicket(db, {
        appTicket,
        updatedByUserId: 'feishu_event',
      })
    })
    return {
      code: 0,
      msg: 'app_ticket_updated',
    }
  }

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
    const autoSyncEnabled = items.some(item => item.autoSync?.enabled)
    const tenantAccessToken = autoSyncEnabled
      ? await getFeishuTenantAccessToken(config)
      : ''
    const recordsById = autoSyncEnabled
      ? new Map(
          (await listFeishuBitableRecordsByIds({
            tenantAccessToken,
            appToken: parsed.appToken,
            tableId: parsed.tableId,
            recordIds: parsed.recordIds,
          })).map(record => [record.recordId, record] as const),
        )
      : new Map()
    for (const item of items) {
      const actorUserId = item.updatedByUserId || item.createdByUserId
      if (!actorUserId)
        continue
      let recordIdsToRun = parsed.recordIds
      if (item.autoSync?.enabled) {
        const autoSyncResult = await handleFeishuBitableAutoSyncForItem({
          tenantAccessToken,
          item,
          recordEvents: parsed.recordEvents,
          recordsById,
        })
        recordIdsToRun = autoSyncResult.triggeredRecordIds
      }
      if (recordIdsToRun.length === 0)
        continue
      await runWorkflow({
        providerName: 'feishu_bitable',
        syncItemId: item.id,
        actorUserId,
        triggerSource: 'webhook',
        mode: 'delta',
        recordIds: recordIdsToRun,
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

  const tenantKey = extractTenantKey(payload)
  if (tenantKey) {
    const eventId = extractGenericEventId(payload, rawBody)
    const dedup = await withClient(event, async (db) => {
      return registerIntegrationEventDedup(db, {
        provider: 'feishu',
        eventId,
        tenantKey,
        eventType,
        payload,
      })
    })
    if (!dedup.inserted) {
      return {
        code: 0,
        msg: 'ignored_duplicate_workspace_event',
      }
    }

    const status = resolveWorkspaceConnectionStatusByFeishuEvent(eventType)
    if (status) {
      const updatedCount = await withClient(event, async (db) => {
        return updateFeishuWorkspaceConnectionStatusByTenantKey(db, {
          tenantKey,
          status,
          tenantName: toText(asObject(payload.event).tenant_name || asObject(payload.event).tenantName),
        })
      })
      return {
        code: 0,
        msg: updatedCount > 0 ? 'ok' : 'ignored_workspace_connection_not_found',
        mode: 'workspace_integration',
        updatedConnections: updatedCount,
      }
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
