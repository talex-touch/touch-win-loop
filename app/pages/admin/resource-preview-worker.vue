<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface WorkerRunItem {
  id: string
  startedAt: string
  finishedAt: string
  durationMs: number
  processedTaskCount: number
  succeededTaskCount: number
  failedTaskCount: number
  success: boolean
  errorMessage: string
}

interface PreviewWorkerPayload {
  worker: {
    started: boolean
    enabled: boolean
    ticking: boolean
    intervalMs: number
    batchSize: number
    runCount: number
    successCount: number
    failureCount: number
    processedTaskCount: number
    succeededTaskCount: number
    failedTaskCount: number
    lastStartedAt: string
    lastFinishedAt: string
    lastSuccessAt: string
    lastDurationMs: number
    lastError: string
    recentRuns: WorkerRunItem[]
    endpointConfigured: boolean
    sourceBaseURL: string
    timeoutMs: number
    retryLimit: number
  }
  overview: {
    days: number
    totalCalls: number
    succeededCalls: number
    failedCalls: number
    queuedCalls: number
    processingCalls: number
    successRate: number
    avgAttempt: number
    retriedCalls: number
    avgDurationMs: number
    p95DurationMs: number
  }
  queue: {
    queuedCount: number
    processingCount: number
    oldestQueuedAt: string
    oldestQueuedSeconds: number
  }
  stages: Array<{
    stage: string
    count: number
  }>
  providers: Array<{
    provider: string
    count: number
  }>
  topErrors: Array<{
    errorText: string
    count: number
  }>
  trend: Array<{
    day: string
    calls: number
    succeeded: number
    failed: number
    successRate: number
  }>
  tasks: {
    page: number
    pageSize: number
    total: number
    items: TaskItem[]
  }
}

