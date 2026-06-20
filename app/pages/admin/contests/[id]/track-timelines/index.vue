<script setup lang="ts">
import type { ApiResponse, Track, TrackTimeline } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

const loading = ref(false)
const errorText = ref('')
const items = ref<TrackTimeline[]>([])
const tracks = ref<Track[]>([])
let loadRequestId = 0
const trackColumns = [
  { title: '赛道', dataIndex: 'trackId', slotName: 'track', width: 180 },
  { title: '年份', dataIndex: 'year', width: 100 },
  { title: '节点类型', dataIndex: 'nodeType', slotName: 'nodeType', width: 160 },
  { title: '开始时间', dataIndex: 'startAt', slotName: 'startAt', width: 180 },
  { title: '结束时间', dataIndex: 'endAt', slotName: 'endAt', width: 180 },
  { title: '备注', dataIndex: 'note', slotName: 'note', ellipsis: true, tooltip: true },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const trackNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of tracks.value) {
    if (item.contestId === contestId.value)
      map.set(item.id, item.name)
  }
  return map
})

const visibleItems = computed(() => {
  return items.value.filter((item) => {
    const state = item as TrackTimeline & { deletedAt?: string | null, status?: string | null }
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
    tracks.value = []
    return
  }

  loading.value = true
  try {
    const [timelineRes, trackRes] = await Promise.all([
      unsafeFetch<ApiResponse<TrackTimeline[]>>(endpoint(`/admin/contests/${targetContestId}/track-timelines`)),
      unsafeFetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${targetContestId}/tracks`)),
    ])
    if (requestId !== loadRequestId)
      return
    items.value = timelineRes.data
    tracks.value = trackRes.data
  }
  catch (error: any) {
    if (requestId !== loadRequestId)
      return
    items.value = []
    tracks.value = []
    errorText.value = String(error?.data?.message || '赛道时间线加载失败。')
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
            赛道时间线管理
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <button class="dense-btn" type="button" :disabled="loading" @click="loadItems">
            刷新
          </button>
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/track-timelines/new`)">
            新增赛道节点
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
        :columns="trackColumns"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, showTotal: true, size: 'mini' }"
      >
        <template #track="{ record }">
          <span class="text-xs text-slate-900 font-semibold">{{ trackNameMap.get(record.trackId) || record.trackId }}</span>
        </template>
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
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/track-timelines/${record.id}/edit`)">
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
