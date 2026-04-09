import { setResponseStatus } from 'h3'
import { getSharedProjectMeetingSnapshotByShareKey } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function buildTelemetry(runtime: ReturnType<typeof readRuntimeSettings>, startedAt: number) {
  return {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const shareKey = normalizeString(getRouterParam(event, 'shareKey'))

  if (!shareKey) {
    setResponseStatus(event, 400)
    return fail('缺少 shareKey。', buildTelemetry(runtime, startedAt), 40115)
  }

  try {
    const snapshot = await withClient(event, async db => getSharedProjectMeetingSnapshotByShareKey(db, shareKey))
    return ok(snapshot, buildTelemetry(runtime, startedAt))
  }
  catch (error) {
    if (error instanceof Error && error.message === 'MEETING_SHARE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('分享链接不存在。', buildTelemetry(runtime, startedAt), 40419)
    }

    if (error instanceof Error && ['MEETING_SHARE_REVOKED', 'MEETING_SHARE_EXPIRED', 'MEETING_SHARE_UNAVAILABLE'].includes(error.message)) {
      setResponseStatus(event, 410)
      return fail('当前分享链接已失效。', buildTelemetry(runtime, startedAt), 41015)
    }

    throw error
  }
})