interface TaskItem {
  taskId: string
  documentId: string
  projectId: string
  projectTitle: string
  workspaceId: string
  workspaceName: string
  resourceId: string
  resourceTitle: string
  sourceFileName: string
  sourceMimeType: string
  previewStatus: string
  previewStage: string
  previewProgressPercent: number
  previewEtaSeconds: number
  taskType: string
  provider: string
  taskStatus: string
  taskStage: string
  attempt: number
  errorMessage: string
  rawErrorMessage: string
  resultMessage: string
  onlyOfficeErrorCode: number
  onlyOfficeErrorDetail: string
  startedAt: string
  finishedAt: string
  createdAt: string
  updatedAt: string
  durationMs: number
  runningDurationMs: number
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const dayOptions = [
  { label: '1 天', value: 1 },
  { label: '3 天', value: 3 },
  { label: '7 天', value: 7 },
  { label: '14 天', value: 14 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
]

const taskStatusOptions = [
  { label: '全部任务状态', value: '' },
  { label: 'queued', value: 'queued' },
  { label: 'processing', value: 'processing' },
  { label: 'succeeded', value: 'succeeded' },
  { label: 'failed', value: 'failed' },
]

const stageOptions = [
  { label: '全部阶段', value: '' },
  { label: 'queued', value: 'queued' },
  { label: 'converting', value: 'converting' },
  { label: 'finalizing', value: 'finalizing' },
  { label: 'succeeded', value: 'succeeded' },
  { label: 'failed', value: 'failed' },
]

const previewStatusOptions = [
  { label: '全部预览状态', value: '' },
  { label: 'queued', value: 'queued' },
  { label: 'converting', value: 'converting' },
  { label: 'finalizing', value: 'finalizing' },
  { label: 'succeeded', value: 'succeeded' },
  { label: 'failed', value: 'failed' },
]

const loading = ref(true)
const refreshing = ref(false)
const autoRefresh = ref(true)
const errorText = ref('')
const payload = ref<PreviewWorkerPayload | null>(null)
const detailVisible = ref(false)
const detailTask = ref<TaskItem | null>(null)

const filters = reactive({
  days: 7,
  status: '',
  stage: '',
  previewStatus: '',
  provider: '',
  q: '',
  page: 1,
  pageSize: 20,
})

const taskColumns = [
  { title: '创建时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 172 },
  { title: '任务', dataIndex: 'task', slotName: 'task', width: 280 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 170 },
  { title: '进度', dataIndex: 'progress', slotName: 'progress', width: 180 },
  { title: '耗时', dataIndex: 'duration', slotName: 'duration', width: 120 },
  { title: '错误', dataIndex: 'error', slotName: 'error' },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 80 },
]

const runColumns = [
  { title: '开始时间', dataIndex: 'startedAt', slotName: 'startedAt', width: 172 },
  { title: '耗时', dataIndex: 'durationMs', slotName: 'duration', width: 90 },
  { title: '处理数', dataIndex: 'processedTaskCount', width: 80 },
  { title: '成功/失败', dataIndex: 'sf', slotName: 'sf', width: 110 },
  { title: '状态', dataIndex: 'success', slotName: 'status', width: 90 },
  { title: '错误信息', dataIndex: 'errorMessage', slotName: 'errorMessage' },
]

const trendColumns = [
  { title: '日期', dataIndex: 'day', width: 110 },
  { title: '调用次数', dataIndex: 'calls', width: 90 },
  { title: '成功', dataIndex: 'succeeded', width: 80 },
  { title: '失败', dataIndex: 'failed', width: 80 },
  { title: '成功率', dataIndex: 'successRate', slotName: 'successRate', width: 90 },
]

let refreshTimer: ReturnType<typeof setInterval> | null = null

const providerOptions = computed(() => {
  const fromPayload = (payload.value?.providers || [])
    .map(item => ({ label: `${item.provider} (${item.count})`, value: item.provider }))
  return [{ label: '全部 provider', value: '' }, ...fromPayload]
})

const taskRows = computed(() => payload.value?.tasks.items || [])
const runRows = computed(() => payload.value?.worker.recentRuns || [])
const trendRows = computed(() => payload.value?.trend || [])
const trendChartRows = computed(() => [...trendRows.value].reverse())
const trendMaxCalls = computed(() => {
  return Math.max(1, ...trendRows.value.map(item => Number(item.calls || 0)))
})

const pagination = computed(() => {
  return {
    total: payload.value?.tasks.total || 0,
    current: payload.value?.tasks.page || filters.page,
    pageSize: payload.value?.tasks.pageSize || filters.pageSize,
  }
})

const overviewCards = computed(() => {
  const worker = payload.value?.worker
  const overview = payload.value?.overview
  const queue = payload.value?.queue
  if (!worker || !overview || !queue)
    return []

  return [
    {
      label: `调用次数（${overview.days} 天）`,
      value: formatCount(overview.totalCalls, '次'),
      hint: `成功 ${overview.succeededCalls} / 失败 ${overview.failedCalls}`,
      icon: 'i-heroicons-outline-arrow-path',
      tone: 'blue',
    },
    {
      label: '成功率',
      value: `${overview.successRate.toFixed(2)}%`,
      hint: `平均尝试 ${overview.avgAttempt.toFixed(2)} 次`,
      icon: 'i-heroicons-outline-check-circle',
      tone: overview.successRate >= 80 || overview.totalCalls === 0 ? 'emerald' : overview.successRate >= 50 ? 'amber' : 'rose',
    },
    {
      label: '失败 / 超时',
      value: `${overview.failedCalls} / ${topTimeoutErrorCount.value}`,
      hint: `重试任务 ${overview.retriedCalls} 次`,
      icon: 'i-heroicons-outline-exclamation-triangle',
      tone: overview.failedCalls > 0 ? 'amber' : 'slate',
    },
    {
      label: '平均耗时',
      value: formatDuration(overview.avgDurationMs),
      hint: `P95 ${formatDuration(overview.p95DurationMs)}`,
      icon: 'i-heroicons-outline-clock',
      tone: 'violet',
    },
    {
      label: '队列深度',
      value: `${queue.queuedCount} / ${queue.processingCount}`,
      hint: `最老等待 ${formatQueueWait(queue.oldestQueuedSeconds)}`,
      icon: 'i-heroicons-outline-inbox-stack',
      tone: queue.queuedCount + queue.processingCount > 0 ? 'blue' : 'slate',
    },
    {
      label: '当前任务',
      value: formatCount(payload.value?.tasks.total || 0, '个'),
      hint: `本页 ${taskRows.value.length} 条明细`,
      icon: 'i-heroicons-outline-document-text',
      tone: 'rose',
    },
  ]
})

const workerStatus = computed(() => {
  const worker = payload.value?.worker
  if (!worker) {
    return {
      label: '未加载',
      detail: '等待监控数据返回',
      className: 'text-slate-700 border-slate-200 bg-slate-50',
      dotClass: 'bg-slate-400',
    }
  }

  if (!worker.enabled) {
    return {
      label: '已停用',
      detail: 'Worker 未启用，任务不会被消费',
      className: 'text-amber-700 border-amber-200 bg-amber-50',
      dotClass: 'bg-amber-500',
    }
  }

  if (!worker.endpointConfigured) {
    return {
      label: '待配置',
      detail: 'ONLYOFFICE endpoint 缺失',
      className: 'text-rose-700 border-rose-200 bg-rose-50',
      dotClass: 'bg-rose-500',
    }
  }

  if (worker.lastError) {
    return {
      label: '有错误',
      detail: '最近调度出现错误',
      className: 'text-rose-700 border-rose-200 bg-rose-50',
      dotClass: 'bg-rose-500',
    }
  }

  if (worker.ticking) {
    return {
      label: '运行中',
      detail: '正在消费转换任务',
      className: 'text-blue-700 border-blue-200 bg-blue-50',
      dotClass: 'bg-blue-500',
    }
  }

  return {
    label: '健康',
    detail: '等待下一轮调度',
    className: 'text-emerald-700 border-emerald-200 bg-emerald-50',
    dotClass: 'bg-emerald-500',
  }
})

const workerConfigItems = computed(() => {
  const worker = payload.value?.worker
  if (!worker)
    return []

  return [
    { label: 'worker', value: worker.enabled ? 'enabled' : 'disabled' },
    { label: 'endpoint', value: worker.endpointConfigured ? 'configured' : 'missing' },
    { label: 'batch', value: String(worker.batchSize) },
    { label: 'interval', value: `${worker.intervalMs}ms` },
    { label: 'timeout', value: `${worker.timeoutMs}ms` },
    { label: 'retryLimit', value: String(worker.retryLimit) },
  ]
})

const workerHealthItems = computed(() => {
  const worker = payload.value?.worker
  if (!worker)
    return []

  return [
    { label: '最近完成', value: worker.lastFinishedAt ? formatDateTime(worker.lastFinishedAt) : '-' },
    { label: '最近成功', value: worker.lastSuccessAt ? formatDateTime(worker.lastSuccessAt) : '-' },
    { label: '最近耗时', value: formatDuration(worker.lastDurationMs) },
    { label: '运行轮次', value: `${worker.runCount} 次` },
    { label: '累计处理', value: `${worker.processedTaskCount} 任务` },
    { label: '成功/失败', value: `${worker.successCount}/${worker.failureCount}` },
  ]
})

const stageTotal = computed(() => {
  return Math.max(0, (payload.value?.stages || []).reduce((total, item) => total + Number(item.count || 0), 0))
})

const providerTotal = computed(() => {
  return Math.max(0, (payload.value?.providers || []).reduce((total, item) => total + Number(item.count || 0), 0))
})

const topTimeoutErrorCount = computed(() => {
  return (payload.value?.topErrors || []).reduce((total, item) => {
    const text = String(item.errorText || '').toLowerCase()
    if (text.includes('timeout') || text.includes('超时'))
      return total + Number(item.count || 0)
    return total
  }, 0)
})

function formatDateTime(value: string): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatDuration(durationMs: number): string {
  const value = Math.max(0, Math.round(Number(durationMs || 0)))
  if (value <= 0)
    return '-'
  if (value < 1000)
    return `${value}ms`
  const seconds = value / 1000
  if (seconds < 60)
    return `${seconds.toFixed(2)}s`
  const minutes = seconds / 60
  if (minutes < 60)
    return `${minutes.toFixed(2)}m`
  return `${(minutes / 60).toFixed(2)}h`
}

function formatEtaSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds || 0)))
  if (safe <= 0)
    return '即将完成'
  if (safe < 60)
    return `${safe}s`
  const minutes = Math.ceil(safe / 60)
  if (minutes < 60)
    return `${minutes}m`
  return `${Math.ceil(minutes / 60)}h`
}

