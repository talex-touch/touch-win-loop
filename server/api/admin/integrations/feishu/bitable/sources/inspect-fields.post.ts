import type { FeishuFieldInspectionItem } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { inspectFeishuBitableSourceFields } from '~~/server/services/feishu/bitable-sync'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface InspectSourceFieldsBody {
  appToken?: string
  tableId?: string
  viewId?: string
  sampleRecords?: number
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<InspectSourceFieldsBody>(event).catch(() => ({} as InspectSourceFieldsBody))

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看飞书字段巡检。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40437)
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
    }, 40137)
  }

  try {
    const items = await inspectFeishuBitableSourceFields(event, {
      appToken,
      tableId,
      viewId: toText(body.viewId),
      sampleRecords: Number(body.sampleRecords || 120),
    })
    return ok<FeishuFieldInspectionItem[]>(items, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '字段巡检失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50137)
  }
})
