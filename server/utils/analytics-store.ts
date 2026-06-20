import type { Queryable } from '~~/server/utils/db'
import type {
  AnalyticsAwardFeatureAnalysisPayload,
  AnalyticsAwardFeatureSample,
  AnalyticsAwardFeatureTag,
  AnalyticsCapabilityProfilePayload,
  AnalyticsCapabilityProjectItem,
  AnalyticsCapabilityRadarItem,
  AnalyticsContestTrendPoint,
  AnalyticsContestTrendSeries,
  AnalyticsDataGap,
  AnalyticsDifficultyBottleneckItem,
  AnalyticsDifficultyCompletionPayload,
  AnalyticsDifficultyLevel,
  AnalyticsDifficultySeverity,
  AnalyticsDifficultyStatusStat,
  AnalyticsDifficultyTrackItem,
  AnalyticsEventInput,
  AnalyticsFilterInput,
  AnalyticsOverviewPayload,
  AnalyticsPreparationCadencePayload,
  AnalyticsPreparationStageStat,
  AnalyticsPreparationTimelineItem,
  AnalyticsRangePreset,
  AnalyticsResolvedFilters,
  AnalyticsTrackedEvent,
  AnalyticsTrendAnalysisPayload,
  AnalyticsTrendContestItem,
} from '~~/shared/types/analytics'
import type { AuthUser, Contest, Project, RubricDimension, TopicProposalCompareMatrixRow, TopicProposalItem } from '~~/shared/types/domain'
import type { ProjectCompetitionLoopDigest } from '~~/shared/types/project-competition-loop'
import { randomUUID } from 'node:crypto'
import { listContestLibrary } from '~~/server/utils/contest-store'
import { getVisibleProjectById, listVisibleProjects } from '~~/server/utils/platform-store'
import { listProjectCompetitionLoopDigests } from '~~/server/utils/project-competition-loop-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import { teamListUserWorkspaces } from '~~/server/utils/team-workspace-store'

interface ContestTrendRow {
  contest_id: string
  year: number
  summary: string
  hot_tags: string[] | null
}

interface ContestResourceRow {
  contest_id: string
  category: string | null
  title: string
  summary: string | null
  year: number | null
}

interface ProjectTopicBoardRow {
  id: string
  project_id: string
  contest_id: string
  track_id: string
  compare_matrix: unknown
}

interface ProjectTopicCandidateRow {
  board_id: string
  project_id: string
  decision_status: string
  total_score: number
  payload: unknown
}

interface ContestRubricRow {
  contest_id: string
  track_id: string
  scoring_mode: string | null
  version: number
  dimensions: unknown
  scoring_points: string[] | null
  deduction_items: string[] | null
  evidence_requirements: string[] | null
}

interface ProjectContestBindingRow {
  project_id: string
  contest_id: string
  track_id: string
}

interface ProjectDocumentAggregateRow {
  project_id: string
  total_count: string
  succeeded_count: string
}

interface EventCountRow {
  count: string
}

interface DocumentStatsRow {
  succeeded: string
}

interface AiUsageRow {
  total_units: string
}

interface SyncTaskCountRow {
  count: string
}

interface ProjectCompareRow extends TopicProposalCompareMatrixRow {
  projectId: string
  contestId: string
  trackId: string
}

interface AnalyticsSnapshot {
  filters: AnalyticsResolvedFilters
  rangeStart: Date | null
  contests: Contest[]
  projects: Project[]
  workspaceNameMap: Map<string, string>
  trendRows: ContestTrendRow[]
  resourceRows: ContestResourceRow[]
  boardRows: ProjectTopicBoardRow[]
  candidateRows: ProjectTopicCandidateRow[]
  compareRows: ProjectCompareRow[]
  docSucceededCount: number
  eventCount: number
  aiUsageUnits: number
  syncTaskCount: number
  loopDigests: ProjectCompetitionLoopDigest[]
  lastUpdatedAt: string
}

interface AnalyticsScopeResolution {
  filters: AnalyticsResolvedFilters
  contests: Contest[]
  projects: Project[]
  workspaceIds: string[]
  workspaceNameMap: Map<string, string>
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toCount(value: unknown): number {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : 0
}

function average(values: number[]): number {
  if (values.length === 0)
    return 0
  return values.reduce((sum, item) => sum + item, 0) / values.length
}

function parseObject(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    }
    catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseArray<T>(value: unknown): T[] {
  if (!value)
    return []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T[] : []
    }
    catch {
      return []
    }
  }
  return Array.isArray(value) ? value as T[] : []
}

function summarizeText(value: unknown, max = 64): string {
  const normalized = normalizeText(value).replace(/\s+/g, ' ')
  if (!normalized)
    return ''
  if (normalized.length <= max)
    return normalized
  return `${normalized.slice(0, max)}...`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function collectProjectContestIds(project: Project | null | undefined): string[] {
  if (!project)
    return []
  return uniqueStrings([project.contestId, ...(project.contestIds || [])])
}

function resolveRangePreset(value: unknown): AnalyticsRangePreset {
  const normalized = normalizeText(value)
  if (['30d', '90d', '180d', '365d', 'all'].includes(normalized))
    return normalized as AnalyticsRangePreset
  return '90d'
}

function resolveRangeStart(rangePreset: AnalyticsRangePreset): Date | null {
  if (rangePreset === 'all')
    return null

  const daysMap: Record<Exclude<AnalyticsRangePreset, 'all'>, number> = {
    '30d': 30,
    '90d': 90,
    '180d': 180,
    '365d': 365,
  }
  return new Date(Date.now() - daysMap[rangePreset] * 24 * 60 * 60 * 1000)
}

function parseDateCandidate(value: string | null | undefined): Date | null {
  const normalized = normalizeText(value)
  if (!normalized)
    return null

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
  const parsed = new Date(isDateOnly ? `${normalized}T00:00:00+08:00` : normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatShortDate(value: string | null | undefined): string {
  const date = parseDateCandidate(value)
  if (!date)
    return '时间待补充'
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  })
}

function buildScopeSummary(input: {
  filters: AnalyticsResolvedFilters
  contests: Contest[]
  projects: Project[]
  workspaceNameMap: Map<string, string>
}): string {
  const { filters, contests, projects, workspaceNameMap } = input
  if (filters.projectId) {
    const project = projects.find(item => item.id === filters.projectId)
    return project
      ? `当前聚焦项目「${project.title}」的综合分析结果。`
      : `当前聚焦项目 ${filters.projectId} 的综合分析结果。`
  }
  if (filters.workspaceId) {
    const workspaceName = workspaceNameMap.get(filters.workspaceId) || filters.workspaceId
    return `当前聚焦空间「${workspaceName}」中的竞赛、项目和行为样本。`
  }
  if (filters.contestId) {
    const contest = contests.find(item => item.id === filters.contestId)
    return contest
      ? `当前聚焦竞赛「${contest.name}」的趋势、作品和备赛节奏。`
      : `当前聚焦竞赛 ${filters.contestId} 的趋势、作品和备赛节奏。`
  }
  return `当前聚合 ${contests.length} 个竞赛、${projects.length} 个可见项目与近期行为样本。`
}

function buildTrendPoints(trendRows: ContestTrendRow[]): AnalyticsContestTrendPoint[] {
  const currentYear = new Date().getFullYear()
  const keywordMap = new Map<string, {
    totalHeat: number
    contestIds: Set<string>
    latestYear: number
    summary: string
    evidenceCount: number
  }>()

  for (const row of trendRows) {
    const hotTags = Array.isArray(row.hot_tags) ? row.hot_tags : []
    for (const rawTag of hotTags.slice(0, 5)) {
      const label = summarizeText(rawTag, 18)
      if (!label)
        continue

      const recencyBonus = clamp(18 - Math.max(0, currentYear - toCount(row.year)) * 3, 0, 18)
      const current = keywordMap.get(label) || {
        totalHeat: 0,
        contestIds: new Set<string>(),
        latestYear: 0,
        summary: summarizeText(row.summary, 72),
        evidenceCount: 0,
      }
      current.totalHeat += 58 + recencyBonus
      current.contestIds.add(row.contest_id)
      current.latestYear = Math.max(current.latestYear, toCount(row.year))
      current.evidenceCount += 1
      if (!current.summary)
        current.summary = summarizeText(row.summary, 72)
      keywordMap.set(label, current)
    }
  }

  return [...keywordMap.entries()]
    .map(([label, value]) => ({
      label,
      heatScore: clamp(Math.round(value.totalHeat / Math.max(value.evidenceCount, 1)), 36, 98),
      contestCount: value.contestIds.size,
      latestYear: value.latestYear,
      summary: value.summary || '暂无更多趋势摘要。',
    }))
    .sort((left, right) => right.heatScore - left.heatScore || right.contestCount - left.contestCount)
    .slice(0, 8)
}

function buildTrendSeries(trendRows: ContestTrendRow[]): AnalyticsContestTrendSeries {
  const points = buildTrendPoints(trendRows)
  return {
    title: '竞赛热度与趋势',
    summary: points.length > 0
      ? `当前热点主要集中在 ${points.slice(0, 3).map(item => item.label).join('、')}。`
      : '当前范围内暂无足够趋势样本，建议继续补充 contest_trends 数据。',
    points,
  }
}

function buildTrendContestItems(contests: Contest[], trendRows: ContestTrendRow[]): AnalyticsTrendContestItem[] {
  return contests
    .map((contest) => {
      const rows = trendRows.filter(item => item.contest_id === contest.id)
      const topKeywords = uniqueStrings(rows.flatMap(item => Array.isArray(item.hot_tags) ? item.hot_tags : [])).slice(0, 4)
      return {
        contestId: contest.id,
        contestName: contest.name,
        hotScore: clamp(Math.round(Math.max(Number(contest.hotScore || 0), rows.length * 12)), 0, 100),
        trendCount: rows.length,
        topKeywords,
        signalSummary: rows.length > 0
          ? summarizeText(rows[0]?.summary, 96)
          : '当前更多依赖赛事库热度分与资料侧信号。',
      }
    })
    .filter(item => item.trendCount > 0 || item.hotScore > 0)
    .sort((left, right) => right.hotScore - left.hotScore || right.trendCount - left.trendCount)
    .slice(0, 8)
}

function extractFeatureParts(value: string): string[] {
  const normalized = normalizeText(value)
  if (!normalized)
    return []

  const parts = normalized
    .split(/[、,，/；;|]/g)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 18)

  if (parts.length > 0)
    return parts

  return [summarizeText(normalized, 18)].filter(Boolean)
}

