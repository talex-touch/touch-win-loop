<script setup lang="ts">
import type { ApiResponse, Track } from '~~/shared/types/domain'

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
const tracks = ref<Track[]>([])
const trackColumns = [
  { title: '赛道名称', dataIndex: 'name', slotName: 'name', ellipsis: true, tooltip: true },
  { title: '交付物', dataIndex: 'deliverableTypes', slotName: 'deliverables', width: 220 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: 'Rubric', dataIndex: 'rubricId', slotName: 'rubricId', width: 150 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

function formatDeliverables(deliverableTypes?: string[]): string {
  if (!deliverableTypes || deliverableTypes.length === 0)
    return '待补充'
  return deliverableTypes.join(' / ')
}

async function loadTracks() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`))
    tracks.value = response.data
  }
  catch (error: any) {
    tracks.value = []
    errorText.value = String(error?.data?.message || '赛道加载失败。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadTracks)
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            赛道管理
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/tracks/new`)">
            新增赛道
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
        :data="tracks"
        :columns="trackColumns"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, showTotal: true, size: 'mini' }"
      >
        <template #name="{ record }">
          <span class="text-xs font-semibold text-slate-900">{{ record.name }}</span>
        </template>
        <template #deliverables="{ record }">
          <span class="text-xs text-slate-600">{{ formatDeliverables(record.deliverableTypes) }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : 'blue'" size="small">
            {{ record.status || 'draft' }}
          </a-tag>
        </template>
        <template #rubricId="{ record }">
          <span class="text-xs text-slate-500">{{ record.rubricId || '未关联' }}</span>
        </template>
        <template #actions="{ record }">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/tracks/${record.id}/edit`)">
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
