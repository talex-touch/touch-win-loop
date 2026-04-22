import type { DefenseRealtimeBootstrapPayload } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { getAiChatSessionById } from '~~/server/utils/chat-store'
import { withTransaction } from '~~/server/utils/db'
import {
  buildDefenseRealtimePersonaPack,
  normalizeDefenseRealtimeMediaMode,
  normalizeDefenseRealtimeProvider,
  normalizeDefenseRealtimeSessionMeta,
  resolveDefenseRealtimeQwenApiKey,
} from '~~/server/utils/defense-realtime'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import {
  getProjectDefenseSessionState,
  listProjectDefensePersonas,
  listProjectDefensePersonasByIds,
  upsertProjectDefenseSessionState,
} from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function createQwenTemporaryToken(apiKey: string): Promise<{ token: string, expiresAt: string | null }> {
  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/tokens?expire_in_seconds=1800', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  const payload = await response.json().catch(() => ({} as Record<string, unknown>))
  const token = normalizeString(payload?.token)
  if (!response.ok || !token)
    throw new Error(normalizeString(payload?.message) || '千问临时鉴权 Token 生成失败。')

  const expiresAt = Number(payload?.expires_at)
  return {
    token,
    expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt * 1000).toISOString() : null,
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = normalizeString(getRouterParam(event, 'id'))
  const sessionId = normalizeString(getRouterParam(event, 'sessionId'))

  if (!projectId || !sessionId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 sessionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40107)
  }

  try {
    const payload = await withTransaction(event, async (db) => {
      const access = await resolveProjectRealtimeAccess(db, user, projectId)
      if (!access)
        throw new Error('FORBIDDEN')

      const session = await getAiChatSessionById(db, {
        workspaceId: access.workspaceId,
        sessionId,
        projectId,
        mode: 'defense',
        strictScope: true,
      })
      if (!session)
        throw new Error('NOT_FOUND')

      const state = await getProjectDefenseSessionState(db, { sessionId })
      if (!state)
        throw new Error('NOT_FOUND')

      const provider = normalizeDefenseRealtimeProvider(state.realtime?.provider)
      const mediaMode = normalizeDefenseRealtimeMediaMode(state.realtime?.mediaMode)
      const meetingId = normalizeString(state.linkedMeetingId)
      if (!meetingId)
        throw new Error('NOT_FOUND')

      const personas = state.selectedPersonaIds.length > 0
        ? await listProjectDefensePersonasByIds(db, {
            projectId,
            personaIds: state.selectedPersonaIds,
          })
        : await listProjectDefensePersonas(db, { projectId })

      const personaPack = buildDefenseRealtimePersonaPack({
        sessionId,
        projectId,
        state,
        personas,
      })

      const nextRealtime = normalizeDefenseRealtimeSessionMeta({
        ...state.realtime,
        provider,
        mediaMode,
        linkedMeetingId: meetingId,
        bootstrapState: 'ready',
        connectionState: 'bootstrapping',
        transport: provider === 'coze' ? 'rtc_sidecar' : 'websocket',
      })

      let payload: DefenseRealtimeBootstrapPayload = {
        sessionId,
        meetingId,
        provider,
        mediaMode,
        transport: nextRealtime.transport,
        issuedAt: new Date().toISOString(),
        expiresAt: null,
        personaPack,
        qwen: null,
        coze: null,
      }

      if (provider === 'qwen') {
        const qwenApiKey = resolveDefenseRealtimeQwenApiKey(runtime)
        if (!qwenApiKey)
          throw new Error('QWEN_CONFIG_MISSING')

        const tokenResult = await createQwenTemporaryToken(qwenApiKey)
        payload = {
          ...payload,
          expiresAt: tokenResult.expiresAt,
          qwen: {
            baseWsUrl: runtime.defenseRealtime.qwen.baseWsUrl,
            workspaceId: runtime.defenseRealtime.qwen.workspaceId,
            appId: runtime.defenseRealtime.qwen.appId,
            voice: runtime.defenseRealtime.qwen.voice,
            frameIntervalMs: runtime.defenseRealtime.qwen.frameIntervalMs,
            accessToken: tokenResult.token,
            connectionUrl: `${runtime.apiBaseUrl.replace(/\/$/, '')}/projects/${projectId}/defense/realtime-sessions/${sessionId}/qwen-relay`,
          },
        }
      }
      else {
        const accessToken = runtime.defenseRealtime.coze.authMode === 'oauth'
          ? normalizeString(runtime.defenseRealtime.coze.patOrOauthSecret)
          : ''
        if (!normalizeString(runtime.defenseRealtime.coze.botId) || !normalizeString(runtime.defenseRealtime.coze.connectorId) || !accessToken)
          throw new Error('COZE_CONFIG_MISSING')

        const conversationId = normalizeString(nextRealtime.conversationId) || randomUUID()
        payload = {
          ...payload,
          coze: {
            baseUrl: runtime.defenseRealtime.coze.baseUrl,
            accessToken,
            botId: runtime.defenseRealtime.coze.botId,
            connectorId: runtime.defenseRealtime.coze.connectorId,
            voiceId: runtime.defenseRealtime.coze.voiceId,
            conversationId,
            roomInfo: null,
          },
        }
        nextRealtime.conversationId = conversationId
      }

      const updatedState = await upsertProjectDefenseSessionState(db, {
        sessionId,
        projectId,
        workspaceId: access.workspaceId,
        currentStage: state.currentStage,
        turnCount: state.turnCount,
        selectedPersonaIds: state.selectedPersonaIds,
        summaryStatus: state.summaryStatus,
        summaryResourceId: state.summaryResourceId || null,
        linkedMeetingId: state.linkedMeetingId || null,
        lastInputMode: state.lastInputMode,
        lastContextPack: state.lastContextPack || {},
        lastScorecard: state.lastScorecard || null,
        realtime: nextRealtime,
      })

      return {
        payload,
        state: updatedState,
        session,
      }
    })

    return ok({
      bootstrap: payload.payload,
      state: payload.state,
      session: payload.session,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权访问答辩实时会话。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40406)
    }
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('答辩实时会话不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40506)
    }
    if (error instanceof Error && error.message === 'QWEN_CONFIG_MISSING') {
      setResponseStatus(event, 503)
      return fail('千问实时音视频未完成配置。请在后台 AI 配置中将 defense 渠道绑定到百炼 DashScope provider，并确保该 provider 已配置可用 apiKey。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50398)
    }
    if (error instanceof Error && error.message === 'COZE_CONFIG_MISSING') {
      setResponseStatus(event, 503)
      return fail('Coze 实时音视频未完成配置，当前仅支持 OAuth relay Token。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50399)
    }
    throw error
  }
})
