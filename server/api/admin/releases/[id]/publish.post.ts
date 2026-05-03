import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { publishReleaseVersion } from '~~/server/utils/release-store'

function mapPublishErrorMessage(error: Error): { status: number, message: string, code: number } | null {
  if (error.message === 'RELEASE_VERSION_NOT_FOUND')
    return { status: 404, message: '版本不存在。', code: 40474 }
  if (error.message === 'RELEASE_PUBLISH_STATUS_INVALID')
    return { status: 400, message: '仅已通过二审的版本允许发布。', code: 40078 }
  if (error.message === 'RELEASE_PUBLISH_CHECK_FAILED')
    return { status: 400, message: '当前版本仍存在发布阻断项，请先补齐后再发布。', code: 40080 }
  if (error.message === 'POLICY_RELEASE_ITEM_INVALID')
    return { status: 400, message: '政策库版本存在缺少政策编号或会议名称的记录，请驳回后补齐再发布。', code: 40085 }
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
    }, 40079)
  }

  const canPublish = await checkPlatformPermission(event, user, 'contest.publish')
  if (!canPublish) {
    setResponseStatus(event, 403)
    return fail('当前用户无权发布版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40375)
  }

  try {
    const version = await withTransaction(event, async (db) => {
      return publishReleaseVersion(db, {
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
      const mapped = mapPublishErrorMessage(error)
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
