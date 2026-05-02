import type { PlatformAiProviderCapability, PlatformAiProviderVoiceConfig } from '~~/server/utils/platform-ai-channels'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { probeCozeVoiceProvider, resolveCozeVoiceRuntimeConfig } from '~~/server/services/admin-ai/coze-voice'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { normalizePlatformAiBaseURL, resolvePlatformAiTransientApiKey } from '~~/server/utils/platform-ai-base-url'
import { buildPlatformAiRegistryJson, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ProviderDraftBody {
  id?: string
  name?: string
  type?: string
  capability?: PlatformAiProviderCapability
  provider?: string
  clientType?: string
  baseURL?: string
  timeoutMs?: number
  maxRetries?: number
  enabled?: boolean
  apiKey?: string
  embeddingApiStyle?: string
  embeddingDimensions?: number
  voice?: Partial<PlatformAiProviderVoiceConfig>
  models?: unknown[]
}

interface ProviderTestBody {
  message?: string
  model?: string
  providerId?: string
  draftProvider?: ProviderDraftBody
  apiKey?: string
  apiKeyMode?: 'keep' | 'replace' | 'clear'
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function toMode(value: unknown): 'keep' | 'replace' | 'clear' {
  const normalized = toText(value)
  if (normalized === 'replace' || normalized === 'clear')
    return normalized
  return 'keep'
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
    return fail('当前用户无权测试 AI Provider。', {
      startedAt,
      provider: runtime.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const body = await readBody<ProviderTestBody>(event).catch(() => ({} as ProviderTestBody))
  const registry = resolvePlatformAiRegistry(runtime)
  const currentProvider = registry.providers.find(item => item.id === toText(body.providerId))
    || registry.providers.find(item => item.capability === 'llm')
    || null
  const draftProvider = body.draftProvider && typeof body.draftProvider === 'object'
    ? body.draftProvider
    : null
  const resolvedProvider = draftProvider
    ? (() => {
        const apiKeyMode = toMode(body.apiKeyMode)
        const providedApiKey = toText(body.apiKey ?? draftProvider.apiKey)
        const seed = {
          ...currentProvider,
          ...draftProvider,
          id: toText(draftProvider.id) || currentProvider?.id || 'provider_1',
          provider: toText(draftProvider.provider) || currentProvider?.provider || '',
          baseURL: normalizePlatformAiBaseURL(draftProvider.baseURL, toText(draftProvider.provider) || currentProvider?.provider || ''),
          apiKey: apiKeyMode === 'clear'
            ? ''
            : providedApiKey || currentProvider?.apiKey || '',
          models: Array.isArray(draftProvider.models) ? draftProvider.models : currentProvider?.models || [],
        }
        const draftRuntime = {
          ...runtime,
          ai: {
            ...runtime.ai,
            providersJson: buildPlatformAiRegistryJson(runtime, {
              providers: [seed],
            }),
          },
        }
        return resolvePlatformAiRegistry(draftRuntime).providers[0] || null
      })()
    : currentProvider

  if (!resolvedProvider || (resolvedProvider.capability !== 'llm' && resolvedProvider.capability !== 'voice')) {
    setResponseStatus(event, 400)
    return fail('当前 Provider 不支持连通性测试。', {
      startedAt,
      provider: resolvedProvider?.provider || '',
      model: resolvedProvider?.models[0]?.model || '',
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const providerName = toText(resolvedProvider.provider)
  const apiKey = resolvePlatformAiTransientApiKey({
    currentApiKey: resolvedProvider.apiKey,
    providedApiKey: body.apiKey ?? draftProvider?.apiKey,
    mode: toMode(body.apiKeyMode),
  })
  const baseURL = normalizePlatformAiBaseURL(resolvedProvider.baseURL, providerName)
  const usedProvidedApiKey = Boolean(toText(body.apiKey ?? draftProvider?.apiKey))

  if (resolvedProvider.capability === 'voice') {
    const voiceProvider = {
      ...resolvedProvider,
      apiKey,
      baseURL: resolvedProvider.baseURL || baseURL,
    }
    const config = resolveCozeVoiceRuntimeConfig({
      provider: voiceProvider,
      ai: {
        ...runtime.ai,
        provider: providerName,
        baseURL: voiceProvider.baseURL,
        apiKey,
        model: '',
        timeoutMs: resolvedProvider.timeoutMs,
      },
      runtime,
    })
    if (!config) {
      setResponseStatus(event, 400)
      return fail('Coze 语音 Provider 未完整配置。', {
        startedAt,
        provider: providerName,
        model: '',
        fallbackUsed: false,
        attempts: 1,
      }, 40097)
    }

    try {
      const probe = await probeCozeVoiceProvider({
        config,
        text: String(body.message || '').trim() || 'Coze voice test',
      })

      await withTransaction(event, async (db) => {
        await recordContestAuditLog(db, {
          actorUserId: user.id,
          action: 'test.admin.ai.provider',
          payload: {
            providerId: resolvedProvider.id,
            provider: providerName,
            model: 'coze-voice',
            responsePreview: probe.transcriptionPreview,
            speechBytes: probe.speechBytes,
            latencyMs: Date.now() - startedAt,
          },
        })
      })

      return ok({
        providerId: resolvedProvider.id,
        provider: providerName,
        model: 'coze-voice',
        responsePreview: `TTS ${probe.speechBytes} bytes · ASR ${probe.transcriptionPreview || '已返回空转写'}`,
        latencyMs: Date.now() - startedAt,
      }, {
        startedAt,
        provider: providerName,
        model: 'coze-voice',
        fallbackUsed: false,
        attempts: 1,
      })
    }
    catch (error: any) {
      setResponseStatus(event, 502)
      const sourceLabel = usedProvidedApiKey ? '当前输入的 API Key' : '已保存的 API Key'
      return fail(`[${sourceLabel}] ${String(error?.message || 'Coze 语音 Provider 测试失败。')}`, {
        startedAt,
        provider: providerName,
        model: 'coze-voice',
        fallbackUsed: false,
        attempts: 1,
      }, 50297)
    }
  }

  const preferredModel = toText(body.model)
  const modelConfig = preferredModel
    ? resolvedProvider.models.find(item => item.model === preferredModel && item.enabled) || null
    : resolvedProvider.models.find(item => item.enabled) || resolvedProvider.models[0] || null

  const resolved = {
    provider: resolvedProvider,
    ai: {
      ...runtime.ai,
      provider: providerName,
      clientType: resolvedProvider.clientType || runtime.ai.clientType,
      baseURL,
      apiKey,
      model: modelConfig?.model || '',
      format: modelConfig?.format || 'openai-compatible',
      timeoutMs: resolvedProvider.timeoutMs,
      maxRetries: 0,
      temperature: 0,
    },
  }

  if (!resolved.ai.apiKey) {
    setResponseStatus(event, 400)
    return fail('Provider API Key 未配置，无法执行连通性测试。', {
      startedAt,
      provider: providerName,
      model: preferredModel || modelConfig?.model || '',
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (!resolved.ai.model) {
    setResponseStatus(event, 400)
    return fail('当前 Provider 未配置可用模型，无法执行连通性测试。', {
      startedAt,
      provider: resolved.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  if (!isAiRuntimeConfigured(resolved.ai)) {
    setResponseStatus(event, 400)
    return fail('Provider 未完整配置，缺少 provider/baseURL/apiKey/model，无法执行连通性测试。', {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  try {
    const model = createChatModel({
      ...resolved.ai,
      maxRetries: 0,
      temperature: 0,
      timeoutMs: Math.min(15000, Math.max(3000, Number(resolved.ai.timeoutMs || 12000))),
    })
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是 AI Provider 连通性测试助手，只需返回一句简短文本。'],
      ['human', '{message}'],
    ])
    const promptValue = await prompt.invoke({
      message: String(body.message || '').trim() || '请回复“UPSTREAM_TEST_OK”，并附带一句简短可读说明。',
    })
    const output = await model.invoke(promptValue)
    const responsePreview = extractMessageText(output.content) || '（模型返回为空）'

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.ai.provider',
        payload: {
          providerId: resolvedProvider.id,
          provider: resolved.ai.provider,
          model: resolved.ai.model,
          responsePreview: responsePreview.slice(0, 200),
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok({
      providerId: resolvedProvider.id,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      responsePreview: responsePreview.slice(0, 300),
      latencyMs: Date.now() - startedAt,
    }, {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    const sourceLabel = usedProvidedApiKey ? '当前输入的 API Key' : '已保存的 API Key'
    return fail(`[${sourceLabel}] ${String(error?.message || 'Provider 测试失败。')}`, {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50297)
  }
})
