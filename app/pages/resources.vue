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
const openingResourceId = ref('')
const selectedResource = ref<Resource | null>(null)

const resourceModalTitleId = 'resource-library-modal-title'

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

const activeFilterCount = computed(() => {
  return [
    contestId.value,
    category.value,
    year.value,
    availability.value,
    queryText.value,
    selectedTag.value,
    sort.value !== 'relevance' ? sort.value : '',
    minQuality.value,
  ].filter(Boolean).length
})

function resolveCategoryLabel(value: ResourceCategory | undefined): string {
  return resourceCategoryOptions.find(item => item.value === value)?.label || value || '未分类'
}

function resolveContestName(item: Resource): string {
  return contestNameMap.value.get(item.contestId) || item.contestId || '未关联赛事'
}

function resolveAvailabilityLabel(item: Resource): string {
  return resourceAvailabilityLabelMap[item.availability] || item.availability
}

function resolveResourceSummary(item: Resource): string {
  return item.content || item.summary || '暂无摘要。'
}

function resolveResourceTags(item: Resource): string[] {
  return item.aiProfile?.aiTags?.slice(0, 6) || []
}

function resolveRelatedResources(item: Resource) {
  return item.aiProfile?.relatedResources?.slice(0, 3) || []
}

function resolveResourceTargetUrl(item: Resource): string {
  const rawUrl = item.sourceLink || item.sourceDownloadUrl || item.previewUrl || ''
  return rawUrl ? resolveApiUrl(rawUrl) : ''
}

function openExternalUrl(targetUrl: string) {
  const anchor = document.createElement('a')
  anchor.href = targetUrl
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
}

function resetFilters() {
  contestId.value = ''
  category.value = ''
  year.value = ''
  availability.value = ''
  queryText.value = ''
  selectedTag.value = ''
  sort.value = 'relevance'
  minQuality.value = ''
  void loadResources()
}
const contestFilterOptions = computed(() => [
  { label: '全部竞赛', value: '' },
  ...contests.value.map(contest => ({ label: contest.name, value: contest.id })),
])
const tagFilterOptions = computed(() => [
  { label: '全部标签', value: '' },
  ...tagOptions.value.map(tag => ({ label: tag, value: tag })),
])
const yearFilterOptions = computed(() => [
  { label: '全部年份', value: '' },
  ...years.value.map(value => ({ label: String(value), value: String(value) })),
])

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

