import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { RuntimeSettings } from '~~/server/utils/env'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {},
    storage: {},
  }),
}))

let normalizeRuntimeStorageSettings: typeof import('~~/server/utils/env').normalizeRuntimeStorageSettings
let normalizeStoragePoolDraft: typeof import('~~/server/utils/storage-service-store').normalizeStoragePoolDraft
let selectStorageWriteChannel: typeof import('~~/server/utils/storage-service-store').selectStorageWriteChannel
let STORAGE_WATERMARK_DEFAULT_PERCENT: typeof import('~~/server/utils/storage-service-store').STORAGE_WATERMARK_DEFAULT_PERCENT

beforeAll(async () => {
  const env = await import('~~/server/utils/env')
  const storageStore = await import('~~/server/utils/storage-service-store')
  normalizeRuntimeStorageSettings = env.normalizeRuntimeStorageSettings
  normalizeStoragePoolDraft = storageStore.normalizeStoragePoolDraft
  selectStorageWriteChannel = storageStore.selectStorageWriteChannel
  STORAGE_WATERMARK_DEFAULT_PERCENT = storageStore.STORAGE_WATERMARK_DEFAULT_PERCENT
})

function createRuntime(storage: Partial<RuntimeSettings['storage']> = {}): RuntimeSettings {
  return {
    envPriority: '',
    apiBaseUrl: '/api',
    build: { version: '', commitSha: '' },
    ai: {
      provider: '',
      clientType: 'langchain',
      baseURL: '',
      apiKey: '',
      model: '',
      embeddingModel: '',
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
      provider: '',
      baseURL: '',
      apiKey: '',
      model: '',
      modelPricingJson: '',
      timeoutMs: 15000,
      maxRetries: 2,
    },
    auth: { registrationEnabled: true },
    onlyOffice: {
      endpoint: '',
      sourceBaseURL: '',
      jwtSecret: '',
      timeoutMs: 120000,
      retryLimit: 2,
      workerEnabled: true,
      workerIntervalMs: 5000,
      workerBatchSize: 2,
    },
    storage: normalizeRuntimeStorageSettings({
      provider: 'local',
      localRoot: './tmp/document-storage',
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      forcePathStyle: true,
      primaryChannelId: '',
      channels: [],
      ...storage,
    }),
    adminAi: {
      enabled: false,
      tavilyApiKey: '',
      webTimeoutMs: 12000,
      maxWebResults: 5,
      maxPageChars: 10000,
    },
    pg: { url: '' },
    redis: { url: '' },
    contest: { autoSeed: false },
    resourceRecycle: { enabled: true, intervalMs: 1800000, retentionDays: 30, batchSize: 200 },
    feishuScheduler: { enabled: true, intervalMs: 60000, batchSize: 20, lockTtlMs: 600000 },
    projectResource: { accessUrlTtlSeconds: 600 },
    meeting: {
      rtc: { provider: '', serverUrl: '', apiKey: '', apiSecret: '', embedBaseUrl: '', webhookSecret: '', roomPrefix: 'winloop' },
      asr: { provider: '', serviceUrl: '', apiKey: '', webhookSecret: '' },
      worker: { enabled: true, intervalMs: 5000, batchSize: 6, maxAttempts: 5 },
      monitoring: { prometheusBaseUrl: '' },
    },
    defenseRealtime: {
      qwen: { baseWsUrl: '', apiKey: '', workspaceId: '', appId: '', voice: '', frameIntervalMs: 1000 },
      coze: { baseUrl: '', botId: '', connectorId: '', voiceId: '', authMode: 'pat', patOrOauthSecret: '' },
    },
  }
}

function createDb(usedByChannel: Record<string, number>) {
  return {
    async query() {
      return {
        rows: Object.entries(usedByChannel).map(([channelId, usedBytes]) => ({
          channel_id: channelId,
          provider: channelId,
          workspace_id: 'workspace-1',
          workspace_name: 'Workspace',
          object_count: '1',
          used_bytes: String(usedBytes),
        })),
      }
    },
  }
}