function buildAwardFeatureTags(candidateRows: ProjectTopicCandidateRow[], resourceRows: ContestResourceRow[]): AnalyticsAwardFeatureTag[] {
  const featureMap = new Map<string, { weight: number, evidenceCount: number }>()

  const appendFeature = (label: string, weight: number) => {
    for (const part of extractFeatureParts(label)) {
      const current = featureMap.get(part) || { weight: 0, evidenceCount: 0 }
      current.weight += weight
      current.evidenceCount += 1
      featureMap.set(part, current)
    }
  }

  for (const row of candidateRows) {
    const payload = parseObject(row.payload) as Partial<TopicProposalItem>
    const weight = row.decision_status === 'selected'
      ? 16
      : (row.decision_status === 'shortlisted' ? 12 : 8)

    for (const item of payload.requiredSkills || [])
      appendFeature(item, weight)
    for (const item of payload.innovationPoints || [])
      appendFeature(item, weight - 2)
    for (const item of payload.scoringMapping || [])
      appendFeature(item, weight - 3)
  }

  if (featureMap.size === 0) {
    for (const row of resourceRows.filter(item => ['awarded_works', 'past_questions'].includes(normalizeText(item.category))).slice(0, 16)) {
      appendFeature(row.title, 6)
      appendFeature(row.summary || '', 3)
    }
  }

  return [...featureMap.entries()]
    .map(([label, value]) => ({
      label,
      weight: clamp(value.weight, 1, 100),
      evidenceCount: value.evidenceCount,
      description: `来自 ${value.evidenceCount} 条候选题或样本资料的高频共性。`,
    }))
    .sort((left, right) => right.weight - left.weight || right.evidenceCount - left.evidenceCount)
    .slice(0, 10)
}

function buildAwardSamples(snapshot: AnalyticsSnapshot): AnalyticsAwardFeatureSample[] {
  const projectNameMap = new Map(snapshot.projects.map(item => [item.id, item.title]))
  const candidateSamples = [...snapshot.candidateRows]
    .sort((left, right) => right.total_score - left.total_score)
    .slice(0, 4)
    .map((row) => {
      const payload = parseObject(row.payload) as Partial<TopicProposalItem>
      return {
        title: normalizeText(payload.title) || '未命名候选题',
        source: `项目候选题 / ${projectNameMap.get(row.project_id) || row.project_id}`,
        status: (['selected', 'shortlisted', 'candidate'].includes(row.decision_status) ? row.decision_status : 'candidate') as AnalyticsAwardFeatureSample['status'],
        score: clamp(Math.round(row.total_score || 0), 0, 100),
        summary: summarizeText(payload.reason || payload.innovationPoints?.[0] || payload.techRouteSteps?.[0] || '当前候选题已进入分析样本。', 88),
      }
    })

  const resourceSamples = snapshot.resourceRows
    .filter(item => ['awarded_works', 'past_questions'].includes(normalizeText(item.category)))
    .slice(0, 4)
    .map(item => ({
      title: item.title,
      source: `竞赛资料 / ${normalizeText(item.category) === 'awarded_works' ? '获奖作品' : '往届题目'}`,
      status: 'resource' as const,
      score: item.year ? clamp(40 + (item.year % 100), 40, 78) : 60,
      summary: summarizeText(item.summary || '当前资料可作为获奖特征补充样本。', 88),
    }))

  return [...candidateSamples, ...resourceSamples].slice(0, 8)
}

