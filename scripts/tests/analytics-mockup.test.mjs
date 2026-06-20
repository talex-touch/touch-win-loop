import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const analyticsMockupModuleUrl = pathToFileURL(resolve(process.cwd(), 'app/utils/analytics-mockup.ts')).href
const analyticsPageFile = resolve(process.cwd(), 'app/pages/dashboard/analytics.vue')
const analyticsComposableFile = resolve(process.cwd(), 'app/composables/useAnalyticsDashboard.ts')

function createFilters() {
  return {
    workspaceId: '',
    projectId: '',
    contestId: '',
    rangePreset: '90d',
  }
}

function createSparseOverview() {
  return {
    filters: createFilters(),
    scopeSummary: '真实样本不足',
    metricCards: [
      {
        id: 'events',
        label: '行为事件',
        value: '0',
        tone: 'violet',
        helpText: '尚未形成足够的正式行为事件样本。',
      },
    ],
    trendSeries: {
      title: '竞赛热度与趋势',
      summary: '',
      points: [],
    },
    awardFeatureTags: [],
    capabilityRadar: [],
    preparationTimeline: [],
    dataGaps: [],
    lastUpdatedAt: '',
  }
}

function createDenseOverview() {
  const sparse = createSparseOverview()
  return {
    ...sparse,
    metricCards: [
      ...sparse.metricCards,
      {
        id: 'contest-trends',
        label: '趋势样本',
        value: '12',
        tone: 'blue',
        helpText: '已有样本。',
      },
      {
        id: 'projects',
        label: '可见项目',
        value: '7',
        tone: 'emerald',
        helpText: '已有样本。',
      },
      {
        id: 'documents',
        label: '资料解析',
        value: '9',
        tone: 'amber',
        helpText: '已有样本。',
      },
    ].map(item => item.id === 'events' ? { ...item, value: '28' } : item),
    trendSeries: {
      ...sparse.trendSeries,
      points: Array.from({ length: 4 }, (_, index) => ({
        label: `真实趋势 ${index}`,
        heatScore: 70 + index,
        contestCount: 3,
        latestYear: 2026,
        summary: '真实返回样本。',
      })),
    },
    awardFeatureTags: Array.from({ length: 6 }, (_, index) => ({
      label: `真实特征 ${index}`,
      weight: 60 + index,
      evidenceCount: 2 + index,
      description: '真实返回样本。',
    })),
    capabilityRadar: Array.from({ length: 5 }, (_, index) => ({
      key: `real-capability-${index}`,
      label: `真实能力 ${index}`,
      score: 70 + index,
      evidence: '真实返回样本。',
    })),
    preparationTimeline: [],
    dataGaps: [],
    lastUpdatedAt: '2026-05-05T12:00:00.000+08:00',
  }
}

