import type { AiContestFilterRequest, AiContestFilterResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { runContestFilterChain } from '~~/server/services/ai/contest-filter-chain'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { listContestLibrary, recordContestAuditLog, resolveAiPromptText } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { buildMergedPrompt, resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { runWithRetry } from '~~/server/utils/retry'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamConsumeAiQuota } from '~~/server/utils/team-quota-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'contest_filter')
  const activeAiConfig = channelRuntime.ai
  const { user } = await requireAuth(event)
  const request = await readBody<AiContestFilterRequest>(event)
  const includeInternal = Boolean(
    user.isPlatformAdmin
    || await checkPlatformPermission(event, user, 'contest.read_internal'),
  )
  const workspaceId = String(request?.teamId || request?.workspaceId || '').trim()
  const safeRequest: AiContestFilterRequest = {
    teamId: workspaceId,
    workspaceId,
    query: request?.query || '',
    major: request?.major || '',
    filters: request?.filters || {},
    topK: request?.topK || 6,
    contestId: request?.contestId || '',
    trackId: request?.trackId || '',
  }

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('调用 AI 筛选时必须传 teamId。', {
      startedAt,
      provider: activeAiConfig.provider,
      model: activeAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40061)
  }

  if (!isAiRuntimeConfigured(activeAiConfig)) {
    setResponseStatus(event, 503)
    return fail(buildAiNotConfiguredMessage('赛事筛选 AI'), {
      startedAt,
      provider: activeAiConfig.provider,
      model: activeAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50361)
  }

  let quotaResult: { allowed: boolean, remaining: number | null }
  try {
    quotaResult = await withTransaction(event, async (db) => {
      const canUseWorkspace = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canUseWorkspace)
        throw new Error('FORBIDDEN')

      return teamConsumeAiQuota(db, {
        workspaceId,
        userId: user.id,
        route: '/api/ai/contest-filter',
        units: 1,
      })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权使用该空间。', {
        startedAt,
        provider: activeAiConfig.provider,
        model: activeAiConfig.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40361)
    }
    throw error
  }

  if (!quotaResult.allowed) {
    setResponseStatus(event, 429)
    return fail('Team AI 额度不足，请扩容或等待重置。', {
      startedAt,
      provider: activeAiConfig.provider,
      model: activeAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42961)
  }

  const contests = await withClient(event, async (db) => {
    const result = await listContestLibrary(db, {
      includeInternal,
      q: '',
      discipline: '',
      level: '',
      major: '',
      trackType: '',
      keyword: [],
      deliverableType: '',
      timelineStatus: '',
      sort: 'composite',
      page: 1,
      pageSize: 1000,
    })
    return result.items
  })
  const injectedPrompt = await withClient(event, async (db) => {
    return resolveAiPromptText(db, {
      contestId: safeRequest.contestId,
      trackId: safeRequest.trackId,
      target: 'contest_filter',
    })
  })
  let execution: Awaited<ReturnType<typeof runWithPlatformAiChannelFallback<{
    data: AiContestFilterResult
    fallbackUsed: boolean
    attempts: number
  }>>>
  try {
    execution = await runWithPlatformAiChannelFallback(runtime, 'contest_filter', async ({ ai, prompt }) => {
      return runWithRetry({
        maxRetries: ai.maxRetries,
        run: () => runContestFilterChain({
          request: safeRequest,
          contests,
          ai,
          injectedPrompt: buildMergedPrompt(prompt, injectedPrompt),
        }),
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 502)
    return fail(error instanceof Error ? error.message || '赛事筛选 AI 调用失败。' : '赛事筛选 AI 调用失败。', {
      startedAt,
      provider: activeAiConfig.provider,
      model: activeAiConfig.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50261)
  }

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'ai.invoke.contest_filter',
      contestId: safeRequest.contestId,
      payload: {
        trackId: safeRequest.trackId,
        workspaceId,
        channelKey: channelRuntime.key,
        providerId: execution.provider?.id || null,
        fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
        attempts: execution.attemptChain.length,
        attemptChain: execution.attemptChain,
        latencyMs: execution.latencyMs,
      },
    })
  })

  return ok(execution.data.data, {
    startedAt,
    provider: execution.ai.provider,
    model: execution.ai.model,
    fallbackUsed: execution.usedFallback || execution.data.fallbackUsed,
    attempts: execution.attemptChain.length,
  }, 'ok')
})