function buildCapabilityRadar(snapshot: AnalyticsSnapshot, topTrendLabel: string): AnalyticsCapabilityRadarItem[] {
  const loopReadiness = snapshot.loopDigests.length > 0
    ? {
        key: 'loop',
        label: '主链闭环',
        score: clamp(Math.round(snapshot.loopDigests.reduce((sum, item) => sum + item.matchScore, 0) / snapshot.loopDigests.length), 0, 100),
        evidence: `来自 ${snapshot.loopDigests.length} 个项目主链快照，开放风险 ${snapshot.loopDigests.reduce((sum, item) => sum + item.openRiskCount, 0)} 条。`,
      }
    : null

  if (snapshot.compareRows.length > 0) {
    const average = (key: keyof TopicProposalCompareMatrixRow) => Math.round(
      snapshot.compareRows.reduce((sum, item) => sum + toCount(item[key]), 0) / Math.max(snapshot.compareRows.length, 1),
    )

    return [
      { key: 'contest-fit', label: '选题契合', score: average('contestFit'), evidence: `来自 ${snapshot.compareRows.length} 条题目对比矩阵记录。` },
      { key: 'evidence', label: '证据完备', score: average('evidenceReadiness'), evidence: `已联动 ${snapshot.docSucceededCount} 份项目资料解析结果。` },
      { key: 'trend', label: '趋势把握', score: average('trendHeat'), evidence: topTrendLabel ? `当前热点主要集中在 ${topTrendLabel}。` : '趋势热词样本仍在持续累积。' },
      { key: 'team', label: '团队匹配', score: average('teamMatch'), evidence: `结合 ${snapshot.projects.length} 个可见项目的团队配置估算。` },
      { key: 'feasibility', label: '执行可行', score: average('workloadFeasibility'), evidence: '基于题目板工作量与难度评分的平均值。' },
      ...(loopReadiness ? [loopReadiness] : []),
    ].slice(0, 6)
  }

  const averageProjectRichness = snapshot.projects.length === 0
    ? 0
    : snapshot.projects.reduce((sum, item) => sum + item.innovationPoints.length + item.techRouteSteps.length + item.scoringMapping.length, 0) / snapshot.projects.length
  const averageTeamSupport = snapshot.projects.length === 0
    ? 0
    : snapshot.projects.reduce((sum, item) => sum + item.collegeBindings.length * 2 + item.advisorBindings.length * 3, 0) / snapshot.projects.length

  return [
    { key: 'contest-fit', label: '选题契合', score: clamp(Math.round(42 + averageProjectRichness * 4), 28, 82), evidence: '当前暂以项目内容完整度估算选题契合度。' },
    { key: 'evidence', label: '证据完备', score: clamp(Math.round(30 + snapshot.docSucceededCount * 12), 20, 88), evidence: '当前暂以已解析资料数量估算证据沉淀程度。' },
    { key: 'trend', label: '趋势把握', score: topTrendLabel ? 66 : 42, evidence: topTrendLabel ? `当前已识别热点：${topTrendLabel}。` : '尚未形成稳定趋势样本。' },
    { key: 'team', label: '团队匹配', score: clamp(Math.round(36 + averageTeamSupport * 8), 24, 80), evidence: '当前暂以院校和指导老师绑定情况估算协同能力。' },
    { key: 'feasibility', label: '执行可行', score: clamp(Math.round(58 + averageProjectRichness * 2), 34, 84), evidence: '当前暂以交付物、风险和技术路线完整度估算。' },
    ...(loopReadiness ? [loopReadiness] : []),
  ].slice(0, 6)
}

function buildCapabilityProjects(snapshot: AnalyticsSnapshot): AnalyticsCapabilityProjectItem[] {
  const compareMap = new Map<string, ProjectCompareRow[]>()
  for (const row of snapshot.compareRows) {
    const existing = compareMap.get(row.projectId)
    if (existing)
      existing.push(row)
    else
      compareMap.set(row.projectId, [row])
  }

  return snapshot.projects
    .map((project) => {
      const compareRows = compareMap.get(project.id) || []
      const averageTeamMatch = compareRows.length > 0
        ? Math.round(compareRows.reduce((sum, item) => sum + toCount(item.teamMatch), 0) / compareRows.length)
        : clamp(40 + project.advisorBindings.length * 8 + project.collegeBindings.length * 6, 25, 82)
      const averageContestFit = compareRows.length > 0
        ? Math.round(compareRows.reduce((sum, item) => sum + toCount(item.contestFit), 0) / compareRows.length)
        : clamp(38 + project.scoringMapping.length * 6 + project.innovationPoints.length * 4, 28, 84)

      return {
        projectId: project.id,
        title: project.title,
        averageTeamMatch,
        averageContestFit,
        collegeCount: project.collegeBindings.length,
        advisorCount: project.advisorBindings.length,
        deliverableCount: project.deliverables.length,
      }
    })
    .sort((left, right) => (right.averageTeamMatch + right.averageContestFit) - (left.averageTeamMatch + left.averageContestFit))
    .slice(0, 8)
}

function buildCapabilityGapNotes(snapshot: AnalyticsSnapshot): string[] {
  const notes = uniqueStrings(snapshot.candidateRows.flatMap((row) => {
    const payload = parseObject(row.payload) as Partial<TopicProposalItem>
    return payload.teamGapNotes || []
  }))

  if (notes.length > 0)
    return notes.slice(0, 6)

  const derived: string[] = []
  if (snapshot.projects.every(item => item.advisorBindings.length === 0))
    derived.push('当前项目普遍缺少指导老师绑定，建议补充外部指导视角。')
  if (snapshot.projects.every(item => item.collegeBindings.length === 0))
    derived.push('当前项目没有稳定的院校归属信息，后续院校竞争力分析会受限。')
  if (snapshot.docSucceededCount === 0)
    derived.push('当前资料解析样本不足，证据完备度只能按结构化字段估算。')

  return derived.length > 0 ? derived : ['当前没有显著能力短板提示，可继续补更多题目板样本提升精度。']
}

function buildPreparationTimeline(contests: Contest[], rangeStart: Date | null): AnalyticsPreparationTimelineItem[] {
  const rangeStartMs = rangeStart?.getTime() || 0
  const rows = contests.flatMap((contest) => {
    const timelines = Array.isArray(contest.timelines) ? contest.timelines : []
    return timelines.map((item) => {
      const anchor = parseDateCandidate(item.startAt || item.endAt || '')
      const anchorMs = anchor?.getTime() || Number.MAX_SAFE_INTEGER
      const intensity: AnalyticsPreparationTimelineItem['intensity'] = item.nodeType === 'submission' || item.nodeType === 'final'
        ? 'high'
        : (item.nodeType === 'preliminary' ? 'medium' : 'low')

      return {
        id: item.id,
        phase: item.nodeType,
        label: item.note || `${contest.name} ${item.nodeType}`,
        timeText: item.startAt && item.endAt
          ? `${formatShortDate(item.startAt)} - ${formatShortDate(item.endAt)}`
          : formatShortDate(item.startAt || item.endAt || ''),
        intensity,
        source: contest.name,
        anchorMs,
      }
    })
  })

  return rows
    .filter(item => item.anchorMs >= rangeStartMs)
    .sort((left, right) => left.anchorMs - right.anchorMs)
    .slice(0, 10)
    .map(({ anchorMs: _anchorMs, ...item }) => item)
}

function buildPreparationStageStats(timeline: AnalyticsPreparationTimelineItem[]): AnalyticsPreparationStageStat[] {
  const counter = new Map<string, number>()
  for (const item of timeline)
    counter.set(item.phase, (counter.get(item.phase) || 0) + 1)

  return [...counter.entries()]
    .map(([phase, count]) => ({ phase, count }))
    .sort((left, right) => right.count - left.count)
}

function buildUpcomingContests(contests: Contest[]): AnalyticsPreparationCadencePayload['upcomingContests'] {
  const now = Date.now()
  const items = contests.map((contest) => {
    const deadline = parseDateCandidate(contest.submissionDeadline)
    if (deadline && deadline.getTime() >= now) {
      const diffDays = Math.ceil((deadline.getTime() - now) / (24 * 60 * 60 * 1000))
      return {
        contestId: contest.id,
        contestName: contest.name,
        stage: '提交截止',
        deadlineText: contest.submissionDeadline,
        intensity: diffDays <= 14 ? 'high' : (diffDays <= 30 ? 'medium' : 'low'),
        anchorMs: deadline.getTime(),
      }
    }

    const [registrationStartRaw = '', registrationEndRaw = ''] = String(contest.registrationWindow || '').split('~').map(item => item.trim())
    const registrationStart = parseDateCandidate(registrationStartRaw)
    const registrationEnd = parseDateCandidate(registrationEndRaw)
    const anchor = registrationStart && registrationStart.getTime() >= now ? registrationStart : registrationEnd
    if (!anchor || anchor.getTime() < now)
      return null

    const diffDays = Math.ceil((anchor.getTime() - now) / (24 * 60 * 60 * 1000))
    return {
      contestId: contest.id,
      contestName: contest.name,
      stage: '报名窗口',
      deadlineText: contest.registrationWindow || '时间待公布',
      intensity: diffDays <= 14 ? 'high' : (diffDays <= 30 ? 'medium' : 'low'),
      anchorMs: anchor.getTime(),
    }
  }).filter(Boolean) as Array<AnalyticsPreparationCadencePayload['upcomingContests'][number] & { anchorMs: number }>

  return items
    .sort((left, right) => left.anchorMs - right.anchorMs)
    .slice(0, 8)
    .map(({ anchorMs: _anchorMs, ...item }) => item)
}

