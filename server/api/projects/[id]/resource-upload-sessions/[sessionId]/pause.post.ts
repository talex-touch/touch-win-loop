import { setResponseStatus } from 'h3'
import { resolveProjectResourceUploadAccessContext } from '~~/server/services/project-resource-upload'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { updateProjectResourceUploadSessionStatus } from '~~/server/utils/project-resource-upload-session-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40103)
  }

  const result = await withTransaction(event, async (db) => {
    const access = await resolveProjectResourceUploadAccessContext(db, {
      user,
      projectId,
    })
    if (!access.ok)
      return { ok: false as const, reason: access.reason, session: null }

    const session = await updateProjectResourceUploadSessionStatus(db, {
      projectId,
      sessionId,
      fromStatuses: ['queued', 'uploading', 'failed'],
      toStatus: 'paused',
    })
    if (!session)
      return { ok: false as const, reason: 'SESSION_NOT_FOUND' as const, session: null }
    return { ok: true as const, session }
  })

  if (!result.ok) {
    if (result.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40495)
    }
    if (result.reason === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权暂停上传任务。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40394)
    }
    setResponseStatus(event, 404)
    return fail('上传会话不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  return ok({ session: result.session }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, '上传已暂停。')
})
