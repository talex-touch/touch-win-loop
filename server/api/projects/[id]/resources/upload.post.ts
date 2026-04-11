import type {
  Resource,
  ResourceAvailability,
  ResourceCategory,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import { createProjectPreviewDocumentWithTask } from '~~/server/utils/project-resource-document-store'
import {
  createProjectUploadedResource,
  getProjectUploadedStorageUsageBytes,
} from '~~/server/utils/project-resource-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
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

interface ProjectUploadFile {
  fileName: string
  mimeType: string
  buffer: Buffer
  objectKey: string
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

    const manageable = await teamCanManageProject(db, user, projectId)
    if (!manageable)
      return { ok: false as const, reason: 'FORBIDDEN' as const }

    const usedBytes = await getProjectUploadedStorageUsageBytes(db, projectId)
    return {
      ok: true as const,
      usedBytes,
      workspaceId: project.workspaceId || project.teamId,
    }
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

  const fileParts = parts.filter(part => part.name === 'file' && part.filename)
  if (!fileParts.length) {
    setResponseStatus(event, 400)
    return fail('缺少文件字段 file。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40067)
  }

  if (fileParts.length > PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH) {
    setResponseStatus(event, 400)
    return fail(`单次最多上传 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个文件。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40068)
  }

  const fields = toStringMap(parts)
  const category = normalizeCategory(normalizeString(fields.category))
  const accessLevel = normalizeAccessLevel(normalizeString(fields.accessLevel))
  const title = normalizeString(fields.title)
  const summary = normalizeString(fields.summary)
  const hostMarkdownResourceId = normalizeString(fields.hostMarkdownResourceId)
  const parentResourceId = normalizeString(fields.parentResourceId)
  const files: ProjectUploadFile[] = fileParts.map((part) => {
    const fileName = normalizeString(part.filename) || 'upload.bin'
    const mimeType = normalizeString(part.type) || 'application/octet-stream'
    const buffer = Buffer.from(part.data || Buffer.alloc(0))
    const objectKey = buildDocumentObjectKey(`project-${projectId}`, fileName)
    return {
      fileName,
      mimeType,
      buffer,
      objectKey,
    }
  })

  const emptyFile = files.find(file => file.buffer.length === 0)
  if (emptyFile) {
    setResponseStatus(event, 400)
    return fail(`文件为空：${emptyFile.fileName}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40069)
  }

  const unsupportedFiles = files
    .filter(file => !isProjectResourceUploadFileSupported(file.fileName))
    .map(file => file.fileName)

  if (unsupportedFiles.length > 0) {
    setResponseStatus(event, 400)
    return fail(`文件格式不支持：${unsupportedFiles.slice(0, 3).join('、')}。支持格式：${PROJECT_RESOURCE_UPLOAD_TYPES_LABEL}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40070)
  }

  const oversizedFile = files.find(file => file.buffer.length > PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)
  if (oversizedFile) {
    setResponseStatus(event, 400)
    return fail(`文件过大：${oversizedFile.fileName}，单文件上限 ${formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40071)
  }

  const incomingBytes = files.reduce((sum, file) => sum + file.buffer.length, 0)
  if (hasAccess.usedBytes + incomingBytes > PROJECT_RESOURCE_STORAGE_LIMIT_BYTES) {
    setResponseStatus(event, 400)
    return fail(`当前项目容量超限：最多 ${formatFileSize(PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40072)
  }

  const storage = getDocumentStorage()
  const uploadedObjectKeys: string[] = []

  try {
    for (const file of files) {
      await storage.putObject({
        key: file.objectKey,
        body: file.buffer,
      })
      uploadedObjectKeys.push(file.objectKey)
    }

    const resources = await withTransaction(event, async (db) => {
      const nextResources: Resource[] = []
      for (const file of files) {
        const resource = await createProjectUploadedResource(db, {
          projectId,
          actorUserId: user.id,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.buffer.length,
          objectKey: file.objectKey,
          storageProvider: storage.provider,
          title: files.length === 1 ? title : '',
          summary,
          category,
          accessLevel,
          hostMarkdownResourceId,
          parentResourceId: parentResourceId || undefined,
          metadata: hostMarkdownResourceId
            ? {
                embeddedIn: {
                  kind: 'markdown',
                  resourceId: hostMarkdownResourceId,
                },
              }
            : undefined,
        })

        const created = await createProjectPreviewDocumentWithTask(db, {
          projectId,
          projectResourceId: resource.id,
          sourceObjectKey: file.objectKey,
          sourceStorageProvider: storage.provider,
          sourceFileName: file.fileName,
          sourceMimeType: file.mimeType,
          sourceFileSize: file.buffer.length,
          actorUserId: user.id,
        })

        const signedUrls = buildProjectResourceSignedUrls({
          projectId,
          resourceId: resource.id,
        })

        nextResources.push({
          ...resource,
          resourceKind: 'binary',
          documentId: created.document.id,
          previewStatus: created.document.previewStatus,
          previewProgressPercent: created.document.previewProgressPercent,
          previewEtaSeconds: created.document.previewEtaSeconds,
          previewError: created.document.previewError || undefined,
          previewUrl: signedUrls.previewUrl,
          previewUrlExpiresAt: signedUrls.previewUrlExpiresAt,
          sourceDownloadUrl: signedUrls.sourceDownloadUrl,
          sourceDownloadUrlExpiresAt: signedUrls.sourceDownloadUrlExpiresAt,
          sourceLink: signedUrls.sourceDownloadUrl,
        })
      }
      return nextResources
    })

    await withTransaction(event, async (db) => {
      await generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: 'upload_success',
      })
    }).catch(() => undefined)

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: hasAccess.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: hasAccess.workspaceId,
        projectId,
      }),
    ])

    return ok({
      resources,
      uploadedCount: resources.length,
      totalBytes: incomingBytes,
      usedBytes: hasAccess.usedBytes + incomingBytes,
      limitBytes: PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, files.length === 1 ? '上传成功。' : `批量上传成功（${resources.length} 个文件）。`)
  }
  catch (error) {
    await Promise.allSettled(uploadedObjectKeys.map(objectKey => storage.deleteObject(objectKey)))

    if (error instanceof Error && error.message === 'RESOURCE_PARENT_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标父节点不存在，或不在当前项目内。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40073)
    }

    throw error
  }
})
