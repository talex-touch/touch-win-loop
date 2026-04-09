<script setup lang="ts">
import type {
  ApiResponse,
  Contest,
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceSearchSort,
} from '~~/shared/types/domain'
import {
  collectResourceTags,
  resourceAvailabilityLabelMap,
  resourceAvailabilityOptions,
  resourceCategoryOptions,
  resourceSortOptions,
  useResourceKnowledgeSessionId,
} from '~~/app/composables/resource-knowledge'

definePageMeta({
  layout: 'dashboard',
})

const runtime = useRuntimeConfig()
const { endpoint, resolveApiUrl } = useApiEndpoint(runtime)
const sessionId = useResourceKnowledgeSessionId()

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
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    query?: Record<string, string | number | undefined>
    body?: unknown
    headers?: Record<string, string> | undefined
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const url = new URL(path, window.location.origin)
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === undefined || value === '')
      continue
    url.searchParams.set(key, String(value))
  }

  const headers = new Headers(options.headers)
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const loading = ref(false)
const loadingContests = ref(false)
const errorText = ref('')
const resources = ref<Resource[]>([])
const contests = ref<Contest[]>([])

const contestId = ref('')
const category = ref<ResourceCategory | ''>('')
const year = ref('')
const availability = ref<ResourceAvailability | ''>('')
const queryText = ref('')
const selectedTag = ref('')
const sort = ref<ResourceSearchSort>('relevance')
const minQuality = ref('')

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

const tagOptions = computed(() => collectResourceTags(resources.value))

async function loadContests() {
  loadingContests.value = true
  try {
    contests.value = await requestApi<Contest[]>(endpoint('/contests'), {
      query: {
        page: 1,
        pageSize: 100,
      },
    }, '竞赛列表加载失败。')
  }
  finally {
    loadingContests.value = false
  }
}

async function loadResources() {
  loading.value = true
  errorText.value = ''
  try {
    resources.value = await requestApi<Resource[]>(endpoint('/resources'), {
      query: {
        contestId: contestId.value,
        category: category.value,
        year: year.value,
        availability: availability.value,
        q: queryText.value,
        tags: selectedTag.value,
        sort: sort.value,
        minQuality: minQuality.value,
      },
      headers: sessionId.value
        ? {
            'x-resource-session-id': sessionId.value,
          }
        : undefined,
    }, '资料加载失败，请稍后重试。')
  }
  catch (error: any) {
    resources.value = []
    errorText.value = String(error?.data?.message || '资料加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

async function openResource(item: Resource) {
  const popup = import.meta.client
    ? window.open('about:blank', '_blank', 'noopener')
    : null
  try {
    const data = await requestApi<{ resourceId: string, targetUrl: string }>(
      endpoint(`/contests/${item.contestId}/resources/${item.id}/click`),
      {
        method: 'POST',
        body: {
          query: queryText.value,
          filters: {
            contestId: contestId.value,
            category: category.value,
            year: year.value,
            availability: availability.value,
            tag: selectedTag.value,
            sort: sort.value,
            minQuality: minQuality.value,
          },
          resultCount: resources.value.length,
        },
        headers: sessionId.value
          ? {
              'x-resource-session-id': sessionId.value,
            }
          : undefined,
      },
      '资料访问记录失败。',
    )
    const targetUrl = resolveApiUrl(data.targetUrl)
    if (popup)
      popup.location.href = targetUrl
    else
      window.open(targetUrl, '_blank', 'noopener')
  }
  catch {
    const fallbackUrl = resolveApiUrl(item.sourceLink)
    if (popup)
      popup.location.href = fallbackUrl
    else
      window.open(fallbackUrl, '_blank', 'noopener')
  }
}

onMounted(async () => {
  await Promise.all([loadContests(), loadResources()])
})
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <h1 class="text-lg text-slate-900 font-semibold">
        平台资料中心
      </h1>
      <p class="text-xs text-slate-500 mt-1">
        跨竞赛检索、AI 标签筛选、价值热度排序与相关推荐已统一接入知识治理能力。
      </p>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-6">
        <input v-model="queryText" class="dense-input md:col-span-2" placeholder="搜索资料标题、摘要、AI 标签">
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
            v-for="item in resourceCategoryOptions"
            :key="item.label"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>
        <select v-model="selectedTag" class="dense-input">
          <option value="">
            全部标签
          </option>
          <option v-for="tag in tagOptions" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
        <select v-model="sort" class="dense-input">
          <option v-for="item in resourceSortOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </div>
      <div class="gap-2 grid md:grid-cols-4 mt-2">
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
            v-for="item in resourceAvailabilityOptions"
            :key="item.label"
            :value="item.value"
          >
            {{ item.label }}
          </option>
        </select>

        <input v-model="minQuality" class="dense-input" type="number" min="0" max="100" placeholder="最低质量分">

        <div class="flex gap-2">
          <button class="dense-btn" @click="loadResources">
            应用筛选
          </button>
          <button
            class="dense-btn"
            @click="
              contestId = '';
              category = '';
              year = '';
              availability = '';
              queryText = '';
              selectedTag = '';
              sort = 'relevance';
              minQuality = '';
              loadResources();
            "
          >
            重置
          </button>
        </div>
      </div>
      <div v-if="loadingContests" class="mt-2 rounded bg-slate-200 h-3 w-40 animate-pulse" />
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

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
          class="p-4 border border-slate-200 rounded-lg"
        >
          <div class="flex flex-wrap gap-2 items-start justify-between">
            <div>
              <h2 class="text-sm text-slate-900 font-medium">
                {{ item.title }}
              </h2>
              <p class="text-xs text-slate-600 mt-1">
                {{ contestNameMap.get(item.contestId) || item.contestId }} ｜ {{ item.year }} ｜ {{ resourceAvailabilityLabelMap[item.availability] || item.availability }} ｜ 质量 {{ item.aiProfile?.qualityScore || 0 }} ｜ 热度 {{ item.aiProfile?.hotScore || 0 }}
              </p>
            </div>
            <button class="dense-btn" @click="openResource(item)">
              打开资料
            </button>
          </div>

          <p class="text-xs text-slate-700 mt-3">
            {{ item.content || item.summary || '暂无摘要。' }}
          </p>

          <div class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="tag in item.aiProfile?.aiTags || []"
              :key="`${item.id}-${tag}`"
              class="text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-700"
            >
              {{ tag }}
            </span>
          </div>

          <div v-if="item.aiProfile?.relatedResources?.length" class="mt-3 pt-3 border-t border-slate-100">
            <p class="text-[11px] text-slate-500">
              相关推荐
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span
                v-for="relation in item.aiProfile.relatedResources"
                :key="relation.id"
                class="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700"
              >
                {{ relation.targetTitle }} ｜ {{ relation.relationType }}
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
