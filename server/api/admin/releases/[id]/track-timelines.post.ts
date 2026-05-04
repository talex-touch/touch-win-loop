import type { ContestReleaseTrackTimelineSnapshot } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { patchContestReleaseTrackTimelines } from '~~/server/utils/release-store'

interface PatchReleaseTrackTimelinesBody {
  trackExternalId?: string
  trackTimelines?: ContestReleaseTrackTimelineSnapshot[]
  removedTrackTimelineExternalIds?: string[]
}

function mapPatchError(error: Error): { status: number, message: string, code: number } | null {
  if (error.message === 'RELEASE_VERSION_NOT_FOUND')
    return { status: 404, message: '版本不存在。', code: 40482 }
  if (error.message === 'RELEASE_SCOPE_INVALID')
    return { status: 400, message: '当前版本不是赛事版本。', code: 40082 }
  if (error.message === 'RELEASE_TRACK_TIMELINE_PATCH_STATUS_INVALID')
    return { status: 409, message: '只能在待初审状态修改结构化节点；请先重新提交初审后再修改。', code: 40982 }
  if (error.message === 'RELEASE_TRACK_NOT_FOUND')
    return { status: 404, message: '待审版本中未找到该赛道。', code: 40483 }
  return null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const releaseVersionId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchReleaseTrackTimelinesBody>(event).catch((): PatchReleaseTrackTimelinesBody => ({}))

  if (!releaseVersionId || !body?.trackExternalId || !Array.isArray(body.trackTimelines)) {
    setResponseStatus(event, 400)
    return fail('缺少 releaseVersionId、trackExternalId 或 trackTimelines。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40083)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改结构化节点。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40383)
  }

  try {
    const detail = await withTransaction(event, async (db) => {
      return patchContestReleaseTrackTimelines(db, {
        actorUserId: user.id,
        releaseVersionId,
        trackExternalId: body.trackExternalId!,
        trackTimelines: body.trackTimelines || [],
        removedTrackTimelineExternalIds: body.removedTrackTimelineExternalIds || [],
      })
    })

    return ok(detail, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error) {
      const mapped = mapPatchError(error)
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
