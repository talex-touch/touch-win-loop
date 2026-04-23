import type { ResourceAvailability, ResourceCategory, ResourceStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { createAdminResource } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { enqueueResourceGovernanceTask } from '~~/server/utils/resource-knowledge-store'

interface CreateResourceBody {
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
  const body = await readBody<CreateResourceBody>(event)

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40080)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权新增资料。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40380)
  }

  if (!body?.category || !body?.title) {
    setResponseStatus(event, 400)
    return fail('category/title 为必填。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40081)
  }

  if (!String(body?.url || '').trim() && !String(body?.content || '').trim()) {
    setResponseStatus(event, 400)
    return fail('url 与 content 至少填写一个。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400811)
  }

  let resource
  try {
    resource = await withTransaction(event, async (db) => {
      const created = await createAdminResource(db, {
        actorUserId: user.id,
        contestId,
        category: body.category!,
        title: body.title!,
        year: Number(body?.year || new Date().getFullYear()),
        url: body?.url,
        accessLevel: body?.accessLevel,
        sourceType: body?.sourceType,
        summary: body?.summary,
        content: body?.content,
        metadata: body?.metadata,
        copyrightNote: body?.copyrightNote,
        status: body?.status,
      })
      await enqueueResourceGovernanceTask(db, {
        contestId,
        resourceId: created.id,
        taskType: 'profile_analyze',
        actorUserId: user.id,
      })
      return created
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'CONTEST_RELEASE_WORKFLOW_REQUIRED') {
      setResponseStatus(event, 409)
      return fail('当前赛事已接入版本流，请通过“审核/版本”生成新版本后再发布。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40980)
    }
    throw error
  }

  return ok(resource, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
