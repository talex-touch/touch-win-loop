import type {
  FeishuBitableSourceConfig,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemEntityType,
  FeishuBitableWritebackConfig,
  FeishuTaskScheduleConfig,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchFeishuBitableSyncItem } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchItemBody {
  name?: string
  entityType?: FeishuBitableSyncItemEntityType
  tableId?: string
  viewId?: string
  source?: FeishuBitableSourceConfig
  writeback?: FeishuBitableWritebackConfig
  isEnabled?: boolean
  mapping?: Record<string, unknown>
  options?: Record<string, unknown>
  schedule?: Partial<FeishuTaskScheduleConfig>
}

const ENTITY_TYPES: FeishuBitableSyncItemEntityType[] = ['contest', 'track', 'track_timeline', 'resource', 'policy']

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<PatchItemBody>(event).catch(() => ({} as PatchItemBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40459)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40159)
  }

  const rawEntityType = toText(body.entityType)
  if (rawEntityType && !ENTITY_TYPES.includes(body.entityType as FeishuBitableSyncItemEntityType)) {
    setResponseStatus(event, 400)
    return fail(`entityType 不支持：${rawEntityType}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40160)
  }

  const item = await withTransaction(event, async (db) => {
    return patchFeishuBitableSyncItem(db, {
      actorUserId: user.id,
      syncItemId,
      patch: {
        name: body.name,
        syncId,
        entityType: ENTITY_TYPES.includes(body.entityType as FeishuBitableSyncItemEntityType)
          ? body.entityType as FeishuBitableSyncItemEntityType
          : undefined,
        tableId: body.tableId,
        viewId: body.viewId,
        source: body.source,
        writeback: body.writeback,
        isEnabled: body.isEnabled,
        mapping: body.mapping,
        options: body.options,
        schedule: body.schedule,
      },
    })
  }).catch((error) => {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '子表同步项更新失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40161)
  })

  if (!item || 'code' in item) {
    if (!item) {
      setResponseStatus(event, 404)
      return fail('子表同步项不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40460)
    }
    return item
  }

  return ok<FeishuBitableSyncItem>(item, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