function buildDataGaps(input: {
  eventCount: number
  boardCount: number
  featureCount: number
  docSucceededCount: number
  syncTaskCount: number
  loopDigestCount: number
}): AnalyticsDataGap[] {
  const gaps: AnalyticsDataGap[] = []

  if (input.eventCount === 0) {
    gaps.push({
      id: 'events',
      title: '行为事件样本不足',
      description: '当前尚未形成稳定的行为埋点样本，节奏和漏斗分析仍偏保守。',
      level: 'critical',
    })
  }
  if (input.boardCount === 0) {
    gaps.push({
      id: 'topic-boards',
      title: '题目对比板沉淀不足',
      description: '能力画像仍以项目静态信息为主，缺少题目板评分矩阵支撑。',
      level: 'warning',
    })
  }
  if (input.featureCount === 0) {
    gaps.push({
      id: 'award-features',
      title: '获奖特征样本不足',
      description: '当前还没有稳定的高频共性，可继续补更多获奖作品和候选题数据。',
      level: 'warning',
    })
  }
  if (input.docSucceededCount === 0) {
    gaps.push({
      id: 'documents',
      title: '资料解析样本不足',
      description: '证据完备度暂时无法建立在文档解析内容上，只能按结构化字段估算。',
      level: 'warning',
    })
  }
  if (input.syncTaskCount === 0) {
    gaps.push({
      id: 'sync',
      title: '外部同步链路未形成反馈',
      description: '当前仍主要依赖库内数据，外部同步结果尚未进入分析闭环。',
      level: 'info',
    })
  }
  if (input.loopDigestCount === 0) {
    gaps.push({
      id: 'project-loop',
      title: '项目参赛主链尚未刷新',
      description: '趋势、推荐、日程和竞争力分析还未接入项目风险、任务和知识库统一快照。',
      level: 'warning',
    })
  }
  if (gaps.length === 0) {
    gaps.push({
      id: 'healthy',
      title: '当前分析链路可继续扩展',
      description: '趋势、画像和节奏分析已经具备基础样本，可以继续推进导出和自定义看板。',
      level: 'info',
    })
  }

  return gaps
}

function buildSnapshotContestIds(snapshot: AnalyticsSnapshot): string[] {
  return uniqueStrings([
    ...snapshot.contests.map(item => item.id),
    ...snapshot.projects.map(item => item.contestId),
    ...snapshot.projects.flatMap(item => item.contestIds || []),
  ])
}

function buildSnapshotProjectIds(snapshot: AnalyticsSnapshot): string[] {
  return snapshot.projects.map(item => item.id)
}

function resolveDifficultyLevel(score: number): AnalyticsDifficultyLevel {
  if (score >= 78)
    return 'advanced'
  if (score >= 56)
    return 'challenging'
  return 'balanced'
}

function resolveDifficultySeverity(affectedProjectCount: number, totalProjectCount: number): AnalyticsDifficultySeverity {
  const ratio = totalProjectCount > 0 ? affectedProjectCount / totalProjectCount : 0
  if (ratio >= 0.5 || affectedProjectCount >= 3)
    return 'high'
  if (ratio >= 0.25 || affectedProjectCount >= 2)
    return 'medium'
  return 'low'
}

function buildDifficultyStatusStats(projects: Project[]): AnalyticsDifficultyStatusStat[] {
  const definitions: Array<{ status: AnalyticsDifficultyStatusStat['status'], label: string }> = [
    { status: 'draft', label: '草稿' },
    { status: 'in_progress', label: '进行中' },
    { status: 'completed', label: '已完成' },
  ]

  return definitions.map(item => ({
    status: item.status,
    label: item.label,
    count: projects.filter(project => project.status === item.status).length,
  }))
}

function buildDifficultyBottlenecks(snapshot: AnalyticsSnapshot, documentStatsMap: Map<string, { total: number, succeeded: number }>): AnalyticsDifficultyBottleneckItem[] {
  const totalProjectCount = snapshot.projects.length
  const boardProjectIds = new Set(snapshot.boardRows.map(item => item.project_id))

  const bottlenecks: AnalyticsDifficultyBottleneckItem[] = [
    {
      id: 'draft-status',
      label: '项目仍停留在草稿阶段',
      affectedProjectCount: snapshot.projects.filter(item => item.status === 'draft').length,
      severity: 'low',
      description: '草稿状态会显著拉低真实完成率，建议先把题目选择、交付物和执行计划固化下来。',
    },
    {
      id: 'topic-board-missing',
      label: '缺少题目对比板',
      affectedProjectCount: snapshot.projects.filter(item => !boardProjectIds.has(item.id)).length,
      severity: 'low',
      description: '没有题目对比板时，难度只能按赛道结构估算，无法结合候选题工作量做更细判断。',
    },
    {
      id: 'document-parse-missing',
      label: '资料解析沉淀不足',
      affectedProjectCount: snapshot.projects.filter(item => (documentStatsMap.get(item.id)?.succeeded || 0) === 0).length,
      severity: 'low',
      description: '缺少已解析资料时，证据要求和完成障碍主要依赖结构化字段推断，精度会偏保守。',
    },
    {
      id: 'advisor-missing',
      label: '缺少指导老师绑定',
      affectedProjectCount: snapshot.projects.filter(item => item.advisorBindings.length === 0).length,
      severity: 'low',
      description: '导师视角缺失时，项目节奏和评审风险更难提前暴露，容易在中后期集中返工。',
    },
    {
      id: 'college-missing',
      label: '院校归属未完善',
      affectedProjectCount: snapshot.projects.filter(item => item.collegeBindings.length === 0).length,
      severity: 'low',
      description: '院校归属缺失会削弱团队背景和既往样本的对照能力，也影响后续竞争力分析。',
    },
  ]
    .filter(item => item.affectedProjectCount > 0)
    .map(item => ({
      ...item,
      severity: resolveDifficultySeverity(item.affectedProjectCount, totalProjectCount),
    }))
    .sort((left, right) => right.affectedProjectCount - left.affectedProjectCount)
    .slice(0, 5)

  if (bottlenecks.length > 0)
    return bottlenecks

  return [{
    id: 'healthy',
    label: '当前未发现集中卡点',
    severity: 'low',
    affectedProjectCount: 0,
    description: '现有项目在题目板、资料解析和基础绑定上相对完整，可以继续细化导出和看板能力。',
  }]
}

