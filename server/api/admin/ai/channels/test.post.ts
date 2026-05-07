import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { runAdminAiAsrProbe } from '~~/server/services/admin-ai/asr-probe'
import { isCozeVoiceProvider, resolveCozeVoiceRuntimeConfig, synthesizeCozeVoiceSpeech } from '~~/server/services/admin-ai/coze-voice'
import { resolveDashScopeTtsRuntimeConfig, synthesizeDashScopeTtsSpeech } from '~~/server/services/admin-ai/dashscope-tts'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { createKnowledgeEmbedding } from '~~/server/services/knowledge-ai'
import { isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { buildPlatformAiChannelsJson, getPlatformAiChannelDefinitions, resolveAiRuntimeForChannel, resolvePlatformAiChannelModelCapability, resolvePlatformAiRegistry, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ChannelTestBody {
  channelKey?: PlatformAiChannelKey
  message?: string
  providerId?: string
  model?: string
  profileId?: string
  testMode?: 'auto' | 'chat' | 'asr' | 'tts' | 'embedding'
}

const DEFAULT_CHANNEL: PlatformAiChannelKey = 'project_chat'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveChannelKey(raw: unknown): PlatformAiChannelKey {
  const text = String(raw || '').trim() as PlatformAiChannelKey
  const allowed = getPlatformAiChannelDefinitions().map(item => item.key)
  return allowed.includes(text) ? text : DEFAULT_CHANNEL
}

function buildChannelTestRuntime(
  runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime'],
  input: {
    channelKey: PlatformAiChannelKey
    providerId?: string
    model?: string
  },
) {
  const providerId = normalizeString(input.providerId)
  const model = normalizeString(input.model)
  if (!providerId && !model)
    return runtime

  const registry = resolvePlatformAiRegistry(runtime)
  const channels = registry.channels.map((channel) => {
    if (channel.key !== input.channelKey)
      return channel
    const providerIds = providerId ? [providerId] : channel.providerIds
    const models = model ? [model] : channel.models
    return {
      ...channel,
      providerIds,
      models,
      modelFallback: model ? [model] : channel.modelFallback,
    }
  })

  return {
    ...runtime,
    ai: {
      ...runtime.ai,
      channelsJson: buildPlatformAiChannelsJson(runtime, channels, registry.providers),
    },
  }
}

function resolveTestMode(
  requested: unknown,
  requiredCapability: ReturnType<typeof resolvePlatformAiChannelModelCapability>,
): 'chat' | 'asr' | 'tts' | 'embedding' {
  const normalized = normalizeString(requested)
  if (normalized === 'chat' || normalized === 'asr' || normalized === 'tts' || normalized === 'embedding')
    return normalized
  if (requiredCapability === 'asr')
    return 'asr'
  if (requiredCapability === 'tts')
    return 'tts'
  if (requiredCapability === 'embedding')
    return 'embedding'
  return 'chat'
}

function resolveTtsProfile(
  provider: Parameters<typeof resolveCozeVoiceRuntimeConfig>[0]['provider'],
  profileId: string,
): { model?: string, voiceId?: string } {
  const normalizedProfileId = normalizeString(profileId)
  if (!normalizedProfileId || !provider?.voice)
    return {}
  const qwenProfile = provider.voice.qwen?.ttsProfiles.find(item => item.id === normalizedProfileId && item.enabled)
    || provider.voice.qwen?.ttsProfiles.find(item => item.id === normalizedProfileId)
  if (qwenProfile) {
    return {
      model: qwenProfile.model,
      voiceId: qwenProfile.voiceId,
    }
  }
  const cozeVoice = provider.voice.coze?.voices.find(item => item.id === normalizedProfileId && item.enabled)
    || provider.voice.coze?.voices.find(item => item.id === normalizedProfileId)
  if (cozeVoice) {
    return {
      voiceId: cozeVoice.voiceId,
    }
  }
  return {}
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试 AI 场景。', {
      startedAt,
      provider: runtime.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  const body = await readBody<ChannelTestBody>(event).catch(() => ({} as ChannelTestBody))
  const channelKey = resolveChannelKey(body.channelKey)
  const testRuntime = buildChannelTestRuntime(runtime, {
    channelKey,
    providerId: body.providerId,
    model: body.model,
  })
  const channelRuntime = resolveAiRuntimeForChannel(testRuntime, channelKey)
  const requiredCapability = resolvePlatformAiChannelModelCapability(channelKey)
  const testMode = resolveTestMode(body.testMode, requiredCapability)
  const profileId = normalizeString(body.profileId)
  if (testMode === 'asr') {
    try {
      const result = await runWithPlatformAiChannelFallback(testRuntime, channelKey, async ({ ai, provider, channel }) => {
        const probe = await runAdminAiAsrProbe({
          runtime: testRuntime,
          provider,
          ai,
          message: body.message,
          profileId,
        })
        return {
          channel,
          probe,
          reply: probe.detail,
        }
      })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'test.admin.ai.channel',
          payload: {
            channelKey,
            testMode,
            provider: result.ai.provider,
            model: result.data.probe.model || result.ai.model,
            profileId,
            fallbackUsed: result.usedFallback,
            attemptChain: result.attemptChain,
            latencyMs: Date.now() - startedAt,
          },
        })
      })

      return ok({
        channelKey,
        channelLabel: result.channel.label,
        provider: result.ai.provider,
        providerId: result.provider?.id || '',
        model: result.data.probe.model || result.ai.model || 'qwen3-asr-flash',
        profileId,
        testMode,
        fallbackUsed: result.usedFallback,
        promptConfigured: Boolean(String(result.prompt || '').trim()),
        responsePreview: result.data.reply.slice(0, 300),
        attemptChain: result.attemptChain,
        latencyMs: Date.now() - startedAt,
        auditAction: 'test.admin.ai.channel',
        logs: [
          `场景：${result.channel.label} (${channelKey})`,
          `测试类型：ASR`,
          `Provider：${result.ai.provider}`,
          `模型/Profile：${result.data.probe.model || result.ai.model || 'coze-voice'}${profileId ? ` / ${profileId}` : ''}`,
          `音频探针：${result.data.probe.audioBytes} bytes wav`,
          `回退链路：${result.attemptChain.map(item => `${item.provider}/${item.model || 'model-less'}:${item.success ? 'ok' : item.error || 'failed'}`).join(' -> ')}`,
        ],
      }, {
        startedAt,
        provider: result.ai.provider,
        model: result.data.probe.model || result.ai.model || 'qwen3-asr-flash',
        fallbackUsed: result.usedFallback,
        attempts: result.attemptChain.length,
      })
    }
    catch (error: any) {
      setResponseStatus(event, 502)
      return fail(String(error?.message || 'ASR 场景测试失败。'), {
        startedAt,
        provider: channelRuntime.ai.provider,
        model: channelRuntime.ai.model,
        fallbackUsed: channelRuntime.usedFallback,
        attempts: 1,
      }, 50299)
    }
  }

  if (testMode === 'tts') {
    try {
      const result = await runWithPlatformAiChannelFallback(testRuntime, channelKey, async ({ ai, provider, channel }) => {
        const text = String(body.message || '').trim() || 'SCENE_TTS_OK'
        const ttsProfile = resolveTtsProfile(provider, profileId)
        if (isCozeVoiceProvider(provider)) {
          const config = resolveCozeVoiceRuntimeConfig({ provider, ai, runtime })
          if (!config)
            throw new Error('Coze 语音 Provider 未完整配置。')
          const speech = await synthesizeCozeVoiceSpeech({
            config: {
              ...config,
              voiceId: ttsProfile.voiceId || config.voiceId,
            },
            text,
            responseFormat: 'wav',
          })
          return {
            channel,
            reply: `Coze TTS OK，返回 ${speech.audioBuffer.byteLength} bytes。`,
          }
        }

        const config = resolveDashScopeTtsRuntimeConfig({ provider, ai, runtime })
        if (!config)
          throw new Error('当前 TTS Provider 未完整配置，或不是 Coze / DashScope TTS Provider。')
        const speech = await synthesizeDashScopeTtsSpeech({
          config: {
            ...config,
            model: ttsProfile.model || config.model,
            voice: ttsProfile.voiceId || config.voice,
          },
          text,
        })
        const resultSize = speech.audioBuffer?.byteLength || 0
        const resultRef = resultSize > 0 ? `${resultSize} bytes` : (speech.audioUrl ? `audio_url ${speech.audioUrl.slice(0, 120)}` : '已返回结果')
        return {
          channel,
          reply: `DashScope TTS OK，返回 ${resultRef}。`,
        }
      })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'test.admin.ai.channel',
          payload: {
            channelKey,
            testMode,
            provider: result.ai.provider,
            model: result.ai.model,
            profileId,
            fallbackUsed: result.usedFallback,
            attemptChain: result.attemptChain,
            latencyMs: Date.now() - startedAt,
          },
        })
      })

      return ok({
        channelKey,
        channelLabel: result.channel.label,
        provider: result.ai.provider,
        providerId: result.provider?.id || '',
        model: result.ai.model || 'coze-voice',
        profileId,
        testMode,
        fallbackUsed: result.usedFallback,
        promptConfigured: Boolean(String(result.prompt || '').trim()),
        responsePreview: result.data.reply.slice(0, 300),
        attemptChain: result.attemptChain,
        latencyMs: Date.now() - startedAt,
        auditAction: 'test.admin.ai.channel',
        logs: [
          `场景：${result.channel.label} (${channelKey})`,
          `测试类型：TTS`,
          `Provider：${result.ai.provider}`,
          `模型/Profile：${result.ai.model || 'coze-voice'}${profileId ? ` / ${profileId}` : ''}`,
          `回退链路：${result.attemptChain.map(item => `${item.provider}/${item.model || 'model-less'}:${item.success ? 'ok' : item.error || 'failed'}`).join(' -> ')}`,
        ],
      }, {
        startedAt,
        provider: result.ai.provider,
        model: result.ai.model || 'coze-voice',
        fallbackUsed: result.usedFallback,
        attempts: result.attemptChain.length,
      })
    }
    catch (error: any) {
      setResponseStatus(event, 502)
      return fail(String(error?.message || 'TTS 场景测试失败。'), {
        startedAt,
        provider: channelRuntime.ai.provider,
        model: channelRuntime.ai.model,
        fallbackUsed: channelRuntime.usedFallback,
        attempts: 1,
      }, 50299)
    }
  }

  if (testMode === 'embedding') {
    try {
      const result = await runWithPlatformAiChannelFallback(testRuntime, channelKey, async ({ channel }) => {
        const text = String(body.message || '').trim() || 'WinLoop embedding probe'
        const embedding = await createKnowledgeEmbedding({
          text,
          inputType: channelKey === 'knowledge_visual_embedding' ? 'text' : 'text',
          runtime: testRuntime,
        })
        return {
          channel,
          reply: `Embedding OK，dimensions=${embedding.dimensions || embedding.embedding.length}，apiStyle=${embedding.apiStyle}。`,
          embedding,
        }
      })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'test.admin.ai.channel',
          payload: {
            channelKey,
            testMode,
            provider: result.data.embedding.provider || result.ai.provider,
            model: result.data.embedding.model || result.ai.model,
            fallbackUsed: result.usedFallback,
            attemptChain: result.attemptChain,
            latencyMs: Date.now() - startedAt,
          },
        })
      })

      return ok({
        channelKey,
        channelLabel: result.channel.label,
        provider: result.data.embedding.provider || result.ai.provider,
        providerId: result.provider?.id || '',
        model: result.data.embedding.model || result.ai.model,
        profileId,
        testMode,
        fallbackUsed: result.usedFallback || result.data.embedding.fallbackUsed,
        promptConfigured: Boolean(String(result.prompt || '').trim()),
        responsePreview: result.data.reply.slice(0, 300),
        attemptChain: result.attemptChain,
        latencyMs: Date.now() - startedAt,
        auditAction: 'test.admin.ai.channel',
        logs: [
          `场景：${result.channel.label} (${channelKey})`,
          `测试类型：Embedding`,
          `Provider：${result.data.embedding.provider || result.ai.provider}`,
          `模型：${result.data.embedding.model || result.ai.model}`,
          `维度：${result.data.embedding.dimensions || result.data.embedding.embedding.length}`,
          `回退链路：${result.attemptChain.map(item => `${item.provider}/${item.model || 'model-less'}:${item.success ? 'ok' : item.error || 'failed'}`).join(' -> ')}`,
        ],
      }, {
        startedAt,
        provider: result.data.embedding.provider || result.ai.provider,
        model: result.data.embedding.model || result.ai.model,
        fallbackUsed: result.usedFallback || result.data.embedding.fallbackUsed,
        attempts: result.attemptChain.length,
      })
    }
    catch (error: any) {
      setResponseStatus(event, 502)
      return fail(String(error?.message || 'Embedding 场景测试失败。'), {
        startedAt,
        provider: channelRuntime.ai.provider,
        model: channelRuntime.ai.model,
        fallbackUsed: channelRuntime.usedFallback,
        attempts: 1,
      }, 50299)
    }
  }

  if (testMode !== 'chat') {
    setResponseStatus(event, 400)
    return fail('当前测试类型暂不支持该场景。', {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: channelRuntime.usedFallback,
      attempts: 1,
    }, 40099)
  }
  const testMessage = String(body.message || '').trim() || '请回复“SCENE_OK”，并附带一句简短诊断说明。'

  try {
    const result = await runWithPlatformAiChannelFallback(testRuntime, channelKey, async ({ ai, channel, prompt }) => {
      if (!isAiRuntimeConfigured(ai))
        throw new Error('该场景未配置可用模型（provider/baseURL/apiKey/model 缺失）。')

      const model = createChatModel({
        ...ai,
        maxRetries: 0,
        temperature: Math.min(1, Math.max(0, Number(ai.temperature ?? 0.2))),
      })

      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', [
          '你是 AI 场景测试助手。',
          '只需输出一段简洁文本，说明当前模型可用。',
          prompt ? `[场景提示词]\n${prompt}` : '',
        ].filter(Boolean).join('\n\n')],
        ['human', '{message}'],
      ])

      const promptValue = await promptTemplate.invoke({
        message: testMessage,
      })
      const output = await model.invoke(promptValue)
      const reply = extractMessageText(output.content) || '（模型返回为空）'

      return {
        channel,
        reply,
      }
    })

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.ai.channel',
        payload: {
          channelKey,
          testMode,
          provider: result.ai.provider,
          model: result.ai.model,
          fallbackUsed: result.usedFallback,
          attemptChain: result.attemptChain,
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok({
      channelKey,
      channelLabel: result.channel.label,
      provider: result.ai.provider,
      providerId: result.provider?.id || '',
      model: result.ai.model,
      profileId,
      testMode,
      fallbackUsed: result.usedFallback,
      promptConfigured: Boolean(String(result.prompt || '').trim()),
      responsePreview: result.data.reply.slice(0, 300),
      attemptChain: result.attemptChain,
      latencyMs: Date.now() - startedAt,
      auditAction: 'test.admin.ai.channel',
      logs: [
        `场景：${result.channel.label} (${channelKey})`,
        `测试类型：Chat`,
        `Provider：${result.ai.provider}`,
        `模型：${result.ai.model}`,
        `回退链路：${result.attemptChain.map(item => `${item.provider}/${item.model || 'model-less'}:${item.success ? 'ok' : item.error || 'failed'}`).join(' -> ')}`,
      ],
    }, {
      startedAt,
      provider: result.ai.provider,
      model: result.ai.model,
      fallbackUsed: result.usedFallback,
      attempts: result.attemptChain.length,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || '场景测试失败。'), {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: channelRuntime.usedFallback,
      attempts: 1,
    }, 50298)
  }
})
