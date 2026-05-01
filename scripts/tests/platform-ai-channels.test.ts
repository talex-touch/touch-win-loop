import type { RuntimeSettings } from '~~/server/utils/env'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDefenseRealtimeQwenApiKey } from '~~/server/utils/defense-realtime'
import {
  buildPlatformAiChannelsJson,
  buildPlatformAiRegistryJson,
  getPlatformAiChannelDefinitions,
  inferPlatformAiModelCapabilities,
  resolveAiRuntimeForChannel,
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
    projectResource: {
      accessUrlTtlSeconds: 600,
    },
    meeting: {
      rtc: {
        provider: '',
        serverUrl: '',
        apiKey: '',
        apiSecret: '',
        embedBaseUrl: '',
        webhookSecret: '',
        roomPrefix: '',
      },
      asr: {
        provider: '',
        serviceUrl: '',
        apiKey: '',
        webhookSecret: '',
      },
      worker: {
        enabled: false,
        intervalMs: 1000,
        batchSize: 1,
        maxAttempts: 1,
      },
    },
    defenseRealtime: {
      qwen: {
        baseWsUrl: 'wss://dashscope.aliyuncs.com/api-ws/v1/inference',
        apiKey: '',
        workspaceId: '',
        appId: '',
        voice: '',
        frameIntervalMs: 1000,
      },
      coze: {
        baseUrl: 'https://api.coze.cn',
        botId: '',
        connectorId: '',
        voiceId: '',
        authMode: 'pat',
        patOrOauthSecret: '',
      },
    },
  } as RuntimeSettings
}

