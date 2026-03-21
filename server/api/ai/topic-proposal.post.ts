import type { AiTopicProposalRequest, AiTopicProposalResult, Resource } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { searchWithTavily } from '~~/server/services/admin-ai/web'
import { runTopicProposalFallback } from '~~/server/services/ai/fallback'
import { runTopicProposalChain } from '~~/server/services/ai/topic-proposal-chain'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  appendAiChatMessage,
  createAiChatSession,
  getAiChatSessionById,
  patchAiChatSessionContext,
} from '~~/server/utils/chat-store'
import {
  getContestDetail,
  listContestResourcesByContestId,
  recordContestAuditLog,
  resolveAiPromptText,
} from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { listSucceededResourceDocumentsByContest } from '~~/server/utils/document-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { consumeAiQuota, hasWorkspaceMembership } from '~~/server/utils/platform-store'
import { runWithRetry } from '~~/server/utils/retry'

function normalizeTopK(raw: unknown): number {
  const value = Number(raw)
  if (!Number.isFinite(value))
    return 3
  return Math.max(1, Math.min(5, Math.round(value)))
}

function buildSessionTitle(contestName: string, trackName: string): string {
  const left = contestName.trim()
  const right = trackName.trim()
  if (left && right)
    return `选题助手 · ${left} · ${right}`
  if (left)
    return `选题助手 · ${left}`
  return '选题助手'
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRequest(body: Partial<AiTopicProposalRequest> | null | undefined, workspaceId: string): AiTopicProposalRequest {
  return {
    workspaceId,
    sessionId: toText(body?.sessionId),
    messages: Array.isArray(body?.messages) ? body!.messages! : [],
    topK: normalizeTopK(body?.topK),
    aiOptions: {
      reasoningEnabled: typeof body?.aiOptions?.reasoningEnabled === 'boolean' ? body.aiOptions.reasoningEnabled : undefined,
      networkEnabled: typeof body?.aiOptions?.networkEnabled === 'boolean' ? body.aiOptions.networkEnabled : undefined,
      temperature: Number.isFinite(Number(body?.aiOptions?.temperature)) ? Number(body?.aiOptions?.temperature) : undefined,
    },
    context: {
      workspaceId,
      contestId: toText(body?.context?.contestId),
      trackId: toText(body?.context?.trackId),
      major: toText(body?.context?.major),
    },
  }
}

function summarizeResources(resources: Resource[], limit = 8): string {
  if (resources.length === 0)
    return '暂无站内资料。'

  return resources.slice(0, limit).map((item, index) => {
    const summary = toText(item.summary || item.content).slice(0, 160)
    return `${index + 1}. [${item.category}] ${item.title}（${item.year}）\n${summary}`
  }).join('\n')
}

function summarizeDocumentAnalyses(input: Awaited<ReturnType<typeof listSucceededResourceDocumentsByContest>>): string {
  if (input.length === 0)
    return '暂无已解析文档。'

  const lines: string[] = []
  for (const document of input) {
    const analysis = document.annotationJson || document.analysisJson
    if (!analysis?.pages?.length)
      continue
    const firstPage = analysis.pages[0]
    const sampleBlocks = (firstPage?.blocks || []).slice(0, 4).map(item => item.text).filter(Boolean)
    if (sampleBlocks.length === 0)
      continue
    lines.push(`- ${document.fileName}: ${sampleBlocks.join(' | ').slice(0, 280)}`)
  }
  return lines.length > 0 ? lines.join('\n') : '暂无可用文档文本。'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const rawBody = await readBody<Partial<AiTopicProposalRequest>>(event).catch(() => ({} as Partial<AiTopicProposalRequest>))
  const workspaceId = toText(rawBody?.workspaceId || rawBody?.context?.workspaceId)
  const request = normalizeRequest(rawBody, workspaceId)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用选题助手时必须传 workspaceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40073)
  }

  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )

  const contextBundle = request.context.contestId
    ? await withClient(event, async (db) => {
        const detail = await getContestDetail(db, {
          contestId: request.context.contestId || '',
          includeInternal,
        })
        const injectedPrompt = await resolveAiPromptText(db, {
          contestId: request.context.contestId,
          trackId: request.context.trackId,
          target: 'topic_proposal',
        })

        const resources = await listContestResourcesByContestId(db, {
          contestId: request.context.contestId || '',
          includeInternal,
        })
        const documents = await listSucceededResourceDocumentsByContest(db, {
          contestId: request.context.contestId || '',
          limit: 6,
        })

        return {
          detail,
          injectedPrompt,
          resources,
          documents,
        }
      })
    : {
        detail: null,
        injectedPrompt: '',
        resources: [] as Resource[],
        documents: [],
      }

  const contest = contextBundle.detail?.contest
  const track = contest?.tracks.find(item => item.id === request.context.trackId)
  const latestUserMessage = [...request.messages]
    .reverse()
    .find(item => item.role === 'user')
    ?.content
    ?.trim() || ''

  const localContext = [
    `竞赛资料摘要：\n${summarizeResources(contextBundle.resources)}`,
    `文档解析摘要：\n${summarizeDocumentAnalyses(contextBundle.documents)}`,
  ].join('\n\n')

  let webSearchEnabled = Boolean(runtime.adminAi.tavilyApiKey)
  const webReferences: AiTopicProposalResult['references'] = []
  let webContext = '外网检索未启用。'
  if (webSearchEnabled) {
    const webQuery = latestUserMessage
      || [contest?.name, track?.name, request.context.major].filter(Boolean).join(' ')
      || '竞赛选题建议'
    try {
      const webResults = await searchWithTavily({
        query: webQuery,
        tavilyApiKey: runtime.adminAi.tavilyApiKey,
        maxResults: runtime.adminAi.maxWebResults,
        timeoutMs: runtime.adminAi.webTimeoutMs,
      })
      for (const item of webResults) {
        webReferences.push({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
        })
      }
      webContext = webResults.length > 0
        ? webResults.map((item, index) => `${index + 1}. ${item.title}\n${item.url}\n${item.snippet}`).join('\n')
        : '未检索到外网结果。'
    }
    catch {
      webSearchEnabled = false
      webContext = '外网检索失败，已降级为站内检索结果。'
    }
  }

  const activeSession = await withTransaction(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    if (request.sessionId) {
      const existing = await getAiChatSessionById(db, {
        workspaceId,
        sessionId: request.sessionId,
      })
      if (!existing)
        throw new Error('SESSION_NOT_FOUND')
      await patchAiChatSessionContext(db, {
        workspaceId,
        sessionId: request.sessionId,
        contestId: request.context.contestId,
        trackId: request.context.trackId,
        major: request.context.major,
      })
      return existing
    }

    return createAiChatSession(db, {
      workspaceId,
      createdByUserId: user.id,
      title: buildSessionTitle(contest?.name || '', track?.name || ''),
      contestId: request.context.contestId,
      trackId: request.context.trackId,
      major: request.context.major,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    throw error
  })

  if (!activeSession) {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40373)
  }

  if (activeSession === 'SESSION_NOT_FOUND') {
    return fail('会话不存在，请刷新后重试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40473)
  }

  const quotaResult = await withTransaction(event, async (db) => {
    const canUseWorkspace = await hasWorkspaceMembership(db, user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    return consumeAiQuota(db, {
      workspaceId,
      userId: user.id,
      route: '/api/ai/topic-proposal',
      units: 1,
    })
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return null
    }
    throw error
  })

  if (!quotaResult) {
    return fail('当前用户无权使用该空间。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40374)
  }

  if (!quotaResult.allowed) {
    setResponseStatus(event, 429)
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42973)
  }

  const effectiveAiConfig = {
    ...runtime.ai,
    temperature: Number.isFinite(Number(request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(request.aiOptions?.temperature)))
      : runtime.ai.temperature,
  }

  const onlyFallback = effectiveAiConfig.provider === 'mock' || !effectiveAiConfig.apiKey
  const result = onlyFallback
    ? {
        data: runTopicProposalFallback(request),
        fallbackUsed: true,
        attempts: 1,
      }
    : await runWithRetry({
        maxRetries: runtime.ai.maxRetries,
        run: () => runTopicProposalChain({
          request,
          ai: effectiveAiConfig,
          contestName: contest?.name,
          trackName: track?.name,
          injectedPrompt: contextBundle.injectedPrompt,
          localContext,
          webContext,
        }),
        fallback: () => runTopicProposalFallback(request),
      })

  result.data.references = webReferences
  result.data.webSearchEnabled = webSearchEnabled
  result.data.sessionId = activeSession.id

  await withTransaction(event, async (db) => {
    const modeMetadata = {
      mode: 'topic_proposal',
      webSearchEnabled,
    }

    if (latestUserMessage) {
      await appendAiChatMessage(db, {
        workspaceId,
        sessionId: activeSession.id,
        role: 'user',
        content: latestUserMessage,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        metadata: modeMetadata,
        createdByUserId: user.id,
      })
    }

    await appendAiChatMessage(db, {
      workspaceId,
      sessionId: activeSession.id,
      role: 'assistant',
      content: result.data.assistantReply,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: result.fallbackUsed,
      metadata: modeMetadata,
      createdByUserId: user.id,
    })

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: activeSession.id,
      contestId: request.context.contestId,
      trackId: request.context.trackId,
      major: request.context.major,
      title: buildSessionTitle(contest?.name || '', track?.name || ''),
    })

    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.topic_proposal',
      contestId: request.context.contestId,
      payload: {
        sessionId: activeSession.id,
        trackId: request.context.trackId,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
        webSearchEnabled,
      },
    })
  })

  return ok(result.data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  }, result.fallbackUsed ? 'fallback used' : 'ok')
})
