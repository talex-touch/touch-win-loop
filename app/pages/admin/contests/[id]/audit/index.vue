<script setup lang="ts">
import type { ApiResponse, ContestWorkflowTimelineItem } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface AuditPagePayload {
  items: ContestWorkflowTimelineItem[]
  total: number
  page: number
  pageSize: number
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const loading = ref(false)
const errorText = ref('')
const logs = ref<ContestWorkflowTimelineItem[]>([])
const actionFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadLogs() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await unsafeFetch<ApiResponse<AuditPagePayload>>(endpoint(`/admin/contests/${contestId.value}/audit`), {
      query: {
        action: actionFilter.value.trim(),
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    logs.value = response.data.items || []
    total.value = Number(response.data.total || 0)
  }
  catch (error: any) {
    logs.value = []
    total.value = 0
    errorText.value = String(error?.data?.message || '流程时间线加载失败。')
  }
  finally {
    loading.value = false
  }
}

function formatTime(value?: string): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
}

function sourceLabel(source: ContestWorkflowTimelineItem['source']): string {
  if (source === 'feishu')
    return '飞书同步'
  if (source === 'review')
    return '审核'
  if (source === 'publish')
    return '发布'
  if (source === 'repair')
    return '回补'
  return '人工'
}

function sourceColor(source: ContestWorkflowTimelineItem['source']): string {
  if (source === 'feishu')
    return 'arcoblue'
  if (source === 'review')
    return 'gold'
  if (source === 'publish')
    return 'green'
  if (source === 'repair')
    return 'purple'
  return 'gray'
}

watch([page, pageSize], () => {
  void loadLogs()
})

onMounted(loadLogs)
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            流程时间线
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            合并展示飞书同步、人工编辑、审核与发布事件，帮助追踪每次版本演进。
          </p>
        </div>
        <button class="dense-btn" @click="loadLogs">
          刷新
        </button>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-[1fr_auto]">
        <a-input
          v-model="actionFilter"
          size="small"
          allow-clear
          placeholder="按动作/来源模糊筛选，如 sync_generated / published / contest.patch"
          @press-enter="() => { page = 1; loadLogs() }"
        />
        <button class="dense-btn" @click="() => { page = 1; loadLogs() }">
          应用筛选
        </button>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="logs.length === 0" class="text-sm text-slate-500">
        当前筛选下暂无流程事件。
      </div>
      <div v-else class="space-y-2">
        <article
          v-for="item in logs"
          :key="item.id"
          class="p-3 border border-slate-200 rounded"
        >
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="flex flex-wrap gap-2 items-center">
              <a-tag size="small" :color="sourceColor(item.source)">
                {{ sourceLabel(item.source) }}
              </a-tag>
              <p class="text-xs text-slate-900 font-semibold">
                {{ item.title }}
              </p>
            </div>
            <p class="text-xs text-slate-500">
              {{ formatTime(item.createdAt) }}
            </p>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            action={{ item.action }} · actor={{ item.actorUserId || '-' }} · version={{ item.versionNumber ? `V${item.versionNumber}` : '-' }}
          </p>
          <p v-if="item.description" class="text-xs text-slate-600 mt-1">
            {{ item.description }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            syncItemId={{ item.syncItemId || '-' }} · syncRunId={{ item.syncRunId || '-' }} · recordId={{ item.recordId || '-' }}
          </p>
          <pre class="text-[11px] text-slate-700 mt-2 p-2 rounded bg-slate-50 overflow-x-auto">{{ JSON.stringify(item.payload || {}, null, 2) }}</pre>
        </article>
      </div>

      <div class="mt-3 flex justify-end">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50]"
          :show-total="true"
          :total="total"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1 }"
        />
      </div>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
  </div>
</template>
