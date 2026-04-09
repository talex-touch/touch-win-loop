<script setup lang="ts">
import type {
  ApiResponse,
  ContestDetailPayload,
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
const route = useRoute()

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const sessionId = useResourceKnowledgeSessionId()

const loading = ref(false)
const loadingDetail = ref(false)
const errorText = ref('')
const contestName = ref('')
const resourceStats = ref<Array<{ category: ResourceCategory, count: number }>>([])
const resources = ref<Resource[]>([])

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

const tagOptions = computed(() => collectResourceTags(resources.value))

async function loadDetail() {
  if (!contestId.value)
    return
  loadingDetail.value = true
  try {
    const response = await $fetch<ApiResponse<ContestDetailPayload>>(endpoint(`/contests/${contestId.value}`))
    contestName.value = response.data.contest.name
    resourceStats.value = response.data.resourceStats
  }
  finally {
    loadingDetail.value = false
  }
}

async function loadResources() {
  if (!contestId.value)
    return
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Resource[]>>(endpoint(`/contests/${contestId.value}/resources`), {
      query: {
        category: category.value,
        year: year.value,
        availability: availability.value,
        q: queryText.value,
        tags: selectedTag.value,
        sort: sort.value,
        minQuality: minQuality.value,
      },
      headers: sessionId.value ? {
        'x-resource-session-id': sessionId.value,
      } : undefined,
    })
    resources.value = response.data
  }
  catch (error: any) {
    resources.value = []
    errorText.value = String(error?.data?.message || '资源加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

async function openResource(item: Resource) {
  const popup = process.client ? window.open('about:blank', '_blank', 'noopener') : null
  try {
    const response = await $fetch<ApiResponse<{ resourceId: string, targetUrl: string }>>(endpoint(`/contests/${contestId.value}/resources/${item.id}/click`), {
      method: 'POST',
      body: {
        query: queryText.value,
        filters: {
          category: category.value,
          year: year.value,
          availability: availability.value,
          tag: selectedTag.value,
          sort: sort.value,
          minQuality: minQuality.value,
        },
        resultCount: resources.value.length,
      },
      headers: sessionId.value ? {
        'x-resource-session-id': sessionId.value,
      } : undefined,
    })
    const targetUrl = resolveApiUrl(response.data.targetUrl)
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

async function selectCategory(target: ResourceCategory) {
  category.value = category.value === target ? '' : target
  await loadResources()
}

useHead(() => {
  return {
    title: contestName.value ? `${contestName.value} - 资料中心` : '竞赛资料中心 - WinLoop',
  }
})

onMounted(async () => {
  await loadDetail()
  await loadResources()
})
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white flex flex-wrap gap-2 items-center justify-between">
      <div>
        <h1 class="text-lg text-slate-900 font-semibold">
          资料中心
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          {{ contestName || '当前竞赛' }} 的知识库资料已接入 AI 标签、质量评分、价值热度与相关推荐。
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <NuxtLink class="dense-btn" :to="`/contests/${contestId}`">
          返回详情
        </NuxtLink>
        <NuxtLink class="dense-btn" to="/resources">
          查看全站资料
        </NuxtLink>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="loadingDetail" class="gap-2 grid md:grid-cols-4">
        <div
          v-for="index in 8"
          :key="`resource-category-skeleton-${index}`"
          class="border border-slate-200 rounded bg-slate-100 h-14 animate-pulse"
        />
      </div>
      <div v-else class="gap-2 grid md:grid-cols-4">
        <button
          v-for="item in resourceCategoryOptions.filter(option => option.value)"
          :key="item.value"
          class="text-sm px-3 py-2 text-left border rounded transition"
          :class="category === item.value ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-400'"
          @click="selectCategory(item.value as ResourceCategory)"
        >
          <div class="font-medium">
            {{ item.label }}
          </div>
          <div class="text-xs opacity-80">
            {{ resourceStats.find(stat => stat.category === item.value)?.count || 0 }} 条
          </div>
        </button>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="gap-2 grid md:grid-cols-6">
        <input v-model="queryText" class="dense-input md:col-span-2" placeholder="搜索资料标题、摘要、AI 标签">
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
        <input v-model="minQuality" class="dense-input" type="number" min="0" max="100" placeholder="最低质量分">
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
        <div class="md:col-span-2 flex gap-2">
          <button class="dense-btn" @click="loadResources">
            应用筛选
          </button>
          <button
            class="dense-btn"
            @click="
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
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="loading" class="space-y-3">
        <article
          v-for="index in 5"
          :key="`contest-resource-skeleton-${index}`"
          class="p-3 border border-slate-200 rounded animate-pulse"
        >
          <div class="flex gap-2 items-start justify-between">
            <div class="max-w-lg w-full space-y-2">
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
                {{ item.year }} ｜ {{ resourceAvailabilityLabelMap[item.availability] || item.availability }} ｜ 质量 {{ item.aiProfile?.qualityScore || 0 }} ｜ 价值 {{ item.aiProfile?.valueScore || 0 }} ｜ 热度 {{ item.aiProfile?.hotScore || 0 }}
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
