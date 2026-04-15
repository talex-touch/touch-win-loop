import type { CanvasLibraryItemKind, CanvasLibraryItemSource, CanvasLibraryItemStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listCanvasLibraryItems } from '~~/server/utils/canvas-library-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canRead = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看画布资源库。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40391)
  }

  const query = getQuery(event)
  const items = await withClient(event, async (db) => {
    return listCanvasLibraryItems(db, {
      status: normalizeString(query.status) as CanvasLibraryItemStatus,
      kind: normalizeString(query.kind) as CanvasLibraryItemKind,
      source: normalizeString(query.source) as CanvasLibraryItemSource,
      search: normalizeString(query.search),
      tag: normalizeString(query.tag),
    })
  })

  return ok(items, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
