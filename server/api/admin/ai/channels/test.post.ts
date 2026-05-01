import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { isCozeVoiceProvider, resolveCozeVoiceRuntimeConfig, synthesizeCozeVoiceSpeech } from '~~/server/services/admin-ai/coze-voice'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { getPlatformAiChannelDefinitions, resolveAiRuntimeForChannel, resolvePlatformAiChannelModelCapability, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ChannelTestBody {
  channelKey?: PlatformAiChannelKey
  message?: string
}

const DEFAULT_CHANNEL: PlatformAiChannelKey = 'project_chat'

function resolveChannelKey(raw: unknown): PlatformAiChannelKey {
  const text = String(raw || '').trim() as PlatformAiChannelKey
  const allowed = getPlatformAiChannelDefinitions().map(item => item.key)
  return allowed.includes(text) ? text : DEFAULT_CHANNEL
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
  const channelRuntime = resolveAiRuntimeForChannel(runtime, channelKey)
  const requiredCapability = resolvePlatformAiChannelModelCapability(channelKey)
  if (requiredCapability === 'tts') {
    try {
      const result = await runWithPlatformAiChannelFallback(runtime, channelKey, async ({ ai, provider, channel }) => {
        if (!isCozeVoiceProvider(provider))
          throw new Error('当前 TTS 场景测试只支持 Coze 语音 Provider。')
        const config = resolveCozeVoiceRuntimeConfig({ provider, ai, runtime })
        if (!config)
          throw new Error('Coze 语音 Provider 未完整配置。')
        const speech = await synthesizeCozeVoiceSpeech({
          config,
          text: String(body.message || '').trim() || 'SCENE_TTS_OK',
          responseFormat: 'wav',
        })
        return {
          channel,
          reply: `Coze TTS OK，返回 ${speech.audioBuffer.byteLength} bytes。`,
        }
      })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'test.admin.ai.channel',
          payload: {
            channelKey,
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
        model: result.ai.model || 'coze-voice',
        fallbackUsed: result.usedFallback,
        promptConfigured: Boolean(String(result.prompt || '').trim()),
        responsePreview: result.data.reply.slice(0, 300),
        attemptChain: result.attemptChain,
        latencyMs: Date.now() - startedAt,
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

  if (requiredCapability !== 'chat') {
    setResponseStatus(event, 400)
    return fail('当前场景不是聊天模型场景，无需执行对话连通性测试。', {
      startedAt,
      provider: channelRuntime.ai.provider,
      model: channelRuntime.ai.model,
      fallbackUsed: channelRuntime.usedFallback,
      attempts: 1,
    }, 40099)
  }
  const testMessage = String(body.message || '').trim() || '请回复“SCENE_OK”，并附带一句简短诊断说明。'

  try {
    const result = await runWithPlatformAiChannelFallback(runtime, channelKey, async ({ ai, channel, prompt }) => {
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
      model: result.ai.model,
      fallbackUsed: result.usedFallback,
      promptConfigured: Boolean(String(result.prompt || '').trim()),
      responsePreview: result.data.reply.slice(0, 300),
      attemptChain: result.attemptChain,
      latencyMs: Date.now() - startedAt,
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
