import type { CanvasLibraryTemplateTarget } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { publishCanvasLibraryItemFromDesign } from '~~/server/utils/canvas-library-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PublishFromDesignBody {
  projectId?: string
  designResourceId?: string
  scope?: CanvasLibraryTemplateTarget
  pageId?: string
  frameId?: string
  slug?: string
  title?: string
  summary?: string
  tags?: string[]
  publish?: boolean
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWrite = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权从设计资源发布到画布资源库。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  const body = (await readBody<PublishFromDesignBody>(event).catch(() => ({} as PublishFromDesignBody))) || {}
  if (!normalizeString(body.projectId) || !normalizeString(body.designResourceId) || !normalizeString(body.scope)) {
    setResponseStatus(event, 400)
    return fail('projectId / designResourceId / scope 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  const created = await withTransaction(event, async (db) => {
    return publishCanvasLibraryItemFromDesign(db, {
      projectId: normalizeString(body.projectId),
      designResourceId: normalizeString(body.designResourceId),
      actorUserId: user.id,
      scope: body.scope as CanvasLibraryTemplateTarget,
      pageId: body.pageId,
      frameId: body.frameId,
      slug: body.slug,
      title: body.title,
      summary: body.summary,
      tags: Array.isArray(body.tags) ? body.tags : [],
      publishNow: Boolean(body.publish),
    })
  }).catch((error) => {
    if (error instanceof Error && (
      error.message === 'DESIGN_RESOURCE_NOT_FOUND'
      || error.message === 'DESIGN_RESOURCE_SNAPSHOT_NOT_FOUND'
      || error.message === 'DESIGN_TEMPLATE_SCOPE_NOT_FOUND'
    )) { return null }
    throw error
  })

  if (!created) {
    setResponseStatus(event, 404)
    return fail('设计资源或发布范围不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  return ok(created, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
