import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectCompetitionLoopAnalysisSummary,
  ProjectCompetitionLoopDashboardSummary,
  ProjectCompetitionLoopDigest,
  ProjectCompetitionLoopEvidence,
  ProjectCompetitionLoopKnowledgeSummary,
  ProjectCompetitionLoopPayload,
  ProjectCompetitionLoopProfileSummary,
  ProjectCompetitionLoopRiskSeverity,
  ProjectCompetitionLoopRiskSignal,
  ProjectCompetitionLoopRiskStatus,
  ProjectCompetitionLoopSourceType,
  ProjectCompetitionLoopStatus,
  ProjectCompetitionLoopTask,
  ProjectCompetitionLoopTaskPriority,
  ProjectCompetitionLoopTaskStatus,
} from '~~/shared/types/project-competition-loop'
import type {
  AuthUser,
  ContestDetailPayload,
  Project,
  ProjectIssue,
  ProjectKnowledgeIndexDashboard,
  Rubric,
  Track,
} from '~~/shared/types/domain'
import { createHash, randomUUID } from 'node:crypto'
import { getContestDetail } from '~~/server/utils/contest-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { listProjectIssuesByProject } from '~~/server/utils/project-ai-store'
import { buildProjectKnowledgeIndexDashboard } from '~~/server/utils/project-knowledge-store'

interface ProjectRiskSignalRow {
  id: string
  workspace_id: string
  project_id: string
  contest_id: string
  track_id: string
  source_type: ProjectCompetitionLoopSourceType
  source_id: string
  severity: ProjectCompetitionLoopRiskSeverity
  title: string
  summary: string
  evidence_json: unknown
  status: ProjectCompetitionLoopRiskStatus
  created_at: string
  updated_at: string
}

interface ProjectTaskRow {
  id: string
  workspace_id: string
  project_id: string
  contest_id: string
  track_id: string
  source_type: ProjectCompetitionLoopSourceType
  source_id: string
  title: string
  description: string
  priority: ProjectCompetitionLoopTaskPriority
  status: ProjectCompetitionLoopTaskStatus
  owner_user_id: string
  due_at: string | null
  link_url: string
  metadata_json: unknown
  created_at: string
  updated_at: string
  completed_at: string | null
}

interface ProjectCompetitionLoopSnapshotRow {
  id: string
  workspace_id: string
  project_id: string
  contest_id: string
  track_id: string
  status: ProjectCompetitionLoopStatus
  summary_json: unknown
  generated_at: string
  updated_at: string
}

interface RiskDraft {
  sourceType: ProjectCompetitionLoopSourceType
  sourceId: string
  severity: ProjectCompetitionLoopRiskSeverity
  title: string
  summary: string
  evidence: ProjectCompetitionLoopEvidence[]
}

interface TaskDraft {
  sourceType: ProjectCompetitionLoopSourceType
  sourceId: string
  title: string
  description: string
  priority: ProjectCompetitionLoopTaskPriority
  dueAt: string | null
  linkUrl: string
  metadata: Record<string, unknown>
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
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

function normalizeArray<T>(value: unknown): T[] {
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

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value))
    return min
  return Math.max(min, Math.min(max, value))
}

function stableId(prefix: string, parts: unknown[]): string {
  const hash = createHash('sha1')
    .update(parts.map(part => normalizeText(part)).join('|'))
    .digest('hex')
    .slice(0, 16)
  return `${prefix}-${hash}`
}

