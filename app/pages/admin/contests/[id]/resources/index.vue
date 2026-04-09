<script setup lang="ts">
import type { ApiResponse, Resource, ResourceCategory, ResourceStatus } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

const categoryOptions: Array<{ value: ResourceCategory, label: string }> = [
  { value: 'basic_info', label: '基本信息' },
  { value: 'timeline', label: '时间轴' },
  { value: 'tracks', label: '赛道设置' },
  { value: 'scoring', label: '评分标准' },
  { value: 'past_questions', label: '往届真题' },
  { value: 'awarded_works', label: '获奖作品' },
  { value: 'templates', label: '模板资料' },
  { value: 'faq', label: 'FAQ' },
  { value: 'judge_guidelines', label: '评委细则' },
  { value: 'track_details', label: '赛道详解' },
  { value: 'ai_prompts', label: 'AI 提示词' },
  { value: 'submission_examples', label: '材料示例' },
  { value: 'policy_notice', label: '政策通知' },
  { value: 'compliance', label: '合规与版权' },
]

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
  for (const item of categoryOptions)
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
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            资料管理
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/new`)">
            上传 PDF
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-3">
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
          <a-option v-for="item in categoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <button class="dense-btn" @click="loadItems">
          应用筛选
        </button>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
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
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
  </div>
</template>
