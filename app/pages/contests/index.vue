<script setup lang="ts">
import type { ApiResponse, Contest, ContestLevel } from '~~/shared/types/domain'

definePageMeta({
  layout: 'dashboard',
})

type ContestListResponse = ApiResponse<Contest[]> & {
  pagination?: {
    total?: number
    page?: number
    pageSize?: number
  }
}

interface ContestVisual {
  icon: 'sparkles' | 'document' | 'beaker' | 'academic'
  tone: 'blue' | 'violet' | 'emerald' | 'indigo'
}

type ContestDetailTab = 'participation' | 'resources' | 'faq'
type ContestDetailNavItem
  = | { type: 'tab', id: ContestDetailTab, label: string, icon: string }
    | { type: 'track', id: string, label: string, icon: string }

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(false)
const contests = ref<Contest[]>([])
const totalContests = ref(0)
const search = ref('')
const discipline = ref('')
const level = ref<ContestLevel | ''>('')
const deliverableType = ref('')
const timelineStatus = ref('')
const sort = ref('composite')
const viewMode = ref<'grid' | 'list'>('grid')
const currentPage = ref(1)
const selectedContest = ref<Contest | null>(null)
const selectedContestDetailTab = ref<ContestDetailTab>('participation')
const selectedContestTrackId = ref('')
const contestPageSize = 12
const contestModalTitleId = 'contest-detail-modal-title'

const contestVisuals: ContestVisual[] = [
  { icon: 'sparkles', tone: 'blue' },
  { icon: 'document', tone: 'violet' },
  { icon: 'beaker', tone: 'emerald' },
  { icon: 'academic', tone: 'indigo' },
]

const contestLevelLabels: Record<ContestLevel, string> = {
  national: '国家级',
  provincial: '省级',
  school: '校级',
  industry: '行业级',
}

const contestLevelIcons: Record<ContestLevel, string> = {
  national: 'i-heroicons-solid-trophy',
  provincial: 'i-heroicons-solid-map',
  school: 'i-heroicons-solid-academic-cap',
  industry: 'i-heroicons-solid-building-office-2',
}

const contestDetailTabs: Array<{ id: ContestDetailTab, label: string, icon: string }> = [
  { id: 'participation', label: '参赛信息', icon: 'i-heroicons-outline-user-group' },
  { id: 'resources', label: '相关资料', icon: 'i-heroicons-outline-folder-open' },
  { id: 'faq', label: '常见疑问', icon: 'i-heroicons-outline-question-mark-circle' },
]

const disciplineOptions = [
  { label: '学科门类', value: '' },
  { label: '工学', value: '工学' },
  { label: '理学', value: '理学' },
  { label: '管理学', value: '管理学' },
  { label: '社会科学', value: '社会科学' },
  { label: '艺术学', value: '艺术学' },
]

const deliverableOptions = [
  { label: '交付物类型', value: '' },
  { label: '方案书', value: '方案书' },
  { label: '演示视频', value: '演示视频' },
  { label: '原型系统', value: '原型系统' },
  { label: '商业计划书', value: '商业计划书' },
  { label: '答辩 PPT', value: '答辩 PPT' },
  { label: '技术文档', value: '技术文档' },
  { label: '调研报告', value: '调研报告' },
]

const statusOptions = [
  { label: '全部时间状态', value: '' },
  { label: '报名中', value: 'registration_open' },
  { label: '即将截止', value: 'upcoming_deadline' },
  { label: '已结束', value: 'ended' },
]

const levelOptions: Array<{ label: string, value: ContestLevel | '' }> = [
  { label: '全部级别', value: '' },
  { label: '国家级', value: 'national' },
  { label: '省级', value: 'provincial' },
  { label: '校级', value: 'school' },
  { label: '行业级', value: 'industry' },
]

const displayedContestCount = computed(() => {
  return totalContests.value || contests.value.length
})

const totalContestPages = computed(() => {
  return Math.max(1, Math.ceil(displayedContestCount.value / contestPageSize))
})

const displayedRangeStart = computed(() => {
  if (contests.value.length === 0)
    return 0
  return (currentPage.value - 1) * contestPageSize + 1
})

const displayedRangeEnd = computed(() => {
  if (contests.value.length === 0)
    return 0
  return Math.min(displayedContestCount.value, displayedRangeStart.value + contests.value.length - 1)
})

