import type { ResourceAvailability, ResourceCategory, ResourceStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { patchAdminResource } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PatchResourceBody {
  resourceId?: string
  category?: ResourceCategory
  title?: string
  year?: number
  url?: string
  accessLevel?: ResourceAvailability
  sourceType?: string
  summary?: string
  content?: string
  metadata?: Record<string, unknown>
  copyrightNote?: string
  status?: ResourceStatus
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''
  const body = await readBody<PatchResourceBody>(event)

  if (!contestId || !body?.resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40082)
  }

  const hasUrlField = body?.url !== undefined
  const hasContentField = body?.content !== undefined
  const isUrlEmpty = !String(body?.url || '').trim()
  const isContentEmpty = !String(body?.content || '').trim()
  if (hasUrlField && hasContentField && isUrlEmpty && isContentEmpty) {
    setResponseStatus(event, 400)
    return fail('url 与 content 不能同时为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400821)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑资料。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40382)
  }

  const resource = await withTransaction(event, async (db) => {
    return patchAdminResource(db, {
      actorUserId: user.id,
      contestId,
      resourceId: body.resourceId!,
      patch: {
        category: body?.category,
        title: body?.title,
        year: body?.year,
        url: body?.url,
        accessLevel: body?.accessLevel,
        sourceType: body?.sourceType,
        summary: body?.summary,
        content: body?.content,
        metadata: body?.metadata,
        copyrightNote: body?.copyrightNote,
        status: body?.status,
      },
    })
  })

  if (!resource) {
    setResponseStatus(event, 404)
    return fail('resource not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40482)
  }

  return ok(resource, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
