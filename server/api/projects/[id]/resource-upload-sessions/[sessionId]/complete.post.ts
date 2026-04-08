import type { Resource } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { finalizeProjectResourceUploadSession, resolveProjectResourceUploadAccessContext } from '~~/server/services/project-resource-upload'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

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
    }, 40106)
  }

  const access = await withTransaction(event, async (db) => {
    return resolveProjectResourceUploadAccessContext(db, {
      user,
      projectId,
    })
  })

  if (!access.ok) {
    if (access.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40501)
    }
    setResponseStatus(event, 403)
    return fail('当前用户无权完成上传任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  try {
    const payload = await finalizeProjectResourceUploadSession({
      event,
      user,
      projectId,
      sessionId,
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: access.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: access.workspaceId,
        projectId,
      }),
    ])

    return ok({
      session: payload.session,
      resource: payload.resource,
      documentId: payload.documentId,
      previewStatus: payload.previewStatus,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '上传已完成。')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message === 'UPLOAD_SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('上传会话不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40502)
    }
    if (message === 'UPLOAD_CHUNKS_INCOMPLETE') {
      setResponseStatus(event, 409)
      return fail('分片尚未上传完整，暂时无法完成上传。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40902)
    }
    if (message === 'UPLOAD_SESSION_EXPIRED') {
      setResponseStatus(event, 409)
      return fail('上传会话已过期，请重新发起上传。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40903)
    }
    if (message === 'UPLOAD_SESSION_FINALIZING') {
      setResponseStatus(event, 409)
      return fail('上传正在收尾处理中，请稍后刷新。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40904)
    }
    throw error
  }
})
