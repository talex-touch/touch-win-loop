<script setup lang="ts">
import type {
  AnalyticsAwardSampleStatus,
  AnalyticsDetailView,
  AnalyticsDifficultyLevel,
  AnalyticsDifficultySeverity,
  AnalyticsGapLevel,
  AnalyticsMetricTone,
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

function metricToneClasses(tone: AnalyticsMetricTone): string {
  if (tone === 'emerald')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'amber')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  if (tone === 'violet')
    return 'border-violet-200 bg-violet-50 text-violet-700'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function gapToneClasses(level: AnalyticsGapLevel): string {
  if (level === 'critical')
    return 'border-rose-200 bg-rose-50 text-rose-700'
  if (level === 'warning')
    return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
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

function resolveOptionLabel(
  options: Array<{ value: string, label: string }>,
  value: string,
  fallback: string,
): string {
  return options.find(item => item.value === value)?.label || fallback
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

const activeFilterTags = computed(() => {
  const items: Array<{ key: string, label: string, value: string }> = []
  if (filters.workspaceId) {
    items.push({
      key: 'workspace',
      label: '工作区',
      value: resolveOptionLabel(workspaceOptions.value, filters.workspaceId, filters.workspaceId),
    })
  }
  if (filters.projectId) {
    items.push({
      key: 'project',
      label: '项目',
      value: resolveOptionLabel(projectOptions.value, filters.projectId, filters.projectId),
    })
  }
  if (filters.contestId) {
    items.push({
      key: 'contest',
      label: '竞赛',
      value: resolveOptionLabel(contestOptions.value, filters.contestId, filters.contestId),
    })
  }
  return items
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
      value: trend?.label || '待沉淀',
      desc: trend ? `覆盖 ${trend.contestCount} 个竞赛，热度 ${trend.heatScore}` : '当前范围内还没有稳定趋势样本。',
    },
    {
      id: 'feature',
      title: '高频特征',
      value: feature?.label || '待沉淀',
      desc: feature ? `${feature.evidenceCount} 条样本重复出现` : '当前范围内还没有稳定共性特征。',
    },
    {
      id: 'radar',
      title: '优势维度',
      value: radar?.label || '待评估',
      desc: radar ? `当前评估得分 ${radar.score}` : '能力画像需要更多题目对比板样本。',
    },
    {
      id: 'timeline',
      title: '最近节点',
      value: timeline?.label || '待补充',
      desc: timeline ? `${timeline.timeText} · ${timeline.source}` : '当前范围内暂无备赛节点。',
    },
  ]
})

async function handleRangePresetChange(value: typeof filters.rangePreset) {
  if (filters.rangePreset === value)
    return

  await setRangePreset(value)
  void trackEvent('analytics_range_changed', { rangePreset: value }, 'filter_change')
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
  <div class="space-y-6">
    <section class="border border-slate-200 rounded-[28px] bg-white shadow-sm overflow-hidden">
      <div class="p-6 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.12),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.10),_transparent_32%)] lg:p-8">
        <div class="flex flex-wrap gap-4 items-start justify-between">
          <div class="space-y-3">
            <div class="text-xs flex flex-wrap gap-2">
              <span class="text-white font-semibold px-3 py-1 rounded-full bg-slate-900">综合数据分析</span>
              <span class="text-slate-700 font-semibold px-3 py-1 rounded-full bg-slate-100">M2 持续扩展</span>
            </div>
            <div>
              <h2 class="text-3xl text-slate-950 tracking-tight font-extrabold">
                竞赛、作品与行为数据一体化分析
              </h2>
              <p class="text-sm text-slate-600 leading-6 mt-2 max-w-3xl">
                {{ overview.scopeSummary }}
              </p>
            </div>
            <div class="text-xs text-slate-500 flex flex-wrap gap-3">
              <span>更新时间：{{ lastUpdatedText }}</span>
              <span>分析窗口：{{ rangeOptions.find(item => item.value === filters.rangePreset)?.label || filters.rangePreset }}</span>
              <span>当前视图：{{ viewOptions.find(item => item.value === activeView)?.label || activeView }}</span>
            </div>
          </div>

          <NuxtLink
            to="/dashboard"
            class="text-sm text-slate-700 font-semibold px-4 py-2 border border-slate-200 rounded-xl bg-white transition-colors hover:bg-slate-50"
          >
            返回 Dashboard
          </NuxtLink>
        </div>

        <div class="mt-6 gap-4 grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div class="space-y-4">
            <div>
              <div class="text-xs text-slate-500 tracking-[0.24em] font-semibold mb-3 uppercase">
                时间范围
              </div>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="item in rangeOptions"
                  :key="item.value"
                  class="text-xs font-semibold px-3 py-2 border rounded-full transition-colors"
                  :class="filters.rangePreset === item.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                  @click="handleRangePresetChange(item.value)"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div class="gap-3 grid md:grid-cols-3">
              <label class="block">
                <span class="text-xs text-slate-500 tracking-[0.18em] font-semibold mb-2 block uppercase">工作区</span>
                <select
                  :value="filters.workspaceId"
                  class="text-sm text-slate-700 px-3 outline-none border border-slate-200 rounded-xl bg-white min-h-[42px] w-full transition-colors focus:border-blue-500"
                  :disabled="optionsLoading"
                  @change="handleWorkspaceChange(String(($event.target as HTMLSelectElement).value || ''))"
                >
                  <option value="">
                    全部工作区
                  </option>
                  <option v-for="item in workspaceOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-xs text-slate-500 tracking-[0.18em] font-semibold mb-2 block uppercase">项目</span>
                <select
                  :value="filters.projectId"
                  class="text-sm text-slate-700 px-3 outline-none border border-slate-200 rounded-xl bg-white min-h-[42px] w-full transition-colors focus:border-blue-500"
                  :disabled="optionsLoading"
                  @change="handleProjectChange(String(($event.target as HTMLSelectElement).value || ''))"
                >
                  <option value="">
                    全部项目
                  </option>
                  <option v-for="item in projectOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>

              <label class="block">
                <span class="text-xs text-slate-500 tracking-[0.18em] font-semibold mb-2 block uppercase">竞赛</span>
                <select
                  :value="filters.contestId"
                  class="text-sm text-slate-700 px-3 outline-none border border-slate-200 rounded-xl bg-white min-h-[42px] w-full transition-colors focus:border-blue-500"
                  :disabled="optionsLoading"
                  @change="handleContestChange(String(($event.target as HTMLSelectElement).value || ''))"
                >
                  <option value="">
                    全部竞赛
                  </option>
                  <option v-for="item in contestOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
            </div>
          </div>

          <div class="p-4 border border-slate-200 rounded-2xl bg-slate-50">
            <div class="text-xs text-slate-500 tracking-[0.24em] font-semibold mb-3 uppercase">
              当前筛选
            </div>
            <div v-if="activeFilterTags.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="item in activeFilterTags"
                :key="item.key"
                class="text-xs text-slate-700 font-semibold px-3 py-1.5 rounded-full bg-white"
              >
                {{ item.label }}：{{ item.value }}
              </span>
            </div>
            <p v-else class="text-sm text-slate-500 leading-6">
              当前使用默认可见范围，适合先看平台总体热度、作品特征和备赛节奏。
            </p>

            <div class="text-xs text-slate-500 mt-3 space-y-2">
              <p v-if="optionsLoading">
                正在加载筛选项...
              </p>
              <p v-if="optionsError" class="text-rose-600">
                {{ optionsError }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="overviewLoading" class="text-sm text-slate-500 p-4 border border-slate-200 rounded-2xl bg-white">
      正在加载综合分析总览...
    </section>

    <section v-if="overviewError" class="text-sm text-rose-700 p-4 border border-rose-200 rounded-2xl bg-rose-50">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <span>{{ overviewError }}</span>
        <button class="font-semibold hover:underline" @click="handleRetry">
          重新加载
        </button>
      </div>
    </section>

    <section class="gap-4 grid md:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="item in overview.metricCards"
        :key="item.id"
        class="p-4 border rounded-2xl"
        :class="metricToneClasses(item.tone)"
      >
        <div class="text-xs tracking-[0.18em] font-semibold uppercase">
          {{ item.label }}
        </div>
        <div class="text-3xl font-extrabold mt-3">
          {{ item.value }}
        </div>
        <p class="text-xs leading-5 mt-2 opacity-90">
          {{ item.helpText }}
        </p>
      </article>
    </section>

    <section class="gap-4 grid xl:grid-cols-4">
      <article
        v-for="item in highlightCards"
        :key="item.id"
        class="p-5 border border-slate-200 rounded-2xl bg-white"
      >
        <div class="text-xs text-slate-500 tracking-[0.18em] font-semibold uppercase">
          {{ item.title }}
        </div>
        <div class="text-2xl text-slate-950 font-bold mt-3">
          {{ item.value }}
        </div>
        <p class="text-sm text-slate-500 leading-6 mt-2">
          {{ item.desc }}
        </p>
      </article>
    </section>

    <section class="gap-6 grid xl:grid-cols-[minmax(0,1fr)_340px]">
      <div class="p-6 border border-slate-200 rounded-[28px] bg-white">
        <div class="flex flex-wrap gap-4 items-start justify-between">
          <div>
            <div class="text-xs text-slate-500 tracking-[0.24em] font-semibold uppercase">
              详细分析
            </div>
            <h3 class="text-2xl text-slate-950 font-bold mt-2">
              {{ viewOptions.find(item => item.value === activeView)?.label || activeView }}
            </h3>
            <p class="text-sm text-slate-600 leading-6 mt-2 max-w-2xl">
              {{ activeSummary }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="item in viewOptions"
              :key="item.value"
              class="text-xs font-semibold px-3 py-2 border rounded-full transition-colors"
              :class="activeView === item.value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
              @click="handleViewChange(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div v-if="detailLoading" class="text-sm text-slate-500 mt-6 p-4 border border-slate-200 rounded-2xl bg-slate-50">
          正在加载 {{ viewOptions.find(item => item.value === activeView)?.label || activeView }}...
        </div>

        <div v-else-if="detailError" class="text-sm text-rose-700 mt-6 p-4 border border-rose-200 rounded-2xl bg-rose-50">
          <div class="flex flex-wrap gap-3 items-center justify-between">
            <span>{{ detailError }}</span>
            <button class="font-semibold hover:underline" @click="handleRetry">
              重新加载
            </button>
          </div>
        </div>

        <div v-else-if="activeView === 'overview'" class="mt-6 gap-4 grid lg:grid-cols-2">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              趋势热点
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in overview.trendSeries.points.slice(0, 4)"
                :key="item.label"
                class="p-4 rounded-xl bg-white"
              >
                <div class="flex gap-3 items-center justify-between">
                  <span class="text-slate-900 font-semibold">{{ item.label }}</span>
                  <span class="text-xs text-blue-700 font-semibold">热度 {{ item.heatScore }}</span>
                </div>
                <p class="text-sm text-slate-600 leading-6 mt-2">
                  {{ item.summary }}
                </p>
              </div>
            </div>
          </article>

          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              能力画像
            </h4>
            <div class="mt-4 space-y-4">
              <div v-for="item in overview.capabilityRadar" :key="item.key">
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
              </div>
            </div>
          </article>
        </div>

        <div v-else-if="activeView === 'trends'" class="mt-6 gap-4 grid lg:grid-cols-2">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              热门技术关键词
            </h4>
            <div class="mt-4 space-y-4">
              <div
                v-for="item in trendAnalysis.keywordSeries.points"
                :key="item.label"
                class="p-4 rounded-xl bg-white"
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

          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              热度领先竞赛
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in trendAnalysis.contests"
                :key="item.contestId"
                class="p-4 rounded-xl bg-white"
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
                  <span class="text-sm text-white font-bold px-3 py-2 rounded-xl bg-slate-900">
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

        <div v-else-if="activeView === 'awards'" class="mt-6 space-y-4">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              高频获奖特征
            </h4>
            <div class="mt-4 gap-3 grid md:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="item in awardAnalysis.featureTags"
                :key="item.label"
                class="p-4 rounded-xl bg-white"
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

          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              样本案例
            </h4>
            <div class="mt-4 gap-3 grid lg:grid-cols-2">
              <div
                v-for="item in awardAnalysis.samples"
                :key="`${item.source}-${item.title}`"
                class="p-4 rounded-xl bg-white"
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

        <div v-else-if="activeView === 'profile'" class="mt-6 gap-4 grid lg:grid-cols-[320px_minmax(0,1fr)]">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
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
                class="text-sm text-slate-600 leading-6 p-3 rounded-xl bg-white"
              >
                {{ item }}
              </div>
            </div>
          </article>

          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              项目匹配度
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in profileAnalysis.projects"
                :key="item.projectId"
                class="p-4 rounded-xl bg-white"
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

        <div v-else-if="activeView === 'difficulty'" class="mt-6 gap-4 grid xl:grid-cols-[minmax(0,1fr)_320px]">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
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
                class="p-4 rounded-xl bg-white"
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
                    <div class="text-xl text-slate-950 font-bold">
                      {{ item.difficultyScore }}
                    </div>
                    <span class="text-xs font-semibold px-3 py-1 rounded-full" :class="difficultyLevelClasses(item.difficultyLevel)">
                      {{ item.difficultyLevel === 'advanced' ? '高难度' : (item.difficultyLevel === 'challenging' ? '进阶' : '均衡') }}
                    </span>
                  </div>
                </div>

                <div class="mt-4 gap-3 grid md:grid-cols-3">
                  <div class="p-3 rounded-xl bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      完成率
                    </div>
                    <div class="text-2xl text-slate-950 font-bold mt-2">
                      {{ item.completionRate }}%
                    </div>
                    <div class="mt-3 rounded-full bg-slate-200 h-2 overflow-hidden">
                      <div
                        class="rounded-full h-full from-emerald-500 to-sky-500 bg-gradient-to-r"
                        :style="{ width: `${item.completionRate}%` }"
                      />
                    </div>
                  </div>

                  <div class="p-3 rounded-xl bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      规则复杂度
                    </div>
                    <div class="text-2xl text-slate-950 font-bold mt-2">
                      {{ item.rubricDimensionCount + item.evidenceRequirementCount }}
                    </div>
                    <div class="text-xs text-slate-500 mt-2">
                      维度 {{ item.rubricDimensionCount }} · 证据要求 {{ item.evidenceRequirementCount }}
                    </div>
                  </div>

                  <div class="p-3 rounded-xl bg-slate-50">
                    <div class="text-xs text-slate-500 tracking-[0.16em] font-semibold uppercase">
                      工作量压力
                    </div>
                    <div class="text-2xl text-slate-950 font-bold mt-2">
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
            <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
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

            <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                常见卡点
              </h4>
              <div class="mt-4 space-y-3">
                <div
                  v-for="item in difficultyAnalysis.bottlenecks"
                  :key="item.id"
                  class="p-4 border rounded-2xl"
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

        <div v-else-if="activeView === 'preparation'" class="mt-6 gap-4 grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
            <h4 class="text-slate-950 font-bold">
              备赛时间轴
            </h4>
            <div class="mt-4 space-y-3">
              <div
                v-for="item in preparationAnalysis.timeline"
                :key="item.id"
                class="p-4 rounded-xl bg-white"
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
            <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
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

            <article class="p-5 border border-slate-200 rounded-2xl bg-slate-50">
              <h4 class="text-slate-950 font-bold">
                即将到来的节点
              </h4>
              <div class="mt-4 space-y-3">
                <div
                  v-for="item in preparationAnalysis.upcomingContests"
                  :key="`${item.contestId}-${item.stage}`"
                  class="p-4 rounded-xl bg-white"
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

      <aside class="space-y-6">
        <section class="p-5 border border-slate-200 rounded-[28px] bg-white">
          <h3 class="text-lg text-slate-950 font-bold">
            当前建议
          </h3>
          <p class="text-sm text-slate-600 leading-6 mt-2">
            先用筛选器确定分析范围，再看总览判断样本是否足够，最后进入 {{ viewOptions.find(item => item.value === activeView)?.label || activeView }} 深挖决策依据。
          </p>
        </section>

        <section class="p-5 border border-slate-200 rounded-[28px] bg-white">
          <h3 class="text-lg text-slate-950 font-bold">
            数据缺口提示
          </h3>
          <div class="mt-4 space-y-3">
            <article
              v-for="item in activeDataGaps"
              :key="item.id"
              class="p-4 border rounded-2xl"
              :class="gapToneClasses(item.level)"
            >
              <div class="font-semibold">
                {{ item.title }}
              </div>
              <p class="text-sm leading-6 mt-2 opacity-90">
                {{ item.description }}
              </p>
            </article>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>