function buildDifficultyDataGaps(snapshot: AnalyticsSnapshot, input: {
  trackCount: number
  rubricCount: number
  sampledTrackCount: number
}): AnalyticsDataGap[] {
  const gaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: 1,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  }).filter(item => ['topic-boards', 'documents'].includes(item.id))

  if (input.trackCount === 0) {
    gaps.unshift({
      id: 'difficulty-samples',
      title: '题目样本不足',
      description: '当前范围内没有稳定的赛道绑定样本，难度与完成率分析还无法形成可比较的题目列表。',
      level: 'warning',
    })
  }
  if (input.rubricCount === 0) {
    gaps.push({
      id: 'rubrics',
      title: '评分规则样本不足',
      description: '当前赛道缺少可用 rubric，难度分只能按交付物与时间节点做保守估算。',
      level: 'warning',
    })
  }
  if (input.sampledTrackCount === 0 && snapshot.projects.length > 0) {
    gaps.push({
      id: 'completion-rate',
      title: '完成率样本仍偏少',
      description: '当前题目方向已经识别出来，但平台内可见项目还没有形成稳定的已完成样本。',
      level: 'info',
    })
  }
  if (gaps.length === 0) {
    gaps.push({
      id: 'healthy',
      title: '题目难度分析样本可用',
      description: '当前已经具备赛道结构、项目进度和资料沉淀，可以继续扩展导出与自定义看板。',
      level: 'info',
    })
  }

  return gaps
}

function buildDifficultyTrackItems(snapshot: AnalyticsSnapshot, input: {
  rubricRows: ContestRubricRow[]
  bindingRows: ProjectContestBindingRow[]
}): AnalyticsDifficultyTrackItem[] {
  const contestMap = new Map(snapshot.contests.map(item => [item.id, item]))
  const projectMap = new Map(snapshot.projects.map(item => [item.id, item]))
  const rubricMap = new Map(input.rubricRows.map(item => [`${item.contest_id}:${item.track_id}`, item]))
  const compareMap = new Map<string, ProjectCompareRow[]>()
  const projectIdsByTrack = new Map<string, Set<string>>()

  const ensureTrackKey = (key: string) => {
    if (!key)
      return
    if (!projectIdsByTrack.has(key))
      projectIdsByTrack.set(key, new Set())
  }

  const appendProjectId = (key: string, projectId: string) => {
    if (!key || !projectId)
      return
    ensureTrackKey(key)
    projectIdsByTrack.get(key)?.add(projectId)
  }

  for (const row of snapshot.compareRows) {
    const key = `${row.contestId}:${row.trackId}`
    const existing = compareMap.get(key)
    if (existing)
      existing.push(row)
    else
      compareMap.set(key, [row])
  }

  for (const row of input.bindingRows)
    appendProjectId(`${row.contest_id}:${row.track_id}`, row.project_id)

  for (const project of snapshot.projects)
    appendProjectId(`${project.contestId}:${project.trackId}`, project.id)

  if (snapshot.filters.contestId) {
    const selectedContest = contestMap.get(snapshot.filters.contestId)
    for (const track of selectedContest?.tracks || [])
      ensureTrackKey(`${selectedContest!.id}:${track.id}`)
  }

  return [...projectIdsByTrack.entries()]
    .map(([key, projectIds]) => {
      const [contestId = '', trackId = ''] = key.split(':')
      const contest = contestMap.get(contestId)
      const track = contest?.tracks.find(item => item.id === trackId)
      const rubric = rubricMap.get(key)
      const compareRows = compareMap.get(key) || []
      const projectRows = [...projectIds]
        .map(projectId => projectMap.get(projectId))
        .filter(Boolean) as Project[]

      const rubricDimensions = parseArray<RubricDimension>(rubric?.dimensions)
      const evidenceRequirementCount = uniqueStrings([
        ...(rubric?.evidence_requirements || []),
        ...rubricDimensions.map(item => item.evidenceRequirement || ''),
      ]).length
      const deliverableCount = track?.deliverableTypes?.length || Math.round(average(projectRows.map(item => item.deliverables.length))) || 0
      const milestoneCount = (contest?.timelines || []).filter(item => ['submission', 'preliminary', 'final'].includes(item.nodeType)).length
      const completedProjectCount = projectRows.filter(item => item.status === 'completed').length
      const inProgressProjectCount = projectRows.filter(item => item.status === 'in_progress').length
      const draftProjectCount = projectRows.filter(item => item.status === 'draft').length
      const sampleProjectCount = projectRows.length
      const completionRate = sampleProjectCount > 0
        ? clamp(Math.round(completedProjectCount / sampleProjectCount * 100), 0, 100)
        : 0
      const workloadPressure = compareRows.length > 0
        ? clamp(Math.round(average(compareRows.map(item => 100 - toCount(item.workloadFeasibility)))), 12, 96)
        : clamp(Math.round(average(projectRows.map(item =>
            34 + item.deliverables.length * 8 + item.risks.length * 5 + item.techRouteSteps.length * 4,
          )) || (28 + deliverableCount * 7 + milestoneCount * 5 + evidenceRequirementCount * 4)), 18, 92)
      const difficultyScore = clamp(Math.round(
        18
        + rubricDimensions.length * 6
        + evidenceRequirementCount * 5
        + Math.min(deliverableCount, 5) * 6
        + Math.min(milestoneCount, 5) * 4
        + workloadPressure * 0.35
        + (sampleProjectCount > 0 ? (100 - completionRate) * 0.08 : 0),
      ), 24, 97)

      const structureParts = [
        rubricDimensions.length > 0 ? `评分维度 ${rubricDimensions.length} 项` : '',
        evidenceRequirementCount > 0 ? `证据要求 ${evidenceRequirementCount} 项` : '',
        deliverableCount > 0 ? `交付物 ${deliverableCount} 类` : '',
        milestoneCount > 0 ? `关键节点 ${milestoneCount} 个` : '',
      ].filter(Boolean)

      return {
        contestId,
        contestName: contest?.name || contestId || '未命名竞赛',
        trackId,
        trackName: track?.name || trackId || '未命名赛道',
        difficultyScore,
        difficultyLevel: resolveDifficultyLevel(difficultyScore),
        completionRate,
        sampleProjectCount,
        completedProjectCount,
        inProgressProjectCount,
        draftProjectCount,
        rubricDimensionCount: rubricDimensions.length,
        evidenceRequirementCount,
        deliverableCount,
        milestoneCount,
        workloadPressure,
        summary: structureParts.length > 0
          ? `${structureParts.slice(0, 3).join('、')} 会直接抬高执行门槛，${sampleProjectCount > 0 ? `当前平台内样本完成率约 ${completionRate}%。` : '当前还缺少稳定的完成率样本。'}`
          : `${sampleProjectCount > 0 ? `当前平台内样本完成率约 ${completionRate}%，难度主要按项目工作量保守估算。` : '当前主要按项目工作量与时间节点保守估算难度。'}`,
      } satisfies AnalyticsDifficultyTrackItem
    })
    .filter(item => item.trackId || item.trackName)
    .sort((left, right) => right.difficultyScore - left.difficultyScore || right.sampleProjectCount - left.sampleProjectCount || left.completionRate - right.completionRate)
    .slice(0, 8)
}

function buildDifficultySummary(snapshot: AnalyticsSnapshot, tracks: AnalyticsDifficultyTrackItem[]): string {
  if (tracks.length === 0) {
    return snapshot.projects.length > 0
      ? '当前可见项目已经纳入分析范围，但赛道绑定与评分规则样本仍不足，题目难度暂以保守估算为主。'
      : '当前范围内还没有可用于估算难度与完成率的题目样本。'
  }

  const sampledTracks = tracks.filter(item => item.sampleProjectCount > 0)
  const hardestTrack = tracks[0]
  if (!hardestTrack)
    return '当前范围内还没有可用于估算难度与完成率的题目样本。'
  const easiestTrack = sampledTracks.length > 0
    ? [...sampledTracks].sort((left, right) => right.completionRate - left.completionRate)[0]
    : null

  if (!easiestTrack) {
    return `当前识别到 ${tracks.length} 个题目方向，其中「${hardestTrack.trackName}」结构复杂度最高，完成率仍需更多项目样本补齐。`
  }

  if (hardestTrack.trackId === easiestTrack.trackId && hardestTrack.contestId === easiestTrack.contestId) {
    return `当前「${hardestTrack.trackName}」难度最高，平台内样本完成率约 ${hardestTrack.completionRate}%，建议优先核对交付物与证据要求。`
  }

  return `当前难度最高的方向是「${hardestTrack.trackName}」，完成率相对更高的是「${easiestTrack.trackName}」(${easiestTrack.completionRate}%)。`
}

