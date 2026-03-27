import type { H3Event } from 'h3'
import { setResponseStatus } from 'h3'
import { reconcileFeishuAdminGroups } from '~~/server/services/feishu/admin-sync'
import {
  decryptFeishuEventPayload,
  verifyFeishuWebhookSignature,
} from '~~/server/services/feishu/security'
import { withClient } from '~~/server/utils/db'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'

function parseJsonObject(raw: string): Record<string, unknown> {
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

  let payload = parseJsonObject(rawBody)
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

  const tokenInBody = toText(payload.token || (payload.header as Record<string, unknown> | undefined)?.token)
  if (config.eventToken && tokenInBody && tokenInBody !== config.eventToken) {
    setResponseStatus(event, 403)
    return {
      code: 403,
      msg: 'invalid_token',
    }
  }

  const eventType = toText((payload.header as Record<string, unknown> | undefined)?.event_type || payload.event_type)
  if (shouldTriggerReconcile(eventType)) {
    await reconcileFeishuAdminGroups(event)
  }

  return {
    code: 0,
    msg: 'ok',
  }
})