const visibleContestPages = computed(() => {
  const total = totalContestPages.value
  const start = Math.max(1, Math.min(currentPage.value - 2, total - 4))
  const end = Math.min(total, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const selectedContestVisual = computed(() => {
  if (!selectedContest.value)
    return contestVisuals[0]!
  const index = contests.value.findIndex(contest => contest.id === selectedContest.value?.id)
  return resolveContestVisual(index >= 0 ? index : 0)
})

const selectedContestTrack = computed(() => {
  if (!selectedContest.value)
    return null
  return selectedContest.value.tracks.find(track => track.id === selectedContestTrackId.value)
    || selectedContest.value.tracks[0]
    || null
})

const contestDetailNavItems = computed<ContestDetailNavItem[]>(() => {
  const trackItems = (selectedContest.value?.tracks || []).map(track => ({
    type: 'track' as const,
    id: track.id,
    label: resolveText(track.name, '未命名赛道'),
    icon: 'i-heroicons-outline-rectangle-stack',
  }))
  return [
    ...contestDetailTabs.map(tab => ({ type: 'tab' as const, ...tab })),
    ...trackItems,
  ]
})

async function loadContests(page = currentPage.value) {
  const nextPage = Math.max(1, Number(page || 1))
  loading.value = true
  try {
    const response = await unsafeFetch(endpoint('/contests'), {
      query: {
        q: search.value,
        discipline: discipline.value,
        level: level.value,
        deliverableType: deliverableType.value,
        timelineStatus: timelineStatus.value,
        sort: sort.value,
        page: nextPage,
        pageSize: contestPageSize,
      },
    }) as ContestListResponse
    const nextTotal = Number(response.pagination?.total || 0)
    const responsePageSize = Number(response.pagination?.pageSize || contestPageSize)
    const maxPage = Math.max(1, Math.ceil(nextTotal / responsePageSize))
    if (nextTotal > 0 && nextPage > maxPage) {
      await loadContests(maxPage)
      return
    }
    contests.value = Array.isArray(response.data) ? response.data : []
    totalContests.value = Number(response.pagination?.total || contests.value.length)
    currentPage.value = Math.max(1, Number(response.pagination?.page || nextPage))
  }
  finally {
    loading.value = false
  }
}

function applyContestFilters() {
  closeContestModal()
  loadContests(1)
}

function goToContestPage(page: number) {
  if (loading.value)
    return
  const nextPage = Math.min(Math.max(1, page), totalContestPages.value)
  if (nextPage === currentPage.value)
    return
  closeContestModal()
  loadContests(nextPage)
}

function resolveContestVisual(index: number): ContestVisual {
  return contestVisuals[index % contestVisuals.length] || contestVisuals[0]!
}

function joinUniqueText(values: Array<string | undefined>, fallback = '待补充') {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result.length > 0 ? result.join(' / ') : fallback
}

function resolveContestSummary(contest: Contest) {
  return resolveText(contest.summary, '暂无比赛介绍')
}

function resolveLevelLabel(level: ContestLevel | undefined) {
  return level ? contestLevelLabels[level] || level : '待补充'
}

function resolveLevelIcon(level: ContestLevel | undefined) {
  return level ? contestLevelIcons[level] || 'i-heroicons-solid-trophy' : 'i-heroicons-solid-question-mark-circle'
}

function resolveText(value: string | undefined, fallback = '待补充') {
  return String(value || '').trim() || fallback
}

function resolveTextList(values: string[] | undefined, fallback = '待补充') {
  return joinUniqueText(values || [], fallback)
}

function resolveTextTags(values: string[] | undefined) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values || []) {
    const normalized = String(value || '').trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function formatDateToken(value: string | undefined) {
  const normalized = String(value || '').trim()
  const matched = normalized.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!matched)
    return normalized || '待补充'
  return `${matched[2]}.${matched[3]}`
}

function formatRegistrationWindow(value: string | undefined) {
  const normalized = String(value || '').trim()
  const dates = normalized.match(/\d{4}-\d{2}-\d{2}/g)
  if (!dates || dates.length < 2)
    return normalized || '待补充'
  return `${formatDateToken(dates[0])} - ${formatDateToken(dates[1])}`
}

function resolveRegistrationWindow(contest: Contest) {
  const direct = String(contest.registrationWindow || '').trim()
  if (direct)
    return direct

  const registrationNodes = (contest.timelines || [])
    .filter(item => item.nodeType === 'registration')
    .filter(item => item.startAt || item.endAt)

  if (registrationNodes.length === 0)
    return ''

  const starts = registrationNodes.map(item => item.startAt).filter(Boolean).sort() as string[]
  const ends = registrationNodes.map(item => item.endAt).filter(Boolean).sort() as string[]
  const start = starts[0] ? String(starts[0]).slice(0, 10) : ''
  const end = ends.length > 0 ? String(ends[ends.length - 1]).slice(0, 10) : ''
  if (start && end)
    return `${start} ~ ${end}`
  if (end)
    return `~ ${end}`
  return start ? `${start} ~` : ''
}

function formatContestRegistrationWindow(contest: Contest) {
  return formatRegistrationWindow(resolveRegistrationWindow(contest))
}

function resolveMissingFields(contest: Contest) {
  const fields: string[] = []
  if (!resolveRegistrationWindow(contest))
    fields.push('报名节点')
  if (!String(contest.submissionDeadline || '').trim())
    fields.push('提交截止')
  if (!String(contest.summary || '').trim())
    fields.push('比赛介绍')
  if (!String(contest.level || '').trim())
    fields.push('级别')
  if (!String(contest.officialUrl || '').trim())
    fields.push('官方链接')
  if (!contest.disciplines?.some(item => String(item || '').trim()))
    fields.push('学科门类')
  return fields
}

function resolveMissingFieldCount(contest: Contest) {
  return resolveMissingFields(contest).length
}

function resolveTrackPopoverItems(contest: Contest) {
  return contest.tracks.map(track => ({
    id: track.id,
    name: resolveText(track.name, '未命名赛道'),
    summary: resolveText(track.summary, '暂无赛道说明。'),
    deliverables: resolveTextList(track.deliverableTypes, '交付物待补充'),
    majors: resolveTextList(track.suitableMajors, '适配专业待补充'),
  }))
}

function openContestModal(contest: Contest) {
  selectedContestDetailTab.value = 'participation'
  selectedContestTrackId.value = contest.tracks[0]?.id || ''
  selectedContest.value = contest
}

function closeContestModal() {
  selectedContest.value = null
}

function selectContestDetailTab(tab: ContestDetailTab) {
  selectedContestDetailTab.value = tab
}

function selectContestTrack(trackId: string) {
  selectedContestTrackId.value = trackId
}

function isContestNavItemActive(item: ContestDetailNavItem) {
  return item.type === 'track'
    ? selectedContestTrackId.value === item.id
    : selectedContestDetailTab.value === item.id && !selectedContestTrackId.value
}

function selectContestNavItem(item: ContestDetailNavItem) {
  if (item.type === 'track') {
    selectContestTrack(item.id)
    return
  }
  selectedContestTrackId.value = ''
  selectContestDetailTab(item.id)
}

function handleContestModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedContest.value)
    closeContestModal()
}

watch(selectedContest, (contest) => {
  document.body.style.overflow = contest ? 'hidden' : ''
})

