import type {
  Contest,
  ContestTimeline,
  Project,
  ProjectIssueSeverity,
  ProjectIssueStatus,
  ProjectKnowledgeSourceStatus,
  Rubric,
  Track,
} from './domain'

export type ProjectCompetitionLoopStatus = 'empty' | 'ready' | 'attention' | 'blocked'
export type ProjectCompetitionLoopRiskSeverity = ProjectIssueSeverity
export type ProjectCompetitionLoopRiskStatus = 'open' | 'in_progress' | 'resolved' | 'ignored'
export type ProjectCompetitionLoopTaskStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'ignored'
export type ProjectCompetitionLoopTaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type ProjectCompetitionLoopSourceType
  = | 'contest'
    | 'track'
    | 'rubric'
    | 'profile'
    | 'knowledge'
    | 'deadline'
    | 'project_issue'
    | 'ai'
    | 'analytics'

export interface ProjectCompetitionLoopEvidence {
  label: string
  sourceType: ProjectCompetitionLoopSourceType | 'project' | 'resource'
  sourceId: string
  quote?: string
  url?: string
}

export interface ProjectCompetitionLoopRiskSignal {
  id: string
  workspaceId: string
  projectId: string
  contestId: string
  trackId: string
  sourceType: ProjectCompetitionLoopSourceType
  sourceId: string
  severity: ProjectCompetitionLoopRiskSeverity
  title: string
  summary: string
  evidence: ProjectCompetitionLoopEvidence[]
  status: ProjectCompetitionLoopRiskStatus
  createdAt: string
  updatedAt: string
}

export interface ProjectCompetitionLoopTask {
  id: string
  workspaceId: string
  projectId: string
  contestId: string
  trackId: string
  sourceType: ProjectCompetitionLoopSourceType
  sourceId: string
  title: string
  description: string
  priority: ProjectCompetitionLoopTaskPriority
  status: ProjectCompetitionLoopTaskStatus
  ownerUserId: string
  dueAt: string | null
  linkUrl: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ProjectCompetitionLoopKnowledgeSummary {
  status: 'empty' | 'ready' | 'processing' | 'failed' | 'stale'
  totalResources: number
  readyCount: number
  processingCount: number
  failedCount: number
  staleCount: number
  allReady: boolean
  latestIndexedAt: string
  failedReasons: string[]
  sourceStatuses: ProjectKnowledgeSourceStatus[]
}

export interface ProjectCompetitionLoopProfileSummary {
  completenessScore: number
  completedItems: string[]
  missingItems: string[]
  nextAction: string
}

export interface ProjectCompetitionLoopAnalysisSummary {
  matchScore: number
  rubricCoverageScore: number
  riskScore: number
  taskCompletionScore: number
  recommendations: string[]
  updatedAt: string
}

export interface ProjectCompetitionLoopDashboardSummary {
  trendPrediction: string
  personalizedRecommendation: string
  weeklySchedule: Array<{
    id: string
    title: string
    timeText: string
    source: ProjectCompetitionLoopSourceType
    sourceId: string
  }>
  competitiveness: Array<{
    key: string
    label: string
    score: number
    evidence: string
  }>
  openRiskCount: number
  openTaskCount: number
}

export interface ProjectCompetitionLoopSnapshotMeta {
  id: string
  status: ProjectCompetitionLoopStatus
  generatedAt: string
  refreshedAt: string
  persisted: boolean
}

export interface ProjectCompetitionLoopPayload {
  project: Project
  contest: {
    contestId: string
    trackId: string
    contest: Contest | null
    track: Track | null
    rubric: Rubric | null
    timelines: ContestTimeline[]
    bindingCount: number
    publishedVisible: boolean
  }
  profile: ProjectCompetitionLoopProfileSummary
  knowledge: ProjectCompetitionLoopKnowledgeSummary
  analysis: ProjectCompetitionLoopAnalysisSummary
  risks: ProjectCompetitionLoopRiskSignal[]
  tasks: ProjectCompetitionLoopTask[]
  dashboard: ProjectCompetitionLoopDashboardSummary
  snapshot: ProjectCompetitionLoopSnapshotMeta
}

export interface ProjectCompetitionLoopDigest {
  projectId: string
  workspaceId: string
  contestId: string
  trackId: string
  status: ProjectCompetitionLoopStatus
  matchScore: number
  riskScore: number
  openRiskCount: number
  openTaskCount: number
  knowledgeStatus: ProjectCompetitionLoopKnowledgeSummary['status']
  refreshedAt: string
}
