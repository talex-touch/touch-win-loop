import type {
  FeishuBitableSyncItemEntityType,
  FeishuSyncedDataQuery,
  FeishuSyncedDataResult,
  FeishuSyncedDataSyncOption,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  listFeishuBitableSyncs,
  listFeishuSyncedDataSyncItemOptions,
  searchFeishuSyncedData,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

const FEISHU_SYNCED_DATA_SCOPES = new Set<FeishuBitableSyncItemEntityType>([
  'contest',
  'track',
  'track_timeline',
  'resource',
  'policy',
  'persona',
])

function readTextQuery(value: unknown): string {
  return String(value || '').trim()
}

function parseScope(value: unknown): FeishuBitableSyncItemEntityType | undefined {
  const normalized = readTextQuery(value)
  if (FEISHU_SYNCED_DATA_SCOPES.has(normalized as FeishuBitableSyncItemEntityType))
    return normalized as FeishuBitableSyncItemEntityType
  return undefined
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书已同步数据。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40469)
  }

  const input: FeishuSyncedDataQuery = {
    keyword: readTextQuery(query.keyword),
    syncId: readTextQuery(query.syncId),
    syncItemId: readTextQuery(query.syncItemId),
    scope: parseScope(query.scope),
    externalId: readTextQuery(query.externalId),
    recordId: readTextQuery(query.recordId),
    page: Math.max(1, Number(query.page || 1) || 1),
    pageSize: Math.max(1, Math.min(100, Number(query.pageSize || 20) || 20)),
  }

  const data = await withClient(event, async (db) => {
    const [searchResult, syncs, syncItemOptions] = await Promise.all([
      searchFeishuSyncedData(db, input),
      listFeishuBitableSyncs(db, { includeArchived: true }),
      listFeishuSyncedDataSyncItemOptions(db),
    ])

    const syncOptions: FeishuSyncedDataSyncOption[] = syncs.map(sync => ({
      id: sync.id,
      name: sync.name,
    }))

    return {
      ...searchResult,
      syncOptions,
      syncItemOptions,
    } satisfies FeishuSyncedDataResult
  })

  return ok<FeishuSyncedDataResult>(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
