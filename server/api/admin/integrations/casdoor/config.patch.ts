import type { CasdoorIntegrationConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  readCasdoorIntegrationConfig,
  toPublicCasdoorIntegrationConfig,
  writeCasdoorIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { hasConfigMasterKey } from '~~/server/utils/secure-config'

type SecretMode = 'keep' | 'replace' | 'clear'

interface PatchCasdoorConfigBody {
  enabled?: boolean
  issuer?: string
  clientId?: string
  clientSecret?: string
  clientSecretMode?: SecretMode
  scope?: string
  redirectUri?: string
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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchCasdoorConfigBody>(event).catch(() => ({} as PatchCasdoorConfigBody))

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改 Casdoor 集成配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  const clientSecretMode = toMode(body.clientSecretMode)
  if (clientSecretMode === 'replace' && !hasConfigMasterKey(event)) {
    setResponseStatus(event, 400)
    return fail('缺少 WINLOOP_CONFIG_MASTER_KEY，无法替换 Casdoor client secret。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40066)
  }

  const nextConfig = await withTransaction(event, async (db) => {
    const current = await readCasdoorIntegrationConfig(db)
    const next = {
      ...current,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user.id,
    }

    if (body.enabled !== undefined)
      next.enabled = Boolean(body.enabled)
    if (body.issuer !== undefined)
      next.issuer = toText(body.issuer)
    if (body.clientId !== undefined)
      next.clientId = toText(body.clientId)
    if (body.scope !== undefined)
      next.scope = toText(body.scope) || 'openid profile email'
    if (body.redirectUri !== undefined)
      next.redirectUri = toText(body.redirectUri)

    if (clientSecretMode === 'replace')
      next.clientSecret = String(body.clientSecret || '')
    else if (clientSecretMode === 'clear')
      next.clientSecret = ''

    return writeCasdoorIntegrationConfig(db, next)
  })

  return ok<CasdoorIntegrationConfig>(toPublicCasdoorIntegrationConfig(nextConfig), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
