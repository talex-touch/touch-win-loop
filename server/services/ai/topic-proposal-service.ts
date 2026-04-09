import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { AiTopicProposalRequest, AiTopicProposalResult, AuthUser, ChatMessage, Resource } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { searchWithTavily } from '~~/server/services/admin-ai/web'
import { runTopicProposalFallback } from '~~/server/services/ai/fallback'
import { buildProjectResourceLocalContext, loadVisibleProjectResourcesForAi } from '~~/server/services/ai/project-resource-context'
import { buildTopicBoardPromptMessage, enrichTopicProposalResult, normalizeTopicBoardInput } from '~~/server/services/ai/topic-board-logic'
import { runTopicProposalChain } from '~~/server/services/ai/topic-proposal-chain'
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
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { buildMergedPrompt, resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

interface ContestTrendRow {
  year: number
  summary: string
  hot_tags: string[] | null
  evidence_sources: string[] | null
}

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

function summarizeText(value: unknown, max = 160): string {
  const normalized = toText(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values))
    return []

  const dedupe = new Set<string>()
  const result: string[] = []
  for (const item of values) {
    const normalized = toText(item)
    if (!normalized)
      continue
    const key = normalized.toLowerCase()
    if (dedupe.has(key))
      continue
    dedupe.add(key)
    result.push(normalized)
  }
  return result
}

function normalizeChatRole(value: unknown): ChatMessage['role'] | '' {
  const normalized = toText(value)
  if (normalized === 'system' || normalized === 'assistant' || normalized === 'user')
    return normalized
  return ''
}

function normalizeMessages(values: unknown): ChatMessage[] {
  if (!Array.isArray(values))
    return []

  const result: ChatMessage[] = []
  for (const item of values) {
    const role = normalizeChatRole(item && typeof item === 'object' ? (item as { role?: unknown }).role : '')
    const content = toText(item && typeof item === 'object' ? (item as { content?: unknown }).content : '')
    if (!role || !content)
      continue
    result.push({ role, content })
  }
  return result
}

function buildContestResourceContext(resources: Resource[], trackName: string, major: string, trendRows: Array<{
  year: number
  summary: string
  hotTags: string[]
}>): string {
  const focusCategories = new Set([
    'awarded_works',
    'past_questions',
    'track_details',
    'judge_guidelines',
    'submission_examples',
    'policy_notice',
    'ai_prompts',
  ])

  const ranked = resources
    .filter(resource => !resource.category || focusCategories.has(String(resource.category)))
    .sort((left, right) => Number(right.year || 0) - Number(left.year || 0))
    .slice(0, 12)

  const resourceLines = ranked.map((resource, index) => {
    const category = toText(resource.category || resource.type || 'contest_resource')
    const year = Number(resource.year || 0) || '未知年份'
    const summary = summarizeText(resource.summary || resource.content || '暂无摘要')
    return `${index + 1}. [${category}] ${resource.title}（${year}）\n${summary}`
  })

  const trendLines = trendRows
    .slice(0, 3)
    .map((trend, index) => `${index + 1}. ${trend.year}：${summarizeText(trend.summary || trend.hotTags.join('、'), 120)}`)

  return [
    `竞赛资料上下文：赛道=${trackName || '未指定'}，专业=${major || '未指定'}`,
    resourceLines.length > 0 ? resourceLines.join('\n') : '暂无命中竞赛资料。',
    trendLines.length > 0 ? `趋势补充：\n${trendLines.join('\n')}` : '暂无趋势记录。',
  ].join('\n')
}

async function listContestTrends(db: Queryable, contestId: string): Promise<Array<{
  year: number
  summary: string
  hotTags: string[]
  evidenceSources: string[]
}>> {
  const result = await db.query<ContestTrendRow>(
    `SELECT
      year,
      summary,
      hot_tags,
      evidence_sources
     FROM contest_trends
     WHERE contest_id = $1
     ORDER BY year DESC, updated_at DESC`,
    [contestId],
  )

  return result.rows.map(row => ({
    year: Number(row.year || 0),
    summary: toText(row.summary),
    hotTags: normalizeStringArray(row.hot_tags),
    evidenceSources: normalizeStringArray(row.evidence_sources),
  }))
}

function normalizeRequest(body: Partial<AiTopicProposalRequest> | null | undefined, workspaceId: string): AiTopicProposalRequest {
  return {
    teamId: workspaceId,
    workspaceId,
    sessionId: toText(body?.sessionId),
    messages: normalizeMessages(body?.messages),
    topK: normalizeTopK(body?.topK),
    aiOptions: {
      reasoningEnabled: typeof body?.aiOptions?.reasoningEnabled === 'boolean' ? body.aiOptions.reasoningEnabled : undefined,
      networkEnabled: typeof body?.aiOptions?.networkEnabled === 'boolean' ? body.aiOptions.networkEnabled : undefined,
      temperature: Number.isFinite(Number(body?.aiOptions?.temperature)) ? Number(body?.aiOptions?.temperature) : undefined,
    },
    context: {
      teamId: workspaceId,
      workspaceId,
      projectId: toText(body?.context?.projectId),
      contestId: toText(body?.context?.contestId),
      trackId: toText(body?.context?.trackId),
      major: toText(body?.context?.major),
      discipline: toText(body?.context?.discipline),
      topicType: toText(body?.context?.topicType),
      expectedDifficulty: toText(body?.context?.expectedDifficulty),
      keywords: normalizeStringArray(body?.context?.keywords),
      teamSkillTags: normalizeStringArray(body?.context?.teamSkillTags),
    },
  }
}

