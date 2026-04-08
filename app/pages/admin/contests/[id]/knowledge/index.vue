<script setup lang="ts">
import type {
  ApiResponse,
  Contest,
  DocumentAnalysis,
  Resource,
  ResourceCategory,
  ResourceDemandInsight,
  ResourceGovernanceTask,
  ResourceGovernanceTaskType,
  ResourceKnowledgeGovernanceStatus,
  ResourceKnowledgeOverview,
  ResourceKnowledgeProfile,
  ResourceRelation,
  ResourceSearchEvent,
} from '~~/shared/types/domain'
import { resourceCategoryOptions, useResourceCategoryLabelMap } from '~~/app/composables/resource-knowledge'

definePageMeta({
  layout: 'admin',
})

interface KnowledgeDetailPayload {
  contest: Contest
  resource: Resource
  profile: ResourceKnowledgeProfile | null
  relations: ResourceRelation[]
  governanceTasks: ResourceGovernanceTask[]
  documentAnalysis: DocumentAnalysis | null
  searchMetrics: {
    searchCount7d: number
    clickCount7d: number
    searchCount30d: number
    clickCount30d: number
  }
}

interface DemandPayload {
  contestId: string
  insights: ResourceDemandInsight[]
  recentEvents: ResourceSearchEvent[]
  summary: {
    searchCount: number
    clickCount: number
    zeroResultCount: number
  }
}

type KnowledgeViewKey
  = | 'category'
    | 'quality'
    | 'value'
    | 'relation'
    | 'demand'
    | 'task'
    | 'search'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const categoryLabelMap = useResourceCategoryLabelMap()

const knowledgeViews: Array<{ key: KnowledgeViewKey, label: string }> = [
  { key: 'category', label: '分类标签' },
  { key: 'quality', label: '质检评分' },
  { key: 'value', label: '价值热度' },
  { key: 'relation', label: '知识关联' },
  { key: 'demand', label: '需求洞察' },
  { key: 'task', label: '治理任务' },
  { key: 'search', label: '检索优化' },
]

const activeView = ref<KnowledgeViewKey>('category')
const loading = ref(false)
const actionLoading = ref(false)
const detailLoading = ref(false)
const errorText = ref('')
const successText = ref('')

const overview = ref<ResourceKnowledgeOverview | null>(null)
const resources = ref<Resource[]>([])
const tasks = ref<ResourceGovernanceTask[]>([])
const demand = ref<DemandPayload | null>(null)
const detail = ref<KnowledgeDetailPayload | null>(null)
const selectedResourceId = ref('')

const overrideForm = reactive({
  predictedCategory: '' as ResourceCategory | '',
  aiTagsText: '',
  qualityScore: '',
  governanceStatus: 'review' as ResourceKnowledgeGovernanceStatus,
})

const visibleResources = computed(() => {
  if (activeView.value === 'quality') {
    return [...resources.value].sort((left, right) => Number(right.aiProfile?.qualityScore || 0) - Number(left.aiProfile?.qualityScore || 0))
  }
  if (activeView.value === 'value') {
    return [...resources.value].sort((left, right) => {
      const rightScore = Number(right.aiProfile?.valueScore || 0) + Number(right.aiProfile?.hotScore || 0)
      const leftScore = Number(left.aiProfile?.valueScore || 0) + Number(left.aiProfile?.hotScore || 0)
      return rightScore - leftScore
    })
  }
  if (activeView.value === 'relation')
    return resources.value.filter(item => (item.aiProfile?.relatedResources || []).length > 0)
  if (activeView.value === 'search')
    return [...resources.value].sort((left, right) => Number(right.aiProfile?.hotScore || 0) - Number(left.aiProfile?.hotScore || 0))
  return resources.value
})

const unhealthyResources = computed(() => {
  return resources.value.filter(item => (item.aiProfile?.qualityIssues || []).length > 0)
})

const topDemandQueries = computed(() => demand.value?.insights || [])

const relatedPreview = computed(() => detail.value?.relations || detail.value?.resource.aiProfile?.relatedResources || [])

function resetOverrideForm(payload: KnowledgeDetailPayload | null) {
  overrideForm.predictedCategory = payload?.profile?.predictedCategory || ''
  overrideForm.aiTagsText = (payload?.profile?.aiTags || []).join(', ')
  overrideForm.qualityScore = payload?.profile ? String(payload.profile.qualityScore) : ''
  overrideForm.governanceStatus = payload?.profile?.governanceStatus || 'review'
}

