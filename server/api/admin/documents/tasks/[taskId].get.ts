import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { getTaskContextById } from '~~/server/utils/document-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { user } = await requireAuth(event)
  const taskId = getRouterParam(event, 'taskId') || ''

  if (!taskId) {
    setResponseStatus(event, 400)
    return fail('缺少 taskId。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看任务状态。', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  const context = await withClient(event, async db => getTaskContextById(db, { taskId }))
  if (!context) {
    setResponseStatus(event, 404)
    return fail('task not found', {
      startedAt,
      fallbackUsed: false,
      attempts: 1,
    }, 40499)
  }

  return ok({
    task: context.task,
    document: {
      id: context.document.id,
      parseStatus: context.document.parseStatus,
      parseError: context.document.parseError,
    },
    resource: context.resource,
  }, {
    startedAt,
    fallbackUsed: false,
    attempts: 1,
  })
})
