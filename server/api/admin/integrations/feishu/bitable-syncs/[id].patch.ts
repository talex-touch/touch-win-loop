import type { FeishuBitableSourceConfig, FeishuBitableSync } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchFeishuBitableSync } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchSyncBody {
  name?: string
  enabled?: boolean
  source?: FeishuBitableSourceConfig
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchSyncBody>(event).catch(() => ({} as PatchSyncBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改飞书多维同步信息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40455)
  }

  if (!syncId) {
    setResponseStatus(event, 400)
    return fail('syncId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40154)
  }

  const sync = await withTransaction(event, async (db) => {
    return patchFeishuBitableSync(db, {
      actorUserId: user.id,
      syncId,
      patch: {
        name: body.name,
        enabled: body.enabled,
        source: body.source,
      },
    })
  }).catch((error) => {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '同步信息更新失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40155)
  })

  if (!sync || 'code' in sync) {
    if (!sync) {
      setResponseStatus(event, 404)
      return fail('同步信息不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40456)
    }
    return sync
  }

  return ok<FeishuBitableSync>(sync, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
