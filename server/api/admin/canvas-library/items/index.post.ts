import type {
  CanvasLibraryAssetKind,
  CanvasLibraryItemKind,
  CanvasLibraryItemPayload,
  CanvasLibraryItemPayloadType,
  CanvasLibraryItemSource,
  CanvasLibraryTemplateTarget,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createCanvasLibraryItem } from '~~/server/utils/canvas-library-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CreateCanvasLibraryItemBody {
  slug?: string
  title?: string
  summary?: string
  kind?: CanvasLibraryItemKind
  templateTarget?: CanvasLibraryTemplateTarget
  assetKind?: CanvasLibraryAssetKind
  tags?: string[]
  cover?: Record<string, unknown> | null
  source?: CanvasLibraryItemSource
  payloadType?: CanvasLibraryItemPayloadType
  payload?: CanvasLibraryItemPayload
  previewPayload?: unknown
  notes?: string
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
    return fail('当前用户无权创建画布资源库条目。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const body = (await readBody<CreateCanvasLibraryItemBody>(event).catch(() => ({} as CreateCanvasLibraryItemBody))) || {}
  if (!normalizeString(body.title) || !normalizeString(body.kind) || !normalizeString(body.payloadType) || body.payload === undefined) {
    setResponseStatus(event, 400)
    return fail('title / kind / payloadType / payload 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40091)
  }

  const created = await withTransaction(event, async (db) => {
    return createCanvasLibraryItem(db, {
      actorUserId: user.id,
      slug: body.slug,
      title: normalizeString(body.title),
      summary: body.summary,
      kind: body.kind as CanvasLibraryItemKind,
      templateTarget: body.templateTarget,
      assetKind: body.assetKind,
      tags: Array.isArray(body.tags) ? body.tags : [],
      cover: body.cover || null,
      source: body.source || 'admin_upload',
      payloadType: body.payloadType as CanvasLibraryItemPayloadType,
      payload: body.payload,
      previewPayload: body.previewPayload,
      notes: body.notes,
      publishNow: Boolean(body.publish),
    })
  })

  return ok(created, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
