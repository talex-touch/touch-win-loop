import { setResponseStatus } from 'h3'
import { joinSharedProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { fail, ok } from '~~/server/utils/api'
import { withTransaction } from '~~/server/utils/db'
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
  const body = await readBody<{ displayName?: string }>(event).catch(() => ({} as { displayName?: string }))

  if (!shareKey) {
    setResponseStatus(event, 400)
    return fail('缺少 shareKey。', buildTelemetry(runtime, startedAt), 40116)
  }

  if (!normalizeString(body?.displayName)) {
    setResponseStatus(event, 400)
    return fail('请输入显示名后再加入会议。', buildTelemetry(runtime, startedAt), 40016)
  }

  try {
    const payload = await withTransaction(event, async db => joinSharedProjectMeetingSession(db, {
      shareKey,
      displayName: normalizeString(body?.displayName),
      runtime,
    }))
    return ok(payload, buildTelemetry(runtime, startedAt))
  }
  catch (error) {
    if (error instanceof Error && error.message === 'MEETING_SHARE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('分享链接不存在。', buildTelemetry(runtime, startedAt), 40420)
    }

    if (error instanceof Error && ['MEETING_SHARE_REVOKED', 'MEETING_SHARE_EXPIRED', 'MEETING_SHARE_UNAVAILABLE'].includes(error.message)) {
      setResponseStatus(event, 410)
      return fail('当前分享链接已失效。', buildTelemetry(runtime, startedAt), 41016)
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_STARTED') {
      setResponseStatus(event, 409)
      return fail('会议尚未开始，请等待主持人启动。', buildTelemetry(runtime, startedAt), 40916)
    }

    throw error
  }
})
