import type { RuntimeSettings } from '~~/server/utils/env'
import type { DefenseRealtimeBootstrapPayload, DefenseVoiceRuntimeSelection } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { assertCozeRealtimeConfig, resolveCozeVoiceRuntimeConfig } from '~~/server/services/admin-ai/coze-voice'
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
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
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

function resolveDefenseCozeVoiceProvider(runtime: RuntimeSettings) {
  const registry = resolvePlatformAiRegistry(runtime)
  const providerMap = new Map(registry.providers.map(provider => [provider.id, provider]))
  const defenseChannel = registry.channels.find(item => item.key === 'defense')
  return (defenseChannel?.providerIds || [])
    .map(providerId => providerMap.get(providerId) || null)
    .find(provider => provider?.enabled && provider.type === 'coze-voice') || null
}

function resolveDefenseQwenVoiceProvider(runtime: RuntimeSettings) {
  const registry = resolvePlatformAiRegistry(runtime)
  const providerMap = new Map(registry.providers.map(provider => [provider.id, provider]))
  const defenseChannel = registry.channels.find(item => item.key === 'defense')
  return (defenseChannel?.providerIds || [])
    .map(providerId => providerMap.get(providerId) || null)
    .find(provider => provider?.enabled && provider.type === 'dashscope-bailian' && (provider.capability === 'realtime' || provider.capability === 'voice')) || null
}

function normalizeSelectionArray(value: unknown): DefenseVoiceRuntimeSelection[] {
  if (!Array.isArray(value))
    return []
  return value
    .flatMap((item): DefenseVoiceRuntimeSelection[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return []
      const record = item as Record<string, unknown>
      const personaId = normalizeString(record.personaId || record.persona_id)
      if (!personaId)
        return []
      return [{
        personaId,
        agentId: normalizeString(record.agentId || record.agent_id) || undefined,
        voiceId: normalizeString(record.voiceId || record.voice_id) || undefined,
      }]
    })
}

function resolveSelectionForPersona(
  selections: DefenseVoiceRuntimeSelection[],
  personaId: string,
): DefenseVoiceRuntimeSelection | null {
  return selections.find(item => item.personaId === personaId) || null
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

        const defenseQwenProvider = resolveDefenseQwenVoiceProvider(runtime)
        const qwenVoice = defenseQwenProvider?.voice?.qwen
        const metadata = nextRealtime.metadata || {}
        const requestedRealtimeProfileId = normalizeString(metadata.voiceRuntimeProfileId)
        const requestedAsrProfileId = normalizeString(metadata.asrProfileId)
        const requestedTtsProfileId = normalizeString(metadata.ttsProfileId)
        const realtimeProfile = qwenVoice?.realtimeProfiles.find(item => item.enabled && item.id === requestedRealtimeProfileId)
          || qwenVoice?.realtimeProfiles.find(item => item.enabled)
          || null
        const asrProfile = qwenVoice?.asrProfiles.find(item => item.enabled && item.id === (requestedAsrProfileId || realtimeProfile?.asrProfileId))
          || qwenVoice?.asrProfiles.find(item => item.enabled)
          || null
        const ttsProfile = qwenVoice?.ttsProfiles.find(item => item.enabled && item.id === (requestedTtsProfileId || realtimeProfile?.ttsProfileId))
          || qwenVoice?.ttsProfiles.find(item => item.enabled)
          || null
        const tokenResult = await createQwenTemporaryToken(qwenApiKey)
        payload = {
          ...payload,
          expiresAt: tokenResult.expiresAt,
          qwen: {
            baseWsUrl: realtimeProfile?.baseWsUrl || runtime.defenseRealtime.qwen.baseWsUrl,
            realtimeProfileId: realtimeProfile?.id,
            realtimeModel: realtimeProfile?.model,
            asrProfileId: asrProfile?.id,
            asrModel: asrProfile?.model,
            ttsProfileId: ttsProfile?.id,
            ttsModel: ttsProfile?.model,
            vadMode: realtimeProfile?.vadMode || (metadata.vadMode === 'manual' || metadata.vadMode === 'semantic_vad' ? metadata.vadMode : 'server_vad'),
            workspaceId: realtimeProfile?.workspaceId || runtime.defenseRealtime.qwen.workspaceId,
            appId: realtimeProfile?.appId || runtime.defenseRealtime.qwen.appId,
            voice: ttsProfile?.voiceId || realtimeProfile?.defaultVoiceId || runtime.defenseRealtime.qwen.voice,
            frameIntervalMs: realtimeProfile?.frameIntervalMs || runtime.defenseRealtime.qwen.frameIntervalMs,
            accessToken: tokenResult.token,
            connectionUrl: `${runtime.apiBaseUrl.replace(/\/$/, '')}/projects/${projectId}/defense/realtime-sessions/${sessionId}/qwen-relay`,
          },
        }
      }
      else {
        const defenseCozeProvider = resolveDefenseCozeVoiceProvider(runtime)
        const config = resolveCozeVoiceRuntimeConfig({
          provider: defenseCozeProvider,
          ai: null,
          runtime,
        })
        if (!config)
          throw new Error('COZE_CONFIG_MISSING')
        assertCozeRealtimeConfig(config)

        const metadata = nextRealtime.metadata || {}
        const requestedSelections = normalizeSelectionArray(metadata.voiceRuntimeSelections)
        const cozeVoice = defenseCozeProvider?.voice?.coze
        const enabledAgents = cozeVoice?.agents.filter(item => item.enabled) || []
        const enabledVoices = cozeVoice?.voices.filter(item => item.enabled) || []
        const agentSelections = personaPack.judges.map((persona) => {
          const requested = resolveSelectionForPersona(requestedSelections, persona.id)
          const agent = enabledAgents.find(item => item.id === requested?.agentId)
            || enabledAgents.find(item => item.judgeType === persona.judgeType)
            || enabledAgents[0]
          return {
            personaId: persona.id,
            agentId: agent?.id || requested?.agentId || 'coze_agent_default',
            voiceId: requested?.voiceId || agent?.defaultVoiceId || enabledVoices[0]?.voiceId || config.voiceId || undefined,
          }
        })
        const primarySelection = agentSelections.find(item => item.agentId)
        const primaryAgent = enabledAgents.find(item => item.id === primarySelection?.agentId) || enabledAgents[0]
        const primaryVoiceId = normalizeString(primarySelection?.voiceId) || primaryAgent?.defaultVoiceId || config.voiceId
        const conversationId = normalizeString(nextRealtime.conversationId) || randomUUID()
        payload = {
          ...payload,
          coze: {
            baseUrl: config.baseURL,
            accessToken: config.apiKey,
            botId: primaryAgent?.botId || config.botId,
            connectorId: primaryAgent?.connectorId || config.connectorId,
            voiceId: primaryVoiceId,
            conversationId,
            agentSelections,
            voiceSelections: agentSelections,
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
    if (error instanceof Error && (error.message === 'COZE_CONFIG_MISSING' || error.message === 'COZE_VOICE_API_KEY_NOT_CONFIGURED' || error.message === 'COZE_REALTIME_CONFIG_MISSING')) {
      setResponseStatus(event, 503)
      return fail('Coze 实时音视频未完成配置。请在后台 AI 配置中将 defense 渠道绑定到 Coze 语音 Provider，并填写 token、botId、connectorId。', {
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
