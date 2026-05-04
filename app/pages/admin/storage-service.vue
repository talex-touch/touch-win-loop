<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type StorageProvider = 'local' | 's3' | 'minio'
type SecretMode = 'keep' | 'replace' | 'clear'

interface StorageChannelConfig {
  id: string
  name: string
  provider: StorageProvider
  enabled: boolean
  priority: number
  capacityBytes: number
  watermarkPercent: number
  localRoot: string
  endpoint: string
  region: string
  bucket: string
  accessKeyConfigured: boolean
  secretKeyConfigured: boolean
  forcePathStyle: boolean
}

interface StorageChannelUsage {
  channelId: string
  name: string
  provider: StorageProvider
  enabled: boolean
  priority: number
  capacityBytes: number
  watermarkPercent: number
  usedBytes: number
  objectCount: number
  usagePercent: number
  watermarkBytes: number
  writeAvailable: boolean
}

interface StorageTrendPoint {
  date: string
  uploadBytes: number
  downloadBytes: number
  uploadCount: number
  downloadCount: number
}

interface StorageServicePayload {
  config: {
    primaryChannelId: string
    configSource: 'env' | 'override'
    updatedAt: string
    updatedByUserId: string
    channels: StorageChannelConfig[]
  }
  overview: {
    totalUsedBytes: number
    totalObjectCount: number
    activeChannelId: string
    activeProvider: string
    channelCount: number
    enabledChannelCount: number
    uploadBytes30d: number
    downloadBytes30d: number
  }
  channels: StorageChannelUsage[]
  distribution: Array<{
    channelId: string
    name: string
    provider: string
    usedBytes: number
    percent: number
  }>
  trends: StorageTrendPoint[]
  topUsers: Array<{
    userId: string
    username: string
    downloadBytes: number
    downloadCount: number
  }>
  topWorkspaces: Array<{
    workspaceId: string
    workspaceName: string
    storageBytes: number
    uploadBytes: number
    downloadBytes: number
    uploadCount: number
    downloadCount: number
  }>
}

interface ChannelDraft extends StorageChannelConfig {
  accessKeyMode: SecretMode
  accessKey: string
  secretKeyMode: SecretMode
  secretKey: string
}

interface StorageProbeResult {
  ok: boolean
  channelId: string
  channelName: string
  provider: string
  bucket: string
  endpoint: string
  latencyMs: number
  detail: string
}

