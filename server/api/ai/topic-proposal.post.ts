import type { AiTopicProposalRequest } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { executeTopicProposal, normalizeTopicProposalApiRequest } from '~~/server/services/ai/topic-proposal-service'

function toText(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const rawBody = await readBody<Partial<AiTopicProposalRequest>>(event).catch(() => ({} as Partial<AiTopicProposalRequest>))
  const workspaceId = toText(rawBody?.teamId || rawBody?.workspaceId || rawBody?.context?.teamId || rawBody?.context?.workspaceId)
  const request = normalizeTopicProposalApiRequest(rawBody, workspaceId)

  try {
    const response = await executeTopicProposal(event, {
      user,
      request,
    })

    return ok(response.result, response.meta, response.meta.fallbackUsed ? 'fallback used' : 'ok')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'TOPIC_PROPOSAL_FAILED'

    if (message === 'TOPIC_PROPOSAL_WORKSPACE_REQUIRED') {
      setResponseStatus(event, 400)
      return fail('调用选题助手时必须传 teamId。', {
        startedAt: Date.now(),
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40073)
    }

    if (message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt: Date.now(),
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40477)
    }

    if (message === 'TOPIC_PROPOSAL_FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权使用该空间。', {
        startedAt: Date.now(),
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40374)
    }

    if (message === 'TOPIC_PROPOSAL_SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('会话不存在，请刷新后重试。', {
        startedAt: Date.now(),
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40473)
    }

    if (message === 'TOPIC_PROPOSAL_QUOTA_EXCEEDED') {
      setResponseStatus(event, 429)
      return fail('Team AI 额度不足，请扩容或等待重置。', {
        startedAt: Date.now(),
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 42973)
    }

    throw error
  }
})
