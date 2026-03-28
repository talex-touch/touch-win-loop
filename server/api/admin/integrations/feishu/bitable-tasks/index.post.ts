import type { FeishuBitableTask, FeishuBitableTaskTargetType, FeishuTaskScheduleConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createFeishuBitableTask } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateTaskBody {
  name?: string
  targetType?: FeishuBitableTaskTargetType
  appToken?: string
  tableId?: string
  viewId?: string
  isActive?: boolean
  mapping?: Record<string, unknown>
  options?: Record<string, unknown>
  schedule?: Partial<FeishuTaskScheduleConfig>
}

const TARGET_TYPES: FeishuBitableTaskTargetType[] = ['contest', 'track', 'resource']

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateTaskBody>(event).catch(() => ({} as CreateTaskBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增飞书 Bitable 任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  const name = String(body.name || '').trim()
  const targetType = TARGET_TYPES.includes(body.targetType as FeishuBitableTaskTargetType)
    ? body.targetType as FeishuBitableTaskTargetType
    : null
  const appToken = String(body.appToken || '').trim()
  const tableId = String(body.tableId || '').trim()

  if (!name || !targetType || !appToken || !tableId) {
    setResponseStatus(event, 400)
    return fail('name、targetType、appToken、tableId 为必填项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  let task: FeishuBitableTask
  try {
    task = await withTransaction(event, async (db) => {
      return createFeishuBitableTask(db, {
        actorUserId: user.id,
        name,
        targetType,
        appToken,
        tableId,
        viewId: String(body.viewId || '').trim(),
        isActive: body.isActive !== false,
        mapping: body.mapping || {},
        options: body.options || {},
        schedule: body.schedule || {},
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '任务创建失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40107)
  }

  return ok<FeishuBitableTask>(task, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