interface TrendChart {
  width: number
  height: number
  labels: string[]
  uploadLine: string
  downloadLine: string
  uploadArea: string
  downloadArea: string
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const saving = ref(false)
const testingChannelId = ref('')
const errorText = ref('')
const successText = ref('')
const probeText = ref('')
const payload = ref<StorageServicePayload | null>(null)
const primaryChannelId = ref('local')
const channelDrafts = ref<ChannelDraft[]>([])
const expandedChannelIds = ref<string[]>([])

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function formatNumber(value: unknown): string {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatPercent(value: unknown): string {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatBytes(value: unknown): string {
  const bytes = Math.max(0, Number(value || 0))
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let current = bytes
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatTime(raw: string): string {
  const text = normalizeString(raw)
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', { hour12: false })
}

function providerLabel(provider: string): string {
  if (provider === 'minio')
    return 'MinIO'
  if (provider === 's3')
    return 'S3'
  return 'Local'
}

function providerTone(provider: string): string {
  if (provider === 's3')
    return 'blue'
  if (provider === 'minio')
    return 'green'
  return 'gray'
}

function makeDraft(channel: StorageChannelConfig): ChannelDraft {
  return {
    ...channel,
    accessKeyMode: 'keep',
    accessKey: '',
    secretKeyMode: 'keep',
    secretKey: '',
  }
}

function applyPayload(nextPayload: StorageServicePayload): void {
  payload.value = nextPayload
  primaryChannelId.value = nextPayload.config.primaryChannelId || 'local'
  channelDrafts.value = nextPayload.config.channels.map(makeDraft)
  const channelIds = new Set(channelDrafts.value.map(channel => channel.id))
  expandedChannelIds.value = expandedChannelIds.value.filter(id => channelIds.has(id))
}

async function loadStorageService(showLoading = false): Promise<void> {
  if (showLoading)
    loading.value = true
  errorText.value = ''
  successText.value = ''
  probeText.value = ''
  try {
    const response = await fetch(endpoint('/admin/storage-service'), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<StorageServicePayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '存储服务加载失败。'))
    applyPayload(result.data)
  }
  catch (error: any) {
    payload.value = null
    channelDrafts.value = []
    errorText.value = String(error?.data?.message || error?.message || '存储服务加载失败。')
  }
  finally {
    loading.value = false
  }
}

function buildChannelPatch(channel: ChannelDraft) {
  return {
    id: normalizeString(channel.id),
    name: normalizeString(channel.name),
    provider: channel.provider,
    enabled: Boolean(channel.enabled),
    priority: Number(channel.priority || 0),
    capacityBytes: Number(channel.capacityBytes || 0),
    watermarkPercent: Number(channel.watermarkPercent || 90),
    localRoot: normalizeString(channel.localRoot) || './tmp/document-storage',
    endpoint: normalizeString(channel.endpoint),
    region: normalizeString(channel.region),
    bucket: normalizeString(channel.bucket),
    accessKeyMode: channel.accessKeyMode,
    accessKey: channel.accessKey,
    secretKeyMode: channel.secretKeyMode,
    secretKey: channel.secretKey,
    forcePathStyle: Boolean(channel.forcePathStyle),
  }
}

function buildPatchPayload() {
  return {
    primaryChannelId: primaryChannelId.value,
    channels: channelDrafts.value.map(buildChannelPatch),
  }
}

async function saveStorageService(): Promise<void> {
  saving.value = true
  errorText.value = ''
  successText.value = ''
  probeText.value = ''
  try {
    const response = await fetch(endpoint('/admin/storage-service'), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPatchPayload()),
    })
    const result = await response.json().catch(() => null) as ApiResponse<StorageServicePayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '存储服务保存失败。'))
    applyPayload(result.data)
    successText.value = '存储服务已保存。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '存储服务保存失败。')
  }
  finally {
    saving.value = false
  }
}

async function testStorageChannel(channelId: string): Promise<void> {
  testingChannelId.value = channelId
  errorText.value = ''
  probeText.value = ''
  try {
    const response = await fetch(endpoint('/admin/storage-service/test'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...buildPatchPayload(),
        channelId,
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<StorageProbeResult> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '存储探针失败。'))
    probeText.value = `${result.data.channelName} 探针通过，latency=${result.data.latencyMs}ms。`
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '存储探针失败。')
  }
  finally {
    testingChannelId.value = ''
  }
}

function addChannel(provider: StorageProvider): void {
  const count = channelDrafts.value.filter(item => item.provider === provider).length + 1
  const id = provider === 'local' ? `local-${count + 1}` : `${provider}-${count}`
  channelDrafts.value.push({
    id,
    name: provider === 's3' ? `S3 渠道 ${count}` : provider === 'minio' ? `MinIO 渠道 ${count}` : `本机存储 ${count}`,
    provider,
    enabled: true,
    priority: channelDrafts.value.length,
    capacityBytes: 0,
    watermarkPercent: 90,
    localRoot: './tmp/document-storage',
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyConfigured: false,
    secretKeyConfigured: false,
    forcePathStyle: true,
    accessKeyMode: 'keep',
    accessKey: '',
    secretKeyMode: 'keep',
    secretKey: '',
  })
  expandChannel(id)
}

