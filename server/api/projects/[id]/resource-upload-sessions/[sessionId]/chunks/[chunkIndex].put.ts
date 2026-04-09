import type { ProjectResourceUploadChunkAck } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { resolveProjectResourceUploadAccessContext } from '~~/server/services/project-resource-upload'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildProjectUploadChunkObjectKey,
  getProjectResourceUploadSessionById,
  upsertProjectResourceUploadChunk,
} from '~~/server/utils/project-resource-upload-session-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toSafeInteger(value: unknown, fallback = 0): number {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return fallback
  return Math.max(0, Math.trunc(normalized))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))
  const chunkIndex = toSafeInteger(getRouterParam(event, 'chunkIndex'))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  const xChunkSize = toSafeInteger(getHeader(event, 'x-chunk-size'))
  const xFileSize = toSafeInteger(getHeader(event, 'x-file-size'))
  const xChecksum = normalizeString(getHeader(event, 'x-chunk-checksum')).toLowerCase()
  if (!xChunkSize || !xFileSize || !xChecksum) {
    setResponseStatus(event, 400)
    return fail('缺少必要的分片头信息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  const validation = await withTransaction(event, async (db) => {
    const access = await resolveProjectResourceUploadAccessContext(db, {
      user,
      projectId,
    })
    if (!access.ok)
      return { ok: false as const, reason: access.reason }

    const session = await getProjectResourceUploadSessionById(db, {
      projectId,
      sessionId,
      forUpdate: true,
    })
    if (!session)
      return { ok: false as const, reason: 'SESSION_NOT_FOUND' as const }
    if (new Date(session.expiresAt).getTime() <= Date.now())
      return { ok: false as const, reason: 'SESSION_EXPIRED' as const }
    if (session.status === 'paused')
      return { ok: false as const, reason: 'SESSION_PAUSED' as const }
    if (session.status === 'finalizing' || session.status === 'completed' || session.status === 'canceled')
      return { ok: false as const, reason: 'SESSION_NOT_WRITABLE' as const }
    if (chunkIndex < 0 || chunkIndex >= session.chunkCount)
      return { ok: false as const, reason: 'CHUNK_INDEX_INVALID' as const }
    if (xFileSize !== session.fileSize)
      return { ok: false as const, reason: 'FILE_SIZE_MISMATCH' as const }

    const remaining = Math.max(0, session.fileSize - chunkIndex * session.chunkSize)
    const expectedChunkSize = Math.max(0, Math.min(session.chunkSize, remaining))
    if (expectedChunkSize <= 0)
      return { ok: false as const, reason: 'CHUNK_SIZE_INVALID' as const }
    if (xChunkSize !== expectedChunkSize)
      return { ok: false as const, reason: 'CHUNK_SIZE_MISMATCH' as const }

    return {
      ok: true as const,
      session,
      objectKey: buildProjectUploadChunkObjectKey(projectId, sessionId, chunkIndex),
    }
  })

  if (!validation.ok) {
    if (validation.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }
    if (validation.reason === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权上传项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40393)
    }
    if (validation.reason === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('上传会话不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40494)
    }
    setResponseStatus(event, 409)
    return fail('上传会话当前不可写入。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40901)
  }

  const rawBody = await readRawBody(event, false).catch(() => null)
  const buffer = rawBody === null || rawBody === undefined
    ? Buffer.alloc(0)
    : Buffer.from(rawBody)

  if (buffer.length !== xChunkSize) {
    setResponseStatus(event, 400)
    return fail('分片大小与声明不一致。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40101)
  }

  const checksum = createHash('sha256').update(buffer).digest('hex')
  if (checksum !== xChecksum) {
    setResponseStatus(event, 400)
    return fail('分片校验失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40102)
  }

  const storage = getDocumentStorage()
  await storage.putChunkObject({
    key: validation.objectKey,
    body: buffer,
    contentType: 'application/octet-stream',
  })

  try {
    const updatedSession = await withTransaction(event, async (db) => {
      return upsertProjectResourceUploadChunk(db, {
        sessionId,
        chunkIndex,
        chunkSize: buffer.length,
        objectKey: validation.objectKey,
        checksumSha256: checksum,
      })
    })

    const payload: ProjectResourceUploadChunkAck = {
      sessionId,
      chunkIndex,
      uploadedBytes: updatedSession.uploadedBytes,
      uploadedChunkCount: updatedSession.uploadedChunkCount,
      chunkCount: updatedSession.chunkCount,
      progressPercent: updatedSession.fileSize > 0
        ? Number(((updatedSession.uploadedBytes / updatedSession.fileSize) * 100).toFixed(2))
        : 0,
      status: updatedSession.status,
    }
    return ok(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    await storage.deleteObject(validation.objectKey).catch(() => undefined)
    throw error
  }
})