describe('platform-ai-channels', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('空 Provider registry 不再从旧 runtime 默认值合成 Provider', () => {
    const runtime = createRuntime()
    const registry = resolvePlatformAiRegistry(runtime)
    const projectChat = registry.channels.find(item => item.key === 'project_chat')

    expect(registry.providers).toEqual([])
    expect(projectChat?.providerIds).toEqual([])
    expect(projectChat?.models).toEqual([])
    expect(projectChat?.modelFallback).toEqual([])

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.provider).toBeNull()
    expect(resolved.ai.provider).toBe('')
    expect(resolved.ai.model).toBe('')
    expect(resolved.usedFallback).toBe(true)
  })

  it('保存空 Provider registry 不会把旧 runtime 默认值写回模型池', () => {
    const runtime = createRuntime()
    const registryJson = buildPlatformAiRegistryJson(runtime, {
      providers: [],
    })

    expect(registryJson).not.toMatch(/gpt-4\.1-mini/)

    runtime.ai.providersJson = registryJson
    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers).toEqual([])
  })

  it('provider registry 不再从旧 runtime 默认值借用全局 API Key', () => {
    const runtime = createRuntime()
    runtime.ai.apiKey = 'legacy-global-key'
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.apiKey).toBe('')
  })

  it('答辩 qwen key 只会从 defense 场景绑定的百炼 Provider 派生', () => {
    const runtime = createRuntime()

    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'shared',
          name: 'Shared NewAPI',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          apiKey: 'newapi-provider-key',
          models: [
            { model: 'qwen-plus', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'defense',
          providerIds: ['shared'],
          models: ['qwen-plus'],
          modelFallback: ['qwen-plus'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
      ],
    })

    expect(resolveDefenseRealtimeQwenApiKey(runtime)).toBe('')

    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'dashscope',
          name: 'DashScope',
          type: 'dashscope-bailian',
          provider: 'dashscope',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          apiKey: 'dashscope-native-key',
          models: [
            { model: 'qwen-plus', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'defense',
          providerIds: ['dashscope'],
          models: ['qwen-plus'],
          modelFallback: ['qwen-plus'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
      ],
    })

    expect(resolveDefenseRealtimeQwenApiKey(runtime)).toBe('dashscope-native-key')
  })

  it('模型名会启发式识别能力', () => {
    expect(inferPlatformAiModelCapabilities({ model: 'qwen-plus' })).toEqual(['chat'])
    expect(inferPlatformAiModelCapabilities({ model: 'qwen-vl-max' })).toEqual(['chat', 'vision'])
    expect(inferPlatformAiModelCapabilities({ model: 'text-embedding-v4' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'qwen3-vl-embedding' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'tongyi-embedding-vision-plus' })).toEqual(['embedding'])
    expect(inferPlatformAiModelCapabilities({ model: 'gpt-4o-mini-transcribe' })).toEqual(['asr'])
    expect(inferPlatformAiModelCapabilities({ model: 'tts-1' })).toEqual(['tts'])
    expect(inferPlatformAiModelCapabilities({ model: 'wanx2.1-t2i-turbo' })).toEqual(['image-gen'])
  })

  it('场景定义声明所需模型能力和允许的 Provider 类型', () => {
    const definitions = getPlatformAiChannelDefinitions()
    const meetingAsr = definitions.find(item => item.key === 'meeting_asr')
    const speechTts = definitions.find(item => item.key === 'speech_tts')
    const defense = definitions.find(item => item.key === 'defense')
    const visualEmbedding = definitions.find(item => item.key === 'knowledge_visual_embedding')

    expect(meetingAsr?.requiredModelCapability).toBe('asr')
    expect(meetingAsr?.allowedProviderCapabilities).toEqual(['llm', 'asr', 'voice'])
    expect(speechTts?.requiredModelCapability).toBe('tts')
    expect(speechTts?.allowedProviderCapabilities).toEqual(['llm', 'tts', 'voice'])
    expect(defense?.allowedProviderCapabilities).toEqual(['llm', 'voice'])
    expect(visualEmbedding?.requiredModelCapability).toBe('embedding')
    expect(visualEmbedding?.allowedProviderCapabilities).toEqual(['llm', 'embedding'])
    expect(visualEmbedding?.embeddingApiStyle).toBe('bailian-multimodal')
  })

  it('asr/tts 场景只从允许 Provider 的匹配模型池解析运行时', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_chat',
          name: 'Chat Provider',
          type: 'openai-compatible',
          provider: 'openai-compatible',
          baseURL: 'https://chat.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible', capabilities: ['chat'] },
            { model: 'tts-1', enabled: true, format: 'openai-compatible', capabilities: ['tts'] },
          ],
        },
        {
          id: 'provider_asr',
          name: 'ASR Provider',
          type: 'openai-compatible',
          capability: 'asr',
          provider: 'openai-compatible',
          baseURL: 'https://asr.example',
          models: [
            { model: 'whisper-1', enabled: true, format: 'openai-compatible', capabilities: ['asr'] },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'meeting_asr',
          providerIds: ['provider_asr', 'provider_chat'],
          models: ['whisper-1', 'gpt-4.1-mini'],
          modelFallback: ['whisper-1', 'gpt-4.1-mini'],
          enabled: true,
        },
        {
          key: 'speech_tts',
          providerIds: ['provider_chat'],
          models: ['tts-1', 'whisper-1'],
          modelFallback: ['tts-1', 'whisper-1'],
          enabled: true,
        },
        {
          key: 'project_chat',
          providerIds: ['provider_asr'],
          models: ['whisper-1'],
          modelFallback: ['whisper-1'],
          enabled: true,
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.channels.find(item => item.key === 'meeting_asr')?.models).toEqual(['whisper-1'])
    expect(registry.channels.find(item => item.key === 'speech_tts')?.models).toEqual(['tts-1'])
    expect(registry.channels.find(item => item.key === 'project_chat')?.providerIds).toEqual([])

    expect(resolveAiRuntimeForChannel(runtime, 'meeting_asr').ai.model).toBe('whisper-1')
    expect(resolveAiRuntimeForChannel(runtime, 'speech_tts').ai.model).toBe('tts-1')
    expect(resolveAiRuntimeForChannel(runtime, 'project_chat').ai.model).toBe('')
  })

  it('dashScope Embedding only Provider 只进入知识库 Embedding 场景', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'dashscope_embeddings',
          name: 'DashScope Embeddings',
          type: 'dashscope-bailian',
          capability: 'embedding',
          provider: 'dashscope',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          models: [
            { model: 'text-embedding-v4', enabled: true, format: 'openai-compatible', capabilities: ['embedding'], embeddingApiStyle: 'openai-compatible-text' },
            { model: 'tongyi-embedding-vision-plus', enabled: true, format: 'openai-compatible', capabilities: ['embedding'], embeddingApiStyle: 'bailian-multimodal' },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['dashscope_embeddings'],
          models: ['text-embedding-v4'],
          modelFallback: ['text-embedding-v4'],
          enabled: true,
        },
        {
          key: 'knowledge_embedding',
          providerIds: ['dashscope_embeddings'],
          models: ['text-embedding-v4'],
          modelFallback: ['text-embedding-v4'],
          enabled: true,
        },
        {
          key: 'knowledge_visual_embedding',
          providerIds: ['dashscope_embeddings'],
          models: ['tongyi-embedding-vision-plus'],
          modelFallback: ['tongyi-embedding-vision-plus'],
          enabled: true,
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.capability).toBe('embedding')
    expect(registry.channels.find(item => item.key === 'project_chat')?.providerIds).toEqual([])
    expect(registry.channels.find(item => item.key === 'knowledge_embedding')?.providerIds).toEqual(['dashscope_embeddings'])
    expect(registry.channels.find(item => item.key === 'knowledge_visual_embedding')?.providerIds).toEqual(['dashscope_embeddings'])
    expect(resolveAiRuntimeForChannel(runtime, 'project_chat').provider).toBeNull()
    expect(resolveAiRuntimeForChannel(runtime, 'knowledge_embedding').ai.model).toBe('text-embedding-v4')
    expect(resolveAiRuntimeForChannel(runtime, 'knowledge_visual_embedding').ai.model).toBe('tongyi-embedding-vision-plus')
  })

  it('coze 语音 Provider 可作为 ASR/TTS 的无模型运行时候选', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'coze_voice',
          name: 'Coze Voice',
          type: 'coze-voice',
          provider: 'coze',
          baseURL: 'https://api.coze.cn',
          apiKey: 'coze-token',
          voice: {
            botId: 'bot_1',
            connectorId: 'connector_1',
            voiceId: 'voice_1',
            authMode: 'pat',
          },
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'meeting_asr',
          providerIds: ['coze_voice'],
          models: [],
          modelFallback: [],
          enabled: true,
        },
        {
          key: 'speech_tts',
          providerIds: ['coze_voice'],
          models: [],
          modelFallback: [],
          enabled: true,
        },
      ],
    })

    const asr = resolveAiRuntimeForChannel(runtime, 'meeting_asr')
    const tts = resolveAiRuntimeForChannel(runtime, 'speech_tts')

    expect(asr.provider?.type).toBe('coze-voice')
    expect(asr.provider?.capability).toBe('voice')
    expect(asr.ai.model).toBe('')
    expect(asr.candidates).toHaveLength(1)
    expect(tts.provider?.type).toBe('coze-voice')
    expect(tts.ai.model).toBe('')
    expect(tts.candidates).toHaveLength(1)
  })

  it('保存 Provider registry 时不再持久化 defaults，也不会把旧默认模型写回模型池', () => {
    const runtime = createRuntime()
    const registryJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_1',
          name: 'Provider 1',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          visionModel: 'qwen-vl-max',
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

    expect(registryJson).not.toMatch(/"defaults"/)

    runtime.ai.providersJson = registryJson
    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.models.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(registry.providers[0]?.models.some(item => item.model === 'text-embedding-3-small')).toBe(false)
    expect(registry.providers[0]?.models.some(item => item.model === 'gpt-4.1')).toBe(false)
    expect(registry.providers[0]?.models.some(item => item.model === 'qwen-vl-max')).toBe(false)
  })

  it('旧 registry object 形态不再迁移 sharedProvider 和 modelPool', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = JSON.stringify({
      version: 2,
      sharedProvider: {
        id: 'legacy_provider',
        provider: 'newapi',
        baseURL: 'https://legacy.example',
      },
      modelPool: {
        items: [
          { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
        ],
      },
      defaults: {
        defaultModel: 'gpt-4.1-mini',
      },
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers).toEqual([])

    const registryJson = buildPlatformAiRegistryJson(runtime, {
      sharedProvider: {
        id: 'legacy_provider',
        provider: 'newapi',
        baseURL: 'https://legacy.example',
      },
      modelPool: {
        items: [
          { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
        ],
      },
    })
    expect(registryJson).not.toMatch(/legacy_provider/)
    expect(registryJson).not.toMatch(/gpt-4\.1-mini/)
  })

  it('旧场景模型链没有显式 Provider 时保持未接通', () => {
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
    expect(projectChat?.providerIds).toEqual([])
    expect(projectChat?.models).toEqual([])
    expect(projectChat?.modelFallback).toEqual([])
  })

  it('构建场景配置时显式空 Provider 列表不会回退到 runtime registry', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
    })

    const channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_a'],
          models: ['gpt-4.1-mini'],
          modelFallback: ['gpt-4.1-mini'],
          enabled: true,
        },
      ],
    }, [])

    runtime.ai.channelsJson = channelsJson
    const registry = resolvePlatformAiRegistry(runtime)
    const projectChat = registry.channels.find(item => item.key === 'project_chat')
    expect(projectChat?.providerIds).toEqual([])
    expect(projectChat?.models).toEqual([])
    expect(projectChat?.modelFallback).toEqual([])
  })

  it('场景运行时不再从旧 runtime 默认值借用全局 API Key', () => {
    const runtime = createRuntime()
    runtime.ai.apiKey = 'legacy-global-key'
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_a',
          name: 'Provider A',
          type: 'newapi',
          provider: 'newapi',
          baseURL: 'https://newapi.example',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible' },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_a'],
          models: ['gpt-4.1-mini'],
          modelFallback: ['gpt-4.1-mini'],
          enabled: true,
        },
      ],
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.ai.apiKey).toBe('')
  })

  it('场景显式留空时保持未配置状态，不再共享兜底', () => {
    const runtime = createRuntime()
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: [],
          models: ['gpt-4.1-mini'],
          modelFallback: ['gpt-4.1-mini'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    const projectChat = registry.channels.find(item => item.key === 'project_chat')
    expect(projectChat?.providerIds).toEqual([])
    expect(projectChat?.models).toEqual([])
    expect(projectChat?.modelFallback).toEqual([])

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.provider).toBeNull()
    expect(resolved.ai.model).toBe('')
    expect(resolved.usedFallback).toBe(true)
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
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_a', 'provider_b'],
          loadBalanceStrategy: 'round_robin',
          models: ['gpt-4.1-mini', 'gpt-4.1'],
          modelFallback: ['gpt-4.1-mini', 'gpt-4.1'],
          failoverStrategy: 'model_then_provider',
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

  it('显式场景只会选择匹配能力的模型，视觉投影走独立 vision 场景', () => {
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
            { model: 'qwen-plus', enabled: true, format: 'openai-compatible', capabilities: ['chat'] },
            { model: 'text-embedding-v4', enabled: true, format: 'openai-compatible', capabilities: ['embedding'], embeddingApiStyle: 'openai-compatible-text', embeddingDimensions: 1024 },
            { model: 'tongyi-embedding-vision-plus', enabled: true, format: 'openai-compatible', capabilities: ['embedding'], embeddingApiStyle: 'bailian-multimodal', embeddingDimensions: 1024 },
            { model: 'qwen-vl-max', enabled: true, format: 'openai-compatible', capabilities: ['chat', 'vision'] },
          ],
        },
      ],
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_a'],
          models: ['qwen-plus'],
          modelFallback: ['qwen-plus'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
        {
          key: 'knowledge_embedding',
          providerIds: ['provider_a'],
          models: ['text-embedding-v4'],
          modelFallback: ['text-embedding-v4'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
        {
          key: 'knowledge_visual_embedding',
          providerIds: ['provider_a'],
          models: ['tongyi-embedding-vision-plus'],
          modelFallback: ['tongyi-embedding-vision-plus'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
        {
          key: 'knowledge_visual_projection',
          providerIds: ['provider_a'],
          models: ['qwen-vl-max'],
          modelFallback: ['qwen-vl-max'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
      ],
    })

    expect(resolveAiRuntimeForChannel(runtime, 'project_chat').ai.model).toBe('qwen-plus')
    expect(resolveAiRuntimeForChannel(runtime, 'knowledge_embedding').ai.model).toBe('text-embedding-v4')
    expect(resolveAiRuntimeForChannel(runtime, 'knowledge_visual_embedding').ai.model).toBe('tongyi-embedding-vision-plus')
    expect(resolveAiRuntimeForChannel(runtime, 'knowledge_visual_projection').ai.model).toBe('qwen-vl-max')

    const capabilityRuntime = resolvePlatformAiRuntimeByCapability(runtime, 'embedding', 'text-embedding-v4')
    expect(capabilityRuntime?.modelConfig.model).toBe('text-embedding-v4')
    expect(capabilityRuntime?.modelConfig.embeddingApiStyle).toBe('openai-compatible-text')
  })

  it('只绑定 search-only Provider 时会返回未配置运行时', () => {
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
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_search'],
          models: ['gpt-4.1-mini'],
          modelFallback: ['gpt-4.1-mini'],
          failoverStrategy: 'model_then_provider',
          enabled: true,
        },
      ],
    })

    const resolved = resolveAiRuntimeForChannel(runtime, 'project_chat')
    expect(resolved.provider).toBeNull()
    expect(resolved.ai.model).toBe('')
    expect(resolved.usedFallback).toBe(true)
  })

  it('搜索型 Provider 类型不会被显式能力改成模型路由 Provider', () => {
    const runtime = createRuntime()
    runtime.ai.providersJson = buildPlatformAiRegistryJson(runtime, {
      providers: [
        {
          id: 'provider_search',
          name: 'Tavily',
          type: 'tavily',
          capability: 'llm',
          provider: 'tavily',
          baseURL: 'https://api.tavily.com',
          models: [
            { model: 'gpt-4.1-mini', enabled: true, format: 'openai-compatible', capabilities: ['chat'] },
          ],
        },
      ],
    })

    const registry = resolvePlatformAiRegistry(runtime)
    expect(registry.providers[0]?.capability).toBe('search')
    expect(registry.providers[0]?.models).toEqual([])
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
    })
    runtime.ai.channelsJson = buildPlatformAiChannelsJson(runtime, {
      items: [
        {
          key: 'project_chat',
          providerIds: ['provider_a', 'provider_b'],
          loadBalanceStrategy: 'round_robin',
          models: ['gpt-4.1-mini', 'gpt-4.1'],
          modelFallback: ['gpt-4.1-mini', 'gpt-4.1'],
          failoverStrategy: 'model_then_provider',
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
