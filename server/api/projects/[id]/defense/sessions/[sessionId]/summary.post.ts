import type { AiDefenseStage, AiDefenseSummaryType, ChatMessage } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { summarizeDefenseSessionByAi } from '~~/server/services/ai/defense-summary'
import { syncProjectDefenseSummaryNotes } from '~~/server/services/ai/defense-summary-notes'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById, listAiChatMessagesBySession } from '~~/server/utils/chat-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import {
  getProjectDefenseSessionState,
  listProjectDefenseLatestSessionSummaries,
  listProjectDefenseTurnsBySession,
  upsertProjectDefenseSessionState,
  upsertProjectDefenseSummary,
} from '~~/server/utils/project-defense-store'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

interface CreateDefenseSummaryBody {
  summaryType?: AiDefenseSummaryType
  turnIndex?: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSummaryType(value: unknown): AiDefenseSummaryType {
  return normalizeString(value) === 'turn' ? 'turn' : 'session'
}

function toChatMessages(messages: Awaited<ReturnType<typeof listAiChatMessagesBySession>>): ChatMessage[] {
  return messages.map(item => ({
    role: item.role,
    content: item.content,
  }))
}

function buildProjectDefenseNotesMarkdown(records: Array<{ summary: Awaited<ReturnType<typeof upsertProjectDefenseSummary>>, sessionTitle: string }>): string {
  const sections = ['# 模拟答辩总结汇总', '']
  for (const record of records) {
    sections.push(`## ${record.sessionTitle}`)
    sections.push(record.summary.markdown || record.summary.summary)
    sections.push('')
  }
  return sections.join('\n')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const channelRuntime = resolveAiRuntimeForChannel(runtime, 'defense')
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))
  const body = await readBody<CreateDefenseSummaryBody>(event).catch(() => ({} as CreateDefenseSummaryBody))
  const summaryType = normalizeSummaryType(body?.summaryType)

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40104)
  }

  const scope = await withClient(event, async (db) => {
    const access = await resolveProjectRealtimeAccess(db, user, projectId)
    if (!access)
      return null

    const session = await getAiChatSessionById(db, {
      workspaceId: access.workspaceId,
      sessionId,
      projectId,
      mode: 'defense',
      strictScope: true,
    })
    if (!session)
      return 'NOT_FOUND' as const

    return {
      workspaceId: access.workspaceId,
      session,
    }
  })

  if (!scope) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问该项目答辩会话。', {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40403)
  }
  if (scope === 'NOT_FOUND') {
    setResponseStatus(event, 404)
    return fail('答辩会话不存在。', {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40503)
  }

  const currentState = await withTransaction(event, async (db) => {
    const state = await getProjectDefenseSessionState(db, { sessionId })
    await upsertProjectDefenseSessionState(db, {
      sessionId,
      projectId,
      workspaceId: scope.workspaceId,
      currentStage: state?.currentStage || 'opening',
      turnCount: state?.turnCount || 0,
      selectedPersonaIds: state?.selectedPersonaIds || [],
      summaryStatus: 'processing',
      summaryResourceId: state?.summaryResourceId || null,
      linkedMeetingId: state?.linkedMeetingId || null,
      lastInputMode: state?.lastInputMode || 'text',
      lastContextPack: state?.lastContextPack || {},
      lastScorecard: state?.lastScorecard || null,
    })
    return state
  })

  try {
    const payload = await withClient(event, async (db) => {
      const turns = await listProjectDefenseTurnsBySession(db, { sessionId })
      if (turns.length === 0)
        throw new Error('EMPTY_TURNS')

      const targetTurnIndex = summaryType === 'turn'
        ? Math.max(1, Number(body?.turnIndex || currentState?.turnCount || turns[turns.length - 1]?.turnIndex || 1))
        : undefined
      const scopedTurns = targetTurnIndex
        ? turns.filter(item => item.turnIndex === targetTurnIndex)
        : turns
      const chatMessages = await listAiChatMessagesBySession(db, {
        workspaceId: scope.workspaceId,
        sessionId,
        projectId,
        mode: 'defense',
        strictScope: true,
        limit: 200,
      })

      const summaryResult = await summarizeDefenseSessionByAi({
        sessionTitle: scope.session.title,
        currentStage: (currentState?.currentStage || 'opening') as AiDefenseStage,
        turnCount: currentState?.turnCount || turns[turns.length - 1]?.turnIndex || 0,
        turns: scopedTurns,
        scorecard: currentState?.lastScorecard || null,
        messages: toChatMessages(chatMessages),
        ai: channelRuntime.ai,
      })

      return {
        turns,
        summaryResult,
        targetTurnIndex,
      }
    })

    const summary = await withTransaction(event, async (db) => {
      let resourceId = currentState?.summaryResourceId || null
      let summaryRecord = await upsertProjectDefenseSummary(db, {
        sessionId,
        projectId,
        summaryType,
        turnIndex: payload.targetTurnIndex,
        status: 'completed',
        summary: payload.summaryResult.summary,
        strengths: payload.summaryResult.strengths,
        risks: payload.summaryResult.risks,
        actionItems: payload.summaryResult.actionItems,
        evidenceGaps: payload.summaryResult.evidenceGaps,
        markdown: payload.summaryResult.markdown,
        resourceId,
        actorUserId: user.id,
      })

      if (summaryType === 'session') {
        const latestSummaries = await listProjectDefenseLatestSessionSummaries(db, {
          projectId,
          limit: 20,
        })
        resourceId = await syncProjectDefenseSummaryNotes(db, {
          projectId,
          actorUserId: user.id,
          resourceId,
          markdown: buildProjectDefenseNotesMarkdown(latestSummaries),
        })
        summaryRecord = await upsertProjectDefenseSummary(db, {
          sessionId,
          projectId,
          summaryType,
          turnIndex: payload.targetTurnIndex,
          status: 'completed',
          summary: payload.summaryResult.summary,
          strengths: payload.summaryResult.strengths,
          risks: payload.summaryResult.risks,
          actionItems: payload.summaryResult.actionItems,
          evidenceGaps: payload.summaryResult.evidenceGaps,
          markdown: payload.summaryResult.markdown,
          resourceId,
          actorUserId: user.id,
        })
      }

      await upsertProjectDefenseSessionState(db, {
        sessionId,
        projectId,
        workspaceId: scope.workspaceId,
        currentStage: currentState?.currentStage || 'opening',
        turnCount: currentState?.turnCount || payload.turns[payload.turns.length - 1]?.turnIndex || 0,
        selectedPersonaIds: currentState?.selectedPersonaIds || [],
        summaryStatus: 'completed',
        summaryResourceId: resourceId,
        linkedMeetingId: currentState?.linkedMeetingId || null,
        lastInputMode: currentState?.lastInputMode || 'text',
        lastContextPack: currentState?.lastContextPack || {},
        lastScorecard: currentState?.lastScorecard || null,
      })

      return summaryRecord
    })

    return ok({
      item: summary,
    }, {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    await withTransaction(event, async (db) => {
      await upsertProjectDefenseSessionState(db, {
        sessionId,
        projectId,
        workspaceId: scope.workspaceId,
        currentStage: currentState?.currentStage || 'opening',
        turnCount: currentState?.turnCount || 0,
        selectedPersonaIds: currentState?.selectedPersonaIds || [],
        summaryStatus: 'failed',
        summaryResourceId: currentState?.summaryResourceId || null,
        linkedMeetingId: currentState?.linkedMeetingId || null,
        lastInputMode: currentState?.lastInputMode || 'text',
        lastContextPack: currentState?.lastContextPack || {},
        lastScorecard: currentState?.lastScorecard || null,
      })
    }).catch(() => {})

    if (error instanceof Error && error.message === 'EMPTY_TURNS') {
      setResponseStatus(event, 400)
      return fail('当前会话还没有结构化答辩轮次，暂时无法生成总结。', {
        startedAt,
        provider: channelRuntime.ai.provider,
        model: channelRuntime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40504)
    }
    throw error
  }
})
