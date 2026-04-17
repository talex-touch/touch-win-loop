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
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">
          知识索引 Worker 监控
        </h1>
        <p class="mt-1 text-sm text-slate-500">
          查看索引调度健康、任务积压、失败分布和项目级 backlog。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-sm text-slate-600">
          <input v-model="autoRefresh" type="checkbox">
          自动刷新
        </label>
        <button class="dense-btn" type="button" :disabled="refreshing" @click="loadData({ silent: true })">
          {{ refreshing ? '刷新中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div v-if="errorText" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      {{ errorText }}
    </div>

    <div v-if="loading && !payload" class="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
      正在加载知识索引监控...
    </div>

    <template v-else-if="payload">
      <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="item in summaryCards"
          :key="item.label"
          class="rounded-2xl border border-slate-200 bg-white px-4 py-4"
        >
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {{ item.label }}
          </p>
          <p class="mt-2 text-2xl font-semibold text-slate-900">
            {{ item.value }}
          </p>
          <p class="mt-1 text-xs leading-5 text-slate-500">
            {{ item.hint }}
          </p>
        </article>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="space-y-1">
            <span class="block text-xs font-medium text-slate-600">时间窗口</span>
            <select v-model="filters.days" class="dense-input min-w-[120px]">
              <option :value="7">7 天</option>
              <option :value="14">14 天</option>
              <option :value="30">30 天</option>
              <option :value="90">90 天</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-medium text-slate-600">任务状态</span>
            <select v-model="filters.status" class="dense-input min-w-[140px]">
              <option value="">全部</option>
              <option value="queued">queued</option>
              <option value="processing">processing</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
              <option value="dead_letter">dead_letter</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-medium text-slate-600">阶段</span>
            <select v-model="filters.stage" class="dense-input min-w-[140px]">
              <option value="">全部</option>
              <option value="queued">queued</option>
              <option value="extracting">extracting</option>
              <option value="chunking">chunking</option>
              <option value="embedding">embedding</option>
              <option value="finalizing">finalizing</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="block text-xs font-medium text-slate-600">项目 ID</span>
            <input v-model="filters.projectId" class="dense-input min-w-[220px]" type="text" placeholder="可选">
          </label>
          <label class="space-y-1 flex-1 min-w-[220px]">
            <span class="block text-xs font-medium text-slate-600">检索</span>
            <input v-model="filters.q" class="dense-input w-full" type="text" placeholder="任务 / 项目 / 资源 / 错误">
          </label>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-[1.25fr,0.75fr]">
        <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-slate-900">
              队列与趋势
            </h2>
            <span class="text-xs text-slate-500">
              oldest queued: {{ formatEtaSeconds(payload.queue.oldestQueuedSeconds) }}
            </span>
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-4">
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] text-slate-500">queued</p>
              <p class="mt-1 text-lg font-semibold text-slate-900">{{ payload.queue.queuedCount }}</p>
            </div>
            <div class="rounded-xl bg-sky-50 px-3 py-3">
              <p class="text-[11px] text-slate-500">processing</p>
              <p class="mt-1 text-lg font-semibold text-sky-700">{{ payload.queue.processingCount }}</p>
            </div>
            <div class="rounded-xl bg-rose-50 px-3 py-3">
              <p class="text-[11px] text-slate-500">failed</p>
              <p class="mt-1 text-lg font-semibold text-rose-700">{{ payload.queue.failedCount }}</p>
            </div>
            <div class="rounded-xl bg-amber-50 px-3 py-3">
              <p class="text-[11px] text-slate-500">stale</p>
              <p class="mt-1 text-lg font-semibold text-amber-700">{{ payload.queue.staleCount }}</p>
            </div>
          </div>

          <div class="mt-4 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th class="py-2 pr-3 font-medium">日期</th>
                  <th class="py-2 pr-3 font-medium">任务数</th>
                  <th class="py-2 pr-3 font-medium">成功</th>
                  <th class="py-2 pr-3 font-medium">失败</th>
                  <th class="py-2 font-medium">成功率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in payload.trend" :key="item.day" class="border-b border-slate-100">
                  <td class="py-2 pr-3">{{ item.day }}</td>
                  <td class="py-2 pr-3">{{ item.tasks }}</td>
                  <td class="py-2 pr-3 text-emerald-700">{{ item.succeeded }}</td>
                  <td class="py-2 pr-3 text-rose-700">{{ item.failed }}</td>
                  <td class="py-2">{{ item.successRate }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="space-y-4">
          <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-sm font-semibold text-slate-900">多模态片段分布</h2>
              <span class="text-xs text-slate-500">按 chunk kind 汇总已写入索引</span>
            </div>
            <ul class="mt-3 space-y-2">
              <li
                v-for="item in payload.chunkKinds"
                :key="`${item.chunkKind}-${item.count}`"
                class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm text-slate-800">{{ item.chunkKind }}</span>
                  <span class="text-xs text-slate-500">{{ item.count }}</span>
                </div>
              </li>
              <li v-if="payload.chunkKinds.length === 0" class="text-sm text-slate-500">
                当前还没有已写入的索引片段。
              </li>
            </ul>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h2 class="text-sm font-semibold text-slate-900">Top Errors</h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="item in payload.topErrors"
                :key="`${item.errorText}-${item.count}`"
                class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <p class="text-sm text-slate-800">{{ item.errorText }}</p>
                <p class="mt-1 text-xs text-slate-500">出现 {{ item.count }} 次</p>
              </li>
              <li v-if="payload.topErrors.length === 0" class="text-sm text-slate-500">
                当前没有失败错误聚类。
              </li>
            </ul>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h2 class="text-sm font-semibold text-slate-900">Recent Runs</h2>
            <ul class="mt-3 space-y-2">
              <li
                v-for="run in payload.worker.recentRuns.slice(0, 8)"
                :key="run.id"
                class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm font-medium text-slate-900">{{ formatDateTime(run.startedAt) }}</span>
                  <span class="text-xs" :class="run.success ? 'text-emerald-700' : 'text-rose-700'">
                    {{ run.success ? '成功' : '失败' }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-500">
                  耗时 {{ formatDurationMs(run.durationMs) }} · 处理 {{ run.processedTaskCount }} · 成功 {{ run.succeededTaskCount }} · 失败 {{ run.failedTaskCount }}
                </p>
                <p v-if="run.errorMessage" class="mt-1 text-xs text-rose-600">
                  {{ run.errorMessage }}
                </p>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section class="grid gap-4 xl:grid-cols-2">
        <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <h2 class="text-sm font-semibold text-slate-900">项目积压 Top</h2>
          <div class="mt-3 overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th class="py-2 pr-3 font-medium">项目</th>
                  <th class="py-2 pr-3 font-medium">积压</th>
                  <th class="py-2 pr-3 font-medium">processing</th>
                  <th class="py-2 pr-3 font-medium">failed</th>
                  <th class="py-2 font-medium">stale</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in payload.projectBacklog" :key="item.projectId" class="border-b border-slate-100">
                  <td class="py-2 pr-3">
                    <div>
                      <p class="font-medium text-slate-900">{{ item.projectTitle }}</p>
                      <p class="text-xs text-slate-500">{{ item.projectId }}</p>
                    </div>
                  </td>
                  <td class="py-2 pr-3">{{ item.backlogCount }}</td>
                  <td class="py-2 pr-3 text-sky-700">{{ item.processingCount }}</td>
                  <td class="py-2 pr-3 text-rose-700">{{ item.failedCount }}</td>
                  <td class="py-2 text-amber-700">{{ item.staleCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <h2 class="text-sm font-semibold text-slate-900">最近失败任务</h2>
          <ul class="mt-3 space-y-2">
            <li
              v-for="item in payload.recentFailures"
              :key="item.taskId"
              class="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-slate-900">{{ item.resourceTitle }}</p>
                  <p class="text-xs text-slate-500">{{ item.projectTitle }} · {{ item.stage }} / {{ item.status }}</p>
                </div>
                <span class="text-xs text-slate-500">{{ formatDateTime(item.updatedAt) }}</span>
              </div>
              <p class="mt-2 text-xs leading-5 text-rose-700">{{ item.errorMessage }}</p>
            </li>
            <li v-if="payload.recentFailures.length === 0" class="text-sm text-slate-500">
              当前没有最近失败任务。
            </li>
          </ul>
        </section>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-slate-900">任务列表</h2>
          <div class="text-xs text-slate-500">
            共 {{ payload.tasks.total }} 条
          </div>
        </div>

        <div class="mt-3 overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 text-left text-xs text-slate-500">
                <th class="py-2 pr-3 font-medium">更新时间</th>
                <th class="py-2 pr-3 font-medium">项目 / 资源</th>
                <th class="py-2 pr-3 font-medium">任务</th>
                <th class="py-2 pr-3 font-medium">源状态</th>
                <th class="py-2 pr-3 font-medium">耗时</th>
                <th class="py-2 font-medium">错误</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in payload.tasks.items" :key="item.taskId" class="border-b border-slate-100 align-top">
                <td class="py-3 pr-3">
                  <div>
                    <p>{{ formatDateTime(item.updatedAt) }}</p>
                    <p class="text-xs text-slate-500">{{ item.taskId }}</p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p class="font-medium text-slate-900">{{ item.projectTitle }}</p>
                    <p class="mt-1 text-xs text-slate-500">{{ item.resourceTitle }}</p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div class="space-y-1">
                    <span class="inline-flex rounded-full border px-2 py-0.5 text-[11px]" :class="resolveTaskStatusTone(item.taskStatus)">
                      {{ item.taskStatus }}
                    </span>
                    <p class="text-xs text-slate-500">
                      {{ item.taskType }} · {{ item.taskStage }} · attempt {{ item.attempt }}/{{ item.maxAttempt }}
                    </p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p class="font-medium text-slate-900">{{ item.sourceStatus || 'unknown' }}</p>
                    <p class="mt-1 text-xs text-slate-500">{{ item.sourceProgressPercent }}% · ETA {{ formatEtaSeconds(item.sourceEtaSeconds) }}</p>
                  </div>
                </td>
                <td class="py-3 pr-3">
                  <div>
                    <p>{{ formatDurationMs(item.durationMs) }}</p>
                    <p v-if="!item.finishedAt && item.runningDurationMs > 0" class="mt-1 text-xs text-slate-500">
                      已运行 {{ formatDurationMs(item.runningDurationMs) }}
                    </p>
                  </div>
                </td>
                <td class="py-3">
                  <p class="text-xs leading-5 text-slate-600">
                    {{ item.errorMessage || '无' }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3 text-sm">
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