function formatCount(value: number, unit: string): string {
  return `${Math.max(0, Number(value || 0)).toLocaleString('zh-CN')} ${unit}`
}

function formatQueueWait(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds || 0)))
  if (safe <= 0)
    return '-'
  if (safe < 60)
    return `${safe} 秒`
  const minutes = Math.round(safe / 60)
  if (minutes < 60)
    return `${minutes} 分钟`
  return `${(minutes / 60).toFixed(1)} 小时`
}

function toPercent(value: number, total: number): number {
  if (total <= 0)
    return 0
  return Math.max(0, Math.min(100, (Number(value || 0) / total) * 100))
}

function toTrendBarHeight(calls: number): string {
  const value = Number(calls || 0)
  if (value <= 0)
    return '2px'
  return `${Math.max(8, toPercent(value, trendMaxCalls.value))}%`
}

function toMetricIconClass(tone: string): string {
  if (tone === 'emerald')
    return 'text-emerald-700 bg-emerald-50 border-emerald-100'
  if (tone === 'amber')
    return 'text-amber-700 bg-amber-50 border-amber-100'
  if (tone === 'rose')
    return 'text-rose-700 bg-rose-50 border-rose-100'
  if (tone === 'violet')
    return 'text-violet-700 bg-violet-50 border-violet-100'
  if (tone === 'blue')
    return 'text-blue-700 bg-blue-50 border-blue-100'
  return 'text-slate-700 bg-slate-50 border-slate-100'
}

function toMetricValueClass(tone: string): string {
  if (tone === 'emerald')
    return 'text-emerald-700'
  if (tone === 'amber')
    return 'text-amber-700'
  if (tone === 'rose')
    return 'text-rose-700'
  if (tone === 'violet')
    return 'text-violet-700'
  if (tone === 'blue')
    return 'text-blue-700'
  return 'text-slate-900'
}

