<script setup lang="ts">
import type { ApiResponse, ContestAuditLog } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface AuditPagePayload {
  items: ContestAuditLog[]
  total: number
  page: number
  pageSize: number
}

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const loading = ref(false)
const errorText = ref('')
const logs = ref<ContestAuditLog[]>([])
const actionFilter = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadLogs() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<AuditPagePayload>>(endpoint(`/admin/contests/${contestId.value}/audit`), {
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
    errorText.value = String(error?.data?.message || '审计日志加载失败。')
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

watch([page, pageSize], () => {
  void loadLogs()
})

onMounted(loadLogs)
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            审计历史
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            只保留最近 7 天，读操作与 AI 调用会自动压缩去重。
          </p>
        </div>
        <button class="dense-btn" @click="loadLogs">
          刷新
        </button>
      </div>
    </section>

    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="grid gap-2 md:grid-cols-[1fr_auto]">
        <a-input
          v-model="actionFilter"
          size="small"
          allow-clear
          placeholder="按 action 模糊筛选，如 ai.invoke / read.admin / resource.patch"
          @press-enter="() => { page = 1; loadLogs() }"
        />
        <button class="dense-btn" @click="() => { page = 1; loadLogs() }">
          应用筛选
        </button>
      </div>
    </section>

    <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="rounded-lg border border-slate-200 bg-white p-4">
      <div v-if="logs.length === 0" class="text-sm text-slate-500">
        当前筛选下暂无审计日志。
      </div>
      <div v-else class="space-y-2">
        <article
          v-for="item in logs"
          :key="item.id"
          class="rounded border border-slate-200 p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-semibold text-slate-900">
              {{ item.action }}
            </p>
            <p class="text-xs text-slate-500">
              {{ formatTime(item.createdAt) }}
            </p>
          </div>
          <p class="mt-1 text-xs text-slate-500">
            actor={{ item.actorUserId || '-' }} · contest={{ item.contestId || '-' }} · resource={{ item.resourceId || '-' }}
          </p>
          <pre class="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-700">{{ JSON.stringify(item.payload || {}, null, 2) }}</pre>
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

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>
  </div>
</template>