function removeChannel(channelId: string): void {
  if (channelId === 'local')
    return
  channelDrafts.value = channelDrafts.value.filter(item => item.id !== channelId)
  expandedChannelIds.value = expandedChannelIds.value.filter(id => id !== channelId)
  if (primaryChannelId.value === channelId)
    primaryChannelId.value = channelDrafts.value.find(item => item.enabled)?.id || 'local'
}

function isChannelExpanded(channelId: string): boolean {
  return expandedChannelIds.value.includes(channelId)
}

function expandChannel(channelId: string): void {
  if (!expandedChannelIds.value.includes(channelId))
    expandedChannelIds.value = [...expandedChannelIds.value, channelId]
}

function toggleChannelExpanded(channelId: string): void {
  if (isChannelExpanded(channelId)) {
    expandedChannelIds.value = expandedChannelIds.value.filter(id => id !== channelId)
    return
  }
  expandChannel(channelId)
}

function usageFor(channelId: string): StorageChannelUsage | null {
  return payload.value?.channels.find(item => item.channelId === channelId) || null
}

function channelUsagePercent(channel: ChannelDraft): number {
  const usage = usageFor(channel.id)
  if (!usage || channel.capacityBytes <= 0)
    return 0
  return Math.max(0, Math.min(100, (usage.usedBytes / channel.capacityBytes) * 100))
}

function channelWatermarkBytes(channel: ChannelDraft): number {
  return channel.capacityBytes > 0
    ? Math.floor(channel.capacityBytes * (Number(channel.watermarkPercent || 90) / 100))
    : 0
}

function buildTrendChart(points: StorageTrendPoint[]): TrendChart {
  const width = 720
  const height = 220
  const padX = 36
  const padTop = 20
  const padBottom = 34
  const labels = points.slice(-6).map(item => item.date.slice(5))
  if (!points.length) {
    return { width, height, labels: [], uploadLine: '', downloadLine: '', uploadArea: '', downloadArea: '' }
  }
  const sliced = points.slice(-30)
  const maxValue = Math.max(1, ...sliced.flatMap(item => [item.uploadBytes, item.downloadBytes]))
  const usableWidth = width - padX * 2
  const usableHeight = height - padTop - padBottom
  const stepX = sliced.length > 1 ? usableWidth / (sliced.length - 1) : 0

  function toPoints(key: 'uploadBytes' | 'downloadBytes'): Array<{ x: number, y: number }> {
    return sliced.map((point, index) => ({
      x: padX + stepX * index,
      y: height - padBottom - (Number(point[key] || 0) / maxValue) * usableHeight,
    }))
  }

  function toPolyline(pointsForLine: Array<{ x: number, y: number }>): string {
    return pointsForLine.map(point => `${point.x},${point.y}`).join(' ')
  }

  function toArea(pointsForLine: Array<{ x: number, y: number }>): string {
    const first = pointsForLine[0]
    const last = pointsForLine[pointsForLine.length - 1]
    if (!first || !last)
      return ''
    return `M ${first.x} ${height - padBottom} L ${pointsForLine.map(point => `${point.x} ${point.y}`).join(' L ')} L ${last.x} ${height - padBottom} Z`
  }

  const uploadPoints = toPoints('uploadBytes')
  const downloadPoints = toPoints('downloadBytes')
  return {
    width,
    height,
    labels,
    uploadLine: toPolyline(uploadPoints),
    downloadLine: toPolyline(downloadPoints),
    uploadArea: toArea(uploadPoints),
    downloadArea: toArea(downloadPoints),
  }
}

const overviewCards = computed(() => {
  const source = payload.value
  return [
    { key: 'total', label: '总存储量', value: formatBytes(source?.overview.totalUsedBytes), hint: `${formatNumber(source?.overview.totalObjectCount)} 个对象` },
    { key: 'active', label: '当前写入渠道', value: source?.overview.activeChannelId || '-', hint: providerLabel(source?.overview.activeProvider || '') },
    { key: 'upload', label: '30 天上传', value: formatBytes(source?.overview.uploadBytes30d), hint: 'resource.upload 事件聚合' },
    { key: 'download', label: '30 天下载', value: formatBytes(source?.overview.downloadBytes30d), hint: 'resource.download 事件聚合' },
  ]
})

