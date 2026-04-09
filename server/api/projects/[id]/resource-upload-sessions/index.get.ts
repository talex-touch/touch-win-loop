import type { ProjectResourceUploadSessionListResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { resolveProjectResourceUploadViewAccessContext } from '~~/server/services/project-resource-upload'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  expireProjectResourceUploadSessions,
  listProjectResourceUploadSessions,
} from '~~/server/utils/project-resource-upload-session-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const result = await withTransaction(event, async (db) => {
    const expiredChunkKeys = await expireProjectResourceUploadSessions(db, { projectId })
    const access = await resolveProjectResourceUploadViewAccessContext(db, {
      user,
      projectId,
    })
    if (!access.ok)
      return { ok: false as const, reason: access.reason, expiredChunkKeys, items: [] }

    const items = await listProjectResourceUploadSessions(db, {
      projectId,
    })
    return { ok: true as const, expiredChunkKeys, items }
  })

  const storage = getDocumentStorage()
  await storage.deleteObjects(result.expiredChunkKeys || []).catch(() => undefined)

  if (!result.ok) {
    if (result.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40492)
    }
    setResponseStatus(event, 403)
    return fail('当前用户无权查看项目上传会话。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const payload: ProjectResourceUploadSessionListResult = {
    items: result.items,
  }
  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
