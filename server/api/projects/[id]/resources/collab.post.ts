import type { CollabPurpose, ResourceKind } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  createProjectCollabResource,
  ensureProjectWorkflowCanvas,
} from '~~/server/utils/project-resource-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

interface CreateCollabResourceBody {
  kind?: ResourceKind
  purpose?: CollabPurpose
  title?: string
  parentResourceId?: string | null
  drawMode?: string
  sceneSourceType?: string
  templateKey?: string
  editorEngine?: string
  metadata?: Record<string, unknown>
}

interface ProjectWorkspaceRow {
  workspace_id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeCollabKind(rawKind: unknown): Extract<ResourceKind, 'markdown' | 'draw'> | null {
  const normalized = normalizeString(rawKind).toLowerCase()
  if (normalized === 'markdown' || normalized === 'draw')
    return normalized
  return null
}

function normalizeCollabPurpose(rawPurpose: unknown): CollabPurpose | null {
  const normalized = normalizeString(rawPurpose).toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'design' || normalized === 'notes')
    return normalized
  return null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const body = (await readBody<CreateCollabResourceBody>(event).catch(() => ({} as CreateCollabResourceBody))) || {}
  const kind = normalizeCollabKind(body.kind)
  const purpose = normalizeCollabPurpose(body.purpose)
  const title = normalizeString(body.title)
  const requestMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40087)
  }

  if (!kind) {
    setResponseStatus(event, 400)
    return fail('kind 仅支持 markdown 或 draw。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40088)
  }

  if (body.purpose !== undefined && !purpose) {
    setResponseStatus(event, 400)
    return fail('purpose 仅支持 workflow / freeform / design / notes。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40089)
  }

  if (
    purpose
    && ((purpose === 'notes' && kind !== 'markdown')
      || ((purpose === 'workflow' || purpose === 'freeform' || purpose === 'design') && kind !== 'draw'))
  ) {
    setResponseStatus(event, 400)
    return fail('协作用途与资源形态不匹配。markdown 仅支持 notes，draw 仅支持 workflow / freeform / design。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40090)
  }

  try {
    const created = await withTransaction(event, async (db) => {
      const projectResult = await db.query<ProjectWorkspaceRow>(
        `SELECT workspace_id
         FROM projects
         WHERE id = $1
         LIMIT 1`,
        [projectId],
      )

      const workspaceId = normalizeString(projectResult.rows[0]?.workspace_id)
      if (!workspaceId)
        throw new Error('PROJECT_NOT_FOUND')

      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const result = purpose === 'workflow'
        ? await ensureProjectWorkflowCanvas(db, {
            projectId,
            actorUserId: user.id,
            title,
          })
        : await createProjectCollabResource(db, {
            projectId,
            actorUserId: user.id,
            kind,
            purpose: purpose || undefined,
            title,
            parentResourceId: normalizeString(body.parentResourceId) || undefined,
            metadata: {
              ...requestMetadata,
              ...(normalizeString(body.drawMode) ? { drawMode: normalizeString(body.drawMode) } : {}),
              ...(normalizeString(body.sceneSourceType) ? { sceneSourceType: normalizeString(body.sceneSourceType) } : {}),
              ...(normalizeString(body.templateKey) ? { templateKey: normalizeString(body.templateKey) } : {}),
              ...(normalizeString(body.editorEngine) ? { editorEngine: normalizeString(body.editorEngine) } : {}),
              ...(purpose === 'design'
                ? {
                    drawMode: normalizeString(body.drawMode || requestMetadata.drawMode) || 'composition',
                    sceneSourceType: normalizeString(body.sceneSourceType || requestMetadata.sceneSourceType) || 'image_mockup',
                    templateKey: normalizeString(body.templateKey || requestMetadata.templateKey) || 'device-showcase',
                    editorEngine: normalizeString(body.editorEngine || requestMetadata.editorEngine) || 'vueflow',
                  }
                : {}),
            },
          })

      return {
        ...result,
        workspaceId: access.workspaceId,
      }
    })

    await Promise.allSettled([
      emitRealtimeEvent({
        type: 'project.resources.changed',
        workspaceId: created.workspaceId,
        projectId,
      }),
      emitRealtimeEvent({
        type: 'project.outline.changed',
        workspaceId: created.workspaceId,
        projectId,
      }),
    ])

    return ok({
      resource: created.resource,
      snapshot: {
        kind: created.snapshot.kind,
        revision: created.snapshot.revision,
        updateBase64: Buffer.from(created.snapshot.update).toString('base64'),
        updatedAt: created.snapshot.updatedAt,
      },
    }, {
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
      }, 40490)
    }

    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权创建协作文档或画布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40387)
    }

    if (error instanceof Error && error.message === 'INVALID_COLLAB_PURPOSE') {
      setResponseStatus(event, 400)
      return fail('协作用途与资源形态不匹配。markdown 仅支持 notes，draw 仅支持 workflow / freeform / design。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40091)
    }

    if (error instanceof Error && error.message === 'RESOURCE_PARENT_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标父节点不存在，或不在当前项目内。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40092)
    }

    throw error
  }
})