const trendChart = computed(() => buildTrendChart(payload.value?.trends || []))
const distributionTotal = computed(() => payload.value?.distribution.reduce((sum, item) => sum + Number(item.usedBytes || 0), 0) || 0)
const conicGradient = computed(() => {
  const items = payload.value?.distribution || []
  if (!items.length || distributionTotal.value <= 0)
    return 'conic-gradient(#e5e7eb 0deg 360deg)'
  const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2']
  let cursor = 0
  const stops = items.map((item, index) => {
    const degree = Number(item.percent || 0) * 3.6
    const start = cursor
    cursor += degree
    return `${colors[index % colors.length]} ${start}deg ${cursor}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
})

onMounted(async () => {
  await loadStorageService(true)
})
</script>

<template>
  <div class="storage-service text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold m-0 uppercase">
            存储服务
          </h1>
          <p class="text-[11px] text-slate-500 mb-0 mt-1">
            对象存储渠道、容量水位、流量趋势与消耗排行。
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <a-tag size="small" :color="payload?.config?.configSource === 'override' ? 'green' : 'gray'">
            {{ payload?.config?.configSource || 'env' }}
          </a-tag>
          <a-button size="small" type="outline" :loading="loading" @click="loadStorageService(false)">
            刷新
          </a-button>
          <a-button size="small" type="primary" :loading="saving" @click="saveStorageService">
            保存
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText && !payload" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else>
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>
      <section v-if="probeText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ probeText }}
      </section>
      <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        {{ errorText }}
      </section>

      <section class="grid gap-2 md:grid-cols-4">
        <div v-for="card in overviewCards" :key="card.key" class="storage-kpi">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.hint }}</small>
        </div>
      </section>

      <section class="grid gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div class="storage-panel">
          <div class="flex items-center justify-between mb-3">
            <h2>渠道占比</h2>
            <span>{{ formatBytes(distributionTotal) }}</span>
          </div>
          <div class="storage-distribution">
            <div class="storage-donut" :style="{ background: conicGradient }" />
            <div class="storage-distribution-list">
              <div v-for="item in payload?.distribution || []" :key="item.channelId" class="storage-row">
                <span>{{ item.name }}</span>
                <strong>{{ formatPercent(item.percent) }}</strong>
                <small>{{ formatBytes(item.usedBytes) }}</small>
              </div>
            </div>
          </div>
        </div>

        <div class="storage-panel">
          <div class="flex items-center justify-between mb-3">
            <h2>上传 / 下载趋势</h2>
            <span>近 30 天</span>
          </div>
          <svg class="storage-trend" :viewBox="`0 0 ${trendChart.width} ${trendChart.height}`" role="img" aria-label="存储流量趋势">
            <line x1="36" y1="20" x2="36" :y2="trendChart.height - 34" class="storage-chart-grid" />
            <line x1="36" :y1="trendChart.height - 34" :x2="trendChart.width - 36" :y2="trendChart.height - 34" class="storage-chart-grid" />
            <path v-if="trendChart.downloadArea" :d="trendChart.downloadArea" class="storage-area storage-area--download" />
            <path v-if="trendChart.uploadArea" :d="trendChart.uploadArea" class="storage-area storage-area--upload" />
            <polyline v-if="trendChart.downloadLine" :points="trendChart.downloadLine" class="storage-line storage-line--download" />
            <polyline v-if="trendChart.uploadLine" :points="trendChart.uploadLine" class="storage-line storage-line--upload" />
          </svg>
          <div class="storage-legend">
            <span><i class="legend-upload" />上传</span>
            <span><i class="legend-download" />下载</span>
          </div>
        </div>
      </section>

      <section class="storage-panel">
        <div class="flex flex-wrap gap-3 items-center justify-between mb-3">
          <div>
            <h2>渠道配置</h2>
            <p>local 默认存在；容量为 0 表示不限额，水位默认 90%。</p>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <label class="storage-inline-field">
              <span>主渠道</span>
              <a-select v-model="primaryChannelId" size="small" class="min-w-[160px]">
                <a-option v-for="channel in channelDrafts" :key="channel.id" :value="channel.id" :disabled="!channel.enabled">
                  {{ channel.name }}（{{ channel.id }}）
                </a-option>
              </a-select>
            </label>
            <a-dropdown trigger="click">
              <a-button size="small" type="outline">
                新增渠道
              </a-button>
              <template #content>
                <a-doption @click="addChannel('s3')">S3</a-doption>
                <a-doption @click="addChannel('minio')">MinIO</a-doption>
                <a-doption @click="addChannel('local')">本机存储</a-doption>
              </template>
            </a-dropdown>
          </div>
        </div>

        <div class="storage-channel-list">
          <article v-for="channel in channelDrafts" :key="channel.id" class="storage-channel">
            <div class="storage-channel-row">
              <button class="storage-channel-expand" type="button" @click="toggleChannelExpanded(channel.id)">
                <span class="storage-chevron" :class="{ 'storage-chevron--open': isChannelExpanded(channel.id) }">›</span>
              </button>
              <a-switch v-model="channel.enabled" size="small" />
              <div class="storage-channel-identity">
                <div class="flex flex-wrap gap-2 items-center">
                  <a-tag size="small" :color="providerTone(channel.provider)">
                    {{ providerLabel(channel.provider) }}
                  </a-tag>
                  <span class="font-semibold text-slate-900">{{ channel.name }}</span>
                  <span class="text-slate-400">{{ channel.id }}</span>
                  <a-tag v-if="channel.id === primaryChannelId" size="small" color="blue">写入</a-tag>
                </div>
                <div class="storage-channel-usage">
                  <div class="storage-usage-bar">
                    <span :style="{ width: `${channelUsagePercent(channel)}%` }" />
                  </div>
                  <span>{{ formatBytes(usageFor(channel.id)?.usedBytes || 0) }}</span>
                  <span v-if="channel.capacityBytes > 0">/ {{ formatBytes(channel.capacityBytes) }} · 水位 {{ formatBytes(channelWatermarkBytes(channel)) }}</span>
                  <span v-else>/ 不限额</span>
                </div>
              </div>
              <div class="storage-channel-row-actions">
                <span>{{ channel.enabled ? '启用' : '停用' }}</span>
                <span>优先级 {{ channel.priority }}</span>
                <a-button size="mini" type="text" @click="toggleChannelExpanded(channel.id)">
                  {{ isChannelExpanded(channel.id) ? '收起' : '详情' }}
                </a-button>
              </div>
            </div>

            <div v-if="isChannelExpanded(channel.id)" class="storage-channel-detail">
              <div class="storage-channel-grid">
                <label>
                  <span>名称</span>
                  <a-input v-model="channel.name" size="small" />
                </label>
                <label>
                  <span>ID</span>
                  <a-input v-model="channel.id" size="small" :disabled="channel.id === 'local'" />
                </label>
                <label>
                  <span>Provider</span>
                  <a-select v-model="channel.provider" size="small" :disabled="channel.id === 'local'">
                    <a-option value="local">local</a-option>
                    <a-option value="s3">s3</a-option>
                    <a-option value="minio">minio</a-option>
                  </a-select>
                </label>
                <label>
                  <span>优先级</span>
                  <a-input-number v-model="channel.priority" size="small" :min="0" :max="999" />
                </label>
                <label>
                  <span>容量上限(bytes)</span>
                  <a-input-number v-model="channel.capacityBytes" size="small" :min="0" :max="9007199254740991" />
                </label>
                <label>
                  <span>水位(%)</span>
                  <a-input-number v-model="channel.watermarkPercent" size="small" :min="1" :max="100" />
                </label>
                <label>
                  <span>Local Root</span>
                  <a-input v-model="channel.localRoot" size="small" placeholder="./tmp/document-storage" />
                </label>
                <label>
                  <span>Bucket</span>
                  <a-input v-model="channel.bucket" size="small" :disabled="channel.provider === 'local'" />
                </label>
                <label>
                  <span>Endpoint</span>
                  <a-input v-model="channel.endpoint" size="small" :disabled="channel.provider === 'local'" />
                </label>
                <label>
                  <span>Region</span>
                  <a-input v-model="channel.region" size="small" :disabled="channel.provider === 'local'" />
                </label>
                <label>
                  <span>Access Key</span>
                  <a-select v-model="channel.accessKeyMode" size="small" :disabled="channel.provider === 'local'">
                    <a-option value="keep">保持现有</a-option>
                    <a-option value="replace">替换</a-option>
                    <a-option value="clear">清空</a-option>
                  </a-select>
                </label>
                <label>
                  <span>Access Key 值</span>
                  <a-input-password v-model="channel.accessKey" size="small" :disabled="channel.provider === 'local' || channel.accessKeyMode !== 'replace'" />
                </label>
                <label>
                  <span>Secret Key</span>
                  <a-select v-model="channel.secretKeyMode" size="small" :disabled="channel.provider === 'local'">
                    <a-option value="keep">保持现有</a-option>
                    <a-option value="replace">替换</a-option>
                    <a-option value="clear">清空</a-option>
                  </a-select>
                </label>
                <label>
                  <span>Secret Key 值</span>
                  <a-input-password v-model="channel.secretKey" size="small" :disabled="channel.provider === 'local' || channel.secretKeyMode !== 'replace'" />
                </label>
              </div>

              <div class="storage-channel-actions">
                <label class="inline-flex gap-2 items-center text-slate-600">
                  <a-switch v-model="channel.forcePathStyle" size="small" :disabled="channel.provider === 'local'" />
                  <span>Force Path Style</span>
                </label>
                <span>AccessKey：{{ channel.accessKeyConfigured ? '已配置' : '未配置' }}</span>
                <span>SecretKey：{{ channel.secretKeyConfigured ? '已配置' : '未配置' }}</span>
                <a-button size="small" type="outline" :loading="testingChannelId === channel.id" @click="testStorageChannel(channel.id)">
                  测试连接
                </a-button>
                <a-button v-if="channel.id !== 'local'" size="small" status="danger" type="text" @click="removeChannel(channel.id)">
                  删除
                </a-button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="grid gap-3 lg:grid-cols-2">
        <div class="storage-panel">
          <div class="flex items-center justify-between mb-3">
            <h2>用户下载排行</h2>
            <span>近 30 天</span>
          </div>
          <div class="storage-rank-list">
            <div v-for="user in payload?.topUsers || []" :key="user.userId || user.username" class="storage-rank-row">
              <span>{{ user.username }}</span>
              <strong>{{ formatBytes(user.downloadBytes) }}</strong>
              <small>{{ formatNumber(user.downloadCount) }} 次</small>
            </div>
          </div>
        </div>

        <div class="storage-panel">
          <div class="flex items-center justify-between mb-3">
            <h2>工作空间消耗</h2>
            <span>存储量优先</span>
          </div>
          <div class="storage-rank-list">
            <div v-for="workspace in payload?.topWorkspaces || []" :key="workspace.workspaceId" class="storage-rank-row">
              <span>{{ workspace.workspaceName }}</span>
              <strong>{{ formatBytes(workspace.storageBytes) }}</strong>
              <small>下 {{ formatBytes(workspace.downloadBytes) }} / 上 {{ formatBytes(workspace.uploadBytes) }}</small>
            </div>
          </div>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <p class="text-[11px] text-slate-600 m-0">
          最近更新：{{ formatTime(payload?.config.updatedAt || '') }} · 更新人：{{ payload?.config.updatedByUserId || '-' }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.storage-kpi,
.storage-panel {
  border: 1px solid #e2e8f0;
  background: #fff;
}

.storage-kpi {
  min-height: 96px;
  padding: 12px;
  display: grid;
  gap: 6px;
}

.storage-kpi span,
.storage-kpi small,
.storage-panel > div > span,
.storage-panel p {
  color: #64748b;
}

.storage-kpi strong {
  color: #0f172a;
  font-size: 20px;
  line-height: 1.1;
}

.storage-panel {
  padding: 12px;
}

.storage-panel h2 {
  margin: 0;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.storage-distribution {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}

.storage-donut {
  width: 132px;
  height: 132px;
  border-radius: 50%;
  position: relative;
}

.storage-donut::after {
  content: '';
  position: absolute;
  inset: 34px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.storage-distribution-list,
.storage-rank-list {
  display: grid;
  gap: 8px;
}

.storage-row,
.storage-rank-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  min-height: 28px;
  border-bottom: 1px solid #f1f5f9;
}

.storage-row span,
.storage-rank-row span {
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.storage-row strong,
.storage-rank-row strong {
  color: #0f172a;
}

.storage-row small,
.storage-rank-row small {
  color: #64748b;
}

.storage-trend {
  width: 100%;
  min-height: 220px;
}

.storage-chart-grid {
  stroke: #e2e8f0;
  stroke-width: 1;
}

.storage-area {
  opacity: .14;
}

.storage-area--upload {
  fill: #2563eb;
}

.storage-area--download {
  fill: #059669;
}

.storage-line {
  fill: none;
  stroke-width: 2.5;
}

.storage-line--upload {
  stroke: #2563eb;
}

.storage-line--download {
  stroke: #059669;
}

.storage-legend {
  display: flex;
  gap: 16px;
  color: #64748b;
}

.storage-legend span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.storage-legend i {
  width: 18px;
  height: 2px;
  display: inline-block;
}

.legend-upload {
  background: #2563eb;
}

.legend-download {
  background: #059669;
}

.storage-inline-field {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: #475569;
}

.storage-channel-list {
  display: grid;
  gap: 10px;
}

.storage-channel {
  border: 1px solid #e2e8f0;
  background: #fff;
}

.storage-channel-row {
  min-height: 58px;
  display: grid;
  grid-template-columns: 28px auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
}

.storage-channel-expand {
  width: 24px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.storage-chevron {
  display: inline-block;
  font-size: 18px;
  line-height: 1;
  transform: rotate(0deg);
  transition: transform .16s ease;
}

.storage-chevron--open {
  transform: rotate(90deg);
}

.storage-channel-identity {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.storage-channel-usage {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #64748b;
}

.storage-usage-bar {
  width: min(260px, 100%);
  height: 6px;
  background: #e2e8f0;
  overflow: hidden;
}

.storage-usage-bar span {
  display: block;
  height: 100%;
  background: #2563eb;
}

.storage-channel-row-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  color: #64748b;
  white-space: nowrap;
}

.storage-channel-detail {
  border-top: 1px solid #e2e8f0;
  padding: 10px;
  background: #f8fafc;
}

.storage-channel-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.storage-channel-grid label {
  display: grid;
  gap: 4px;
  color: #64748b;
}

.storage-channel-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: #64748b;
}

@media (max-width: 900px) {
  .storage-distribution {
    grid-template-columns: 1fr;
  }

  .storage-channel-row {
    grid-template-columns: 24px auto minmax(0, 1fr);
  }

  .storage-channel-row-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
    padding-left: 34px;
  }

  .storage-channel-grid {
    grid-template-columns: 1fr;
  }
}
</style>
