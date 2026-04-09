<script setup lang="ts">
import type {
  ApiResponse,
  ContestDetailPayload,
  Resource,
  ResourceCategory,
  TimelineNodeType,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  fallbackMessage = '请求失败。',
): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const activeTab = ref<'overview' | 'track' | 'judge' | 'timeline' | 'faq' | 'resources' | 'policy'>('overview')

const categoryLabels: Record<ResourceCategory, string> = {
  basic_info: '基本信息',
  timeline: '时间轴',
  tracks: '赛道设置',
  scoring: '评分标准',
  past_questions: '往届真题',
  awarded_works: '获奖作品',
  templates: '论文/作品模板',
  faq: 'FAQ',
  judge_guidelines: '评委细则',
  track_details: '赛道详解',
  ai_prompts: 'AI 提示词',
  submission_examples: '材料示例',
  policy_notice: '政策通知',
  compliance: '合规与版权',
}

const timelineNodeLabels: Record<TimelineNodeType, string> = {
  registration: '报名',
  submission: '提交',
  preliminary: '初赛',
  final: '决赛',
  other: '其他',
}

function formatDateTime(value?: string | null): string {
  if (!value)
    return '待补充'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return date.toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const loading = ref(false)
const errorText = ref('')
const detail = ref<ContestDetailPayload | null>(null)
const resources = ref<Resource[]>([])

const contest = computed(() => detail.value?.contest || null)
const timelines = computed(() => detail.value?.timelines || [])
const rubrics = computed(() => detail.value?.rubrics || [])
const resourceStats = computed(() => detail.value?.resourceStats || [])

const sortedTimelines = computed(() => {
  return [...timelines.value].sort((a, b) => {
    const yearDelta = a.year - b.year
    if (yearDelta !== 0)
      return yearDelta
    const left = a.startAt ? new Date(a.startAt).getTime() : Number.MAX_SAFE_INTEGER
    const right = b.startAt ? new Date(b.startAt).getTime() : Number.MAX_SAFE_INTEGER
    return left - right
  })
})

const trackNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const track of contest.value?.tracks || [])
    map.set(track.id, track.name)
  return map
})

const faqItems = computed(() => {
  const items = contest.value?.faqItems || []
  return [...items]
    .filter(item => item.question || item.answer)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
})

const resourcesByCategory = computed(() => {
  const map = new Map<ResourceCategory, Resource[]>()
  for (const item of resources.value) {
    const category = item.category
    if (!category)
      continue
    const list = map.get(category) || []
    list.push(item)
    map.set(category, list)
  }
  return map
})

function getCategoryResources(category: ResourceCategory): Resource[] {
  return resourcesByCategory.value.get(category) || []
}

const tabItems = [
  { key: 'overview', label: '概览' },
  { key: 'track', label: '赛道详解' },
  { key: 'judge', label: '评委细则' },
  { key: 'timeline', label: '时间节点' },
  { key: 'faq', label: 'FAQ' },
  { key: 'resources', label: '资料库' },
  { key: 'policy', label: '政策合规' },
] as const

async function loadDetail() {
  if (!contestId.value)
    return
  detail.value = await requestApi<ContestDetailPayload>(endpoint(`/contests/${contestId.value}`), '赛事详情加载失败。')
}

async function loadResources() {
  if (!contestId.value)
    return
  resources.value = await requestApi<Resource[]>(endpoint(`/contests/${contestId.value}/resources`), '赛事资料加载失败。')
}

