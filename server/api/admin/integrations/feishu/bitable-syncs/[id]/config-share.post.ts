import type { FeishuBitableSyncConfigShare } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { buildFeishuBitableSyncConfigPackage } from '~~/server/utils/feishu-bitable-sync-config-package'
import { createFeishuBitableSyncConfigShare } from '~~/server/utils/feishu-bitable-sync-config-share-store'
import { getFeishuBitableSyncDetail } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { isHttpUrl } from '~~/shared/utils/api-url'

interface CreateConfigShareBody {
  expiresInDays?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const publicBaseUrl = String(runtime.onlyOffice.sourceBaseURL || '').trim()
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const body: CreateConfigShareBody = (await readBody<CreateConfigShareBody>(event).catch(() => undefined)) ?? {}

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权创建飞书同步公网配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40493)
  }

  if (!isHttpUrl(publicBaseUrl)) {
    setResponseStatus(event, 503)
    return fail('公网配置基地址未配置，请设置 WINLOOP_PUBLIC_BASE_URL 后再试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40593)
  }

  try {
    const share = await withTransaction(event, async (db) => {
      const detail = await getFeishuBitableSyncDetail(db, {
        syncId,
        includeInactive: true,
      })
      if (!detail)
        throw new Error('同步信息不存在。')

      return createFeishuBitableSyncConfigShare(db, {
        sourceSyncId: syncId,
        actorUserId: user.id,
        package: buildFeishuBitableSyncConfigPackage(detail),
        publicBaseUrl,
        expiresInDays: body.expiresInDays,
      })
    })

    return ok<FeishuBitableSyncConfigShare>(share, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '公网配置创建失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40193)
  }
})
