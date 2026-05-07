<script setup lang="ts">
import type {
  AnalyticsAwardSampleStatus,
  AnalyticsDetailView,
  AnalyticsDifficultyLevel,
  AnalyticsDifficultySeverity,
  AnalyticsGapLevel,
  AnalyticsMetricCard,
  AnalyticsTimelineIntensity,
} from '~~/shared/types/analytics'

definePageMeta({ layout: 'dashboard' })

useHead({ title: '综合数据分析' })

const {
  filters,
  activeView,
  overview,
  trendAnalysis,
  awardAnalysis,
  profileAnalysis,
  difficultyAnalysis,
  preparationAnalysis,
  workspaceOptions,
  projectOptions,
  contestOptions,
  optionsLoading,
  optionsError,
  overviewLoading,
  detailLoading,
  overviewError,
  detailError,
  rangeOptions,
  viewOptions,
  lastUpdatedText,
  loadFilterOptions,
  loadOverview,
  loadDetail,
  setRangePreset,
  setWorkspaceId,
  setProjectId,
  setContestId,
  setDetailView,
  trackEvent,
} = useAnalyticsDashboard()

function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    registration: '报名',
    kickoff: '启动',
    review: '评审',
    submission: '提交',
    preliminary: '初赛',
    semifinal: '复赛',
    final: '决赛',
    award: '公示',
  }
  return map[phase] || phase
}

function gapToneClasses(level: AnalyticsGapLevel): string {
  if (level === 'critical')
    return 'analytics-gap-card analytics-gap-card--critical'
  if (level === 'warning')
    return 'analytics-gap-card analytics-gap-card--warning'
  return 'analytics-gap-card analytics-gap-card--info'
}