async function loadData() {
  if (!contestId.value)
    return
  loading.value = true
  errorText.value = ''
  try {
    await Promise.all([loadDetail(), loadResources()])
  }
  catch (error: any) {
    detail.value = null
    resources.value = []
    errorText.value = String(error?.data?.message || '加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

useHead(() => {
  return {
    title: contest.value ? `${contest.value.name} - 竞赛详情` : '竞赛详情 - WinLoop',
  }
})

onMounted(loadData)
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl space-y-4">
    <div class="p-4 border border-slate-200 rounded-lg bg-white flex flex-wrap gap-2 items-center justify-between">
      <div>
        <h1 class="text-lg text-slate-900 font-semibold">
          竞赛详情
        </h1>
        <p class="text-xs text-slate-500">
          赛事知识中台：赛道、细则、FAQ、资料与政策统一入口。
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <NuxtLink class="dense-btn" :to="`/contests/${contestId}/resources`">
          资料中心
        </NuxtLink>
        <button class="dense-btn" @click="navigateTo('/contests')">
          返回列表
        </button>
      </div>
    </div>

    <div v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </div>

    <div v-else-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </div>

    <div v-else-if="!contest" class="text-sm text-slate-500 p-4 border border-slate-200 rounded-lg bg-white">
      未找到该竞赛。
    </div>

    <template v-else>
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex flex-wrap gap-2 items-start justify-between">
          <div class="space-y-1">
            <h2 class="text-xl text-slate-900 font-semibold">
              {{ contest.name }}
            </h2>
            <div class="text-xs text-slate-600 flex flex-wrap gap-2 items-center">
              <span class="px-2 py-1 rounded bg-slate-100">{{ contest.level }}</span>
              <span>主办方：{{ contest.organizer || '待补充' }}</span>
              <span>届次：{{ contest.currentSeason || '待补充' }}</span>
              <span>状态：{{ contest.status || 'draft' }}</span>
            </div>
          </div>
          <a
            v-if="contest.officialUrl"
            :href="contest.officialUrl"
            target="_blank"
            class="text-xs text-blue-600 underline"
          >
            官方链接
          </a>
        </div>
        <p class="text-sm text-slate-700 mt-3">
          {{ contest.summary || '暂无简介，待补充。' }}
        </p>
      </section>

      <section class="p-2 border border-slate-200 rounded-lg bg-white">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in tabItems"
            :key="item.key"
            class="text-xs font-medium px-3 py-1.5 rounded transition-colors"
            :class="activeTab === item.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
            @click="activeTab = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <section v-if="activeTab === 'overview'" class="gap-3 grid md:grid-cols-2">
        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            参赛信息
          </h3>
          <div class="text-sm text-slate-700 mt-2 space-y-2">
            <p><span class="font-medium">参赛对象：</span>{{ contest.participantRequirements || '待补充' }}</p>
            <p><span class="font-medium">组队规则：</span>{{ contest.teamRule || '待补充' }}</p>
            <p><span class="font-medium">适配人群：</span>{{ contest.recommendedFor?.join(' / ') || '待补充' }}</p>
            <p><span class="font-medium">学科门类：</span>{{ contest.disciplines?.join(' / ') || '待补充' }}</p>
          </div>
        </article>
        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            知识库概览
          </h3>
          <div class="text-xs mt-3 gap-2 grid grid-cols-2 md:grid-cols-4">
            <div
              v-for="item in resourceStats"
              :key="item.category"
              class="text-slate-600 px-2 py-1 border border-slate-200 rounded bg-slate-50"
            >
              <div class="text-slate-800 font-medium">
                {{ categoryLabels[item.category] }}
              </div>
              <div>{{ item.count }} 条</div>
            </div>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'track'" class="space-y-3">
        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            赛道设置
          </h3>
          <div v-if="contest.tracks.length === 0" class="text-sm text-slate-500 mt-2">
            暂无赛道，待补充。
          </div>
          <div v-else class="mt-3 gap-2 grid md:grid-cols-2">
            <article
              v-for="track in contest.tracks"
              :key="track.id"
              class="p-3 border border-slate-200 rounded"
            >
              <h4 class="text-sm text-slate-900 font-medium">
                {{ track.name }}
              </h4>
              <p class="text-xs text-slate-600 mt-1">
                {{ track.summary || '暂无赛道说明。' }}
              </p>
              <p class="text-xs text-slate-600 mt-2">
                适配专业：{{ track.suitableMajors?.join(' / ') || '待补充' }}
              </p>
              <p class="text-xs text-slate-600 mt-1">
                交付物：{{ track.deliverableTypes?.join(' / ') || '待补充' }}
              </p>
            </article>
          </div>
        </article>

        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            赛道详解条目
          </h3>
          <div v-if="getCategoryResources('track_details').length === 0" class="text-sm text-slate-500 mt-2">
            暂无赛道详解资料。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="item in getCategoryResources('track_details')"
              :key="item.id"
              class="p-3 border border-slate-200 rounded"
            >
              <p class="text-xs text-slate-900 font-semibold">
                {{ item.title }}
              </p>
              <p class="text-xs text-slate-700 mt-1 whitespace-pre-wrap">
                {{ item.content || item.summary || '暂无内容。' }}
              </p>
            </article>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'judge'" class="space-y-3">
        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            Rubric 评分标准
          </h3>
          <div v-if="rubrics.length === 0" class="text-sm text-slate-500 mt-2">
            该赛事暂未配置评分规则。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="rubric in rubrics"
              :key="rubric.id"
              class="p-3 border border-slate-200 rounded"
            >
              <div class="flex flex-wrap gap-2 items-center">
                <span class="text-sm text-slate-900 font-medium">
                  {{ trackNameMap.get(rubric.trackId) || rubric.trackId }}
                </span>
                <span class="text-xs text-slate-600 px-2 py-0.5 rounded bg-slate-100">v{{ rubric.version || 1 }}</span>
              </div>
              <div class="mt-2 gap-1 grid md:grid-cols-2">
                <div
                  v-for="dimension in rubric.dimensions"
                  :key="`${rubric.id}-${dimension.key}`"
                  class="text-xs p-2 border border-slate-200 rounded bg-slate-50"
                >
                  <p class="text-slate-800 font-medium">
                    {{ dimension.name }}
                    <template v-if="dimension.weight !== undefined">
                      （{{ dimension.weight }}%）
                    </template>
                  </p>
                  <p class="text-slate-600 mt-1">
                    {{ dimension.description || '待补充评分要点' }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </article>

        <article class="p-4 border border-slate-200 rounded-lg bg-white">
          <h3 class="text-sm text-slate-900 font-semibold">
            评委补充细则
          </h3>
          <div v-if="getCategoryResources('judge_guidelines').length === 0" class="text-sm text-slate-500 mt-2">
            暂无补充细则条目。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="item in getCategoryResources('judge_guidelines')"
              :key="item.id"
              class="p-3 border border-slate-200 rounded"
            >
              <p class="text-xs text-slate-900 font-semibold">
                {{ item.title }}
              </p>
              <p class="text-xs text-slate-700 mt-1 whitespace-pre-wrap">
                {{ item.content || item.summary || '暂无内容。' }}
              </p>
            </article>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'timeline'" class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-sm text-slate-900 font-semibold">
          时间轴
        </h3>
        <div v-if="sortedTimelines.length === 0" class="text-sm text-slate-500 mt-2">
          暂无时间节点，待补充。
        </div>
        <div v-else class="mt-3 space-y-2">
          <div
            v-for="item in sortedTimelines"
            :key="item.id"
            class="text-sm p-3 border border-slate-200 rounded"
          >
            <div class="text-slate-800 flex flex-wrap gap-2 items-center">
              <span class="text-xs px-2 py-0.5 rounded bg-slate-100">{{ item.year }}</span>
              <span class="font-medium">{{ timelineNodeLabels[item.nodeType] }}</span>
            </div>
            <p class="text-xs text-slate-600 mt-1">
              开始：{{ formatDateTime(item.startAt) }}；结束：{{ formatDateTime(item.endAt) }}
            </p>
            <p class="text-xs text-slate-600 mt-1">
              备注：{{ item.note || '待补充' }}
            </p>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'faq'" class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-sm text-slate-900 font-semibold">
          FAQ
        </h3>
        <div v-if="faqItems.length > 0" class="mt-2 space-y-2">
          <details
            v-for="(item, index) in faqItems"
            :key="`faq-item-${index}`"
            class="p-2 border border-slate-200 rounded"
          >
            <summary class="text-sm text-slate-800 font-medium cursor-pointer">
              {{ item.question || `问题 ${index + 1}` }}
            </summary>
            <p class="text-sm text-slate-700 mt-2">
              {{ item.answer || '待补充' }}
            </p>
          </details>
        </div>
        <p v-else class="text-sm text-slate-700 mt-2">
          {{ contest.faq || '暂无 FAQ，待补充。' }}
        </p>
      </section>

      <section v-else-if="activeTab === 'resources'" class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-sm text-slate-900 font-semibold">
          资料库
        </h3>
        <div class="mt-3 gap-3 grid md:grid-cols-2">
          <article
            v-for="category in ['basic_info', 'tracks', 'scoring', 'past_questions', 'awarded_works', 'templates', 'submission_examples']"
            :key="category"
            class="p-3 border border-slate-200 rounded"
          >
            <p class="text-xs text-slate-900 font-semibold">
              {{ categoryLabels[category as ResourceCategory] }}
            </p>
            <div v-if="getCategoryResources(category as ResourceCategory).length === 0" class="text-xs text-slate-500 mt-2">
              暂无条目
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources(category as ResourceCategory).slice(0, 3)"
                :key="item.id"
                class="p-2 border border-slate-200 rounded bg-slate-50"
              >
                <p class="text-xs text-slate-900 font-medium">
                  {{ item.title }}
                </p>
                <p class="text-xs text-slate-600 mt-1 line-clamp-2">
                  {{ item.content || item.summary || '暂无摘要' }}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-sm text-slate-900 font-semibold">
          政策与合规
        </h3>
        <div class="mt-3 space-y-3">
          <article class="p-3 border border-slate-200 rounded">
            <p class="text-xs text-slate-900 font-semibold">
              政策通知
            </p>
            <div v-if="getCategoryResources('policy_notice').length === 0" class="text-xs text-slate-500 mt-2">
              暂无政策通知
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources('policy_notice')"
                :key="item.id"
                class="p-2 border border-slate-200 rounded bg-slate-50"
              >
                <p class="text-xs text-slate-900 font-medium">
                  {{ item.title }}
                </p>
                <p class="text-xs text-slate-700 mt-1 whitespace-pre-wrap">
                  {{ item.content || item.summary || '暂无内容。' }}
                </p>
              </div>
            </div>
          </article>

          <article class="p-3 border border-slate-200 rounded">
            <p class="text-xs text-slate-900 font-semibold">
              合规与版权
            </p>
            <div v-if="getCategoryResources('compliance').length === 0" class="text-xs text-slate-500 mt-2">
              暂无合规条目
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources('compliance')"
                :key="item.id"
                class="p-2 border border-slate-200 rounded bg-slate-50"
              >
                <p class="text-xs text-slate-900 font-medium">
                  {{ item.title }}
                </p>
                <p class="text-xs text-slate-700 mt-1 whitespace-pre-wrap">
                  {{ item.content || item.summary || '暂无内容。' }}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