async function loadOverview() {
  const response = await $fetch<ApiResponse<ResourceKnowledgeOverview>>(endpoint(`/admin/contests/${contestId.value}/knowledge`))
  overview.value = response.data
}

async function loadResources() {
  const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/admin/contests/${contestId.value}/knowledge/resources`))
  resources.value = response.data
  if (!selectedResourceId.value && resources.value[0]?.id)
    selectedResourceId.value = resources.value[0].id
}

async function loadTasks() {
  const response = await $fetch<ApiResponse<ResourceGovernanceTask[]>>(endpoint(`/admin/contests/${contestId.value}/knowledge/governance/tasks`), {
    query: {
      limit: 50,
    },
  })
  tasks.value = response.data
}

async function loadDemand() {
  const response = await $fetch<ApiResponse<DemandPayload>>(endpoint(`/admin/contests/${contestId.value}/knowledge/demand`), {
    query: {
      limit: 20,
      days: 30,
    },
  })
  demand.value = response.data
}

async function loadDetail(resourceId: string) {
  if (!resourceId) {
    detail.value = null
    resetOverrideForm(null)
    return
  }
  detailLoading.value = true
  try {
    const response = await $fetch<ApiResponse<KnowledgeDetailPayload>>(endpoint(`/admin/contests/${contestId.value}/knowledge/resources/${resourceId}`))
    detail.value = response.data
    resetOverrideForm(response.data)
  }
  finally {
    detailLoading.value = false
  }
}

async function loadAll() {
  if (!contestId.value)
    return
  loading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await Promise.all([
      loadOverview(),
      loadResources(),
      loadTasks(),
      loadDemand(),
    ])
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '知识库治理数据加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function selectResource(resourceId: string) {
  selectedResourceId.value = resourceId
  await loadDetail(resourceId)
}

async function triggerAnalyze(resourceIds?: string[]) {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/knowledge/resources/analyze`), {
      method: 'POST',
      body: {
        resourceIds,
      },
    })
    successText.value = resourceIds?.length ? '已提交选中资源重算任务。' : '已提交全量资源重算任务。'
    await Promise.all([loadTasks(), loadResources(), loadOverview()])
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '触发知识分析失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function createGovernanceTask(taskType: ResourceGovernanceTaskType) {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/knowledge/governance/tasks`), {
      method: 'POST',
      body: {
        taskType,
        resourceId: selectedResourceId.value || undefined,
      },
    })
    successText.value = '治理任务已创建。'
    await loadTasks()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '创建治理任务失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function saveOverrides() {
  if (!selectedResourceId.value)
    return
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/knowledge/resources/${selectedResourceId.value}`), {
      method: 'PATCH',
      body: {
        predictedCategory: overrideForm.predictedCategory || undefined,
        aiTags: overrideForm.aiTagsText
          .split(/[,\n，、]/g)
          .map(item => item.trim())
          .filter(Boolean),
        qualityScore: overrideForm.qualityScore ? Number(overrideForm.qualityScore) : undefined,
        governanceStatus: overrideForm.governanceStatus,
      },
    })
    successText.value = '人工覆盖已保存，已重新加入分析链路。'
    await Promise.all([
      loadOverview(),
      loadResources(),
      loadTasks(),
      loadDetail(selectedResourceId.value),
    ])
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '保存人工覆盖失败。')
  }
  finally {
    actionLoading.value = false
  }
}

watch(selectedResourceId, async (value, oldValue) => {
  if (!value || value === oldValue)
    return
  await loadDetail(value)
})

watch(contestId, async (value, oldValue) => {
  if (!value || value === oldValue)
    return
  selectedResourceId.value = ''
  detail.value = null
  await loadAll()
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            知识库治理
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            资料入库、画像分析、质量评分、关联推荐、需求洞察与治理建议统一在竞赛工作台闭环处理。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="dense-btn" :disabled="actionLoading" @click="triggerAnalyze()">
            全量重算
          </button>
          <button class="dense-btn" :disabled="actionLoading || !selectedResourceId" @click="triggerAnalyze(selectedResourceId ? [selectedResourceId] : undefined)">
            重算当前资源
          </button>
          <button class="dense-btn" :disabled="actionLoading" @click="createGovernanceTask('relation_refresh')">
            刷新关联
          </button>
        </div>
      </div>
    </section>

    <section v-if="overview" class="gap-3 grid md:grid-cols-6">
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          总资源数
        </p>
        <p class="text-xl text-slate-900 font-semibold mt-2">
          {{ overview.summary.totalResources }}
        </p>
      </article>
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          已分析
        </p>
        <p class="text-xl text-slate-900 font-semibold mt-2">
          {{ overview.summary.analyzedResources }}
        </p>
      </article>
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          待复核
        </p>
        <p class="text-xl text-amber-600 font-semibold mt-2">
          {{ overview.summary.reviewResources }}
        </p>
      </article>
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          质量均分
        </p>
        <p class="text-xl text-slate-900 font-semibold mt-2">
          {{ overview.summary.avgQualityScore }}
        </p>
      </article>
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          价值均分
        </p>
        <p class="text-xl text-slate-900 font-semibold mt-2">
          {{ overview.summary.avgValueScore }}
        </p>
      </article>
      <article class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-500">
          待执行任务
        </p>
        <p class="text-xl text-slate-900 font-semibold mt-2">
          {{ overview.summary.pendingTasks }}
        </p>
      </article>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="view in knowledgeViews"
          :key="view.key"
          class="text-xs font-medium px-3 py-1.5 rounded transition-colors"
          :class="activeView === view.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
          @click="activeView = view.key"
        >
          {{ view.label }}
        </button>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <div v-else class="gap-4 grid xl:grid-cols-[minmax(0,2fr)_360px]">
      <section class="space-y-4">
        <section v-if="activeView === 'category'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            分类标签
          </h2>
          <div class="mt-3 space-y-3">
            <article
              v-for="item in visibleResources.slice(0, 12)"
              :key="item.id"
              class="p-3 border rounded-lg cursor-pointer transition"
              :class="selectedResourceId === item.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'"
              @click="selectResource(item.id)"
            >
              <div class="flex flex-wrap gap-2 items-start justify-between">
                <div>
                  <h3 class="text-sm text-slate-900 font-medium">
                    {{ item.title }}
                  </h3>
                  <p class="text-xs text-slate-500 mt-1">
                    业务分类：{{ categoryLabelMap.get(item.category || 'basic_info') || item.category }} ｜ 推荐分类：{{ categoryLabelMap.get(item.aiProfile?.predictedCategory || 'basic_info') || item.aiProfile?.predictedCategory || '待分析' }}
                  </p>
                </div>
                <span class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  置信度 {{ item.aiProfile ? Math.round((item.aiProfile.categoryConfidence || 0) * 100) : 0 }}%
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="tag in item.aiProfile?.aiTags || []"
                  :key="`${item.id}-${tag}`"
                  class="text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-700"
                >
                  {{ tag }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="activeView === 'quality'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            质检评分
          </h2>
          <div class="mt-3 space-y-3">
            <article
              v-for="item in unhealthyResources.slice(0, 12)"
              :key="item.id"
              class="p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-slate-300"
              @click="selectResource(item.id)"
            >
              <div class="flex flex-wrap gap-2 items-start justify-between">
                <div>
                  <h3 class="text-sm text-slate-900 font-medium">
                    {{ item.title }}
                  </h3>
                  <p class="text-xs text-slate-500 mt-1">
                    质量分 {{ item.aiProfile?.qualityScore || 0 }} ｜ 治理状态 {{ item.aiProfile?.governanceStatus || 'pending' }}
                  </p>
                </div>
              </div>
              <div class="mt-2 space-y-1">
                <p
                  v-for="issue in item.aiProfile?.qualityIssues || []"
                  :key="`${item.id}-${issue.code}`"
                  class="text-xs text-slate-700"
                >
                  {{ issue.code }}：{{ issue.message }}
                </p>
              </div>
            </article>
          </div>
        </section>

        <section v-if="activeView === 'value'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            价值热度
          </h2>
          <div class="mt-3 gap-3 grid md:grid-cols-3">
            <article class="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <p class="text-xs text-slate-500">
                价值 Top5
              </p>
              <div class="mt-2 space-y-2">
                <button
                  v-for="item in overview?.topValueResources || []"
                  :key="item.id"
                  class="block w-full text-left text-xs text-slate-700 hover:text-slate-900"
                  @click="selectResource(item.id)"
                >
                  {{ item.title }} ｜ {{ item.aiProfile?.valueScore || 0 }}
                </button>
              </div>
            </article>
            <article class="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <p class="text-xs text-slate-500">
                热度 Top5
              </p>
              <div class="mt-2 space-y-2">
                <button
                  v-for="item in overview?.topHotResources || []"
                  :key="item.id"
                  class="block w-full text-left text-xs text-slate-700 hover:text-slate-900"
                  @click="selectResource(item.id)"
                >
                  {{ item.title }} ｜ {{ item.aiProfile?.hotScore || 0 }}
                </button>
              </div>
            </article>
            <article class="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <p class="text-xs text-slate-500">
                质量 Top5
              </p>
              <div class="mt-2 space-y-2">
                <button
                  v-for="item in overview?.topQualityResources || []"
                  :key="item.id"
                  class="block w-full text-left text-xs text-slate-700 hover:text-slate-900"
                  @click="selectResource(item.id)"
                >
                  {{ item.title }} ｜ {{ item.aiProfile?.qualityScore || 0 }}
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="activeView === 'relation'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            知识关联
          </h2>
          <div class="mt-3 space-y-3">
            <article
              v-for="item in visibleResources.slice(0, 12)"
              :key="item.id"
              class="p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-slate-300"
              @click="selectResource(item.id)"
            >
              <h3 class="text-sm text-slate-900 font-medium">
                {{ item.title }}
              </h3>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="relation in item.aiProfile?.relatedResources || []"
                  :key="relation.id"
                  class="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700"
                >
                  {{ relation.relationType }} ｜ {{ relation.targetTitle }}
                </span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="activeView === 'demand'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            需求洞察
          </h2>
          <div class="mt-3 overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-left text-slate-500 border-b border-slate-200">
                  <th class="py-2 pr-3">
                    查询词
                  </th>
                  <th class="py-2 pr-3">
                    搜索量
                  </th>
                  <th class="py-2 pr-3">
                    零结果
                  </th>
                  <th class="py-2 pr-3">
                    低点击
                  </th>
                  <th class="py-2 pr-3">
                    CTR
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in topDemandQueries" :key="item.query" class="border-b border-slate-100">
                  <td class="py-2 pr-3 text-slate-800">
                    {{ item.query }}
                  </td>
                  <td class="py-2 pr-3">
                    {{ item.searchCount }}
                  </td>
                  <td class="py-2 pr-3 text-rose-600">
                    {{ item.zeroResultCount }}
                  </td>
                  <td class="py-2 pr-3 text-amber-600">
                    {{ item.lowClickCount }}
                  </td>
                  <td class="py-2 pr-3">
                    {{ item.ctr }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="activeView === 'task'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <h2 class="text-sm text-slate-900 font-semibold">
              治理任务
            </h2>
            <div class="flex flex-wrap gap-2">
              <button class="dense-btn" :disabled="actionLoading" @click="createGovernanceTask('governance_apply')">
                生成治理建议
              </button>
              <button class="dense-btn" :disabled="actionLoading" @click="createGovernanceTask('relation_refresh')">
                刷新当前关联
              </button>
            </div>
          </div>
          <div class="mt-3 space-y-2">
            <article
              v-for="task in tasks"
              :key="task.id"
              class="p-3 border border-slate-200 rounded-lg"
            >
              <div class="flex flex-wrap gap-2 items-start justify-between">
                <div>
                  <p class="text-xs text-slate-800 font-medium">
                    {{ task.taskType }} ｜ {{ task.status }}
                  </p>
                  <p class="text-[11px] text-slate-500 mt-1">
                    resourceId={{ task.resourceId || 'ALL' }} ｜ attempt {{ task.attempt }}/{{ task.maxAttempt }}
                  </p>
                </div>
                <p class="text-[11px] text-slate-500">
                  {{ task.updatedAt }}
                </p>
              </div>
              <p v-if="task.errorMessage" class="text-[11px] text-rose-600 mt-2">
                {{ task.errorMessage }}
              </p>
            </article>
          </div>
        </section>

        <section v-if="activeView === 'search'" class="p-4 border border-slate-200 rounded-lg bg-white">
          <h2 class="text-sm text-slate-900 font-semibold">
            检索优化
          </h2>
          <div class="mt-3 gap-3 grid md:grid-cols-2">
            <article class="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <p class="text-xs text-slate-500">
                零结果与低点击查询
              </p>
              <div class="mt-2 space-y-2">
                <div
                  v-for="item in topDemandQueries.slice(0, 8)"
                  :key="`search-${item.query}`"
                  class="text-xs text-slate-700"
                >
                  {{ item.query }} ｜ 零结果 {{ item.zeroResultCount }} ｜ 低点击 {{ item.lowClickCount }}
                </div>
              </div>
            </article>
            <article class="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <p class="text-xs text-slate-500">
                热门资源排序参考
              </p>
              <div class="mt-2 space-y-2">
                <button
                  v-for="item in visibleResources.slice(0, 8)"
                  :key="`hot-${item.id}`"
                  class="block w-full text-left text-xs text-slate-700 hover:text-slate-900"
                  @click="selectResource(item.id)"
                >
                  {{ item.title }} ｜ 热度 {{ item.aiProfile?.hotScore || 0 }} ｜ 价值 {{ item.aiProfile?.valueScore || 0 }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </section>

      <aside class="space-y-4">
        <section class="p-4 border border-slate-200 rounded-lg bg-white">
          <div class="flex items-center justify-between">
            <h2 class="text-sm text-slate-900 font-semibold">
              资源治理面板
            </h2>
            <span v-if="detailLoading" class="text-[11px] text-slate-500">
              加载中...
            </span>
          </div>

          <div v-if="detail" class="mt-3 space-y-4">
            <div>
              <h3 class="text-sm text-slate-900 font-medium">
                {{ detail.resource.title }}
              </h3>
              <p class="text-xs text-slate-500 mt-1">
                {{ categoryLabelMap.get(detail.resource.category || 'basic_info') || detail.resource.category }} ｜ 质量 {{ detail.profile?.qualityScore || 0 }} ｜ 价值 {{ detail.profile?.valueScore || 0 }} ｜ 热度 {{ detail.profile?.hotScore || 0 }}
              </p>
            </div>

            <div class="text-xs text-slate-700 space-y-1">
              <p>7 日搜索量：{{ detail.searchMetrics.searchCount7d }}</p>
              <p>7 日点击量：{{ detail.searchMetrics.clickCount7d }}</p>
              <p>30 日搜索量：{{ detail.searchMetrics.searchCount30d }}</p>
              <p>30 日点击量：{{ detail.searchMetrics.clickCount30d }}</p>
            </div>

            <div>
              <p class="text-xs text-slate-500 mb-2">
                人工覆盖
              </p>
              <div class="space-y-2">
                <select v-model="overrideForm.predictedCategory" class="dense-input">
                  <option
                    v-for="item in resourceCategoryOptions"
                    :key="item.value || 'all'"
                    :value="item.value"
                  >
                    {{ item.label }}
                  </option>
                </select>
                <textarea
                  v-model="overrideForm.aiTagsText"
                  class="dense-input min-h-[96px]"
                  placeholder="AI 标签，使用逗号分隔"
                />
                <input
                  v-model="overrideForm.qualityScore"
                  class="dense-input"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="人工质量分"
                >
                <select v-model="overrideForm.governanceStatus" class="dense-input">
                  <option value="healthy">
                    healthy
                  </option>
                  <option value="review">
                    review
                  </option>
                  <option value="suggested_invalid">
                    suggested_invalid
                  </option>
                  <option value="suggested_archive">
                    suggested_archive
                  </option>
                </select>
                <button class="dense-btn w-full" :disabled="actionLoading" @click="saveOverrides">
                  保存人工覆盖
                </button>
              </div>
            </div>

            <div>
              <p class="text-xs text-slate-500 mb-2">
                关联推荐
              </p>
              <div class="space-y-2">
                <div
                  v-for="relation in relatedPreview"
                  :key="relation.id"
                  class="p-2 rounded bg-slate-50 text-xs text-slate-700"
                >
                  <p class="font-medium">
                    {{ relation.targetTitle }}
                  </p>
                  <p class="mt-1">
                    {{ relation.relationType }} ｜ 权重 {{ relation.weight }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="mt-3 text-xs text-slate-500">
            选择左侧资源查看治理详情。
          </div>
        </section>
      </aside>
    </div>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>
