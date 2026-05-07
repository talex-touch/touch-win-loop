import { getSharedProjectMeetingSnapshotByShareKey } from '~~/server/services/meeting/project-meeting'
import { defineApiHandler } from '~~/server/utils/api-handler'
import { withClient } from '~~/server/utils/db'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineApiHandler(async ({ event, fail, ok }) => {
  const shareKey = normalizeString(getRouterParam(event, 'shareKey'))

  if (!shareKey)
    return fail('缺少 shareKey。', 40115, { status: 400 })

  try {
    const snapshot = await withClient(event, async db => getSharedProjectMeetingSnapshotByShareKey(db, shareKey))
    return ok(snapshot)
  }
  catch (error) {
    if (error instanceof Error && error.message === 'MEETING_SHARE_NOT_FOUND') {
      return fail('分享链接不存在。', 40419, { status: 404 })
    }

    if (error instanceof Error && ['MEETING_SHARE_REVOKED', 'MEETING_SHARE_EXPIRED', 'MEETING_SHARE_UNAVAILABLE'].includes(error.message)) {
      return fail('当前分享链接已失效。', 41015, { status: 410 })
    }

    throw error
  }
})
