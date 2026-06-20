import type { H3Event } from 'h3'
import type { AuthUser } from '~~/shared/types/domain'
import { sendRedirect, setHeader, setResponseStatus } from 'h3'
import { verifyProjectResourceAccessToken } from '~~/server/services/document/project-resource-access-token'
import {
  getDocumentStorageByChannel,
  isDocumentStorageObjectNotFoundError,
} from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { buildServerApiEndpoint, resolveServerApiUrl } from '~~/server/utils/api-url'
import { requireAuth } from '~~/server/utils/auth'
import {
  getProjectBillingScopeById,
  recordBillingUsageEventSafely,
  resolveBillingSourceRoute,
} from '~~/server/utils/billing-usage-tracker'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectResourceSourceFileRef } from '~~/server/utils/project-resource-document-store'
import {
  getProjectResourceDownloadDescriptor,
  getProjectUploadedFileRef,
} from '~~/server/utils/project-resource-store'
import { appendQueryParam } from '~~/shared/utils/api-url'

interface DownloadFileRef {
  objectKey: string
  storageProvider: string
  fileName: string
  mimeType: string
}

interface DownloadPreparationResult {
  actorUserId: string | null
  contestId: string | null
  contestResourceId: string | null
  projectId: string
  projectResourceId: string
  reason: '' | 'PROJECT_NOT_FOUND' | 'RESOURCE_NOT_FOUND'
  redirectUrl: string
  trackId: string | null
  workspaceId: string
  fileRef: DownloadFileRef | null
}

function encodeFileName(fileName: string): string {
  return encodeURIComponent(fileName).replace(/%20/g, '+')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return String(error.message || 'STORAGE_ERROR').trim() || 'STORAGE_ERROR'
  return String(error || 'STORAGE_ERROR').trim() || 'STORAGE_ERROR'
}

