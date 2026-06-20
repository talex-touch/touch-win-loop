export type AdminOperationsTab = 'overview' | 'users' | 'content' | 'revenue' | 'efficiency' | 'meeting' | 'risks' | 'reports'
export type AdminOperationsTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type AdminOperationsHealth = 'healthy' | 'warning' | 'critical' | 'idle'
export type AdminRiskSeverity = 'critical' | 'high' | 'medium' | 'low'
export type AdminOperationsAiAnalysisStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stale'
export type AdminReportDatasetKey = 'users' | 'content' | 'revenue' | 'efficiency' | 'risks'
export type AdminReportFieldType = 'string' | 'number' | 'boolean' | 'datetime'
export type AdminReportFilterOperator = 'eq' | 'contains' | 'gte' | 'lte'
export type AdminReportMetricAggregation = 'sum' | 'avg' | 'count' | 'max'

export interface AdminOperationsMetricCard {
  key: string
  label: string
  value: number
  unit?: string
  tone?: AdminOperationsTone
  hint?: string
  detailPath?: string
}

export interface AdminOperationsTrendPoint {
  date: string
  newUsers: number
  activeUsers: number
  searchEvents: number
  governanceTasks: number
}

export interface AdminOperationsTodoItem {
  key: string
  label: string
  count: number
  tone: AdminOperationsTone
  description: string
  detailPath?: string
}

export interface AdminOperationsOverview {
  generatedAt: string
  cards: AdminOperationsMetricCard[]
  trend: AdminOperationsTrendPoint[]
  todos: AdminOperationsTodoItem[]
}

export interface AdminOperationsBucket {
  key: string
  label: string
  count: number
}

export interface AdminUserSegmentRow {
  userId: string
  username: string
  accountStatus: 'active' | 'disabled'
  isPlatformAdmin: boolean
  platformRoles: string[]
  primaryRole: string
  workspaceCount: number
  teamWorkspaceCount: number
  projectCount: number
  completedProjectCount: number
  activeSessionCount: number
  aiSessionCount30d: number
  aiMessageCount30d: number
  resourceSearchCount30d: number
  workspaceParticipationBand: string
  projectMaturityBand: string
  aiUsageBand: string
  searchActivityBand: string
  lastSeenAt: string | null
  createdAt: string
  detailPath?: string
}

export interface AdminUserSegmentSnapshot {
  generatedAt: string
  summary: {
    totalUsers: number
    activeUsers7d: number
    disabledUsers: number
    platformAdmins: number
    newUsers30d: number
  }
  dimensions: {
    accountStatus: AdminOperationsBucket[]
    platformRole: AdminOperationsBucket[]
    workspaceParticipation: AdminOperationsBucket[]
    projectMaturity: AdminOperationsBucket[]
    aiUsage: AdminOperationsBucket[]
    resourceSearchActivity: AdminOperationsBucket[]
  }
  users: AdminUserSegmentRow[]
}

export interface AdminContentResourceRow {
  resourceId: string
  contestId: string
  contestName: string
  title: string
  category: string
  status: string
  governanceStatus: string
  qualityScore: number
  valueScore: number
  hotScore: number
  searchCount30d: number
  clickCount30d: number
  updatedAt: string
  detailPath?: string
}

export interface AdminContentSearchInsight {
  query: string
  searchCount: number
  clickCount: number
  zeroResultCount: number
  ctr: number
}

export interface AdminContentGovernanceBacklogItem {
  taskType: string
  status: string
  count: number
}

export interface AdminContentAuditTrailItem {
  id: string
  contestId: string | null
  contestName: string
  resourceId: string | null
  resourceTitle: string
  actorUsername: string
  action: string
  createdAt: string
  detailPath?: string
}

