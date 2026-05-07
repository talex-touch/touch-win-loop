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

interface KnowledgeWorkerPayload {
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
  }
  overview: {
    totalTasks: number
    succeededTasks: number
    failedTasks: number
    queuedTasks: number
    processingTasks: number
    successRate: number
    avgDurationMs: number
    p95DurationMs: number
    retrySuccessRate: number
    avgStaleHours: number
  }
  queue: {
    queuedCount: number
    processingCount: number
    failedCount: number
    staleCount: number
    oldestQueuedAt: string | null
    oldestQueuedSeconds: number
  }
  stages: Array<{
    stage: string
    count: number
  }>
  chunkKinds: Array<{
    chunkKind: string
    count: number
  }>
  topErrors: Array<{
    errorText: string
    count: number
  }>
  projectBacklog: Array<{
    projectId: string
    projectTitle: string
    backlogCount: number
    processingCount: number
    failedCount: number
    staleCount: number
  }>
  recentFailures: Array<{
    taskId: string
    projectId: string
    projectTitle: string
    resourceId: string
    resourceTitle: string
    status: string
    stage: string
    errorMessage: string
    updatedAt: string
  }>
  trend: Array<{
    day: string
    tasks: number
    succeeded: number
    failed: number
    successRate: number
  }>
  tasks: {
    page: number
    pageSize: number
    total: number
    items: Array<{
      taskId: string
      projectId: string
      projectTitle: string
      resourceId: string
      resourceTitle: string
      sourceStatus: string
      sourceProgressPercent: number
      sourceEtaSeconds: number
      taskType: string
      taskStatus: string
      taskStage: string
      attempt: number
      maxAttempt: number
      errorMessage: string
      startedAt: string | null
      finishedAt: string | null
      createdAt: string
      updatedAt: string
      durationMs: number
      runningDurationMs: number
    }>
  }
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const refreshing = ref(false)
const autoRefresh = ref(true)
const errorText = ref('')
const payload = ref<KnowledgeWorkerPayload | null>(null)

const filters = reactive({
  days: 14,
  status: '',
  stage: '',
  projectId: '',
  q: '',
  page: 1,
  pageSize: 20,
})

