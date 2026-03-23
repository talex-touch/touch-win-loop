import { setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { canManageProject, getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  listProjectRecycleResources,
  PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS,
  purgeExpiredProjectResourcesFromRecycleBin,
} from '~~/server/utils/project-resource-store'

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
    }, 40084)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const manageable = await canManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      const expiredPurged = await purgeExpiredProjectResourcesFromRecycleBin(db, {
        projectId,
        retentionDays: PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS,
      })

      const resources = await listProjectRecycleResources(db, projectId)
      return {
        resources,
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

    return ok(result.resources, {
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
      }, 40485)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权管理项目回收站。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40384)
    }

    throw error
  }
})