async function recordResourceOpen(item: Resource) {
  try {
    await requestApi<{ resourceId: string, targetUrl: string }>(
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
  }
  catch {
    return undefined
  }
}

function openResource(item: Resource) {
  const targetUrl = resolveResourceTargetUrl(item)
  if (!targetUrl) {
    errorText.value = '当前资料缺少可打开的来源链接。'
    return
  }

  errorText.value = ''
  openingResourceId.value = item.id
  openExternalUrl(targetUrl)
  void recordResourceOpen(item).finally(() => {
    if (openingResourceId.value === item.id)
      openingResourceId.value = ''
  })
}

onMounted(async () => {
  await Promise.all([loadContests(), loadResources()])
})
</script>

<template>
  <main class="resource-library-page">
    <div class="resource-library-shell">
      <section class="resource-library-hero">
        <div class="resource-library-heading">
          <div class="resource-library-title-row">
            <h1>平台资料中心</h1>
            <span>knowledge</span>
          </div>
          <p>跨竞赛资料检索、AI 标签筛选、质量价值排序与相关推荐。</p>
        </div>

        <div class="resource-library-art" aria-hidden="true">
          <img src="/assets/contests/library-hero-background.png" alt="">
        </div>
      </section>

      <section class="resource-filter-panel" aria-label="资料筛选">
        <div class="resource-filter-grid">
          <label class="resource-field resource-field--search">
            <span class="sr-only">搜索资料</span>
            <span class="resource-field__icon i-heroicons-outline-magnifying-glass" />
            <input
              v-model="queryText"
              class="resource-control resource-control--with-icon"
              placeholder="搜索资料标题、摘要、AI 标签"
              @keydown.enter="loadResources"
            >
          </label>

          <UiSelect v-model="contestId" :options="contestFilterOptions" placeholder="全部竞赛" aria-label="竞赛" />
          <UiSelect v-model="category" :options="resourceCategoryOptions" placeholder="全部分类" aria-label="资料分类" />
          <UiSelect v-model="selectedTag" :options="tagFilterOptions" placeholder="全部标签" aria-label="标签" />
          <UiSelect v-model="sort" :options="resourceSortOptions" placeholder="综合相关" aria-label="排序" />
          <UiSelect v-model="year" :options="yearFilterOptions" placeholder="全部年份" aria-label="年份" />
          <UiSelect v-model="availability" :options="resourceAvailabilityOptions" placeholder="全部可访问性" aria-label="可访问性" />

          <label class="resource-field">
            <span class="sr-only">最低质量分</span>
            <input
              v-model="minQuality"
              class="resource-control"
              type="number"
              min="0"
              max="100"
              placeholder="最低质量分"
              @keydown.enter="loadResources"
            >
          </label>

          <button class="resource-filter-button" type="button" :disabled="loading" @click="loadResources">
            {{ loading ? '筛选中' : '应用筛选' }}
          </button>
          <button class="resource-filter-button resource-filter-button--ghost" type="button" @click="resetFilters">
            重置
          </button>
        </div>
        <p v-if="loadingContests" class="resource-filter-hint">
          正在同步赛事选项
        </p>
      </section>

      <section v-if="errorText" class="resource-error">
        {{ errorText }}
      </section>

      <section class="resource-result-toolbar" aria-label="资料结果">
        <p>
          共 <strong>{{ resources.length }}</strong> 份资料
          <span v-if="activeFilterCount > 0">，已启用 {{ activeFilterCount }} 个筛选条件</span>
        </p>
        <div class="resource-result-legend" aria-hidden="true">
          <span>质量</span>
          <span>价值</span>
          <span>热度</span>
        </div>
      </section>

      <section
        v-if="loading"
        class="resource-grid resource-grid--cards"
        aria-label="资料加载中"
      >
        <article
          v-for="index in 6"
          :key="`resource-skeleton-${index}`"
          class="resource-card resource-card--skeleton"
        >
          <div class="resource-card__head">
            <span class="resource-skeleton-icon" />
            <div class="resource-card__copy">
              <span class="resource-skeleton-line resource-skeleton-line--title" />
              <span class="resource-skeleton-line" />
              <span class="resource-skeleton-line resource-skeleton-line--short" />
            </div>
          </div>
          <div class="resource-card__scores">
            <span class="resource-skeleton-line resource-skeleton-line--score" />
            <span class="resource-skeleton-line resource-skeleton-line--score" />
            <span class="resource-skeleton-line resource-skeleton-line--score" />
          </div>
        </article>
      </section>

      <section v-else-if="resources.length === 0" class="resource-empty-state">
        <span class="i-heroicons-outline-inbox" />
        <p>当前筛选条件下暂无资料</p>
      </section>

      <section v-else class="resource-grid resource-grid--cards" aria-label="资料卡片">
        <article
          v-for="item in resources"
          :key="item.id"
          class="resource-card"
          role="button"
          tabindex="0"
          @click="selectedResource = item"
          @keydown.enter.prevent="selectedResource = item"
          @keydown.space.prevent="selectedResource = item"
        >
          <div class="resource-card__head">
            <span class="resource-card__icon">
              <span class="i-heroicons-solid-document-text" />
            </span>

            <div class="resource-card__copy">
              <div class="resource-card__badges">
                <span>{{ resolveCategoryLabel(item.category) }}</span>
                <span>{{ resolveAvailabilityLabel(item) }}</span>
              </div>
              <h2>{{ item.title }}</h2>
              <p class="resource-card__contest">
                {{ resolveContestName(item) }} · {{ item.year }}
              </p>
              <p class="resource-card__summary">
                {{ resolveResourceSummary(item) }}
              </p>
            </div>
          </div>

          <div v-if="resolveResourceTags(item).length > 0" class="resource-card__tags" aria-label="AI 标签">
            <span
              v-for="tag in resolveResourceTags(item)"
              :key="`${item.id}-${tag}`"
            >
              {{ tag }}
            </span>
          </div>

          <div class="resource-card__scores">
            <span>质量 <strong>{{ item.aiProfile?.qualityScore || 0 }}</strong></span>
            <span>价值 <strong>{{ item.aiProfile?.valueScore || 0 }}</strong></span>
            <span>热度 <strong>{{ item.aiProfile?.hotScore || 0 }}</strong></span>
          </div>

          <div class="resource-card__footer">
            <span>
              推荐 {{ item.aiProfile?.relatedResources?.length || 0 }}
            </span>
            <div class="resource-card__actions">
              <button type="button" @click.stop="selectedResource = item">
                详情
              </button>
              <button type="button" class="resource-card__primary" @click.stop="openResource(item)">
                {{ openingResourceId === item.id ? '已打开' : '打开资料' }}
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>

    <Teleport to="body">
      <Transition name="resource-modal">
        <div
          v-if="selectedResource"
          class="resource-detail-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="resourceModalTitleId"
          @click.self="selectedResource = null"
        >
          <section class="resource-detail-modal__panel">
            <header class="resource-detail-modal__header">
              <div class="resource-detail-modal__icon">
                <span class="i-heroicons-solid-document-text" />
              </div>

              <div class="resource-detail-modal__title">
                <div class="resource-detail-modal__meta">
                  <span>{{ resolveContestName(selectedResource) }}</span>
                  <span>{{ resolveCategoryLabel(selectedResource.category) }}</span>
                  <span>{{ resolveAvailabilityLabel(selectedResource) }}</span>
                </div>
                <h2 :id="resourceModalTitleId">
                  {{ selectedResource.title }}
                </h2>
                <p>{{ resolveResourceSummary(selectedResource) }}</p>
              </div>

              <button class="resource-detail-modal__close" type="button" aria-label="关闭资料详情" @click="selectedResource = null">
                <span class="i-heroicons-solid-x-mark" />
              </button>
            </header>

            <div class="resource-detail-modal__body">
              <section class="resource-detail-modal__section resource-detail-modal__section--main">
                <h3>资料指标</h3>
                <div class="resource-detail-modal__metrics">
                  <div>
                    <span>年份</span>
                    <strong>{{ selectedResource.year }}</strong>
                  </div>
                  <div>
                    <span>质量</span>
                    <strong>{{ selectedResource.aiProfile?.qualityScore || 0 }}</strong>
                  </div>
                  <div>
                    <span>价值</span>
                    <strong>{{ selectedResource.aiProfile?.valueScore || 0 }}</strong>
                  </div>
                  <div>
                    <span>热度</span>
                    <strong>{{ selectedResource.aiProfile?.hotScore || 0 }}</strong>
                  </div>
                </div>
              </section>

              <section class="resource-detail-modal__section">
                <h3>AI 标签</h3>
                <div v-if="resolveResourceTags(selectedResource).length > 0" class="resource-detail-modal__tags">
                  <span
                    v-for="tag in resolveResourceTags(selectedResource)"
                    :key="`${selectedResource.id}-modal-${tag}`"
                  >
                    {{ tag }}
                  </span>
                </div>
                <p v-else class="resource-detail-modal__empty">
                  暂无标签。
                </p>
              </section>

              <section class="resource-detail-modal__section">
                <div class="resource-detail-modal__section-head">
                  <h3>相关推荐</h3>
                  <span>{{ selectedResource.aiProfile?.relatedResources?.length || 0 }} 条</span>
                </div>
                <div v-if="resolveRelatedResources(selectedResource).length > 0" class="resource-detail-modal__relations">
                  <article
                    v-for="relation in resolveRelatedResources(selectedResource)"
                    :key="relation.id"
                  >
                    <h4>{{ relation.targetTitle }}</h4>
                    <p>{{ relation.relationType }}</p>
                  </article>
                </div>
                <p v-else class="resource-detail-modal__empty">
                  暂无相关推荐。
                </p>
              </section>
            </div>

            <footer class="resource-detail-modal__footer">
              <button class="resource-detail-modal__ghost" type="button" @click="selectedResource = null">
                关闭
              </button>
              <button class="resource-detail-modal__link" type="button" @click="openResource(selectedResource)">
                <span class="i-heroicons-solid-arrow-top-right-on-square" />
                {{ openingResourceId === selectedResource.id ? '已打开' : '打开资料' }}
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.resource-library-page {
  min-height: calc(100vh - 64px);
  padding: 30px 32px 40px;
  color: #172033;
  font-family:
    Inter,
    'PingFang SC',
    'Microsoft YaHei',
    'Noto Sans CJK SC',
    'Source Han Sans SC',
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background:
    radial-gradient(circle at 78% 4%, rgba(79, 125, 245, 0.14), transparent 28%),
    linear-gradient(180deg, #f8fbff 0%, #f6f8fc 42%, #f5f7fb 100%);
}

.resource-library-shell {
  width: min(100%, 1680px);
  margin: 0 auto;
}

.resource-library-hero {
  position: relative;
  min-height: 116px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  overflow: hidden;
  padding: 8px 2px 26px;
}

.resource-library-hero::after {
  content: '';
  position: absolute;
  inset: -8px -24px -20px auto;
  width: min(62vw, 980px);
  background:
    linear-gradient(
      90deg,
      #f8fbff 0%,
      rgba(248, 251, 255, 0.88) 14%,
      rgba(248, 251, 255, 0.22) 34%,
      rgba(248, 251, 255, 0) 48%
    ),
    linear-gradient(180deg, rgba(245, 248, 252, 0) 0%, rgba(245, 248, 252, 0.5) 74%, #f6f8fc 100%);
  pointer-events: none;
  z-index: 1;
}

.resource-library-heading {
  position: relative;
  z-index: 2;
}

.resource-library-title-row {
  display: flex;
  gap: 14px;
  align-items: center;
}

.resource-library-title-row h1 {
  margin: 0;
  color: #101a33;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.16;
}

.resource-library-title-row span {
  display: inline-flex;
  height: 28px;
  align-items: center;
  border-radius: 8px;
  padding: 0 12px;
  color: #3b6de9;
  background: #eef4ff;
  font-size: 14px;
  font-weight: 700;
}

.resource-library-heading p {
  margin: 14px 0 0;
  color: #8b99b2;
  font-size: 14px;
  font-weight: 600;
}

.resource-library-art {
  position: absolute;
  top: 0;
  right: -12px;
  width: min(58vw, 930px);
  height: 128px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.resource-library-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
  opacity: 0.72;
  filter: saturate(0.88) brightness(1.02);
  -webkit-mask-image:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 0, 0, 0.74) 18%,
      rgba(0, 0, 0, 0.98) 42%,
      rgba(0, 0, 0, 0.98) 82%,
      transparent 100%
    ),
    linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.96) 18%, rgba(0, 0, 0, 0.96) 84%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 0, 0, 0.74) 18%,
      rgba(0, 0, 0, 0.98) 42%,
      rgba(0, 0, 0, 0.98) 82%,
      transparent 100%
    ),
    linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.96) 18%, rgba(0, 0, 0, 0.96) 84%, transparent 100%);
  mask-composite: intersect;
}

