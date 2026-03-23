import type {
  ResourceAvailability,
  ResourceCategory,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import { createProjectUploadedResource } from '~~/server/utils/project-resource-store'

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

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toStringMap(parts: Awaited<ReturnType<typeof readMultipartFormData>>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const part of parts || []) {
    if (!part.name || part.filename)
      continue
    map[part.name] = (part.data || Buffer.alloc(0)).toString('utf-8')
  }
  return map
}

function normalizeCategory(raw: string): ResourceCategory {
  const target = RESOURCE_CATEGORIES.find(item => item === raw)
  return target || 'templates'
}

function normalizeAccessLevel(raw: string): ResourceAvailability {
  if (raw === 'login_required' || raw === 'unavailable')
    return raw
  return 'public'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40065)
  }

  const hasAccess = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return { ok: false as const, reason: 'PROJECT_NOT_FOUND' as const }

    const manageable = await canManageProject(db, user, projectId)
    if (!manageable)
      return { ok: false as const, reason: 'FORBIDDEN' as const }

    return { ok: true as const }
  })

  if (!hasAccess.ok) {
    if (hasAccess.reason === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40465)
    }

    setResponseStatus(event, 403)
    return fail('当前用户无权管理项目资源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40365)
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    setResponseStatus(event, 400)
    return fail('请求体为空，请使用 multipart/form-data 上传文件。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40066)
  }

  const filePart = parts.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename || !filePart.data) {
    setResponseStatus(event, 400)
    return fail('缺少文件字段 file。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40067)
  }

  const fields = toStringMap(parts)
  const fileName = normalizeString(filePart.filename) || 'upload.bin'
  const mimeType = normalizeString(filePart.type) || 'application/octet-stream'
  const objectKey = buildDocumentObjectKey(`project-${projectId}`, fileName)
  const category = normalizeCategory(normalizeString(fields.category))
  const accessLevel = normalizeAccessLevel(normalizeString(fields.accessLevel))
  const title = normalizeString(fields.title)
  const summary = normalizeString(fields.summary)

  const storage = getDocumentStorage()
  const fileBuffer = Buffer.from(filePart.data)

  await storage.putObject({
    key: objectKey,
    body: fileBuffer,
  })

  try {
    const resource = await withTransaction(event, async (db) => {
      return createProjectUploadedResource(db, {
        projectId,
        actorUserId: user.id,
        fileName,
        mimeType,
        fileSize: fileBuffer.length,
        objectKey,
        storageProvider: storage.provider,
        title,
        summary,
        category,
        accessLevel,
      })
    })

    return ok(resource, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    await storage.deleteObject(objectKey)
    throw error
  }
})