export interface AdminContentTraceSnapshot {
  generatedAt: string
  summary: {
    contestCount: number
    resourceCount: number
    analyzedResourceCount: number
    reviewResourceCount: number
    governancePendingCount: number
    searchCount30d: number
    clickCount30d: number
    auditCount30d: number
    documentPendingCount: number
    documentFailedCount: number
  }
  categoryDistribution: AdminOperationsBucket[]
  governanceDistribution: AdminOperationsBucket[]
  resources: AdminContentResourceRow[]
  searchInsights: AdminContentSearchInsight[]
  governanceBacklog: AdminContentGovernanceBacklogItem[]
  recentAudits: AdminContentAuditTrailItem[]
}

export interface AdminRevenuePlanDistribution {
  planCode: string
  planName: string
  workspaceCount: number
  estimatedAmountCents: number
  estimatedAmountYuan: number
}

export interface AdminRevenueWorkspaceRow {
  workspaceId: string
  workspaceName: string
  workspaceType: string
  ownerUsername: string
  memberCount: number
  projectCount: number
  seatUsed: number
  seatLimit: number
  projectSeatUsedTotal: number
  projectSeatLimitTotal: number
  extraProjectSlots: number
  planId: string | null
  planCode: string
  planName: string
  billingCycle: string
  estimatedAmountCents: number
  estimatedAmountYuan: number
  billingUpdatedAt: string | null
  hasPlan: boolean
  isSeatOverLimit: boolean
  isProjectSeatOverLimit: boolean
  detailPath?: string
}

export interface AdminRevenueSnapshot {
  generatedAt: string
  summary: {
    teamWorkspaceCount: number
    planBoundWorkspaceCount: number
    noPlanWorkspaceCount: number
    overSeatWorkspaceCount: number
    estimatedAmountCents: number
    estimatedAmountYuan: number
    totalSeatUsed: number
    totalSeatLimit: number
    totalProjectSeatUsed: number
    totalProjectSeatLimit: number
    latestBillingUpdateAt: string | null
  }
  planDistribution: AdminRevenuePlanDistribution[]
  workspaces: AdminRevenueWorkspaceRow[]
}

export interface AdminEfficiencySystemSnapshot {
  key: string
  label: string
  health: AdminOperationsHealth
  throughput: number
  throughputLabel: string
  successRate: number
  backlog: number
  lastRunAt: string | null
  lastResult: string
  lastError: string
  detailPath?: string
}

export interface AdminEfficiencyFailureItem {
  id: string
  source: string
  title: string
  occurredAt: string | null
  reason: string
  detailPath?: string
}

export interface AdminEfficiencySnapshot {
  generatedAt: string
  summary: {
    previewSuccessRate24h: number
    previewQueuedCount: number
    previewOldestQueuedMinutes: number
    feishuRunCount7d: number
    feishuSuccessRate7d: number
    governancePendingCount: number
    aiActiveSessions7d: number
  }
  systems: AdminEfficiencySystemSnapshot[]
  recentFailures: AdminEfficiencyFailureItem[]
}

export interface AdminMeetingRuntimeServiceHealth {
  key: string
  label: string
  health: AdminOperationsHealth
  status: 'up' | 'down' | 'idle' | 'unknown'
  detail: string
  lastScrapeAt: string | null
}

export interface AdminMeetingRuntimeHostSnapshot {
  cpuUsagePercent: number
  memoryTotalBytes: number
  memoryUsedBytes: number
  memoryUsagePercent: number
  diskTotalBytes: number
  diskUsedBytes: number
  diskUsagePercent: number
  networkRxBytesPerSecond: number
  networkTxBytesPerSecond: number
  networkRxTotalBytes: number
  networkTxTotalBytes: number
}

export interface AdminMeetingRuntimeContainerRow {
  key: string
  label: string
  service: string
  health: AdminOperationsHealth
  cpuUsagePercent: number
  memoryUsageBytes: number
  networkRxBytesPerSecond: number
  networkTxBytesPerSecond: number
  networkRxTotalBytes: number
  networkTxTotalBytes: number
}

