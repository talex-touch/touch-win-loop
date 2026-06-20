import type {
  FeishuBitableAutoSyncConfig,
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
import { createFeishuBitableSyncItem } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateItemBody {
  name?: string
  entityType?: FeishuBitableSyncItemEntityType
  tableId?: string
  viewId?: string
  source?: FeishuBitableSourceConfig
  writeback?: FeishuBitableWritebackConfig
  autoSync?: FeishuBitableAutoSyncConfig
  isEnabled?: boolean
  mapping?: Record<string, unknown>
  options?: Record<string, unknown>
  schedule?: Partial<FeishuTaskScheduleConfig>
}

const ENTITY_TYPES: FeishuBitableSyncItemEntityType[] = ['contest', 'track', 'track_timeline', 'resource', 'policy', 'persona', 'faq']

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<CreateItemBody>(event).catch(() => ({} as CreateItemBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40456)
  }

  const rawEntityType = toText(body.entityType)
  const entityType = ENTITY_TYPES.includes(body.entityType as FeishuBitableSyncItemEntityType)
    ? body.entityType as FeishuBitableSyncItemEntityType
    : null
  const tableId = toText(body.tableId || body.source?.tableId)
  const viewId = toText(body.viewId || body.source?.viewId)
  const name = toText(body.name || body.source?.tableName || body.source?.viewName || '同步项')

  if (!syncId) {
    setResponseStatus(event, 400)
    return fail('syncId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40156)
  }

  if (!rawEntityType) {
    setResponseStatus(event, 400)
    return fail('entityType 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40157)
  }

  if (!entityType) {
    setResponseStatus(event, 400)
    return fail(`entityType 不支持：${rawEntityType}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40158)
  }

  if (!tableId) {
    setResponseStatus(event, 400)
    return fail('tableId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40159)
  }

  let item: FeishuBitableSyncItem
  try {
    item = await withTransaction(event, async (db) => {
      return createFeishuBitableSyncItem(db, {
        actorUserId: user.id,
        syncId,
        name,
        entityType,
        tableId,
        viewId,
        source: body.source,
        writeback: body.writeback,
        autoSync: body.autoSync,
        isEnabled: body.isEnabled === true,
        mapping: body.mapping || {},
        options: body.options || {},
        schedule: body.schedule || {},
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '子表同步项创建失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40160)
  }

  return ok<FeishuBitableSyncItem>(item, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