function parseDate(value: unknown): Date | null {
  const normalized = normalizeText(value)
  if (!normalized)
    return null
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
  const parsed = new Date(isDateOnly ? `${normalized}T23:59:00+08:00` : normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysUntil(value: unknown): number | null {
  const date = parseDate(value)
  if (!date)
    return null
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function severityWeight(severity: ProjectCompetitionLoopRiskSeverity): number {
  if (severity === 'critical')
    return 32
  if (severity === 'high')
    return 22
  if (severity === 'medium')
    return 12
  return 6
}

function priorityFromSeverity(severity: ProjectCompetitionLoopRiskSeverity): ProjectCompetitionLoopTaskPriority {
  if (severity === 'critical')
    return 'urgent'
  if (severity === 'high')
    return 'high'
  if (severity === 'low')
    return 'low'
  return 'medium'
}

function statusFromRisks(risks: ProjectCompetitionLoopRiskSignal[]): ProjectCompetitionLoopStatus {
  const open = risks.filter(item => item.status !== 'resolved' && item.status !== 'ignored')
  if (open.some(item => item.severity === 'critical'))
    return 'blocked'
  if (open.length > 0)
    return 'attention'
  return 'ready'
}

function mapRiskSignal(row: ProjectRiskSignalRow): ProjectCompetitionLoopRiskSignal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    contestId: row.contest_id,
    trackId: row.track_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    evidence: normalizeArray<ProjectCompetitionLoopEvidence>(row.evidence_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTask(row: ProjectTaskRow): ProjectCompetitionLoopTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    contestId: row.contest_id,
    trackId: row.track_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    ownerUserId: row.owner_user_id,
    dueAt: row.due_at,
    linkUrl: row.link_url,
    metadata: normalizeRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

function findSelectedRubric(detail: ContestDetailPayload | null, track: Track | null): Rubric | null {
  if (!detail || !track)
    return null

  const rubricId = normalizeText(track.rubricId)
  if (rubricId) {
    const matched = detail.rubrics.find(item => item.id === rubricId)
    if (matched)
      return matched
  }

  return detail.rubrics.find(item => item.trackId === track.id) || null
}

function buildProfileSummary(project: Project): ProjectCompetitionLoopProfileSummary {
  const checks = [
    { key: 'problem', label: '项目痛点', ready: Boolean(normalizeText(project.problemStatement)) },
    { key: 'innovation', label: '创新点', ready: project.innovationPoints.length > 0 },
    { key: 'tech', label: '技术路线', ready: project.techRouteSteps.length > 0 },
    { key: 'deliverables', label: '交付物', ready: project.deliverables.length > 0 },
    { key: 'contest', label: '赛事/赛道绑定', ready: Boolean(normalizeText(project.contestId) && normalizeText(project.trackId)) },
    { key: 'team', label: '团队/指导老师', ready: project.collegeBindings.length > 0 || project.advisorBindings.length > 0 },
  ]

  const completedItems = checks.filter(item => item.ready).map(item => item.label)
  const missingItems = checks.filter(item => !item.ready).map(item => item.label)
  return {
    completenessScore: clamp(Math.round((completedItems.length / checks.length) * 100)),
    completedItems,
    missingItems,
    nextAction: missingItems[0] ? `补全${missingItems[0]}` : '进入提交与答辩准备',
  }
}

function buildKnowledgeSummary(dashboard: ProjectKnowledgeIndexDashboard | null): ProjectCompetitionLoopKnowledgeSummary {
  if (!dashboard) {
    return {
      status: 'empty',
      totalResources: 0,
      readyCount: 0,
      processingCount: 0,
      failedCount: 0,
      staleCount: 0,
      allReady: false,
      latestIndexedAt: '',
      failedReasons: [],
      sourceStatuses: [],
    }
  }

  const sourceStatuses = dashboard.sources.map(item => item.status)
  const failedReasons = dashboard.failed
    .map(item => normalizeText(item.lastError || item.lastErrorStage))
    .filter(Boolean)
    .slice(0, 5)
  const latestIndexedAt = dashboard.recentCompleted
    .map(item => normalizeText(item.lastIndexedAt || item.updatedAt))
    .filter(Boolean)
    .sort()
    .at(-1) || ''

  const status: ProjectCompetitionLoopKnowledgeSummary['status'] = dashboard.summary.totalResources === 0
    ? 'empty'
    : dashboard.summary.failedCount > 0
      ? 'failed'
      : dashboard.summary.processingCount > 0 || dashboard.summary.pendingCount > 0 || dashboard.summary.queuedCount > 0
        ? 'processing'
        : dashboard.summary.staleCount > 0
          ? 'stale'
          : 'ready'

  return {
    status,
    totalResources: dashboard.summary.totalResources,
    readyCount: dashboard.summary.readyCount,
    processingCount: dashboard.summary.processingCount + dashboard.summary.pendingCount + dashboard.summary.queuedCount,
    failedCount: dashboard.summary.failedCount,
    staleCount: dashboard.summary.staleCount,
    allReady: dashboard.analytics.allReady && status === 'ready',
    latestIndexedAt,
    failedReasons,
    sourceStatuses,
  }
}

function deriveRiskDrafts(input: {
  project: Project
  detail: ContestDetailPayload | null
  track: Track | null
  rubric: Rubric | null
  profile: ProjectCompetitionLoopProfileSummary
  knowledge: ProjectCompetitionLoopKnowledgeSummary
  issues: ProjectIssue[]
}): RiskDraft[] {
  const risks: RiskDraft[] = []
  const { project, detail, track, rubric, profile, knowledge, issues } = input

  if (!detail) {
    risks.push({
      sourceType: 'contest',
      sourceId: project.contestId || 'missing-contest',
      severity: 'critical',
      title: '赛事上下文不可见',
      summary: '当前项目绑定的赛事未能从已发布赛事库读取，项目台、AI 和看板无法形成统一口径。',
      evidence: [{ label: '项目赛事绑定', sourceType: 'project', sourceId: project.id, quote: project.contestId }],
    })
  }

  if (detail && !track) {
    risks.push({
      sourceType: 'track',
      sourceId: project.trackId || 'missing-track',
      severity: 'high',
      title: '赛道绑定缺失或失效',
      summary: '项目当前赛道不在赛事详情中，评分规则与提交材料无法精确匹配。',
      evidence: [{ label: detail.contest.name, sourceType: 'contest', sourceId: detail.contest.id }],
    })
  }

  if (track && !rubric) {
    risks.push({
      sourceType: 'rubric',
      sourceId: track.id,
      severity: 'medium',
      title: '评分规则未就绪',
      summary: '当前赛道缺少可用 rubric，综合分析只能使用项目画像做弱匹配。',
      evidence: [{ label: track.name, sourceType: 'track', sourceId: track.id }],
    })
  }

  if (profile.missingItems.length > 0) {
    risks.push({
      sourceType: 'profile',
      sourceId: project.id,
      severity: profile.completenessScore < 50 ? 'high' : 'medium',
      title: '项目画像不完整',
      summary: `缺少：${profile.missingItems.join('、')}。`,
      evidence: profile.missingItems.map(item => ({
        label: item,
        sourceType: 'project',
        sourceId: project.id,
      })),
    })
  }

  if (knowledge.status === 'empty') {
    risks.push({
      sourceType: 'knowledge',
      sourceId: project.id,
      severity: 'medium',
      title: '资料中心尚未形成知识库',
      summary: '当前项目没有可用知识索引，AI 分析缺少可追溯 evidence。',
      evidence: [{ label: '知识库状态', sourceType: 'knowledge', sourceId: project.id, quote: knowledge.status }],
    })
  }
  else if (knowledge.status === 'failed') {
    risks.push({
      sourceType: 'knowledge',
      sourceId: project.id,
      severity: 'high',
      title: '知识库索引存在失败项',
      summary: knowledge.failedReasons[0] || '部分资料索引失败，需要重新解析或排查 worker。',
      evidence: knowledge.failedReasons.map(reason => ({ label: '索引失败', sourceType: 'knowledge', sourceId: project.id, quote: reason })),
    })
  }
  else if (knowledge.status === 'processing' || knowledge.status === 'stale') {
    risks.push({
      sourceType: 'knowledge',
      sourceId: project.id,
      severity: 'low',
      title: '知识库仍在刷新',
      summary: 'AI 引用会优先使用已有资料，但 relations / semantic analytics 可能滞后。',
      evidence: [{ label: '知识库状态', sourceType: 'knowledge', sourceId: project.id, quote: knowledge.status }],
    })
  }

  const deadlineDays = daysUntil(detail?.contest.submissionDeadline)
  if (deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14) {
    risks.push({
      sourceType: 'deadline',
      sourceId: detail?.contest.id || project.contestId,
      severity: deadlineDays <= 3 ? 'critical' : 'high',
      title: '提交截止临近',
      summary: `距离提交截止还有 ${deadlineDays} 天，需要锁定材料、任务和答辩准备。`,
      evidence: [{ label: '提交截止', sourceType: 'contest', sourceId: detail?.contest.id || project.contestId, quote: detail?.contest.submissionDeadline }],
    })
  }

  for (const issue of issues.filter(item => item.status !== 'resolved' && item.status !== 'ignored').slice(0, 12)) {
    risks.push({
      sourceType: 'project_issue',
      sourceId: issue.id,
      severity: issue.severity,
      title: issue.title,
      summary: issue.recommendation || issue.evidence || 'AI 寻疑报告已标记该问题。',
      evidence: [{ label: 'AI 寻疑', sourceType: 'ai', sourceId: issue.reportId, quote: issue.evidence }],
    })
  }

  return risks
}

function mergeRiskSignals(input: {
  project: Project
  contestId: string
  trackId: string
  drafts: RiskDraft[]
  stored: ProjectCompetitionLoopRiskSignal[]
}): ProjectCompetitionLoopRiskSignal[] {
  const storedByKey = new Map(storedKeyed(input.stored))
  const now = new Date().toISOString()
  const merged: ProjectCompetitionLoopRiskSignal[] = input.drafts.map((draft) => {
    const key = riskKey(draft)
    const stored = storedByKey.get(key)
    return stored || {
      id: stableId('risk', [input.project.id, key]),
      workspaceId: input.project.workspaceId || input.project.teamId,
      projectId: input.project.id,
      contestId: input.contestId,
      trackId: input.trackId,
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      severity: draft.severity,
      title: draft.title,
      summary: draft.summary,
      evidence: draft.evidence,
      status: 'open' as const,
      createdAt: now,
      updatedAt: now,
    }
  })

  const draftKeys = new Set(input.drafts.map(riskKey))
  return [
    ...merged,
    ...input.stored.filter(item => !draftKeys.has(riskKey(item)) && item.status !== 'resolved' && item.status !== 'ignored'),
  ].sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity) || right.updatedAt.localeCompare(left.updatedAt))
}

function riskKey(item: Pick<ProjectCompetitionLoopRiskSignal | RiskDraft, 'sourceType' | 'sourceId' | 'title'>): string {
  return `${item.sourceType}:${normalizeText(item.sourceId)}:${normalizeText(item.title)}`
}

function taskKey(item: Pick<ProjectCompetitionLoopTask | TaskDraft, 'sourceType' | 'sourceId' | 'title'>): string {
  return `${item.sourceType}:${normalizeText(item.sourceId)}:${normalizeText(item.title)}`
}

function storedKeyed<T extends Pick<ProjectCompetitionLoopRiskSignal, 'sourceType' | 'sourceId' | 'title'>>(items: T[]): Array<[string, T]> {
  return items.map(item => [riskKey(item), item])
}

function buildTaskDraftsFromRisks(risks: ProjectCompetitionLoopRiskSignal[]): TaskDraft[] {
  return risks
    .filter(item => item.status !== 'resolved' && item.status !== 'ignored')
    .map((risk) => ({
      sourceType: risk.sourceType,
      sourceId: risk.sourceId,
      title: `处理：${risk.title}`,
      description: risk.summary,
      priority: priorityFromSeverity(risk.severity),
      dueAt: null,
      linkUrl: risk.sourceType === 'project_issue'
        ? `#issue-${risk.sourceId}`
        : '#competition-loop',
      metadata: {
        riskId: risk.id,
        severity: risk.severity,
        evidence: risk.evidence,
      },
    }))
}

function mergeTasks(input: {
  project: Project
  contestId: string
  trackId: string
  drafts: TaskDraft[]
  stored: ProjectCompetitionLoopTask[]
}): ProjectCompetitionLoopTask[] {
  const storedByKey = new Map(input.stored.map(item => [taskKey(item), item]))
  const now = new Date().toISOString()
  const merged: ProjectCompetitionLoopTask[] = input.drafts.map((draft) => {
    const key = taskKey(draft)
    const stored = storedByKey.get(key)
    return stored || {
      id: stableId('task', [input.project.id, key]),
      workspaceId: input.project.workspaceId || input.project.teamId,
      projectId: input.project.id,
      contestId: input.contestId,
      trackId: input.trackId,
      sourceType: draft.sourceType,
      sourceId: draft.sourceId,
      title: draft.title,
      description: draft.description,
      priority: draft.priority,
      status: 'todo' as const,
      ownerUserId: '',
      dueAt: draft.dueAt,
      linkUrl: draft.linkUrl,
      metadata: draft.metadata,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
  })
  const draftKeys = new Set(input.drafts.map(taskKey))
  return [
    ...merged,
    ...input.stored.filter(item => !draftKeys.has(taskKey(item)) && item.status !== 'done' && item.status !== 'ignored'),
  ].sort((left, right) => {
    const order: Record<ProjectCompetitionLoopTaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
    return order[right.priority] - order[left.priority] || right.updatedAt.localeCompare(left.updatedAt)
  })
}

function buildAnalysisSummary(input: {
  project: Project
  rubric: Rubric | null
  profile: ProjectCompetitionLoopProfileSummary
  knowledge: ProjectCompetitionLoopKnowledgeSummary
  risks: ProjectCompetitionLoopRiskSignal[]
  tasks: ProjectCompetitionLoopTask[]
}): ProjectCompetitionLoopAnalysisSummary {
  const rubricDimensionCount = input.rubric?.dimensions.length || 0
  const rubricCoverageScore = rubricDimensionCount > 0
    ? clamp(Math.round((input.project.scoringMapping.length / rubricDimensionCount) * 100))
    : (input.project.scoringMapping.length > 0 ? 70 : 35)
  const knowledgeScore = input.knowledge.status === 'ready'
    ? 100
    : input.knowledge.status === 'processing' || input.knowledge.status === 'stale'
      ? 60
      : input.knowledge.status === 'failed'
        ? 25
        : 20
  const riskPenalty = input.risks
    .filter(item => item.status !== 'resolved' && item.status !== 'ignored')
    .reduce((sum, item) => sum + severityWeight(item.severity), 0)
  const riskScore = clamp(100 - riskPenalty)
  const actionableTasks = input.tasks.filter(item => item.status !== 'ignored')
  const doneTasks = actionableTasks.filter(item => item.status === 'done').length
  const taskCompletionScore = actionableTasks.length > 0
    ? clamp(Math.round((doneTasks / actionableTasks.length) * 100))
    : 100
  const matchScore = clamp(Math.round((input.profile.completenessScore + rubricCoverageScore + knowledgeScore + riskScore) / 4))
  const recommendations = [
    input.profile.nextAction,
    rubricDimensionCount > 0 ? '按 rubric 逐项补齐证明材料' : '补齐赛道评分规则后再做强匹配',
    input.knowledge.allReady ? '使用资料 evidence 生成提交稿' : '等待知识库 ready 后再运行 AI 深度分析',
  ]

  return {
    matchScore,
    rubricCoverageScore,
    riskScore,
    taskCompletionScore,
    recommendations,
    updatedAt: new Date().toISOString(),
  }
}

function buildDashboardSummary(input: {
  detail: ContestDetailPayload | null
  profile: ProjectCompetitionLoopProfileSummary
  knowledge: ProjectCompetitionLoopKnowledgeSummary
  analysis: ProjectCompetitionLoopAnalysisSummary
  risks: ProjectCompetitionLoopRiskSignal[]
  tasks: ProjectCompetitionLoopTask[]
}): ProjectCompetitionLoopDashboardSummary {
  const openRisks = input.risks.filter(item => item.status !== 'resolved' && item.status !== 'ignored')
  const openTasks = input.tasks.filter(item => item.status !== 'done' && item.status !== 'ignored')
  const deadline = input.detail?.contest.submissionDeadline || ''
  const timelineItems = input.detail?.timelines
    .filter(item => item.startAt || item.endAt)
    .slice(0, 4)
    .map(item => ({
      id: item.id,
      title: item.note || `${input.detail?.contest.name || '赛事'} ${item.nodeType}`,
      timeText: item.endAt || item.startAt || '时间待补充',
      source: 'contest' as const,
      sourceId: item.contestId,
    })) || []

  return {
    trendPrediction: input.detail
      ? `${input.detail.contest.name} 当前匹配度 ${input.analysis.matchScore}，建议优先处理 ${openRisks[0]?.title || '提交材料完整度'}。`
      : '赛事上下文不可见，趋势预测等待赛事发布后刷新。',
    personalizedRecommendation: input.analysis.recommendations[0] || '继续完善项目画像。',
    weeklySchedule: [
      ...(deadline ? [{
        id: `deadline-${input.detail?.contest.id || 'contest'}`,
        title: `${input.detail?.contest.name || '赛事'} 提交截止`,
        timeText: deadline,
        source: 'deadline' as const,
        sourceId: input.detail?.contest.id || '',
      }] : []),
      ...timelineItems,
      ...openTasks.slice(0, 3).map(item => ({
        id: item.id,
        title: item.title,
        timeText: item.dueAt || '待排期',
        source: item.sourceType,
        sourceId: item.sourceId,
      })),
    ].slice(0, 8),
    competitiveness: [
      {
        key: 'profile',
        label: '画像完整度',
        score: input.profile.completenessScore,
        evidence: input.profile.missingItems.length > 0 ? `缺少 ${input.profile.missingItems.join('、')}` : '项目画像完整',
      },
      {
        key: 'rubric',
        label: '规则覆盖',
        score: input.analysis.rubricCoverageScore,
        evidence: '基于当前赛道 rubric 与 scoring mapping 计算',
      },
      {
        key: 'knowledge',
        label: '资料证据',
        score: input.knowledge.allReady ? 100 : input.knowledge.readyCount > 0 ? 65 : 20,
        evidence: `资料 ${input.knowledge.readyCount}/${input.knowledge.totalResources} ready`,
      },
    ],
    openRiskCount: openRisks.length,
    openTaskCount: openTasks.length,
  }
}

async function listStoredRisks(db: Queryable, projectId: string): Promise<ProjectCompetitionLoopRiskSignal[]> {
  const result = await db.query<ProjectRiskSignalRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      source_type,
      source_id,
      severity,
      title,
      summary,
      evidence_json,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_risk_signals
     WHERE project_id = $1
     ORDER BY updated_at DESC
     LIMIT 200`,
    [projectId],
  )
  return result.rows.map(mapRiskSignal)
}

async function listStoredTasks(db: Queryable, projectId: string): Promise<ProjectCompetitionLoopTask[]> {
  const result = await db.query<ProjectTaskRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      source_type,
      source_id,
      title,
      description,
      priority,
      status,
      owner_user_id,
      due_at::TEXT,
      link_url,
      metadata_json,
      created_at::TEXT,
      updated_at::TEXT,
      completed_at::TEXT
     FROM project_tasks
     WHERE project_id = $1
     ORDER BY updated_at DESC
     LIMIT 300`,
    [projectId],
  )
  return result.rows.map(mapTask)
}

async function upsertRisks(
  db: Queryable,
  input: {
    project: Project
    contestId: string
    trackId: string
    drafts: RiskDraft[]
  },
): Promise<ProjectCompetitionLoopRiskSignal[]> {
  const workspaceId = input.project.workspaceId || input.project.teamId
  for (const draft of input.drafts) {
    await db.query(
      `INSERT INTO project_risk_signals (
        id,
        workspace_id,
        project_id,
        contest_id,
        track_id,
        source_type,
        source_id,
        severity,
        title,
        summary,
        evidence_json,
        status,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, 'open', NOW(), NOW()
      )
      ON CONFLICT (project_id, source_type, COALESCE(source_id, ''), title)
      DO UPDATE SET
        contest_id = EXCLUDED.contest_id,
        track_id = EXCLUDED.track_id,
        severity = EXCLUDED.severity,
        summary = EXCLUDED.summary,
        evidence_json = EXCLUDED.evidence_json,
        status = CASE
          WHEN project_risk_signals.status IN ('resolved', 'ignored') THEN project_risk_signals.status
          ELSE EXCLUDED.status
        END,
        resolved_at = CASE
          WHEN project_risk_signals.status IN ('resolved', 'ignored') THEN project_risk_signals.resolved_at
          ELSE NULL
        END,
        updated_at = NOW()`,
      [
        randomUUID(),
        workspaceId,
        input.project.id,
        input.contestId,
        input.trackId,
        draft.sourceType,
        draft.sourceId,
        draft.severity,
        draft.title,
        draft.summary,
        JSON.stringify(draft.evidence),
      ],
    )
  }
  return listStoredRisks(db, input.project.id)
}

async function upsertTasks(
  db: Queryable,
  input: {
    project: Project
    contestId: string
    trackId: string
    drafts: TaskDraft[]
  },
): Promise<ProjectCompetitionLoopTask[]> {
  const workspaceId = input.project.workspaceId || input.project.teamId
  for (const draft of input.drafts) {
    await db.query(
      `INSERT INTO project_tasks (
        id,
        workspace_id,
        project_id,
        contest_id,
        track_id,
        source_type,
        source_id,
        title,
        description,
        priority,
        status,
        due_at,
        link_url,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'todo', $11::TIMESTAMPTZ, $12, $13::JSONB, NOW(), NOW()
      )
      ON CONFLICT (project_id, source_type, COALESCE(source_id, ''), title)
      DO UPDATE SET
        contest_id = EXCLUDED.contest_id,
        track_id = EXCLUDED.track_id,
        description = EXCLUDED.description,
        priority = EXCLUDED.priority,
        due_at = COALESCE(project_tasks.due_at, EXCLUDED.due_at),
        link_url = EXCLUDED.link_url,
        metadata_json = EXCLUDED.metadata_json,
        status = CASE
          WHEN project_tasks.status IN ('done', 'ignored') THEN project_tasks.status
          ELSE project_tasks.status
        END,
        completed_at = CASE
          WHEN project_tasks.status = 'done' THEN project_tasks.completed_at
          ELSE NULL
        END,
        updated_at = NOW()`,
      [
        randomUUID(),
        workspaceId,
        input.project.id,
        input.contestId,
        input.trackId,
        draft.sourceType,
        draft.sourceId,
        draft.title,
        draft.description,
        draft.priority,
        draft.dueAt,
        draft.linkUrl,
        JSON.stringify(draft.metadata),
      ],
    )
  }
  return listStoredTasks(db, input.project.id)
}

async function latestSnapshotRow(db: Queryable, projectId: string): Promise<ProjectCompetitionLoopSnapshotRow | null> {
  const result = await db.query<ProjectCompetitionLoopSnapshotRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      status,
      summary_json,
      generated_at::TEXT,
      updated_at::TEXT
     FROM project_competition_loop_snapshots
     WHERE project_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [projectId],
  )
  return result.rows[0] || null
}

async function persistSnapshot(
  db: Queryable,
  payload: ProjectCompetitionLoopPayload,
): Promise<ProjectCompetitionLoopSnapshotRow> {
  const summary = {
    matchScore: payload.analysis.matchScore,
    riskScore: payload.analysis.riskScore,
    openRiskCount: payload.dashboard.openRiskCount,
    openTaskCount: payload.dashboard.openTaskCount,
    knowledgeStatus: payload.knowledge.status,
  }
  const result = await db.query<ProjectCompetitionLoopSnapshotRow>(
    `INSERT INTO project_competition_loop_snapshots (
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      status,
      snapshot_json,
      summary_json,
      generated_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::JSONB, $8::JSONB, NOW(), NOW(), NOW()
    )
    ON CONFLICT (project_id, contest_id, track_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      snapshot_json = EXCLUDED.snapshot_json,
      summary_json = EXCLUDED.summary_json,
      generated_at = NOW(),
      updated_at = NOW()
    RETURNING
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      status,
      summary_json,
      generated_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      payload.project.workspaceId || payload.project.teamId,
      payload.project.id,
      payload.contest.contestId,
      payload.contest.trackId,
      payload.snapshot.status,
      JSON.stringify(payload),
      JSON.stringify(summary),
    ],
  )
  return result.rows[0]!
}

export async function buildProjectCompetitionLoop(
  db: Queryable,
  input: {
    project: Project
    includeInternal?: boolean
    syncKnowledge?: boolean
    persist?: boolean
  },
): Promise<ProjectCompetitionLoopPayload> {
  const project = input.project
  const contestId = normalizeText(project.contestId)
  const trackId = normalizeText(project.trackId)
  const detail = contestId
    ? await getContestDetail(db, {
      contestId,
      includeInternal: Boolean(input.includeInternal),
    })
    : null
  const track = detail?.contest.tracks.find(item => item.id === trackId) || null
  const rubric = findSelectedRubric(detail, track)
  const profile = buildProfileSummary(project)
  const [knowledgeDashboard, issues, storedRisks, storedTasks, previousSnapshot] = await Promise.all([
    buildProjectKnowledgeIndexDashboard(db, {
      projectId: project.id,
      syncSources: input.syncKnowledge === true,
    }).catch(() => null),
    listProjectIssuesByProject(db, {
      projectId: project.id,
      statuses: ['open', 'in_progress', 'resolved', 'ignored'],
      limit: 200,
    }),
    listStoredRisks(db, project.id).catch(() => []),
    listStoredTasks(db, project.id).catch(() => []),
    latestSnapshotRow(db, project.id).catch(() => null),
  ])
  const knowledge = buildKnowledgeSummary(knowledgeDashboard)
  const riskDrafts = deriveRiskDrafts({
    project,
    detail,
    track,
    rubric,
    profile,
    knowledge,
    issues,
  })

  const risks = input.persist
    ? await upsertRisks(db, {
      project,
      contestId,
      trackId,
      drafts: riskDrafts,
    })
    : mergeRiskSignals({
      project,
      contestId,
      trackId,
      drafts: riskDrafts,
      stored: storedRisks,
    })
  const taskDrafts = buildTaskDraftsFromRisks(risks)
  const tasks = input.persist
    ? await upsertTasks(db, {
      project,
      contestId,
      trackId,
      drafts: taskDrafts,
    })
    : mergeTasks({
      project,
      contestId,
      trackId,
      drafts: taskDrafts,
      stored: storedTasks,
    })
  const analysis = buildAnalysisSummary({
    project,
    rubric,
    profile,
    knowledge,
    risks,
    tasks,
  })
  const dashboard = buildDashboardSummary({
    detail,
    profile,
    knowledge,
    analysis,
    risks,
    tasks,
  })
  const status = statusFromRisks(risks)
  const now = new Date().toISOString()
  const payload: ProjectCompetitionLoopPayload = {
    project,
    contest: {
      contestId,
      trackId,
      contest: detail?.contest || null,
      track,
      rubric,
      timelines: detail?.timelines || [],
      bindingCount: (project.contestIds || []).length,
      publishedVisible: Boolean(detail),
    },
    profile,
    knowledge,
    analysis,
    risks,
    tasks,
    dashboard,
    snapshot: {
      id: previousSnapshot?.id || '',
      status,
      generatedAt: now,
      refreshedAt: previousSnapshot?.updated_at || '',
      persisted: false,
    },
  }

  if (input.persist) {
    const snapshot = await persistSnapshot(db, payload)
    payload.snapshot = {
      id: snapshot.id,
      status: snapshot.status,
      generatedAt: snapshot.generated_at,
      refreshedAt: snapshot.updated_at,
      persisted: true,
    }
  }

  return payload
}

export async function getVisibleProjectCompetitionLoop(
  db: Queryable,
  input: {
    user: AuthUser
    projectId: string
    syncKnowledge?: boolean
    persist?: boolean
  },
): Promise<ProjectCompetitionLoopPayload | null> {
  const project = await getVisibleProjectById(db, input.user, input.projectId)
  if (!project)
    return null

  return buildProjectCompetitionLoop(db, {
    project,
    includeInternal: input.user.isPlatformAdmin,
    syncKnowledge: input.syncKnowledge,
    persist: input.persist,
  })
}

export async function listProjectCompetitionLoopDigests(
  db: Queryable,
  input: {
    projectIds: string[]
  },
): Promise<ProjectCompetitionLoopDigest[]> {
  const projectIds = Array.from(new Set(input.projectIds.map(normalizeText).filter(Boolean))).slice(0, 300)
  if (projectIds.length === 0)
    return []

  const result = await db.query<ProjectCompetitionLoopSnapshotRow>(
    `SELECT DISTINCT ON (project_id)
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      status,
      summary_json,
      generated_at::TEXT,
      updated_at::TEXT
     FROM project_competition_loop_snapshots
     WHERE project_id = ANY($1::TEXT[])
     ORDER BY project_id, updated_at DESC`,
    [projectIds],
  )

  return result.rows.map((row) => {
    const summary = normalizeRecord(row.summary_json)
    return {
      projectId: row.project_id,
      workspaceId: row.workspace_id,
      contestId: row.contest_id,
      trackId: row.track_id,
      status: row.status,
      matchScore: Number(summary.matchScore || 0),
      riskScore: Number(summary.riskScore || 0),
      openRiskCount: Number(summary.openRiskCount || 0),
      openTaskCount: Number(summary.openTaskCount || 0),
      knowledgeStatus: normalizeText(summary.knowledgeStatus) as ProjectCompetitionLoopDigest['knowledgeStatus'] || 'empty',
      refreshedAt: row.updated_at || row.generated_at,
    }
  })
}
