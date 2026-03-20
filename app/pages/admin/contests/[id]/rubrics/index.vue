<script setup lang="ts">
import type { ApiResponse, Rubric, Track } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

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

const isEmbedMode = computed(() => {
  const value = route.query.embed
  if (Array.isArray(value))
    return value[0] === '1'
  return value === '1'
})

function withEmbed(path: string): string | { path: string, query: { embed: string } } {
  if (isEmbedMode.value)
    return { path, query: { embed: '1' } }
  return path
}

const loading = ref(false)
const errorText = ref('')
const items = ref<Rubric[]>([])
const tracks = ref<Track[]>([])
const rubricColumns = [
  { title: '赛道', dataIndex: 'trackId', slotName: 'track', ellipsis: true, tooltip: true },
  { title: '版本', dataIndex: 'version', slotName: 'version', width: 100 },
  { title: '评分模式', dataIndex: 'scoringMode', slotName: 'scoringMode', width: 140 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '维度数', dataIndex: 'dimensions', slotName: 'dimensions', width: 110 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const trackNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const item of tracks.value)
    map.set(item.id, item.name)
  return map
})

async function loadItems() {
  loading.value = true
  errorText.value = ''
  try {
    const [rubricsRes, tracksRes] = await Promise.all([
      $fetch<ApiResponse<Rubric[]>>(endpoint(`/admin/contests/${contestId.value}/rubrics`)),
      $fetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`)),
    ])
    items.value = rubricsRes.data
    tracks.value = tracksRes.data
  }
  catch (error: any) {
    items.value = []
    tracks.value = []
    errorText.value = String(error?.data?.message || '评分规则加载失败。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadItems)
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            评分规则管理
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/rubrics/new`)">
            新增评分规则
          </NuxtLink>
        </div>
      </div>
    </section>

    <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="rounded-lg border border-slate-200 bg-white p-4">
      <a-table
        :data="items"
        :columns="rubricColumns"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, showTotal: true, size: 'mini' }"
      >
        <template #track="{ record }">
          <span class="text-xs font-semibold text-slate-900">{{ trackNameMap.get(record.trackId) || record.trackId }}</span>
        </template>
        <template #version="{ record }">
          <span class="text-xs text-slate-600">v{{ record.version || 1 }}</span>
        </template>
        <template #scoringMode="{ record }">
          <span class="text-xs text-slate-600">{{ record.scoringMode || 'weighted' }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : 'blue'" size="small">
            {{ record.status || 'draft' }}
          </a-tag>
        </template>
        <template #dimensions="{ record }">
          <span class="text-xs text-slate-600">{{ record.dimensions.length }}</span>
        </template>
        <template #actions="{ record }">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/rubrics/${record.id}/edit`)">
            编辑
          </NuxtLink>
        </template>
      </a-table>
    </section>

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>
  </div>
</template>
