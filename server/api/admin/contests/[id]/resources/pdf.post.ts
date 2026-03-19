import type {
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminResource, recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import {
  createResourceDocumentWithTask,
  updateResourceSourceLinkByDocument,
} from '~~/server/utils/document-store'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface UploadPayload {
  category: ResourceCategory
  title: string
  year: number
  accessLevel: ResourceAvailability
  sourceType: string
  summary: string
  copyrightNote: string
  status: ResourceStatus
}

function toUploadPayload(raw: Record<string, string>, fallbackTitle: string): UploadPayload {
  const year = Number(raw.year || new Date().getFullYear())
  return {
    category: (raw.category || 'templates') as ResourceCategory,
    title: (raw.title || fallbackTitle || 'PDF 资料').trim(),
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    accessLevel: (raw.accessLevel || 'public') as ResourceAvailability,
    sourceType: (raw.sourceType || 'upload-pdf').trim(),
    summary: (raw.summary || '').trim(),
    copyrightNote: (raw.copyrightNote || '').trim(),
    status: (raw.status || 'active') as ResourceStatus,
  }
}

function normalizeFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed)
    return 'document.pdf'
  if (trimmed.toLowerCase().endsWith('.pdf'))
    return trimmed
  return `${trimmed}.pdf`
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

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40090)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权上传资料。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40390)
  }

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    setResponseStatus(event, 400)
    return fail('请求体为空，请使用 multipart/form-data 上传 PDF。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }

  const filePart = parts.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename || !filePart.data) {
    setResponseStatus(event, 400)
    return fail('缺少文件字段 file。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  const fileName = normalizeFileName(filePart.filename)
  const mime = (filePart.type || '').toLowerCase()
  const isPdf = fileName.toLowerCase().endsWith('.pdf') && (!mime || mime.includes('pdf'))
  if (!isPdf) {
    setResponseStatus(event, 400)
    return fail('仅支持上传 PDF 文件。', {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  const payload = toUploadPayload(toStringMap(parts), fileName.replace(/\.pdf$/i, ''))
  const objectKey = buildDocumentObjectKey(contestId, fileName)
  const storage = getDocumentStorage()
  const fileBuffer = Buffer.from(filePart.data)

  await storage.putObject({
    key: objectKey,
    body: fileBuffer,
  })

  try {
    const result = await withTransaction(event, async (db) => {
      const resource = await createAdminResource(db, {
        actorUserId: user.id,
        contestId,
        category: payload.category,
        title: payload.title,
        year: payload.year,
        url: '',
        accessLevel: payload.accessLevel,
        sourceType: payload.sourceType,
        summary: payload.summary,
        copyrightNote: payload.copyrightNote,
        status: payload.status,
      })

      const created = await createResourceDocumentWithTask(db, {
        contestId,
        resourceId: resource.id,
        objectKey,
        storageProvider: storage.provider,
        fileName,
        mimeType: mime || 'application/pdf',
        fileSize: fileBuffer.length,
        pageCount: 0,
        actorUserId: user.id,
      })

      await updateResourceSourceLinkByDocument(db, {
        contestId,
        resourceId: resource.id,
        url: `/api/admin/documents/${created.document.id}/preview`,
        actorUserId: user.id,
      })

      await recordContestAuditLog(db, {
        actorUserId: user.id,
        contestId,
        resourceId: resource.id,
        action: 'resource.document.upload',
        payload: {
          documentId: created.document.id,
          taskId: created.task.id,
          fileName,
          fileSize: fileBuffer.length,
          storageProvider: storage.provider,
        },
      })

      return {
        resource,
        document: created.document,
        task: created.task,
      }
    })

    return ok(result, {
      startedAt,
      provider: runtime.docAi.provider,
      model: runtime.docAi.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    await storage.deleteObject(objectKey)
    throw error
  }
})
