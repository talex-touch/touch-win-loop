import type {
  CanvasLibraryAssetKind,
  CanvasLibraryItemKind,
  CanvasLibraryItemPayload,
  CanvasLibraryItemPayloadType,
  CanvasLibraryTemplateTarget,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { updateCanvasLibraryItem } from '~~/server/utils/canvas-library-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchCanvasLibraryItemBody {
  slug?: string
  title?: string
  summary?: string
  kind?: CanvasLibraryItemKind
  templateTarget?: CanvasLibraryTemplateTarget | null
  assetKind?: CanvasLibraryAssetKind | null
  tags?: string[]
  cover?: Record<string, unknown> | null
  payloadType?: CanvasLibraryItemPayloadType
  payload?: CanvasLibraryItemPayload
  previewPayload?: unknown
  notes?: string
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
    return fail('当前用户无权编辑画布资源库条目。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  const itemId = normalizeString(getRouterParam(event, 'itemId'))
  const body = (await readBody<PatchCanvasLibraryItemBody>(event).catch(() => ({} as PatchCanvasLibraryItemBody))) || {}
  const detail = await withTransaction(event, async (db) => {
    return updateCanvasLibraryItem(db, {
      itemId,
      actorUserId: user.id,
      slug: body.slug,
      title: body.title,
      summary: body.summary,
      kind: body.kind,
      templateTarget: body.templateTarget,
      assetKind: body.assetKind,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      cover: body.cover,
      payloadType: body.payloadType,
      payload: body.payload,
      previewPayload: body.previewPayload,
      notes: body.notes,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'CANVAS_LIBRARY_ITEM_NOT_FOUND')
      return null
    throw error
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('画布资源库条目不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40492)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