async function loadContestTrends(db: Queryable, contestIds: string[], rangeStart: Date | null): Promise<ContestTrendRow[]> {
  if (contestIds.length === 0)
    return []

  const minYear = rangeStart ? rangeStart.getFullYear() : 0
  const result = await db.query<ContestTrendRow>(
    `SELECT contest_id, year, summary, hot_tags
     FROM contest_trends
     WHERE contest_id = ANY($1::TEXT[])
       AND year >= $2
     ORDER BY year DESC, updated_at DESC`,
    [contestIds, minYear],
  )
  return result.rows
}

async function loadContestResources(db: Queryable, contestIds: string[]): Promise<ContestResourceRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<ContestResourceRow>(
    `SELECT contest_id, category, title, summary, year
     FROM contest_resources
     WHERE contest_id = ANY($1::TEXT[])
       AND category = ANY($2::TEXT[])
       AND COALESCE(status, 'active') <> 'archived'
     ORDER BY year DESC, updated_at DESC`,
    [contestIds, ['awarded_works', 'past_questions', 'judge_guidelines', 'submission_examples', 'track_details']],
  )
  return result.rows
}

async function loadContestRubrics(db: Queryable, contestIds: string[]): Promise<ContestRubricRow[]> {
  if (contestIds.length === 0)
    return []

  const result = await db.query<ContestRubricRow>(
    `SELECT DISTINCT ON (contest_id, track_id)
      contest_id,
      track_id,
      scoring_mode,
      version,
      dimensions,
      scoring_points,
      deduction_items,
      evidence_requirements
     FROM contest_rubrics
     WHERE contest_id = ANY($1::TEXT[])
       AND COALESCE(status, 'draft') <> 'archived'
     ORDER BY
       contest_id,
       track_id,
       CASE
         WHEN status = 'published' THEN 0
         WHEN status = 'draft' THEN 1
         ELSE 2
       END,
       version DESC,
       updated_at DESC`,
    [contestIds],
  )
  return result.rows
}

async function loadTopicBoards(db: Queryable, projectIds: string[]): Promise<ProjectTopicBoardRow[]> {
  if (projectIds.length === 0)
    return []

  const result = await db.query<ProjectTopicBoardRow>(
    `SELECT id, project_id, contest_id, track_id, compare_matrix
     FROM project_topic_boards
     WHERE project_id = ANY($1::TEXT[])
       AND status = 'active'
     ORDER BY updated_at DESC`,
    [projectIds],
  )
  return result.rows
}

async function loadProjectContestBindings(db: Queryable, projectIds: string[]): Promise<ProjectContestBindingRow[]> {
  if (projectIds.length === 0)
    return []

  const result = await db.query<ProjectContestBindingRow>(
    `SELECT project_id, contest_id, track_id
     FROM project_contest_bindings
     WHERE project_id = ANY($1::TEXT[])`,
    [projectIds],
  )
  return result.rows
}

async function loadTopicCandidates(db: Queryable, boardIds: string[]): Promise<ProjectTopicCandidateRow[]> {
  if (boardIds.length === 0)
    return []

  const result = await db.query<ProjectTopicCandidateRow>(
    `SELECT board_id, project_id, decision_status, total_score, payload
     FROM project_topic_candidates
     WHERE board_id = ANY($1::TEXT[])
       AND decision_status <> 'rejected'
     ORDER BY total_score DESC, updated_at DESC`,
    [boardIds],
  )
  return result.rows
}

async function loadDocumentSucceededCount(db: Queryable, projectIds: string[]): Promise<number> {
  if (projectIds.length === 0)
    return 0

  const result = await db.query<DocumentStatsRow>(
    `SELECT COUNT(*)::TEXT AS succeeded
     FROM project_resource_documents
     WHERE project_id = ANY($1::TEXT[])
       AND parse_status = 'succeeded'`,
    [projectIds],
  )
  return toCount(result.rows[0]?.succeeded)
}

async function loadProjectDocumentAggregates(db: Queryable, projectIds: string[]): Promise<ProjectDocumentAggregateRow[]> {
  if (projectIds.length === 0)
    return []

  const result = await db.query<ProjectDocumentAggregateRow>(
    `SELECT
      project_id,
      COUNT(*)::TEXT AS total_count,
      COUNT(*) FILTER (WHERE parse_status = 'succeeded')::TEXT AS succeeded_count
     FROM project_resource_documents
     WHERE project_id = ANY($1::TEXT[])
     GROUP BY project_id`,
    [projectIds],
  )
  return result.rows
}

async function loadEventCount(db: Queryable, input: {
  user: AuthUser
  workspaceIds: string[]
  filters: AnalyticsResolvedFilters
  rangeStart: Date | null
}): Promise<number> {
  if (!input.user.isPlatformAdmin && !input.filters.workspaceId && !input.filters.projectId && input.workspaceIds.length === 0)
    return 0

  const values: unknown[] = []
  const where: string[] = []

  if (input.rangeStart) {
    values.push(input.rangeStart.toISOString())
    where.push(`created_at >= $${values.length}`)
  }
  if (input.filters.projectId) {
    values.push(input.filters.projectId)
    where.push(`project_id = $${values.length}`)
  }
  else if (input.filters.workspaceId) {
    values.push(input.filters.workspaceId)
    where.push(`workspace_id = $${values.length}`)
  }
  else if (!input.user.isPlatformAdmin && input.workspaceIds.length > 0) {
    values.push(input.workspaceIds)
    where.push(`workspace_id = ANY($${values.length}::TEXT[])`)
  }

  const result = await db.query<EventCountRow>(
    `SELECT COUNT(*)::TEXT AS count
     FROM analytics_events
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}`,
    values,
  )
  return toCount(result.rows[0]?.count)
}

async function loadAiUsageUnits(db: Queryable, input: {
  user: AuthUser
  workspaceIds: string[]
  filters: AnalyticsResolvedFilters
  rangeStart: Date | null
}): Promise<number> {
  if (!input.user.isPlatformAdmin && !input.filters.workspaceId && input.workspaceIds.length === 0)
    return 0

  const values: unknown[] = []
  const where: string[] = []

  if (input.rangeStart) {
    values.push(input.rangeStart.toISOString())
    where.push(`created_at >= $${values.length}`)
  }
  if (input.filters.workspaceId) {
    values.push(input.filters.workspaceId)
    where.push(`workspace_id = $${values.length}`)
  }
  else if (!input.user.isPlatformAdmin && input.workspaceIds.length > 0) {
    values.push(input.workspaceIds)
    where.push(`workspace_id = ANY($${values.length}::TEXT[])`)
  }

  const result = await db.query<AiUsageRow>(
    `SELECT COALESCE(SUM(units), 0)::TEXT AS total_units
     FROM ai_usage_ledger
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}`,
    values,
  )
  return toCount(result.rows[0]?.total_units)
}

