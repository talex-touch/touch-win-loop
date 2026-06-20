import type { AiWorkspaceInlineCompletionAcceptRequest, AiWorkspaceInlineCompletionAcceptResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getWorkspaceInlineCompletionResource } from '~~/server/services/ai/workspace-inline-completion'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRequest(body: Partial<AiWorkspaceInlineCompletionAcceptRequest> | null | undefined): AiWorkspaceInlineCompletionAcceptRequest {
  const workspaceId = toText(body?.teamId || body?.workspaceId)
  return {
    teamId: workspaceId,
    workspaceId,
    projectId: toText(body?.projectId),
    resourceId: toText(body?.resourceId),
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const request = normalizeRequest(await readBody<Partial<AiWorkspaceInlineCompletionAcceptRequest>>(event).catch(() => ({})))

  if (!request.workspaceId || !request.projectId || !request.resourceId) {
    setResponseStatus(event, 400)
    return fail('调用文档自动补齐扣费时必须传 workspaceId、projectId 和 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400911)
  }

  const consumed = await withTransaction(event, async (db) => {
    await getWorkspaceInlineCompletionResource(db, {
      user,
      workspaceId: request.workspaceId || '',
      projectId: request.projectId || '',
      resourceId: request.resourceId || '',
    })

    const quota = await teamConsumeAiQuota(db, {
      workspaceId: request.workspaceId || '',
      userId: user.id,
      route: '/api/ai/workspace/document-completion/accept',
      units: 1,
    })
    if (!quota.allowed)
      throw new Error('QUOTA_EXCEEDED')

    return quota
  }).catch((error) => {
    if (error instanceof Error)
      return error.message
    throw error
  })

  if (typeof consumed === 'string') {
    if (consumed === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权访问该空间。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40398)
    }

    if (consumed === 'PROJECT_NOT_FOUND' || consumed === 'RESOURCE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标文档不存在，请刷新后重试。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40498)
    }

    if (consumed === 'QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return fail('Team AI 额度不足，请扩容或等待重置。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 42997)
    }

    setResponseStatus(event, 400)
    return fail('当前资源不支持自动补齐。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400912)
  }

  return ok<AiWorkspaceInlineCompletionAcceptResult>({
    remainingQuota: consumed.remaining,
    consumedUnits: 1,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