function toSuccessRateTextClass(rate: number): string {
  if (rate >= 80)
    return 'text-emerald-700'
  if (rate >= 50)
    return 'text-amber-700'
  return 'text-rose-700'
}

function toStageBarClass(stage: string): string {
  if (stage === 'succeeded')
    return 'bg-emerald-500'
  if (stage === 'failed')
    return 'bg-rose-500'
  if (stage === 'converting' || stage === 'finalizing' || stage === 'processing')
    return 'bg-blue-500'
  return 'bg-slate-400'
}

function toTaskStatusTag(status: string): string {
  if (status === 'succeeded')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  if (status === 'failed')
    return 'text-rose-700 border-rose-200 bg-rose-50'
  if (status === 'processing')
    return 'text-blue-700 border-blue-200 bg-blue-50'
  return 'text-slate-700 border-slate-200 bg-slate-50'
}

function toPreviewStatusTag(status: string): string {
  if (status === 'succeeded')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  if (status === 'failed')
    return 'text-rose-700 border-rose-200 bg-rose-50'
  if (status === 'converting' || status === 'finalizing')
    return 'text-blue-700 border-blue-200 bg-blue-50'
  return 'text-slate-700 border-slate-200 bg-slate-50'
}

function buildRequestQuery(): string {
  const params = new URLSearchParams()
  params.set('days', String(filters.days))
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))
  if (filters.status)
    params.set('status', filters.status)
  if (filters.stage)
    params.set('stage', filters.stage)
  if (filters.previewStatus)
    params.set('previewStatus', filters.previewStatus)
  if (filters.provider)
    params.set('provider', filters.provider)
  if (filters.q.trim())
    params.set('q', filters.q.trim())
  return params.toString()
}

