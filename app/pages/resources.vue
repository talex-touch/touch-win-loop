<script setup lang="ts">
import type {
  ApiResponse,
  Contest,
  Resource,
  ResourceAvailability,
  ResourceCategory,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

const runtime = useRuntimeConfig()
const { endpoint, resolveApiUrl } = useApiEndpoint(runtime)

const categoryOptions: Array<{ value: ResourceCategory | '', label: string }> = [
  { value: '', label: '全部分类' },
  { value: 'basic_info', label: '基本信息' },
  { value: 'timeline', label: '时间轴' },
  { value: 'tracks', label: '赛道设置' },
  { value: 'scoring', label: '评分标准' },
  { value: 'past_questions', label: '往届真题' },
  { value: 'awarded_works', label: '获奖作品' },
  { value: 'templates', label: '论文/作品模板' },
  { value: 'faq', label: 'FAQ' },
  { value: 'judge_guidelines', label: '评委细则' },
  { value: 'track_details', label: '赛道详解' },
  { value: 'ai_prompts', label: 'AI 提示词' },
  { value: 'submission_examples', label: '材料示例' },
  { value: 'policy_notice', label: '政策通知' },
  { value: 'compliance', label: '合规与版权' },
]

const availabilityOptions: Array<{ value: ResourceAvailability | '', label: string }> = [
  { value: '', label: '全部可访问性' },
  { value: 'public', label: '公开' },
  { value: 'login_required', label: '需登录' },
  { value: 'unavailable', label: '不可用' },
]

const loading = ref(false)
const loadingContests = ref(false)
const errorText = ref('')
const resources = ref<Resource[]>([])
const contests = ref<Contest[]>([])

const contestId = ref('')
const category = ref<ResourceCategory | ''>('')
const year = ref('')
const availability = ref<ResourceAvailability | ''>('')

const years = computed(() => {
  const set = new Set<number>()
  for (const item of resources.value) {
    if (item.year)
      set.add(item.year)
  }
  return Array.from(set).sort((a, b) => b - a)
})

const contestNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const contest of contests.value)
    map.set(contest.id, contest.name)
  return map
})

const availabilityLabelMap: Record<ResourceAvailability, string> = {
  public: '公开',
  login_required: '需登录',
  unavailable: '不可用',
}

async function loadContests() {
  loadingContests.value = true
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'), {
      query: {
        page: 1,
        pageSize: 100,
      },
    })
    contests.value = response.data
  }
  finally {
    loadingContests.value = false
  }
}

async function loadResources() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint('/resources'), {
      query: {
        contestId: contestId.value,
        category: category.value,
        year: year.value,
        availability: availability.value,
      },
    })
    resources.value = response.data
  }
  catch (error: any) {
    resources.value = []
    errorText.value = String(error?.data?.message || '资料加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadContests(), loadResources()])
})
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl space-y-4">
    <div class="p-4 border border-slate-200 rounded-lg bg-white">
      <h1 class="text-lg text-slate-900 font-semibold">
        竞赛资料中心
      </h1>
      <p class="text-xs text-slate-500 mt-1">
        覆盖 14 类资料，可按竞赛、年份和可访问性筛选。
      </p>
    </div>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-5">
        <select v-model="contestId" class="dense-input">
          <option value="">
            全部竞赛
          </option>
          <option
            v-for="contest in contests"
            :key="contest.id"
            :value="contest.id"
          >
            {{ contest.name }}
          </option>
        </select>

        <select v-model="category" class="dense-input">
          <option
            v-for="item in categoryOptions"
            :key="item.label"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>

        <select v-model="year" class="dense-input">
          <option value="">
            全部年份
          </option>
          <option v-for="value in years" :key="value" :value="String(value)">
            {{ value }}
          </option>
        </select>

        <select v-model="availability" class="dense-input">
          <option
            v-for="item in availabilityOptions"
            :key="item.label"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>

        <button class="dense-btn" @click="loadResources">
          应用筛选
        </button>
      </div>
      <div v-if="loadingContests" class="mt-2 rounded bg-slate-200 h-3 w-40 animate-pulse" />
    </section>

    <div v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </div>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="loading" class="space-y-3">
        <article
          v-for="index in 5"
          :key="`resource-skeleton-${index}`"
          class="p-3 border border-slate-200 rounded animate-pulse"
        >
          <div class="flex gap-2 items-start justify-between">
            <div class="max-w-xl w-full space-y-2">
              <div class="rounded bg-slate-200 h-4 w-3/5" />
              <div class="rounded bg-slate-200 h-3 w-2/5" />
            </div>
            <div class="rounded bg-slate-200 h-3 w-16" />
          </div>
          <div class="mt-3 rounded bg-slate-200 h-3 w-full" />
          <div class="mt-2 rounded bg-slate-200 h-3 w-11/12" />
        </article>
      </div>
      <div v-else-if="resources.length === 0" class="text-sm text-slate-500">
        当前筛选条件下暂无资料。
      </div>
      <div v-else class="space-y-3">
        <article
          v-for="item in resources"
          :key="item.id"
          class="p-3 border border-slate-200 rounded"
        >
          <div class="flex flex-wrap gap-2 items-start justify-between">
            <div>
              <h2 class="text-sm text-slate-900 font-medium">
                {{ item.title }}
              </h2>
              <p class="text-xs text-slate-600 mt-1">
                {{ contestNameMap.get(item.contestId) || item.contestId }} · {{ item.year }} · {{ item.category || '未分类' }}
              </p>
            </div>
            <a
              v-if="item.sourceLink"
              :href="resolveApiUrl(item.sourceLink)"
              target="_blank"
              class="text-xs text-blue-600 underline"
            >
              打开来源
            </a>
          </div>
          <p class="text-xs text-slate-700 mt-2">
            {{ item.content || item.summary || '暂无摘要。' }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            可访问性：{{ availabilityLabelMap[item.availability] || item.availability }}；版权：{{ item.copyrightNote || '待补充' }}
          </p>
        </article>
      </div>
    </section>
  </div>
</template>
