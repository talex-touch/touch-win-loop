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

const contestVisuals: ContestVisual[] = [
  { icon: 'sparkles', tone: 'blue' },
  { icon: 'document', tone: 'violet' },
  { icon: 'beaker', tone: 'emerald' },
  { icon: 'academic', tone: 'indigo' },
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

async function loadContests() {
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
        page: 1,
        pageSize: 100,
      },
    }) as ContestListResponse
    contests.value = Array.isArray(response.data) ? response.data : []
    totalContests.value = Number(response.pagination?.total || contests.value.length)
  }
  finally {
    loading.value = false
  }
}

function resolveContestVisual(index: number): ContestVisual {
  return contestVisuals[index % contestVisuals.length] || contestVisuals[0]!
}

function trimText(value: string | undefined, fallback = '待补充') {
  const normalized = String(value || '').trim()
  return normalized || fallback
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

function resolveMissingFieldCount(contest: Contest) {
  const requiredFields = [
    contest.organizer,
    contest.registrationWindow,
    contest.submissionDeadline,
    contest.summary,
    contest.participantRequirements,
    contest.teamRule,
  ]
  return requiredFields.filter(item => !String(item || '').trim()).length
}

onMounted(loadContests)
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
          <img src="/assets/contests/library-hero-art.png" alt="">
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
              placeholder="搜索赛事名称/主办方/关键词"
              @keydown.enter="loadContests"
            >
          </label>

          <label class="contest-field">
            <span class="sr-only">学科门类</span>
            <select v-model="discipline" class="contest-control">
              <option v-for="item in disciplineOptions" :key="item.label" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <span class="contest-field__chevron i-heroicons-outline-chevron-down" />
          </label>

          <label class="contest-field">
            <span class="sr-only">级别</span>
            <select v-model="level" class="contest-control">
              <option v-for="item in levelOptions" :key="item.label" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <span class="contest-field__chevron i-heroicons-outline-chevron-down" />
          </label>

          <label class="contest-field">
            <span class="sr-only">交付物类型</span>
            <select v-model="deliverableType" class="contest-control">
              <option v-for="item in deliverableOptions" :key="item.label" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <span class="contest-field__chevron i-heroicons-outline-chevron-down" />
          </label>

          <label class="contest-field">
            <span class="sr-only">时间状态</span>
            <select v-model="timelineStatus" class="contest-control">
              <option v-for="item in statusOptions" :key="item.label" :value="item.value">
                {{ item.label }}
              </option>
            </select>
            <span class="contest-field__chevron i-heroicons-outline-chevron-down" />
          </label>

          <label class="contest-field contest-field--sort">
            <span class="sr-only">排序方式</span>
            <select v-model="sort" class="contest-control">
              <option value="composite">
                综合排序
              </option>
              <option value="hot">
                热度优先
              </option>
              <option value="deadline">
                时间临近
              </option>
            </select>
            <span class="contest-field__chevron i-heroicons-outline-chevron-down" />
          </label>

          <button class="contest-filter-button" type="button" :disabled="loading" @click="loadContests">
            {{ loading ? '筛选中' : '应用筛选' }}
          </button>
        </div>
      </section>

      <section class="contest-result-toolbar" aria-label="赛事结果">
        <p>共 <strong>{{ displayedContestCount }}</strong> 项赛事</p>
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
        <NuxtLink
          v-for="(contest, index) in contests"
          :key="contest.id"
          :to="`/contests/${contest.id}`"
          class="contest-card"
          :class="[
            `contest-card--${resolveContestVisual(index).tone}`,
            { 'contest-card--list': viewMode === 'list' },
          ]"
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
              <p class="contest-card__organizer">
                主办方：{{ trimText(contest.organizer) }}
              </p>
              <p class="contest-card__time">
                报名时间：{{ formatRegistrationWindow(contest.registrationWindow) }}
              </p>
            </div>
          </div>

          <div class="contest-card__footer">
            <span>待补充 <strong>{{ resolveMissingFieldCount(contest) }}</strong></span>
            <span>提交截止 <strong>{{ formatDateToken(contest.submissionDeadline) }}</strong></span>
            <span>赛道数 <strong>{{ contest.tracks.length }}</strong></span>
            <span class="contest-card__arrow">
              <span class="i-heroicons-solid-arrow-right" />
            </span>
          </div>
        </NuxtLink>
      </section>

      <section v-else class="contest-empty-state">
        <span class="i-heroicons-outline-inbox" />
        <p>当前筛选条件下暂无赛事</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.contest-library-page {
  min-height: calc(100vh - 64px);
  padding: 30px 32px 40px;
  color: #172033;
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
  letter-spacing: -0.04em;
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
  top: -4px;
  right: -18px;
  width: min(55vw, 900px);
  height: 204px;
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
  display: flex;
  min-height: 204px;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  border: 1px solid #e8edf7;
  border-radius: 16px;
  padding: 22px 22px 16px;
  color: inherit;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 12px 28px rgba(36, 65, 118, 0.05);
  text-decoration: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.contest-card:hover {
  border-color: rgba(74, 119, 232, 0.34);
  box-shadow: 0 18px 32px rgba(49, 84, 147, 0.09);
  transform: translateY(-1px);
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
  margin: 1px 0 12px;
  color: #172033;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.contest-card__organizer,
.contest-card__time {
  margin: 0;
  color: #8390a7;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.contest-card__organizer {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.contest-card__time {
  margin-top: 6px;
  white-space: nowrap;
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
}

@media (max-width: 760px) {
  .contest-library-page {
    padding: 22px 16px 28px;
  }

  .contest-library-hero {
    min-height: 132px;
  }

  .contest-library-art {
    right: -360px;
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
}
</style>