async function loadSyncTaskCount(db: Queryable, input: {
  contestIds: string[]
  rangeStart: Date | null
}): Promise<number> {
  if (input.contestIds.length === 0)
    return 0

  const values: unknown[] = ['succeeded', 'entity_analysis', input.contestIds]
  let where = 'WHERE t.status = $1 AND t.task_type = $2'
  if (input.rangeStart) {
    values.push(input.rangeStart.toISOString())
    where += ` AND t.created_at >= $${values.length}`
  }

  const result = await db.query<SyncTaskCountRow>(
    `SELECT COUNT(*)::TEXT AS count
     FROM feishu_post_sync_tasks t
     LEFT JOIN contest_tracks track
       ON t.scope = 'track'
      AND track.id = t.entity_id
     LEFT JOIN contest_track_timelines timeline
       ON t.scope = 'track_timeline'
      AND timeline.id = t.entity_id
     LEFT JOIN contest_resources resource
       ON t.scope = 'resource'
      AND resource.id = t.entity_id
     ${where}
       AND (
         (t.scope = 'contest' AND t.entity_id = ANY($3::TEXT[]))
         OR (t.scope = 'track' AND track.contest_id = ANY($3::TEXT[]))
         OR (t.scope = 'track_timeline' AND timeline.contest_id = ANY($3::TEXT[]))
         OR (t.scope = 'resource' AND resource.contest_id = ANY($3::TEXT[]))
       )`,
    values,
  )
  return toCount(result.rows[0]?.count)
}

async function listAnalyticsContestCatalog(db: Queryable, includeInternal: boolean): Promise<Contest[]> {
  const contests: Contest[] = []
  const seen = new Set<string>()

  for (let page = 1; page <= 50; page += 1) {
    const result = await listContestLibrary(db, {
      includeInternal,
      sort: 'deadline',
      page,
      pageSize: 100,
    })
    for (const item of result.items) {
      if (!item.id || seen.has(item.id))
        continue
      seen.add(item.id)
      contests.push(item)
    }
    if (result.items.length < result.pageSize)
      break
  }

  return contests
}

async function resolveAnalyticsScope(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  requestedFilters: AnalyticsResolvedFilters
}): Promise<AnalyticsScopeResolution> {
  const [workspaceOptions, contestCatalog] = await Promise.all([
    input.user.isPlatformAdmin ? Promise.resolve([] as Array<{ workspace: { id: string, name: string } }>) : teamListUserWorkspaces(db, input.user.id),
    listAnalyticsContestCatalog(db, input.includeInternal),
  ])

  const filters: AnalyticsResolvedFilters = {
    ...input.requestedFilters,
  }
  const allowedWorkspaceIds = new Set(workspaceOptions.map(item => normalizeText(item.workspace.id)))
  const workspaceNameMap = new Map<string, string>(workspaceOptions.map(item => [item.workspace.id, item.workspace.name]))

  if (filters.workspaceId && !input.user.isPlatformAdmin && !allowedWorkspaceIds.has(filters.workspaceId))
    filters.workspaceId = ''

  const scopedProject = filters.projectId
    ? await getVisibleProjectById(db, input.user, filters.projectId)
    : null
  if (!scopedProject) {
    filters.projectId = ''
  }
  else {
    filters.projectId = scopedProject.id
    filters.workspaceId = normalizeText(scopedProject.workspaceId)
  }

  let projects = scopedProject
    ? [scopedProject]
    : await listVisibleProjects(db, input.user, filters.workspaceId || undefined)

  if (filters.contestId) {
    const contestScopedProjects = projects.filter(project => collectProjectContestIds(project).includes(filters.contestId))
    if (scopedProject && contestScopedProjects.length === 0)
      filters.contestId = ''
    else
      projects = contestScopedProjects
  }

  const visibleContestIds = uniqueStrings(projects.flatMap(project => collectProjectContestIds(project)))
  const contestCatalogIds = new Set(contestCatalog.map(item => item.id))
  if (filters.contestId && !contestCatalogIds.has(filters.contestId) && !visibleContestIds.includes(filters.contestId))
    filters.contestId = ''

  let contests = contestCatalog
  if (filters.contestId) {
    contests = contestCatalog.filter(item => item.id === filters.contestId)
  }
  else if (filters.workspaceId || filters.projectId) {
    contests = contestCatalog.filter(item => visibleContestIds.includes(item.id))
  }

  for (const project of projects) {
    const workspaceId = normalizeText(project.workspaceId)
    if (workspaceId && !workspaceNameMap.has(workspaceId))
      workspaceNameMap.set(workspaceId, workspaceId)
  }

  const workspaceIds = filters.workspaceId
    ? [filters.workspaceId]
    : uniqueStrings([
        ...projects.map(item => item.workspaceId || ''),
        ...workspaceOptions.map(item => item.workspace.id),
      ])

  return {
    filters,
    contests,
    projects,
    workspaceIds,
    workspaceNameMap,
  }
}

