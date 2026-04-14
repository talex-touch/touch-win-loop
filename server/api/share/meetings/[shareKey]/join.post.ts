import { resolveMeetingRuntimeError } from '~~/server/services/meeting/meeting-runtime'
import { joinSharedProjectMeetingSession } from '~~/server/services/meeting/project-meeting'
import { defineApiHandler } from '~~/server/utils/api-handler'
import { withTransaction } from '~~/server/utils/db'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineApiHandler(async ({ event, runtime: fallbackRuntime, fail, ok }) => {
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const shareKey = normalizeString(getRouterParam(event, 'shareKey'))
  const body = await readBody<{ displayName?: string }>(event).catch(() => ({} as { displayName?: string }))

  if (!shareKey)
    return fail('缺少 shareKey。', 40116, { status: 400 })

  if (!normalizeString(body?.displayName))
    return fail('请输入显示名后再加入会议。', 40016, { status: 400 })

  try {
    const payload = await withTransaction(event, async db => joinSharedProjectMeetingSession(db, {
      shareKey,
      displayName: normalizeString(body?.displayName),
      runtime,
    }))
    return ok(payload, 'ok', {
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'MEETING_SHARE_NOT_FOUND') {
      return fail('分享链接不存在。', 40420, {
        status: 404,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    if (error instanceof Error && ['MEETING_SHARE_REVOKED', 'MEETING_SHARE_EXPIRED', 'MEETING_SHARE_UNAVAILABLE'].includes(error.message)) {
      return fail('当前分享链接已失效。', 41016, {
        status: 410,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    if (error instanceof Error && error.message === 'MEETING_NOT_STARTED') {
      return fail('会议尚未开始，请等待主持人启动。', 40916, {
        status: 409,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    const runtimeError = resolveMeetingRuntimeError(error)
    if (runtimeError) {
      return fail(runtimeError.message, 50398, {
        status: runtimeError.status,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    throw error
  }
})