export interface AdminMeetingRuntimeLiveKitSnapshot {
  roomCount: number
  participantCount: number
  publishedTrackCount: number
  subscribedTrackCount: number
  inboundBytesPerSecond: number
  outboundBytesPerSecond: number
  packetLossPercent: number
  rttMs: number
}

export interface AdminMeetingRuntimeEgressSnapshot {
  activeTaskCount: number
  failedTaskCount: number
  cpuUsagePercent: number
  memoryUsageBytes: number
  outboundBytesPerSecond: number
}

export interface AdminMeetingRuntimeCapacitySnapshot {
  health: AdminOperationsHealth
  maxExpectedParticipants: number
  estimatedSafeParticipantCount: number
  bottleneck: string
  recommendation: string
}

export interface AdminMeetingRuntimeTrendPoint {
  time: string
  hostTxBytesPerSecond: number
  hostRxBytesPerSecond: number
  livekitTxBytesPerSecond: number
  livekitRxBytesPerSecond: number
}

export interface AdminMeetingRuntimeSnapshot {
  generatedAt: string
  prometheusBaseUrlConfigured: boolean
  health: AdminMeetingRuntimeServiceHealth[]
  host: AdminMeetingRuntimeHostSnapshot
  containers: AdminMeetingRuntimeContainerRow[]
  livekit: AdminMeetingRuntimeLiveKitSnapshot
  egress: AdminMeetingRuntimeEgressSnapshot
  capacity: AdminMeetingRuntimeCapacitySnapshot
  trend: AdminMeetingRuntimeTrendPoint[]
  issues: string[]
}

export interface AdminRiskAlert {
  id: string
  key: string
  severity: AdminRiskSeverity
  source: string
  title: string
  description: string
  currentValue: number
  threshold: number
  detectedAt: string
  detailPath?: string
}

export interface AdminRiskSnapshot {
  generatedAt: string
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  alerts: AdminRiskAlert[]
}

export interface AdminOperationsAiAnalysisCitation {
  label: string
  value: string
}

export interface AdminOperationsAiAnalysisResult {
  summary: string
  riskLevel: AdminOperationsTone
  keyRisks: string[]
  slaNotes: string[]
  actions: string[]
  citations: AdminOperationsAiAnalysisCitation[]
  generatedAt: string
}

export interface AdminOperationsAiAnalysisSnapshot {
  status: AdminOperationsAiAnalysisStatus
  stale: boolean
  expiresAt: string | null
  lastRunAt: string | null
  result: AdminOperationsAiAnalysisResult | null
  error: string
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

export interface AdminOperationsAiAnalysisRunResult extends AdminOperationsAiAnalysisSnapshot {
  triggered: boolean
}

export interface AdminReportFieldOption {
  key: string
  label: string
  type: AdminReportFieldType
  operators?: AdminReportFilterOperator[]
  aggregation?: AdminReportMetricAggregation
}

export interface AdminReportDatasetSchema {
  key: AdminReportDatasetKey
  label: string
  dimensions: AdminReportFieldOption[]
  metrics: AdminReportFieldOption[]
  filters: AdminReportFieldOption[]
  defaultDimensions: string[]
  defaultMetrics: string[]
}

export interface AdminReportSchema {
  datasets: AdminReportDatasetSchema[]
}

export interface AdminReportFilter {
  field: string
  operator: AdminReportFilterOperator
  value: string | number | boolean
}

export interface AdminReportQuery {
  dataset: AdminReportDatasetKey
  dimensions: string[]
  metrics: string[]
  filters: AdminReportFilter[]
  limit?: number
}

export interface AdminReportResultColumn {
  key: string
  label: string
  kind: 'dimension' | 'metric'
  type: AdminReportFieldType
}

export interface AdminReportResultRow {
  [key: string]: string | number | boolean | null
}

export interface AdminReportResult {
  generatedAt: string
  dataset: AdminReportDatasetKey
  columns: AdminReportResultColumn[]
  rows: AdminReportResultRow[]
  total: number
}