const dayFilterOptions = [
  { value: 7, label: '7 天' },
  { value: 14, label: '14 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
] as const

const taskStatusOptions = [
  { value: '', label: '全部' },
  { value: 'queued', label: 'queued' },
  { value: 'processing', label: 'processing' },
  { value: 'succeeded', label: 'succeeded' },
  { value: 'failed', label: 'failed' },
  { value: 'dead_letter', label: 'dead_letter' },
  { value: 'cancelled', label: 'cancelled' },
] as const

const taskStageOptions = [
  { value: '', label: '全部' },
  { value: 'queued', label: 'queued' },
  { value: 'extracting', label: 'extracting' },
  { value: 'chunking', label: 'chunking' },
  { value: 'embedding', label: 'embedding' },
  { value: 'finalizing', label: 'finalizing' },
] as const

let refreshTimer: ReturnType<typeof setInterval> | null = null

function formatDateTime(value: string | null | undefined): string {
  if (!value)
    return '暂无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

function formatDurationMs(value: number): string {
  const safe = Math.max(0, Math.round(Number(value || 0)))
  if (safe < 1000)
    return `${safe}ms`
  if (safe < 60_000)
    return `${(safe / 1000).toFixed(1)}s`
  const minutes = Math.floor(safe / 60_000)
  const seconds = Math.round((safe % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

function formatEtaSeconds(value: number): string {
  const safe = Math.max(0, Math.round(Number(value || 0)))
  if (safe <= 0)
    return '0s'
  if (safe < 60)
    return `${safe}s`
  if (safe < 3600)
    return `${Math.floor(safe / 60)}m ${safe % 60}s`
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function resolveTaskStatusTone(status: string): string {
  if (status === 'succeeded')
    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (status === 'processing')
    return 'bg-sky-100 text-sky-700 border-sky-200'
  if (status === 'queued')
    return 'bg-slate-100 text-slate-700 border-slate-200'
  return 'bg-rose-100 text-rose-700 border-rose-200'
}

async function loadData(options: { silent?: boolean } = {}) {
  if (!options.silent)
    loading.value = true
  else
    refreshing.value = true

  errorText.value = ''
  try {
    const query = new URLSearchParams({
      days: String(filters.days),
      status: filters.status,
      stage: filters.stage,
      projectId: filters.projectId,
      q: filters.q,
      page: String(filters.page),
      pageSize: String(filters.pageSize),
    })
    const response = await fetch(endpoint(`/admin/resources/knowledge-worker?${query.toString()}`), {
      credentials: 'include',
    })
    const result = await response.json() as ApiResponse<KnowledgeWorkerPayload>
    if (!response.ok || !result.data)
      throw new Error(String(result.message || '知识索引监控加载失败。'))
    payload.value = result.data
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message || '知识索引监控加载失败。' : '知识索引监控加载失败。'
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

function syncAutoRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (!autoRefresh.value)
    return
  refreshTimer = setInterval(() => {
    void loadData({ silent: true })
  }, 15_000)
}

watch(
  () => [filters.days, filters.status, filters.stage, filters.projectId, filters.q, filters.page, filters.pageSize].join('|'),
  () => {
    void loadData()
  },
)

watch(autoRefresh, syncAutoRefreshTimer)

onMounted(async () => {
  await loadData()
  syncAutoRefreshTimer()
})

onBeforeUnmount(() => {
  if (refreshTimer)
    clearInterval(refreshTimer)
})

const summaryCards = computed(() => {
  const overview = payload.value?.overview
  const queue = payload.value?.queue
  const worker = payload.value?.worker
  if (!overview || !queue || !worker)
    return []

  return [
    { label: '成功率', value: `${overview.successRate}%`, hint: `${overview.succeededTasks}/${overview.failedTasks + overview.succeededTasks} 已结束任务` },
    { label: '当前积压', value: `${queue.queuedCount + queue.processingCount + queue.staleCount}`, hint: `queued ${queue.queuedCount} / processing ${queue.processingCount} / stale ${queue.staleCount}` },
    { label: '重试成功率', value: `${overview.retrySuccessRate}%`, hint: `平均 stale 滞留 ${overview.avgStaleHours}h` },
    { label: '最近运行', value: worker.lastFinishedAt ? formatDateTime(worker.lastFinishedAt) : '暂无', hint: `批次 ${worker.batchSize} / 间隔 ${Math.round(worker.intervalMs / 1000)}s` },
  ]
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-3 items-center justify-between">
      <div>
        <h1 class="text-xl text-slate-900 font-semibold">
          知识索引 Worker 监控
        </h1>
        <p class="text-sm text-slate-500 mt-1">
          查看索引调度健康、任务积压、失败分布和项目级 backlog。
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <label class="text-sm text-slate-600 flex gap-2 items-center">
          <input v-model="autoRefresh" type="checkbox">
          自动刷新
        </label>
        <button class="dense-btn" type="button" :disabled="refreshing" @click="loadData({ silent: true })">
          {{ refreshing ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div v-if="errorText" class="text-sm text-rose-700 px-4 py-3 border border-rose-200 rounded-xl bg-rose-50">
      {{ errorText }}
    </div>

    <div v-if="loading && !payload" class="text-sm text-slate-500 px-4 py-6 border border-slate-200 rounded-xl bg-white">
      正在加载知识索引监控...
    </div>

    <template v-else-if="payload">
      <section class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="item in summaryCards"
          :key="item.label"
          class="px-4 py-4 border border-slate-200 rounded-2xl bg-white"
        >
          <p class="text-[11px] text-slate-500 tracking-[0.16em] font-semibold uppercase">
            {{ item.label }}
          </p>
          <p class="text-2xl text-slate-900 font-semibold mt-2">
            {{ item.value }}
          </p>
          <p class="text-xs text-slate-500 leading-5 mt-1">
            {{ item.hint }}
          </p>
        </article>
      </section>

      <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
        <div class="flex flex-wrap gap-3 items-end">
          <label class="space-y-1">
            <span class="text-xs text-slate-600 font-medium block">时间窗口</span>
            <UiSelect v-model="filters.days" :options="dayFilterOptions" size="sm" aria-label="时间窗口" class="min-w-[120px]" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-600 font-medium block">任务状态</span>
            <UiSelect v-model="filters.status" :options="taskStatusOptions" size="sm" aria-label="任务状态" class="min-w-[140px]" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-600 font-medium block">阶段</span>
            <UiSelect v-model="filters.stage" :options="taskStageOptions" size="sm" aria-label="阶段" class="min-w-[140px]" />
          </label>
          <label class="space-y-1">
            <span class="text-xs text-slate-600 font-medium block">项目 ID</span>
            <input v-model="filters.projectId" class="dense-input min-w-[220px]" type="text" placeholder="可选">
          </label>
          <label class="flex-1 min-w-[220px] space-y-1">
            <span class="text-xs text-slate-600 font-medium block">检索</span>
            <input v-model="filters.q" class="dense-input w-full" type="text" placeholder="任务 / 项目 / 资源 / 错误">
          </label>
        </div>
      </section>

      <section class="gap-4 grid xl:grid-cols-[1.25fr,0.75fr]">
        <div class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
          <div class="flex gap-3 items-center justify-between">
            <h2 class="text-sm text-slate-900 font-semibold">
              队列与趋势
            </h2>
            <span class="text-xs text-slate-500">
              oldest queued: {{ formatEtaSeconds(payload.queue.oldestQueuedSeconds) }}
            </span>
          </div>

          <div class="mt-3 gap-3 grid md:grid-cols-4">
            <div class="px-3 py-3 rounded-xl bg-slate-50">
              <p class="text-[11px] text-slate-500">
                queued
              </p>
              <p class="text-lg text-slate-900 font-semibold mt-1">
                {{ payload.queue.queuedCount }}
              </p>
            </div>
            <div class="px-3 py-3 rounded-xl bg-sky-50">
              <p class="text-[11px] text-slate-500">
                processing
              </p>
              <p class="text-lg text-sky-700 font-semibold mt-1">
                {{ payload.queue.processingCount }}
              </p>
            </div>
            <div class="px-3 py-3 rounded-xl bg-rose-50">
              <p class="text-[11px] text-slate-500">
                failed
              </p>
              <p class="text-lg text-rose-700 font-semibold mt-1">
                {{ payload.queue.failedCount }}
              </p>
            </div>
            <div class="px-3 py-3 rounded-xl bg-amber-50">
              <p class="text-[11px] text-slate-500">
                stale
              </p>
              <p class="text-lg text-amber-700 font-semibold mt-1">
                {{ payload.queue.staleCount }}
              </p>
            </div>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="text-sm min-w-full">
              <thead>
                <tr class="text-xs text-slate-500 text-left border-b border-slate-200">
                  <th class="font-medium py-2 pr-3">
                    日期
                  </th>
                  <th class="font-medium py-2 pr-3">
                    任务数
                  </th>
                  <th class="font-medium py-2 pr-3">
                    成功
                  </th>
                  <th class="font-medium py-2 pr-3">
                    失败
                  </th>
                  <th class="font-medium py-2">
                    成功率
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in payload.trend" :key="item.day" class="border-b border-slate-100">
                  <td class="py-2 pr-3">
                    {{ item.day }}
                  </td>
                  <td class="py-2 pr-3">
                    {{ item.tasks }}
                  </td>
                  <td class="text-emerald-700 py-2 pr-3">
                    {{ item.succeeded }}
                  </td>
                  <td class="text-rose-700 py-2 pr-3">
                    {{ item.failed }}
                  </td>
                  <td class="py-2">
                    {{ item.successRate }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="space-y-4">
          <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
            <div class="flex gap-3 items-center justify-between">
              <h2 class="text-sm text-slate-900 font-semibold">
                多模态片段分布
              </h2>
              <span class="text-xs text-slate-500">按 chunk kind 汇总已写入索引</span>
            </div>
            <ul class="mt-3 space-y-2">
              <li
                v-for="item in payload.chunkKinds"
                :key="`${item.chunkKind}-${item.count}`"
                class="px-3 py-3 border border-slate-100 rounded-xl bg-slate-50"
              >
                <div class="flex gap-3 items-center justify-between">
                  <span class="text-sm text-slate-800">{{ item.chunkKind }}</span>
                  <span class="text-xs text-slate-500">{{ item.count }}</span>
                </div>
              </li>
              <li v-if="payload.chunkKinds.length === 0" class="text-sm text-slate-500">
                当前还没有已写入的索引片段。
              </li>
            </ul>
          </section>

          <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
            <h2 class="text-sm text-slate-900 font-semibold">
              Top Errors
            </h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="item in payload.topErrors"
                :key="`${item.errorText}-${item.count}`"
                class="px-3 py-3 border border-slate-100 rounded-xl bg-slate-50"
              >
                <p class="text-sm text-slate-800">
                  {{ item.errorText }}
                </p>
                <p class="text-xs text-slate-500 mt-1">
                  出现 {{ item.count }} 次
                </p>
              </li>
              <li v-if="payload.topErrors.length === 0" class="text-sm text-slate-500">
                当前没有失败错误聚类。
              </li>
            </ul>
          </section>

          <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
            <h2 class="text-sm text-slate-900 font-semibold">
              Recent Runs
            </h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="run in payload.worker.recentRuns.slice(0, 8)"
                :key="run.id"
                class="px-3 py-3 border border-slate-100 rounded-xl bg-slate-50"
              >
                <div class="flex gap-3 items-center justify-between">
                  <span class="text-sm text-slate-900 font-medium">{{ formatDateTime(run.startedAt) }}</span>
                  <span class="text-xs" :class="run.success ? 'text-emerald-700' : 'text-rose-700'">
                    {{ run.success ? '成功' : '失败' }}
                  </span>
                </div>
                <p class="text-xs text-slate-500 mt-1">
                  耗时 {{ formatDurationMs(run.durationMs) }} · 处理 {{ run.processedTaskCount }} · 成功 {{ run.succeededTaskCount }} · 失败 {{ run.failedTaskCount }}
                </p>
                <p v-if="run.errorMessage" class="text-xs text-rose-600 mt-1">
                  {{ run.errorMessage }}
                </p>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section class="gap-4 grid xl:grid-cols-2">
        <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            项目积压 Top
          </h2>
          <div class="mt-3 overflow-x-auto">
            <table class="text-sm min-w-full">
              <thead>
                <tr class="text-xs text-slate-500 text-left border-b border-slate-200">
                  <th class="font-medium py-2 pr-3">
                    项目
                  </th>
                  <th class="font-medium py-2 pr-3">
                    积压
                  </th>
                  <th class="font-medium py-2 pr-3">
                    processing
                  </th>
                  <th class="font-medium py-2 pr-3">
                    failed
                  </th>
                  <th class="font-medium py-2">
                    stale
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in payload.projectBacklog" :key="item.projectId" class="border-b border-slate-100">
                  <td class="py-2 pr-3">
                    <div>
                      <p class="text-slate-900 font-medium">
                        {{ item.projectTitle }}
                      </p>
                      <p class="text-xs text-slate-500">
                        {{ item.projectId }}
                      </p>
                    </div>
                  </td>
                  <td class="py-2 pr-3">
                    {{ item.backlogCount }}
                  </td>
                  <td class="text-sky-700 py-2 pr-3">
                    {{ item.processingCount }}
                  </td>
                  <td class="text-rose-700 py-2 pr-3">
                    {{ item.failedCount }}
                  </td>
                  <td class="text-amber-700 py-2">
                    {{ item.staleCount }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            最近失败任务
          </h2>
          <ul class="mt-3 space-y-2">
            <li
              v-for="item in payload.recentFailures"
              :key="item.taskId"
              class="px-3 py-3 border border-rose-100 rounded-xl bg-rose-50"
            >
              <div class="flex gap-3 items-center justify-between">
                <div>
                  <p class="text-sm text-slate-900 font-medium">
                    {{ item.resourceTitle }}
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ item.projectTitle }} · {{ item.stage }} / {{ item.status }}
                  </p>
                </div>
                <span class="text-xs text-slate-500">{{ formatDateTime(item.updatedAt) }}</span>
              </div>
              <p class="text-xs text-rose-700 leading-5 mt-2">
                {{ item.errorMessage }}
              </p>
            </li>
            <li v-if="payload.recentFailures.length === 0" class="text-sm text-slate-500">
              当前没有最近失败任务。
            </li>
          </ul>
        </section>
      </section>

      <section class="px-4 py-4 border border-slate-200 rounded-2xl bg-white">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            任务列表
          </h2>
          <div class="text-xs text-slate-500">
            共 {{ payload.tasks.total }} 条
          </div>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="text-sm min-w-full">
            <thead>
              <tr class="text-xs text-slate-500 text-left border-b border-slate-200">
                <th class="font-medium py-2 pr-3">
                  更新时间
                </th>
                <th class="font-medium py-2 pr-3">
                  项目 / 资源
                </th>
                <th class="font-medium py-2 pr-3">
                  任务
                </th>
                <th class="font-medium py-2 pr-3">
                  源状态
                </th>
                <th class="font-medium py-2 pr-3">
                  耗时
                </th>
                <th class="font-medium py-2">
                  错误
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in payload.tasks.items" :key="item.taskId" class="align-top border-b border-slate-100">
                <td class="py-3 pr-3">
                  <div>
                    <p>{{ formatDateTime(item.updatedAt) }}</p>
                    <p class="text-xs text-slate-500">
                      {{ item.taskId }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p class="text-slate-900 font-medium">
                      {{ item.projectTitle }}
                    </p>
                    <p class="text-xs text-slate-500 mt-1">
                      {{ item.resourceTitle }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div class="space-y-1">
                    <span class="text-[11px] px-2 py-0.5 border rounded-full inline-flex" :class="resolveTaskStatusTone(item.taskStatus)">
                      {{ item.taskStatus }}
                    </span>
                    <p class="text-xs text-slate-500">
                      {{ item.taskType }} · {{ item.taskStage }} · attempt {{ item.attempt }}/{{ item.maxAttempt }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p class="text-slate-900 font-medium">
                      {{ item.sourceStatus || 'unknown' }}
                    </p>
                    <p class="text-xs text-slate-500 mt-1">
                      {{ item.sourceProgressPercent }}% · ETA {{ formatEtaSeconds(item.sourceEtaSeconds) }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p>{{ formatDurationMs(item.durationMs) }}</p>
                    <p v-if="!item.finishedAt && item.runningDurationMs > 0" class="text-xs text-slate-500 mt-1">
                      已运行 {{ formatDurationMs(item.runningDurationMs) }}
                    </p>
                  </div>
                </td>
                <td class="py-3">
                  <p class="text-xs text-slate-600 leading-5">
                    {{ item.errorMessage || '无' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="text-sm mt-4 flex gap-3 items-center justify-between">
          <button
            class="dense-btn"
            type="button"
            :disabled="filters.page <= 1"
            @click="filters.page -= 1"
          >
            上一页
          </button>
          <span class="text-slate-500">第 {{ payload.tasks.page }} 页</span>
          <button
            class="dense-btn"
            type="button"
            :disabled="payload.tasks.page * payload.tasks.pageSize >= payload.tasks.total"
            @click="filters.page += 1"
          >
            下一页
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