describe('storage service selection', () => {
  it('默认归一化会保留 local 渠道并补 90 水位', () => {
    const storage = normalizeRuntimeStorageSettings({
      provider: 'local',
      localRoot: './tmp/document-storage',
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      forcePathStyle: true,
      primaryChannelId: '',
      channels: [],
    })

    expect(storage.primaryChannelId).toBe('local')
    expect(storage.channels.some(channel => channel.id === 'local')).toBe(true)
    expect(storage.channels.find(channel => channel.id === 'local')?.watermarkPercent).toBe(STORAGE_WATERMARK_DEFAULT_PERCENT)
  })

  it('按用户配置水位判断主渠道是否可写', async () => {
    const runtime = createRuntime({
      primaryChannelId: 's3-a',
      channels: [
        { id: 'local', name: '本机存储', provider: 'local', enabled: true, priority: 0, capacityBytes: 0, watermarkPercent: 90, localRoot: './tmp/document-storage', endpoint: '', region: '', bucket: '', accessKey: '', secretKey: '', forcePathStyle: true },
        { id: 's3-a', name: 'S3 A', provider: 's3', enabled: true, priority: 1, capacityBytes: 1000, watermarkPercent: 80, localRoot: './tmp/document-storage', endpoint: 'https://s3.example.com', region: 'auto', bucket: 'a', accessKey: '', secretKey: '', forcePathStyle: true },
      ],
    })

    const selected = await selectStorageWriteChannel(createDb({ 's3-a': 700 }), runtime, 100)
    expect(selected.channel.id).toBe('s3-a')
    await expect(selectStorageWriteChannel(createDb({ 's3-a': 750, local: 0 }), runtime, 100)).resolves.toMatchObject({ channel: { id: 'local' } })
  })

  it('容量不限的渠道不受水位拦截', async () => {
    const runtime = createRuntime({
      primaryChannelId: 'local',
      channels: [
        { id: 'local', name: '本机存储', provider: 'local', enabled: true, priority: 0, capacityBytes: 0, watermarkPercent: 1, localRoot: './tmp/document-storage', endpoint: '', region: '', bucket: '', accessKey: '', secretKey: '', forcePathStyle: true },
      ],
    })

    const selected = await selectStorageWriteChannel(createDb({ local: 999999 }), runtime, 1024)
    expect(selected.channel.id).toBe('local')
  })

  it('所有有容量渠道达到水位时拒绝上传', async () => {
    const runtime = createRuntime({
      primaryChannelId: 's3-a',
      channels: [
        { id: 'local', name: '本机存储', provider: 'local', enabled: true, priority: 2, capacityBytes: 1000, watermarkPercent: 50, localRoot: './tmp/document-storage', endpoint: '', region: '', bucket: '', accessKey: '', secretKey: '', forcePathStyle: true },
        { id: 's3-a', name: 'S3 A', provider: 's3', enabled: true, priority: 0, capacityBytes: 1000, watermarkPercent: 50, localRoot: './tmp/document-storage', endpoint: 'https://s3.example.com', region: 'auto', bucket: 'a', accessKey: '', secretKey: '', forcePathStyle: true },
        { id: 'minio-a', name: 'MinIO A', provider: 'minio', enabled: true, priority: 1, capacityBytes: 1000, watermarkPercent: 50, localRoot: './tmp/document-storage', endpoint: 'http://127.0.0.1:9000', region: 'auto', bucket: 'b', accessKey: '', secretKey: '', forcePathStyle: true },
      ],
    })

    await expect(selectStorageWriteChannel(createDb({ 's3-a': 500, 'minio-a': 500, local: 500 }), runtime, 1)).rejects.toThrow('STORAGE_CAPACITY_EXCEEDED')
  })

  it('历史 provider 值会计入当前同 provider 渠道水位', async () => {
    const runtime = createRuntime({
      primaryChannelId: 's3-a',
      channels: [
        { id: 'local', name: '本机存储', provider: 'local', enabled: true, priority: 1, capacityBytes: 0, watermarkPercent: 90, localRoot: './tmp/document-storage', endpoint: '', region: '', bucket: '', accessKey: '', secretKey: '', forcePathStyle: true },
        { id: 's3-a', name: 'S3 A', provider: 's3', enabled: true, priority: 0, capacityBytes: 1000, watermarkPercent: 80, localRoot: './tmp/document-storage', endpoint: 'https://s3.example.com', region: 'auto', bucket: 'a', accessKey: '', secretKey: '', forcePathStyle: true },
      ],
    })

    await expect(selectStorageWriteChannel(createDb({ s3: 800, local: 0 }), runtime, 1)).resolves.toMatchObject({ channel: { id: 'local' } })
  })

  it('草稿归一化强制 local 为本机存储且历史 provider 值可解析', () => {
    const runtime = createRuntime()
    const storage = normalizeStoragePoolDraft(runtime, {
      primaryChannelId: 'local',
      channels: [
        { id: 'local', provider: 's3', name: 'bad local', bucket: 'bucket', watermarkPercent: 120 },
        { id: 'minio', provider: 'minio', name: 'MinIO', endpoint: 'http://127.0.0.1:9000', bucket: 'docs', watermarkPercent: 70 },
      ],
    })

    const local = storage.channels.find(channel => channel.id === 'local')
    expect(local?.provider).toBe('local')
    expect(local?.watermarkPercent).toBe(100)
    expect(storage.channels.find(channel => channel.provider === 'minio')?.id).toBe('minio')
  })
})