async function buildAnalyticsSnapshot(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsSnapshot> {
  const requestedFilters: AnalyticsResolvedFilters = {
    workspaceId: normalizeText(input.filters?.workspaceId),
    projectId: normalizeText(input.filters?.projectId),
    contestId: normalizeText(input.filters?.contestId),
    rangePreset: resolveRangePreset(input.filters?.rangePreset),
  }
  const rangeStart = resolveRangeStart(requestedFilters.rangePreset)
  const scope = await resolveAnalyticsScope(db, {
    user: input.user,
    includeInternal: input.includeInternal,
    requestedFilters,
  })
  const filters = scope.filters
  const contests = scope.contests
  const projects = scope.projects

  const contestIds = uniqueStrings([
    ...contests.map(item => item.id),
    ...projects.flatMap(item => collectProjectContestIds(item)),
  ])
  const projectIds = projects.map(item => item.id)
  const workspaceIds = scope.workspaceIds
  const workspaceNameMap = scope.workspaceNameMap

  const [trendRows, resourceRows, boardRows, docSucceededCount, eventCount, aiUsageUnits, syncTaskCount, loopDigests] = await Promise.all([
    loadContestTrends(db, contestIds, rangeStart),
    loadContestResources(db, contestIds),
    loadTopicBoards(db, projectIds),
    loadDocumentSucceededCount(db, projectIds),
    loadEventCount(db, { user: input.user, workspaceIds, filters, rangeStart }),
    loadAiUsageUnits(db, { user: input.user, workspaceIds, filters, rangeStart }),
    loadSyncTaskCount(db, { contestIds, rangeStart }),
    listProjectCompetitionLoopDigests(db, { projectIds }).catch(() => []),
  ])

  const candidateRows = await loadTopicCandidates(db, boardRows.map(item => item.id))
  const compareRows: ProjectCompareRow[] = boardRows.flatMap((board) => {
    return parseArray<TopicProposalCompareMatrixRow>(board.compare_matrix).map(item => ({
      ...item,
      projectId: board.project_id,
      contestId: board.contest_id,
      trackId: board.track_id,
    }))
  })

  return {
    filters,
    rangeStart,
    contests,
    projects,
    workspaceNameMap,
    trendRows,
    resourceRows,
    boardRows,
    candidateRows,
    compareRows,
    docSucceededCount,
    eventCount,
    aiUsageUnits,
    syncTaskCount,
    loopDigests,
    lastUpdatedAt: new Date().toISOString(),
  }
}

export async function getAnalyticsOverview(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsOverviewPayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const trendSeries = buildTrendSeries(snapshot.trendRows)
  const awardFeatureTags = buildAwardFeatureTags(snapshot.candidateRows, snapshot.resourceRows)
  const capabilityRadar = buildCapabilityRadar(snapshot, trendSeries.points[0]?.label || '')
  const preparationTimeline = buildPreparationTimeline(snapshot.contests, snapshot.rangeStart)
  const dataGaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: awardFeatureTags.length,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  })

  return {
    filters: snapshot.filters,
    scopeSummary: buildScopeSummary(snapshot),
    metricCards: [
      {
        id: 'contest-trends',
        label: '趋势样本',
        value: String(snapshot.trendRows.length),
        tone: 'blue',
        helpText: snapshot.trendRows.length > 0
          ? `覆盖 ${new Set(snapshot.trendRows.map(item => item.contest_id)).size} 个竞赛趋势记录。`
          : '当前范围内暂无趋势样本。',
      },
      {
        id: 'projects',
        label: '可见项目',
        value: String(snapshot.projects.length),
        tone: 'emerald',
        helpText: snapshot.projects.length > 0
          ? `其中已沉淀题目对比板 ${snapshot.boardRows.length} 个。`
          : '当前范围内暂无项目数据。',
      },
      {
        id: 'documents',
        label: '资料解析',
        value: String(snapshot.docSucceededCount),
        tone: 'amber',
        helpText: snapshot.docSucceededCount > 0
          ? '当前可用于支撑证据完备度和获奖特征分析。'
          : '项目资料尚未完成有效解析。',
      },
      {
        id: 'events',
        label: '行为事件',
        value: String(snapshot.eventCount),
        tone: 'violet',
        helpText: snapshot.eventCount > 0
          ? `近窗口累计 AI 调用 ${snapshot.aiUsageUnits} 单位。`
          : '尚未形成足够的正式行为事件样本。',
      },
    ],
    trendSeries,
    awardFeatureTags,
    capabilityRadar,
    preparationTimeline,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function getContestTrendAnalysis(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsTrendAnalysisPayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const keywordSeries = buildTrendSeries(snapshot.trendRows)
  const contests = buildTrendContestItems(snapshot.contests, snapshot.trendRows)
  const dataGaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: 1,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  }).filter(item => ['events', 'sync', 'healthy'].includes(item.id))

  return {
    filters: snapshot.filters,
    summary: contests.length > 0
      ? `当前趋势最强的竞赛包括 ${contests.slice(0, 3).map(item => item.contestName).join('、')}。`
      : '当前趋势样本仍然不足，建议优先补充竞赛趋势数据。',
    keywordSeries,
    contests,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function getAwardFeatureAnalysis(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsAwardFeatureAnalysisPayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const featureTags = buildAwardFeatureTags(snapshot.candidateRows, snapshot.resourceRows)
  const samples = buildAwardSamples(snapshot)
  const dataGaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: featureTags.length,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  }).filter(item => ['award-features', 'documents', 'healthy'].includes(item.id))

  return {
    filters: snapshot.filters,
    summary: featureTags.length > 0
      ? `当前高频特征集中在 ${featureTags.slice(0, 4).map(item => item.label).join('、')}。`
      : '当前还没有形成稳定的获奖共性标签。',
    featureTags,
    samples,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function getCapabilityProfileAnalysis(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsCapabilityProfilePayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const trendSeries = buildTrendSeries(snapshot.trendRows)
  const radar = buildCapabilityRadar(snapshot, trendSeries.points[0]?.label || '')
  const gapNotes = buildCapabilityGapNotes(snapshot)
  const projects = buildCapabilityProjects(snapshot)
  const dataGaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: 1,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  }).filter(item => ['topic-boards', 'documents', 'healthy'].includes(item.id))

  return {
    filters: snapshot.filters,
    summary: projects.length > 0
      ? `当前匹配度较高的项目包括 ${projects.slice(0, 3).map(item => item.title).join('、')}。`
      : '当前可见项目不足，能力画像仍以保守估算为主。',
    radar,
    gapNotes,
    projects,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function getDifficultyCompletionAnalysis(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsDifficultyCompletionPayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const [rubricRows, bindingRows, documentRows] = await Promise.all([
    loadContestRubrics(db, buildSnapshotContestIds(snapshot)),
    loadProjectContestBindings(db, buildSnapshotProjectIds(snapshot)),
    loadProjectDocumentAggregates(db, buildSnapshotProjectIds(snapshot)),
  ])

  const documentStatsMap = new Map(documentRows.map(item => [item.project_id, {
    total: toCount(item.total_count),
    succeeded: toCount(item.succeeded_count),
  }]))
  const tracks = buildDifficultyTrackItems(snapshot, {
    rubricRows,
    bindingRows,
  })
  const statusStats = buildDifficultyStatusStats(snapshot.projects)
  const bottlenecks = buildDifficultyBottlenecks(snapshot, documentStatsMap)
  const dataGaps = buildDifficultyDataGaps(snapshot, {
    trackCount: tracks.length,
    rubricCount: rubricRows.length,
    sampledTrackCount: tracks.filter(item => item.sampleProjectCount > 0).length,
  })

  return {
    filters: snapshot.filters,
    summary: buildDifficultySummary(snapshot, tracks),
    tracks,
    statusStats,
    bottlenecks,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function getPreparationCadenceAnalysis(db: Queryable, input: {
  user: AuthUser
  includeInternal: boolean
  filters?: AnalyticsFilterInput
}): Promise<AnalyticsPreparationCadencePayload> {
  const snapshot = await buildAnalyticsSnapshot(db, input)
  const timeline = buildPreparationTimeline(snapshot.contests, snapshot.rangeStart)
  const stageStats = buildPreparationStageStats(timeline)
  const upcomingContests = buildUpcomingContests(snapshot.contests)
  const dataGaps = buildDataGaps({
    eventCount: snapshot.eventCount,
    boardCount: snapshot.boardRows.length,
    featureCount: 1,
    docSucceededCount: snapshot.docSucceededCount,
    syncTaskCount: snapshot.syncTaskCount,
    loopDigestCount: snapshot.loopDigests.length,
  }).filter(item => ['events', 'healthy'].includes(item.id))

  return {
    filters: snapshot.filters,
    summary: timeline.length > 0
      ? `当前备赛节奏主要集中在 ${stageStats.slice(0, 3).map(item => item.phase).join('、')} 阶段。`
      : '当前时间轴节点不足，备赛节奏仍需依赖赛事库补充。',
    timeline,
    stageStats,
    upcomingContests,
    dataGaps,
    lastUpdatedAt: snapshot.lastUpdatedAt,
  }
}

export async function trackAnalyticsEvent(db: Queryable, input: {
  user: AuthUser
  payload: AnalyticsEventInput
}): Promise<AnalyticsTrackedEvent> {
  let workspaceId = normalizeText(input.payload.workspaceId)
  let projectId = normalizeText(input.payload.projectId)

  if (projectId) {
    const project = await getVisibleProjectById(db, input.user, projectId)
    if (!project)
      throw new Error('ANALYTICS_PROJECT_FORBIDDEN')
    projectId = project.id
    workspaceId = project.workspaceId || workspaceId
  }

  if (workspaceId) {
    const hasAccess = await teamHasWorkspaceMembership(db, input.user, workspaceId)
    if (!hasAccess)
      throw new Error('ANALYTICS_WORKSPACE_FORBIDDEN')
  }

  const record: AnalyticsTrackedEvent = {
    id: randomUUID(),
    workspaceId,
    projectId,
    userId: input.user.id,
    eventType: input.payload.eventType || 'page_view',
    eventName: normalizeText(input.payload.eventName),
    pageKey: normalizeText(input.payload.pageKey),
    entityType: normalizeText(input.payload.entityType) || 'unknown',
    entityId: normalizeText(input.payload.entityId),
    payload: input.payload.payload || {},
    createdAt: new Date().toISOString(),
  }

  await db.query(
    `INSERT INTO analytics_events (
      id,
      workspace_id,
      project_id,
      user_id,
      event_type,
      event_name,
      page_key,
      entity_type,
      entity_id,
      payload_json,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11
    )`,
    [
      record.id,
      record.workspaceId,
      record.projectId,
      record.userId,
      record.eventType,
      record.eventName,
      record.pageKey,
      record.entityType,
      record.entityId,
      JSON.stringify(record.payload || {}),
      record.createdAt,
    ],
  )

  return record
}
