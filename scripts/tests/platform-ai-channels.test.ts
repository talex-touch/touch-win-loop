import type { RuntimeSettings } from '~~/server/utils/env'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildPlatformAiChannelsJson,
  buildPlatformAiRegistryJson,
  inferPlatformAiModelCapabilities,
  resolveAiRuntimeForChannel,
  resolvePlatformAiChannelModelCapability,
  resolvePlatformAiRegistry,
  resolvePlatformAiRuntimeByCapability,
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
      clientType: 'langchain',
      baseURL: 'https://newapi.example/v1',
      apiKey: 'test-key',
      model: 'gpt-4.1-mini',
      embeddingModel: 'text-embedding-3-small',
      embeddingApiStyle: 'openai-compatible-text',
      embeddingDimensions: 1024,
      visionModel: '',
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
    pg: { url: '' },
    redis: { url: '' },
    contest: { autoSeed: false },
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

  it('旧单 Provider 运行时会自动迁移为首个 Provider', () => {
    const runtime = createRuntime()
    const registry = resolvePlatformAiRegistry(runtime)

    expect(registry.providers).toHaveLength(1)
    expect(registry.providers[0]?.provider).toBe('newapi')
    expect(registry.providers[0]?.models.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(registry.defaults.defaultModel).toBe('gpt-4.1-mini')
    expect(registry.defaults.embeddingModel).toBe('text-embedding-3-small')
    expect(registry.defaults.visionModel).toBe('')
    expect(registry.defaults.documentModel).toBe('gpt-4.1')
  })

  it('模型名会启发式识别能力', () => {
    expect(inferPlatformAiModelCapabilities({ model: 'qwen-plus' })).toEqual(['chat'])
    expect(inferPlatformAiModelCapabilities({ model: 'qwen-vl-max' })).toEqual(['chat', 'vision'])
    expect(inferPlatformAiModelCapabilities({ model: 'text-embedding-v4' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'qwen3-vl-embedding' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'tongyi-embedding-vision-plus' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'wanx2.1-t2i-turbo' })).toEqual(['image-gen'])
  })

  it('默认模型不会再自动写回 Provider 模型池', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_1',
          name: 'Provider 1',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
      defaults: {
        defaultModel: 'gpt-4.1-mini',
        embeddingModel: 'text-embedding-3-small',
        documentModel: 'gpt-4.1',
      },
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.models.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(registry.providers[0]?.models.some(item => item.model === 'text-embedding-3-small')).toBe(false)
    expect(registry.providers[0]?.models.some(item => item.model === 'gpt-4.1')).toBe(false)
  })

  it('旧场景模型链会自动迁移为 modelFallback 与首个 Provider 绑定', () => {
    const runtime = createRuntime()
    runtime.ai.channelsJson = JSON.stringify({
      items: [
        {
          key: 'project_chat',
          models: ['gpt-4.1-mini'],
          enabled: true,
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    const projectChat = registry.channels.find(item => item.key === 'project_chat')

    expect(projectChat?.providerIds).toEqual(['provider_1'])
    expect(projectChat?.modelFallback).toEqual(['gpt-4.1-mini'])
  })

  it('多 Provider 场景会先按模型链，再在同模型下展开 Provider 候选', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi-a.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
            { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          ],
        },
        {
          id: 'provider_b',
          name: 'Provider B',
          type: 'openai-compatible',
          provider: 'openai-compatible',
          baseURL: 'https://openai-compatible.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
            { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
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
          providerIds: ['provider_a', 'provider_b'],
          loadBalanceStrategy: 'round_robin',
          modelFallback: ['gpt-4.1-mini', 'gpt-4.1'],
          enabled: true,
        },
      ],
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.candidates.map(item => item.ai.model)).toEqual([
      'gpt-4.1-mini',
      'gpt-4.1-mini',
      'gpt-4.1',
      'gpt-4.1',
    ])
    expect(resolved.candidates.map(item => item.provider?.id)).toEqual([
      'provider_a',
      'provider_b',
      'provider_a',
      'provider_b',
    ])
  })

  it('聊天场景只会选择 chat 能力模型，并使用模型级 clientType', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          clientType: 'bailian-native',
          baseURL: 'https://newapi-a.example',
          models: [
            { model: 'text-embedding-v4', enabled: true, format: 'openai-compatible', capabilities: ['embedding'] },
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible', capabilities: ['chat'], clientType: 'langchain' },
          ],
        },
      ],
      defaults: {
        defaultModel: 'text-embedding-v4',
        embeddingModel: 'text-embedding-v4',
        visionModel: '',
        documentModel: 'gpt-4.1-mini',
      },
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.ai.model).toBe('gpt-4.1-mini')
    expect(resolved.ai.clientType).toBe('langchain')
  })

  it('知识库 Embedding 场景只会选择 embedding 能力模型', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'dashscope-bailian',
          provider: 'dashscope',
          baseURL: 'https://dashscope.aliyuncs.com',
          models: [
            { model: 'qwen-plus', enabled: true, format: 'openai-compatible', capabilities: ['chat'] },
            { model: 'text-embedding-v4', enabled: true, format: 'openai-compatible', capabilities: ['embedding'] },
          ],
        },
      ],
      defaults: {
        defaultModel: 'qwen-plus',
        embeddingModel: 'text-embedding-v4',
        visionModel: '',
        documentModel: 'qwen-plus',
      },
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'knowledge_embedding',
          providerIds: ['provider_a'],
          modelFallback: ['qwen-plus', 'text-embedding-v4'],
          enabled: true,
        },
      ],
    })

    expect(resolvePlatformAiChannelModelCapability('knowledge_embedding')).toBe('embedding')
    expect(resolvePlatformAiChannelModelCapability('project_chat')).toBe('chat')

    const resolved = resolveAiRuntimeForChannel(runtime, 'knowledge_embedding')
    expect(resolved.ai.model).toBe('text-embedding-v4')
    expect(resolved.provider?.id).toBe('provider_a')
    expect(resolved.candidates[0]?.modelConfig?.model).toBe('text-embedding-v4')
    expect(resolved.candidates.map(item => item.ai.model)).toEqual(['text-embedding-v4'])
  })

  it('默认 embedding 模型只能从 embedding 能力模型解析', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'dashscope-bailian',
          provider: 'dashscope',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          models: [
            { model: 'qwen-plus', enabled: true, format: 'response', capabilities: ['chat'] },
            { model: 'tongyi-embedding-vision-plus', enabled: true, format: 'openai-compatible', capabilities: ['embedding'], embeddingDimensions: 1024 },
          ],
        },
      ],
      defaults: {
        defaultModel: 'qwen-plus',
        embeddingModel: 'tongyi-embedding-vision-plus',
        visionModel: '',
        documentModel: 'qwen-plus',
      },
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.models.find(item => item.model === 'qwen-plus')?.format).toBe('openai-compatible')
    const embeddingRuntime = resolvePlatformAiRuntimeByCapability(runtime, 'embedding')
    expect(embeddingRuntime?.modelConfig.model).toBe('tongyi-embedding-vision-plus')
    expect(embeddingRuntime?.modelConfig.embeddingApiStyle).toBe('bailian-multimodal')
    expect(resolvePlatformAiChannelModelCapability('knowledge_embedding')).toBe('embedding')

    const embeddingScene = registry.channels.find(item => item.key === 'knowledge_embedding')
    expect(embeddingScene?.modelFallback).toEqual(['tongyi-embedding-vision-plus'])
    const embeddingSceneRuntime = resolveAiRuntimeForChannel(runtime, 'knowledge_embedding')
    expect(embeddingSceneRuntime.ai.model).toBe('tongyi-embedding-vision-plus')
  })

  it('只绑定 search-only Provider 时会回退到未配置运行时', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_search',
          name: 'Tavily',
          type: 'tavily',
          provider: 'tavily',
          baseURL: 'https://api.tavily.com',
        },
      ],
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
          providerIds: ['provider_search'],
          modelFallback: ['gpt-4.1-mini'],
          enabled: true,
        },
      ],
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.provider).toBeNull()
    expect(resolved.usedFallback).toBe(true)
  })

  it('统一 AI 入口会在同模型 Provider 失败后切换下一 Provider，再继续下一模型', async () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi-a.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
            { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          ],
        },
        {
          id: 'provider_b',
          name: 'Provider B',
          type: 'openai-compatible',
          provider: 'openai-compatible',
          baseURL: 'https://openai-compatible.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
            { model: 'gpt-4.1', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
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
          providerIds: ['provider_a', 'provider_b'],
          loadBalanceStrategy: 'round_robin',
          modelFallback: ['gpt-4.1-mini', 'gpt-4.1'],
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
      return `${ai.provider}:${ai.model}`
    })

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(20)
    const result = await task

    expect(result.data.endsWith(':gpt-4.1-mini')).toBe(true)
    expect(result.attemptChain).toHaveLength(2)
    expect(result.attemptChain[0]?.provider).not.toBe(result.attemptChain[1]?.provider)
    expect(result.attemptChain).toEqual([
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        success: false,
        latencyMs: 10,
        error: 'FIRST_FAILED',
      }),
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        success: true,
        latencyMs: 20,
      }),
    ])
    expect(warnSpy).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
