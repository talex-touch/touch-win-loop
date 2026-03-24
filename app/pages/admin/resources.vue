<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface ResourceAdminRow {
  contestId: string
  contestName: string
  category: string
  count: number
  invalidCount: number
  pendingVerifyCount: number
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const errorText = ref('')
const rows = ref<ResourceAdminRow[]>([])
const page = ref(1)
const pageSize = ref(10)

const columns = [
  { title: '赛事', dataIndex: 'contestName', slotName: 'contest' },
  { title: '分类', dataIndex: 'category', width: 140 },
  { title: '总条目', dataIndex: 'count', width: 100 },
  { title: '失效条目', dataIndex: 'invalidCount', slotName: 'invalidCount', width: 120 },
  { title: '待核验', dataIndex: 'pendingVerifyCount', slotName: 'pendingVerifyCount', width: 120 },
]

const tableRows = computed(() => {
  return rows.value.map(item => ({
    ...item,
    rowKey: `${item.contestId}-${item.category}`,
  }))
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return tableRows.value.slice(start, start + pageSize.value)
})

watch([rows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(rows.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<ResourceAdminRow[]>>(endpoint('/admin/resources'))
    rows.value = response.data
  }
  catch (error: any) {
    rows.value = []
    errorText.value = String(error?.data?.message || '资料管理数据加载失败。')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <section v-else class="p-3 border border-slate-200 bg-white">
      <a-table
        :bordered="{ cell: true }"
        :columns="columns"
        :data="pagedRows"
        :pagination="false"
        row-key="rowKey"
        size="small"
      >
        <template #contest="{ record }">
          <div class="min-w-0">
            <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
              {{ record.contestName }}
            </p>
            <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
              {{ record.contestId }}
            </p>
          </div>
        </template>

        <template #invalidCount="{ record }">
          <a-tag :color="record.invalidCount > 0 ? 'red' : 'green'" size="small">
            {{ record.invalidCount }}
          </a-tag>
        </template>

        <template #pendingVerifyCount="{ record }">
          <a-tag :color="record.pendingVerifyCount > 0 ? 'orange' : 'gray'" size="small">
            {{ record.pendingVerifyCount }}
          </a-tag>
        </template>
      </a-table>

      <div class="mt-3 flex justify-end">
        <a-pagination
          :current="page"
          :page-size="pageSize"
          :page-size-options="[10, 20, 50]"
          :show-total="true"
          :total="rows.length"
          size="small"
          @change="(value: number) => page = value"
          @page-size-change="(value: number) => { pageSize = value; page = 1 }"
        />
      </div>
    </section>
  </div>
</template>
