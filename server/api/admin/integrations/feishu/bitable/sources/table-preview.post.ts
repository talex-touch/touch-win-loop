import type { FeishuBitableSourceConfig, FeishuBitableTablePreview } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { previewFeishuBitableSourceTable } from '~~/server/services/feishu/bitable-sync'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<FeishuBitableSourceConfig>(event).catch(() => ({} as FeishuBitableSourceConfig))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权预览飞书多维表格。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40438)
  }

  const appToken = toText(body.appToken)
  const tableId = toText(body.tableId)
  if (!appToken || !tableId) {
    setResponseStatus(event, 400)
    return fail('appToken 与 tableId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40138)
  }

  try {
    const preview = await previewFeishuBitableSourceTable(event, {
      appToken,
      tableId,
      viewId: toText(body.viewId),
      appName: toText(body.appName),
      tableName: toText(body.tableName),
      viewName: toText(body.viewName),
      sourceUrl: toText(body.sourceUrl),
    })

    return ok<FeishuBitableTablePreview>(preview, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '表格预览失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50138)
  }
})
