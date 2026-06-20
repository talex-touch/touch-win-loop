export type AnalyticsRangePreset = '30d' | '90d' | '180d' | '365d' | 'all'
export type AnalyticsDetailView = 'overview' | 'trends' | 'awards' | 'profile' | 'difficulty' | 'preparation'
export type AnalyticsMetricTone = 'blue' | 'emerald' | 'amber' | 'violet'
export type AnalyticsEventType = 'page_view' | 'filter_change' | 'drilldown' | 'export'
export type AnalyticsEntityType = 'workspace' | 'project' | 'contest' | 'dashboard' | 'report' | 'unknown'
export type AnalyticsGapLevel = 'info' | 'warning' | 'critical'
export type AnalyticsTimelineIntensity = 'low' | 'medium' | 'high'
export type AnalyticsAwardSampleStatus = 'selected' | 'shortlisted' | 'candidate' | 'resource'
export type AnalyticsDifficultyLevel = 'balanced' | 'challenging' | 'advanced'
export type AnalyticsDifficultySeverity = 'low' | 'medium' | 'high'

export interface AnalyticsFilterInput {
  workspaceId?: string
  projectId?: string
  contestId?: string
  rangePreset?: AnalyticsRangePreset
}

export interface AnalyticsResolvedFilters {
  workspaceId: string
  projectId: string
  contestId: string
  rangePreset: AnalyticsRangePreset
}

export interface AnalyticsMetricCard {
  id: string
  label: string
  value: string
  tone: AnalyticsMetricTone
  helpText: string
}

export interface AnalyticsContestTrendPoint {
  label: string
  heatScore: number
  contestCount: number
  latestYear: number
  summary: string
}

export interface AnalyticsContestTrendSeries {
  title: string
  summary: string
  points: AnalyticsContestTrendPoint[]
}

export interface AnalyticsTrendContestItem {
  contestId: string
  contestName: string
  hotScore: number
  trendCount: number
  topKeywords: string[]
  signalSummary: string
}

export interface AnalyticsAwardFeatureTag {
  label: string
  weight: number
  evidenceCount: number
  description: string
}

export interface AnalyticsAwardFeatureSample {
  title: string
  source: string
  status: AnalyticsAwardSampleStatus
  score: number
  summary: string
}

export interface AnalyticsCapabilityRadarItem {
  key: string
  label: string
  score: number
  evidence: string
}

export interface AnalyticsCapabilityProjectItem {
  projectId: string
  title: string
  averageTeamMatch: number
  averageContestFit: number
  collegeCount: number
  advisorCount: number
  deliverableCount: number
}

export interface AnalyticsPreparationTimelineItem {
  id: string
  phase: string
  label: string
  timeText: string
  intensity: AnalyticsTimelineIntensity
  source: string
}

export interface AnalyticsPreparationStageStat {
  phase: string
  count: number
}

export interface AnalyticsDifficultyTrackItem {
  contestId: string
  contestName: string
  trackId: string
  trackName: string
  difficultyScore: number
  difficultyLevel: AnalyticsDifficultyLevel
  completionRate: number
  sampleProjectCount: number
  completedProjectCount: number
  inProgressProjectCount: number
  draftProjectCount: number
  rubricDimensionCount: number
  evidenceRequirementCount: number
  deliverableCount: number
  milestoneCount: number
  workloadPressure: number
  summary: string
}

export interface AnalyticsDifficultyStatusStat {
  status: 'draft' | 'in_progress' | 'completed'
  label: string
  count: number
}

export interface AnalyticsDifficultyBottleneckItem {
  id: string
  label: string
  severity: AnalyticsDifficultySeverity
  affectedProjectCount: number
  description: string
}

export interface AnalyticsUpcomingContestItem {
  contestId: string
  contestName: string
  stage: string
  deadlineText: string
  intensity: AnalyticsTimelineIntensity
}

export interface AnalyticsDataGap {
  id: string
  title: string
  description: string
  level: AnalyticsGapLevel
}

export interface AnalyticsOverviewPayload {
  filters: AnalyticsResolvedFilters
  scopeSummary: string
  metricCards: AnalyticsMetricCard[]
  trendSeries: AnalyticsContestTrendSeries
  awardFeatureTags: AnalyticsAwardFeatureTag[]
  capabilityRadar: AnalyticsCapabilityRadarItem[]
  preparationTimeline: AnalyticsPreparationTimelineItem[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsTrendAnalysisPayload {
  filters: AnalyticsResolvedFilters
  summary: string
  keywordSeries: AnalyticsContestTrendSeries
  contests: AnalyticsTrendContestItem[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsAwardFeatureAnalysisPayload {
  filters: AnalyticsResolvedFilters
  summary: string
  featureTags: AnalyticsAwardFeatureTag[]
  samples: AnalyticsAwardFeatureSample[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsCapabilityProfilePayload {
  filters: AnalyticsResolvedFilters
  summary: string
  radar: AnalyticsCapabilityRadarItem[]
  gapNotes: string[]
  projects: AnalyticsCapabilityProjectItem[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsDifficultyCompletionPayload {
  filters: AnalyticsResolvedFilters
  summary: string
  tracks: AnalyticsDifficultyTrackItem[]
  statusStats: AnalyticsDifficultyStatusStat[]
  bottlenecks: AnalyticsDifficultyBottleneckItem[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsPreparationCadencePayload {
  filters: AnalyticsResolvedFilters
  summary: string
  timeline: AnalyticsPreparationTimelineItem[]
  stageStats: AnalyticsPreparationStageStat[]
  upcomingContests: AnalyticsUpcomingContestItem[]
  dataGaps: AnalyticsDataGap[]
  lastUpdatedAt: string
}

export interface AnalyticsEventInput {
  workspaceId?: string
  projectId?: string
  eventType?: AnalyticsEventType
  eventName: string
  pageKey: string
  entityType?: AnalyticsEntityType
  entityId?: string
  payload?: Record<string, unknown>
}

export interface AnalyticsTrackedEvent {
  id: string
  workspaceId: string
  projectId: string
  userId: string
  eventType: AnalyticsEventType
  eventName: string
  pageKey: string
  entityType: string
  entityId: string
  payload: Record<string, unknown>
  createdAt: string
}