async function recordDownloadUsage(
  event: H3Event,
  input: {
    actorUserId?: string | null
    contestId?: string | null
    contestResourceId?: string | null
    meta?: Record<string, unknown>
    projectId: string
    projectResourceId: string
    result: 'success' | 'failed'
    sourceRoute: string
    trackId?: string | null
    workspaceId: string
  },
): Promise<void> {
  await withClient(event, async (db) => {
    await recordBillingUsageEventSafely(db, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      contestId: input.contestId,
      trackId: input.trackId,
      projectResourceId: input.projectResourceId,
      contestResourceId: input.contestResourceId,
      actorUserId: input.actorUserId,
      eventCode: 'resource.download',
      result: input.result,
      sourceRoute: input.sourceRoute,
      meta: input.meta,
    })
  }).catch(() => undefined)
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const token = String(getQuery(event).token || '').trim()
  const sourceRoute = resolveBillingSourceRoute(getQuery(event).sourceRoute, event.path)

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40123)
  }

  const tokenAuthorized = token
    ? verifyProjectResourceAccessToken({
        token,
        projectId,
        resourceId,
        kind: 'source',
      })
    : false

  let user: AuthUser | null = null
  if (!tokenAuthorized)
    ({ user } = await requireAuth(event))

  const prepared = await withClient(event, async (db): Promise<DownloadPreparationResult> => {
    const scope = await getProjectBillingScopeById(db, projectId)
    if (!scope) {
      return {
        workspaceId: '',
        projectId,
        projectResourceId: resourceId,
        contestId: null,
        trackId: null,
        contestResourceId: null,
        actorUserId: user?.id || null,
        reason: 'PROJECT_NOT_FOUND',
        redirectUrl: '',
        fileRef: null,
      }
    }

    if (!tokenAuthorized) {
      const project = await getVisibleProjectById(db, user!, projectId)
      if (!project) {
        await recordBillingUsageEventSafely(db, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          contestId: scope.contestId,
          trackId: scope.trackId,
          projectResourceId: resourceId,
          actorUserId: user!.id,
          eventCode: 'resource.download',
          result: 'failed',
          sourceRoute,
          meta: {
            reason: 'PROJECT_NOT_VISIBLE',
          },
        })

        return {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          projectResourceId: resourceId,
          contestId: scope.contestId,
          trackId: scope.trackId,
          contestResourceId: null,
          actorUserId: user!.id,
          reason: 'PROJECT_NOT_FOUND',
          redirectUrl: '',
          fileRef: null,
        }
      }
    }

    const descriptor = await getProjectResourceDownloadDescriptor(db, {
      projectId,
      resourceId,
    })
    if (!descriptor) {
      await recordBillingUsageEventSafely(db, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        contestId: scope.contestId,
        trackId: scope.trackId,
        projectResourceId: resourceId,
        actorUserId: user?.id || null,
        eventCode: 'resource.download',
        result: 'failed',
        sourceRoute,
        meta: {
          reason: 'RESOURCE_NOT_FOUND',
        },
      })

      return {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        projectResourceId: resourceId,
        contestId: scope.contestId,
        trackId: scope.trackId,
        contestResourceId: null,
        actorUserId: user?.id || null,
        reason: 'RESOURCE_NOT_FOUND',
        redirectUrl: '',
        fileRef: null,
      }
    }

    const baseResult: Omit<DownloadPreparationResult, 'reason' | 'redirectUrl' | 'fileRef'> = {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      projectResourceId: resourceId,
      contestId: scope.contestId,
      trackId: scope.trackId,
      contestResourceId: descriptor.linkedContestResourceId,
      actorUserId: user?.id || null,
    }

    if (descriptor.source === 'collab') {
      const collabUrl = buildServerApiEndpoint(`/projects/${projectId}/resources/${resourceId}/collab`, event)
      return {
        ...baseResult,
        reason: '',
        redirectUrl: tokenAuthorized
          ? appendQueryParam(collabUrl, 'token', token)
          : collabUrl,
        fileRef: null,
      }
    }

    const sourceRef = await getProjectResourceSourceFileRef(db, {
      projectId,
      resourceId,
    })
    if (sourceRef) {
      return {
        ...baseResult,
        reason: '',
        redirectUrl: '',
        fileRef: {
          objectKey: sourceRef.objectKey,
          storageProvider: sourceRef.storageProvider,
          fileName: sourceRef.fileName,
          mimeType: sourceRef.mimeType,
        },
      }
    }

    if (descriptor.source === 'library') {
      const redirectUrl = resolveServerApiUrl(descriptor.sourceLink, event)
      if (redirectUrl) {
        return {
          ...baseResult,
          reason: '',
          redirectUrl,
          fileRef: null,
        }
      }
    }

    const fallbackRef = await getProjectUploadedFileRef(db, {
      projectId,
      resourceId,
    })
    if (!fallbackRef) {
      await recordBillingUsageEventSafely(db, {
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        contestId: scope.contestId,
        trackId: scope.trackId,
        projectResourceId: resourceId,
        contestResourceId: descriptor.linkedContestResourceId,
        actorUserId: user?.id || null,
        eventCode: 'resource.download',
        result: 'failed',
        sourceRoute,
        meta: {
          reason: 'DOWNLOAD_SOURCE_NOT_FOUND',
          resourceSource: descriptor.source,
        },
      })

      return {
        ...baseResult,
        reason: 'RESOURCE_NOT_FOUND',
        redirectUrl: '',
        fileRef: null,
      }
    }

    return {
      ...baseResult,
      reason: '',
      redirectUrl: '',
      fileRef: {
        objectKey: fallbackRef.objectKey,
        storageProvider: fallbackRef.storageProvider,
        fileName: fallbackRef.fileName,
        mimeType: fallbackRef.mimeType,
      },
    }
  })

  if (prepared.reason === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404123)
  }

  if (prepared.reason === 'RESOURCE_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('file not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404124)
  }

  if (prepared.redirectUrl) {
    await recordDownloadUsage(event, {
      workspaceId: prepared.workspaceId,
      projectId: prepared.projectId,
      projectResourceId: prepared.projectResourceId,
      contestId: prepared.contestId,
      trackId: prepared.trackId,
      contestResourceId: prepared.contestResourceId,
      actorUserId: prepared.actorUserId,
      result: 'success',
      sourceRoute,
      meta: {
        transport: 'redirect',
      },
    })

    return sendRedirect(event, prepared.redirectUrl, 302)
  }

  const fileRef = prepared.fileRef!
  const storage = getDocumentStorageByChannel(fileRef.storageProvider)

  try {
    const buffer = await storage.getObjectBuffer(fileRef.objectKey)
    await recordDownloadUsage(event, {
      workspaceId: prepared.workspaceId,
      projectId: prepared.projectId,
      projectResourceId: prepared.projectResourceId,
      contestId: prepared.contestId,
      trackId: prepared.trackId,
      contestResourceId: prepared.contestResourceId,
      actorUserId: prepared.actorUserId,
      result: 'success',
      sourceRoute,
      meta: {
        transport: 'file',
        bytes: buffer.length,
        channelId: storage.channelId,
        provider: storage.provider,
      },
    })

    setHeader(event, 'Content-Type', fileRef.mimeType || 'application/octet-stream')
    setHeader(event, 'Content-Length', buffer.length)
    setHeader(event, 'Content-Disposition', `attachment; filename*=UTF-8''${encodeFileName(fileRef.fileName || 'resource.bin')}`)
    return buffer
  }
  catch (error) {
    const storageObjectNotFound = isDocumentStorageObjectNotFoundError(error)
    await recordDownloadUsage(event, {
      workspaceId: prepared.workspaceId,
      projectId: prepared.projectId,
      projectResourceId: prepared.projectResourceId,
      contestId: prepared.contestId,
      trackId: prepared.trackId,
      contestResourceId: prepared.contestResourceId,
      actorUserId: prepared.actorUserId,
      result: 'failed',
      sourceRoute,
      meta: {
        transport: 'file',
        reason: storageObjectNotFound ? 'STORAGE_OBJECT_NOT_FOUND' : 'STORAGE_ERROR',
        errorMessage: storageObjectNotFound ? undefined : toErrorMessage(error),
      },
    })

    if (storageObjectNotFound) {
      setResponseStatus(event, 404)
      return fail('file not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 404125)
    }

    setResponseStatus(event, 502)
    return fail('文件暂时不可用，请稍后重试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 502125)
  }
})
