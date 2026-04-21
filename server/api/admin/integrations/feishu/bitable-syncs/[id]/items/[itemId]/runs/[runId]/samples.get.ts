import type { FeishuSyncRunSamplePage, FeishuSyncRunSampleType } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listFeishuBitableSyncRunSamples } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

const SAMPLE_TYPES = new Set<FeishuSyncRunSampleType>([
  'auto_sync_filtered',
  'business_skipped',
])

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const runId = String(getRouterParam(event, 'runId') || '').trim()
  const query = getQuery(event)
  const type = String(query.type || '').trim() as FeishuSyncRunSampleType
  const page = Math.max(1, Number(query.page || 1) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize || 12) || 12))
  const includeArchived = String(query.includeArchived || '') === 'true'

  const canRead = await checkPlatformPermission(event, user, 'contest.write')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看同步运行样本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40480)
  }

  if (!syncId || !syncItemId || !runId || !SAMPLE_TYPES.has(type)) {
    setResponseStatus(event, 400)
    return fail('syncId、syncItemId、runId 与 type 不能为空，且 type 必须合法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40180)
  }

  const pageResult = await withClient(event, async (db) => {
    return listFeishuBitableSyncRunSamples(db, {
      syncId,
      syncItemId,
      runId,
      type,
      page,
      pageSize,
      includeArchived,
    })
  })

  if (!pageResult) {
    setResponseStatus(event, 404)
    return fail('同步运行或样本记录不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40481)
  }

  return ok<FeishuSyncRunSamplePage>(pageResult, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
