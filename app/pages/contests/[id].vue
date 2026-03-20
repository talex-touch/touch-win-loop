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
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

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

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
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
  const response = await $fetch<ApiResponse<ContestDetailPayload>>(endpoint(`/contests/${contestId.value}`))
  detail.value = response.data
}

async function loadResources() {
  if (!contestId.value)
    return
  const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/contests/${contestId.value}/resources`))
  resources.value = response.data
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
  <div class="mx-auto max-w-6xl space-y-4 p-4">
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <h1 class="text-lg font-semibold text-slate-900">
          竞赛详情
        </h1>
        <p class="text-xs text-slate-500">
          赛事知识中台：赛道、细则、FAQ、资料与政策统一入口。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink class="dense-btn" :to="`/contests/${contestId}/resources`">
          资料中心
        </NuxtLink>
        <button class="dense-btn" @click="navigateTo('/contests')">
          返回列表
        </button>
      </div>
    </div>

    <div v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </div>

    <div v-else-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </div>

    <div v-else-if="!contest" class="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
      未找到该竞赛。
    </div>

    <template v-else>
      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="space-y-1">
            <h2 class="text-xl font-semibold text-slate-900">
              {{ contest.name }}
            </h2>
            <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span class="rounded bg-slate-100 px-2 py-1">{{ contest.level }}</span>
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
        <p class="mt-3 text-sm text-slate-700">
          {{ contest.summary || '暂无简介，待补充。' }}
        </p>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-2">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in tabItems"
            :key="item.key"
            class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
            :class="activeTab === item.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
            @click="activeTab = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <section v-if="activeTab === 'overview'" class="grid gap-3 md:grid-cols-2">
        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            参赛信息
          </h3>
          <div class="mt-2 space-y-2 text-sm text-slate-700">
            <p><span class="font-medium">参赛对象：</span>{{ contest.participantRequirements || '待补充' }}</p>
            <p><span class="font-medium">组队规则：</span>{{ contest.teamRule || '待补充' }}</p>
            <p><span class="font-medium">适配人群：</span>{{ contest.recommendedFor?.join(' / ') || '待补充' }}</p>
            <p><span class="font-medium">学科门类：</span>{{ contest.disciplines?.join(' / ') || '待补充' }}</p>
          </div>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            知识库概览
          </h3>
          <div class="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div
              v-for="item in resourceStats"
              :key="item.category"
              class="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600"
            >
              <div class="font-medium text-slate-800">
                {{ categoryLabels[item.category] }}
              </div>
              <div>{{ item.count }} 条</div>
            </div>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'track'" class="space-y-3">
        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            赛道设置
          </h3>
          <div v-if="contest.tracks.length === 0" class="mt-2 text-sm text-slate-500">
            暂无赛道，待补充。
          </div>
          <div v-else class="mt-3 grid gap-2 md:grid-cols-2">
            <article
              v-for="track in contest.tracks"
              :key="track.id"
              class="rounded border border-slate-200 p-3"
            >
              <h4 class="text-sm font-medium text-slate-900">
                {{ track.name }}
              </h4>
              <p class="mt-1 text-xs text-slate-600">
                {{ track.summary || '暂无赛道说明。' }}
              </p>
              <p class="mt-2 text-xs text-slate-600">
                适配专业：{{ track.suitableMajors?.join(' / ') || '待补充' }}
              </p>
              <p class="mt-1 text-xs text-slate-600">
                交付物：{{ track.deliverableTypes?.join(' / ') || '待补充' }}
              </p>
            </article>
          </div>
        </article>

        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            赛道详解条目
          </h3>
          <div v-if="getCategoryResources('track_details').length === 0" class="mt-2 text-sm text-slate-500">
            暂无赛道详解资料。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="item in getCategoryResources('track_details')"
              :key="item.id"
              class="rounded border border-slate-200 p-3"
            >
              <p class="text-xs font-semibold text-slate-900">
                {{ item.title }}
              </p>
              <p class="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                {{ item.content || item.summary || '暂无内容。' }}
              </p>
            </article>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'judge'" class="space-y-3">
        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            Rubric 评分标准
          </h3>
          <div v-if="rubrics.length === 0" class="mt-2 text-sm text-slate-500">
            该赛事暂未配置评分规则。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="rubric in rubrics"
              :key="rubric.id"
              class="rounded border border-slate-200 p-3"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-medium text-slate-900">
                  {{ trackNameMap.get(rubric.trackId) || rubric.trackId }}
                </span>
                <span class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">v{{ rubric.version || 1 }}</span>
              </div>
              <div class="mt-2 grid gap-1 md:grid-cols-2">
                <div
                  v-for="dimension in rubric.dimensions"
                  :key="`${rubric.id}-${dimension.key}`"
                  class="rounded border border-slate-200 bg-slate-50 p-2 text-xs"
                >
                  <p class="font-medium text-slate-800">
                    {{ dimension.name }}
                    <template v-if="dimension.weight !== undefined">
                      （{{ dimension.weight }}%）
                    </template>
                  </p>
                  <p class="mt-1 text-slate-600">
                    {{ dimension.description || '待补充评分要点' }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </article>

        <article class="rounded-lg border border-slate-200 bg-white p-4">
          <h3 class="text-sm font-semibold text-slate-900">
            评委补充细则
          </h3>
          <div v-if="getCategoryResources('judge_guidelines').length === 0" class="mt-2 text-sm text-slate-500">
            暂无补充细则条目。
          </div>
          <div v-else class="mt-3 space-y-2">
            <article
              v-for="item in getCategoryResources('judge_guidelines')"
              :key="item.id"
              class="rounded border border-slate-200 p-3"
            >
              <p class="text-xs font-semibold text-slate-900">
                {{ item.title }}
              </p>
              <p class="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                {{ item.content || item.summary || '暂无内容。' }}
              </p>
            </article>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'timeline'" class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-900">
          时间轴
        </h3>
        <div v-if="sortedTimelines.length === 0" class="mt-2 text-sm text-slate-500">
          暂无时间节点，待补充。
        </div>
        <div v-else class="mt-3 space-y-2">
          <div
            v-for="item in sortedTimelines"
            :key="item.id"
            class="rounded border border-slate-200 p-3 text-sm"
          >
            <div class="flex flex-wrap items-center gap-2 text-slate-800">
              <span class="rounded bg-slate-100 px-2 py-0.5 text-xs">{{ item.year }}</span>
              <span class="font-medium">{{ timelineNodeLabels[item.nodeType] }}</span>
            </div>
            <p class="mt-1 text-xs text-slate-600">
              开始：{{ formatDateTime(item.startAt) }}；结束：{{ formatDateTime(item.endAt) }}
            </p>
            <p class="mt-1 text-xs text-slate-600">
              备注：{{ item.note || '待补充' }}
            </p>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'faq'" class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-900">
          FAQ
        </h3>
        <div v-if="faqItems.length > 0" class="mt-2 space-y-2">
          <details
            v-for="(item, index) in faqItems"
            :key="`faq-item-${index}`"
            class="rounded border border-slate-200 p-2"
          >
            <summary class="cursor-pointer text-sm font-medium text-slate-800">
              {{ item.question || `问题 ${index + 1}` }}
            </summary>
            <p class="mt-2 text-sm text-slate-700">
              {{ item.answer || '待补充' }}
            </p>
          </details>
        </div>
        <p v-else class="mt-2 text-sm text-slate-700">
          {{ contest.faq || '暂无 FAQ，待补充。' }}
        </p>
      </section>

      <section v-else-if="activeTab === 'resources'" class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-900">
          资料库
        </h3>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <article
            v-for="category in ['basic_info', 'tracks', 'scoring', 'past_questions', 'awarded_works', 'templates', 'submission_examples']"
            :key="category"
            class="rounded border border-slate-200 p-3"
          >
            <p class="text-xs font-semibold text-slate-900">
              {{ categoryLabels[category as ResourceCategory] }}
            </p>
            <div v-if="getCategoryResources(category as ResourceCategory).length === 0" class="mt-2 text-xs text-slate-500">
              暂无条目
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources(category as ResourceCategory).slice(0, 3)"
                :key="item.id"
                class="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <p class="text-xs font-medium text-slate-900">
                  {{ item.title }}
                </p>
                <p class="mt-1 text-xs text-slate-600 line-clamp-2">
                  {{ item.content || item.summary || '暂无摘要' }}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section v-else class="rounded-lg border border-slate-200 bg-white p-4">
        <h3 class="text-sm font-semibold text-slate-900">
          政策与合规
        </h3>
        <div class="mt-3 space-y-3">
          <article class="rounded border border-slate-200 p-3">
            <p class="text-xs font-semibold text-slate-900">
              政策通知
            </p>
            <div v-if="getCategoryResources('policy_notice').length === 0" class="mt-2 text-xs text-slate-500">
              暂无政策通知
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources('policy_notice')"
                :key="item.id"
                class="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <p class="text-xs font-medium text-slate-900">
                  {{ item.title }}
                </p>
                <p class="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
                  {{ item.content || item.summary || '暂无内容。' }}
                </p>
              </div>
            </div>
          </article>

          <article class="rounded border border-slate-200 p-3">
            <p class="text-xs font-semibold text-slate-900">
              合规与版权
            </p>
            <div v-if="getCategoryResources('compliance').length === 0" class="mt-2 text-xs text-slate-500">
              暂无合规条目
            </div>
            <div v-else class="mt-2 space-y-2">
              <div
                v-for="item in getCategoryResources('compliance')"
                :key="item.id"
                class="rounded border border-slate-200 bg-slate-50 p-2"
              >
                <p class="text-xs font-medium text-slate-900">
                  {{ item.title }}
                </p>
                <p class="mt-1 text-xs text-slate-700 whitespace-pre-wrap">
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
