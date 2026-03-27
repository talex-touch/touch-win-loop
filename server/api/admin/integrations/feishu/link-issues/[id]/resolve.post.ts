import type { FeishuSyncIssue } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { resolveFeishuSyncIssue } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ResolveBody {
  resolutionPayload?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const issueId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<ResolveBody>(event).catch(() => ({} as ResolveBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权处理飞书关联问题。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40408)
  }

  if (!issueId) {
    setResponseStatus(event, 400)
    return fail('issueId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40106)
  }

  const issue = await withTransaction(event, async (db) => {
    return resolveFeishuSyncIssue(db, {
      actorUserId: user.id,
      issueId,
      resolution: 'manual_bind',
      resolutionPayload: body.resolutionPayload || {},
    })
  })
  if (!issue) {
    setResponseStatus(event, 404)
    return fail('关联问题不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40409)
  }

  return ok<FeishuSyncIssue>(issue, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
