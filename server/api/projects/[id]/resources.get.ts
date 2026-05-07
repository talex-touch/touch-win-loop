import { setResponseStatus } from 'h3'
import { deleteObjectsAcrossStorageChannels } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import {
  listProjectResources,
  listUnreferencedUploadObjectKeys,
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
    }, 40061)
  }

  try {
    const result = await withTransaction(event, async (db) => {
      const project = await getVisibleProjectById(db, user, projectId)
      if (!project)
        throw new Error('PROJECT_NOT_FOUND')

      const expiredPurged = await purgeExpiredProjectResourcesFromRecycleBin(db, {
        projectId,
        retentionDays: PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS,
      })
      const resources = await listProjectResources(db, projectId)
      return {
        resources,
        expiredPurged,
      }
    })

    const expiredUploadObjectKeys = result.expiredPurged
      .filter(item => item.source === 'upload' && item.objectKey)
      .map(item => item.objectKey)

    const deletableObjectKeys = expiredUploadObjectKeys.length > 0
      ? await withClient(event, async db => listUnreferencedUploadObjectKeys(db, expiredUploadObjectKeys))
      : []

    await deleteObjectsAcrossStorageChannels(deletableObjectKeys, runtime).catch(() => undefined)

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
      }, 40461)
    }

    throw error
  }
})