async function loadData(showLoading = false) {
  if (showLoading)
    loading.value = true
  else
    refreshing.value = true

  errorText.value = ''
  try {
    const query = buildRequestQuery()
    const response = await fetch(endpoint(`/admin/resources/preview-worker?${query}`), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<PreviewWorkerPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '文档转换监控加载失败。'))
    payload.value = result.data
    filters.page = result.data.tasks.page
    filters.pageSize = result.data.tasks.pageSize
  }
  catch (error: any) {
    payload.value = null
    errorText.value = String(error?.data?.message || '文档转换监控加载失败。')
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

function applyFilters() {
  filters.page = 1
  void loadData(false)
}

function resetFilters() {
  filters.days = 7
  filters.status = ''
  filters.stage = ''
  filters.previewStatus = ''
  filters.provider = ''
  filters.q = ''
  filters.page = 1
  filters.pageSize = 20
  void loadData(false)
}

function onPageChange(page: number) {
  filters.page = page
  void loadData(false)
}

function onPageSizeChange(pageSize: number) {
  filters.page = 1
  filters.pageSize = pageSize
  void loadData(false)
}

function openTaskDetail(item: TaskItem) {
  detailTask.value = item
  detailVisible.value = true
}

function restartRefreshTimer() {
  if (refreshTimer)
    clearInterval(refreshTimer)
  refreshTimer = null

  if (!autoRefresh.value)
    return

  refreshTimer = setInterval(() => {
    void loadData(false)
  }, 15000)
  refreshTimer.unref?.()
}

watch(autoRefresh, () => {
  restartRefreshTimer()
})

onMounted(async () => {
  await loadData(true)
  restartRefreshTimer()
})

onBeforeUnmount(() => {
  if (!refreshTimer)
    return
  clearInterval(refreshTimer)
  refreshTimer = null
})
</script>

<template>
  <div class="space-y-4">
    <section class="px-5 py-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <div class="flex gap-2 items-center">
            <span class="i-heroicons-outline-arrow-path-rounded-square text-lg text-blue-600" aria-hidden="true" />
            <h1 class="text-xl text-slate-900 tracking-tight font-semibold m-0">
              文档转换监控
            </h1>
          </div>
          <p class="text-sm text-slate-500 mb-0 mt-1">
            ONLYOFFICE 转换任务的全链路监控与失败分析。
          </p>
        </div>
        <div class="flex flex-wrap gap-2 items-center justify-start lg:justify-end">
          <span class="text-xs px-2.5 py-1 border rounded-full inline-flex gap-1.5 items-center" :class="workerStatus.className">
            <span class="rounded-full size-1.5" :class="workerStatus.dotClass" />
            {{ workerStatus.label }}
          </span>
          <a-switch v-model="autoRefresh" size="small">
            <template #checked>
              自动刷新
            </template>
            <template #unchecked>
              手动刷新
            </template>
          </a-switch>
          <a-button size="small" type="primary" :loading="refreshing" @click="loadData(false)">
            <template #icon>
              <span class="i-heroicons-outline-arrow-path" />
            </template>
            刷新
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-sm text-rose-700 p-4 border border-rose-200 rounded-2xl bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else-if="payload">
      <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-sm text-slate-900 font-semibold m-0">
              概览
            </h2>
            <p class="text-xs text-slate-500 m-0 mt-1">
              当前窗口 {{ payload.overview.days }} 天，自动刷新间隔 15 秒。
            </p>
          </div>
          <span class="text-xs text-slate-500 hidden md:inline-flex">
            {{ workerStatus.detail }}
          </span>
        </div>
        <div class="gap-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6">
          <article
            v-for="item in overviewCards"
            :key="item.label"
            class="px-4 py-3 border border-slate-200 rounded-xl bg-white min-w-0"
          >
            <div class="flex gap-3 items-start">
              <span class="border rounded-full inline-flex shrink-0 size-9 items-center justify-center" :class="toMetricIconClass(item.tone)">
                <span class="text-lg" :class="item.icon" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <p class="text-xs text-slate-500 m-0">
                  {{ item.label }}
                </p>
                <p class="text-2xl leading-tight font-semibold m-0 mt-1" :class="toMetricValueClass(item.tone)">
                  {{ item.value }}
                </p>
                <p class="text-xs text-slate-500 m-0 mt-1 truncate" :title="item.hint">
                  {{ item.hint }}
                </p>
              </div>
            </div>
          </article>
        </div>

        <div class="mt-4 px-3 py-2 border border-slate-200 rounded-xl bg-slate-50">
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            <span
              v-for="item in workerConfigItems"
              :key="item.label"
              class="text-xs text-slate-600"
            >
              <span class="text-slate-400">{{ item.label }}=</span>{{ item.value }}
            </span>
          </div>
        </div>
        <div
          v-if="payload.worker.lastError"
          class="text-xs text-rose-700 mt-3 px-3 py-2 border border-rose-200 rounded-xl bg-rose-50 break-all"
        >
          最近 worker 错误：{{ payload.worker.lastError }}
        </div>
      </section>

      <section class="gap-4 grid grid-cols-1 xl:grid-cols-[1.6fr,1fr]">
        <div class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div class="flex flex-wrap gap-3 items-center justify-between">
            <div>
              <h2 class="text-sm text-slate-900 font-semibold m-0">
                调用趋势
              </h2>
              <p class="text-xs text-slate-500 m-0 mt-1">
                按日统计调用量、成功量和失败量。
              </p>
            </div>
            <a-select v-model="filters.days" :options="dayOptions" size="small" class="w-[120px]" @change="applyFilters" />
          </div>

          <div v-if="trendChartRows.length > 0" class="mt-4 px-3 pt-3 border-b border-l border-slate-200 h-[220px]">
            <div class="flex gap-3 h-full items-end">
              <div
                v-for="item in trendChartRows"
                :key="item.day"
                class="flex flex-1 flex-col h-full min-w-[52px] items-center justify-end"
              >
                <div class="flex gap-1 h-[168px] w-full items-end justify-center">
                  <div
                    class="rounded-t bg-blue-500 w-3 transition-all duration-300"
                    :style="{ height: toTrendBarHeight(item.calls) }"
                    :title="`调用 ${item.calls}`"
                  />
                  <div
                    class="rounded-t bg-emerald-500 w-3 transition-all duration-300"
                    :style="{ height: toTrendBarHeight(item.succeeded) }"
                    :title="`成功 ${item.succeeded}`"
                  />
                  <div
                    class="rounded-t bg-rose-500 w-3 transition-all duration-300"
                    :style="{ height: toTrendBarHeight(item.failed) }"
                    :title="`失败 ${item.failed}`"
                  />
                </div>
                <p class="text-[11px] text-slate-500 m-0 mt-2">
                  {{ item.day.slice(5) }}
                </p>
              </div>
            </div>
          </div>
          <div v-else class="mt-4 border border-slate-200 rounded-xl border-dashed bg-slate-50 flex flex-col h-[220px] items-center justify-center">
            <span class="i-heroicons-outline-chart-bar text-3xl text-slate-300" aria-hidden="true" />
            <p class="text-sm text-slate-400 m-0 mt-2">
              暂无趋势数据
            </p>
          </div>

          <div class="text-xs text-slate-500 mt-3 flex gap-4">
            <span class="inline-flex gap-1.5 items-center"><span class="rounded-full bg-blue-500 size-2" />调用</span>
            <span class="inline-flex gap-1.5 items-center"><span class="rounded-full bg-emerald-500 size-2" />成功</span>
            <span class="inline-flex gap-1.5 items-center"><span class="rounded-full bg-rose-500 size-2" />失败</span>
          </div>
        </div>

        <div class="space-y-4">
          <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
            <div class="flex gap-3 items-center justify-between">
              <h2 class="text-sm text-slate-900 font-semibold m-0">
                Worker 健康
              </h2>
              <span class="text-xs px-2 py-1 border rounded-full" :class="workerStatus.className">
                {{ workerStatus.label }}
              </span>
            </div>
            <div class="mt-3 gap-2 grid grid-cols-2">
              <div
                v-for="item in workerHealthItems"
                :key="item.label"
                class="px-3 py-2 rounded-xl bg-slate-50"
              >
                <p class="text-[11px] text-slate-500 m-0">
                  {{ item.label }}
                </p>
                <p class="text-xs text-slate-900 font-semibold m-0 mt-1 break-all">
                  {{ item.value }}
                </p>
              </div>
            </div>
          </section>

          <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
            <div class="flex gap-3 items-center justify-between">
              <h2 class="text-sm text-slate-900 font-semibold m-0">
                阶段分布
              </h2>
              <span class="text-xs text-slate-500">{{ stageTotal }} 次</span>
            </div>
            <div class="mt-3 max-h-[180px] overflow-auto space-y-3">
              <div
                v-for="item in payload.stages"
                :key="item.stage"
                class="space-y-1"
              >
                <div class="text-xs flex items-center justify-between">
                  <span class="text-slate-700">{{ item.stage }}</span>
                  <span class="text-slate-900 font-semibold">{{ item.count }}</span>
                </div>
                <div class="rounded-full bg-slate-100 h-1.5 overflow-hidden">
                  <div
                    class="rounded-full h-full"
                    :class="toStageBarClass(item.stage)"
                    :style="{ width: `${toPercent(item.count, stageTotal)}%` }"
                  />
                </div>
              </div>
              <div v-if="payload.stages.length === 0" class="text-sm text-slate-400 px-3 py-6 text-center border border-slate-200 rounded-xl border-dashed bg-slate-50">
                暂无数据
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="gap-4 grid grid-cols-1 xl:grid-cols-[0.95fr,1.05fr]">
        <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div class="flex gap-3 items-center justify-between">
            <h2 class="text-sm text-slate-900 font-semibold m-0">
              Provider 分布
            </h2>
            <span class="text-xs text-slate-500">{{ providerTotal }} 次</span>
          </div>
          <div class="mt-3 max-h-[170px] overflow-auto space-y-3">
            <div
              v-for="item in payload.providers"
              :key="item.provider"
              class="space-y-1"
            >
              <div class="text-xs flex items-center justify-between">
                <span class="text-slate-700">{{ item.provider }}</span>
                <span class="text-slate-900 font-semibold">{{ item.count }}</span>
              </div>
              <div class="rounded-full bg-slate-100 h-1.5 overflow-hidden">
                <div
                  class="rounded-full bg-cyan-500 h-full"
                  :style="{ width: `${toPercent(item.count, providerTotal)}%` }"
                />
              </div>
            </div>
            <div v-if="payload.providers.length === 0" class="text-sm text-slate-400 px-3 py-6 text-center border border-slate-200 rounded-xl border-dashed bg-slate-50">
              暂无数据
            </div>
          </div>
        </section>

        <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div class="flex gap-3 items-center justify-between">
            <h2 class="text-sm text-slate-900 font-semibold m-0">
              Top 错误
            </h2>
            <span class="text-xs text-slate-500">最多 10 条</span>
          </div>
          <div class="mt-3 max-h-[170px] overflow-auto space-y-2">
            <div
              v-for="item in payload.topErrors"
              :key="`${item.errorText}-${item.count}`"
              class="px-3 py-2 border border-rose-100 rounded-xl bg-rose-50"
            >
              <div class="flex gap-3 items-start justify-between">
                <p class="text-xs text-rose-700 leading-5 m-0 break-all">
                  {{ item.errorText }}
                </p>
                <span class="text-xs text-rose-700 font-semibold whitespace-nowrap">{{ item.count }} 次</span>
              </div>
            </div>
            <div v-if="payload.topErrors.length === 0" class="text-sm text-slate-400 px-3 py-6 text-center border border-slate-200 rounded-xl border-dashed bg-slate-50">
              暂无错误
            </div>
          </div>
        </section>
      </section>

      <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div class="mb-3 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h2 class="text-sm text-slate-900 font-semibold m-0">
              任务筛选
            </h2>
            <p class="text-xs text-slate-500 m-0 mt-1">
              检索任务、文档、项目、文件名或错误信息。
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <a-button size="small" type="primary" @click="applyFilters">
              查询
            </a-button>
            <a-button size="small" type="outline" @click="resetFilters">
              重置
            </a-button>
          </div>
        </div>
        <div class="gap-2 grid grid-cols-1 xl:grid-cols-[120px,160px,160px,160px,180px,1fr] md:grid-cols-2">
          <a-select v-model="filters.days" :options="dayOptions" size="small" />
          <a-select v-model="filters.status" :options="taskStatusOptions" size="small" />
          <a-select v-model="filters.stage" :options="stageOptions" size="small" />
          <a-select v-model="filters.previewStatus" :options="previewStatusOptions" size="small" />
          <a-select v-model="filters.provider" :options="providerOptions" size="small" />
          <a-input v-model="filters.q" size="small" placeholder="关键词（taskId / 文档 / 项目 / 文件名 / 错误）" allow-clear />
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <details>
          <summary class="text-sm text-slate-700 font-medium cursor-pointer">
            趋势明细表
          </summary>
          <div class="mt-3">
            <a-table
              :bordered="{ cell: true }"
              :columns="trendColumns"
              :data="trendRows"
              :pagination="false"
              size="small"
              row-key="day"
            >
              <template #successRate="{ record }">
                <span class="text-[11px] font-semibold" :class="toSuccessRateTextClass(record.successRate)">
                  {{ Number(record.successRate || 0).toFixed(2) }}%
                </span>
              </template>
            </a-table>
          </div>
        </details>
      </section>

      <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div class="mb-3 flex gap-3 items-center justify-between">
          <div>
            <h2 class="text-sm text-slate-900 font-semibold m-0">
              任务明细
            </h2>
            <p class="text-xs text-slate-500 m-0 mt-1">
              共 {{ pagination.total }} 条，按创建时间倒序。
            </p>
          </div>
          <span class="text-xs text-slate-500">
            pageSize={{ pagination.pageSize }}
          </span>
        </div>
        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <a-table
            :bordered="{ cell: true }"
            :columns="taskColumns"
            :data="taskRows"
            :pagination="{
              ...pagination,
              showTotal: true,
              showPageSize: true,
              pageSizeOptions: [10, 20, 50, 100],
            }"
            size="small"
            row-key="taskId"
            @page-change="onPageChange"
            @page-size-change="onPageSizeChange"
          >
            <template #createdAt="{ record }">
              <div class="text-[11px]">
                <p class="text-slate-700 m-0">
                  {{ formatDateTime(record.createdAt) }}
                </p>
                <p class="text-slate-400 m-0 mt-0.5">
                  {{ record.taskId }}
                </p>
              </div>
            </template>

            <template #task="{ record }">
              <div class="text-[11px] min-w-0">
                <p class="text-slate-800 font-semibold m-0 truncate" :title="record.sourceFileName">
                  {{ record.sourceFileName || '-' }}
                </p>
                <p class="text-slate-500 m-0 mt-0.5 truncate" :title="record.projectTitle">
                  项目：{{ record.projectTitle || record.projectId }}
                </p>
                <p class="text-slate-400 m-0 mt-0.5 truncate" :title="record.resourceTitle">
                  资源：{{ record.resourceTitle || record.resourceId }}
                </p>
              </div>
            </template>

            <template #status="{ record }">
              <div class="space-y-1">
                <span class="text-[10px] px-2 py-0.5 border rounded inline-flex" :class="toTaskStatusTag(record.taskStatus)">
                  task: {{ record.taskStatus }}
                </span>
                <span class="text-[10px] ml-1 px-2 py-0.5 border rounded inline-flex" :class="toPreviewStatusTag(record.previewStatus)">
                  preview: {{ record.previewStatus }}
                </span>
                <p class="text-[10px] text-slate-400 m-0">
                  attempt={{ record.attempt }}
                </p>
              </div>
            </template>

            <template #progress="{ record }">
              <div class="w-[150px]">
                <div class="rounded bg-slate-200 h-1.5 w-full overflow-hidden">
                  <div
                    class="rounded h-full transition-all duration-300 from-blue-600 to-cyan-500 bg-gradient-to-r"
                    :style="{ width: `${Math.max(0, Math.min(100, Number(record.previewProgressPercent || 0)))}%` }"
                  />
                </div>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  {{ Math.max(0, Math.min(100, Number(record.previewProgressPercent || 0))) }}% · ETA {{ formatEtaSeconds(record.previewEtaSeconds) }}
                </p>
              </div>
            </template>

            <template #duration="{ record }">
              <div class="text-[11px]">
                <p class="text-slate-700 m-0">
                  {{ formatDuration(record.durationMs) }}
                </p>
                <p v-if="record.runningDurationMs > 0" class="text-slate-400 m-0 mt-0.5">
                  运行中 {{ formatDuration(record.runningDurationMs) }}
                </p>
              </div>
            </template>

            <template #error="{ record }">
              <p class="text-[11px] text-rose-600 m-0 break-all line-clamp-2">
                {{ record.errorMessage || '-' }}
              </p>
            </template>

            <template #actions="{ record }">
              <a-button size="mini" type="outline" @click="openTaskDetail(record)">
                详情
              </a-button>
            </template>
          </a-table>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-2xl bg-white shadow-sm">
        <div class="mb-3 flex gap-3 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold m-0">
            调度运行记录
          </h2>
          <span class="text-xs text-slate-500">
            {{ runRows.length }} 条
          </span>
        </div>
        <div class="border border-slate-200 rounded-xl overflow-hidden">
          <a-table
            :bordered="{ cell: true }"
            :columns="runColumns"
            :data="runRows"
            :pagination="false"
            size="small"
            row-key="id"
          >
            <template #startedAt="{ record }">
              <p class="text-[11px] m-0">
                {{ formatDateTime(record.startedAt) }}
              </p>
            </template>
            <template #duration="{ record }">
              <p class="text-[11px] m-0">
                {{ formatDuration(record.durationMs) }}
              </p>
            </template>
            <template #sf="{ record }">
              <p class="text-[11px] m-0">
                {{ record.succeededTaskCount }}/{{ record.failedTaskCount }}
              </p>
            </template>
            <template #status="{ record }">
              <span class="text-[10px] px-2 py-0.5 border rounded inline-flex" :class="record.success ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-rose-700 border-rose-200 bg-rose-50'">
                {{ record.success ? 'success' : 'failed' }}
              </span>
            </template>
            <template #errorMessage="{ record }">
              <p class="text-[11px] m-0 break-all" :class="record.errorMessage ? 'text-rose-600' : 'text-slate-400'">
                {{ record.errorMessage || '-' }}
              </p>
            </template>
          </a-table>
        </div>
      </section>
    </template>

    <a-drawer v-model:visible="detailVisible" width="680px" title="任务详情" unmount-on-close>
      <template v-if="detailTask">
        <div class="text-[11px] space-y-2">
          <div class="gap-2 grid grid-cols-2">
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                taskId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailTask.taskId }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                documentId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailTask.documentId }}
              </p>
            </div>
          </div>

          <div class="gap-2 grid grid-cols-2">
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                projectId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailTask.projectId }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                resourceId
              </p>
              <p class="text-slate-700 m-0 mt-1 break-all">
                {{ detailTask.resourceId }}
              </p>
            </div>
          </div>

          <div class="p-2 border border-slate-200 bg-slate-50">
            <p class="text-slate-400 m-0 uppercase">
              文件
            </p>
            <p class="text-slate-700 m-0 mt-1 break-all">
              {{ detailTask.sourceFileName }} ({{ detailTask.sourceMimeType }})
            </p>
          </div>

          <div class="gap-2 grid grid-cols-2">
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                taskStatus/stage
              </p>
              <p class="text-slate-700 m-0 mt-1">
                {{ detailTask.taskStatus }} / {{ detailTask.taskStage }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                previewStatus/stage
              </p>
              <p class="text-slate-700 m-0 mt-1">
                {{ detailTask.previewStatus }} / {{ detailTask.previewStage }}
              </p>
            </div>
          </div>

          <div class="gap-2 grid grid-cols-2">
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                时间
              </p>
              <p class="text-slate-700 m-0 mt-1">
                created: {{ formatDateTime(detailTask.createdAt) }}
              </p>
              <p class="text-slate-700 m-0 mt-1">
                started: {{ formatDateTime(detailTask.startedAt) }}
              </p>
              <p class="text-slate-700 m-0 mt-1">
                finished: {{ formatDateTime(detailTask.finishedAt) }}
              </p>
            </div>
            <div class="p-2 border border-slate-200 bg-slate-50">
              <p class="text-slate-400 m-0 uppercase">
                耗时
              </p>
              <p class="text-slate-700 m-0 mt-1">
                duration: {{ formatDuration(detailTask.durationMs) }}
              </p>
              <p class="text-slate-700 m-0 mt-1">
                running: {{ formatDuration(detailTask.runningDurationMs) }}
              </p>
            </div>
          </div>

          <div class="p-2 border border-rose-200 bg-rose-50">
            <p class="text-rose-500 m-0 uppercase">
              errorMessage
            </p>
            <p class="text-rose-700 m-0 mt-1 break-all">
              {{ detailTask.errorMessage || '-' }}
            </p>
          </div>

          <div v-if="detailTask.rawErrorMessage" class="p-2 border border-rose-200 bg-rose-50">
            <p class="text-rose-500 m-0 uppercase">
              rawErrorMessage
            </p>
            <p class="text-rose-700 m-0 mt-1 break-all">
              {{ detailTask.rawErrorMessage }}
            </p>
          </div>

          <div v-if="detailTask.onlyOfficeErrorCode || detailTask.onlyOfficeErrorDetail" class="p-2 border border-rose-200 bg-rose-50">
            <p class="text-rose-500 m-0 uppercase">
              onlyoffice
            </p>
            <p class="text-rose-700 m-0 mt-1 break-all">
              code={{ detailTask.onlyOfficeErrorCode }} detail={{ detailTask.onlyOfficeErrorDetail || '-' }}
            </p>
          </div>
        </div>
      </template>
    </a-drawer>
  </div>
</template>
