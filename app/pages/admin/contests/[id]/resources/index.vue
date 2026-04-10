<script setup lang="ts">
import type { ApiResponse, Resource, ResourceCategory, ResourceStatus } from '~~/shared/types/domain'
import { adminResourceCategoryOptions } from '~/utils/admin-resource-form'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

const loading = ref(false)
const errorText = ref('')
const items = ref<Resource[]>([])
const statusFilter = ref<ResourceStatus | ''>('')
const categoryFilter = ref<ResourceCategory | ''>('')
const resourceColumns = [
  { title: '标题', dataIndex: 'title', slotName: 'title', ellipsis: true, tooltip: true },
  { title: '分类', dataIndex: 'category', slotName: 'category', width: 120 },
  { title: '年份', dataIndex: 'year', width: 90 },
  { title: '访问', dataIndex: 'availability', width: 120 },
  { title: '来源类型', dataIndex: 'sourceType', width: 120 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 130 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const categoryLabelMap = computed(() => {
  const map = new Map<ResourceCategory, string>()
  for (const item of adminResourceCategoryOptions)
    map.set(item.value, item.label)
  return map
})

async function loadItems() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await unsafeFetch<ApiResponse<Resource[]>>(endpoint(`/admin/contests/${contestId.value}/resources`), {
      query: {
        status: statusFilter.value,
        category: categoryFilter.value,
      },
    })
    items.value = response.data
  }
  catch (error: any) {
    items.value = []
    errorText.value = String(error?.data?.message || '资料列表加载失败。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadItems)
</script>

<template>
  <PageShell>
    <PageHeader title="资料管理" :meta="`赛事 ID：${contestId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/new`)">
          上传 PDF
        </NuxtLink>
      </template>
    </PageHeader>

    <SectionCard>
      <FilterBar class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <a-select v-model="statusFilter" allow-clear size="small" placeholder="全部状态">
          <a-option value="active">
            active
          </a-option>
          <a-option value="pending_verify">
            pending_verify
          </a-option>
          <a-option value="invalid">
            invalid
          </a-option>
          <a-option value="archived">
            archived
          </a-option>
        </a-select>
        <a-select v-model="categoryFilter" allow-clear size="small" placeholder="全部分类">
          <a-option v-for="item in adminResourceCategoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <a-button size="small" type="primary" @click="loadItems">
          应用筛选
        </a-button>
      </FilterBar>
    </SectionCard>

    <SectionCard v-if="loading">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </SectionCard>

    <SectionCard v-else>
      <a-table
        :data="items"
        :columns="resourceColumns"
        row-key="id"
        size="small"
        :pagination="{ pageSize: 10, showTotal: true, size: 'mini' }"
      >
        <template #title="{ record }">
          <span class="text-xs text-slate-900 font-semibold">{{ record.title }}</span>
        </template>
        <template #category="{ record }">
          <span class="text-xs text-slate-600">{{ categoryLabelMap.get(record.category) || record.category }}</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 'active' ? 'green' : (record.status === 'invalid' ? 'red' : 'blue')" size="small">
            {{ record.status || 'active' }}
          </a-tag>
        </template>
        <template #actions="{ record }">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/${record.id}/edit`)">
            编辑
          </NuxtLink>
        </template>
      </a-table>
    </SectionCard>

    <StateBlock v-if="errorText" tone="error" :description="errorText" />
  </PageShell>
</template>
