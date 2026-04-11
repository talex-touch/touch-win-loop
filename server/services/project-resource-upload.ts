import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  ProjectResourceUploadSession,
  Resource,
} from '~~/shared/types/domain'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { withTransaction } from '~~/server/utils/db'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'
import { createProjectPreviewDocumentWithTask, getProjectResourceDocumentByResourceId } from '~~/server/utils/project-resource-document-store'
import {
  createProjectUploadedResource,
  getProjectResourceById,
  getProjectUploadedStorageUsageBytes,
} from '~~/server/utils/project-resource-store'
import {
  getProjectResourceUploadReservedBytes,
  getProjectResourceUploadSessionById,
  listProjectResourceUploadChunkRows,
  markProjectResourceUploadSessionCompleted,
  markProjectResourceUploadSessionFailed,
  updateProjectResourceUploadSessionStatus,
} from '~~/server/utils/project-resource-upload-session-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function resolveProjectResourceUploadVisibleProject(
  db: Queryable,
  input: {
    user: AuthUser
    projectId: string
  },
): Promise<
  | {
    ok: true
    workspaceId: string
  }
  | {
    ok: false
    reason: 'PROJECT_NOT_FOUND' | 'FORBIDDEN'
  }
> {
  const projectId = normalizeString(input.projectId)
  const project = await getVisibleProjectById(db, input.user, projectId)
  if (!project)
    return { ok: false, reason: 'PROJECT_NOT_FOUND' }

  return {
    ok: true,
    workspaceId: project.workspaceId || project.teamId,
  }
}

export async function resolveProjectResourceUploadViewAccessContext(
  db: Queryable,
  input: {
    user: AuthUser
    projectId: string
  },
): Promise<
  | {
    ok: true
    workspaceId: string
  }
  | {
    ok: false
    reason: 'PROJECT_NOT_FOUND' | 'FORBIDDEN'
  }
> {
  return resolveProjectResourceUploadVisibleProject(db, input)
}

export async function resolveProjectResourceUploadAccessContext(
  db: Queryable,
  input: {
    user: AuthUser
    projectId: string
  },
): Promise<
  | {
    ok: true
    workspaceId: string
    usedBytes: number
    reservedBytes: number
  }
  | {
    ok: false
    reason: 'PROJECT_NOT_FOUND' | 'FORBIDDEN'
  }
> {
  const projectId = normalizeString(input.projectId)
  const visible = await resolveProjectResourceUploadVisibleProject(db, input)
  if (!visible.ok)
    return visible

  const manageable = await teamCanManageProject(db, input.user, projectId)
  if (!manageable)
    return { ok: false, reason: 'FORBIDDEN' }

  const [usedBytes, reservedBytes] = await Promise.all([
    getProjectUploadedStorageUsageBytes(db, projectId),
    getProjectResourceUploadReservedBytes(db, { projectId }),
  ])

  return {
    ok: true,
    workspaceId: visible.workspaceId,
    usedBytes,
    reservedBytes,
  }
}