.resource-filter-panel {
  border: 1px solid #e7edf8;
  border-radius: 16px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 36px rgba(42, 75, 138, 0.05);
}

.resource-filter-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.5fr) repeat(7, minmax(132px, 0.92fr)) minmax(120px, 0.7fr) minmax(92px, 0.55fr);
  gap: 12px 14px;
}

.resource-field {
  position: relative;
  display: block;
  min-width: 0;
}

.resource-field--search {
  min-width: 0;
}

.resource-control {
  width: 100%;
  height: 40px;
  border: 2px solid #edf1f8;
  border-radius: 9px;
  padding: 0 16px;
  color: #263653;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.resource-control::placeholder {
  color: #a7b2c5;
}

.resource-control:focus {
  border-color: #9cb8fb;
  box-shadow: 0 0 0 4px rgba(74, 119, 232, 0.1);
}

.resource-control--with-icon {
  padding-left: 42px;
}

.resource-field__icon {
  position: absolute;
  top: 50%;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #a7b2c5;
  pointer-events: none;
  transform: translateY(-50%);
}

.resource-filter-button {
  width: 100%;
  height: 40px;
  border: 0;
  border-radius: 9px;
  color: #fff;
  background: linear-gradient(90deg, #87a6f4 0%, #3d78e8 100%);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(61, 120, 232, 0.2);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.resource-filter-button--ghost {
  border: 1px solid #dbe5f5;
  color: #53647f;
  background: #fff;
  box-shadow: none;
}

.resource-filter-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.resource-filter-button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(61, 120, 232, 0.26);
}

