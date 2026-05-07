import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { rejectReleaseVersion } from '~~/server/utils/release-store'

function mapRejectErrorMessage(error: Error): { status: number, message: string, code: number } | null {
  if (error.message === 'RELEASE_VERSION_NOT_FOUND')
    return { status: 404, message: '版本不存在。', code: 40473 }
  if (error.message === 'RELEASE_REJECT_STATUS_INVALID')
    return { status: 400, message: '当前版本状态不允许驳回。', code: 40076 }
  if (error.message === 'RELEASE_SECOND_REVIEWER_CONFLICT')
    return { status: 400, message: '二审驳回人不能与初审人相同。', code: 40082 }
  if (error.message === 'RELEASE_SECOND_REVIEW_NOT_CLAIMED')
    return { status: 400, message: '请先随机领取二审任务，再执行驳回。', code: 40083 }
  if (error.message === 'RELEASE_SECOND_REVIEW_ALREADY_CLAIMED')
    return { status: 409, message: '该版本已被其他管理员领取二审。', code: 40972 }
  return null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const releaseVersionId = String(getRouterParam(event, 'id') || '').trim()

  if (!releaseVersionId) {
    setResponseStatus(event, 400)
    return fail('缺少 releaseVersionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40077)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权驳回发布版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40374)
  }

  const body = await readBody<{ reason?: string }>(event).catch((): { reason?: string } => ({}))

  try {
    const version = await withTransaction(event, async (db) => {
      return rejectReleaseVersion(db, {
        actorUserId: user.id,
        releaseVersionId,
        reason: String(body?.reason || '').trim(),
      })
    })

    return ok(version, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error) {
      const mapped = mapRejectErrorMessage(error)
      if (mapped) {
        setResponseStatus(event, mapped.status)
        return fail(mapped.message, {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: false,
          attempts: 1,
        }, mapped.code)
      }
    }
    throw error
  }
})
