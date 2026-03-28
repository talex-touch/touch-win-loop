import type { FeishuAdminManualAddResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getFeishuTenantAccessToken, getFeishuUserByUnionId } from '~~/server/services/feishu/client'
import { ensureLocalUserByFeishuProfile } from '~~/server/services/feishu/user-provision'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { grantFeishuContestAdminRole, readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ManualAddBody {
  targetUserId?: string
  targetUnionId?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<ManualAddBody>(event).catch(() => ({} as ManualAddBody))
  const targetUserId = String(body.targetUserId || '').trim()
  const targetUnionId = String(body.targetUnionId || '').trim()

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权手动添加管理员。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40415)
  }

  if (!targetUserId && !targetUnionId) {
    setResponseStatus(event, 400)
    return fail('targetUserId 与 targetUnionId 至少传一个。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40110)
  }

  let result: FeishuAdminManualAddResult | null = null
  if (targetUserId) {
    result = await withTransaction(event, async (db) => {
      return grantFeishuContestAdminRole(db, {
        targetUserId,
      })
    })
  }
  else {
    const config = await withClient(event, async (db) => {
      return readFeishuIntegrationConfig(db)
    })
    if (!config.enabled || !config.appId || !config.appSecret) {
      setResponseStatus(event, 400)
      return fail('飞书集成未启用或应用配置不完整，无法按 unionId 添加管理员。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40112)
    }

    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const profile = await getFeishuUserByUnionId({
      config,
      tenantAccessToken,
      unionId: targetUnionId,
    }).catch(() => null)

    const ensured = await withTransaction(event, async (db) => {
      const provisioned = await ensureLocalUserByFeishuProfile(db, profile || {
        unionId: targetUnionId,
        openId: '',
        name: '',
        enName: '',
        avatarUrl: '',
        email: '',
        mobile: '',
      })
      const grant = await grantFeishuContestAdminRole(db, {
        targetUserId: provisioned.user.id,
      })
      return grant
    })
    result = ensured
  }

  if (!result) {
    setResponseStatus(event, 404)
    return fail('目标用户不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40416)
  }

  return ok<FeishuAdminManualAddResult>(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
