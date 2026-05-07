import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resetRejectedReleaseToFirstReview } from '~~/server/utils/release-store'

function mapResetToFirstReviewErrorMessage(error: Error): { status: number, message: string, code: number } | null {
  if (error.message === 'RELEASE_VERSION_NOT_FOUND')
    return { status: 404, message: '版本不存在。', code: 40476 }
  if (error.message === 'RELEASE_RESET_TO_FIRST_REVIEW_STATUS_INVALID')
    return { status: 400, message: '仅已驳回版本允许重新提交初审。', code: 40084 }
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
    }, 40085)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权重新提交发布版本初审。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40376)
  }

  try {
    const version = await withTransaction(event, async (db) => {
      return resetRejectedReleaseToFirstReview(db, {
        actorUserId: user.id,
        releaseVersionId,
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
      const mapped = mapResetToFirstReviewErrorMessage(error)
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
