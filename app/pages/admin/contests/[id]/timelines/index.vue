<script setup lang="ts">
import type { ApiResponse, ContestTimeline } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

const loading = ref(false)
const errorText = ref('')
const items = ref<ContestTimeline[]>([])
let loadRequestId = 0
const timelineColumns = [
  { title: '年份', dataIndex: 'year', width: 100 },
  { title: '节点类型', dataIndex: 'nodeType', slotName: 'nodeType', width: 160 },
  { title: '开始时间', dataIndex: 'startAt', slotName: 'startAt', width: 180 },
  { title: '结束时间', dataIndex: 'endAt', slotName: 'endAt', width: 180 },
  { title: '备注', dataIndex: 'note', slotName: 'note', ellipsis: true, tooltip: true },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const visibleItems = computed(() => {
  return items.value.filter((item) => {
    const state = item as ContestTimeline & { deletedAt?: string | null, status?: string | null }
    return item.contestId === contestId.value
      && !state.deletedAt
      && state.status !== 'deleted'
      && state.status !== 'archived'
  })
})

function formatTime(value?: string | null): string {
  return value?.trim() || '待补充'
}

async function loadItems() {
  const requestId = ++loadRequestId
  const targetContestId = contestId.value
  errorText.value = ''
  if (!targetContestId) {
    loading.value = false
    items.value = []
    return
  }

  loading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ContestTimeline[]>>(endpoint(`/admin/contests/${targetContestId}/timelines`))
    if (requestId !== loadRequestId)
      return
    items.value = response.data
  }
  catch (error: any) {
    if (requestId !== loadRequestId)
      return
    items.value = []
    errorText.value = String(error?.data?.message || '时间轴加载失败。')
  }
  finally {
    if (requestId === loadRequestId)
      loading.value = false
  }
}

watch(contestId, () => {
  void loadItems()
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            时间节点管理
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <button class="dense-btn" type="button" :disabled="loading" @click="loadItems">
            刷新
          </button>
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/timelines/new`)">
            新增节点
          </NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-table
        :data="visibleItems"
        :columns="timelineColumns"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, showTotal: true, size: 'mini' }"
      >
        <template #nodeType="{ record }">
          <span class="text-xs text-slate-900 font-semibold">{{ record.nodeType }}</span>
        </template>
        <template #startAt="{ record }">
          <span class="text-xs text-slate-600">{{ formatTime(record.startAt) }}</span>
        </template>
        <template #endAt="{ record }">
          <span class="text-xs text-slate-600">{{ formatTime(record.endAt) }}</span>
        </template>
        <template #note="{ record }">
          <span class="text-xs text-slate-500">{{ record.note || '—' }}</span>
        </template>
        <template #actions="{ record }">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/timelines/${record.id}/edit`)">
            编辑
          </NuxtLink>
        </template>
      </a-table>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
  </div>
</template>
