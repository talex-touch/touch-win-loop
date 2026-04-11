import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { approveReleaseVersion } from '~~/server/utils/release-store'

type ReviewStage = 'first' | 'second'

function normalizeStage(raw: unknown): ReviewStage {
  return String(raw || '').trim() === 'second' ? 'second' : 'first'
}

function mapApproveErrorMessage(error: Error): { status: number, message: string, code: number } | null {
  if (error.message === 'RELEASE_VERSION_NOT_FOUND')
    return { status: 404, message: '版本不存在。', code: 40472 }
  if (error.message === 'RELEASE_FIRST_REVIEW_STATUS_INVALID')
    return { status: 400, message: '当前版本不处于待初审状态。', code: 40072 }
  if (error.message === 'RELEASE_SECOND_REVIEW_STATUS_INVALID')
    return { status: 400, message: '当前版本不处于待二审状态。', code: 40073 }
  if (error.message === 'RELEASE_SECOND_REVIEWER_CONFLICT')
    return { status: 400, message: '二审人不能与初审人相同。', code: 40074 }
  if (error.message === 'RELEASE_SECOND_REVIEW_NOT_CLAIMED')
    return { status: 400, message: '请先通过随机领取进入二审，再执行审批。', code: 40081 }
  if (error.message === 'RELEASE_SECOND_REVIEW_ALREADY_CLAIMED')
    return { status: 409, message: '该版本已被其他管理员领取二审。', code: 40971 }
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
    }, 40075)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权审批发布版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40373)
  }

  const body = await readBody<{ stage?: ReviewStage }>(event).catch(() => ({}))
  const stage = normalizeStage(body?.stage)

  try {
    const version = await withTransaction(event, async (db) => {
      return approveReleaseVersion(db, {
        actorUserId: user.id,
        releaseVersionId,
        stage,
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
      const mapped = mapApproveErrorMessage(error)
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