function intensityClasses(intensity: AnalyticsTimelineIntensity): string {
  if (intensity === 'high')
    return 'bg-rose-50 text-rose-700'
  if (intensity === 'medium')
    return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function sampleStatusLabel(status: AnalyticsAwardSampleStatus): string {
  if (status === 'selected')
    return '已入选'
  if (status === 'shortlisted')
    return '短名单'
  if (status === 'resource')
    return '资料样本'
  return '候选题'
}

function difficultyLevelClasses(level: AnalyticsDifficultyLevel): string {
  if (level === 'advanced')
    return 'bg-rose-50 text-rose-700'
  if (level === 'challenging')
    return 'bg-amber-50 text-amber-700'
  return 'bg-emerald-50 text-emerald-700'
}

function bottleneckSeverityClasses(severity: AnalyticsDifficultySeverity): string {
  if (severity === 'high')
    return 'border-rose-200 bg-rose-50 text-rose-700'
  if (severity === 'medium')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function projectStatusLabel(status: string): string {
  if (status === 'completed')
    return '已完成'
  if (status === 'in_progress')
    return '进行中'
  return '草稿'
}

const analyticsAssetBase = '/assets/dashboard/analytics'
const analyticsFilterAssetUrl = `${analyticsAssetBase}/current-filter.png`
const analyticsOverviewTrendAssetUrl = `${analyticsAssetBase}/overview-trend.png`

const workspaceFilterOptions = computed(() => [
  { label: '全部工作区', value: '' },
  ...workspaceOptions.value,
])
const projectFilterOptions = computed(() => [
  { label: '全部项目', value: '' },
  ...projectOptions.value,
])
const contestFilterOptions = computed(() => [
  { label: '全部竞赛', value: '' },
  ...contestOptions.value,
])

function normalizeSelectValue(value: string | number) {
  return String(value || '')
}

function metricToneClasses(tone: AnalyticsMetricCard['tone']): string {
  return `analytics-metric-card analytics-metric-card--${tone}`
}

function resolveMetricAsset(item: Pick<AnalyticsMetricCard, 'id' | 'label' | 'tone'>): string {
  const text = `${item.id} ${item.label}`
  if (/趋势|样本|热度/.test(text))
    return `${analyticsAssetBase}/trend-samples.png`
  if (/项目|可见/.test(text))
    return `${analyticsAssetBase}/visible-projects.png`
  if (/资料|解析|文档/.test(text))
    return `${analyticsAssetBase}/document-parsing.png`
  if (/行为|事件|调用/.test(text))
    return `${analyticsAssetBase}/behavior-events.png`
  if (item.tone === 'emerald')
    return `${analyticsAssetBase}/visible-projects.png`
  if (item.tone === 'amber')
    return `${analyticsAssetBase}/document-parsing.png`
  if (item.tone === 'violet')
    return `${analyticsAssetBase}/behavior-events.png`
  return `${analyticsAssetBase}/trend-samples.png`
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.min(Math.max(Math.round(value), 0), 100)
}

const activeViewLabel = computed(() => {
  return viewOptions.find(item => item.value === activeView.value)?.label || activeView.value
})

const activeAdviceText = computed(() => {
  return `先确认筛选范围，再判断样本是否足够，最后进入 ${activeViewLabel.value} 深挖决策依据。`
})

const metricCardsWithView = computed(() => {
  return overview.value.metricCards.map(item => ({
    ...item,
    assetUrl: resolveMetricAsset(item),
    cardClass: metricToneClasses(item.tone),
  }))
})

const capabilityPreviewItems = computed(() => {
  return overview.value.capabilityRadar.slice(0, 5)
})

const awardPreviewItems = computed(() => {
  return overview.value.awardFeatureTags.slice(0, 6)
})

const timelinePreviewItems = computed(() => {
  return overview.value.preparationTimeline.slice(0, 6)
})

const activeSummary = computed(() => {
  if (activeView.value === 'trends')
    return trendAnalysis.value.summary
  if (activeView.value === 'awards')
    return awardAnalysis.value.summary
  if (activeView.value === 'profile')
    return profileAnalysis.value.summary
  if (activeView.value === 'difficulty')
    return difficultyAnalysis.value.summary
  if (activeView.value === 'preparation') {
    const phases = preparationAnalysis.value.stageStats.slice(0, 3).map(item => phaseLabel(item.phase))
    return phases.length > 0
      ? `当前备赛节奏主要集中在 ${phases.join('、')} 阶段。`
      : preparationAnalysis.value.summary
  }
  return overview.value.scopeSummary
})

const activeDataGaps = computed(() => {
  if (activeView.value === 'trends')
    return trendAnalysis.value.dataGaps
  if (activeView.value === 'awards')
    return awardAnalysis.value.dataGaps
  if (activeView.value === 'profile')
    return profileAnalysis.value.dataGaps
  if (activeView.value === 'difficulty')
    return difficultyAnalysis.value.dataGaps
  if (activeView.value === 'preparation')
    return preparationAnalysis.value.dataGaps
  return overview.value.dataGaps
})

const highlightCards = computed(() => {
  const trend = overview.value.trendSeries.points[0]
  const feature = overview.value.awardFeatureTags[0]
  const radar = [...overview.value.capabilityRadar].sort((left, right) => right.score - left.score)[0]
  const timeline = overview.value.preparationTimeline[0]

  return [
    {
      id: 'trend',
      title: '热点方向',
      icon: 'local_fire_department',
      tone: 'blue',
      value: trend?.label || '待沉淀',
      desc: trend ? `覆盖 ${trend.contestCount} 个竞赛，热度 ${trend.heatScore}` : '当前范围内还没有稳定趋势样本。',
    },
    {
      id: 'feature',
      title: '高频特征',
      icon: 'diamond',
      tone: 'emerald',
      value: feature?.label || '待沉淀',
      desc: feature ? `${feature.evidenceCount} 条样本重复出现` : '当前范围内还没有稳定共性特征。',
    },
    {
      id: 'radar',
      title: '优势维度',
      icon: 'task_alt',
      tone: 'violet',
      value: radar?.label || '待评估',
      desc: radar ? `当前评估得分 ${radar.score}` : '能力画像需要更多题目对比板样本。',
    },
    {
      id: 'timeline',
      title: '最近节点',
      icon: 'calendar_month',
      tone: 'amber',
      value: timeline?.label || '待补充',
      desc: timeline ? `${timeline.timeText} · ${timeline.source}` : '当前范围内暂无备赛节点。',
    },
  ]
})

async function handleRangePresetChange(value: string) {
  const rangePreset = value as typeof filters.rangePreset
  if (filters.rangePreset === rangePreset)
    return

  await setRangePreset(rangePreset)
  void trackEvent('analytics_range_changed', { rangePreset }, 'filter_change')
}

async function handleWorkspaceChange(value: string) {
  await setWorkspaceId(value)
  void trackEvent('analytics_workspace_changed', { workspaceId: value || '' }, 'filter_change')
}

async function handleProjectChange(value: string) {
  await setProjectId(value)
  void trackEvent('analytics_project_changed', { projectId: value || '' }, 'filter_change')
}

async function handleContestChange(value: string) {
  await setContestId(value)
  void trackEvent('analytics_contest_changed', { contestId: value || '' }, 'filter_change')
}

async function handleViewChange(view: AnalyticsDetailView) {
  if (activeView.value === view)
    return

  await setDetailView(view)
  void trackEvent('analytics_view_changed', { view }, 'drilldown')
}

async function handleRetry() {
  await Promise.all([
    loadFilterOptions(true),
    loadOverview(),
    loadDetail(activeView.value),
  ])
}

onMounted(() => {
  void trackEvent('analytics_page_viewed', {
    view: activeView.value,
    rangePreset: filters.rangePreset,
  }, 'page_view')
})
</script>

<template>
  <div class="analytics-page">
    <section class="analytics-hero">
      <div class="analytics-hero__top">
        <div class="analytics-hero__copy">
          <h2 class="analytics-hero__title">
            竞赛、作品与行为数据一体化分析
          </h2>
        </div>
      </div>

      <div class="analytics-hero__filters">
        <div class="analytics-filter-panel">
          <div class="analytics-filter-row">
            <label class="analytics-select-field analytics-select-field--range">
              <span>时间范围</span>
              <UiSelect :model-value="filters.rangePreset" :options="rangeOptions" aria-label="时间范围" @change="value => handleRangePresetChange(normalizeSelectValue(value))" />
            </label>

            <label class="analytics-select-field analytics-select-field--workspace">
              <span>工作区</span>
              <UiSelect :model-value="filters.workspaceId" :options="workspaceFilterOptions" :disabled="optionsLoading" aria-label="工作区" @change="value => handleWorkspaceChange(normalizeSelectValue(value))" />
            </label>

            <details class="analytics-advanced-filter">
              <summary>
                <span>高级筛选</span>
                <span class="material-symbols-outlined">expand_more</span>
              </summary>

              <div class="analytics-advanced-filter__content">
                <label class="analytics-select-field">
                  <span>项目</span>
                  <UiSelect :model-value="filters.projectId" :options="projectFilterOptions" :disabled="optionsLoading" aria-label="项目" @change="value => handleProjectChange(normalizeSelectValue(value))" />
                </label>

                <label class="analytics-select-field">
                  <span>竞赛</span>
                  <UiSelect :model-value="filters.contestId" :options="contestFilterOptions" :disabled="optionsLoading" aria-label="竞赛" @change="value => handleContestChange(normalizeSelectValue(value))" />
                </label>
              </div>
            </details>
          </div>

          <div class="analytics-filter-summary">
            <div class="analytics-meta">
              <span>更新时间：{{ lastUpdatedText }}</span>
            </div>
          </div>

          <div v-if="optionsLoading || optionsError" class="analytics-filter-status">
            <p v-if="optionsLoading">
              正在加载筛选项...
            </p>
            <p v-if="optionsError" class="analytics-error-text">
              {{ optionsError }}
            </p>
          </div>
        </div>

        <aside class="analytics-filter-visual" aria-hidden="true">
          <img :src="analyticsFilterAssetUrl" alt="">
        </aside>
      </div>
    </section>

    <section v-if="overviewLoading" class="analytics-state analytics-state--loading">
      正在加载综合分析总览...
    </section>

    <section v-if="overviewError" class="analytics-state analytics-state--error">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <span>{{ overviewError }}</span>
        <button class="font-semibold hover:underline" type="button" @click="handleRetry">
          重新加载
        </button>
      </div>
    </section>

    <section class="analytics-metric-grid">
      <article
        v-for="item in metricCardsWithView"
        :key="item.id"
        :class="item.cardClass"
      >
        <div class="analytics-metric-card__content">
          <div class="analytics-metric-card__label">
            {{ item.label }}
          </div>
          <div class="analytics-metric-card__value">
            {{ item.value }}
          </div>
          <p class="analytics-metric-card__help">
            {{ item.helpText }}
          </p>
        </div>
        <div class="analytics-metric-card__media" aria-hidden="true">
          <img :src="item.assetUrl" alt="">
        </div>
      </article>
    </section>

    <section class="analytics-signal-grid">
      <article
        v-for="item in highlightCards"
        :key="item.id"
        class="analytics-signal-card"
        :class="`analytics-signal-card--${item.tone}`"
      >
        <div class="analytics-signal-card__head">
          <span class="material-symbols-outlined">{{ item.icon }}</span>
          <span>{{ item.title }}</span>
        </div>
        <div class="analytics-signal-card__value">
          {{ item.value }}
        </div>
        <p class="analytics-signal-card__desc">
          {{ item.desc }}
        </p>
      </article>
    </section>

    <section class="analytics-detail-layout">
      <div class="analytics-detail-panel">
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <div class="analytics-section-label">
              详细分析
            </div>
            <h3 class="analytics-detail-panel__title">
              {{ activeViewLabel }}
            </h3>
            <p class="analytics-detail-panel__summary">
              {{ activeSummary }}
            </p>
          </div>

          <div class="analytics-view-tabs">
            <button
              v-for="item in viewOptions"
              :key="item.value"
              class="analytics-view-tab"
              :class="{ 'analytics-view-tab--active': activeView === item.value }"
              type="button"
              @click="handleViewChange(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div v-if="detailLoading" class="analytics-state analytics-state--loading mt-5">
          正在加载 {{ activeViewLabel }}...
        </div>

        <div v-else-if="detailError" class="analytics-state analytics-state--error mt-5">
          <div class="flex flex-wrap gap-3 items-center justify-between">
            <span>{{ detailError }}</span>
            <button class="font-semibold hover:underline" type="button" @click="handleRetry">
              重新加载
            </button>
          </div>
        </div>

        <div v-else-if="activeView === 'overview'" class="analytics-overview-grid">
          <article class="analytics-chart-panel analytics-chart-panel--trend">
            <div class="analytics-panel-head">
              <div>
                <div class="analytics-section-label">
                  趋势热点
                </div>
                <h4>样本热度曲线</h4>
              </div>
              <span>{{ overview.trendSeries.points.length }} 个方向</span>
            </div>

            <div class="analytics-trend-visual" aria-hidden="true">
              <img :src="analyticsOverviewTrendAssetUrl" alt="">
            </div>

            <div class="analytics-trend-list">
              <div
                v-for="item in overview.trendSeries.points.slice(0, 4)"
                :key="item.label"
                class="analytics-row-card"
              >
                <div class="analytics-row-card__head">
                  <span>{{ item.label }}</span>
                  <strong>热度 {{ item.heatScore }}</strong>
                </div>
                <p>{{ item.summary }}</p>
              </div>
            </div>
          </article>

          <article class="analytics-chart-panel">
            <div class="analytics-panel-head">
              <div>
                <div class="analytics-section-label">
                  能力画像
                </div>
                <h4>当前能力分布</h4>
              </div>
              <span>{{ capabilityPreviewItems.length }} 项</span>
            </div>

            <div class="analytics-capability-list">
              <div v-for="item in capabilityPreviewItems" :key="item.key" class="analytics-capability-item">
                <div class="analytics-capability-item__head">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.score }}</strong>
                </div>
                <div class="analytics-capability-bar">
                  <span :style="{ width: `${clampPercent(item.score)}%` }" />
                </div>
              </div>
            </div>
          </article>

          <article class="analytics-chart-panel">
            <div class="analytics-panel-head">
              <div>
                <div class="analytics-section-label">
                  获奖特征
                </div>
                <h4>高频特征速览</h4>
              </div>
              <span>{{ awardPreviewItems.length }} 项</span>
            </div>

            <div class="analytics-feature-chip-grid">
              <div v-for="item in awardPreviewItems" :key="item.label" class="analytics-feature-chip">
                <div class="analytics-feature-chip__head">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.weight }}</strong>
                </div>
                <p>{{ item.description }}</p>
              </div>
            </div>
          </article>

          <article class="analytics-chart-panel">
            <div class="analytics-panel-head">
              <div>
                <div class="analytics-section-label">
                  备赛节奏
                </div>
                <h4>近期节点</h4>
              </div>
              <span>{{ timelinePreviewItems.length }} 个</span>
            </div>

            <div class="analytics-mini-timeline">
              <div v-for="item in timelinePreviewItems" :key="item.id" class="analytics-mini-timeline__item">
                <div>
                  <span>{{ phaseLabel(item.phase) }}</span>
                  <strong>{{ item.label }}</strong>
                </div>
                <em>{{ item.timeText }}</em>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'trends'" class="mt-5 gap-3 grid lg:grid-cols-2">
          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              热门技术关键词
            </h4>
            <div class="mt-4 space-y-4">
              <div
                v-for="item in trendAnalysis.keywordSeries.points"
                :key="item.label"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex gap-3 items-center justify-between">
                  <div>
                    <div class="text-slate-900 font-semibold">
                      {{ item.label }}
                    </div>
                    <div class="text-xs text-slate-500 mt-1">
                      覆盖 {{ item.contestCount }} 个竞赛 · 最近 {{ item.latestYear || '--' }}
                    </div>
                  </div>
                  <div class="text-lg text-slate-950 font-bold">
                    {{ item.heatScore }}
                  </div>
                </div>
                <div class="mt-3 rounded-full bg-slate-100 h-2 overflow-hidden">
                  <div
                    class="rounded-full h-full from-sky-500 to-blue-700 bg-gradient-to-r"
                    :style="{ width: `${item.heatScore}%` }"
                  />
                </div>
              </div>
            </div>
          </article>

          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              热度领先竞赛
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in trendAnalysis.contests"
                :key="item.contestId"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex gap-3 items-start justify-between">
                  <div class="min-w-0">
                    <div class="text-slate-900 font-semibold">
                      {{ item.contestName }}
                    </div>
                    <p class="text-sm text-slate-600 leading-6 mt-2">
                      {{ item.signalSummary }}
                    </p>
                  </div>
                  <span class="text-sm text-white font-bold px-2.5 py-1.5 rounded-lg bg-slate-900">
                    {{ item.hotScore }}
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <span
                    v-for="keyword in item.topKeywords"
                    :key="`${item.contestId}-${keyword}`"
                    class="text-xs text-slate-700 font-semibold px-3 py-1 rounded-full bg-slate-100"
                  >
                    {{ keyword }}
                  </span>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'awards'" class="mt-5 space-y-3">
          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              高频获奖特征
            </h4>
            <div class="mt-4 gap-3 grid md:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="item in awardAnalysis.featureTags"
                :key="item.label"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex gap-3 items-center justify-between">
                  <span class="text-slate-900 font-semibold">{{ item.label }}</span>
                  <span class="text-[10px] text-white font-semibold px-2.5 py-1 rounded-full bg-slate-900">{{ item.weight }}</span>
                </div>
                <p class="text-sm text-slate-600 leading-6 mt-3">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </article>

          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              样本案例
            </h4>
            <div class="mt-4 gap-3 grid lg:grid-cols-2">
              <div
                v-for="item in awardAnalysis.samples"
                :key="`${item.source}-${item.title}`"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex gap-3 items-start justify-between">
                  <div>
                    <div class="text-slate-900 font-semibold">
                      {{ item.title }}
                    </div>
                    <div class="text-xs text-slate-500 mt-1">
                      {{ item.source }}
                    </div>
                  </div>
                  <span class="text-xs text-slate-700 font-semibold px-3 py-1 rounded-full bg-slate-100">
                    {{ sampleStatusLabel(item.status) }}
                  </span>
                </div>
                <p class="text-sm text-slate-600 leading-6 mt-3">
                  {{ item.summary }}
                </p>
                <div class="text-xs text-slate-500 mt-3">
                  综合评分 {{ item.score }}
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'profile'" class="mt-5 gap-3 grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              能力雷达
            </h4>
            <div class="mt-4 space-y-4">
              <div v-for="item in profileAnalysis.radar" :key="item.key">
                <div class="text-sm mb-2 flex gap-3 items-center justify-between">
                  <span class="text-slate-800 font-semibold">{{ item.label }}</span>
                  <span class="text-slate-950 font-bold">{{ item.score }}</span>
                </div>
                <div class="rounded-full bg-white h-2 overflow-hidden">
                  <div
                    class="rounded-full h-full from-blue-600 to-emerald-500 bg-gradient-to-r"
                    :style="{ width: `${item.score}%` }"
                  />
                </div>
                <p class="text-xs text-slate-500 leading-5 mt-2">
                  {{ item.evidence }}
                </p>
              </div>
            </div>
            <div class="mt-5 space-y-2">
              <div
                v-for="(item, index) in profileAnalysis.gapNotes"
                :key="`${index}-${item}`"
                class="text-sm text-slate-600 leading-6 p-3 rounded-lg bg-white"
              >
                {{ item }}
              </div>
            </div>
          </article>

          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              项目匹配度
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in profileAnalysis.projects"
                :key="item.projectId"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex flex-wrap gap-3 items-start justify-between">
                  <div>
                    <div class="text-slate-900 font-semibold">
                      {{ item.title }}
                    </div>
                    <div class="text-xs text-slate-500 mt-2 flex flex-wrap gap-2">
                      <span>院校 {{ item.collegeCount }}</span>
                      <span>导师 {{ item.advisorCount }}</span>
                      <span>交付物 {{ item.deliverableCount }}</span>
                    </div>
                  </div>
                  <div class="text-xs text-slate-500 text-right">
                    <div>团队匹配 {{ item.averageTeamMatch }}</div>
                    <div class="mt-1">
                      题目契合 {{ item.averageContestFit }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'difficulty'" class="mt-5 gap-3 grid xl:grid-cols-[minmax(0,1fr)_300px]">
          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <div class="flex flex-wrap gap-3 items-center justify-between">
              <h4 class="text-slate-950 font-bold">
                题目难度与完成率
              </h4>
              <div class="text-xs text-slate-500">
                当前范围 {{ difficultyAnalysis.tracks.length }} 个题目方向
              </div>
            </div>

            <div v-if="difficultyAnalysis.tracks.length > 0" class="mt-4 space-y-3">
              <div
                v-for="item in difficultyAnalysis.tracks"
                :key="`${item.contestId}-${item.trackId}`"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex flex-wrap gap-3 items-start justify-between">
                  <div class="min-w-0">
                    <div class="text-slate-900 font-semibold">
                      {{ item.trackName }}
                    </div>
                    <div class="text-xs text-slate-500 mt-1">
                      {{ item.contestName }}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-lg text-slate-950 font-bold">
                      {{ item.difficultyScore }}
                    </div>
                    <span class="text-xs font-semibold px-3 py-1 rounded-full" :class="difficultyLevelClasses(item.difficultyLevel)">
                      {{ item.difficultyLevel === 'advanced' ? '高难度' : (item.difficultyLevel === 'challenging' ? '进阶' : '均衡') }}
                    </span>
                  </div>
                </div>

                <div class="mt-4 gap-3 grid md:grid-cols-3">
                  <div class="p-3 rounded-lg bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      完成率
                    </div>
                    <div class="text-xl text-slate-950 font-bold mt-2">
                      {{ item.completionRate }}%
                    </div>
                    <div class="mt-3 rounded-full bg-slate-200 h-2 overflow-hidden">
                      <div
                        class="rounded-full h-full from-emerald-500 to-sky-500 bg-gradient-to-r"
                        :style="{ width: `${item.completionRate}%` }"
                      />
                    </div>
                  </div>

                  <div class="p-3 rounded-lg bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      规则复杂度
                    </div>
                    <div class="text-xl text-slate-950 font-bold mt-2">
                      {{ item.rubricDimensionCount + item.evidenceRequirementCount }}
                    </div>
                    <div class="text-xs text-slate-500 mt-2">
                      维度 {{ item.rubricDimensionCount }} · 证据要求 {{ item.evidenceRequirementCount }}
                    </div>
                  </div>

                  <div class="p-3 rounded-lg bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      工作量压力
                    </div>
                    <div class="text-xl text-slate-950 font-bold mt-2">
                      {{ item.workloadPressure }}
                    </div>
                    <div class="text-xs text-slate-500 mt-2">
                      交付物 {{ item.deliverableCount }} · 时间节点 {{ item.milestoneCount }}
                    </div>
                  </div>
                </div>

                <p class="text-sm text-slate-600 leading-6 mt-4">
                  {{ item.summary }}
                </p>

                <div class="text-xs text-slate-500 mt-4 flex flex-wrap gap-3">
                  <span>样本项目 {{ item.sampleProjectCount }}</span>
                  <span>已完成 {{ item.completedProjectCount }}</span>
                  <span>进行中 {{ item.inProgressProjectCount }}</span>
                  <span>草稿 {{ item.draftProjectCount }}</span>
                </div>
              </div>
            </div>

            <div v-else class="text-sm text-slate-500 leading-6 mt-4 p-4 rounded-xl bg-white">
              当前范围内还没有可用于估算题目难度的赛道样本，建议先补齐项目与竞赛绑定。
            </div>
          </article>

          <div class="space-y-4">
            <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                项目进度分布
              </h4>
              <div class="mt-4 space-y-3">
                <div v-for="item in difficultyAnalysis.statusStats" :key="item.status">
                  <div class="text-sm mb-2 flex gap-3 items-center justify-between">
                    <span class="text-slate-800 font-semibold">{{ item.label }}</span>
                    <span class="text-slate-950 font-bold">{{ item.count }}</span>
                  </div>
                  <div class="rounded-full bg-white h-2 overflow-hidden">
                    <div
                      class="rounded-full h-full from-slate-800 to-slate-500 bg-gradient-to-r"
                      :style="{ width: `${Math.min(item.count * 18, 100)}%` }"
                    />
                  </div>
                  <div class="text-xs text-slate-500 mt-2">
                    {{ projectStatusLabel(item.status) }}
                  </div>
                </div>
              </div>
            </article>

            <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                常见卡点
              </h4>
              <div class="mt-4 space-y-3">
                <div
                  v-for="item in difficultyAnalysis.bottlenecks"
                  :key="item.id"
                  class="p-3.5 border rounded-xl"
                  :class="bottleneckSeverityClasses(item.severity)"
                >
                  <div class="flex gap-3 items-center justify-between">
                    <div class="font-semibold">
                      {{ item.label }}
                    </div>
                    <div class="text-xs font-semibold">
                      {{ item.affectedProjectCount }} 个项目
                    </div>
                  </div>
                  <p class="text-sm leading-6 mt-2 opacity-90">
                    {{ item.description }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div v-else-if="activeView === 'preparation'" class="mt-5 gap-3 grid lg:grid-cols-[minmax(0,1fr)_300px]">
          <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              备赛时间轴
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in preparationAnalysis.timeline"
                :key="item.id"
                class="p-3.5 rounded-lg bg-white"
              >
                <div class="flex flex-wrap gap-3 items-center justify-between">
                  <div class="text-slate-900 font-semibold">
                    {{ item.label }}
                  </div>
                  <div class="text-xs text-slate-600 font-semibold">
                    {{ item.timeText }}
                  </div>
                </div>
                <div class="text-xs text-slate-500 mt-2 flex flex-wrap gap-2 items-center">
                  <span>{{ item.source }}</span>
                  <span>·</span>
                  <span>{{ phaseLabel(item.phase) }}</span>
                  <span class="font-semibold px-2.5 py-1 rounded-full" :class="intensityClasses(item.intensity)">
                    {{ item.intensity }}
                  </span>
                </div>
              </div>
            </div>
          </article>

          <div class="space-y-4">
            <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                阶段分布
              </h4>
              <div class="mt-4 space-y-3">
                <div v-for="item in preparationAnalysis.stageStats" :key="item.phase">
                  <div class="text-sm mb-2 flex gap-3 items-center justify-between">
                    <span class="text-slate-800 font-semibold">{{ phaseLabel(item.phase) }}</span>
                    <span class="text-slate-950 font-bold">{{ item.count }}</span>
                  </div>
                  <div class="rounded-full bg-white h-2 overflow-hidden">
                    <div
                      class="rounded-full h-full from-indigo-500 to-sky-500 bg-gradient-to-r"
                      :style="{ width: `${Math.min(item.count * 18, 100)}%` }"
                    />
                  </div>
                </div>
              </div>
            </article>

            <article class="p-4 border border-slate-200 rounded-xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                即将到来的节点
              </h4>
              <div class="mt-4 space-y-3">
                <div
                  v-for="item in preparationAnalysis.upcomingContests"
                  :key="`${item.contestId}-${item.stage}`"
                  class="p-3.5 rounded-lg bg-white"
                >
                  <div class="text-slate-900 font-semibold">
                    {{ item.contestName }}
                  </div>
                  <div class="text-xs text-slate-500 mt-2">
                    {{ item.stage }} · {{ item.deadlineText }}
                  </div>
                  <div class="mt-3">
                    <span class="text-xs font-semibold px-3 py-1 rounded-full" :class="intensityClasses(item.intensity)">
                      {{ item.intensity }}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>

      <aside class="analytics-aside">
        <section class="analytics-side-card">
          <h3>
            当前建议
          </h3>
          <p>
            {{ activeAdviceText }}
          </p>
        </section>

        <section class="analytics-side-card analytics-side-card--warning">
          <h3>
            数据缺口提示
          </h3>
          <div class="analytics-gap-list">
            <article
              v-for="item in activeDataGaps"
              :key="item.id"
              :class="gapToneClasses(item.level)"
            >
              <span class="material-symbols-outlined">{{ item.level === 'critical' ? 'priority_high' : 'info' }}</span>
              <div>
                <div class="analytics-gap-card__title">
                  {{ item.title }}
                </div>
                <p>{{ item.description }}</p>
              </div>
            </article>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.analytics-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  color: #0f172a;
}

.analytics-hero,
.analytics-detail-panel,
.analytics-side-card,
.analytics-state {
  border: 1px solid #dde6f2;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: none;
}

.analytics-hero {
  border-radius: 10px;
  overflow: visible;
  background:
    radial-gradient(circle at 86% 0%, rgba(37, 99, 235, 0.08), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.analytics-hero__top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 22px 10px;
}

.analytics-hero__copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.analytics-meta,
.analytics-view-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.analytics-hero__title {
  margin: 0;
  color: #0b1225;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.22;
  letter-spacing: 0;
}

.analytics-detail-panel__summary,
.analytics-side-card p,
.analytics-row-card p,
.analytics-signal-card__desc,
.analytics-gap-card p,
.analytics-feature-chip p {
  color: #5b6b84;
  font-size: 14px;
  line-height: 1.72;
}

.analytics-meta {
  color: #64748b;
  font-size: 12px;
}

.analytics-hero__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px;
  gap: 12px;
  align-items: center;
  padding: 0 22px 16px;
}

.analytics-filter-panel {
  display: grid;
  align-content: start;
  gap: 10px;
}

.analytics-filter-row {
  display: grid;
  grid-template-columns: 180px 280px auto;
  gap: 10px;
  align-items: end;
  justify-content: start;
}

.analytics-section-label {
  color: #52627a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.analytics-view-tab {
  border: 1px solid #dce6f4;
  border-radius: 999px;
  background: #ffffff;
  color: #52627a;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.analytics-view-tab--active {
  border-color: #2563eb;
  background: linear-gradient(135deg, #2563eb 0%, #5b7cff 100%);
  box-shadow: none;
  color: #ffffff;
}

.analytics-select-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.analytics-select-field span {
  color: #52627a;
  font-size: 12px;
  font-weight: 800;
}

.analytics-select-field select {
  width: 100%;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid #dce6f4;
  border-radius: 7px;
  outline: none;
  background: #ffffff;
  color: #1e293b;
  font-size: 14px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.analytics-select-field select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.analytics-select-field--range {
  width: 180px;
}

.analytics-select-field--workspace {
  width: 280px;
}

.analytics-advanced-filter {
  position: relative;
  min-width: 108px;
}

.analytics-advanced-filter summary {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #dce6f4;
  border-radius: 7px;
  background: #ffffff;
  color: #1e293b;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  list-style: none;
}

.analytics-advanced-filter summary::-webkit-details-marker {
  display: none;
}

.analytics-advanced-filter summary .material-symbols-outlined {
  font-size: 18px;
  transition: transform 160ms ease;
}

.analytics-advanced-filter[open] summary .material-symbols-outlined {
  transform: rotate(180deg);
}

.analytics-advanced-filter__content {
  position: absolute;
  z-index: 5;
  right: 0;
  top: calc(100% + 6px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: min(520px, calc(100vw - 48px));
  padding: 12px;
  border: 1px solid #dce6f4;
  border-radius: 8px;
  background: #ffffff;
}

.analytics-filter-summary {
  display: grid;
  padding-top: 0;
}

.analytics-filter-status {
  color: #64748b;
  font-size: 12px;
}

.analytics-filter-status p {
  margin: 0;
}

.analytics-error-text {
  color: #e11d48;
}

.analytics-filter-visual {
  display: flex;
  position: relative;
  align-items: center;
  align-self: center;
  justify-content: center;
  min-height: 104px;
}

.analytics-filter-visual img {
  display: block;
  width: 150px;
  max-width: 100%;
  max-height: 112px;
  object-fit: contain;
}

.analytics-state {
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}

.analytics-state--loading {
  color: #64748b;
}

.analytics-state--error {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #be123c;
}

.analytics-metric-grid,
.analytics-signal-grid {
  display: grid;
  gap: 10px;
}

.analytics-metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.analytics-signal-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.analytics-metric-card,
.analytics-signal-card,
.analytics-chart-panel {
  position: relative;
  border: 1px solid #dde6f2;
  border-radius: 9px;
  background: #ffffff;
  overflow: hidden;
}

.analytics-metric-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 118px;
  gap: 10px;
  min-height: 96px;
  padding: 14px;
  box-shadow: none;
}

.analytics-metric-card--blue {
  color: #2563eb;
}

.analytics-metric-card--emerald {
  color: #059669;
}

.analytics-metric-card--amber {
  color: #d97706;
}

.analytics-metric-card--violet {
  color: #6d5bd0;
}

.analytics-metric-card__content {
  min-width: 0;
}

.analytics-metric-card__label {
  font-size: 12px;
  font-weight: 800;
}

.analytics-metric-card__value {
  margin-top: 6px;
  color: #0f172a;
  font-size: 24px;
  font-weight: 850;
  line-height: 1;
}

.analytics-metric-card__help {
  margin: 7px 0 0;
  color: color-mix(in srgb, currentColor 72%, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.analytics-metric-card__media {
  display: flex;
  align-self: center;
  justify-content: flex-end;
  min-width: 0;
}

.analytics-metric-card__media img {
  display: block;
  width: 112px;
  max-width: 100%;
  height: 78px;
  object-fit: contain;
}

.analytics-signal-card {
  padding: 14px;
  min-width: 0;
}

.analytics-signal-card::after {
  position: absolute;
  right: 14px;
  bottom: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: currentColor;
  content: '';
  opacity: 0.08;
}

.analytics-signal-card--blue {
  color: #2563eb;
}

.analytics-signal-card--emerald {
  color: #059669;
}

.analytics-signal-card--violet {
  color: #6d5bd0;
}

.analytics-signal-card--amber {
  color: #d97706;
}

.analytics-signal-card__head {
  display: flex;
  gap: 6px;
  align-items: center;
  color: #475569;
  font-size: 12px;
  font-weight: 800;
}

.analytics-signal-card__head .material-symbols-outlined {
  color: currentColor;
  font-size: 18px;
}

.analytics-signal-card__value {
  margin-top: 9px;
  color: #0f172a;
  font-size: 18px;
  font-weight: 850;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.analytics-signal-card__desc {
  margin: 6px 0 0;
}

.analytics-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 10px;
  align-items: start;
}

.analytics-detail-panel {
  border-radius: 10px;
  padding: 14px;
}

.analytics-detail-panel__title {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 20px;
  font-weight: 850;
  line-height: 1.25;
}

.analytics-detail-panel__summary {
  max-width: 720px;
  margin: 6px 0 0;
}

.analytics-view-tab {
  min-height: 30px;
  padding: 0 10px;
}

.analytics-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.85fr);
  gap: 10px;
  margin-top: 14px;
}

.analytics-chart-panel {
  padding: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.analytics-chart-panel--trend {
  min-height: 320px;
}

.analytics-panel-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.analytics-panel-head h4 {
  margin: 6px 0 0;
  color: #0f172a;
  font-size: 15px;
  font-weight: 850;
}

.analytics-panel-head > span {
  border-radius: 999px;
  padding: 5px 8px;
  background: #eef4ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.analytics-trend-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  margin-top: 10px;
  background: transparent;
  overflow: hidden;
}

.analytics-trend-visual img {
  display: block;
  width: min(100%, 300px);
  height: 100%;
  object-fit: contain;
}

.analytics-trend-list,
.analytics-capability-list,
.analytics-gap-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.analytics-row-card {
  border: 1px solid #e8eef8;
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
  min-width: 0;
}

.analytics-row-card__head,
.analytics-capability-item__head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.analytics-row-card__head span,
.analytics-capability-item__head span {
  color: #1f2937;
  font-size: 14px;
  font-weight: 800;
  min-width: 0;
  overflow-wrap: anywhere;
}

.analytics-row-card__head strong {
  color: #2563eb;
  font-size: 12px;
}

.analytics-row-card p {
  margin: 6px 0 0;
}

.analytics-capability-item {
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
  min-width: 0;
}

.analytics-capability-item__head strong {
  color: #0f172a;
  font-size: 14px;
}

.analytics-capability-bar {
  height: 7px;
  margin-top: 8px;
  border-radius: 999px;
  background: #eef2f7;
  overflow: hidden;
}

.analytics-capability-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6b8cff 0%, #86d6c4 100%);
}

.analytics-aside {
  position: sticky;
  top: 10px;
  display: grid;
  gap: 10px;
}

.analytics-side-card {
  border-radius: 10px;
  padding: 14px;
}

.analytics-side-card--warning {
  background: linear-gradient(180deg, #ffffff 0%, #fffaf2 100%);
}

.analytics-side-card h3 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  font-weight: 850;
}

.analytics-side-card p {
  margin: 7px 0 0;
}

.analytics-gap-card {
  display: flex;
  gap: 8px;
  border: 1px solid;
  border-radius: 8px;
  padding: 10px;
  min-width: 0;
}

.analytics-gap-card .material-symbols-outlined {
  margin-top: 1px;
  font-size: 18px;
}

.analytics-gap-card--critical {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #be123c;
}

.analytics-gap-card--warning {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.analytics-gap-card--info {
  border-color: #dce6f4;
  background: #f8fafc;
  color: #475569;
}

.analytics-gap-card__title {
  font-size: 14px;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.analytics-gap-card p {
  margin: 6px 0 0;
  color: color-mix(in srgb, currentColor 76%, #334155);
}

.analytics-feature-chip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.analytics-feature-chip {
  min-width: 0;
  border: 1px solid #e8eef8;
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
}

.analytics-feature-chip__head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.analytics-feature-chip__head span {
  min-width: 0;
  color: #1f2937;
  font-size: 14px;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.analytics-feature-chip__head strong {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 4px 7px;
  background: #0f172a;
  color: #ffffff;
  font-size: 11px;
  font-weight: 850;
}

.analytics-feature-chip p {
  margin: 6px 0 0;
}

.analytics-mini-timeline {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.analytics-mini-timeline__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  border: 1px solid #e8eef8;
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
}

.analytics-mini-timeline__item div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.analytics-mini-timeline__item span {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.analytics-mini-timeline__item strong {
  color: #0f172a;
  font-size: 14px;
  font-weight: 850;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.analytics-mini-timeline__item em {
  color: #2563eb;
  font-size: 12px;
  font-style: normal;
  font-weight: 850;
  white-space: nowrap;
}

.analytics-detail-panel
  :where(.min-w-0, h4, .text-slate-900, .text-slate-950, .text-slate-800, .text-slate-700, .text-slate-600) {
  overflow-wrap: anywhere;
}

@media (max-width: 1280px) {
  .analytics-metric-grid,
  .analytics-signal-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-hero__filters,
  .analytics-detail-layout {
    grid-template-columns: 1fr;
  }

  .analytics-filter-visual {
    display: none;
  }

  .analytics-aside {
    position: static;
  }
}

@media (max-width: 900px) {
  .analytics-page {
    padding: 10px;
  }

  .analytics-hero__top {
    flex-direction: column;
    padding: 16px 14px 8px;
  }

  .analytics-hero__filters {
    padding: 0 14px 14px;
  }

  .analytics-filter-row,
  .analytics-overview-grid,
  .analytics-feature-chip-grid {
    grid-template-columns: 1fr;
  }

  .analytics-select-field--range,
  .analytics-select-field--workspace {
    width: 100%;
  }

  .analytics-advanced-filter__content {
    position: static;
    grid-template-columns: 1fr;
    width: 100%;
    margin-top: 6px;
  }

  .analytics-metric-card {
    grid-template-columns: minmax(0, 1fr) 104px;
  }

  .analytics-metric-card__media img {
    width: 96px;
    height: 72px;
  }

  .analytics-mini-timeline__item {
    grid-template-columns: 1fr;
  }

  .analytics-mini-timeline__item em {
    white-space: normal;
  }
}

@media (max-width: 640px) {
  .analytics-metric-grid,
  .analytics-signal-grid {
    grid-template-columns: 1fr;
  }

  .analytics-hero__title {
    font-size: 22px;
  }

  .analytics-detail-panel {
    padding: 12px;
  }
}
</style>
