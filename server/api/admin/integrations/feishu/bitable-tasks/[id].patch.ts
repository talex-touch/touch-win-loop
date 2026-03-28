import type { FeishuBitableTask, FeishuBitableTaskTargetType, FeishuTaskScheduleConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchFeishuBitableTask } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchTaskBody {
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
  const taskId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchTaskBody>(event).catch(() => ({} as PatchTaskBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改飞书 Bitable 任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40400)
  }

  if (!taskId) {
    setResponseStatus(event, 400)
    return fail('taskId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40101)
  }

  const patch: PatchTaskBody = {}
  if (body.name !== undefined)
    patch.name = String(body.name || '').trim()
  if (body.targetType !== undefined && TARGET_TYPES.includes(body.targetType))
    patch.targetType = body.targetType
  if (body.appToken !== undefined)
    patch.appToken = String(body.appToken || '').trim()
  if (body.tableId !== undefined)
    patch.tableId = String(body.tableId || '').trim()
  if (body.viewId !== undefined)
    patch.viewId = String(body.viewId || '').trim()
  if (body.isActive !== undefined)
    patch.isActive = Boolean(body.isActive)
  if (body.mapping !== undefined)
    patch.mapping = body.mapping
  if (body.options !== undefined)
    patch.options = body.options
  if (body.schedule !== undefined)
    patch.schedule = body.schedule

  let task: FeishuBitableTask | null = null
  try {
    task = await withTransaction(event, async (db) => {
      return patchFeishuBitableTask(db, {
        actorUserId: user.id,
        taskId,
        patch,
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '任务更新失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40108)
  }

  if (!task) {
    setResponseStatus(event, 404)
    return fail('任务不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40401)
  }

  return ok<FeishuBitableTask>(task, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
