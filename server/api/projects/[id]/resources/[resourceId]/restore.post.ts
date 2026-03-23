import { setResponseStatus } from 'h3'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS,
  purgeExpiredProjectResourcesFromRecycleBin,
  restoreProjectResourceFromRecycleBin,
} from '~~/server/utils/project-resource-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40085)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await canManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      const resource = await restoreProjectResourceFromRecycleBin(db, {
        projectId,
        resourceId,
        actorUserId: user.id,
      })

      const expiredPurged = await purgeExpiredProjectResourcesFromRecycleBin(db, {
        projectId,
        retentionDays: PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS,
      })

      await generateAndSaveProjectOutline(db, {
        projectId,
        user,
        reason: 'resource_restore_success',
      })

      return {
        resource,
        expiredPurged,
      }
    })

    const expiredUploadObjectKeys = result.expiredPurged
      .filter(item => item.source === 'upload' && item.objectKey)
      .map(item => item.objectKey)

    if (expiredUploadObjectKeys.length > 0) {
      const storage = getDocumentStorage()
      await Promise.allSettled(expiredUploadObjectKeys.map(objectKey => storage.deleteObject(objectKey)))
    }

    return ok(result.resource, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40486)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目资源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40385)
    }

    if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('资源不存在，或不在回收站中。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40487)
    }

    throw error
  }
})
