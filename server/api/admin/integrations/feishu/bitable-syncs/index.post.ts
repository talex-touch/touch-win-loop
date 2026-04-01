import type { FeishuBitableSourceConfig, FeishuBitableSync } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createFeishuBitableSync, suggestNextFeishuBitableSyncName } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateSyncBody {
  name?: string
  source?: FeishuBitableSourceConfig
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateSyncBody>(event).catch(() => ({} as CreateSyncBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增飞书多维同步信息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40452)
  }

  const source = body.source || {} as FeishuBitableSourceConfig
  const appToken = toText(source.appToken)
  if (!appToken) {
    setResponseStatus(event, 400)
    return fail('主库 appToken 为必填项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40151)
  }

  let name = toText(body.name)
  let sync: FeishuBitableSync
  try {
    sync = await withTransaction(event, async (db) => {
      if (!name)
        name = toText(source.appName) || await suggestNextFeishuBitableSyncName(db)

      return createFeishuBitableSync(db, {
        actorUserId: user.id,
        name,
        source: {
          ...source,
          appToken,
        },
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '多维同步信息创建失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40152)
  }

  return ok<FeishuBitableSync>(sync, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
