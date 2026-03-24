import type { ProviderModelScope } from '~~/server/services/admin-ai/provider-models'
import type { PlatformAiProviderAdapter } from '~~/server/utils/platform-ai-channels'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ProviderTestBody {
  providerId?: string
  scope?: ProviderModelScope
  message?: string
}

function resolveScope(raw: unknown): ProviderModelScope {
  const text = String(raw || '').trim()
  if (text === 'docAi')
    return 'docAi'
  if (text === 'provider')
    return 'provider'
  return 'llm'
}

function resolveAdapter(value: unknown): PlatformAiProviderAdapter {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'response')
    return 'response'
  return 'openai-compatible'
}

function resolveFormatFromAdapter(adapter: PlatformAiProviderAdapter): 'openai-compatible' | 'response' {
  return adapter === 'response' ? 'response' : 'openai-compatible'
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
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40392)
  }

  const body = await readBody<ProviderTestBody>(event).catch(() => ({} as ProviderTestBody))
  const providerId = String(body.providerId || '').trim()
  const scope = resolveScope(body.scope)
  const testMessage = String(body.message || '').trim() || '请回复“PROVIDER_TEST_OK”，并附带一句简短可读说明。'
  const registry = resolvePlatformAiRegistry(runtime)
  const providerFromRegistry = providerId
    ? registry.providers.find(item => item.id === providerId)
    : null

  if (providerId && !providerFromRegistry) {
    setResponseStatus(event, 404)
    return fail(`Provider(${providerId}) 不存在。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  const config = providerFromRegistry
    ? (() => {
        const selectedModel = providerFromRegistry.models.find(item => item.enabled) || providerFromRegistry.models[0]
        const adapter = providerFromRegistry.adapter
        return {
          scope: 'provider' as const,
          provider: providerFromRegistry.provider,
          baseURL: providerFromRegistry.baseURL,
          apiKey: providerFromRegistry.apiKey || runtime.ai.apiKey,
          model: selectedModel?.model || runtime.ai.model,
          format: selectedModel?.format || resolveFormatFromAdapter(adapter),
          timeoutMs: providerFromRegistry.timeoutMs,
          adapter,
        }
      })()
    : scope === 'docAi'
      ? (() => {
          const adapter = resolveAdapter(runtime.docAi.provider)
          return {
            scope: 'docAi' as const,
            provider: runtime.docAi.provider,
            baseURL: runtime.docAi.baseURL,
            apiKey: runtime.docAi.apiKey,
            model: runtime.docAi.model,
            format: resolveFormatFromAdapter(adapter),
            timeoutMs: runtime.docAi.timeoutMs,
            adapter,
          }
        })()
      : (() => {
          const adapter = resolveAdapter(runtime.ai.provider)
          return {
            scope: 'llm' as const,
            provider: runtime.ai.provider,
            baseURL: runtime.ai.baseURL,
            apiKey: runtime.ai.apiKey,
            model: runtime.ai.model,
            format: resolveFormatFromAdapter(adapter),
            timeoutMs: runtime.ai.timeoutMs,
            adapter,
          }
        })()

  if (!String(config.apiKey || '').trim()) {
    setResponseStatus(event, 400)
    return fail('API Key 未配置，无法执行 Provider 测试。', {
      startedAt,
      provider: config.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }
  if (!String(config.model || '').trim()) {
    setResponseStatus(event, 400)
    return fail('未配置可用模型，无法执行 Provider 测试。', {
      startedAt,
      provider: config.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  try {
    const model = createChatModel({
      provider: config.provider,
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
      format: config.format,
      timeoutMs: Math.min(15000, Math.max(3000, Number(config.timeoutMs || 12000))),
      maxRetries: 0,
      temperature: 0,
    })
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', '你是 Provider 连通性测试助手，只需返回一句简短文本。'],
      ['human', '{message}'],
    ])
    const promptValue = await prompt.invoke({
      message: testMessage,
    })
    const output = await model.invoke(promptValue)
    const responsePreview = extractMessageText(output.content) || '（模型返回为空）'

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.ai.provider',
        payload: {
          providerId: providerId || null,
          scope: config.scope,
          provider: config.provider,
          format: config.format,
          model: config.model,
          responsePreview: responsePreview.slice(0, 200),
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok({
      providerId: providerId || '',
      scope: config.scope,
      provider: config.provider,
      adapter: config.adapter,
      model: config.model,
      format: config.format,
      responsePreview: responsePreview.slice(0, 300),
      latencyMs: Date.now() - startedAt,
    }, {
      startedAt,
      provider: config.provider,
      model: config.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || 'Provider 测试失败。'), {
      startedAt,
      provider: config.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50297)
  }
})