describe('analytics mockup fallback', () => {
  it('稀疏总览自动填充高密 mock 内容且不修改原始 payload', async () => {
    const {
      applyAnalyticsOverviewMockupFallback,
      shouldUseAnalyticsOverviewMockup,
    } = await import(analyticsMockupModuleUrl)
    const sparse = createSparseOverview()
    const original = structuredClone(sparse)

    assert.equal(shouldUseAnalyticsOverviewMockup(sparse), true)

    const filled = applyAnalyticsOverviewMockupFallback(sparse)

    assert.deepEqual(sparse, original, 'mock fallback 不应修改原始 payload')
    assert.equal(filled.metricCards.length, 4)
    assert.equal(filled.trendSeries.points.length, 8)
    assert.equal(filled.awardFeatureTags.length, 10)
    assert.equal(filled.capabilityRadar.length, 6)
    assert.equal(filled.preparationTimeline.length, 12)
    assert.equal(filled.dataGaps.length, 3)
    assert.match(filled.scopeSummary, /8421 条行为事件/)
  })

  it('真实样本充足时保持后端 payload 引用不变', async () => {
    const {
      applyAnalyticsOverviewMockupFallback,
      shouldUseAnalyticsOverviewMockup,
    } = await import(analyticsMockupModuleUrl)
    const dense = createDenseOverview()

    assert.equal(shouldUseAnalyticsOverviewMockup(dense), false)
    assert.equal(applyAnalyticsOverviewMockupFallback(dense), dense)
  })

  it('五个细分视图都能从空数组填充到计划要求的内容量', async () => {
    const {
      applyAnalyticsAwardMockupFallback,
      applyAnalyticsDifficultyMockupFallback,
      applyAnalyticsPreparationMockupFallback,
      applyAnalyticsProfileMockupFallback,
      applyAnalyticsTrendMockupFallback,
    } = await import(analyticsMockupModuleUrl)
    const filters = createFilters()
    const trend = applyAnalyticsTrendMockupFallback({
      filters,
      summary: '',
      keywordSeries: { title: '竞赛热度与趋势', summary: '', points: [] },
      contests: [],
      dataGaps: [],
      lastUpdatedAt: '',
    })
    const awards = applyAnalyticsAwardMockupFallback({
      filters,
      summary: '',
      featureTags: [],
      samples: [],
      dataGaps: [],
      lastUpdatedAt: '',
    })
    const profile = applyAnalyticsProfileMockupFallback({
      filters,
      summary: '',
      radar: [],
      gapNotes: [],
      projects: [],
      dataGaps: [],
      lastUpdatedAt: '',
    })
    const difficulty = applyAnalyticsDifficultyMockupFallback({
      filters,
      summary: '',
      tracks: [],
      statusStats: [],
      bottlenecks: [],
      dataGaps: [],
      lastUpdatedAt: '',
    })
    const preparation = applyAnalyticsPreparationMockupFallback({
      filters,
      summary: '',
      timeline: [],
      stageStats: [],
      upcomingContests: [],
      dataGaps: [],
      lastUpdatedAt: '',
    })

    assert.equal(trend.keywordSeries.points.length, 10)
    assert.equal(trend.contests.length, 8)
    assert.equal(awards.featureTags.length, 12)
    assert.equal(awards.samples.length, 10)
    assert.equal(profile.radar.length, 6)
    assert.equal(profile.gapNotes.length, 6)
    assert.equal(profile.projects.length, 10)
    assert.equal(difficulty.tracks.length, 10)
    assert.equal(difficulty.statusStats.length, 3)
    assert.equal(difficulty.bottlenecks.length, 6)
    assert.equal(preparation.timeline.length, 14)
    assert.equal(preparation.stageStats.length, 7)
    assert.equal(preparation.upcomingContests.length, 8)
  })

  it('综合分析页接入 mock fallback 并提供高密总览速览区域', async () => {
    const pageSource = await readFile(analyticsPageFile, 'utf8')
    const composableSource = await readFile(analyticsComposableFile, 'utf8')

    assert.match(composableSource, /applyAnalyticsOverviewMockupFallback\(response\.data\)/, '总览成功响应未接入 mock fallback')
    assert.match(composableSource, /applyAnalyticsTrendMockupFallback\(response\.data\)/, '趋势分析成功响应未接入 mock fallback')
    assert.match(composableSource, /applyAnalyticsAwardMockupFallback\(response\.data\)/, '获奖分析成功响应未接入 mock fallback')
    assert.match(composableSource, /applyAnalyticsProfileMockupFallback\(response\.data\)/, '能力画像成功响应未接入 mock fallback')
    assert.match(composableSource, /applyAnalyticsDifficultyMockupFallback\(response\.data\)/, '难度分析成功响应未接入 mock fallback')
    assert.match(composableSource, /applyAnalyticsPreparationMockupFallback\(response\.data\)/, '备赛节奏成功响应未接入 mock fallback')
    assert.match(pageSource, /高频特征速览/, '总览缺少获奖特征速览')
    assert.match(pageSource, /近期节点/, '总览缺少备赛近期节点')
    assert.match(pageSource, /analytics-feature-chip-grid/, '总览缺少高密特征网格样式')
    assert.match(pageSource, /overflow-wrap: anywhere/, '综合分析页缺少长文本防溢出样式')
  })
})