.resource-filter-button--ghost:not(:disabled):hover {
  box-shadow: 0 8px 18px rgba(61, 120, 232, 0.12);
}

.resource-filter-hint {
  margin: 12px 0 0;
  color: #8a98ad;
  font-size: 12px;
  font-weight: 700;
}

.resource-error {
  margin-top: 16px;
  border: 1px solid #fecdd3;
  border-radius: 12px;
  padding: 12px 14px;
  color: #be123c;
  background: #fff1f2;
  font-size: 13px;
  font-weight: 700;
}

.resource-result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 8px 14px;
}

.resource-result-toolbar p {
  margin: 0;
  color: #91a0b6;
  font-size: 14px;
  font-weight: 700;
}

.resource-result-toolbar strong {
  color: #7d8fa8;
}

.resource-result-legend {
  display: inline-flex;
  gap: 8px;
}

.resource-result-legend span {
  border: 1px solid #dbe6f6;
  border-radius: 999px;
  padding: 5px 10px;
  color: #657792;
  background: #fff;
  font-size: 12px;
  font-weight: 800;
}

.resource-grid {
  display: grid;
  gap: 20px;
}

.resource-grid--cards {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.resource-card {
  position: relative;
  display: flex;
  min-height: 250px;
  width: 100%;
  flex-direction: column;
  justify-content: space-between;
  overflow: visible;
  border: 1px solid #e8edf7;
  border-radius: 16px;
  padding: 22px 22px 16px;
  text-align: left;
  color: inherit;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 12px 28px rgba(36, 65, 118, 0.05);
  cursor: pointer;
  font: inherit;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.resource-card:hover {
  z-index: 4;
  border-color: rgba(74, 119, 232, 0.34);
  box-shadow: 0 18px 32px rgba(49, 84, 147, 0.09);
  transform: translateY(-1px);
}

.resource-card:focus-visible {
  z-index: 4;
  border-color: rgba(61, 120, 232, 0.72);
  box-shadow:
    0 18px 32px rgba(49, 84, 147, 0.09),
    0 0 0 4px rgba(61, 120, 232, 0.12);
  outline: none;
}

.resource-card__head {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.resource-card__copy {
  min-width: 0;
  flex: 1;
}

.resource-card__icon {
  display: inline-grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  color: #3477ed;
  background: #e8f0ff;
  box-shadow: inset 0 0 0 2px #c7d9ff;
}

.resource-card:nth-child(4n + 2) .resource-card__icon {
  color: #7c54e9;
  background: #f0ebff;
  box-shadow: none;
}

.resource-card:nth-child(4n + 3) .resource-card__icon {
  color: #1bbf7a;
  background: #e8fbf1;
  box-shadow: none;
}

.resource-card:nth-child(4n + 4) .resource-card__icon {
  color: #4c78f4;
  background: #e9efff;
  box-shadow: none;
}

.resource-card__icon span {
  width: 20px;
  height: 20px;
}

.resource-card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.resource-card__badges span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border-radius: 999px;
  padding: 0 9px;
  color: #52647f;
  background: #f0f5fd;
  font-size: 11px;
  font-weight: 800;
}

.resource-card h2 {
  display: -webkit-box;
  overflow: hidden;
  margin: 1px 0 8px;
  color: #172033;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.resource-card__contest {
  display: -webkit-box;
  overflow: hidden;
  margin: 0 0 10px;
  color: #66758d;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.resource-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #51627d;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.resource-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 16px;
}

.resource-card__tags span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border-radius: 7px;
  padding: 0 8px;
  color: #2f72ec;
  background: #edf4ff;
  font-size: 11px;
  font-weight: 800;
}

.resource-card__scores {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.resource-card__scores span {
  min-width: 0;
  border: 1px solid #edf1f7;
  border-radius: 10px;
  padding: 8px 9px;
  color: #8391a7;
  background: #fbfdff;
  font-size: 11px;
  font-weight: 800;
}

.resource-card__scores strong {
  display: block;
  margin-top: 2px;
  color: #1b2a44;
  font-size: 14px;
  font-weight: 900;
}

.resource-card__footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  border-top: 1px solid #edf1f7;
  padding-top: 15px;
  color: #8c9ab1;
  font-size: 13px;
  font-weight: 800;
}

.resource-card__actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.resource-card__actions button {
  min-height: 34px;
  border: 1px solid #dbe5f5;
  border-radius: 9px;
  padding: 0 11px;
  color: #53647f;
  background: #fff;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.resource-card__actions .resource-card__primary {
  color: #fff;
  border-color: #3d78e8;
  background: #3d78e8;
}

.resource-card--skeleton {
  pointer-events: none;
}

.resource-skeleton-icon,
.resource-skeleton-line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #edf2f9 0%, #f7f9fd 42%, #edf2f9 100%);
  background-size: 220% 100%;
  animation: resource-skeleton 1.3s ease-in-out infinite;
}