onMounted(() => {
  loadContests()
  window.addEventListener('keydown', handleContestModalKeydown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', handleContestModalKeydown)
})
</script>

<template>
  <main class="contest-library-page">
    <div class="contest-library-shell">
      <section class="contest-library-hero">
        <div class="contest-library-heading">
          <div class="contest-library-title-row">
            <h1>赛事总库</h1>
            <span>national</span>
          </div>
          <p>支持按学科、级别、交付物和时间状态快速筛选。</p>
        </div>

        <div class="contest-library-art" aria-hidden="true">
          <img src="/assets/contests/library-hero-background.png" alt="">
        </div>
      </section>

      <section class="contest-filter-panel" aria-label="赛事筛选">
        <div class="contest-filter-grid">
          <label class="contest-field contest-field--search">
            <span class="sr-only">搜索赛事</span>
            <span class="contest-field__icon i-heroicons-outline-magnifying-glass" />
            <input
              v-model="search"
              class="contest-control contest-control--with-icon"
              placeholder="搜索赛事名称/关键词/赛道"
              @keydown.enter="applyContestFilters"
            >
          </label>

          <label class="contest-field">
            <span class="sr-only">学科门类</span>
            <UiSelect v-model="discipline" :options="disciplineOptions" placeholder="学科门类" aria-label="学科门类" />
          </label>

          <label class="contest-field">
            <span class="sr-only">级别</span>
            <UiSelect v-model="level" :options="levelOptions" placeholder="全部级别" aria-label="级别" />
          </label>

          <label class="contest-field">
            <span class="sr-only">交付物类型</span>
            <UiSelect v-model="deliverableType" :options="deliverableOptions" placeholder="交付物类型" aria-label="交付物类型" />
          </label>

          <label class="contest-field">
            <span class="sr-only">时间状态</span>
            <UiSelect v-model="timelineStatus" :options="statusOptions" placeholder="全部时间状态" aria-label="时间状态" />
          </label>

          <label class="contest-field contest-field--sort">
            <span class="sr-only">排序方式</span>
            <UiSelect
              v-model="sort"
              :options="[
                { label: '综合排序', value: 'composite' },
                { label: '热度优先', value: 'hot' },
                { label: '时间临近', value: 'deadline' },
              ]"
              placeholder="综合排序"
              aria-label="排序方式"
            />
          </label>

          <button class="contest-filter-button" type="button" :disabled="loading" @click="applyContestFilters">
            {{ loading ? '筛选中' : '应用筛选' }}
          </button>
        </div>
      </section>

      <section class="contest-result-toolbar" aria-label="赛事结果">
        <p>
          共 <strong>{{ displayedContestCount }}</strong> 项赛事
          <span v-if="displayedContestCount > 0">，当前 {{ displayedRangeStart }}-{{ displayedRangeEnd }}</span>
        </p>
        <div class="contest-view-toggle" aria-label="切换赛事展示方式">
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'grid' }"
            aria-label="网格视图"
            @click="viewMode = 'grid'"
          >
            <span class="i-heroicons-solid-squares-2x2" />
          </button>
          <button
            type="button"
            :class="{ 'is-active': viewMode === 'list' }"
            aria-label="列表视图"
            @click="viewMode = 'list'"
          >
            <span class="i-heroicons-solid-list-bullet" />
          </button>
        </div>
      </section>

      <section
        v-if="loading"
        class="contest-grid contest-grid--cards"
        aria-label="赛事加载中"
      >
        <article
          v-for="index in 8"
          :key="`contest-skeleton-${index}`"
          class="contest-card contest-card--skeleton"
        >
          <div class="contest-card__head">
            <span class="contest-skeleton-icon" />
            <div class="contest-card__copy">
              <span class="contest-skeleton-line contest-skeleton-line--title" />
              <span class="contest-skeleton-line" />
              <span class="contest-skeleton-line contest-skeleton-line--short" />
            </div>
          </div>
          <div class="contest-card__footer">
            <span class="contest-skeleton-line contest-skeleton-line--footer" />
            <span class="contest-skeleton-line contest-skeleton-line--footer" />
            <span class="contest-skeleton-line contest-skeleton-line--footer" />
          </div>
        </article>
      </section>

      <section
        v-else-if="contests.length > 0"
        class="contest-grid"
        :class="viewMode === 'grid' ? 'contest-grid--cards' : 'contest-grid--list'"
        aria-label="赛事列表"
      >
        <article
          v-for="(contest, index) in contests"
          :key="contest.id"
          class="contest-card"
          :class="[
            `contest-card--${resolveContestVisual(index).tone}`,
            { 'contest-card--list': viewMode === 'list' },
          ]"
          role="button"
          tabindex="0"
          @click="openContestModal(contest)"
          @keydown.enter.prevent="openContestModal(contest)"
          @keydown.space.prevent="openContestModal(contest)"
        >
          <div class="contest-card__head">
            <span class="contest-card__icon">
              <span v-if="resolveContestVisual(index).icon === 'sparkles'" class="i-heroicons-solid-sparkles" />
              <span v-else-if="resolveContestVisual(index).icon === 'document'" class="i-heroicons-solid-document-text" />
              <span v-else-if="resolveContestVisual(index).icon === 'beaker'" class="i-heroicons-solid-beaker" />
              <span v-else class="i-heroicons-solid-academic-cap" />
            </span>

            <div class="contest-card__copy">
              <h2>{{ contest.name }}</h2>
              <p class="contest-card__summary" tabindex="0" @click.stop>
                <span class="contest-card__summary-text">{{ resolveContestSummary(contest) }}</span>
                <span class="contest-card__summary-popover" role="tooltip">
                  {{ resolveContestSummary(contest) }}
                </span>
              </p>
            </div>
          </div>

          <div class="contest-card__footer">
            <span
              class="contest-card__popover-trigger contest-card__missing"
              tabindex="0"
              @click.stop
              @keydown.enter.stop
              @keydown.space.stop
            >
              缺失项 <strong>{{ resolveMissingFieldCount(contest) }}</strong>
              <span class="contest-card__popover contest-card__popover--missing" role="tooltip">
                <span class="contest-card__popover-title">待补充字段</span>
                <span v-if="resolveMissingFields(contest).length > 0" class="contest-card__missing-list">
                  <span v-for="field in resolveMissingFields(contest)" :key="field">{{ field }}</span>
                </span>
                <span v-else class="contest-card__popover-empty">核心字段已补齐</span>
              </span>
            </span>
            <span>提交截止 <strong>{{ formatDateToken(contest.submissionDeadline) }}</strong></span>
            <span
              class="contest-card__popover-trigger contest-card__track-count"
              tabindex="0"
              @click.stop
              @keydown.enter.stop
              @keydown.space.stop
            >
              赛道数 <strong>{{ contest.tracks.length }}</strong>
              <span class="contest-card__popover contest-card__popover--tracks" role="tooltip">
                <span class="contest-card__popover-title">赛道详情</span>
                <span v-if="resolveTrackPopoverItems(contest).length > 0" class="contest-card__track-popover-list">
                  <span
                    v-for="track in resolveTrackPopoverItems(contest)"
                    :key="track.id"
                    class="contest-card__track-popover-item"
                  >
                    <span class="contest-card__track-popover-name">{{ track.name }}</span>
                    <span class="contest-card__track-popover-summary">{{ track.summary }}</span>
                    <span class="contest-card__track-popover-meta">
                      <span>交付物：{{ track.deliverables }}</span>
                      <span>适配专业：{{ track.majors }}</span>
                    </span>
                  </span>
                </span>
                <span v-else class="contest-card__popover-empty">暂无赛道，待补充。</span>
              </span>
            </span>
            <span class="contest-card__arrow">
              <span class="i-heroicons-solid-arrow-right" />
            </span>
          </div>
        </article>
      </section>

      <section v-else class="contest-empty-state">
        <span class="i-heroicons-outline-inbox" />
        <p>当前筛选条件下暂无赛事</p>
      </section>

      <nav
        v-if="displayedContestCount > contestPageSize"
        class="contest-pagination"
        aria-label="赛事分页"
      >
        <p>每页 {{ contestPageSize }} 项 · 第 {{ currentPage }} / {{ totalContestPages }} 页</p>
        <div class="contest-pagination__controls">
          <button
            type="button"
            :disabled="loading || currentPage <= 1"
            @click="goToContestPage(currentPage - 1)"
          >
            上一页
          </button>
          <button
            v-for="page in visibleContestPages"
            :key="`contest-page-${page}`"
            type="button"
            :class="{ 'is-active': page === currentPage }"
            :aria-current="page === currentPage ? 'page' : undefined"
            :disabled="loading"
            @click="goToContestPage(page)"
          >
            {{ page }}
          </button>
          <button
            type="button"
            :disabled="loading || currentPage >= totalContestPages"
            @click="goToContestPage(currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </nav>
    </div>

    <Teleport to="body">
      <Transition name="contest-modal">
        <div
          v-if="selectedContest"
          class="contest-detail-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="contestModalTitleId"
          @click.self="closeContestModal"
        >
          <section class="contest-detail-modal__panel">
            <header class="contest-detail-modal__header">
              <div class="contest-detail-modal__icon" :class="`contest-detail-modal__icon--${selectedContestVisual.tone}`">
                <span v-if="selectedContestVisual.icon === 'sparkles'" class="i-heroicons-solid-sparkles" />
                <span v-else-if="selectedContestVisual.icon === 'document'" class="i-heroicons-solid-document-text" />
                <span v-else-if="selectedContestVisual.icon === 'beaker'" class="i-heroicons-solid-beaker" />
                <span v-else class="i-heroicons-solid-academic-cap" />
              </div>

              <div class="contest-detail-modal__title">
                <div class="contest-detail-modal__title-row">
                  <h2 :id="contestModalTitleId">
                    {{ selectedContest.name }}
                  </h2>
                  <div class="contest-detail-modal__meta">
                    <span
                      class="contest-detail-modal__level-badge"
                      :class="`contest-detail-modal__level-badge--${selectedContest.level || 'unknown'}`"
                    >
                      <span :class="resolveLevelIcon(selectedContest.level)" />
                      {{ resolveLevelLabel(selectedContest.level) }}
                    </span>
                    <span class="contest-detail-modal__discipline-badge">
                      {{ resolveTextList(selectedContest.disciplines, '学科待补充') }}
                    </span>
                  </div>
                </div>
              </div>

              <button class="contest-detail-modal__close" type="button" aria-label="关闭赛事详情" @click="closeContestModal">
                <span class="i-heroicons-solid-x-mark" />
              </button>
            </header>

            <div class="contest-detail-modal__body">
              <section class="contest-detail-modal__section contest-detail-modal__section--main">
                <h3>关键节点</h3>
                <div class="contest-detail-modal__metrics">
                  <div>
                    <span class="contest-detail-modal__metric-icon contest-detail-modal__metric-icon--blue">
                      <span class="i-heroicons-outline-calendar-days" />
                    </span>
                    <span class="contest-detail-modal__metric-copy">
                      <span>报名周期</span>
                      <strong>{{ formatContestRegistrationWindow(selectedContest) }}</strong>
                    </span>
                  </div>
                  <div>
                    <span class="contest-detail-modal__metric-icon contest-detail-modal__metric-icon--violet">
                      <span class="i-heroicons-outline-document-text" />
                    </span>
                    <span class="contest-detail-modal__metric-copy">
                      <span>提交截止</span>
                      <strong>{{ formatDateToken(selectedContest.submissionDeadline) }}</strong>
                    </span>
                  </div>
                  <div>
                    <span class="contest-detail-modal__metric-icon contest-detail-modal__metric-icon--emerald">
                      <span class="i-heroicons-outline-trophy" />
                    </span>
                    <span class="contest-detail-modal__metric-copy">
                      <span>赛道数量</span>
                      <strong>{{ selectedContest.tracks.length }}</strong>
                    </span>
                  </div>
                  <div>
                    <span class="contest-detail-modal__metric-icon contest-detail-modal__metric-icon--amber">
                      <span class="i-heroicons-outline-gift" />
                    </span>
                    <span class="contest-detail-modal__metric-copy">
                      <span>待补充项</span>
                      <strong>{{ resolveMissingFieldCount(selectedContest) }}</strong>
                    </span>
                  </div>
                </div>
              </section>

              <section class="contest-detail-modal__tab-shell">
                <nav class="contest-detail-modal__tabs" aria-label="赛事详情切换">
                  <button
                    v-for="item in contestDetailNavItems"
                    :key="`${item.type}-${item.id}`"
                    type="button"
                    class="contest-detail-modal__nav-item"
                    :class="[
                      `contest-detail-modal__nav-item--${item.type}`,
                      { 'is-active': isContestNavItemActive(item) },
                    ]"
                    :aria-current="isContestNavItemActive(item) ? 'page' : undefined"
                    @click="selectContestNavItem(item)"
                  >
                    <span :class="item.icon" />
                    {{ item.label }}
                  </button>
                </nav>

                <div class="contest-detail-modal__tab-panel" role="tabpanel">
                  <section v-if="!selectedContestTrackId && selectedContestDetailTab === 'participation'" class="contest-detail-modal__section">
                    <h3>参赛信息</h3>
                    <dl class="contest-detail-modal__info">
                      <div>
                        <dt>当前赛季</dt>
                        <dd>{{ resolveText(selectedContest.currentSeason) }}</dd>
                      </div>
                      <div>
                        <dt>适配人群</dt>
                        <dd>{{ resolveTextList(selectedContest.recommendedFor) }}</dd>
                      </div>
                      <div>
                        <dt>赛事简介</dt>
                        <dd>{{ resolveText(selectedContest.summary, '暂无赛事简介，待补充。') }}</dd>
                      </div>
                      <div>
                        <dt>关键词</dt>
                        <dd>
                          <span v-if="resolveTextTags(selectedContest.keywords).length > 0" class="contest-detail-modal__tags">
                            <span v-for="keyword in resolveTextTags(selectedContest.keywords)" :key="keyword">{{ keyword }}</span>
                          </span>
                          <span v-else>待补充</span>
                        </dd>
                      </div>
                      <div>
                        <dt>参赛对象</dt>
                        <dd>{{ resolveText(selectedContest.participantRequirements) }}</dd>
                      </div>
                      <div>
                        <dt>组队规则</dt>
                        <dd>{{ resolveText(selectedContest.teamRule) }}</dd>
                      </div>
                    </dl>
                  </section>

                  <section v-else-if="!selectedContestTrackId && selectedContestDetailTab === 'resources'" class="contest-detail-modal__section">
                    <div class="contest-detail-modal__section-head">
                      <h3>相关资料</h3>
                      <span>{{ selectedContest.officialUrl ? 1 : 0 }} 条</span>
                    </div>
                    <div v-if="selectedContest.officialUrl" class="contest-detail-modal__resources">
                      <article>
                        <h4>赛事官网</h4>
                        <p>{{ selectedContest.officialUrl }}</p>
                        <a :href="selectedContest.officialUrl" target="_blank" rel="noreferrer">打开链接</a>
                      </article>
                    </div>
                    <p v-else class="contest-detail-modal__empty">
                      暂无相关资料，待补充。
                    </p>
                  </section>

                  <section v-else-if="!selectedContestTrackId && selectedContestDetailTab === 'faq'" class="contest-detail-modal__section">
                    <div class="contest-detail-modal__section-head">
                      <h3>常见疑问</h3>
                      <span>{{ selectedContest.faqItems?.length || (selectedContest.faq ? 1 : 0) }} 条</span>
                    </div>
                    <div v-if="selectedContest.faqItems?.length" class="contest-detail-modal__faq">
                      <article v-for="item in selectedContest.faqItems" :key="item.question">
                        <h4>{{ item.question }}</h4>
                        <p>{{ item.answer || '待补充' }}</p>
                      </article>
                    </div>
                    <p v-else-if="selectedContest.faq" class="contest-detail-modal__faq-text">
                      {{ selectedContest.faq }}
                    </p>
                    <p v-else class="contest-detail-modal__empty">
                      暂无常见疑问，待补充。
                    </p>
                  </section>

                  <section v-else class="contest-detail-modal__section">
                    <div class="contest-detail-modal__section-head">
                      <h3>赛道细节</h3>
                      <span>{{ selectedContestTrack?.name || '未选择赛道' }}</span>
                    </div>
                    <article v-if="selectedContestTrack" class="contest-detail-modal__track-detail">
                      <h4>{{ selectedContestTrack.name }}</h4>
                      <p>{{ resolveText(selectedContestTrack.summary, '暂无赛道说明。') }}</p>
                      <dl class="contest-detail-modal__info contest-detail-modal__info--compact">
                        <div>
                          <dt>主办方</dt>
                          <dd>{{ resolveText(selectedContestTrack.organizer) }}</dd>
                        </div>
                        <div>
                          <dt>参赛对象</dt>
                          <dd>{{ resolveText(selectedContestTrack.participantRequirements) }}</dd>
                        </div>
                        <div>
                          <dt>组队规则</dt>
                          <dd>{{ resolveText(selectedContestTrack.teamRule) }}</dd>
                        </div>
                        <div>
                          <dt>交付物</dt>
                          <dd>{{ resolveTextList(selectedContestTrack.deliverableTypes) }}</dd>
                        </div>
                        <div>
                          <dt>适配专业</dt>
                          <dd>{{ resolveTextList(selectedContestTrack.suitableMajors) }}</dd>
                        </div>
                      </dl>
                    </article>
                    <p v-else class="contest-detail-modal__empty">
                      暂无赛道，待补充。
                    </p>
                  </section>
                </div>
              </section>
            </div>

            <footer class="contest-detail-modal__footer">
              <a
                v-if="selectedContest.officialUrl"
                class="contest-detail-modal__link"
                :href="selectedContest.officialUrl"
                target="_blank"
                rel="noreferrer"
              >
                <span class="i-heroicons-solid-arrow-top-right-on-square" />
                官方链接
              </a>
              <button class="contest-detail-modal__ghost" type="button" @click="closeContestModal">
                关闭
              </button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.contest-library-page {
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

.contest-library-shell {
  width: min(100%, 1680px);
  margin: 0 auto;
}

.contest-library-hero {
  position: relative;
  min-height: 116px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  overflow: hidden;
  padding: 8px 2px 26px;
}

.contest-library-hero::after {
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

.contest-library-heading {
  position: relative;
  z-index: 2;
}

.contest-library-title-row {
  display: flex;
  gap: 14px;
  align-items: center;
}

.contest-library-title-row h1 {
  margin: 0;
  color: #101a33;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.16;
}

.contest-library-title-row span {
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

.contest-library-heading p {
  margin: 14px 0 0;
  color: #8b99b2;
  font-size: 14px;
  font-weight: 600;
}

.contest-library-art {
  position: absolute;
  top: 0;
  right: -12px;
  width: min(58vw, 930px);
  height: 128px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.contest-library-art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
  opacity: 0.78;
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

.contest-filter-panel {
  border: 1px solid #e7edf8;
  border-radius: 16px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 36px rgba(42, 75, 138, 0.05);
}

.contest-filter-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.55fr) repeat(5, minmax(132px, 0.92fr)) minmax(148px, 0.9fr);
  gap: 12px 14px;
}

.contest-field {
  position: relative;
  display: block;
  min-width: 0;
}

.contest-field--sort {
  max-width: none;
}

.contest-control {
  width: 100%;
  height: 40px;
  border: 2px solid #edf1f8;
  border-radius: 9px;
  padding: 0 36px 0 16px;
  color: #263653;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
  outline: none;
  appearance: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.contest-control::placeholder {
  color: #a7b2c5;
}

.contest-control:focus {
  border-color: #9cb8fb;
  box-shadow: 0 0 0 4px rgba(74, 119, 232, 0.1);
}

.contest-control--with-icon {
  padding-left: 42px;
}

.contest-field__icon,
.contest-field__chevron {
  position: absolute;
  top: 50%;
  pointer-events: none;
  transform: translateY(-50%);
}

.contest-field__icon {
  left: 14px;
  width: 18px;
  height: 18px;
  color: #a7b2c5;
}

.contest-field__chevron {
  right: 14px;
  width: 16px;
  height: 16px;
  color: #9ba9bf;
}

.contest-filter-button {
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

.contest-filter-button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.contest-filter-button:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(61, 120, 232, 0.26);
}

.contest-result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 8px 14px;
}

.contest-result-toolbar p {
  margin: 0;
  color: #91a0b6;
  font-size: 14px;
  font-weight: 700;
}

.contest-result-toolbar strong {
  color: #7d8fa8;
}

.contest-view-toggle {
  display: inline-flex;
  overflow: hidden;
  border: 2px solid #dbe5f5;
  border-radius: 10px;
  background: #fff;
}

.contest-view-toggle button {
  display: inline-grid;
  width: 48px;
  height: 42px;
  place-items: center;
  border: 0;
  color: #8ea0b8;
  background: transparent;
  cursor: pointer;
}

.contest-view-toggle button.is-active {
  color: #2f72ec;
  background: #eaf2ff;
  box-shadow: inset 0 0 0 1px #b9cffb;
}

.contest-view-toggle span {
  width: 21px;
  height: 21px;
}

.contest-grid {
  display: grid;
  gap: 20px;
}

.contest-grid--cards {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.contest-grid--list {
  grid-template-columns: minmax(0, 1fr);
}

.contest-card {
  position: relative;
  display: flex;
  min-height: 204px;
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
  text-decoration: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.contest-card:hover {
  z-index: 4;
  border-color: rgba(74, 119, 232, 0.34);
  box-shadow: 0 18px 32px rgba(49, 84, 147, 0.09);
  transform: translateY(-1px);
}

.contest-card:focus-visible {
  z-index: 4;
  border-color: rgba(61, 120, 232, 0.72);
  box-shadow:
    0 18px 32px rgba(49, 84, 147, 0.09),
    0 0 0 4px rgba(61, 120, 232, 0.12);
  outline: none;
}

.contest-card--list {
  min-height: 140px;
  padding: 20px 22px 16px;
}

.contest-card__head {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.contest-card__copy {
  min-width: 0;
}

.contest-card:focus-within {
  z-index: 5;
}

.contest-card__icon {
  display: inline-grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
}

.contest-card__icon span {
  width: 20px;
  height: 20px;
}

.contest-card--blue .contest-card__icon {
  color: #3477ed;
  background: #e8f0ff;
  box-shadow: inset 0 0 0 2px #c7d9ff;
}

.contest-card--violet .contest-card__icon {
  color: #7c54e9;
  background: #f0ebff;
}

.contest-card--emerald .contest-card__icon {
  color: #1bbf7a;
  background: #e8fbf1;
}

.contest-card--indigo .contest-card__icon {
  color: #4c78f4;
  background: #e9efff;
}

.contest-card h2 {
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

.contest-card__summary {
  position: relative;
  margin: 0 0 10px;
  color: #51627d;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.5;
}

.contest-card__summary-text {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.contest-card__summary-popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 22;
  display: block;
  width: min(360px, 72vw);
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid #dce6f5;
  border-radius: 12px;
  padding: 12px;
  color: #42536f;
  background: #fff;
  box-shadow: 0 18px 44px rgba(25, 45, 80, 0.18);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.6;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.contest-card__summary::after,
.contest-card__popover-trigger::after {
  position: absolute;
  content: '';
}

.contest-card__summary::after {
  top: 100%;
  right: 0;
  left: 0;
  height: 12px;
}

.contest-card__summary:hover .contest-card__summary-popover,
.contest-card__summary:focus-visible .contest-card__summary-popover {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.contest-card__footer {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-top: 16px;
  border-top: 1px solid #edf1f7;
  padding-top: 15px;
  color: #8c9ab1;
  font-size: 14px;
  font-weight: 700;
}

.contest-card__footer strong {
  color: #8795ad;
  font-weight: 900;
}

.contest-card__popover-trigger {
  position: relative;
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
  outline: none;
}

.contest-card__popover-trigger::after {
  right: -8px;
  bottom: 100%;
  left: -8px;
  height: 16px;
}

.contest-card__popover-trigger:focus-visible {
  box-shadow: 0 0 0 3px rgba(61, 120, 232, 0.14);
}

.contest-card__popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  z-index: 20;
  display: grid;
  width: min(340px, 72vw);
  max-height: 320px;
  gap: 10px;
  overflow-y: auto;
  border: 1px solid #dce6f5;
  border-radius: 12px;
  padding: 12px;
  color: #33445f;
  background: #fff;
  box-shadow: 0 18px 44px rgba(25, 45, 80, 0.18);
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 6px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.contest-card__popover--missing {
  width: min(220px, 64vw);
}

.contest-card__popover--tracks {
  right: 0;
  left: auto;
  transform: translateY(6px);
}

.contest-card__popover-trigger:hover .contest-card__popover,
.contest-card__popover-trigger:focus-within .contest-card__popover {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
}

.contest-card__popover-trigger:hover .contest-card__popover--tracks,
.contest-card__popover-trigger:focus-within .contest-card__popover--tracks {
  transform: translateY(0);
}

.contest-card__popover-title {
  color: #172033;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
}

.contest-card__popover-empty {
  color: #7a8aa3;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}

.contest-card__missing-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.contest-card__missing-list span {
  border-radius: 999px;
  padding: 4px 8px;
  color: #556987;
  background: #f0f5fd;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.contest-card__track-popover-list {
  display: grid;
  gap: 10px;
}

.contest-card__track-popover-item {
  display: grid;
  gap: 6px;
  border-bottom: 1px solid #edf1f7;
  padding-bottom: 10px;
}

.contest-card__track-popover-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.contest-card__track-popover-name {
  color: #172033;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.35;
}

.contest-card__track-popover-summary {
  display: -webkit-box;
  overflow: hidden;
  color: #5f718d;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.contest-card__track-popover-meta {
  display: grid;
  gap: 3px;
  color: #8190a7;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.4;
}

.contest-card__arrow {
  display: inline-grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  margin-left: auto;
  border-radius: 999px;
  color: #3d78e8;
  background: #f3f7ff;
}

.contest-card__arrow span {
  width: 20px;
  height: 20px;
}

.contest-card--skeleton {
  pointer-events: none;
}

.contest-skeleton-icon,
.contest-skeleton-line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #edf2f9 0%, #f7f9fd 42%, #edf2f9 100%);
  background-size: 220% 100%;
  animation: contest-skeleton 1.3s ease-in-out infinite;
}

.contest-skeleton-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
}

.contest-skeleton-line {
  width: 80%;
  height: 12px;
  margin-top: 12px;
}

.contest-skeleton-line--title {
  width: 92%;
  height: 16px;
  margin-top: 0;
}

.contest-skeleton-line--short {
  width: 62%;
}

.contest-skeleton-line--footer {
  width: 76px;
  height: 12px;
  margin-top: 0;
}

.contest-empty-state {
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

.contest-empty-state span {
  width: 38px;
  height: 38px;
  margin-bottom: 10px;
  color: #9fb0c8;
}

.contest-empty-state p {
  margin: 0;
}

.contest-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 8px 0;
}

.contest-pagination p {
  margin: 0;
  color: #8795ad;
  font-size: 13px;
  font-weight: 800;
}

.contest-pagination__controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.contest-pagination__controls button {
  min-width: 38px;
  height: 38px;
  border: 1px solid #dbe5f5;
  border-radius: 10px;
  padding: 0 12px;
  color: #53647f;
  background: rgba(255, 255, 255, 0.94);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease,
    background 0.18s ease;
}

.contest-pagination__controls button:hover:not(:disabled) {
  color: #2f72ec;
  border-color: #b9cffb;
  box-shadow: 0 8px 18px rgba(61, 120, 232, 0.12);
}

.contest-pagination__controls button.is-active {
  color: #fff;
  border-color: #3d78e8;
  background: #3d78e8;
}

.contest-pagination__controls button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.contest-detail-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: center;
  justify-items: center;
  padding: 28px;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(12px);
}

.contest-detail-modal__panel {
  display: flex;
  width: min(1260px, 100%);
  max-height: min(800px, calc(100vh - 56px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(218, 226, 240, 0.96);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 28px 80px rgba(28, 50, 90, 0.24);
}

.contest-detail-modal__header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 16px;
  align-items: flex-start;
  border-bottom: 1px solid #edf1f7;
  padding: 24px 28px 20px;
  background:
    linear-gradient(90deg, rgba(244, 248, 255, 0.96), rgba(255, 255, 255, 0.92)),
    radial-gradient(circle at 82% 0%, rgba(78, 123, 232, 0.14), transparent 34%);
}

.contest-detail-modal__icon {
  display: inline-grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 16px;
}

.contest-detail-modal__icon span {
  width: 23px;
  height: 23px;
}

.contest-detail-modal__icon--blue {
  color: #3477ed;
  background: #e8f0ff;
}

.contest-detail-modal__icon--violet {
  color: #7c54e9;
  background: #f0ebff;
}

.contest-detail-modal__icon--emerald {
  color: #1bbf7a;
  background: #e8fbf1;
}

.contest-detail-modal__icon--indigo {
  color: #4c78f4;
  background: #e9efff;
}

.contest-detail-modal__title {
  min-width: 0;
}

.contest-detail-modal__title-row {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
}

.contest-detail-modal__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.contest-detail-modal__meta span {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  border: 1px solid #dbe6f6;
  border-radius: 999px;
  padding: 0 10px;
  color: #4e6280;
  background: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  font-weight: 800;
}

.contest-detail-modal__level-badge {
  gap: 5px;
}

.contest-detail-modal__level-badge > span {
  width: 14px;
  height: 14px;
}

.contest-detail-modal__level-badge--national {
  color: #1e5fd8;
  border-color: #bcd2ff;
  background: #eef5ff;
}

.contest-detail-modal__level-badge--provincial {
  color: #0f8a68;
  border-color: #b9eadc;
  background: #edfdf7;
}

.contest-detail-modal__level-badge--school {
  color: #7b4bd8;
  border-color: #d9cafa;
  background: #f5f0ff;
}

.contest-detail-modal__level-badge--industry {
  color: #c76c18;
  border-color: #f5d2a8;
  background: #fff6e8;
}

.contest-detail-modal__level-badge--unknown {
  color: #64748b;
  border-color: #d7e0ec;
  background: #f8fafc;
}

.contest-detail-modal__discipline-badge {
  color: #4e6280;
  border-color: #dbe6f6;
  background: rgba(255, 255, 255, 0.8);
}

.contest-detail-modal__title h2 {
  margin: 0;
  color: #111a2e;
  font-size: 23px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.28;
}

.contest-detail-modal__close {
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

.contest-detail-modal__close:hover {
  color: #1d2a42;
  border-color: #cbd8ea;
}

.contest-detail-modal__close span {
  width: 20px;
  height: 20px;
}

.contest-detail-modal__body {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  padding: 18px 28px 22px;
}

.contest-detail-modal__section {
  min-width: 0;
  border: 1px solid #e8edf7;
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
}

.contest-detail-modal__section--main {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  align-items: center;
  padding: 12px 16px;
  background: #f8fbff;
}

.contest-detail-modal__section h3,
.contest-detail-modal__section-head h3 {
  margin: 0;
  color: #172033;
  font-size: 13px;
  font-weight: 900;
}

.contest-detail-modal__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  margin-top: 0;
}

.contest-detail-modal__metrics div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  border-left: 1px solid #dfe7f3;
  padding: 0 18px;
}

.contest-detail-modal__metric-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.contest-detail-modal__metric-copy span {
  display: block;
  color: #8391a7;
  font-size: 11px;
  font-weight: 800;
}

.contest-detail-modal__metric-copy strong {
  display: block;
  overflow-wrap: anywhere;
  color: #1b2a44;
  font-size: 13px;
  font-weight: 900;
}

.contest-detail-modal__metric-icon {
  display: inline-grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
}

.contest-detail-modal__metric-icon span {
  width: 18px;
  height: 18px;
}

.contest-detail-modal__metric-icon--blue {
  color: #2f72ec;
  background: #eaf2ff;
}

.contest-detail-modal__metric-icon--violet {
  color: #7c54e9;
  background: #f1ecff;
}

.contest-detail-modal__metric-icon--emerald {
  color: #18a86f;
  background: #e7f8f0;
}

.contest-detail-modal__metric-icon--amber {
  color: #dd7d16;
  background: #fff3e2;
}

.contest-detail-modal__info {
  display: grid;
  margin: 10px 0 0;
}

.contest-detail-modal__tab-shell {
  display: grid;
  min-height: 0;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
}

.contest-detail-modal__tabs {
  display: grid;
  align-content: start;
  gap: 4px;
  border: 1px solid #e8edf7;
  border-radius: 12px;
  padding: 10px;
  background: #f8fbff;
}

.contest-detail-modal__nav-item {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 12px;
  color: #687995;
  background: transparent;
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    color 0.18s ease;
}

.contest-detail-modal__nav-item > span {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}

.contest-detail-modal__nav-item--track {
  min-height: 34px;
  margin-left: 18px;
  padding-left: 10px;
  color: #71819a;
  font-size: 12px;
  font-weight: 850;
}

.contest-detail-modal__nav-item--track > span {
  width: 15px;
  height: 15px;
}

.contest-detail-modal__nav-item:hover {
  color: #2f72ec;
  background: #eef4ff;
}

.contest-detail-modal__nav-item.is-active {
  color: #1e5fd8;
  border-color: #c8d9fb;
  background: #fff;
}

.contest-detail-modal__tab-panel {
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.contest-detail-modal__info div {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 18px;
  border-bottom: 1px solid #edf1f7;
  padding: 10px 0;
}

.contest-detail-modal__info div:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.contest-detail-modal__info dt {
  color: #8998af;
  font-size: 12px;
  font-weight: 800;
}

.contest-detail-modal__info dd {
  min-width: 0;
  margin: 0;
  color: #34445f;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.52;
  overflow-wrap: anywhere;
}

.contest-detail-modal__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.contest-detail-modal__tags span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  border: 1px solid #cbdaf8;
  border-radius: 5px;
  padding: 0 8px;
  color: #2767d8;
  background: #f7faff;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
}

.contest-detail-modal__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.contest-detail-modal__section-head span {
  color: #8795ad;
  font-size: 12px;
  font-weight: 800;
}

.contest-detail-modal__tracks {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.contest-detail-modal__tracks article {
  border: 1px solid #edf1f7;
  border-radius: 10px;
  padding: 12px;
  background: #fbfdff;
}

.contest-detail-modal__tracks h4 {
  margin: 0;
  color: #172033;
  font-size: 14px;
  font-weight: 900;
}

.contest-detail-modal__tracks p {
  display: -webkit-box;
  overflow: hidden;
  margin: 7px 0 0;
  color: #61718a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.contest-detail-modal__tracks div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.contest-detail-modal__tracks span {
  display: inline-flex;
  max-width: 100%;
  border-radius: 999px;
  padding: 5px 9px;
  color: #64748b;
  background: #eef4ff;
  font-size: 12px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.contest-detail-modal__resources,
.contest-detail-modal__faq {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.contest-detail-modal__resources article,
.contest-detail-modal__faq article,
.contest-detail-modal__track-detail {
  border: 1px solid #edf1f7;
  border-radius: 10px;
  padding: 12px;
  background: #fbfdff;
}

.contest-detail-modal__resources h4,
.contest-detail-modal__faq h4,
.contest-detail-modal__track-detail h4 {
  margin: 0;
  color: #172033;
  font-size: 14px;
  font-weight: 900;
}

.contest-detail-modal__resources p,
.contest-detail-modal__faq p,
.contest-detail-modal__faq-text,
.contest-detail-modal__track-detail p {
  margin: 7px 0 0;
  color: #61718a;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.contest-detail-modal__resources a {
  display: inline-flex;
  width: fit-content;
  margin-top: 10px;
  color: #2767d8;
  font-size: 12px;
  font-weight: 900;
  text-decoration: none;
}

.contest-detail-modal__info--compact {
  margin-top: 12px;
}

.contest-detail-modal__empty {
  margin: 14px 0 0;
  color: #8a98ad;
  font-size: 13px;
  font-weight: 700;
}

.contest-detail-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #edf1f7;
  padding: 14px 28px;
  background: #fbfdff;
}

.contest-detail-modal__link,
.contest-detail-modal__ghost {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 900;
  text-decoration: none;
}

.contest-detail-modal__link {
  gap: 7px;
  color: #fff;
  background: #3d78e8;
}

.contest-detail-modal__link span {
  width: 17px;
  height: 17px;
}

.contest-detail-modal__ghost {
  border: 1px solid #dce5f3;
  color: #53647f;
  background: #fff;
  cursor: pointer;
}

.contest-modal-enter-active,
.contest-modal-leave-active {
  transition: opacity 0.18s ease;
}

.contest-modal-enter-active .contest-detail-modal__panel,
.contest-modal-leave-active .contest-detail-modal__panel {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.contest-modal-enter-from,
.contest-modal-leave-to {
  opacity: 0;
}

.contest-modal-enter-from .contest-detail-modal__panel,
.contest-modal-leave-to .contest-detail-modal__panel {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@keyframes contest-skeleton {
  0% {
    background-position: 0% 50%;
  }

  100% {
    background-position: -220% 50%;
  }
}

@media (max-width: 1480px) {
  .contest-grid--cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1440px) {
  .contest-filter-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .contest-field--search {
    grid-column: span 2;
  }

  .contest-filter-button {
    grid-column: span 2;
  }
}

@media (max-width: 1180px) {
  .contest-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .contest-field--search,
  .contest-field--sort {
    max-width: none;
  }

  .contest-filter-button {
    width: 100%;
  }

  .contest-grid--cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .contest-detail-modal__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .contest-detail-modal__metrics div:nth-child(odd) {
    border-left: 0;
  }
}

@media (max-width: 760px) {
  .contest-library-page {
    padding: 22px 16px 28px;
  }

  .contest-library-hero {
    min-height: 132px;
  }

  .contest-library-art {
    right: -440px;
    opacity: 0.4;
  }

  .contest-library-title-row h1 {
    font-size: 22px;
  }

  .contest-filter-grid,
  .contest-grid--cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .contest-result-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }

  .contest-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .contest-pagination__controls {
    justify-content: flex-start;
  }

  .contest-card,
  .contest-card--list {
    min-height: 0;
    padding: 22px 18px 16px;
  }

  .contest-card__head {
    gap: 14px;
  }

  .contest-card__footer {
    flex-wrap: wrap;
    gap: 10px 14px;
  }

  .contest-detail-modal {
    align-items: end;
    padding: 12px;
  }

  .contest-detail-modal__panel {
    max-height: calc(100vh - 24px);
    border-radius: 16px;
  }

  .contest-detail-modal__header {
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 22px 20px 18px;
  }

  .contest-detail-modal__icon {
    display: none;
  }

  .contest-detail-modal__title h2 {
    font-size: 20px;
  }

  .contest-detail-modal__body {
    gap: 14px;
    padding: 18px 20px 20px;
  }

  .contest-detail-modal__section--main {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .contest-detail-modal__tab-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .contest-detail-modal__tabs {
    display: flex;
    overflow-x: auto;
  }

  .contest-detail-modal__nav-item {
    flex: 1 0 auto;
    justify-content: center;
  }

  .contest-detail-modal__metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .contest-detail-modal__metrics div {
    border-left: 0;
    border-top: 1px solid #dfe7f3;
    padding: 10px 0 0;
  }

  .contest-detail-modal__metrics div:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .contest-detail-modal__info div {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .contest-detail-modal__footer {
    flex-wrap: wrap;
    padding: 14px 20px;
  }

  .contest-detail-modal__link,
  .contest-detail-modal__ghost {
    width: 100%;
  }
}
</style>
