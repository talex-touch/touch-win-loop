import type { RuntimeSettings } from '~~/server/utils/env'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPlatformAiChannelsJson,
  buildPlatformAiRegistryJson,
  resolveAiRuntimeForChannel,
  resolvePlatformAiRegistry,
  runWithPlatformAiChannelFallback,
} from '~~/server/utils/platform-ai-channels'

function createRuntime(): RuntimeSettings {
  return {
    envPriority: 'test',
    apiBaseUrl: 'http://localhost',
    build: {
      version: 'test',
      commitSha: 'test',
    },
    ai: {
      provider: 'newapi',
      baseURL: 'https://newapi.example/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      embeddingModel: 'text-embedding-3-small',
      modelCatalogJson: '',
      modelPricingJson: '',
      providersJson: '',
      channelsJson: '',
      temperature: 0.2,
      topP: 1,
      maxTokens: 0,
      presencePenalty: 0,
      frequencyPenalty: 0,
      timeoutMs: 15000,
      maxRetries: 2,
    },
    docAi: {
      provider: 'newapi',
      baseURL: 'https://newapi.example/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1',
      modelPricingJson: '',
      timeoutMs: 15000,
      maxRetries: 2,
    },
    auth: {
      registrationEnabled: true,
    },
    onlyOffice: {
      endpoint: '',
      sourceBaseURL: '',
      jwtSecret: '',
      timeoutMs: 10000,
      retryLimit: 1,
      workerEnabled: false,
      workerIntervalMs: 1000,
      workerBatchSize: 1,
    },
    storage: {
      provider: 'local',
      localRoot: '',
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      forcePathStyle: false,
    },
    adminAi: {
      enabled: true,
      tavilyApiKey: '',
      webTimeoutMs: 12000,
      maxWebResults: 5,
      maxPageChars: 10000,
    },
    pg: {
      url: '',
    },
    redis: {
      url: '',
    },
    contest: {
      autoSeed: false,
    },
    resourceRecycle: {
      enabled: false,
      intervalMs: 1000,
      retentionDays: 7,
      batchSize: 10,
    },
    feishuScheduler: {
      enabled: false,
      intervalMs: 1000,
      batchSize: 10,
      lockTtlMs: 1000,
    },
  } as RuntimeSettings
}

describe('platform-ai-channels', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('仅有旧 ai.model 时会自动映射出模型池记录', () => {
    const runtime = createRuntime()
    const registry = resolvePlatformAiRegistry(runtime)

    expect(registry.providers[0]?.models.some(item => item.model === 'gpt-4.1-mini')).toBe(true)
    expect(registry.defaults.defaultModel).toBe('gpt-4.1-mini')
  })

  it('旧单模型场景会迁移为 models 数组', () => {
    const runtime = createRuntime()
    runtime.ai.channelsJson = JSON.stringify({
      items: [
        {
          key: 'project_chat',
          model: 'gpt-4.1-mini',
          enabled: true,
          prompt: 'hello',
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    const projectChat = registry.channels.find(item => item.key === 'project_chat')

    expect(projectChat?.models).toEqual(['gpt-4.1-mini'])
  })

  it('新结构会按场景配置顺序生成候选链', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      provider: {
        provider: 'newapi',
        baseURL: 'https://newapi.example/v1',
      },
      modelPool: {
        items: [
          { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
          { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          { model: 'gpt-4.1-nano', enabled: false, format: 'openai-compatible' },
        ],
      },
      defaults: {
        defaultModel: 'gpt-4.1-mini',
        embeddingModel: 'text-embedding-3-small',
        documentModel: 'gpt-4.1',
      },
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
          enabled: true,
        },
      ],
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')

    expect(resolved.candidates.map(item => item.ai.model)).toEqual(['gpt-4.1', 'gpt-4.1-mini'])
  })

  it('平台 AI registry 会暴露文档动作场景与画布场景', () => {
    const runtime = createRuntime()
    const registry = resolvePlatformAiRegistry(runtime)

    expect(registry.channels.some(item => item.key === 'workspace_document_rewrite')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_document_expand')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_document_complete_context')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_document_restructure')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_canvas_generate')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_canvas_complete')).toBe(true)
    expect(registry.channels.some(item => item.key === 'workspace_canvas_refine')).toBe(true)
  })

  it('旧 workspace_document_assist 配置会迁移到新的文档动作场景', () => {
    const runtime = createRuntime()
    runtime.ai.channelsJson = JSON.stringify({
      items: [
        {
          key: 'workspace_document_assist',
          models: ['gpt-4.1'],
          enabled: false,
          prompt: 'legacy-doc-prompt',
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    const rewrite = registry.channels.find(item => item.key === 'workspace_document_rewrite')
    const restructure = registry.channels.find(item => item.key === 'workspace_document_restructure')

    expect(rewrite?.enabled).toBe(false)
    expect(rewrite?.models).toEqual(['gpt-4.1'])
    expect(rewrite?.prompt).toBe('legacy-doc-prompt')
    expect(restructure?.enabled).toBe(false)
    expect(restructure?.prompt).toBe('legacy-doc-prompt')
  })

  it('统一 AI 入口会记录总耗时和每次尝试耗时', async () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      provider: {
        provider: 'newapi',
        baseURL: 'https://newapi.example/v1',
      },
      modelPool: {
        items: [
          { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
        ],
      },
      defaults: {
        defaultModel: 'gpt-4.1-mini',
        embeddingModel: 'text-embedding-3-small',
        documentModel: 'gpt-4.1',
      },
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          models: ['gpt-4.1', 'gpt-4.1-mini'],
          enabled: true,
        },
      ],
    })

    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    let attempt = 0
    const task = runWithPlatformAiChannelFallback(runtime, 'project_chat', async ({ ai }) => {
      attempt += 1
      await new Promise(resolve => setTimeout(resolve, attempt === 1 ? 10 : 20))
      if (attempt === 1)
        throw new Error('FIRST_FAILED')
      return ai.model
    })

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(20)

    const result = await task

    expect(result.data).toBe('gpt-4.1-mini')
    expect(result.latencyMs).toBe(30)
    expect(result.attemptChain).toEqual([
      expect.objectContaining({
        provider: 'newapi',
        model: 'gpt-4.1',
        success: false,
        latencyMs: 10,
        error: 'FIRST_FAILED',
      }),
      expect.objectContaining({
        provider: 'newapi',
        model: 'gpt-4.1-mini',
        success: true,
        latencyMs: 20,
      }),
    ])
    expect(warnSpy).toHaveBeenCalledWith('[platform-ai] request succeeded', expect.objectContaining({
      channelKey: 'project_chat',
      attempts: 2,
      latencyMs: 30,
    }))
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