.resource-skeleton-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
}

.resource-skeleton-line {
  width: 80%;
  height: 12px;
  margin-top: 12px;
}

.resource-skeleton-line--title {
  width: 92%;
  height: 16px;
  margin-top: 0;
}

.resource-skeleton-line--short {
  width: 62%;
}

.resource-skeleton-line--score {
  width: 100%;
  height: 42px;
  margin-top: 0;
  border-radius: 10px;
}

.resource-empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  border: 1px dashed #cfd9ea;
  border-radius: 16px;
  color: #8998af;
  background: rgba(255, 255, 255, 0.72);
  font-size: 14px;
  font-weight: 700;
}

.resource-empty-state span {
  width: 38px;
  height: 38px;
  margin-bottom: 10px;
  color: #9fb0c8;
}

.resource-empty-state p {
  margin: 0;
}

.resource-detail-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: center;
  justify-items: center;
  padding: 42px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(12px);
}

.resource-detail-modal__panel {
  display: flex;
  width: min(980px, 100%);
  max-height: min(780px, calc(100vh - 72px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(218, 226, 240, 0.96);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(28, 50, 90, 0.24);
}

.resource-detail-modal__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px;
  align-items: flex-start;
  border-bottom: 1px solid #edf1f7;
  padding: 28px 30px 24px;
  background:
    linear-gradient(90deg, rgba(244, 248, 255, 0.96), rgba(255, 255, 255, 0.92)),
    radial-gradient(circle at 82% 0%, rgba(78, 123, 232, 0.14), transparent 34%);
}

.resource-detail-modal__icon {
  display: inline-grid;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 16px;
  color: #3477ed;
  background: #e8f0ff;
}

.resource-detail-modal__icon span {
  width: 25px;
  height: 25px;
}

.resource-detail-modal__title {
  min-width: 0;
}

.resource-detail-modal__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.resource-detail-modal__meta span {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  border: 1px solid #dbe6f6;
  border-radius: 999px;
  padding: 0 10px;
  color: #4e6280;
  background: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  font-weight: 800;
}

.resource-detail-modal__title h2 {
  margin: 0;
  color: #111a2e;
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.28;
}

.resource-detail-modal__title p {
  max-width: 760px;
  margin: 12px 0 0;
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.7;
}

.resource-detail-modal__close {
  display: inline-grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #dce5f3;
  border-radius: 10px;
  color: #71819a;
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
}

.resource-detail-modal__close:hover {
  color: #1d2a42;
  border-color: #cbd8ea;
}

.resource-detail-modal__close span {
  width: 20px;
  height: 20px;
}

.resource-detail-modal__body {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 18px;
  overflow-y: auto;
  padding: 22px 30px 26px;
}

.resource-detail-modal__section {
  min-width: 0;
  border: 1px solid #e8edf7;
  border-radius: 14px;
  padding: 18px;
  background: #fff;
}

.resource-detail-modal__section--main {
  grid-column: 1 / -1;
  padding: 18px 20px;
  background: #f8fbff;
}

.resource-detail-modal__section h3,
.resource-detail-modal__section-head h3 {
  margin: 0;
  color: #172033;
  font-size: 14px;
  font-weight: 900;
}

.resource-detail-modal__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.resource-detail-modal__metrics div {
  min-width: 0;
  border: 1px solid #e2eaf6;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
}

.resource-detail-modal__metrics span {
  display: block;
  color: #8391a7;
  font-size: 12px;
  font-weight: 800;
}

.resource-detail-modal__metrics strong {
  display: block;
  overflow-wrap: anywhere;
  margin-top: 6px;
  color: #1b2a44;
  font-size: 15px;
  font-weight: 900;
}

.resource-detail-modal__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.resource-detail-modal__tags span {
  border-radius: 999px;
  padding: 6px 10px;
  color: #2f72ec;
  background: #edf4ff;
  font-size: 12px;
  font-weight: 800;
}

.resource-detail-modal__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.resource-detail-modal__section-head span {
  color: #8795ad;
  font-size: 12px;
  font-weight: 800;
}

.resource-detail-modal__relations {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.resource-detail-modal__relations article {
  border: 1px solid #edf1f7;
  border-radius: 12px;
  padding: 14px;
  background: #fbfdff;
}

.resource-detail-modal__relations h4 {
  margin: 0;
  color: #172033;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
}

.resource-detail-modal__relations p {
  margin: 8px 0 0;
  color: #61718a;
  font-size: 12px;
  font-weight: 800;
}

.resource-detail-modal__empty {
  margin: 14px 0 0;
  color: #8a98ad;
  font-size: 13px;
  font-weight: 700;
}

.resource-detail-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #edf1f7;
  padding: 16px 30px;
  background: #fbfdff;
}

.resource-detail-modal__link,
.resource-detail-modal__ghost {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
}

.resource-detail-modal__link {
  gap: 7px;
  border: 0;
  color: #fff;
  background: #3d78e8;
  cursor: pointer;
}

.resource-detail-modal__link span {
  width: 17px;
  height: 17px;
}

.resource-detail-modal__ghost {
  border: 1px solid #dce5f3;
  color: #53647f;
  background: #fff;
  cursor: pointer;
}

.resource-modal-enter-active,
.resource-modal-leave-active {
  transition: opacity 0.18s ease;
}

.resource-modal-enter-active .resource-detail-modal__panel,
.resource-modal-leave-active .resource-detail-modal__panel {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.resource-modal-enter-from,
.resource-modal-leave-to {
  opacity: 0;
}

.resource-modal-enter-from .resource-detail-modal__panel,
.resource-modal-leave-to .resource-detail-modal__panel {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@keyframes resource-skeleton {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: -220% 50%;
  }
}

@media (max-width: 1480px) {
  .resource-grid--cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1440px) {
  .resource-filter-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .resource-field--search {
    grid-column: span 2;
  }

  .resource-filter-button {
    grid-column: span 2;
  }
}

@media (max-width: 1180px) {
  .resource-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-grid--cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resource-detail-modal__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-detail-modal__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .resource-library-page {
    padding: 22px 16px 28px;
  }

  .resource-library-hero {
    min-height: 132px;
  }

  .resource-library-art {
    right: -440px;
    opacity: 0.4;
  }

  .resource-library-title-row h1 {
    font-size: 22px;
  }

  .resource-filter-grid,
  .resource-grid--cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-filter-button {
    grid-column: auto;
  }

  .resource-result-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .resource-card {
    min-height: 0;
    padding: 22px 18px 16px;
  }

  .resource-card__head {
    gap: 14px;
  }

  .resource-card__scores {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .resource-card__footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .resource-card__actions {
    width: 100%;
  }

  .resource-card__actions button {
    flex: 1;
  }

  .resource-detail-modal {
    align-items: stretch;
    padding: 16px;
  }

  .resource-detail-modal__panel {
    max-height: calc(100vh - 32px);
    border-radius: 16px;
  }

  .resource-detail-modal__header {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 22px 20px 20px;
  }

  .resource-detail-modal__icon {
    display: none;
  }

  .resource-detail-modal__body {
    padding: 18px 20px 22px;
  }

  .resource-detail-modal__metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-detail-modal__footer {
    padding: 14px 20px;
  }
}
</style>