export function normalizeTopicProposalApiRequest(body: Partial<AiTopicProposalRequest> | null | undefined, workspaceId: string): AiTopicProposalRequest {
  return normalizeRequest(body, workspaceId)
}

export async function executeTopicProposal(
  event: H3Event,
  input: {
    user: AuthUser
    request: AiTopicProposalRequest
  },
): Promise<{
  result: AiTopicProposalResult
  meta: {
    startedAt: number
    provider: string
    model: string
    fallbackUsed: boolean
    attempts: number
  }
}> {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'topic_proposal')
  const channelAiConfig = channelRuntime.ai
  const workspaceId = toText(input.request.teamId || input.request.workspaceId || input.request.context.workspaceId || input.request.context.teamId)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    throw new Error('TOPIC_PROPOSAL_WORKSPACE_REQUIRED')
  }

  const boardInput = normalizeTopicBoardInput({
    contestId: input.request.context.contestId,
    trackId: input.request.context.trackId,
    major: input.request.context.major,
    discipline: input.request.context.discipline,
    topicType: input.request.context.topicType,
    expectedDifficulty: input.request.context.expectedDifficulty,
    keywords: input.request.context.keywords,
    teamSkillTags: input.request.context.teamSkillTags,
    candidateCount: input.request.topK || 3,
    source: 'workspace_dashboard',
  })

  const scopeProjectId = toText(input.request.context.projectId)
  const scopeMode = 'dialog_ask' as const
  const existingSession = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, input.user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    if (input.request.sessionId) {
      const existing = await getAiChatSessionById(db, {
        workspaceId,
        sessionId: input.request.sessionId,
        projectId: scopeProjectId,
        mode: scopeMode,
        strictScope: Boolean(scopeProjectId),
      })
      if (!existing)
        throw new Error('SESSION_NOT_FOUND')
      return existing
    }

    return null
  }).catch((error) => {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'SESSION_NOT_FOUND'
    }
    throw error
  })

  if (existingSession === 'FORBIDDEN')
    throw new Error('TOPIC_PROPOSAL_FORBIDDEN')

  if (typeof existingSession === 'string')
    throw new Error('TOPIC_PROPOSAL_SESSION_NOT_FOUND')
  const quotaResult = await withTransaction(event, async (db) => {
    const canUseWorkspace = await teamHasWorkspaceMembership(db, input.user, workspaceId)
    if (!canUseWorkspace)
      throw new Error('FORBIDDEN')

    return teamConsumeAiQuota(db, {
      workspaceId,
      userId: input.user.id,
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

  if (!quotaResult)
    throw new Error('TOPIC_PROPOSAL_FORBIDDEN')

  if (!quotaResult.allowed) {
    setResponseStatus(event, 429)
    throw new Error('TOPIC_PROPOSAL_QUOTA_EXCEEDED')
  }

  const resolvedSession = existingSession || await withTransaction(event, async (db) => {
    return createAiChatSession(db, {
      workspaceId,
      projectId: scopeProjectId,
      mode: scopeMode,
      createdByUserId: input.user.id,
      title: buildSessionTitle('', ''),
      contestId: input.request.context.contestId,
      trackId: input.request.context.trackId,
      major: input.request.context.major,
    })
  })
  const includeInternal = Boolean(
    input.user.isPlatformAdmin
    || await checkPlatformPermission(event, input.user, 'contest.read_internal'),
  )

  const contextBundle = await withClient(event, async (db) => {
    const detail = input.request.context.contestId
      ? await getContestDetail(db, {
          contestId: input.request.context.contestId || '',
          includeInternal,
        })
      : null
    const injectedPrompt = input.request.context.contestId
      ? await resolveAiPromptText(db, {
          contestId: input.request.context.contestId,
          trackId: input.request.context.trackId,
          target: 'topic_proposal',
        })
      : ''

    const projectResources = await loadVisibleProjectResourcesForAi(db, input.user, {
      workspaceId,
      projectId: input.request.context.projectId,
    })

    const contestResources = input.request.context.contestId
      ? await listContestResourcesByContestId(db, {
          contestId: input.request.context.contestId,
          includeInternal,
        })
      : []

    const contestTrends = input.request.context.contestId
      ? await listContestTrends(db, input.request.context.contestId)
      : []

    const contestName = detail?.contest?.name || ''
    const track = detail?.contest?.tracks.find(item => item.id === input.request.context.trackId) || null
    const localProjectContext = buildProjectResourceLocalContext(projectResources, {
      contestName,
      trackName: track?.name || '',
      major: input.request.context.major,
      limit: 10,
    })
    const localContestContext = buildContestResourceContext(
      contestResources,
      track?.name || '',
      input.request.context.major || '',
      contestTrends,
    )

    return {
      detail,
      track,
      injectedPrompt,
      projectResources,
      contestResources,
      contestTrends,
      localContext: [
        localProjectContext,
        localContestContext,
      ].join('\n\n'),
    }
  })

  const contest = contextBundle.detail?.contest
  const track = contextBundle.track || contest?.tracks.find(item => item.id === input.request.context.trackId) || null
  const latestUserMessage = [...input.request.messages]
    .reverse()
    .find(message => message.role === 'user')
    ?.content
    ?.trim() || ''
  const syntheticBoardMessage = buildTopicBoardPromptMessage(boardInput)
  const effectiveUserMessage = latestUserMessage || syntheticBoardMessage

  let webSearchEnabled = Boolean(runtime.adminAi.tavilyApiKey) && input.request.aiOptions?.networkEnabled !== false
  const webReferences: AiTopicProposalResult['references'] = []
  let webContext = '外网检索未启用。'

  if (webSearchEnabled) {
    const webQuery = ([
      contest?.name,
      track?.name,
      input.request.context.major,
      ...(boardInput.keywords || []),
      boardInput.topicType,
    ].filter(Boolean).join(' '))
    || effectiveUserMessage
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
      webContext = '外网检索失败，已降级为站内资料模式。'
    }
  }

  const effectiveAiConfig = {
    ...channelAiConfig,
    temperature: Number.isFinite(Number(input.request.aiOptions?.temperature))
      ? Math.max(0, Math.min(1, Number(input.request.aiOptions?.temperature)))
      : channelAiConfig.temperature,
  }
  const mergedInjectedPrompt = buildMergedPrompt(channelRuntime.prompt, contextBundle.injectedPrompt)
  const onlyFallback = effectiveAiConfig.provider === 'mock' || !effectiveAiConfig.apiKey
  const result = onlyFallback
    ? {
        data: runTopicProposalFallback(input.request),
        fallbackUsed: true,
        attempts: 1,
      }
    : await runWithRetry({
        maxRetries: effectiveAiConfig.maxRetries,
        run: () => runTopicProposalChain({
          request: input.request,
          ai: effectiveAiConfig,
          contestName: contest?.name,
          trackName: track?.name,
          injectedPrompt: mergedInjectedPrompt,
          localContext: contextBundle.localContext,
          webContext,
        }),
        fallback: () => runTopicProposalFallback(input.request),
      })

  const baseResult: AiTopicProposalResult = {
    ...result.data,
    references: webReferences,
    webSearchEnabled,
    sessionId: resolvedSession.id,
  }

  const enrichedResult = enrichTopicProposalResult({
    result: baseResult,
    boardInput,
    track,
    projectResources: contextBundle.projectResources,
    contestResources: contextBundle.contestResources,
    contestTrends: contextBundle.contestTrends,
    webReferences,
  })

  await withTransaction(event, async (db) => {
    const modeMetadata = {
      mode: scopeMode,
      sourceMode: 'topic_proposal',
      projectId: scopeProjectId,
      webSearchEnabled,
      channelKey: channelRuntime.key,
      providerId: channelRuntime.provider?.id || null,
      boardInput,
    }

    if (effectiveUserMessage) {
      await appendAiChatMessage(db, {
        workspaceId,
        sessionId: resolvedSession.id,
        role: 'user',
        content: effectiveUserMessage,
        provider: effectiveAiConfig.provider,
        model: effectiveAiConfig.model,
        fallbackUsed: false,
        metadata: modeMetadata,
        createdByUserId: input.user.id,
      })
    }

    await appendAiChatMessage(db, {
      workspaceId,
      sessionId: resolvedSession.id,
      role: 'assistant',
      content: enrichedResult.assistantReply,
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
      fallbackUsed: result.fallbackUsed,
      metadata: modeMetadata,
      createdByUserId: input.user.id,
    })

    await patchAiChatSessionContext(db, {
      workspaceId,
      sessionId: resolvedSession.id,
      projectId: scopeProjectId,
      mode: scopeMode,
      contestId: input.request.context.contestId,
      trackId: input.request.context.trackId,
      major: input.request.context.major,
      title: buildSessionTitle(contest?.name || '', track?.name || ''),
    })

    await recordContestAuditLog(db, {
      actorUserId: input.user.id,
      action: 'ai.invoke.topic_proposal',
      contestId: input.request.context.contestId,
      payload: {
        sessionId: resolvedSession.id,
        projectId: input.request.context.projectId,
        trackId: input.request.context.trackId,
        channelKey: channelRuntime.key,
        providerId: channelRuntime.provider?.id || null,
        fallbackUsed: result.fallbackUsed,
        attempts: result.attempts,
        webSearchEnabled,
        boardInput,
      },
    })
  })

  return {
    result: {
      ...enrichedResult,
      sessionId: resolvedSession.id,
      webSearchEnabled,
    },
    meta: {
      startedAt,
      provider: effectiveAiConfig.provider,
      model: effectiveAiConfig.model,
      fallbackUsed: result.fallbackUsed,
      attempts: result.attempts,
    },
  }
}
