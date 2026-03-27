import type { FeishuIntegrationConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  readFeishuIntegrationConfig,
  toPublicFeishuIntegrationConfig,
  writeFeishuIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

type SecretMode = 'keep' | 'replace' | 'clear'

interface PatchFeishuConfigBody {
  enabled?: boolean
  appId?: string
  appSecret?: string
  appSecretMode?: SecretMode
  oauthRedirectUri?: string
  eventToken?: string
  eventTokenMode?: SecretMode
  eventEncryptKey?: string
  eventEncryptKeyMode?: SecretMode
  adminGroupIds?: string[]
  webSdkScriptUrl?: string
}

function toMode(raw: unknown): SecretMode {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'replace' || value === 'clear')
    return value
  return 'keep'
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw))
    return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const normalized = String(item || '').trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchFeishuConfigBody>(event).catch(() => ({} as PatchFeishuConfigBody))

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改飞书集成配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  const nextConfig = await withTransaction(event, async (db) => {
    const current = await readFeishuIntegrationConfig(db)
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user.id,
    }

    if (body.enabled !== undefined)
      next.enabled = Boolean(body.enabled)
    if (body.appId !== undefined)
      next.appId = toText(body.appId)
    if (body.oauthRedirectUri !== undefined)
      next.oauthRedirectUri = toText(body.oauthRedirectUri)
    if (body.adminGroupIds !== undefined)
      next.adminGroupIds = toStringArray(body.adminGroupIds)
    if (body.webSdkScriptUrl !== undefined)
      next.webSdkScriptUrl = toText(body.webSdkScriptUrl)

    const appSecretMode = toMode(body.appSecretMode)
    if (appSecretMode === 'replace')
      next.appSecret = String(body.appSecret || '')
    else if (appSecretMode === 'clear')
      next.appSecret = ''

    const eventTokenMode = toMode(body.eventTokenMode)
    if (eventTokenMode === 'replace')
      next.eventToken = String(body.eventToken || '')
    else if (eventTokenMode === 'clear')
      next.eventToken = ''

    const eventEncryptKeyMode = toMode(body.eventEncryptKeyMode)
    if (eventEncryptKeyMode === 'replace')
      next.eventEncryptKey = String(body.eventEncryptKey || '')
    else if (eventEncryptKeyMode === 'clear')
      next.eventEncryptKey = ''

    return writeFeishuIntegrationConfig(db, next)
  })

  return ok<FeishuIntegrationConfig>(toPublicFeishuIntegrationConfig(nextConfig), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
