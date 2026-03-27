import type { FeishuSyncIssue } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { resolveFeishuSyncIssue } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface IgnoreBody {
  reason?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const issueId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<IgnoreBody>(event).catch(() => ({} as IgnoreBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权忽略飞书关联问题。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40410)
  }

  if (!issueId) {
    setResponseStatus(event, 400)
    return fail('issueId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40107)
  }

  const issue = await withTransaction(event, async (db) => {
    return resolveFeishuSyncIssue(db, {
      actorUserId: user.id,
      issueId,
      resolution: 'ignored',
      resolutionPayload: {
        reason: String(body.reason || '').trim(),
      },
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
    }, 40411)
  }

  return ok<FeishuSyncIssue>(issue, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
