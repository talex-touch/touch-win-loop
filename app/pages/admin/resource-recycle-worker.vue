<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface WorkerStatusPayload {
  started: boolean
  enabled: boolean
  ticking: boolean
  intervalMs: number
  retentionDays: number
  batchSize: number
  lastStartedAt: string
  lastFinishedAt: string
  lastSuccessAt: string
  lastError: string
  runCount: number
  successCount: number
  failureCount: number
  totalPurgedCount: number
  totalDeletedObjects: number
  lastPurgedCount: number
  lastDeletedObjects: number
}

interface RecycleBinPayload {
  archivedCount: number
  archivedUploadCount: number
  oldestArchivedAt: string
}

interface RunRecordPayload {
  id: string
  startedAt: string
  finishedAt: string
  durationMs: number
  purgedCount: number
  deletedObjects: number
  success: boolean
  errorMessage: string
}

interface RecycleWorkerStatusPayload {
  worker: WorkerStatusPayload
  recycleBin: RecycleBinPayload
  recentRuns: RunRecordPayload[]
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const refreshing = ref(false)
const errorText = ref('')
const autoRefresh = ref(true)
const page = ref(1)
const pageSize = ref(10)
const payload = ref<RecycleWorkerStatusPayload | null>(null)

let refreshTimer: ReturnType<typeof setInterval> | null = null

const runColumns = [
  { title: '开始时间', dataIndex: 'startedAt', slotName: 'startedAt', width: 180 },
  { title: '耗时', dataIndex: 'durationMs', slotName: 'duration', width: 90 },
  { title: '状态', dataIndex: 'success', slotName: 'status', width: 90 },
  { title: '清理资源', dataIndex: 'purgedCount', width: 90 },
  { title: '删除对象', dataIndex: 'deletedObjects', width: 90 },
  { title: '错误信息', dataIndex: 'errorMessage', slotName: 'errorMessage' },
]

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
  const value = Math.max(0, Math.trunc(Number(durationMs || 0)))
  if (value < 1000)
    return `${value}ms`
  const seconds = value / 1000
  if (seconds < 60)
    return `${seconds.toFixed(2)}s`
  return `${(seconds / 60).toFixed(2)}m`
}

const summaryRows = computed(() => {
  const worker = payload.value?.worker
  const recycleBin = payload.value?.recycleBin
  if (!worker || !recycleBin)
    return []

  return [
    { label: 'Worker状态', value: worker.enabled ? (worker.ticking ? '运行中' : '已启动') : '已禁用' },
    { label: '调度周期', value: worker.intervalMs > 0 ? `${Math.round(worker.intervalMs / 1000)} 秒` : '-' },
    { label: '保留天数', value: `${worker.retentionDays} 天` },
    { label: '单批上限', value: String(worker.batchSize) },
    { label: '累计运行', value: `${worker.runCount} 次` },
    { label: '成功/失败', value: `${worker.successCount}/${worker.failureCount}` },
    { label: '累计清理资源', value: String(worker.totalPurgedCount) },
    { label: '累计删除对象', value: String(worker.totalDeletedObjects) },
    { label: '回收站总量', value: String(recycleBin.archivedCount) },
    { label: '上传文件待清理', value: String(recycleBin.archivedUploadCount) },
    { label: '最早删除时间', value: formatDateTime(recycleBin.oldestArchivedAt) },
    { label: '最后成功时间', value: formatDateTime(worker.lastSuccessAt) },
  ]
})

const pagedRuns = computed(() => {
  const source = payload.value?.recentRuns || []
  const start = (page.value - 1) * pageSize.value
  return source.slice(start, start + pageSize.value)
})

watch([() => payload.value?.recentRuns.length, pageSize], () => {
  const total = payload.value?.recentRuns.length || 0
  const maxPage = Math.max(1, Math.ceil(total / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

async function loadStatus(showLoading = false) {
  if (showLoading)
    loading.value = true
  else
    refreshing.value = true

  errorText.value = ''
  try {
    const response = await fetch(endpoint('/admin/resources/recycle-worker'), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<RecycleWorkerStatusPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '回收站清理任务状态加载失败。'))
    payload.value = result.data
  }
  catch (error: any) {
    payload.value = null
    errorText.value = String(error?.data?.message || '回收站清理任务状态加载失败。')
  }
  finally {
    loading.value = false
    refreshing.value = false
  }
}

function restartRefreshTimer() {
  if (refreshTimer)
    clearInterval(refreshTimer)
  refreshTimer = null

  if (!autoRefresh.value)
    return

  refreshTimer = setInterval(() => {
    void loadStatus(false)
  }, 15000)
  refreshTimer.unref?.()
}

watch(autoRefresh, () => {
  restartRefreshTimer()
})

onMounted(async () => {
  await loadStatus(true)
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
            回收站清理任务监控
          </h1>
          <p class="text-[11px] text-slate-500 mb-0 mt-1">
            展示服务端清理 worker 运行状态与最近执行结果（进程内数据，重启后重置）。
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
          <a-button size="small" type="outline" :loading="refreshing" @click="loadStatus(false)">
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
          Worker Summary
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

        <div
          v-if="payload.worker.lastError"
          class="text-[11px] text-rose-600 px-3 py-2 border-t border-rose-200 bg-rose-50"
        >
          最近错误：{{ payload.worker.lastError }}
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="mb-2 flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-800 font-bold m-0">
            最近运行记录（{{ payload.recentRuns.length }}）
          </h2>
        </div>

        <a-table
          :bordered="{ cell: true }"
          :columns="runColumns"
          :data="pagedRuns"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #startedAt="{ record }">
            {{ formatDateTime(record.startedAt) }}
          </template>

          <template #duration="{ record }">
            {{ formatDuration(record.durationMs) }}
          </template>

          <template #status="{ record }">
            <a-tag :color="record.success ? 'green' : 'red'" size="small">
              {{ record.success ? '成功' : '失败' }}
            </a-tag>
          </template>

          <template #errorMessage="{ record }">
            <span class="text-[11px]" :class="record.errorMessage ? 'text-rose-600' : 'text-slate-400'">
              {{ record.errorMessage || '-' }}
            </span>
          </template>
        </a-table>

        <div class="mt-3 flex justify-end">
          <a-pagination
            :current="page"
            :page-size="pageSize"
            :page-size-options="[10, 20, 50]"
            :show-total="true"
            :total="payload.recentRuns.length"
            size="small"
            @change="(value: number) => page = value"
            @page-size-change="(value: number) => { pageSize = value; page = 1 }"
          />
        </div>
      </section>
    </template>
  </div>
</template>
