import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { getProjectCollabSnapshot } from '~~/server/utils/project-resource-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface ProjectExistsRow {
  id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const resourceId = normalizeString(getRouterParam(event, 'resourceId'))

  if (!projectId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40089)
  }

  const result = await withClient(event, async (db) => {
    const projectExists = await db.query<ProjectExistsRow>(
      `SELECT id
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId],
    )

    if (!projectExists.rows[0]?.id)
      return 'PROJECT_NOT_FOUND' as const

    const access = await resolveProjectRealtimeAccess(db, user, projectId)
    if (!access)
      return 'FORBIDDEN' as const

    const snapshot = await getProjectCollabSnapshot(db, {
      projectId,
      resourceId,
    })
    if (!snapshot)
      return 'COLLAB_NOT_FOUND' as const

    return {
      snapshot,
    }
  })

  if (result === 'PROJECT_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40491)
  }

  if (result === 'FORBIDDEN') {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问该协作文档或画布。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40388)
  }

  if (result === 'COLLAB_NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('协作文档或画布不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40492)
  }

  return ok({
    kind: result.snapshot.kind,
    revision: result.snapshot.revision,
    updateBase64: Buffer.from(result.snapshot.update).toString('base64'),
    updatedAt: result.snapshot.updatedAt,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
