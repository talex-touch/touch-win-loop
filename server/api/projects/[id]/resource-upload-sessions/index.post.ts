import type {
  ProjectResourceUploadSessionListResult,
  ResourceAvailability,
  ResourceCategory,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { resolveProjectResourceUploadAccessContext } from '~~/server/services/project-resource-upload'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  createProjectResourceUploadSessions,
  expireProjectResourceUploadSessions,
} from '~~/server/utils/project-resource-upload-session-store'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
  PROJECT_RESOURCE_UPLOAD_SESSION_EXPIRES_IN_HOURS,
  PROJECT_RESOURCE_UPLOAD_TYPES_LABEL,
} from '~~/shared/constants/project-resource-upload'

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'basic_info',
  'timeline',
  'tracks',
  'scoring',
  'past_questions',
  'awarded_works',
  'templates',
  'faq',
  'judge_guidelines',
  'track_details',
  'ai_prompts',
  'submission_examples',
  'policy_notice',
  'compliance',
]

interface UploadSessionInitFileInput {
  fileName?: string
  fileSize?: number
  mimeType?: string
  lastModified?: number
  category?: string
  accessLevel?: string
  title?: string
  summary?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeCategory(raw: unknown): ResourceCategory {
  const normalized = normalizeString(raw) as ResourceCategory
  return RESOURCE_CATEGORIES.find(item => item === normalized) || 'templates'
}

function normalizeAccessLevel(raw: unknown): ResourceAvailability {
  const normalized = normalizeString(raw)
  if (normalized === 'login_required' || normalized === 'unavailable')
    return normalized
  return 'public'
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

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }

  const body = await readBody<{ files?: UploadSessionInitFileInput[] }>(event).catch(() => null)
  const rawFiles = Array.isArray(body?.files) ? body!.files : []
  if (!rawFiles.length) {
    setResponseStatus(event, 400)
    return fail('缺少文件初始化信息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  if (rawFiles.length > PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH) {
    setResponseStatus(event, 400)
    return fail(`单次最多上传 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个文件。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  const files = rawFiles.map((item) => {
    return {
      fileName: normalizeString(item.fileName),
      fileSize: toSafeInteger(item.fileSize),
      mimeType: normalizeString(item.mimeType) || 'application/octet-stream',
      lastModified: toSafeInteger(item.lastModified),
      category: normalizeCategory(item.category),
      accessLevel: normalizeAccessLevel(item.accessLevel),
      title: normalizeString(item.title),
      summary: normalizeString(item.summary),
    }
  })

  const invalidFile = files.find(file => !file.fileName || file.fileSize <= 0)
  if (invalidFile) {
    setResponseStatus(event, 400)
    return fail('文件名或文件大小无效。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }

  const unsupportedFiles = files
    .filter(file => !isProjectResourceUploadFileSupported(file.fileName))
    .map(file => file.fileName)
  if (unsupportedFiles.length) {
    setResponseStatus(event, 400)
    return fail(`文件格式不支持：${unsupportedFiles.slice(0, 3).join('、')}。支持格式：${PROJECT_RESOURCE_UPLOAD_TYPES_LABEL}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const oversizedFile = files.find(file => file.fileSize > PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)
  if (oversizedFile) {
    setResponseStatus(event, 400)
    return fail(`文件过大：${oversizedFile.fileName}，单文件上限 ${formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  const incomingBytes = files.reduce((sum, file) => sum + file.fileSize, 0)
  const expiresAt = new Date(Date.now() + PROJECT_RESOURCE_UPLOAD_SESSION_EXPIRES_IN_HOURS * 60 * 60 * 1000).toISOString()

  const result = await withTransaction(event, async (db) => {
    const expiredChunkKeys = await expireProjectResourceUploadSessions(db, { projectId })
    const access = await resolveProjectResourceUploadAccessContext(db, {
      user,
      projectId,
    })
    if (!access.ok)
      return { ok: false as const, reason: access.reason, expiredChunkKeys, sessions: [] }

    if (access.usedBytes + access.reservedBytes + incomingBytes > PROJECT_RESOURCE_STORAGE_LIMIT_BYTES) {
      return {
        ok: false as const,
        reason: 'LIMIT_EXCEEDED' as const,
        expiredChunkKeys,
        sessions: [],
      }
    }

    const sessions = await createProjectResourceUploadSessions(db, {
      projectId,
      actorUserId: user.id,
      chunkSize: PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES,
      expiresAt,
      files,
    })
    return {
      ok: true as const,
      expiredChunkKeys,
      sessions,
    }
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
      }, 40491)
    }
    if (result.reason === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目上传。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40391)
    }
    setResponseStatus(event, 400)
    return fail(`当前项目容量超限：最多 ${formatFileSize(PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const payload: ProjectResourceUploadSessionListResult = {
    items: result.sessions,
  }
  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, '上传会话已创建。')
})
