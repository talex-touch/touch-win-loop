import type { H3Event } from 'h3'
import type { FeishuBitableSyncItem, FeishuBitableSyncRunStatus, FeishuBitableSyncRunTriggerSource } from '~~/shared/types/domain'
import { getFeishuSyncItemManualRunBlockReason } from '~~/server/services/feishu/bitable-sync'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { withClient } from '~~/server/utils/db'
import { getFeishuBitableSyncById, listFeishuBitableSyncItems } from '~~/server/utils/feishu-integration-store'

interface FeishuBitableSyncItemWorkflowResult {
  runId?: string
  status?: FeishuBitableSyncRunStatus
  fetchedCount?: number
  createdCount?: number
  updatedCount?: number
  skippedCount?: number
  errorCount?: number
  writebackSuccessCount?: number
  writebackErrorCount?: number
}

export interface FeishuBitableSyncRunItemSummary {
  syncItemId: string
  name: string
  runId: string
  status: FeishuBitableSyncRunStatus
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  writebackSuccessCount: number
  writebackErrorCount: number
  errorMessage: string
}

export interface FeishuBitableSyncRunSummary {
  syncId: string
  status: FeishuBitableSyncRunStatus
  triggerSource: FeishuBitableSyncRunTriggerSource
  itemCount: number
  successCount: number
  partialSuccessCount: number
  failedCount: number
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  writebackSuccessCount: number
  writebackErrorCount: number
  errors: string[]
  items: FeishuBitableSyncRunItemSummary[]
}

export class FeishuBitableSyncRunError extends Error {
  code: string
  publicMessage: string

  constructor(code: string, publicMessage: string) {
    super(publicMessage)
    this.code = code
    this.publicMessage = publicMessage
  }
}

function toCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return String(error.message || 'unknown error')
  return String(error)
}

function normalizeWorkflowResult(item: FeishuBitableSyncItem, raw: unknown): FeishuBitableSyncRunItemSummary {
  const result = raw && typeof raw === 'object'
    ? raw as FeishuBitableSyncItemWorkflowResult
    : {}
  const status: FeishuBitableSyncRunStatus = result.status === 'failed' || result.status === 'partial_success'
    ? result.status
    : 'success'

  return {
    syncItemId: item.id,
    name: item.name || item.id,
    runId: String(result.runId || ''),
    status,
    fetchedCount: toCount(result.fetchedCount),
    createdCount: toCount(result.createdCount),
    updatedCount: toCount(result.updatedCount),
    skippedCount: toCount(result.skippedCount),
    errorCount: toCount(result.errorCount),
    writebackSuccessCount: toCount(result.writebackSuccessCount),
    writebackErrorCount: toCount(result.writebackErrorCount),
    errorMessage: '',
  }
}

function summarizeRun(syncId: string, triggerSource: FeishuBitableSyncRunTriggerSource, items: FeishuBitableSyncRunItemSummary[]): FeishuBitableSyncRunSummary {
  const successCount = items.filter(item => item.status === 'success').length
  const partialSuccessCount = items.filter(item => item.status === 'partial_success').length
  const failedCount = items.filter(item => item.status === 'failed').length
  const status: FeishuBitableSyncRunStatus = failedCount === 0 && partialSuccessCount === 0
    ? 'success'
    : successCount > 0 || partialSuccessCount > 0
      ? 'partial_success'
      : 'failed'

  return {
    syncId,
    status,
    triggerSource,
    itemCount: items.length,
    successCount,
    partialSuccessCount,
    failedCount,
    fetchedCount: items.reduce((sum, item) => sum + item.fetchedCount, 0),
    createdCount: items.reduce((sum, item) => sum + item.createdCount, 0),
    updatedCount: items.reduce((sum, item) => sum + item.updatedCount, 0),
    skippedCount: items.reduce((sum, item) => sum + item.skippedCount, 0),
    errorCount: items.reduce((sum, item) => sum + item.errorCount, 0),
    writebackSuccessCount: items.reduce((sum, item) => sum + item.writebackSuccessCount, 0),
    writebackErrorCount: items.reduce((sum, item) => sum + item.writebackErrorCount, 0),
    errors: items.filter(item => item.errorMessage).map(item => `${item.name}: ${item.errorMessage}`),
    items,
  }
}

function assertManualRunReady(items: FeishuBitableSyncItem[]): void {
  for (const item of items) {
    const blockReason = getFeishuSyncItemManualRunBlockReason({
      entityType: item.entityType,
      mapping: item.mapping,
      options: item.options,
    })
    if (blockReason) {
      throw new FeishuBitableSyncRunError(
        'FEISHU_BITABLE_SYNC_MANUAL_BLOCKED',
        `子表同步项“${item.name || item.id}”暂不能手动执行：${blockReason}`,
      )
    }
  }
}

export async function runFeishuBitableSync(
  event: H3Event | undefined,
  input: {
    syncId: string
    actorUserId: string
    triggerSource: FeishuBitableSyncRunTriggerSource
    onItemError?: (error: unknown, item: FeishuBitableSyncItem) => void
  },
): Promise<FeishuBitableSyncRunSummary> {
  const syncId = String(input.syncId || '').trim()
  if (!syncId)
    throw new FeishuBitableSyncRunError('FEISHU_BITABLE_SYNC_ID_REQUIRED', 'syncId 不能为空。')

  const { sync, items } = await withClient(event, async (db) => {
    const sync = await getFeishuBitableSyncById(db, syncId, { includeArchived: true })
    const items = sync
      ? await listFeishuBitableSyncItems(db, { syncId })
      : []
    return { sync, items }
  })

  if (!sync)
    throw new FeishuBitableSyncRunError('FEISHU_BITABLE_SYNC_NOT_FOUND', '同步信息不存在。')
  if (sync.archivedAt)
    throw new FeishuBitableSyncRunError('FEISHU_BITABLE_SYNC_ARCHIVED', '当前同步信息已归档，只允许查看，不允许手动执行。')
  if (!sync.enabled)
    throw new FeishuBitableSyncRunError('FEISHU_BITABLE_SYNC_DISABLED', '当前主同步信息已禁用，请先启用后再执行同步。')
  if (!items.length)
    throw new FeishuBitableSyncRunError('FEISHU_BITABLE_SYNC_NO_ACTIVE_ITEMS', '当前无已启用的子表同步项。')

  if (input.triggerSource === 'manual')
    assertManualRunReady(items)

  const itemSummaries: FeishuBitableSyncRunItemSummary[] = []
  for (const item of items) {
    try {
      const triggerSource = input.triggerSource === 'event' ? 'webhook' : input.triggerSource
      const result = await runWorkflow({
        providerName: 'feishu_bitable',
        syncItemId: item.id,
        actorUserId: input.actorUserId,
        triggerSource,
      })
      itemSummaries.push(normalizeWorkflowResult(item, result))
    }
    catch (error) {
      input.onItemError?.(error, item)
      itemSummaries.push({
        syncItemId: item.id,
        name: item.name || item.id,
        runId: '',
        status: 'failed',
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        writebackSuccessCount: 0,
        writebackErrorCount: 0,
        errorMessage: toErrorMessage(error),
      })
    }
  }

  return summarizeRun(syncId, input.triggerSource, itemSummaries)
}
