import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { normalizePlatformAiBaseURL, resolvePlatformAiTransientApiKey } from '~~/server/utils/platform-ai-base-url'
import { resolveAiRuntimeForChannel, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ProviderTestBody {
  message?: string
  model?: string
  provider?: string
  baseURL?: string
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
    return fail('当前用户无权测试 AI 上游。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const body = await readBody<ProviderTestBody>(event).catch(() => ({} as ProviderTestBody))
  const registry = resolvePlatformAiRegistry(runtime)
  const provider = registry.providers[0]
  const providerName = toText(body.provider) || provider?.provider || runtime.ai.provider
  const baseURL = normalizePlatformAiBaseURL(body.baseURL, providerName) || provider?.baseURL || runtime.ai.baseURL
  const apiKeyMode = toMode(body.apiKeyMode)
  const apiKey = resolvePlatformAiTransientApiKey({
    currentApiKey: provider?.apiKey || runtime.ai.apiKey,
    providedApiKey: body.apiKey,
    mode: apiKeyMode,
  })
  const usedProvidedApiKey = Boolean(toText(body.apiKey))
  const preferredModel = String(body.model || '').trim()
  const resolved = preferredModel
    ? (() => {
        const modelConfig = provider?.models.find(item => item.model === preferredModel && item.enabled)
        if (!provider || !modelConfig)
          return null
        return {
          provider,
          ai: {
            ...runtime.ai,
            provider: providerName,
            baseURL,
            apiKey,
            model: modelConfig.model,
            format: modelConfig.format,
            timeoutMs: provider.timeoutMs,
            maxRetries: 0,
            temperature: 0,
          },
        }
      })()
    : (() => {
        const runtimeForChannel = resolveAiRuntimeForChannel(runtime, 'project_chat')
        return {
          ...runtimeForChannel,
          ai: {
            ...runtimeForChannel.ai,
            provider: providerName,
            baseURL,
            apiKey,
          },
        }
      })()

  if (!resolved || !String(resolved.ai.apiKey || '').trim()) {
    setResponseStatus(event, 400)
    return fail('共享上游 API Key 未配置，无法执行连通性测试。', {
      startedAt,
      provider: providerName,
      model: preferredModel || runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  if (!String(resolved.ai.model || '').trim()) {
    setResponseStatus(event, 400)
    return fail('未配置可用模型，无法执行连通性测试。', {
      startedAt,
      provider: resolved.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const model = createChatModel({
      ...resolved.ai,
      maxRetries: 0,
      temperature: 0,
      timeoutMs: Math.min(15000, Math.max(3000, Number(resolved.ai.timeoutMs || 12000))),
    })
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是共享上游连通性测试助手，只需返回一句简短文本。'],
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
          provider: resolved.ai.provider,
          model: resolved.ai.model,
          responsePreview: responsePreview.slice(0, 200),
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok({
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
    return fail(`[${sourceLabel}] ${String(error?.message || '共享上游测试失败。')}`, {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50297)
  }
})