export async function finalizeProjectResourceUploadSession(input: {
  event: H3Event
  user: AuthUser
  projectId: string
  sessionId: string
}): Promise<{
  session: ProjectResourceUploadSession
  resource: Resource
  documentId?: string
  previewStatus?: Resource['previewStatus']
}> {
  const projectId = normalizeString(input.projectId)
  const sessionId = normalizeString(input.sessionId)
  const storage = getDocumentStorage()
  const { session, sourceKeys, finalObjectKey } = await withTransaction(input.event, async (db) => {
    const lockedSession = await getProjectResourceUploadSessionById(db, {
      projectId,
      sessionId,
      forUpdate: true,
    })
    if (!lockedSession)
      throw new Error('UPLOAD_SESSION_NOT_FOUND')
    if (new Date(lockedSession.expiresAt).getTime() <= Date.now())
      throw new Error('UPLOAD_SESSION_EXPIRED')
    if (lockedSession.status === 'canceled')
      throw new Error('UPLOAD_SESSION_CANCELED')

    if (lockedSession.status === 'completed' && lockedSession.resourceId) {
      return {
        session: lockedSession,
        sourceKeys: [] as string[],
        finalObjectKey: normalizeString(lockedSession.finalObjectKey),
      }
    }

    if (lockedSession.status === 'finalizing')
      throw new Error('UPLOAD_SESSION_FINALIZING')

    const chunkRows = await listProjectResourceUploadChunkRows(db, {
      sessionId,
    })
    if (chunkRows.length !== lockedSession.chunkCount)
      throw new Error('UPLOAD_CHUNKS_INCOMPLETE')

    const sortedChunks = [...chunkRows].sort((left, right) => Number(left.chunk_index || 0) - Number(right.chunk_index || 0))
    const sourceKeys = sortedChunks.map(row => normalizeString(row.object_key)).filter(Boolean)
    if (sourceKeys.length !== lockedSession.chunkCount)
      throw new Error('UPLOAD_CHUNKS_INCOMPLETE')

    const updatedFinalizing = await updateProjectResourceUploadSessionStatus(db, {
      projectId,
      sessionId,
      fromStatuses: ['queued', 'uploading', 'paused', 'failed'],
      toStatus: 'finalizing',
      clearError: true,
    })
    if (!updatedFinalizing)
      throw new Error('UPLOAD_SESSION_STATUS_CONFLICT')

    return {
      session: updatedFinalizing,
      sourceKeys,
      finalObjectKey: buildDocumentObjectKey(`project-${projectId}`, lockedSession.fileName),
    }
  })

  if (session.status === 'completed' && session.resourceId) {
    const payload = await withTransaction(input.event, async (db) => {
      const resource = await getProjectResourceById(db, {
        projectId,
        resourceId: session.resourceId!,
      })
      if (!resource)
        throw new Error('UPLOAD_RESOURCE_NOT_FOUND')
      const document = await getProjectResourceDocumentByResourceId(db, {
        projectId,
        resourceId: session.resourceId!,
      })
      return {
        resource,
        documentId: document?.id,
        previewStatus: document?.previewStatus,
      }
    })

    return {
      session,
      resource: payload.resource,
      documentId: payload.documentId,
      previewStatus: payload.previewStatus,
    }
  }

  try {
    await storage.mergeObjects({
      key: finalObjectKey,
      sourceKeys,
      contentType: session.mimeType,
    })

    const payload = await withTransaction(input.event, async (db) => {
      const resource = await createProjectUploadedResource(db, {
        projectId,
        actorUserId: input.user.id,
        fileName: session.fileName,
        mimeType: session.mimeType,
        fileSize: session.fileSize,
        objectKey: finalObjectKey,
        storageProvider: storage.provider,
        title: session.title,
        summary: session.summary,
        category: session.category,
        accessLevel: session.accessLevel,
        parentResourceId: session.parentResourceId,
      })

      const created = await createProjectPreviewDocumentWithTask(db, {
        projectId,
        projectResourceId: resource.id,
        sourceObjectKey: finalObjectKey,
        sourceStorageProvider: storage.provider,
        sourceFileName: session.fileName,
        sourceMimeType: session.mimeType,
        sourceFileSize: session.fileSize,
        actorUserId: input.user.id,
      })

      await generateAndSaveProjectOutline(db, {
        projectId,
        user: input.user,
        reason: 'upload_session_completed',
      })

      const completed = await markProjectResourceUploadSessionCompleted(db, {
        projectId,
        sessionId,
        resourceId: resource.id,
        finalObjectKey,
        finalStorageProvider: storage.provider,
      })
      if (!completed)
        throw new Error('UPLOAD_SESSION_COMPLETE_FAILED')

      return {
        session: completed,
        resource,
        documentId: created.document.id,
        previewStatus: created.document.previewStatus,
      }
    })

    await storage.deleteObjects(sourceKeys)

    return payload
  }
  catch (error) {
    await storage.deleteObject(finalObjectKey).catch(() => undefined)
    await withTransaction(input.event, async (db) => {
      await markProjectResourceUploadSessionFailed(db, {
        projectId,
        sessionId,
        errorCode: 'UPLOAD_FINALIZE_FAILED',
        errorMessage: error instanceof Error ? error.message : '上传收尾失败，请稍后重试。',
      })
    }).catch(() => undefined)
    throw error
  }
}
