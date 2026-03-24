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

const pagination = computed(() => {
  return {
    total: payload.value?.tasks.total || 0,
    current: payload.value?.tasks.page || filters.page,
    pageSize: payload.value?.tasks.pageSize || filters.pageSize,
  }
})

const summaryRows = computed(() => {
  const worker = payload.value?.worker
  const overview = payload.value?.overview
  const queue = payload.value?.queue
  if (!worker || !overview || !queue)
    return []

  return [
    { label: '调用次数', value: `${overview.totalCalls} 次（${overview.days} 天）` },
    { label: '成功率', value: `${overview.successRate.toFixed(2)}%` },
    { label: '成功/失败', value: `${overview.succeededCalls}/${overview.failedCalls}` },
    { label: '排队/处理中', value: `${queue.queuedCount}/${queue.processingCount}` },
    { label: '平均耗时', value: formatDuration(overview.avgDurationMs) },
    { label: 'P95耗时', value: formatDuration(overview.p95DurationMs) },
    { label: '平均尝试次数', value: `${overview.avgAttempt.toFixed(2)} 次` },
    { label: '重试任务数', value: `${overview.retriedCalls} 次` },
    { label: 'worker运行轮次', value: `${worker.runCount} 次` },
    { label: 'worker成功/失败', value: `${worker.successCount}/${worker.failureCount}` },
    { label: 'worker累计处理', value: `${worker.processedTaskCount} 任务` },
    { label: '最老排队等待', value: queue.oldestQueuedSeconds > 0 ? `${Math.round(queue.oldestQueuedSeconds)} 秒` : '-' },
  ]
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
    const response = await $fetch<ApiResponse<PreviewWorkerPayload>>(
      endpoint(`/admin/resources/preview-worker?${query}`),
    )
    payload.value = response.data
    filters.page = response.data.tasks.page
    filters.pageSize = response.data.tasks.pageSize
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
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex gap-3 items-center justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold m-0 uppercase">
            文档转换监控
          </h1>
          <p class="text-[11px] text-slate-500 mb-0 mt-1">
            提供 ONLYOFFICE 转换任务的检索、进度、调度、成功率、调用次数与失败分析统计。
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <a-switch v-model="autoRefresh" size="small">
            <template #checked>
              自动刷新
            </template>
            <template #unchecked>
              手动刷新
            </template>
          </a-switch>
          <a-button size="small" type="outline" :loading="refreshing" @click="loadData(false)">
            刷新
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else-if="payload">
      <section class="border border-slate-200 bg-white overflow-hidden">
        <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
          Worker & Queue Summary
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="item in summaryRows"
            :key="item.label"
            class="px-3 py-2 border-b border-r border-slate-200 last:border-r-0"
          >
            <p class="text-[10px] text-slate-400 tracking-wider m-0 uppercase">
              {{ item.label }}
            </p>
            <p class="text-[12px] text-slate-800 font-bold mb-0 mt-1">
              {{ item.value }}
            </p>
          </div>
        </div>
        <div class="text-[11px] text-slate-500 px-3 py-2 border-t border-slate-200 bg-slate-50">
          <span class="mr-3">workerEnabled={{ payload.worker.enabled ? 'true' : 'false' }}</span>
          <span class="mr-3">endpointConfigured={{ payload.worker.endpointConfigured ? 'true' : 'false' }}</span>
          <span class="mr-3">batch={{ payload.worker.batchSize }}</span>
          <span class="mr-3">interval={{ payload.worker.intervalMs }}ms</span>
          <span class="mr-3">timeout={{ payload.worker.timeoutMs }}ms</span>
          <span>retryLimit={{ payload.worker.retryLimit }}</span>
        </div>
        <div
          v-if="payload.worker.lastError"
          class="text-[11px] text-rose-600 px-3 py-2 border-t border-rose-200 bg-rose-50"
        >
          最近 worker 错误：{{ payload.worker.lastError }}
        </div>
      </section>

      <section class="gap-3 grid grid-cols-1 xl:grid-cols-3">
        <div class="border border-slate-200 bg-white overflow-hidden xl:col-span-2">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            调用趋势
          </div>
          <a-table
            :bordered="{ cell: true }"
            :columns="trendColumns"
            :data="trendRows"
            :pagination="false"
            size="small"
            row-key="day"
          >
            <template #successRate="{ record }">
              <span class="text-[11px] font-semibold" :class="record.successRate >= 80 ? 'text-emerald-600' : record.successRate >= 50 ? 'text-amber-600' : 'text-rose-600'">
                {{ Number(record.successRate || 0).toFixed(2) }}%
              </span>
            </template>
          </a-table>
        </div>

        <div class="space-y-3">
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              阶段分布
            </div>
            <div class="p-2 max-h-[220px] overflow-auto space-y-1">
              <div
                v-for="item in payload.stages"
                :key="item.stage"
                class="text-[11px] px-2 py-1 border border-slate-200 bg-white flex items-center justify-between"
              >
                <span class="text-slate-700">{{ item.stage }}</span>
                <span class="text-slate-900 font-semibold">{{ item.count }}</span>
              </div>
              <div v-if="payload.stages.length === 0" class="text-[11px] text-slate-400 px-1 py-2">
                暂无数据
              </div>
            </div>
          </div>

          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              Top 错误
            </div>
            <div class="p-2 max-h-[220px] overflow-auto space-y-1">
              <div
                v-for="item in payload.topErrors"
                :key="`${item.errorText}-${item.count}`"
                class="text-[11px] px-2 py-1 border border-rose-200 bg-rose-50"
              >
                <p class="text-rose-700 m-0 break-all">
                  {{ item.errorText }}
                </p>
                <p class="text-rose-500 m-0 mt-1">
                  {{ item.count }} 次
                </p>
              </div>
              <div v-if="payload.topErrors.length === 0" class="text-[11px] text-slate-400 px-1 py-2">
                暂无错误
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="gap-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6">
          <a-select v-model="filters.days" :options="dayOptions" size="small" />
          <a-select v-model="filters.status" :options="taskStatusOptions" size="small" />
          <a-select v-model="filters.stage" :options="stageOptions" size="small" />
          <a-select v-model="filters.previewStatus" :options="stageOptions" size="small" />
          <a-select v-model="filters.provider" :options="providerOptions" size="small" />
          <a-input v-model="filters.q" size="small" placeholder="关键词（taskId / 文档 / 项目 / 文件名 / 错误）" allow-clear />
        </div>
        <div class="mt-2 flex gap-2 items-center">
          <a-button size="small" type="primary" @click="applyFilters">
            查询
          </a-button>
          <a-button size="small" type="outline" @click="resetFilters">
            重置
          </a-button>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="mb-2 flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-800 font-bold m-0">
            任务明细（{{ pagination.total }}）
          </h2>
        </div>
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
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="mb-2 flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-800 font-bold m-0">
            调度运行记录（{{ runRows.length }}）
          </h2>
        </div>
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
