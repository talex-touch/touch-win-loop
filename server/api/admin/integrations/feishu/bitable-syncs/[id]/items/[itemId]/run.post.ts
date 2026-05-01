import { readBody, setResponseStatus } from 'h3'
import { getFeishuSyncItemManualRunBlockReason } from '~~/server/services/feishu/bitable-sync'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getFeishuBitableSyncItemById } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface RunSyncItemBody {
  force?: boolean
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const syncId = String(getRouterParam(event, 'id') || '').trim()
  const syncItemId = String(getRouterParam(event, 'itemId') || '').trim()
  const body = await readBody<RunSyncItemBody>(event).catch(() => ({} as RunSyncItemBody))
  const force = body?.force === true

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行子表同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40462)
  }

  if (!syncId || !syncItemId) {
    setResponseStatus(event, 400)
    return fail('syncId 与 syncItemId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40163)
  }

  const syncItem = await withClient(event, async (db) => {
    return getFeishuBitableSyncItemById(db, syncItemId)
  })
  if (!syncItem || syncItem.syncId !== syncId) {
    setResponseStatus(event, 404)
    return fail('子表同步项不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40463)
  }

  const manualRunBlockedReason = getFeishuSyncItemManualRunBlockReason({
    entityType: syncItem.entityType,
    mapping: syncItem.mapping,
    options: syncItem.options,
  })
  if (manualRunBlockedReason) {
    setResponseStatus(event, 400)
    return fail(manualRunBlockedReason, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40168)
  }

  const summary = await runWorkflow({
    providerName: 'feishu_bitable',
    syncItemId,
    actorUserId: user.id,
    triggerSource: 'manual',
    force,
  }).catch((error) => {
    const code = error instanceof Error ? error.message : String(error || '')
    if (code === 'FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND' || code === 'FEISHU_BITABLE_SYNC_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('子表同步项不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40463)
    }
    if (code === 'FEISHU_INTEGRATION_DISABLED') {
      setResponseStatus(event, 400)
      return fail('飞书集成未启用，无法执行同步。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40164)
    }
    if (code === 'FEISHU_BITABLE_SYNC_DISABLED') {
      setResponseStatus(event, 400)
      return fail('当前主同步信息已禁用，请先启用后再执行子表同步项。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40165)
    }
    if (code === 'FEISHU_BITABLE_SYNC_ITEM_INACTIVE') {
      setResponseStatus(event, 400)
      return fail('当前子表同步项已禁用，请先启用后再执行。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40166)
    }
    if (code.includes('自动同步规则')) {
      setResponseStatus(event, 400)
      return fail(code, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40167)
    }
    throw error
  }) as {
    runId: string
    status: 'success' | 'partial_success' | 'failed'
    fetchedCount: number
    createdCount: number
    updatedCount: number
    skippedCount: number
    errorCount: number
    writebackSuccessCount: number
    writebackErrorCount: number
  }

  if ('code' in summary)
    return summary

  return ok(summary, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
