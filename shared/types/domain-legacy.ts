export type ContestLevel = 'national' | 'provincial' | 'school' | 'industry'
export type ResourceAvailability = 'public' | 'login_required' | 'unavailable'
export type WorkloadLevel = 'low' | 'medium' | 'high'
export type ProjectSource = 'chat' | 'form'
export type ProjectStatus = 'draft' | 'in_progress' | 'completed'

export type WorkspaceType = 'personal' | 'team'
export type TeamType = WorkspaceType
export type WorkspaceMemberRole = 'owner' | 'admin' | 'manager' | 'member'
export type ProjectMemberRole = 'owner' | 'manager' | 'editor' | 'viewer'
export type GroupPermission = string

export type PlatformRole = 'platform_super_admin' | 'contest_admin' | 'pricing_admin'
export type PlatformPermission = 'contest.read_internal' | 'contest.write' | 'contest.publish' | 'contest.archive' | 'pricing.write' | 'role.assign'

export type ContestStatus = 'draft' | 'published' | 'archived'
export type ContestVisibility = 'internal' | 'public'
export type ResourceStatus = 'active' | 'invalid' | 'pending_verify' | 'archived'
export type PolicyLibraryItemStatus = 'active' | 'archived'
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
export type DocumentParseStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type DocumentTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type DocumentBlockType = 'title' | 'paragraph' | 'table' | 'image' | 'header' | 'footer' | 'unknown' | 'ocr_candidate'
export type ResourceKind = 'binary' | 'markdown' | 'draw'
export type CollabPurpose = 'workflow' | 'freeform' | 'design' | 'notes'
export type ResourcePreviewStatus = 'queued' | 'converting' | 'finalizing' | 'succeeded' | 'failed'
export type ProjectResourceShareVisibility = 'public' | 'workspace'
export type ProjectResourceShareDurationPreset = '1h' | '1d' | '3d' | '7d' | '1mon'
export type WorkspaceFontSizePreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type WorkspaceTabSpacingPreset = 'ultra_compact' | 'compact' | 'default' | 'relaxed' | 'spacious'
export type WorkspaceDisplayPreferenceSource = 'workspace_override' | 'user_default' | 'team_default' | 'system_default'

export interface WorkspaceDisplayPreferences {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
  leftSidebarWidth?: number | null
  rightSidebarWidth?: number | null
  updatedAt?: string
}

export interface WorkspaceDisplayPreferenceSources {
  fontSizePreset: WorkspaceDisplayPreferenceSource
  tabSpacingPreset: WorkspaceDisplayPreferenceSource
  leftSidebarWidth: WorkspaceDisplayPreferenceSource
  rightSidebarWidth: WorkspaceDisplayPreferenceSource
}

export interface WorkspaceDisplayPreferenceSnapshot {
  userDefault: WorkspaceDisplayPreferences | null
  teamDefault: WorkspaceDisplayPreferences | null
  workspaceOverride: WorkspaceDisplayPreferences | null
  effective: WorkspaceDisplayPreferences
  sources: WorkspaceDisplayPreferenceSources
  canManageTeamDefault: boolean
}
export type ProjectIssueReviewSubmissionStatus = 'draft' | 'submitted'
export const BILLING_USAGE_EVENT_CODES = [
  'resource.download',
  'resource.favorite.create',
  'ai.topic_proposal.generate',
  'review.submit',
  'review.report.export',
  'ai.defense.start',
] as const
export type BillingUsageEventCode = typeof BILLING_USAGE_EVENT_CODES[number]
export type BillingUsageEventResult = 'success' | 'failed'

export type ResourceCategory
  = 'basic_info'
    | 'timeline'
    | 'tracks'
    | 'scoring'
    | 'past_questions'
    | 'awarded_works'
    | 'templates'
    | 'faq'
    | 'judge_guidelines'
    | 'track_details'
    | 'ai_prompts'
    | 'submission_examples'
    | 'policy_notice'
    | 'compliance'

export type TimelineNodeType = 'registration' | 'submission' | 'preliminary' | 'final' | 'other'
export type RubricScoringMode = 'weighted' | 'checklist'

export interface ContestFaqItem {
  question: string
  answer: string
  sortOrder?: number
}

export interface DisciplineDictionaryItem {
  code: string
  label: string
  sortOrder: number
  enabled?: boolean
}

export interface RubricDimension {
  key: string
  name: string
  weight?: number
  description: string
  scoringPoint?: string
  deductionPoint?: string
  evidenceRequirement?: string
}

export interface Rubric {
  id: string
  contestId: string
  trackId: string
  scoringMode?: RubricScoringMode
  version?: number
  status?: ContestStatus
  dimensions: RubricDimension[]
  scoringPoints?: string[]
  deductionItems?: string[]
  evidenceRequirements?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Track {
  id: string
  contestId: string
  name: string
  summary: string
  coverImageUrl?: string
  location?: string
  organizer?: string
  undertaker?: string
  participantRequirements?: string
  teamRule?: string
  awardRatio?: string
  deliverableTypes: string[]
  suitableMajors: string[]
  sortOrder?: number
  status?: ContestStatus
  rubricId?: string | null
}

export interface ContestTimeline {
  id: string
  contestId: string
  year: number
  nodeType: TimelineNodeType
  startAt: string | null
  endAt: string | null
  note: string
  sourceLink: string
}

export interface TrackTimeline {
  id: string
  contestId: string
  trackId: string
  year: number
  nodeType: TimelineNodeType
  startAt: string | null
  endAt: string | null
  note: string
  sourceLink: string
}

export interface Contest {
  id: string
  name: string
  level: ContestLevel
  organizer: string
  registrationWindow: string
  submissionDeadline: string
  recommendedFor: string[]
  keywords: string[]
  tracks: Track[]
  aliases?: string[]
  disciplines?: string[]
  coOrganizer?: string
  officialUrl?: string
  summary?: string
  participantRequirements?: string
  teamRule?: string
  currentSeason?: string
  status?: ContestStatus
  visibility?: ContestVisibility
  hotScore?: number
  faq?: string
  faqItems?: ContestFaqItem[]
  timelines?: ContestTimeline[]
}

export interface PublishCheckIssue {
  code: string
  message: string
  field?: string
  severity: 'blocker' | 'warning'
}

export interface PublishCheckResult {
  contestId: string
  canPublish: boolean
  completion: number
  blockers: PublishCheckIssue[]
  warnings: PublishCheckIssue[]
}

export type ResourceKnowledgeGovernanceStatus = 'pending' | 'healthy' | 'review' | 'suggested_invalid' | 'suggested_archive'
export type ResourceGovernanceTaskType = 'profile_analyze' | 'relation_refresh' | 'governance_apply' | 'search_metric_rollup'
export type ResourceGovernanceTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'dead_letter'
export type ResourceRelationType = 'recommended' | 'similar' | 'duplicate' | 'complementary'
export type ResourceSearchSort = 'relevance' | 'quality' | 'value' | 'hot'

export interface ResourceQualityIssue {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  field?: string
  scoreImpact?: number
}

export interface ResourceRelation {
  id: string
  contestId: string
  sourceResourceId: string
  targetResourceId: string
  relationType: ResourceRelationType
  weight: number
  reason: string
  targetTitle?: string
  targetCategory?: ResourceCategory
  createdAt?: string
  updatedAt?: string
}

export interface ResourceKnowledgeProfileSummary {
  resourceId: string
  predictedCategory?: ResourceCategory | ''
  categoryConfidence: number
  aiTags: string[]
  majorTags: string[]
  stageTags: string[]
  qualityScore: number
  valueScore: number
  hotScore: number
  governanceStatus: ResourceKnowledgeGovernanceStatus
  qualityIssues: ResourceQualityIssue[]
  relatedResources?: ResourceRelation[]
}

export interface ResourceKnowledgeProfile extends ResourceKnowledgeProfileSummary {
  contestId: string
  analysisVersion: string
  manualOverrides: Record<string, unknown>
  componentScores: Record<string, number>
  analysisPayload: Record<string, unknown>
  lastAnalyzedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ResourceDemandInsight {
  query: string
  searchCount: number
  zeroResultCount: number
  lowClickCount: number
  clickCount: number
  ctr: number
  suggestedCategories: ResourceCategory[]
  missingTags: string[]
}

export interface ResourceGovernanceTask {
  id: string
  contestId: string
  resourceId?: string | null
  taskType: ResourceGovernanceTaskType
  status: ResourceGovernanceTaskStatus
  attempt: number
  maxAttempt: number
  payload: Record<string, unknown>
  resultPayload: Record<string, unknown>
  errorMessage: string
  nextRunAt: string
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ResourceSearchEvent {
  id: string
  contestId: string
  resourceId?: string | null
  query: string
  filters: Record<string, unknown>
  resultCount: number
  clicked: boolean
  sessionId: string
  workspaceId?: string | null
  userId?: string | null
  createdAt: string
  updatedAt: string
}

export interface ResourceKnowledgeOverview {
  contestId: string
  summary: {
    totalResources: number
    analyzedResources: number
    healthyResources: number
    reviewResources: number
    suggestedInvalidResources: number
    suggestedArchiveResources: number
    pendingTasks: number
    avgQualityScore: number
    avgValueScore: number
    avgHotScore: number
  }
  categoryStats: Array<{
    category: ResourceCategory
    count: number
    avgQualityScore: number
    avgValueScore: number
    avgHotScore: number
  }>
  topQualityResources: Resource[]
  topValueResources: Resource[]
  topHotResources: Resource[]
  demandInsights: ResourceDemandInsight[]
}

export interface Resource {
  id: string
  contestId: string
  projectId?: string
  parentResourceId?: string | null
  sortOrder?: number
  resourceKind?: ResourceKind
  collabPurpose?: CollabPurpose
  drawMode?: DrawMode
  sceneSourceType?: SceneSourceType
  templateKey?: string
  editorEngine?: SceneEditorEngine
  revision?: number
  documentId?: string
  title: string
  type: string
  year: number
  sourceLink: string
  sourceDownloadUrl?: string
  sourceDownloadUrlExpiresAt?: string
  previewUrl?: string
  previewUrlExpiresAt?: string
  previewStatus?: ResourcePreviewStatus
  previewProgressPercent?: number
  previewEtaSeconds?: number
  previewError?: string
  availability: ResourceAvailability
  summary: string
  copyrightNote: string
  content?: string
  metadata?: Record<string, unknown>
  category?: ResourceCategory
  sourceType?: string
  source?: 'upload' | 'library' | 'collab'
  linkedContestResourceId?: string | null
  isFavorite?: boolean
  status?: ResourceStatus
  createdBy?: string
  updatedBy?: string
  uploaderUserId?: string
  uploaderUsername?: string
  uploaderAvatarUrl?: string | null
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
  aiProfile?: ResourceKnowledgeProfileSummary
}

export type ProjectKnowledgeScopeType = 'project_resource' | 'contest_resource'
export type ProjectKnowledgeSourceStatus = 'pending' | 'queued' | 'extracting' | 'chunking' | 'embedding' | 'ready' | 'failed' | 'stale' | 'skipped'
export type ProjectKnowledgeTaskType = 'upsert' | 'reindex' | 'delete'
export type ProjectKnowledgeTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'dead_letter' | 'cancelled'
export type ProjectKnowledgeTaskStage = 'queued' | 'extracting' | 'chunking' | 'embedding' | 'finalizing'
export type ProjectKnowledgeChunkKind
  = 'document_page'
    | 'document_section'
    | 'markdown_section'
    | 'draw_summary'
    | 'resource_summary'
    | 'image_summary'
    | 'image_ocr'
    | 'meeting_notes'
    | 'meeting_transcript'

export type ProjectKnowledgeModality = 'text' | 'image' | 'audio' | 'video' | 'draw'
export type PlatformAiClientType = 'langchain' | 'bailian-native' | 'coze-sdk'
export type ProjectKnowledgeEmbeddingApiStyle = 'openai-compatible-text' | 'bailian-multimodal'
export type ProjectKnowledgeEmbeddingInputType = 'text' | 'image' | 'video' | 'multi_images' | 'fused'
export type ProjectKnowledgeEmbeddingStatus = 'native' | 'derived' | 'fallback' | 'missing' | 'failed'
export type ProjectKnowledgeProvenanceSourceType = 'native' | 'ocr' | 'asr' | 'vision_summary' | 'fallback_template'
export type ProjectKnowledgeRelationType = 'belongs_to' | 'derived_from' | 'similar_to' | 'aligned_to' | 'references' | 'duplicated_with'
export type ProjectKnowledgeRelationNodeType = 'source' | 'chunk'
export type ProjectKnowledgeRetrievalIntent = 'direct_answer' | 'evidence_trace' | 'global_summary' | 'relation_explore' | 'visual_lookup' | 'meeting_lookup'
export type ProjectKnowledgeRetrievalPlannerSource = 'llm' | 'heuristic' | 'fallback'
export type ProjectKnowledgeRetrievalModalityFilter = ProjectKnowledgeModality | 'unknown'
export type ProjectKnowledgeAnalyticsJobType = 'relations_refresh' | 'snapshot_capture' | 'semantic_layout_refresh'
export type ProjectKnowledgeAnalyticsJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
export type ProjectKnowledgeSnapshotType = 'hourly' | 'manual'
export type ProjectKnowledgeSemanticLayoutType = 'chunk_space' | 'document_galaxy' | 'multimodal_bridge'
export type ProjectKnowledgeSemanticLayoutAlgorithm = 'umap3d' | 'pca3d'
export type ProjectKnowledgeSemanticLayoutLevel = 'cluster' | 'document' | 'chunk'

export type ProjectKnowledgeProjectionType
  = 'document_text'
    | 'markdown_text'
    | 'draw_projection'
    | 'resource_summary'
    | 'image_summary'
    | 'image_ocr'
    | 'document_visual_fallback'
    | 'meeting_notes'
    | 'meeting_transcript'

export interface ProjectKnowledgeChunkMetadata {
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeProjectionType
  projectionSource?: string
  confidence?: number
  pageNumber?: number
  sectionLabel?: string
  meetingId?: string
  utteranceRange?: string
  fallbackUsed?: boolean
  embeddingProvider?: string
  embeddingModel?: string
  embeddingFallbackUsed?: boolean
  embeddingApiStyle?: ProjectKnowledgeEmbeddingApiStyle
  embeddingInputType?: ProjectKnowledgeEmbeddingInputType
  embeddingDimensions?: number
  embeddingFusionUsed?: boolean
  embeddingRuntimeVersion?: string
  embeddingSignature?: EmbeddingSignature
  embeddingFailureReason?: string
  embeddingStatus?: ProjectKnowledgeEmbeddingStatus
  embeddingQualityScore?: number
  sourceConfidence?: number
  stageSuccessRatio?: number
  modalitySupportWeight?: number
  neighborhoodConsistency?: number
  provenanceSourceType?: ProjectKnowledgeProvenanceSourceType
}

export type ProjectKnowledgeIndexHealthState
  = 'empty_project'
    | 'missing_runtime'
    | 'worker_inactive'
    | 'queued_but_not_running'
    | 'fallback_only'
    | 'partial'
    | 'healthy'

export interface ProjectKnowledgeIndexRuntimeStatus {
  clientType: PlatformAiClientType
  embeddingConfigured: boolean
  embeddingClientType: 'openai-compatible' | 'bailian-native'
  embeddingApiStyle: ProjectKnowledgeEmbeddingApiStyle
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
}

export interface ProjectKnowledgeIndexWorkerStatus {
  started: boolean
  enabled: boolean
  ticking: boolean
  lastStartedAt?: string
  lastFinishedAt?: string
  lastSuccessAt?: string
  lastError: string
}

export interface ProjectKnowledgeIndexDiagnosticIssue {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface ProjectKnowledgeIndexDiagnostics {
  candidateResourceCount: number
  sourceCount: number
  taskCount: number
  chunkCount: number
  realEmbeddedChunkCount: number
  fallbackEmbeddedChunkCount: number
  unknownEmbeddedChunkCount: number
  multimodalIndexedCount: number
  multimodalBlockedCount: number
  healthState: ProjectKnowledgeIndexHealthState
  healthMessage: string
  embeddingHealthReason?: string
  degradedReason?: string
  rebuildRecommended?: boolean
  signatureMismatchSourceCount?: number
  backfillPendingCount?: number
  backfillRunningCount?: number
  lastHealthyAt?: string
  issues: ProjectKnowledgeIndexDiagnosticIssue[]
}

export interface EmbeddingSignature {
  provider: string
  model: string
  apiStyle: ProjectKnowledgeEmbeddingApiStyle
  dimensions: number
  inputType: ProjectKnowledgeEmbeddingInputType
  fusionUsed: boolean
  runtimeVersion: string
}

export interface ProjectKnowledgeAnalyticsFreshness {
  relationsUpdatedAt?: string | null
  snapshotUpdatedAt?: string | null
  semanticLayoutUpdatedAt?: string | null
  latestSnapshotType?: ProjectKnowledgeSnapshotType | null
  relationsJobStatus?: ProjectKnowledgeAnalyticsJobStatus | null
  snapshotJobStatus?: ProjectKnowledgeAnalyticsJobStatus | null
  semanticLayoutJobStatus?: ProjectKnowledgeAnalyticsJobStatus | null
  staleKinds: Array<'relations' | 'snapshot' | 'semantic_layout'>
  allReady: boolean
}

export interface ProjectKnowledgeIndexVisualCountItem {
  label: string
  count: number
}

export interface ProjectKnowledgeIndexTaskTrendPoint {
  day: string
  tasks: number
  succeeded: number
  failed: number
  successRate: number
}

export interface ProjectKnowledgeIndexStatusMatrixCell {
  resourceKind: string
  status: ProjectKnowledgeSourceStatus
  count: number
}

export interface ProjectKnowledgeIndexTopologyNode {
  id: string
  label: string
  nodeType: 'source' | 'binding'
  status?: ProjectKnowledgeSourceStatus
  resourceKind?: ResourceKind | ''
  progressPercent: number
  chunkCount: number
  updatedAt?: string
  size: number
  depth: number
  realEmbeddingReady?: boolean
  fallbackOnly?: boolean
}

export interface ProjectKnowledgeIndexTopologyLink {
  sourceId: string
  targetId: string
}

export interface ProjectKnowledgeHealthMatrixCell {
  modality: ProjectKnowledgeModality | 'unknown'
  embeddingStatus: ProjectKnowledgeEmbeddingStatus
  count: number
}

export interface ProjectKnowledgePipelineStageMetric {
  stage: 'ingest' | 'normalize' | 'parse' | 'chunk' | 'annotate' | 'embed' | 'validate' | 'index' | 'relate'
  status: 'pending' | 'running' | 'success' | 'degraded' | 'failed' | 'blocked'
  inputCount: number
  outputCount: number
  errorCount: number
  latencyMs: number
  modelName: string
  fallbackUsed: boolean
  qualityScore: number
}

export interface ProjectKnowledgeClusterMetric {
  clusterCompactness: number
  nearestNeighborConsistency: number
  crossModalAlignmentScore: number
}

export interface ProjectKnowledgeIndexVisuals {
  stageFunnel: ProjectKnowledgeIndexVisualCountItem[]
  failureReasons: ProjectKnowledgeIndexVisualCountItem[]
  chunkKindDistribution: ProjectKnowledgeIndexVisualCountItem[]
  resourceKindDistribution: ProjectKnowledgeIndexVisualCountItem[]
  embeddingComposition: ProjectKnowledgeIndexVisualCountItem[]
  taskTrend: ProjectKnowledgeIndexTaskTrendPoint[]
  resourceStatusMatrix: {
    resourceKinds: string[]
    statuses: ProjectKnowledgeSourceStatus[]
    cells: ProjectKnowledgeIndexStatusMatrixCell[]
  }
  topology: {
    nodes: ProjectKnowledgeIndexTopologyNode[]
    links: ProjectKnowledgeIndexTopologyLink[]
  }
  starfieldNodes: ProjectKnowledgeIndexTopologyNode[]
  healthMatrix: ProjectKnowledgeHealthMatrixCell[]
  pipelineMetrics: ProjectKnowledgePipelineStageMetric[]
  clusterMetrics: ProjectKnowledgeClusterMetric
}

export type ProjectKnowledgeCitationSourceScope
  = 'project_resource'
    | 'contest_resource'
    | 'platform_resource'
    | 'meeting_artifact'
    | 'canvas_resource'

export interface ProjectKnowledgeCitationLocator {
  page?: number
  section?: string
  anchorId?: string
  nodeId?: string
  utteranceRange?: string
  label?: string
}

export interface ProjectKnowledgeCitation {
  sourceId: string
  sourceResourceId?: string | null
  chunkId: string
  resourceTitle: string
  label: string
  sourceScope: ProjectKnowledgeCitationSourceScope
  sourceStatus?: ProjectKnowledgeSourceStatus
  modality?: ProjectKnowledgeModality
  projectionType?: ProjectKnowledgeProjectionType
  page?: number
  section?: string
  anchorId?: string
  nodeId?: string
  locator?: ProjectKnowledgeCitationLocator | null
  quote?: string
}

export interface ProjectKnowledgeRetrievalPlan {
  intent: ProjectKnowledgeRetrievalIntent
  queryVariants: string[]
  preferredModalities: ProjectKnowledgeRetrievalModalityFilter[]
  preferredProjectionTypes: ProjectKnowledgeProjectionType[]
  preferredEmbeddingStatuses?: ProjectKnowledgeEmbeddingStatus[]
  relationTypes: ProjectKnowledgeRelationType[]
  retrievalBudget: number
  plannerSource: ProjectKnowledgeRetrievalPlannerSource
  reasoning?: string
}

export interface ProjectKnowledgeEvidencePath {
  id: string
  relationType: ProjectKnowledgeRelationType
  sourceNodeType: ProjectKnowledgeRelationNodeType
  sourceNodeId: string
  sourceLabel: string
  targetNodeType: ProjectKnowledgeRelationNodeType
  targetNodeId: string
  targetLabel: string
  score: number
  evidenceMetric: string
  evidenceModel: string
  citationChunkId?: string
  summary: string
}

export interface ProjectKnowledgeMessagePayload {
  citations: ProjectKnowledgeCitation[]
  warning: string
  usedFallback: boolean
  retrievalPlan?: ProjectKnowledgeRetrievalPlan | null
  evidencePaths?: ProjectKnowledgeEvidencePath[]
}

export interface ProjectKnowledgeIndexTaskSnapshot {
  id: string
  projectId: string
  scopeType: ProjectKnowledgeScopeType
  sourceResourceId?: string | null
  linkedContestResourceId?: string | null
  taskType: ProjectKnowledgeTaskType
  status: ProjectKnowledgeTaskStatus
  stage: ProjectKnowledgeTaskStage
  attempt: number
  maxAttempt: number
  progressPercent: number
  etaSeconds: number
  payloadJson: Record<string, unknown>
  resultJson: Record<string, unknown>
  errorMessage: string
  resourceTitle?: string
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectKnowledgeIndexSourceStatus {
  id: string
  scopeType: ProjectKnowledgeScopeType
  projectId: string
  sourceResourceId?: string | null
  linkedContestResourceId?: string | null
  resourceTitle: string
  resourceKind?: ResourceKind | ''
  resourceSource?: Resource['source'] | ''
  status: ProjectKnowledgeSourceStatus
  currentStage?: ProjectKnowledgeTaskStage | ''
  currentTaskStatus?: ProjectKnowledgeTaskStatus | ''
  progressPercent: number
  etaSeconds: number
  estimatedFinishedAt?: string | null
  chunkTotal: number
  chunkIndexed: number
  sourceHash: string
  indexVersion: string
  lastIndexedAt?: string | null
  lastError: string
  lastErrorStage?: ProjectKnowledgeTaskStage | ProjectKnowledgeSourceStatus | ''
  lastTaskId?: string | null
  updatedAt: string
  lastTask?: ProjectKnowledgeIndexTaskSnapshot | null
}

export interface ProjectKnowledgeIndexSummary {
  projectId: string
  totalResources: number
  indexableResources: number
  pendingCount: number
  readyCount: number
  processingCount: number
  queuedCount: number
  failedCount: number
  staleCount: number
  skippedCount: number
  overallProgressPercent: number
  etaSeconds: number
  estimatedFinishedAt?: string | null
  lastRefreshedAt: string
}

export interface ProjectKnowledgeRelation {
  id: string
  projectId: string
  snapshotId?: string | null
  sourceNodeType: ProjectKnowledgeRelationNodeType
  sourceNodeId: string
  targetNodeType: ProjectKnowledgeRelationNodeType
  targetNodeId: string
  relationType: ProjectKnowledgeRelationType
  score: number
  evidenceMetric: string
  evidenceModel: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProjectKnowledgeAnalyticsJob {
  id: string
  projectId: string
  jobType: ProjectKnowledgeAnalyticsJobType
  status: ProjectKnowledgeAnalyticsJobStatus
  snapshotType?: ProjectKnowledgeSnapshotType | null
  targetSourceId?: string | null
  payloadJson: Record<string, unknown>
  resultJson: Record<string, unknown>
  errorMessage: string
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectKnowledgeIndexSnapshot {
  id: string
  projectId: string
  snapshotType: ProjectKnowledgeSnapshotType
  summary: ProjectKnowledgeIndexSummary
  diagnostics: ProjectKnowledgeIndexDiagnostics
  visuals: ProjectKnowledgeIndexVisuals
  capturedAt: string
}

export interface ProjectKnowledgeSemanticCluster {
  id: string
  label: string
  nodeCount: number
  modality: ProjectKnowledgeModality | 'mixed' | 'unknown'
  embeddingStatus: ProjectKnowledgeEmbeddingStatus
  densityScore: number
  topicLabel: string
  similarityScore: number
  centroid: {
    x: number
    y: number
    z: number
  }
}

export interface ProjectKnowledgeSemanticLayoutSummary {
  clusterCount: number
  pointCount: number
  averageSimilarity: number
  maxSimilarity: number
}

export interface ProjectKnowledgeSemanticPoint {
  id: string
  layoutId: string
  nodeType: ProjectKnowledgeRelationNodeType | 'cluster'
  nodeId: string
  level: ProjectKnowledgeSemanticLayoutLevel
  x: number
  y: number
  z: number
  clusterId: string
  modality: ProjectKnowledgeModality | 'mixed' | 'unknown'
  embeddingStatus: ProjectKnowledgeEmbeddingStatus
  importance: number
  label: string
  metadata: Record<string, unknown>
}

export interface ProjectKnowledgeSemanticLayout {
  id: string
  projectId: string
  layoutType: ProjectKnowledgeSemanticLayoutType
  algorithm: ProjectKnowledgeSemanticLayoutAlgorithm
  pointCount: number
  clusterCount: number
  status: 'ready' | 'degraded' | 'failed'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProjectKnowledgeIndexDashboard {
  summary: ProjectKnowledgeIndexSummary
  runtime: ProjectKnowledgeIndexRuntimeStatus
  worker: ProjectKnowledgeIndexWorkerStatus
  diagnostics: ProjectKnowledgeIndexDiagnostics
  analytics: ProjectKnowledgeAnalyticsFreshness
  processing: ProjectKnowledgeIndexSourceStatus[]
  recentCompleted: ProjectKnowledgeIndexSourceStatus[]
  failed: ProjectKnowledgeIndexSourceStatus[]
  sources: ProjectKnowledgeIndexSourceStatus[]
  tasks: ProjectKnowledgeIndexTaskSnapshot[]
  visuals: ProjectKnowledgeIndexVisuals
}

export interface ProjectKnowledgeExplorerPayload {
  summary: ProjectKnowledgeIndexSummary
  diagnostics: ProjectKnowledgeIndexDiagnostics
  analytics: ProjectKnowledgeAnalyticsFreshness
  visuals: ProjectKnowledgeIndexVisuals
  filters: {
    modalities: Array<ProjectKnowledgeModality | 'unknown'>
    embeddingStatuses: ProjectKnowledgeEmbeddingStatus[]
    provenanceSourceTypes: ProjectKnowledgeProvenanceSourceType[]
    models: string[]
    resourceKinds: string[]
  }
}

export interface ProjectKnowledgeRelationsPayload {
  projectId: string
  analytics: ProjectKnowledgeAnalyticsFreshness
  nodes: Array<{
    id: string
    nodeType: ProjectKnowledgeRelationNodeType
    label: string
    modality: ProjectKnowledgeModality | 'unknown'
    embeddingStatus: ProjectKnowledgeEmbeddingStatus
    provenanceSourceType?: ProjectKnowledgeProvenanceSourceType | ''
    resourceKind?: string
    sourceId?: string
    importance: number
    metadata: Record<string, unknown>
  }>
  relations: ProjectKnowledgeRelation[]
}

export interface ProjectKnowledgeSemanticLayoutPayload {
  projectId: string
  analytics: ProjectKnowledgeAnalyticsFreshness
  layout: ProjectKnowledgeSemanticLayout | null
  summary: ProjectKnowledgeSemanticLayoutSummary
  clusters: ProjectKnowledgeSemanticCluster[]
  points: ProjectKnowledgeSemanticPoint[]
  selectionSummary: {
    totalPoints: number
    returnedPoints: number
    level: ProjectKnowledgeSemanticLayoutLevel
    layoutType: ProjectKnowledgeSemanticLayoutType
  }
}

export interface ProjectKnowledgeNodeDetail {
  nodeId: string
  nodeType: ProjectKnowledgeRelationNodeType
  label: string
  contentPreview: string
  modality: ProjectKnowledgeModality | 'unknown'
  embeddingStatus: ProjectKnowledgeEmbeddingStatus
  embeddingProvider: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingQualityScore: number
  provenanceSourceType?: ProjectKnowledgeProvenanceSourceType | ''
  sourceConfidence: number
  neighborhoodConsistency: number
  metadata: Record<string, unknown>
  pipelineLog: ProjectKnowledgeIndexTaskSnapshot[]
  nearestNeighbors: ProjectKnowledgeRelation[]
  alignedNeighbors: ProjectKnowledgeRelation[]
}

export type DrawMode = 'freeform' | 'diagram' | 'schema' | 'architecture' | 'composition'
export type SceneSourceType = 'manual' | 'mermaid' | 'markdown_outline' | 'ddl' | 'db_introspection' | 'repo_arch' | 'image_mockup'
export type SceneLayoutDirection = 'TB' | 'BT' | 'LR' | 'RL' | 'none'
export type SceneEdgeStyle = 'solid' | 'dashed' | 'dotted'
export type SceneNodeShape = 'rect' | 'rounded' | 'pill' | 'diamond' | 'note' | 'image' | 'table'
export type SceneTemplateCategory = 'diagram' | 'schema' | 'architecture' | 'composition'
export type SceneExportFormat = 'svg' | 'png' | 'pdf'
export type SceneExportStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type SceneEditorEngine = 'vueflow' | 'tldraw_legacy' | 'canvaskit_wasm'

export interface SceneNode {
  id: string
  type: string
  label: string
  x: number
  y: number
  width: number
  height: number
  shape?: SceneNodeShape
  parentId?: string
  content?: string
  metadata?: Record<string, unknown>
  style?: Record<string, string | number | boolean | null>
}

export interface SceneEdge {
  id: string
  source: string
  target: string
  label?: string
  style?: SceneEdgeStyle
  metadata?: Record<string, unknown>
}

export interface SceneArtboard {
  id: string
  name: string
  width: number
  height: number
  background?: string
  padding?: number
  metadata?: Record<string, unknown>
}

export interface SceneModel {
  nodes: SceneNode[]
  edges: SceneEdge[]
  artboards?: SceneArtboard[]
  layout?: {
    engine?: string
    direction?: SceneLayoutDirection
    compact?: boolean
  }
  themeTokens?: Record<string, string>
  metadata?: Record<string, unknown>
}

export interface GraphSourceNode {
  id: string
  label: string
  type?: string
  parentId?: string
  metadata?: Record<string, unknown>
}

export interface GraphSourceEdge {
  id: string
  source: string
  target: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface GraphSourceGroup {
  id: string
  label: string
  childNodeIds: string[]
  metadata?: Record<string, unknown>
}

export interface GraphSourceModel {
  kind: 'graph'
  diagramType: 'flowchart' | 'mindmap' | 'relationship' | 'architecture'
  nodes: GraphSourceNode[]
  edges: GraphSourceEdge[]
  groups?: GraphSourceGroup[]
  sourceText?: string
  metadata?: Record<string, unknown>
}

export interface SchemaColumnModel {
  name: string
  type: string
  nullable: boolean
  defaultValue?: string
  comment?: string
  isPrimaryKey?: boolean
  referencesTable?: string
  referencesColumn?: string
  metadata?: Record<string, unknown>
}

export interface SchemaForeignKeyModel {
  name?: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
  onDelete?: string
  onUpdate?: string
  metadata?: Record<string, unknown>
}

export interface SchemaIndexModel {
  name: string
  columns: string[]
  unique?: boolean
  metadata?: Record<string, unknown>
}

export interface SchemaTableModel {
  name: string
  schemaName?: string
  columns: SchemaColumnModel[]
  primaryKeys?: string[]
  foreignKeys?: SchemaForeignKeyModel[]
  indexes?: SchemaIndexModel[]
  comment?: string
  domain?: string
  metadata?: Record<string, unknown>
}

export interface SchemaTypeModel {
  name: string
  kind: 'scalar' | 'enum' | 'json' | 'custom'
  values?: string[]
  comment?: string
  metadata?: Record<string, unknown>
}

export interface SchemaModel {
  kind: 'schema'
  dialect?: 'postgres' | 'mysql' | 'generic'
  tables: SchemaTableModel[]
  types?: SchemaTypeModel[]
  comments?: string[]
  metadata?: Record<string, unknown>
}

export interface ArchitectureElementModel {
  id: string
  label: string
  type?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface ArchitectureRelationModel {
  id: string
  source: string
  target: string
  label?: string
  protocol?: string
  metadata?: Record<string, unknown>
}

export interface ArchitectureModel {
  kind: 'architecture'
  systems: ArchitectureElementModel[]
  services: ArchitectureElementModel[]
  components: ArchitectureElementModel[]
  databases: ArchitectureElementModel[]
  queues: ArchitectureElementModel[]
  externalDependencies: ArchitectureElementModel[]
  interfaces?: Array<ArchitectureElementModel & {
    protocol?: string
  }>
  relations: ArchitectureRelationModel[]
  metadata?: Record<string, unknown>
}

export interface CompositionBlock {
  id: string
  type: 'headline' | 'subheadline' | 'image' | 'metric' | 'badge' | 'caption' | 'comparison'
  title?: string
  body?: string
  imageSrc?: string
  items?: Record<string, unknown>[]
  metadata?: Record<string, unknown>
}

export type DesignFrameKind = 'freeform' | 'template' | 'device_mockup' | 'device_artboard' | 'diagram'
export type DesignElementType = 'text' | 'image' | 'shape' | 'group' | 'badge' | 'caption' | 'path'
export type DesignShapeKind = 'rectangle' | 'ellipse' | 'arrow'
export type DesignConstraintHorizontal = 'left' | 'center' | 'right' | 'scale'
export type DesignConstraintVertical = 'top' | 'center' | 'bottom' | 'scale'
export type DesignLayoutSizing = 'fixed' | 'hug' | 'fill'
export type DeviceShellMode = 'none' | 'builtin' | 'external'
export type DeviceShellSource = 'builtin' | 'uploaded'
export type DeviceScaleMode = 'fit' | 'fill'
export type DeviceFramePlatform = 'ios' | 'android' | 'ipados' | 'watchos' | 'windows' | 'web'

export interface DesignElementConstraints {
  horizontal?: DesignConstraintHorizontal
  vertical?: DesignConstraintVertical
  referenceWidth?: number
  referenceHeight?: number
}

export interface DesignPathPoint {
  x: number
  y: number
}

export interface DesignElementStyle extends Record<string, string | number | boolean | null | undefined> {
  fill?: string | null
  stroke?: string | null
  strokeWidth?: number | null
  opacity?: number | null
  borderRadius?: number | null
  shadow?: string | null
  fontSize?: number | null
  fontWeight?: number | null
  color?: string | null
  textAlign?: 'left' | 'center' | 'right' | string
  strokeLineCap?: string | null
  strokeLineJoin?: string | null
}

export interface DesignElementMetadata extends Record<string, unknown> {
  containerRole?: 'page_root' | 'frame_child'
  textAutoSize?: 'fixed' | 'auto_width' | 'auto_height'
  isEditingDraft?: boolean
  constraints?: DesignElementConstraints
  layoutSizing?: DesignLayoutSizing
}

export interface DesignElementModel {
  id: string
  type: DesignElementType
  pageId: string
  frameId?: string
  parentId?: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  zIndex: number
  locked: boolean
  hidden: boolean
  text?: string
  imageSrc?: string
  shapeKind?: DesignShapeKind
  points?: DesignPathPoint[]
  style?: DesignElementStyle
  metadata?: DesignElementMetadata
}

export interface DesignAssetDeviceShellViewportRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DesignAssetDeviceShellMetadata extends Record<string, unknown> {
  presetKeys?: string[]
  viewportRect?: Partial<DesignAssetDeviceShellViewportRect>
  cornerRadius?: number
  maskPath?: string
  source?: DeviceShellSource
}

export interface DesignAssetMetadata extends Record<string, unknown> {
  role?: 'image' | 'device_shell'
  deviceShell?: DesignAssetDeviceShellMetadata
  libraryOrigin?: CanvasLibraryOriginMetadata
}

export interface DesignAssetModel {
  id: string
  type: 'image'
  name: string
  src: string
  mimeType?: string
  width?: number
  height?: number
  metadata?: DesignAssetMetadata
}

export interface DesignPageMetadata extends Record<string, unknown> {
  clipToPage?: boolean
  workspaceBackground?: string
  export?: DesignPageExportMetadata
  libraryOrigin?: CanvasLibraryOriginMetadata
}

export interface DesignPageExportMetadata extends Record<string, unknown> {
  width?: number
  height?: number
  scale?: number
  backgroundMode?: 'transparent' | 'solid' | 'gradient'
  sizePresetKey?: string
}

export interface DesignPageModel {
  id: string
  name: string
  background?: string
  frameIds?: string[]
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  metadata?: DesignPageMetadata
}

export interface DesignFrameLayoutPadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DesignFrameLayoutMetadata extends Record<string, unknown> {
  mode?: 'absolute' | 'auto'
  direction?: 'horizontal' | 'vertical'
  gap?: number
  padding?: Partial<DesignFrameLayoutPadding>
  alignPrimary?: 'start' | 'center' | 'end' | 'space-between'
  alignCross?: 'start' | 'center' | 'end' | 'stretch'
}

export interface DesignFrameGridMetadata extends Record<string, unknown> {
  columns?: number
  rows?: number
  margin?: number
  gutter?: number
  visible?: boolean
}

export interface DesignFrameExportMetadata extends Record<string, unknown> {
  includePageOverlays?: boolean
  scale?: number
  format?: 'svg' | 'png' | 'pdf'
}

export interface DesignFrameDeviceScreenTransform {
  offsetX: number
  offsetY: number
  scale: number
}

export interface DesignFrameDeviceMetadata extends Record<string, unknown> {
  shellMode?: DeviceShellMode
  shellAssetId?: string
  mockupSourceFrameId?: string
  screenScaleMode?: DeviceScaleMode
  showSafeArea?: boolean
  screenTransform?: DesignFrameDeviceScreenTransform
}

export interface DesignFrameMetadata extends Record<string, unknown> {
  clipContent?: boolean
  exportWithVisiblePageOverlays?: boolean
  layout?: DesignFrameLayoutMetadata
  grid?: DesignFrameGridMetadata
  export?: DesignFrameExportMetadata
  device?: DesignFrameDeviceMetadata
  libraryOrigin?: CanvasLibraryOriginMetadata
}

export interface DesignFrameModel {
  id: string
  pageId: string
  name: string
  kind: DesignFrameKind
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  locked?: boolean
  templateKey?: string
  deviceFramePresetKey?: string
  elements?: DesignElementModel[]
  embeddedScene?: SceneDocument
  themeTokens?: Record<string, string>
  metadata?: DesignFrameMetadata
}

export interface CompositionModel {
  kind: 'composition'
  templateKey: string
  pages?: DesignPageModel[]
  currentPageId?: string
  frames?: DesignFrameModel[]
  elements?: DesignElementModel[]
  assets?: DesignAssetModel[]
  slots?: Record<string, unknown>
  themeTokens?: Record<string, string>
  layoutRules?: Record<string, unknown>
  allowedBlocks?: string[]
  exportPresets?: string[]
  aspectRatio?: string
  deviceFramePresetKey?: string
  blocks?: CompositionBlock[]
  metadata?: Record<string, unknown>
}

export type DesignDocumentSchema = 'design_document_v1'

export interface DesignDocumentV1 {
  version: 1
  schema: DesignDocumentSchema
  drawMode: 'composition'
  editorEngine?: Extract<SceneEditorEngine, 'canvaskit_wasm'>
  templateKey: string
  pages: DesignPageModel[]
  currentPageId?: string
  frames: DesignFrameModel[]
  elements: DesignElementModel[]
  assets: DesignAssetModel[]
  slots?: Record<string, unknown>
  themeTokens?: Record<string, string>
  layoutRules?: Record<string, unknown>
  allowedBlocks?: string[]
  exportPresets?: string[]
  aspectRatio?: string
  deviceFramePresetKey?: string
  blocks?: CompositionBlock[]
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export type SceneSourceModel = GraphSourceModel | SchemaModel | ArchitectureModel | CompositionModel
export type DrawRuntimeSnapshot = Record<string, unknown> | unknown[]

export interface SceneDocument {
  version: number
  drawMode: DrawMode
  sourceType: SceneSourceType
  templateKey?: string
  editorEngine?: SceneEditorEngine
  sourceModel: SceneSourceModel
  sceneModel: SceneModel
  runtimeSnapshot?: DrawRuntimeSnapshot | null
  metadata?: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export type CanvasLibraryItemKind = 'template' | 'asset'
export type CanvasLibraryTemplateTarget = 'scene' | 'page' | 'frame'
export type CanvasLibraryAssetKind = 'image' | 'svg' | 'device_shell'
export type CanvasLibraryItemStatus = 'draft' | 'published' | 'archived'
export type CanvasLibraryItemSource = 'admin_upload' | 'design_publish'
export type CanvasLibraryItemPayloadType = 'scene_document' | 'design_fragment' | 'binary_asset'
export type MockupDeviceCategory = 'phone' | 'tablet' | 'desktop' | 'watch' | 'earbuds' | 'glasses' | 'browser'
export type MockupVariantSlotKey = string
export type MockupDeviceModelStatus = 'draft' | 'published' | 'archived'

export interface CanvasLibraryOriginMetadata {
  itemId: string
  versionId: string
  importedAt: string
  importedBy: string
  source: 'canvas_library'
}

export interface CanvasLibraryItemCover {
  src?: string
  mimeType?: string
  background?: string
  alt?: string
}

export interface CanvasLibraryCompositionSnapshot extends Record<string, unknown> {
  templateKey?: string
  themeTokens?: Record<string, string>
  layoutRules?: Record<string, unknown>
  allowedBlocks?: string[]
  exportPresets?: string[]
  aspectRatio?: string
  deviceFramePresetKey?: string
  metadata?: Record<string, unknown>
}

export interface CanvasLibraryPageTemplatePayload {
  target: 'page'
  page: DesignPageModel
  frames: DesignFrameModel[]
  elements: DesignElementModel[]
  assets: DesignAssetModel[]
  composition?: CanvasLibraryCompositionSnapshot
}

export interface CanvasLibraryFrameTemplatePayload {
  target: 'frame'
  frame: DesignFrameModel
  elements: DesignElementModel[]
  assets: DesignAssetModel[]
  composition?: CanvasLibraryCompositionSnapshot
}

export interface CanvasLibraryBinaryAssetPayload {
  mimeType: string
  objectKey: string
  fileName: string
  size: number
  width?: number
  height?: number
  metadata?: DesignAssetMetadata
}

export interface CanvasLibraryDeviceShellAssetPayload extends CanvasLibraryBinaryAssetPayload {
  viewportRect: DesignAssetDeviceShellViewportRect
  cornerRadius: number
  presetKeys: string[]
  maskPath?: string
}

export interface CanvasLibraryBinaryAssetPreviewPayload {
  src?: string
  width?: number
  height?: number
}

export type CanvasLibraryItemPayload
  = | SceneDocument
    | CanvasLibraryPageTemplatePayload
    | CanvasLibraryFrameTemplatePayload
    | CanvasLibraryBinaryAssetPayload
    | CanvasLibraryDeviceShellAssetPayload

export type CanvasLibraryItemPreviewPayload
  = | SceneDocument
    | CanvasLibraryPageTemplatePayload
    | CanvasLibraryFrameTemplatePayload
    | CanvasLibraryBinaryAssetPreviewPayload
    | Record<string, unknown>
    | null

export interface CanvasLibraryItem {
  id: string
  slug: string
  title: string
  summary: string
  kind: CanvasLibraryItemKind
  templateTarget?: CanvasLibraryTemplateTarget
  assetKind?: CanvasLibraryAssetKind
  status: CanvasLibraryItemStatus
  tags: string[]
  cover?: CanvasLibraryItemCover | null
  source: CanvasLibraryItemSource
  draftVersionId?: string | null
  publishedVersionId?: string | null
  createdBy: string
  updatedBy: string
  createdAt?: string
  updatedAt?: string
}

export interface CanvasLibraryItemVersion {
  id: string
  itemId: string
  version: number
  payloadSchemaVersion: number
  payloadType: CanvasLibraryItemPayloadType
  payload: CanvasLibraryItemPayload
  previewPayload?: CanvasLibraryItemPreviewPayload
  notes?: string
  createdAt?: string
}

export interface MockupDeviceModel {
  id: string
  slug: string
  title: string
  category: MockupDeviceCategory
  brand?: string
  modelName: string
  screenWidth: number
  screenHeight: number
  previewAssetItemId?: string | null
  previewAssetVersionId?: string | null
  sortOrder: number
  status: MockupDeviceModelStatus
  defaultVariantSlotKey?: MockupVariantSlotKey
  createdBy: string
  updatedBy: string
  createdAt?: string
  updatedAt?: string
}

export interface MockupDeviceVariant {
  id: string
  deviceModelId: string
  slotKey: MockupVariantSlotKey
  title: string
  shellAssetItemId?: string | null
  shellAssetVersionId?: string | null
  previewAssetItemId?: string | null
  previewAssetVersionId?: string | null
  enabled: boolean
  sortOrder: number
}

export interface MockupProjectCatalogVariant extends MockupDeviceVariant {
  presetKey: string
  resolvedPreset: DeviceFramePreset
  shellAssetTitle?: string
  shellAssetSlug?: string
  shellAssetUrl?: string
  shellAssetPayload?: CanvasLibraryDeviceShellAssetPayload | null
}

export interface MockupProjectCatalogModel extends MockupDeviceModel {
  variants: MockupProjectCatalogVariant[]
}

export interface MockupProjectCatalogCategory {
  key: MockupDeviceCategory
  title: string
  models: MockupProjectCatalogModel[]
}

export interface MockupProjectCatalog {
  categories: MockupProjectCatalogCategory[]
  resolvedPresets: DeviceFramePreset[]
}

export interface SceneTemplateSummary {
  templateKey: string
  category: SceneTemplateCategory
  title: string
  summary: string
  drawMode: DrawMode
  sourceTypes?: SceneSourceType[]
  tags?: string[]
}

export interface DesignTemplateManifest extends SceneTemplateSummary {
  slotSchema: Record<string, unknown>
  themeTokens: Record<string, string>
  layoutRules: Record<string, unknown>
  allowedBlocks: string[]
  exportPresets: SceneExportFormat[]
}

export interface DeviceFramePreset {
  key: string
  title: string
  group: 'iPhone' | 'Android Phone' | 'iPad' | 'Surface/Desktop' | 'Tablet' | 'PC' | 'Watch' | 'Browser'
  platform: DeviceFramePlatform
  deviceFamily: 'phone' | 'tablet' | 'desktop' | 'browser' | 'watch'
  screenWidth: number
  screenHeight: number
  framePadding: number
  bezelRadius: number
  screenRadius: number
  background: string
  shadow: string
  builtinShellKey?: string
}

export interface DataSourceConnector {
  key: string
  title: string
  type: SceneSourceType | 'composition_render'
  readonly: boolean
  capabilities: string[]
  metadata?: Record<string, unknown>
}

export interface SceneExportJob {
  id: string
  format: SceneExportFormat
  status: SceneExportStatus
  width: number
  height: number
  background?: string
  templateKey?: string
  drawMode?: DrawMode
  error?: string
  downloadUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface SchemaImportResult {
  schemaModel: SchemaModel
  sceneDocument: SceneDocument
  warnings: string[]
}

export interface ArchitectureImportResult {
  architectureModel: ArchitectureModel
  sceneDocument: SceneDocument
  warnings: string[]
}

export type ProjectResourceUploadSessionStatus
  = | 'queued'
    | 'uploading'
    | 'paused'
    | 'finalizing'
    | 'completed'
    | 'failed'
    | 'canceled'

export interface ProjectResourceUploadSession {
  id: string
  projectId: string
  parentResourceId?: string | null
  actorUserId?: string | null
  actorUsername?: string
  actorAvatarUrl?: string | null
  fileName: string
  mimeType: string
  fileSize: number
  lastModified: number
  category: ResourceCategory
  accessLevel: ResourceAvailability
  title: string
  summary: string
  chunkSize: number
  chunkCount: number
  uploadedBytes: number
  uploadedChunkCount: number
  status: ProjectResourceUploadSessionStatus
  errorCode?: string
  errorMessage?: string
  finalObjectKey?: string
  finalStorageProvider?: string
  resourceId?: string
  previewStatus?: ResourcePreviewStatus
  createdAt: string
  updatedAt: string
  expiresAt: string
  completedAt?: string | null
}

export interface ProjectResourceUploadSessionListResult {
  items: ProjectResourceUploadSession[]
}

export interface ProjectResourceUploadChunkAck {
  sessionId: string
  chunkIndex: number
  uploadedBytes: number
  uploadedChunkCount: number
  chunkCount: number
  progressPercent: number
  status: ProjectResourceUploadSessionStatus
}

export interface ProjectResourceShare {
  id: string
  projectId: string
  resourceId: string
  resourceTitle: string
  shareKey: string
  shareUrl: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
  expiresAt: string
  revokedAt?: string | null
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface DocumentBBox {
  x: number
  y: number
  w: number
  h: number
}

export interface DocumentBlock {
  id: string
  page: number
  type: DocumentBlockType
  text: string
  bbox: DocumentBBox
  confidence?: number
}

export interface DocumentField {
  id: string
  page: number
  key: string
  value: string
  bbox: DocumentBBox
  confidence?: number
}

export interface DocumentPageAnalysis {
  page: number
  width: number
  height: number
  blocks: DocumentBlock[]
  fields: DocumentField[]
}

export interface DocumentAnalysis {
  version: string
  source: string
  pages: DocumentPageAnalysis[]
}

export type ProjectResourceReviewJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type ProjectResourceReviewSeverity = 'info' | 'low' | 'medium' | 'high'

export interface ProjectResourceReviewFinding {
  id: string
  jobId: string
  projectId: string
  resourceId: string
  documentId: string
  pageNumber: number
  severity: ProjectResourceReviewSeverity
  category: string
  title: string
  comment: string
  quote: string
  sourceBlockIds: string[]
  locator: ProjectKnowledgeCitationLocator
  bbox?: DocumentBBox | null
  confidence: number
  createdAt: string
}

export interface ProjectResourceReviewJob {
  id: string
  projectId: string
  resourceId: string
  documentId: string
  status: ProjectResourceReviewJobStatus
  prompt: string
  pageTotal: number
  pageReviewed: number
  resultSummary: string
  errorMessage: string
  provider: string
  model: string
  fallbackUsed: boolean
  createdByUserId?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
  findings: ProjectResourceReviewFinding[]
}

export interface ResourceDocument {
  id: string
  contestId: string
  resourceId: string
  objectKey: string
  storageProvider: string
  fileName: string
  mimeType: string
  fileSize: number
  pageCount: number
  parseStatus: DocumentParseStatus
  parseError: string
  parserProvider: string
  parserModel: string
  analysisJson: DocumentAnalysis | null
  annotationJson: DocumentAnalysis | null
  createdAt: string
  updatedAt: string
}

export interface ResourceDocumentTask {
  id: string
  documentId: string
  status: DocumentTaskStatus
  attempt: number
  errorMessage: string
  resultPayload: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ContestAuditLog {
  id: string
  contestId: string | null
  resourceId: string | null
  actorUserId: string | null
  action: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface PolicyLibraryItem {
  id: string
  meetingName: string
  summary: string
  conferenceDate: string
  importance: string
  officialMaterial: string
  officialMaterialLink: string
  wechatMaterial: string
  wechatMaterialLink: string
  weiboMaterial: string
  weiboMaterialLink: string
  douyinMaterial: string
  douyinMaterialLink: string
  xiaohongshuMaterial: string
  xiaohongshuMaterialLink: string
  metadata?: Record<string, unknown>
  status: PolicyLibraryItemStatus
  createdAt: string
  updatedAt: string
}

export type ReleaseScopeKind = 'contest' | 'policy_library'
export type ReleaseVersionStatus
  = 'pending_first_review'
    | 'pending_second_review'
    | 'approved'
    | 'rejected'
    | 'published'
    | 'superseded'

export type ReleaseReviewAction
  = 'sync_generated'
    | 'manual_generated'
    | 'sync_draft_overwritten'
    | 'first_review_approved'
    | 'second_review_claimed'
    | 'second_review_approved'
    | 'rejected'
    | 'published'

export type ContestWorkflowTimelineSource = 'feishu' | 'manual' | 'review' | 'publish' | 'repair'

export interface ReleaseSyncSource {
  syncItemId: string
  syncRunId?: string | null
  recordId?: string | null
}

export interface ContestReleaseContestSnapshot {
  liveId?: string | null
  externalId: string
  syncSource?: ReleaseSyncSource
  name: string
  level: ContestLevel
  organizer?: string
  coOrganizer?: string
  officialUrl?: string
  summary?: string
  participantRequirements?: string
  teamRule?: string
  currentSeason?: string
  disciplines?: string[]
  aliases?: string[]
  keywords?: string[]
  recommendedFor?: string[]
  faq?: string
  faqItems?: ContestFaqItem[]
  hotScore?: number
  visibility?: ContestVisibility
}

export interface ContestReleaseTrackSnapshot {
  liveId?: string | null
  externalId: string
  syncSource?: ReleaseSyncSource
  contestExternalId: string
  name: string
  summary?: string
  coverImageUrl?: string
  location?: string
  organizer?: string
  undertaker?: string
  participantRequirements?: string
  teamRule?: string
  currentSeason?: string
  awardRatio?: string
  suitableMajors?: string[]
  deliverableTypes?: string[]
  sortOrder?: number
  evidenceRequirements?: string[]
  scoringPoints?: string[]
  deductionItems?: string[]
}

export interface ContestReleaseTimelineSnapshot {
  externalId: string
  year: number
  nodeType: TimelineNodeType
  startAt: string | null
  endAt: string | null
  note: string
  sourceLink: string
}

export interface ContestReleaseTrackTimelineSnapshot {
  externalId: string
  syncSource?: ReleaseSyncSource
  trackExternalId: string
  trackLiveId?: string | null
  year: number
  nodeType: TimelineNodeType
  startAt: string | null
  endAt: string | null
  note: string
  sourceLink: string
}

export interface ContestReleaseResourceSnapshot {
  liveId?: string | null
  externalId: string
  syncSource?: ReleaseSyncSource
  contestExternalId: string
  trackExternalId?: string
  trackLiveId?: string | null
  title: string
  category: ResourceCategory
  url: string
  year?: number
  summary?: string
  content?: string
  sourceType?: string
  accessLevel?: ResourceAvailability
  status?: ResourceStatus
  metadata?: Record<string, unknown>
}

export interface ContestReleaseSnapshot {
  contestExternalId: string
  contest?: ContestReleaseContestSnapshot | null
  tracks: ContestReleaseTrackSnapshot[]
  timelines: ContestReleaseTimelineSnapshot[]
  trackTimelines: ContestReleaseTrackTimelineSnapshot[]
  resources: ContestReleaseResourceSnapshot[]
}

export interface PolicyLibraryItemSnapshot {
  liveId?: string | null
  externalId: string
  syncSource?: ReleaseSyncSource
  meetingName: string
  summary?: string
  conferenceDate?: string
  importance?: string
  officialMaterial?: string
  officialMaterialLink?: string
  wechatMaterial?: string
  wechatMaterialLink?: string
  weiboMaterial?: string
  weiboMaterialLink?: string
  douyinMaterial?: string
  douyinMaterialLink?: string
  xiaohongshuMaterial?: string
  xiaohongshuMaterialLink?: string
  metadata?: Record<string, unknown>
  status?: PolicyLibraryItemStatus
}

export interface PolicyLibraryReleaseSnapshot {
  items: PolicyLibraryItemSnapshot[]
}

export interface ReleaseDiffSummary {
  createdCount: number
  updatedCount: number
  removedCount: number
  changedExternalIds: string[]
}

export interface ReleaseVersion {
  id: string
  scopeKind: ReleaseScopeKind
  scopeId: string
  liveEntityId?: string | null
  scopeTitle: string
  versionNumber: number
  status: ReleaseVersionStatus
  snapshot: Record<string, unknown>
  diffSummary: ReleaseDiffSummary
  syncItemId?: string | null
  syncRunId?: string | null
  firstReviewByUserId?: string | null
  firstReviewAt?: string | null
  secondReviewClaimedByUserId?: string | null
  secondReviewClaimedAt?: string | null
  secondReviewByUserId?: string | null
  secondReviewAt?: string | null
  rejectedByUserId?: string | null
  rejectedAt?: string | null
  rejectReason?: string | null
  publishedByUserId?: string | null
  publishedAt?: string | null
  createdByUserId?: string | null
  updatedByUserId?: string | null
  createdAt: string
  updatedAt: string
}

export interface ReleaseReviewLog {
  id: string
  releaseVersionId: string
  actorUserId?: string | null
  action: ReleaseReviewAction
  payload: Record<string, unknown>
  createdAt: string
}

export interface ContestWorkflowTimelineItem {
  id: string
  source: ContestWorkflowTimelineSource
  action: string
  title: string
  description?: string
  actorUserId?: string | null
  contestId?: string | null
  resourceId?: string | null
  versionId?: string | null
  versionNumber?: number | null
  syncItemId?: string | null
  syncRunId?: string | null
  recordId?: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface ReleaseVersionDetail {
  version: ReleaseVersion
  logs: ReleaseReviewLog[]
  publishCheck?: PublishCheckResult | null
  workflowTimeline?: ContestWorkflowTimelineItem[]
}

export interface ReleaseQueueStatusStats {
  pendingFirst: number
  pendingSecond: number
  approved: number
  rejected: number
  published: number
  superseded: number
  total: number
}

export type ReleaseQueueReviewerRankingMode = 'total_actions' | 'second_review_approved' | 'published'
export type ReleaseQueueInsightsWindowDays = 0 | 7 | 30

export interface ReleaseQueueReviewerStats {
  userId: string
  actorName: string
  avatarUrl?: string | null
  firstReviewApprovedCount: number
  secondReviewClaimedCount: number
  secondReviewApprovedCount: number
  rejectedCount: number
  totalActions: number
  publishedCount: number
  lastActionAt?: string | null
}

export interface ReleaseQueueActionableCounts {
  pendingFirstCount: number
  claimedSecondCount: number
  readyToPublishCount: number
}

export interface ReleaseQueueRecentReviewItem {
  id: string
  releaseVersionId: string
  scopeKind: ReleaseScopeKind
  scopeId: string
  scopeTitle: string
  versionNumber: number
  actorUserId: string
  action: ReleaseReviewAction
  actorName: string
  avatarUrl?: string | null
  createdAt: string
}

export interface ReleaseQueueInsights {
  windowDays: ReleaseQueueInsightsWindowDays
  rankingMode: ReleaseQueueReviewerRankingMode
  currentUser: ReleaseQueueReviewerStats | null
  actionable: ReleaseQueueActionableCounts | null
  reviewers: ReleaseQueueReviewerStats[]
  recentReviews: ReleaseQueueRecentReviewItem[]
}

export interface AdminReleaseQueueResult {
  items: ReleaseVersion[]
  total: number
  limit: number
  stats: ReleaseQueueStatusStats
  insights: ReleaseQueueInsights
}

export interface AdminContestListItem {
  id?: string | null
  scopeId: string
  externalId?: string | null
  name: string
  officialUrl?: string
  organizer?: string
  coOrganizer?: string
  level?: ContestLevel | ''
  liveStatus?: ContestStatus | ''
  visibility?: ContestVisibility | ''
  latestReleaseStatus?: ReleaseVersionStatus | ''
  latestReleaseVersionId?: string | null
  latestPublishedVersionId?: string | null
  latestVersionNumber?: number | null
  latestPublishedVersionNumber?: number | null
  hasPublishBlockers: boolean
  latestSyncAt?: string | null
  latestPublishedAt?: string | null
}

export interface ContestFilterInput {
  discipline?: string
  level?: ContestLevel | ''
  major?: string
  trackType?: string
  keyword?: string[]
}

export interface TopicProposalItem {
  id: string
  title: string
  reason: string
  innovationPoints: string[]
  techRouteSteps: string[]
  scoringMapping: string[]
  risks: string[]
  estimatedWorkload: string
  recommendedTrackId: string
  recommendedTrackName: string
  contestFitScore: number
  contestFitReasons: string[]
  similarAwards: TopicProposalSimilarityAward[]
  trendSignals: TopicProposalTrendSignal[]
  requiredSkills: string[]
  teamMatchScore: number
  teamGapNotes: string[]
  evidenceRefs: TopicProposalEvidenceRef[]
  decisionStatus: TopicProposalDecisionStatus
  compareScores: TopicProposalCompareScores
  totalScore: number
  references: string[]
}

export type TopicProposalDecisionStatus = 'candidate' | 'shortlisted' | 'rejected' | 'selected'

export interface TopicProposalSimilarityAward {
  title: string
  summary: string
  year?: number
  contestId?: string
  contestName?: string
  trackId?: string
  trackName?: string
  similarityScore: number
  reason?: string
}

export interface TopicProposalTrendSignal {
  label: string
  summary: string
  heatScore: number
  source: 'contest_trends' | 'internal_resource' | 'web_search'
  confidence: number
}

export interface TopicProposalEvidenceRef {
  title: string
  summary: string
  sourceType: 'project_resource' | 'contest_resource' | 'contest_trend' | 'web_search'
  sourceLabel: string
  url?: string
  confidence: number
}

export interface TopicProposalCompareScores {
  contestFit: number
  noveltySimilarity: number
  evidenceReadiness: number
  trendHeat: number
  teamMatch: number
  workloadFeasibility: number
}

export interface TopicProposalCompareMatrixRow extends TopicProposalCompareScores {
  candidateId: string
  title: string
  decisionStatus: TopicProposalDecisionStatus
  totalScore: number
  rank: number
}

export interface TopicProposal {
  id: string
  contestId: string
  trackId: string
  createdAt: string
  proposals: TopicProposalItem[]
}

export interface ReviewDimensionScore {
  role: string
  score: number
  comment: string
}

export interface ReviewReport {
  id: string
  contestId: string
  trackId: string
  totalScore: number
  dimensionScores: ReviewDimensionScore[]
  topPriorities: string[]
  chapterSuggestions: Array<{ chapter: string, suggestions: string[] }>
  actionItems: Array<{ task: string, workload: WorkloadLevel }>
  riskWarnings: string[]
  createdAt: string
}

export interface DefenseSession {
  id: string
  contestId: string
  trackId: string
  topQuestions: string[]
  answer30s: string[]
  answer90s: string[]
  materialGaps: string[]
  createdAt: string
}

export interface TeamProfile {
  orgName?: string
  orgCode?: string
  metadata?: Record<string, unknown>
}

export interface Workspace {
  id: string
  type: TeamType
  name: string
  ownerUserId: string
  teamProfile: TeamProfile | null
  roles: WorkspaceMemberRole[]
  createdAt: string
  updatedAt: string
}

export type Team = Workspace

export interface TeamQuota {
  teamId: string
  workspaceId?: string
  planTier?: 'personal_team' | 'business_team' | null
  seatLimit: number
  seatUsed: number
  aiQuotaTotal: number
  aiQuotaUsed: number
  resetCycle: string
  updatedAt: string
}

export interface WorkspaceWithQuota {
  workspace: Workspace
  quota: TeamQuota | null
}

export interface TeamWithQuota {
  team: Team
  quota: TeamQuota | null
}

export interface AuthUser {
  id: string
  username: string
  avatarUrl?: string | null
  isPlatformAdmin: boolean
  isDisabled: boolean
  platformRoles?: PlatformRole[]
  platformPermissions?: PlatformPermission[]
  createdAt: string
  updatedAt: string
}

export interface AuthSession {
  id: string
  userId: string
  expiresAt: string
  createdAt: string
}

export type AuthSessionHistoryStatus = 'current' | 'active' | 'expired' | 'revoked'

export interface AuthSessionHistoryItem {
  id: string
  userId: string
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
  status: AuthSessionHistoryStatus
  isCurrent: boolean
}

export interface AuthLoginResult {
  user: AuthUser
  session: AuthSession
  teams: TeamWithQuota[]
  workspaces: WorkspaceWithQuota[]
  onboarding: {
    needCreateTeam: boolean
  }
}

export interface AuthMeResult {
  user: AuthUser
  teams: TeamWithQuota[]
  workspaces: WorkspaceWithQuota[]
  onboarding: {
    needCreateTeam: boolean
  }
}

export interface AuthSessionProbeResult {
  authenticated: true
  userId: string
  expiresAt: string
}

export interface CasdoorAuthMeta {
  enabled: boolean
  displayName: string
}

export interface OAuthAuthMeta {
  enabled: boolean
  displayName: string
}

export type OAuthProtocolMode = 'oidc_discovery' | 'oauth2_manual'

export interface CasdoorIntegrationConfig {
  enabled: boolean
  displayName: string
  protocolMode: OAuthProtocolMode
  issuer: string
  authorizeEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  clientId: string
  clientSecretConfigured: boolean
  scope: string
  redirectUri: string
  updatedAt: string
  updatedByUserId: string
}

export interface AuthLoginMeta {
  registrationEnabled: boolean
  feishu: FeishuIntegrationConfig
  oauth: OAuthAuthMeta
  casdoor: CasdoorAuthMeta
}

export interface Invitation {
  id: string
  teamId: string
  workspaceId?: string
  projectId?: string | null
  projectRole?: ProjectMemberRole | null
  role: WorkspaceMemberRole
  inviteeUsername: string | null
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface InvitationWithToken extends Invitation {
  token: string
}

export interface WorkspaceMemberSummary {
  userId: string
  username: string
  roles: WorkspaceMemberRole[]
  joinedAt: string
  updatedAt: string
}

export interface WorkspaceInvitationSummary extends Invitation {
  invitedByUserId: string
  invitedByUsername: string
  projectTitle?: string | null
  isExpired: boolean
}

export interface ProjectInvitationSummary extends Invitation {
  invitedByUserId: string
  invitedByUsername: string
  projectTitle?: string | null
  isExpired: boolean
}

export type UserNotificationCategory = 'platform' | 'contest' | 'collab'
export type UserNotificationType
  = | 'platform.announcement'
    | 'contest.deadline_reminder'
    | 'workspace.invitation.created'
    | 'workspace.invitation.accepted'
    | 'workspace.member.removed'
    | 'project.invitation.created'
    | 'project.invitation.accepted'
    | 'project.member.added'
    | 'project.member.removed'
    | 'project.member.role_changed'

export interface UserNotification {
  id: string
  userId: string
  workspaceId?: string | null
  projectId?: string | null
  category: UserNotificationCategory
  type: UserNotificationType
  title: string
  body: string
  actionUrl?: string | null
  actionLabel?: string | null
  actorUserId?: string | null
  payload: Record<string, unknown>
  dedupeKey: string
  readAt?: string | null
  createdAt: string
  expiresAt?: string | null
}

export interface UserNotificationListResult {
  items: UserNotification[]
  unreadCount: number
  nextCursor: string
}

export interface WorkspaceMemberManagementSnapshot {
  teamId: string
  workspaceId?: string
  members: WorkspaceMemberSummary[]
  invitations: WorkspaceInvitationSummary[]
}

export interface WorkspaceAiUsageMemberSummary {
  userId: string
  username: string
  units: number
  calls: number
  lastUsedAt: string | null
}

export interface WorkspaceAiUsageHistoryItem {
  id: string
  userId: string
  username: string
  route: string
  units: number
  createdAt: string
}

export interface WorkspaceAiUsageHistory {
  workspaceId: string
  page: number
  pageSize: number
  total: number
  totalCalls: number
  totalUnits: number
  memberSummaries: WorkspaceAiUsageMemberSummary[]
  items: WorkspaceAiUsageHistoryItem[]
}

export interface ProjectCollegeBinding {
  collegeCode: string
  collegeName: string
}

export interface ProjectAdvisorBinding {
  userId: string
  username: string
}

export interface ProjectPayload {
  title: string
  contestId: string
  trackId: string
  contestIds?: string[]
  problemStatement: string
  innovationPoints: string[]
  techRouteSteps: string[]
  scoringMapping: string[]
  risks: string[]
  deliverables: string[]
  summary?: string
}

export type ProjectDisplayIcon
  = | 'rocket_launch'
    | 'shield'
    | 'lightbulb'
    | 'architecture'
    | 'hub'
    | 'science'
    | 'public'
    | 'school'

export type ProjectDisplayPresetAccentColor
  = | 'blue'
    | 'indigo'
    | 'pink'
    | 'cyan'
    | 'violet'
    | 'emerald'
    | 'lime'
    | 'amber'
    | 'orange'
    | 'rose'
    | 'slate'
    | 'teal'

export type ProjectDisplayAccentColor = ProjectDisplayPresetAccentColor | `#${string}`

export interface ProjectDisplayConfig {
  icon: ProjectDisplayIcon
  accentColor: ProjectDisplayAccentColor
}

export interface ProjectSeatQuotaSummary {
  seatLimit: number
  seatUsed: number
}

export interface ProjectMemberPreviewSummary {
  projectId: string
  userId: string
  username: string
  role: ProjectMemberRole
  avatarUrl?: string | null
}

export interface Project extends ProjectPayload {
  id: string
  teamId: string
  workspaceId?: string
  ownerUserId: string
  creatorUserId: string
  payerUserId: string | null
  source: ProjectSource
  status: ProjectStatus
  collegeBindings: ProjectCollegeBinding[]
  advisorBindings: ProjectAdvisorBinding[]
  display?: ProjectDisplayConfig | null
  projectSeatQuota?: ProjectSeatQuotaSummary | null
  memberPreview?: ProjectMemberPreviewSummary[]
  createdAt: string
  updatedAt: string
}

export interface ProjectMemberSummary {
  projectId: string
  userId: string
  username: string
  avatarUrl?: string | null
  role: ProjectMemberRole
  addedByUserId: string
  addedByUsername: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMemberManagementSnapshot {
  projectId: string
  teamId: string
  workspaceId?: string
  members: ProjectMemberSummary[]
  invitations: ProjectInvitationSummary[]
  seatQuota: ProjectSeatQuota | null
}

export interface ProjectContestBinding {
  contestId: string
  trackId: string
  sortOrder: number
  updatedAt?: string
}

export interface ProjectContestAdaptation {
  contestId: string
  trackId: string
  problemStatement: string
  innovationPoints: string[]
  techRouteSteps: string[]
  scoringMapping: string[]
  risks: string[]
  deliverables: string[]
  summary: string
  createdAt?: string
  updatedAt?: string
}

export interface ProjectSettingsSnapshot {
  project: Project
  contestBindings: ProjectContestBinding[]
  currentContestId: string
  currentAdaptation: ProjectContestAdaptation | null
}

export interface ProjectOutlineNode {
  id: string
  title: string
  level: number
  order: number
  sourceResourceIds: string[]
  confidence: number
  children: ProjectOutlineNode[]
}

export interface ProjectOutlineSnapshot {
  projectId: string
  context: {
    contestId: string
    trackId: string
    major: string
    discipline: string
    level: string
    trackType: string
  }
  items: ProjectOutlineNode[]
  generatedAt: string
  reason: string
}

export type ProjectMeetingMode = 'audio' | 'video'
export type ProjectMeetingStatus = 'scheduled' | 'active' | 'ended' | 'failed'
export type ProjectMeetingTranscriptStatus = 'idle' | 'running' | 'completed' | 'failed'
export type ProjectMeetingRecordingStatus = 'idle' | 'requested' | 'processing' | 'completed' | 'failed'
export type ProjectMeetingSummaryStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
export type ProjectMeetingParticipantRole = 'host' | 'member' | 'guest' | 'system' | 'unknown'
export type ProjectMeetingTrackState = 'unknown' | 'muted' | 'active' | 'ended'
export type ProjectMeetingJobType = 'transcript_finalize' | 'recording_finalize' | 'meeting_summary'
export type ProjectMeetingJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type ProjectMeetingArtifactKind = 'meeting_recording' | 'meeting_notes'

export interface ProjectMeeting {
  id: string
  projectId: string
  workspaceId: string
  title: string
  mode: ProjectMeetingMode
  provider: string
  providerRoomId: string
  providerRoomName: string
  status: ProjectMeetingStatus
  transcriptStatus: ProjectMeetingTranscriptStatus
  recordingStatus: ProjectMeetingRecordingStatus
  summaryStatus: ProjectMeetingSummaryStatus
  recordingResourceId?: string | null
  notesResourceId?: string | null
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  durationMinutes?: number
  invitedCount?: number
  startedByUserId: string
  startedAt: string
  endedAt?: string | null
  providerJoinUrl?: string
  providerMetadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProjectMeetingParticipant {
  id: string
  meetingId: string
  projectId: string
  userId?: string | null
  username?: string
  avatarUrl?: string | null
  providerParticipantId?: string
  providerIdentity: string
  displayName: string
  role: ProjectMeetingParticipantRole
  joinedAt?: string | null
  leftAt?: string | null
  audioTrackState: ProjectMeetingTrackState
  videoTrackState: ProjectMeetingTrackState
  screenShareTrackState: ProjectMeetingTrackState
  screenShareAudioTrackState: ProjectMeetingTrackState
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ProjectMeetingInvitee {
  id: string
  meetingId: string
  projectId: string
  userId: string
  username: string
  avatarUrl?: string | null
  role: ProjectMeetingParticipantRole
  invitedAt: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMeetingUtterance {
  id: string
  meetingId: string
  participantId?: string | null
  speakerUserId?: string | null
  speakerName: string
  speakerLabel: string
  sequenceNo: number
  startedAtMs: number
  endedAtMs: number
  text: string
  language: string
  confidence: number
  isFinal: boolean
  providerEventKey?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectMeetingJob {
  id: string
  meetingId: string
  jobType: ProjectMeetingJobType
  status: ProjectMeetingJobStatus
  attempt: number
  maxAttempt: number
  nextRunAt: string
  errorMessage: string
  payload: Record<string, unknown>
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectMeetingDetail extends ProjectMeeting {
  invitees: ProjectMeetingInvitee[]
  participants: ProjectMeetingParticipant[]
  recentJobs: ProjectMeetingJob[]
}

export interface ProjectMeetingRuntimeHealth {
  ready: boolean
  rtcProvider: string
  asrProvider: string
  rtcIssues: string[]
  asrIssues: string[]
  issues: string[]
}

export interface ProjectMeetingListPayload {
  items: ProjectMeeting[]
  runtimeHealth: ProjectMeetingRuntimeHealth
}

export interface ProjectMeetingGuestShare {
  id: string
  meetingId: string
  projectId: string
  workspaceId: string
  shareKey: string
  shareUrl: string
  expiresAt: string
  revokedAt?: string | null
  createdByUserId?: string | null
  createdAt: string
  updatedAt: string
}

export interface SharedProjectMeetingParticipant {
  id: string
  displayName: string
  role: ProjectMeetingParticipantRole
  audioTrackState: ProjectMeetingTrackState
  videoTrackState: ProjectMeetingTrackState
  screenShareTrackState: ProjectMeetingTrackState
  screenShareAudioTrackState: ProjectMeetingTrackState
  joinedAt?: string | null
  leftAt?: string | null
}

export interface SharedProjectMeetingUtterance {
  id: string
  participantId?: string | null
  speakerLabel: string
  sequenceNo: number
  startedAtMs: number
  endedAtMs: number
  text: string
  language: string
  confidence: number
  isFinal: boolean
  createdAt: string
  updatedAt: string
}

export interface SharedProjectMeetingSnapshot {
  meetingId: string
  title: string
  mode: ProjectMeetingMode
  status: ProjectMeetingStatus
  scheduledStartAt?: string | null
  scheduledEndAt?: string | null
  durationMinutes?: number
  participantCount: number
  shareExpiresAt?: string
  participants: SharedProjectMeetingParticipant[]
  utterances: SharedProjectMeetingUtterance[]
}

export interface ProjectMeetingGuestJoinSession {
  meetingId: string
  meetingGuestToken: string
  meetingGuestExpiresAt: string
  rtcJoinToken: string
  rtcJoinExpiresAt: string
  rtcServerUrl?: string
  rtcJoinUrl?: string
  snapshot: SharedProjectMeetingSnapshot
}

export interface ProjectSettingsDraftCommon {
  title: string
  summary: string
  icon: string
  accentColor: string
  problemStatement: string
  innovationPointsText: string
  techRouteStepsText: string
  scoringMappingText: string
  risksText: string
  deliverablesText: string
}

export interface ProjectSettingsDraftBinding {
  contestId: string
  trackId: string
  sortOrder: number
}

export interface ProjectSettingsDraftAdaptation {
  contestId: string
  trackId: string
  problemStatement: string
  innovationPointsText: string
  techRouteStepsText: string
  scoringMappingText: string
  risksText: string
  deliverablesText: string
  summary: string
}

export interface ProjectSettingsDraftUi {
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
}

export interface ProjectSettingsDraftPayload {
  updatedAt: string
  deviceId?: string
  common: ProjectSettingsDraftCommon
  bindings: ProjectSettingsDraftBinding[]
  currentContestId: string
  adaptationDrafts: Record<string, ProjectSettingsDraftAdaptation>
  ui?: ProjectSettingsDraftUi
}

export interface ProjectSettingsDraft {
  projectId: string
  payload: ProjectSettingsDraftPayload
  revision: number
  deviceId: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string
}

export type WorkspaceFixedTabId = 'dashboard' | 'meeting' | 'members' | 'flow' | 'settings' | 'loopy_data'
export type WorkspaceMeetingTabId = `meeting:${string}`
export type WorkspaceMeetingCreateTabId = 'meeting-create:audio' | 'meeting-create:video'
export type WorkspaceResourceTabId = `resource:${string}`
export type WorkspaceOpenTabState = WorkspaceFixedTabId | WorkspaceMeetingTabId | WorkspaceMeetingCreateTabId | WorkspaceResourceTabId
export type ProjectWorkbenchMode = 'project' | 'defense' | 'final_review'
export type ProjectWorkspaceAssistantMode = 'contextual' | 'dialog_ask'
export type ProjectWorkspaceRightSidebarView = 'ai' | 'comments'

export interface ProjectWorkspaceViewState {
  workbenchMode: ProjectWorkbenchMode
  mainTabs: WorkspaceOpenTabState[]
  activeMainTabId: WorkspaceOpenTabState | ''
  previewResourceId: string
  selectedContestId: string
  selectedTrackId: string
  openChatSessionIds: string[]
  activeChatSessionId: string
  activeMeetingId: string
  projectAssistantMode: ProjectWorkspaceAssistantMode
  rightSidebarView: ProjectWorkspaceRightSidebarView
  leftSidebarWidth: number
  rightSidebarWidth: number
  leftSidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
}

export interface ProjectWorkspaceViewPreference {
  projectId: string
  payload: ProjectWorkspaceViewState
  revision: number
  deviceId: string
  updatedAt: string
  lastOpenedAt: string
}

export interface ProjectWorkspaceAiTabsState {
  openChatSessionIds: string[]
  activeChatSessionId: string
}

export interface ProjectWorkspaceAiTabsPreference {
  projectId: string
  payload: ProjectWorkspaceAiTabsState
  updatedAt: string
}

export interface DeviceScopedRestoreResolution {
  deviceId: string
  isNewDevice: boolean
  isStaleDevice: boolean
  shouldPrompt: boolean
  latestOtherDeviceId: string
  currentLastOpenedAt: string
  latestOtherLastOpenedAt: string
}

export interface ProjectWorkspaceViewDeviceStatePayload {
  current: ProjectWorkspaceViewPreference | null
  latestOther: ProjectWorkspaceViewPreference | null
  personalAiTabs: ProjectWorkspaceAiTabsPreference | null
  resolution: DeviceScopedRestoreResolution
}

export interface ProjectSettingsDraftDevicePayload {
  current: ProjectSettingsDraft | null
  latestOther: ProjectSettingsDraft | null
  resolution: DeviceScopedRestoreResolution
}

export interface TeamLastProjectPreference {
  workspaceId: string
  projectId: string
  updatedAt: string
}

export interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
  metadata?: Record<string, unknown>
}

export type WorkspaceStreamSystemMessageEventType = 'progress' | 'tool'

export interface WorkspaceStreamSystemMessageMetadata extends Record<string, unknown> {
  eventType: WorkspaceStreamSystemMessageEventType
  seq: number
  toolName?: string
  payloadSummary?: string
}

export interface AiRuntimeChannelHealth {
  configured: boolean
  provider: string
  model: string
  reason: string
  degraded?: boolean
  writeBlocked?: boolean
  rebuildRecommended?: boolean
}

export interface AiModelOption {
  id: string
  label: string
  provider?: string
  model?: string
  description?: string
}

export interface AiModelGroup {
  key: string
  label: string
  options: AiModelOption[]
}

export interface AiModelCatalog {
  groups: AiModelGroup[]
}

export interface UserAiSettings {
  memoryEnabled: boolean
  pilotEnabled: boolean
  reasoningEnabled: boolean
  networkEnabled: boolean
  temperature: number
  selectedModelGroup: string
  selectedModelId: string
  updatedAt?: string
}

export interface UserAiMemoryItem {
  id: string
  userId: string
  memoryText: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AiAssistantOptions {
  memoryEnabled: boolean
  pilotEnabled: boolean
  reasoningEnabled: boolean
  networkEnabled: boolean
  temperature: number
  selectedModelGroup: string
  selectedModelId: string
}

export interface AiChatSession {
  teamId?: string
  id: string
  workspaceId?: string
  projectId?: string
  mode?: WorkspaceAiMode
  createdByUserId: string
  title: string
  contestId?: string
  trackId?: string
  major?: string
  hasContextSnapshot?: boolean
  resumeAvailable?: boolean
  degraded?: boolean
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AiChatMessage {
  teamId?: string
  id: string
  workspaceId?: string
  sessionId: string
  role: ChatMessage['role']
  content: string
  provider: string
  model: string
  fallbackUsed: boolean
  metadata?: Record<string, unknown>
  createdByUserId: string
  createdAt: string
}

export interface AiChatSessionContextSnapshot {
  resourceId?: string
  resourceTitle?: string
  previewMode?: string
  contextualAssistantKey?: WorkspaceContextualAssistantKey | ''
  assistantPreset?: WorkspaceAiAssistantPreset
  assistantLabel?: string
  selectionText?: string
  selectionRange?: AiWorkspaceDocumentSelectionRange | null
  activeTabId?: string
  resourcePurpose?: CollabPurpose | ''
  requestedAgentAction?: WorkflowDraftAction
  workflowSnapshot?: WorkflowSnapshot | null
  sceneHash?: string
  sceneSourceFormat?: AiCanvasAssistSourceFormat
  sceneSourceText?: string
  updatedAt?: string
}

export interface AiChatSessionRunState {
  status: 'idle' | 'running' | 'interrupted' | 'completed' | 'failed'
  lastEventSeq?: number
  lastCheckpointRef?: string
  lastError?: string
  degraded?: boolean
  degradedReason?: string
  resumeAvailable?: boolean
  updatedAt?: string
}

export interface AiContestFilterRequest {
  teamId?: string
  workspaceId?: string
  query: string
  major?: string
  filters?: ContestFilterInput
  topK?: number
  contestId?: string
  trackId?: string
}

export interface AiContestFilterResult {
  normalizedFilters: ContestFilterInput
  reasoning: string
  contests: Contest[]
}

export interface AiProjectChatRequest {
  teamId?: string
  workspaceId?: string
  sessionId?: string
  messages: ChatMessage[]
  aiOptions?: Partial<AiAssistantOptions>
  context: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    contestId?: string
    trackId?: string
    major?: string
  }
}

export interface AiProjectChatResult {
  assistantReply: string
  projectDraft: ProjectPayload
  missingFields: string[]
  knowledge?: ProjectKnowledgeMessagePayload | null
  sessionId?: string
}

export type WorkspaceAiMode = 'dialog_ask' | 'contextual_agent' | 'auto_optimize' | 'issue_discovery' | 'defense' | 'document_assist'
export type WorkspaceAiAssistantPreset = 'default' | 'document' | 'prototype' | 'design'
export type WorkspaceContextualAssistantKey = 'agent_doc' | 'agent_proto' | 'design_assistant'
export type WorkspaceAiInteractionIntent = 'context_chat' | 'draft_action'
export type WorkspaceAiActionSource = 'composer' | 'toolbar'

export type ProjectResourceCommentAnchorType = 'text_selection' | 'image_node'
export type ProjectResourceCommentThreadStatus = 'open' | 'resolved'
export type AiWorkspaceDocumentTrigger = 'selection_toolbar' | 'slash_menu' | 'right_sidebar'
export type AiWorkspaceDocumentAction = 'summarize' | 'rewrite' | 'continue' | 'expand' | 'complete_context' | 'restructure'
export type AiWorkspaceDocumentDraftApplyMode = 'replace_selection' | 'replace_document' | 'insert_after_selection' | 'insert_at_cursor'
export type AiCanvasAssistAction = 'generate' | 'complete' | 'refine'
export type AiCanvasAssistTemplate = 'flowchart' | 'mindmap' | 'er' | 'architecture'
export type AiCanvasAssistSourceFormat = 'mermaid' | 'markdown_outline' | 'ddl' | 'architecture'
export type WorkflowDraftAction = AiCanvasAssistAction | 'restyle'
export type WorkflowArchitectureView = 'system_context' | 'container' | 'dependency_map'
export type WorkflowStylePreset = 'default' | 'minimal' | 'architecture' | 'workflow'
export type WorkflowLayoutPreset = 'left_to_right' | 'top_to_bottom' | 'swimlane'

export interface WorkflowSnapshotNode {
  id: string
  label: string
  parentId?: string | null
  shape?: string | null
  x: number
  y: number
  width: number
  height: number
  styleSummary: string[]
}

export interface WorkflowSnapshotEdge {
  id: string
  label: string
  source: string
  target: string
  styleSummary: string[]
}

export interface WorkflowSnapshotGroup {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  layoutKind: 'container' | 'swimlane'
  styleSummary: string[]
  childNodeIds: string[]
}

export interface WorkflowSnapshotPage {
  id: string
  name: string
  direction: WorkflowLayoutPreset | 'unknown'
  nodeCount: number
  edgeCount: number
  groupCount: number
  sampleLabels: string[]
  nodes: WorkflowSnapshotNode[]
  edges: WorkflowSnapshotEdge[]
  groups: WorkflowSnapshotGroup[]
  styleSummary: {
    shapes: string[]
    fillColors: string[]
    strokeColors: string[]
    edgeStyles: string[]
  }
}

export interface WorkflowSnapshot {
  format: 'drawio'
  hash: string
  pageCount: number
  isSinglePage: boolean
  currentPageId: string
  currentPageName: string
  nodeCount: number
  edgeCount: number
  groupCount: number
  sampleLabels: string[]
  styleSummary: {
    shapes: string[]
    fillColors: string[]
    strokeColors: string[]
    edgeStyles: string[]
  }
  pages: WorkflowSnapshotPage[]
}

export interface AiWorkspaceDocumentSelectionRange {
  anchorLine: number
  anchorColumn: number
  headLine: number
  headColumn: number
  isCollapsed: boolean
  selectionLength: number
}

export interface AiWorkspaceDocumentDraft {
  action: AiWorkspaceDocumentAction
  title: string
  summary: string
  resourceId: string
  resourceTitle: string
  selectionText: string
  selectionRange: AiWorkspaceDocumentSelectionRange | null
  applyMode: AiWorkspaceDocumentDraftApplyMode
  baseDocumentHash: string
  originalText: string
  proposedText: string
}

export interface AiWorkspaceWorkflowDraft {
  action: WorkflowDraftAction
  title: string
  summary: string
  resourceId: string
  resourceTitle: string
  template: AiCanvasAssistTemplate
  sourceFormat: AiCanvasAssistSourceFormat
  sourceText: string
  architectureView?: WorkflowArchitectureView | null
  stylePreset: WorkflowStylePreset
  layoutPreset: WorkflowLayoutPreset
  baseWorkflowHash: string
}

export interface AiWorkspaceSceneDraft {
  action: WorkflowDraftAction
  title: string
  summary: string
  resourceId: string
  resourceTitle: string
  template: AiCanvasAssistTemplate
  sourceFormat: AiCanvasAssistSourceFormat
  sourceText: string
  architectureView?: WorkflowArchitectureView | null
  stylePreset: WorkflowStylePreset
  layoutPreset: WorkflowLayoutPreset
  baseSceneHash: string
}

export interface ProjectResourceCommentTextSelectionAnchor {
  type: 'text_selection'
  anchor: Record<string, unknown>
  head: Record<string, unknown>
  selectedTextPreview: string
  headingText: string
  anchorLine: number
  anchorColumn: number
  headLine: number
  headColumn: number
  selectionLength: number
  isCollapsed: boolean
}

export interface ProjectResourceCommentImageNodeAnchor {
  type: 'image_node'
  resourceId?: string | null
  src: string
  alt?: string | null
  title?: string | null
}

export type ProjectResourceCommentAnchor
  = | ProjectResourceCommentTextSelectionAnchor
    | ProjectResourceCommentImageNodeAnchor

export interface ProjectResourceCommentMessage {
  id: string
  projectId: string
  resourceId: string
  threadId: string
  body: string
  createdByUserId: string
  createdByUsername?: string | null
  createdByAvatarUrl?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectResourceCommentThread {
  id: string
  projectId: string
  resourceId: string
  status: ProjectResourceCommentThreadStatus
  anchorType: ProjectResourceCommentAnchorType
  anchor: ProjectResourceCommentAnchor
  summaryText: string
  createdByUserId: string
  createdByUsername?: string | null
  createdByAvatarUrl?: string | null
  resolvedByUserId?: string | null
  resolvedByUsername?: string | null
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
  messages: ProjectResourceCommentMessage[]
}

export interface AiTopicProposalRequest {
  teamId?: string
  workspaceId?: string
  sessionId?: string
  messages: ChatMessage[]
  topK?: number
  aiOptions?: Partial<AiAssistantOptions>
  context: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    contestId?: string
    trackId?: string
    major?: string
    discipline?: string
    topicType?: string
    expectedDifficulty?: string
    keywords?: string[]
    teamSkillTags?: string[]
  }
}

export interface AiTopicReference {
  title: string
  url: string
  snippet: string
}

export interface AiTopicProposalResult {
  assistantReply: string
  proposals: TopicProposalItem[]
  compareMatrix: TopicProposalCompareMatrixRow[]
  boardSummary: string
  teamSkillProfile: string[]
  references: AiTopicReference[]
  missingFields: string[]
  selectedCandidateId?: string
  boardId?: string
  sessionId?: string
  webSearchEnabled?: boolean
}

export interface ProjectTopicBoardInput {
  contestId: string
  trackId: string
  major?: string
  discipline?: string
  topicType?: string
  expectedDifficulty?: string
  keywords: string[]
  teamSkillTags: string[]
  candidateCount: number
  source?: 'workspace_dashboard' | 'workspace_sidebar' | 'project_create'
}

export interface ProjectTopicBoardCreateSeed {
  contestId?: string
  trackId?: string
  major?: string
  discipline?: string
  topicType?: string
  expectedDifficulty?: string
  keywords: string[]
  teamSkillTags: string[]
  candidateCount: number
  source?: 'workspace_dashboard' | 'workspace_sidebar' | 'project_create'
  autoGenerate?: boolean
}

export interface ProjectTopicBoardCandidate {
  id: string
  boardId: string
  workspaceId: string
  projectId: string
  candidateId: string
  sortOrder: number
  decisionStatus: TopicProposalDecisionStatus
  totalScore: number
  payload: TopicProposalItem
  createdAt: string
  updatedAt: string
}

export interface ProjectTopicBoard {
  id: string
  workspaceId: string
  projectId: string
  contestId: string
  trackId: string
  input: ProjectTopicBoardInput
  teamSkillProfile: string[]
  boardSummary: string
  compareMatrix: TopicProposalCompareMatrixRow[]
  selectedCandidateId?: string
  sessionId?: string
  status: 'active' | 'archived'
  createdByUserId: string
  candidates: ProjectTopicBoardCandidate[]
  createdAt: string
  updatedAt: string
}

export interface ProjectTopicBoardListResult {
  latestBoard: ProjectTopicBoard | null
  history: ProjectTopicBoard[]
}

export interface ProjectTopicBoardGenerateRequest {
  input: ProjectTopicBoardInput
}

export interface ProjectTopicBoardPatchRequest {
  selectedCandidateId?: string
  boardSummary?: string
  candidateUpdates?: Array<{
    candidateId: string
    decisionStatus?: TopicProposalDecisionStatus
  }>
}

export type AiDefensePersonaJudgeType = 'technical' | 'business' | 'expression' | 'custom'
export type AiDefenseStage = 'opening' | 'qa' | 'rebuttal' | 'closing'
export type AiDefenseInputMode = 'text' | 'audio' | 'image' | 'video_frames' | 'mixed'
export type AiDefenseSummaryType = 'turn' | 'session'
export type AiDefenseSummaryStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed'
export type DefenseRealtimeProvider = 'qwen' | 'coze'
export type DefenseRealtimeMediaMode = 'audio' | 'audio_video'
export type DefenseRealtimeConnectionState = 'idle' | 'bootstrapping' | 'connecting' | 'connected' | 'interrupted' | 'error' | 'closed'

export interface DefenseRealtimePersonaPack {
  sessionId: string
  projectId: string
  contestName: string
  trackName: string
  stage: AiDefenseStage
  turnCount: number
  selectedPersonaIds: string[]
  judges: Array<{
    id: string
    name: string
    judgeType: AiDefensePersonaJudgeType
    enabled: boolean
    summary?: string
    focusAreas?: string[]
  }>
}

export interface DefenseRealtimeSessionMeta {
  provider: DefenseRealtimeProvider
  mediaMode: DefenseRealtimeMediaMode
  transport: 'websocket' | 'rtc_sidecar'
  connectionState: DefenseRealtimeConnectionState
  bootstrapState?: 'idle' | 'bootstrapping' | 'ready' | 'error'
  providerSessionId?: string | null
  conversationId?: string | null
  linkedMeetingId?: string | null
  lastProviderEventAt?: string | null
  latestSpeakerId?: string | null
  latestSpeakerLabel?: string | null
  latestLatencyMs?: number | null
  audioEnabled?: boolean
  videoEnabled?: boolean
  lastError?: string | null
  metadata?: Record<string, unknown>
}

export interface DefenseRealtimeBootstrapPayload {
  sessionId: string
  meetingId: string
  provider: DefenseRealtimeProvider
  mediaMode: DefenseRealtimeMediaMode
  transport: 'websocket' | 'rtc_sidecar'
  issuedAt: string
  expiresAt?: string | null
  personaPack: DefenseRealtimePersonaPack
  qwen?: {
    baseWsUrl: string
    workspaceId?: string
    appId?: string
    voice?: string
    frameIntervalMs: number
    accessToken?: string
    connectionUrl?: string
  } | null
  coze?: {
    baseUrl: string
    accessToken?: string
    botId: string
    connectorId?: string
    voiceId?: string
    conversationId?: string
    roomInfo?: Record<string, unknown> | null
  } | null
}

export type DefenseRealtimeNormalizedEventType
  = 'session.state'
    | 'user.transcript.partial'
    | 'user.transcript.final'
    | 'assistant.transcript.delta'
    | 'assistant.transcript.final'
    | 'assistant.audio.started'
    | 'assistant.audio.ended'
    | 'latency'
    | 'error'

export interface DefenseRealtimeNormalizedEvent {
  type: DefenseRealtimeNormalizedEventType
  provider: DefenseRealtimeProvider
  sessionId: string
  meetingId?: string
  transport?: DefenseRealtimeSessionMeta['transport']
  createdAt: string
  connectionState?: DefenseRealtimeConnectionState
  providerSessionId?: string
  conversationId?: string
  eventId?: string
  text?: string
  speakerId?: string
  speakerName?: string
  speakerLabel?: string
  judgeType?: AiDefensePersonaJudgeType
  turnIndex?: number
  stage?: AiDefenseStage
  latencyMs?: number
  isFinal?: boolean
  videoEnabled?: boolean
  audioEnabled?: boolean
  errorMessage?: string
  metadata?: Record<string, unknown>
}

export interface AiDefenseAttachment {
  id?: string
  kind: string
  resourceId?: string
  name?: string
  page?: number | null
  caption?: string
  metadata?: Record<string, unknown>
}

export interface AiDefenseEvidenceRef {
  resourceId?: string
  resourceTitle: string
  excerpt: string
  page?: number | null
  sourceType?: 'project' | 'contest' | 'attachment'
  category?: string
  score?: number
}

export interface AiDefensePersona {
  id: string
  projectId: string
  sourceContestId?: string | null
  sourceTrackId?: string | null
  sourceTemplateKey?: string
  judgeType: AiDefensePersonaJudgeType
  name: string
  summary: string
  systemPrompt: string
  focusAreas: string[]
  scoringRubric: RubricDimension[]
  enabled: boolean
  sortOrder: number
  isCustomized: boolean
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface AiDefensePersonaPreset {
  id: string
  externalId: string
  contestExternalId: string
  trackExternalId?: string | null
  syncItemId?: string | null
  judgeType: AiDefensePersonaJudgeType
  name: string
  summary: string
  systemPrompt: string
  focusAreas: string[]
  scoringRubric: RubricDimension[]
  enabled: boolean
  sortOrder: number
  metadata?: Record<string, unknown>
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface AiDefenseJudgeRound {
  judge: string
  judgeType: AiDefensePersonaJudgeType
  personaId?: string | null
  stage?: AiDefenseStage
  turnIndex?: number
  question: string
  score: number
  comment: string
  followUp: string
  evidenceRefs: AiDefenseEvidenceRef[]
  createdAt?: string
}

export interface AiDefenseScorecard {
  technical: number
  business: number
  expression: number
  total: number
  summary: string
  materialGaps: string[]
  actionItems: string[]
}

export interface AiDefenseSessionState {
  sessionId: string
  projectId: string
  workspaceId: string
  currentStage: AiDefenseStage
  turnCount: number
  selectedPersonaIds: string[]
  summaryStatus: AiDefenseSummaryStatus
  summaryResourceId?: string | null
  linkedMeetingId?: string | null
  lastInputMode: AiDefenseInputMode
  lastContextPack?: Record<string, unknown>
  lastScorecard?: AiDefenseScorecard | null
  realtime?: DefenseRealtimeSessionMeta | null
  createdAt: string
  updatedAt: string
}

export interface AiDefenseTurn {
  id: string
  sessionId: string
  projectId: string
  stage: AiDefenseStage
  turnIndex: number
  personaId?: string | null
  judgeType: AiDefensePersonaJudgeType
  judgeName: string
  question: string
  comment: string
  followUp: string
  score: number
  evidenceRefs: AiDefenseEvidenceRef[]
  attachments: AiDefenseAttachment[]
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AiDefenseSummary {
  id: string
  sessionId: string
  projectId: string
  summaryType: AiDefenseSummaryType
  turnIndex?: number | null
  status: AiDefenseSummaryStatus
  summary: string
  strengths: string[]
  risks: string[]
  actionItems: string[]
  evidenceGaps: string[]
  markdown: string
  resourceId?: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export interface AiDefenseSessionDetail {
  session: AiChatSession
  state: AiDefenseSessionState | null
  personas: AiDefensePersona[]
  turns: AiDefenseTurn[]
  latestRounds: AiDefenseJudgeRound[]
  latestSummary: AiDefenseSummary | null
}

export interface AiDefenseRequest {
  teamId?: string
  workspaceId?: string
  sessionId?: string
  clientTurnId?: string
  meetingId?: string
  personaIds?: string[]
  stageHint?: AiDefenseStage
  inputMode?: AiDefenseInputMode
  attachments?: AiDefenseAttachment[]
  messages: ChatMessage[]
  aiOptions?: Partial<AiAssistantOptions>
  context: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    contestId?: string
    trackId?: string
    major?: string
  }
}

export interface AiDefenseResult {
  assistantReply: string
  rounds: AiDefenseJudgeRound[]
  scorecard: AiDefenseScorecard
  missingFields: string[]
  sessionId?: string
  stage?: AiDefenseStage
  nextStage?: AiDefenseStage
  turnIndex?: number
  evidenceRefs?: AiDefenseEvidenceRef[]
  summaryStatus?: AiDefenseSummaryStatus
  selectedPersonaIds?: string[]
}

export type AiDefenseStreamEventType
  = | 'progress'
    | 'stage'
    | 'evidence'
    | 'delta'
    | 'judge'
    | 'score'
    | 'summary'
    | 'done'
    | 'error'

export interface AiDefenseStreamEvent {
  event: AiDefenseStreamEventType
  data: Record<string, unknown>
}

export type AiProjectChangeStatus = 'pending' | 'approved' | 'rejected' | 'failed'

export type AiProjectChangeType
  = 'settings_common_patch'
    | 'contest_bindings_replace'
    | 'adaptation_patch'
    | 'resource_bind_library'
    | 'resource_update_metadata'
    | 'resource_archive'
    | 'resource_restore'
    | 'resource_purge'

export interface AiProjectChangeRequest {
  id: string
  workspaceId: string
  projectId: string
  sessionId: string
  mode: WorkspaceAiMode
  changeType: AiProjectChangeType
  title: string
  summary: string
  destructive: boolean
  payload: Record<string, unknown>
  status: AiProjectChangeStatus
  createdByUserId: string
  approvedByUserId?: string
  approvedAt?: string
  rejectedByUserId?: string
  rejectedAt?: string
  rejectedReason?: string
  executedResult?: Record<string, unknown>
  failedReason?: string
  createdAt: string
  updatedAt: string
}

export type AiToolSource = 'builtin' | 'provider'
export type AiToolRiskLevel = 'read' | 'write' | 'destructive'
export type AiWorkflowTriggerType = 'manual' | 'resource.batch'
export type AiWorkflowContextSource
  = | 'project.settings'
    | 'project.outline'
    | 'project.resources'
    | 'project.knowledge'
    | 'resource.selection'
    | 'session.memory'
export type AiWorkflowStepType = 'prompt' | 'tool' | 'agent'
export type AiWorkflowAgentMode = Exclude<WorkspaceAiMode, 'defense'>
export type AiWorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'needs_review'
export type AiWorkflowRunStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'needs_review' | 'skipped'

export interface AiWorkflowTrigger {
  type: AiWorkflowTriggerType
}

export interface AiWorkflowToolRef {
  key: string
  label: string
  description: string
  source: AiToolSource
  riskLevel: AiToolRiskLevel
  projectScoped: boolean
  supportsWorkflow: boolean
  resultSchema?: Record<string, unknown>
}

export interface AiWorkflowStep {
  id: string
  name: string
  type: AiWorkflowStepType
  prompt?: string
  toolKey?: string
  toolInput?: Record<string, unknown>
  agentMode?: AiWorkflowAgentMode
  continueOnError?: boolean
  requiresReview?: boolean
  contextSources?: AiWorkflowContextSource[]
}

export interface AiWorkflowDefinitionPayload {
  name: string
  description: string
  trigger: AiWorkflowTrigger
  contextSources: AiWorkflowContextSource[]
  toolAllowlist: string[]
  steps: AiWorkflowStep[]
}

export interface AiWorkflowDefinition extends AiWorkflowDefinitionPayload {
  id: string
  workspaceId: string
  projectId: string
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export interface AiWorkflowTemplatePreset extends AiWorkflowDefinitionPayload {
  key: string
}

export interface AiWorkflowRunTriggerPayload {
  selectedResourceIds?: string[]
  sessionId?: string
  note?: string
  [key: string]: unknown
}

export interface AiWorkflowRunReviewContext extends Record<string, unknown> {
  kind: 'project_change_request'
  changeRequestIds: string[]
  changeRequests?: AiProjectChangeRequest[]
}

export interface AiWorkflowRunStep {
  id: string
  runId: string
  workflowId: string
  stepId: string
  stepIndex: number
  name: string
  type: AiWorkflowStepType
  status: AiWorkflowRunStepStatus
  toolKey?: string
  agentMode?: AiWorkflowAgentMode
  continueOnError: boolean
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  errorMessage?: string
  reviewContext?: AiWorkflowRunReviewContext | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AiWorkflowRun {
  id: string
  workflowId: string
  workspaceId: string
  projectId: string
  status: AiWorkflowRunStatus
  trigger: AiWorkflowTrigger
  triggerPayload?: AiWorkflowRunTriggerPayload
  definitionSnapshot: AiWorkflowDefinitionPayload
  runtimeState?: Record<string, unknown>
  latestStepIndex: number
  createdByUserId: string
  errorMessage?: string
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
  steps?: AiWorkflowRunStep[]
}

export interface AiWorkflowCatalogPayload {
  items: AiWorkflowDefinition[]
  availableTools: AiWorkflowToolRef[]
  builtinTemplates: AiWorkflowTemplatePreset[]
}

export interface AiWorkflowRunListPayload {
  items: AiWorkflowRun[]
}

export type ProjectIssueSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ProjectIssueStatus = 'open' | 'in_progress' | 'resolved' | 'ignored'

export interface ProjectIssueReport {
  id: string
  workspaceId: string
  projectId: string
  sessionId: string
  title: string
  summary: string
  markdown: string
  sourceMode: WorkspaceAiMode
  createdByUserId: string
  reviewSubmissionStatus: ProjectIssueReviewSubmissionStatus
  reviewSubmittedAt: string | null
  reviewSubmittedByUserId: string | null
  reviewSubmittedByUsername?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectIssue {
  id: string
  workspaceId: string
  projectId: string
  reportId: string
  title: string
  severity: ProjectIssueSeverity
  evidence: string
  recommendation: string
  status: ProjectIssueStatus
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export interface BillingUsageEvent {
  id: string
  workspaceId: string
  workspaceName?: string
  projectId: string | null
  contestId: string | null
  trackId: string | null
  projectResourceId: string | null
  contestResourceId: string | null
  reportId: string | null
  actorUserId: string | null
  actorUsername?: string
  eventCode: BillingUsageEventCode
  result: BillingUsageEventResult
  sourceRoute: string
  meta: Record<string, unknown>
  createdAt: string
}

export interface BillingUsageEventSummaryRow {
  workspaceId: string
  workspaceName?: string
  eventCode: BillingUsageEventCode
  result: BillingUsageEventResult
  total: number
}

export interface BillingUsageEventsPayload {
  items: BillingUsageEvent[]
  summary: BillingUsageEventSummaryRow[]
  total: number
  page: number
  pageSize: number
}

export interface ApproveChangeRequestPayload {
  destructiveConfirm?: boolean
}

export type AiWorkspaceStreamEventType = 'progress' | 'tool' | 'proposal' | 'issue' | 'delta' | 'done' | 'error'

export interface AiWorkspaceStreamEvent {
  event: AiWorkspaceStreamEventType
  data: Record<string, unknown>
}

export interface AiWorkspaceRequest {
  teamId?: string
  workspaceId?: string
  projectId?: string
  sessionId?: string
  mode?: WorkspaceAiMode
  messages: ChatMessage[]
  context?: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    projectTitle?: string
    contestId?: string
    trackId?: string
    major?: string
    resourceId?: string
    resourceTitle?: string
    markdown?: string
    selectionText?: string
    selectionRange?: AiWorkspaceDocumentSelectionRange | null
    trigger?: AiWorkspaceDocumentTrigger
    documentAction?: AiWorkspaceDocumentAction
    assistantPreset?: WorkspaceAiAssistantPreset
    contextualAssistantKey?: WorkspaceContextualAssistantKey | ''
    interactionIntent?: WorkspaceAiInteractionIntent
    actionSource?: WorkspaceAiActionSource
    requestedAgentAction?: WorkflowDraftAction
    assistantLabel?: string
    activeTabId?: string
    previewMode?: string
    resourcePurpose?: CollabPurpose | ''
    workflowSnapshot?: WorkflowSnapshot | null
    workflowAction?: WorkflowDraftAction
    workflowTemplate?: AiCanvasAssistTemplate
    workflowArchitectureView?: WorkflowArchitectureView
    workflowStylePreset?: WorkflowStylePreset
    workflowLayoutPreset?: WorkflowLayoutPreset
    sceneHash?: string
    sceneSourceText?: string
    sceneSourceFormat?: AiCanvasAssistSourceFormat
    sceneAction?: WorkflowDraftAction
    sceneTemplate?: AiCanvasAssistTemplate
    sceneArchitectureView?: WorkflowArchitectureView
    sceneStylePreset?: WorkflowStylePreset
    sceneLayoutPreset?: WorkflowLayoutPreset
  }
  aiOptions?: Partial<AiAssistantOptions>
}

export interface AiWorkspaceInlineCompletionRequest {
  teamId?: string
  workspaceId?: string
  projectId?: string
  context?: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    resourceId?: string
    resourceTitle?: string
    markdown?: string
    selectionRange?: AiWorkspaceDocumentSelectionRange | null
  }
  aiOptions?: Partial<AiAssistantOptions>
}

export interface AiWorkspaceInlineCompletionResult {
  suggestion: string
}

export interface AiWorkspaceInlineCompletionAcceptRequest {
  teamId?: string
  workspaceId?: string
  projectId?: string
  resourceId?: string
}

export interface AiWorkspaceInlineCompletionAcceptResult {
  remainingQuota: number | null
  consumedUnits: number
}

export interface AiWorkspaceIssueDraft {
  title: string
  severity: ProjectIssueSeverity
  evidence: string
  recommendation: string
}

export interface AiCanvasAssistRequest {
  teamId?: string
  workspaceId?: string
  projectId?: string
  action: AiCanvasAssistAction
  template: AiCanvasAssistTemplate
  messages: ChatMessage[]
  context?: {
    teamId?: string
    workspaceId?: string
    projectId?: string
    contestId?: string
    trackId?: string
    major?: string
    resourceId?: string
    resourceTitle?: string
    sourceText?: string
    sourceFormat?: AiCanvasAssistSourceFormat
  }
  aiOptions?: Partial<AiAssistantOptions>
}

export type AiCanvasAssistImportTarget = 'scene_document' | 'design_document'

export interface AiCanvasAssistImportPreview {
  target: AiCanvasAssistImportTarget
  summary: string
  sceneDocument?: SceneDocument | null
  designDocument?: string | null
}

export interface AiCanvasAssistResult {
  assistantReply: string
  action: AiCanvasAssistAction
  template: AiCanvasAssistTemplate
  sourceFormat: AiCanvasAssistSourceFormat
  sourceText: string
  importPreview?: AiCanvasAssistImportPreview | null
  previewSummary?: string
  knowledge?: ProjectKnowledgeMessagePayload | null
}

export type AiCanvasAssistStreamEventType = 'progress' | 'delta' | 'done' | 'error'

export interface AiCanvasAssistStreamEvent {
  event: AiCanvasAssistStreamEventType
  data: Record<string, unknown>
}

export interface AiWorkspaceResult {
  assistantReply: string
  mode: WorkspaceAiMode
  sessionId?: string
  proposals?: AiProjectChangeRequest[]
  issues?: ProjectIssue[]
  report?: ProjectIssueReport | null
  documentDraft?: AiWorkspaceDocumentDraft | null
  workflowDraft?: AiWorkspaceWorkflowDraft | null
  sceneDraft?: AiWorkspaceSceneDraft | null
  knowledge?: ProjectKnowledgeMessagePayload | null
}

export type AdminAgentTaskType
  = 'publish_assistant'
    | 'general'

export type AdminDraftModule = 'overview' | 'tracks' | 'timelines' | 'track_timelines' | 'rubrics' | 'resources' | 'knowledge'

export interface AdminAgentRunRequest {
  workspaceId: string
  contestId: string
  sessionId?: string
  taskType: AdminAgentTaskType
  message: string
  context?: {
    trackId?: string
    major?: string
    targetModule?: AdminDraftModule
  }
}

export interface AdminAgentArtifact {
  id: string
  type: 'draft' | 'publish_fix'
  title: string
  summary: string
  module?: AdminDraftModule
  payload: Record<string, unknown>
}

export interface AdminAgentRunResult {
  sessionId: string
  assistantReply: string
  artifacts: AdminAgentArtifact[]
  missingFields: string[]
  webSearchEnabled: boolean
}

export type ProjectExportArtifactKind
  = 'bundle'
    | 'pdf_report'
    | 'knowledge_summary'
    | 'meeting_summary'
    | 'design_export'
    | 'project_bundle_manifest'

export interface ProjectExportProfile {
  id: string
  title: string
  contestId?: string | null
  summary: string
  sections: string[]
  artifactKinds: ProjectExportArtifactKind[]
}

export interface ProjectExportArtifact {
  id: string
  kind: ProjectExportArtifactKind
  title: string
  fileName: string
  mimeType: string
  size: number
  resourceId?: string | null
  objectKey?: string | null
  downloadPath?: string | null
}

export interface ProjectExportPdfReportPayload {
  title: string
  summary: string
  sections: Array<{ title: string, body: string }>
}

export interface ProjectExportBundleManifest {
  id: string
  projectId: string
  contestId?: string | null
  profile: ProjectExportProfile
  generatedAt: string
  artifacts: ProjectExportArtifact[]
  knowledgeSummary: string
}

export type ProjectExportJobStatus = 'queued' | 'processing' | 'succeeded' | 'failed'

export type ProjectExportJobTrigger = 'manual' | 'retry'

export interface ProjectExportJob {
  id: string
  projectId: string
  workspaceId: string
  profileId?: string | null
  trigger: ProjectExportJobTrigger
  status: ProjectExportJobStatus
  attempt: number
  parentJobId?: string | null
  errorMessage: string
  manifest?: ProjectExportBundleManifest | null
  artifacts: ProjectExportArtifact[]
  startedByUserId?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectExportJobDiagnostics {
  processingCount: number
  failedCount: number
  lastSuccessAt?: string | null
  lastFailureAt?: string | null
}

export type AdminAgentStreamEventType = 'progress' | 'tool' | 'delta' | 'artifact' | 'done' | 'error'

export interface AdminAgentStreamEvent {
  event: AdminAgentStreamEventType
  data: Record<string, unknown>
}

export interface BillingPlan {
  id: string
  code: string
  name: string
  planTier: 'personal_team' | 'business_team'
  basePriceCents: number
  includedSeats: number
  extraSeatPriceCents: number
  includedAiQuota: number
  includedProjects: number
  projectsUnlimited: boolean
  extraProjectSlotPriceCents: number
  defaultProjectSeatLimit: number
  projectSeatPriceCents: number
  minChargedProjectSeats: number
  chargeAllProjectSeats: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectSeatQuota {
  projectId: string
  teamId: string
  workspaceId: string
  seatLimit: number
  seatUsed: number
  updatedAt: string
}

export interface WorkspaceBillingEstimate {
  teamId: string
  workspaceId: string
  planId: string | null
  planCode: string | null
  planTier: 'personal_team' | 'business_team' | null
  billingCycle: BillingCycle
  seatUsed: number
  includedSeats: number
  extraSeats: number
  basePriceCents: number
  extraSeatPriceCents: number
  projectCount: number
  includedProjects: number
  projectsUnlimited: boolean
  extraProjectSlots: number
  extraProjects: number
  projectSeatLimitTotal: number
  projectSeatUsedTotal: number
  chargedProjectSeatsTotal: number
  defaultProjectSeatLimit: number
  projectSeatPriceCents: number
  minChargedProjectSeats: number
  chargeAllProjectSeats: boolean
  projectExtraAmountCents: number
  projectSeatAmountCents: number
  estimatedAmountCents: number
  estimatedAmountYuan: number
  aiQuotaTotal: number
  includedAiQuota: number
  updatedAt: string
}

export type WorkspaceBillingOrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed'

export interface WorkspaceBillingOrder {
  id: string
  teamId: string
  workspaceId: string
  planId: string
  planCode: string
  planName: string
  billingCycle: BillingCycle
  amountCents: number
  amountYuan: number
  status: WorkspaceBillingOrderStatus
  provider: 'mock'
  estimate: WorkspaceBillingEstimate | null
  createdByUserId?: string | null
  paidAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformRoleAssignment {
  userId: string
  username: string
  roles: PlatformRole[]
  createdAt: string
  updatedAt: string
}

export type FeishuBitableSyncItemEntityType = 'contest' | 'track' | 'track_timeline' | 'resource' | 'policy' | 'persona'
export type FeishuBitableSyncRunStatus = 'running' | 'success' | 'partial_success' | 'failed'
export type FeishuBitableSyncRunTriggerSource = 'manual' | 'event' | 'scheduled'
export type FeishuSyncRunMode = 'full' | 'delta'
export type FeishuTaskScheduleMode = 'interval' | 'cron'
export type RuleSeverity = 'error' | 'warning' | 'info'
export type RuleCategory = 'eligibility' | 'material' | 'workflow' | 'reminder' | 'quality' | 'compliance'
export type RuleVersionStatus = 'draft' | 'published'
export type ScopeType = 'global' | 'activity' | 'instance' | 'region' | 'stage' | 'track' | 'policy'
export type FeishuSyncIssueStatus = 'open' | 'resolved' | 'ignored'
export type FeishuSyncIssueResolution = 'manual_bind' | 'ignored' | 'auto_recovered'

export interface EngineContext {
  activity?: Record<string, unknown>
  instance?: Record<string, unknown>
  team?: Record<string, unknown>
  submission?: Record<string, unknown>
  policy?: Record<string, unknown>
  now?: string
  [key: string]: unknown
}

export type ValueExpr
  = { type: 'const', value: unknown }
    | { type: 'var', path: string }
    | { type: 'count', path: string }
    | { type: 'exists', path: string }

export type PredicateExpr
  = { op: 'eq', left: ValueExpr, right: ValueExpr }
    | { op: 'neq', left: ValueExpr, right: ValueExpr }
    | { op: 'lt', left: ValueExpr, right: ValueExpr }
    | { op: 'lte', left: ValueExpr, right: ValueExpr }
    | { op: 'gt', left: ValueExpr, right: ValueExpr }
    | { op: 'gte', left: ValueExpr, right: ValueExpr }
    | { op: 'contains', left: ValueExpr, right: ValueExpr }
    | { op: 'in_set', left: ValueExpr, right: ValueExpr }
    | { op: 'regex', left: ValueExpr, right: ValueExpr }
    | { op: 'date_before', left: ValueExpr, right: ValueExpr }
    | { op: 'date_after', left: ValueExpr, right: ValueExpr }
    | { op: 'date_between', target: ValueExpr, start: ValueExpr, end: ValueExpr }
    | { op: 'any_match', path: string, child: PredicateExpr }
    | { op: 'all_match', path: string, child: PredicateExpr }
    | { op: 'none_match', path: string, child: PredicateExpr }
    | { op: 'and', children: PredicateExpr[] }
    | { op: 'or', children: PredicateExpr[] }
    | { op: 'not', child: PredicateExpr }

export interface RuleDefinition {
  id: string
  code: string
  name: string
  category: RuleCategory
  severity: RuleSeverity
  when?: PredicateExpr
  assert: PredicateExpr
  messageTemplate: string
  targetPath?: string
  metadata?: Record<string, unknown>
  versionId?: string
  createdByUserId?: string
  updatedByUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface RuleBinding {
  id: string
  ruleId: string
  scopeType: ScopeType
  scopeValue: string
  priority: number
  enabled: boolean
  effectiveStartAt?: string | null
  effectiveEndAt?: string | null
  metadata?: Record<string, unknown>
  versionId?: string
  createdByUserId?: string
  updatedByUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface RuleVersion {
  id: string
  name: string
  status: RuleVersionStatus
  note?: string
  publishedAt?: string | null
  publishedByUserId?: string | null
  rolledBackFromVersionId?: string | null
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface RuleResultTrace {
  whenMatched: boolean
  assertMatched: boolean
  details: string[]
}

export interface RuleResult {
  ruleId: string
  ruleCode: string
  severity: RuleSeverity
  passed: boolean
  message: string
  targetPath?: string
  skipped?: boolean
  trace: RuleResultTrace
}

export interface EngineOutput {
  passed: boolean
  results: RuleResult[]
  errors: RuleResult[]
  warnings: RuleResult[]
  infos: RuleResult[]
}

export interface ObligationDefinition {
  id: string
  code: string
  name: string
  required: boolean
  when?: PredicateExpr
  satisfiedBy?: PredicateExpr
  messageWhenMissing?: string
  metadata?: Record<string, unknown>
  versionId?: string
  createdByUserId?: string
  updatedByUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ObligationBinding {
  id: string
  obligationId: string
  scopeType: ScopeType
  scopeValue: string
  priority: number
  enabled: boolean
  metadata?: Record<string, unknown>
  versionId?: string
  createdByUserId?: string
  updatedByUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface ChecklistItem {
  code: string
  name: string
  status: 'completed' | 'missing' | 'optional'
  message?: string
}

export interface RuleAnnotation {
  id: string
  ruleId: string
  sourceType: 'feishu' | 'document' | 'manual'
  sourceId: string
  sourceField?: string
  sourcePath?: string
  note?: string
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface SemanticPathDictionaryItem {
  id: string
  path: string
  label: string
  valueType: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
  description?: string
  enabled: boolean
  createdByUserId?: string
  updatedByUserId?: string
  createdAt?: string
  updatedAt?: string
}

export interface FeishuMappingV1 {
  externalIdField?: string
  contestExternalIdField?: string
  trackExternalIdField?: string
  fieldMap?: Record<string, string>
}

export interface FeishuMappingFieldBinding {
  key?: string
  targetPath: string
  sourceField?: string
  transform?: string
}

export interface FeishuMappingLayer {
  id: string
  scopeType: ScopeType
  scopeValue: string
  priority: number
  enabled: boolean
  fieldMap?: Record<string, string>
  fieldBindings?: FeishuMappingFieldBinding[]
  defaults?: Record<string, unknown>
}

export interface FeishuMappingConfigV2 {
  schemaVersion: 2
  match?: {
    externalIdField?: string
    contestExternalIdField?: string
    trackExternalIdField?: string
  }
  layers: FeishuMappingLayer[]
}

export interface FeishuSyncIssue {
  id: string
  syncItemId: string
  entityType: FeishuBitableSyncItemEntityType
  recordId: string
  externalId: string
  status: FeishuSyncIssueStatus
  reasonCode: string
  message: string
  payload: Record<string, unknown>
  resolvedByUserId?: string | null
  resolvedAt?: string | null
  resolution?: FeishuSyncIssueResolution | null
  resolutionPayload?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface FeishuSyncIssueReasonStat {
  reasonCode: string
  openCount: number
  totalCount: number
}

export interface FeishuSyncIssueBatchHandleResult {
  affectedCount: number
}

export interface FeishuFieldInspectionItem {
  fieldName: string
  sampleValues: string[]
  sampleCount: number
}

export interface FeishuBitableTablePreviewSource {
  appToken: string
  tableId: string
  viewId?: string
  appName?: string
  tableName?: string
  viewName?: string
  sourceUrl?: string
}

export type FeishuBitableTablePreviewRow = Record<string, string>

export interface FeishuFieldDiagnosticItem {
  kind:
    | 'mapping_empty'
    | 'mapping_missing'
    | 'external_id_missing'
    | 'missing_required_field'
    | 'owned_by_other_sync_item'
    | 'persona_slots_empty'
    | 'source_field_missing'
    | 'transform_error'
    | 'contest_ref_not_found'
    | 'track_ref_not_found'
    | 'writeback_field_missing'
  level: 'error' | 'warning'
  message: string
  fieldKey?: string
  sourceField?: string
  recordId?: string
  externalId?: string
  transform?: string
  detail?: string
}

export interface FeishuMappedPreviewRow {
  recordId: string
  externalId: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  reasonCode?: string
  message?: string
  values: Record<string, string>
}

export interface FeishuPreviewIssueCounts {
  total: number
  externalIdMissing: number
  missingRequiredField: number
  personaSlotsEmpty: number
  contestRefNotFound: number
  trackRefNotFound: number
  transformError: number
  sourceFieldMissing: number
  writebackFieldMissing: number
  mappingEmpty: number
  other: number
}

export interface FeishuBitableTablePreview {
  source: FeishuBitableTablePreviewSource
  columns: string[]
  sampleRows: FeishuBitableTablePreviewRow[]
  sampleCount: number
  totalFetched: number
  fieldInspection: FeishuFieldInspectionItem[]
  iframeUrl: string
  openUrl: string
}

export interface FeishuBitableSyncItemPreviewResult {
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  writebackSuccessCount: number
  writebackErrorCount: number
  errors: Array<{ recordId: string, message: string }>
  mappedColumns: string[]
  mappedSampleRows: FeishuMappedPreviewRow[]
  fieldDiagnostics: FeishuFieldDiagnosticItem[]
  transformErrors: FeishuFieldDiagnosticItem[]
  issueCounts: FeishuPreviewIssueCounts
}

export interface FeishuBitableSyncItemPreviewRequest {
  source?: FeishuBitableSourceConfig
  entityType?: FeishuBitableSyncItemEntityType
  mapping?: FeishuMappingV1 | FeishuMappingConfigV2 | Record<string, unknown>
  options?: Record<string, unknown>
  writeback?: FeishuBitableWritebackConfig | Record<string, unknown>
  autoSync?: FeishuBitableAutoSyncConfig | Record<string, unknown>
}

export type FeishuBitableRecordLocatorType = 'auto' | 'externalId' | 'recordId' | 'rowNumber'

export type FeishuBitableSimulateBusinessStatus = 'created' | 'updated' | 'skipped' | 'error' | 'filtered'

export interface FeishuBitableSimulateRecordRequest extends FeishuBitableSyncItemPreviewRequest {
  locatorType?: FeishuBitableRecordLocatorType
  locatorValue?: string
}

export interface FeishuBitableSimulateSourceField {
  fieldName: string
  textValue: string
  rawValue: unknown
}

export interface FeishuBitableSimulateAutoSyncResult {
  enabled: boolean
  recordStatusField: string
  syncStatusField: string
  recordStatusValue: string
  syncStatusValue: string
  completedValues: string[]
  pendingValues: string[]
  recordStatusMatched: boolean
  syncStatusMatched: boolean
  matched: boolean
  reason?: 'record_status' | 'sync_status' | 'record_status_and_sync_status'
}

export interface FeishuBitableSimulateMappingField {
  targetKey: string
  sourceField: string
  computed: string
  rawValue?: unknown
  value: string
  required: boolean
  missing: boolean
  personaSlot: boolean
  error?: string
}

export interface FeishuBitableSimulateBusinessResult {
  status: FeishuBitableSimulateBusinessStatus
  externalId: string
  entityId?: string
  reasonCode?: string
  message?: string
  missingFields: string[]
  summaryCounts?: {
    createdCount: number
    updatedCount: number
    skippedCount: number
  }
}

export interface FeishuBitableSimulateWritebackPreview {
  enabled: boolean
  fields: Record<string, unknown>
}

export interface FeishuBitableSimulateRecordResult {
  locator: {
    requestedType: FeishuBitableRecordLocatorType
    requestedValue: string
    matchedBy: FeishuBitableRecordLocatorType
    rowNumber: number
    recordId: string
  }
  sourceFields: FeishuBitableSimulateSourceField[]
  autoSync: FeishuBitableSimulateAutoSyncResult
  mappedColumns: string[]
  mappedFields: FeishuBitableSimulateMappingField[]
  fieldDiagnostics: FeishuFieldDiagnosticItem[]
  business: FeishuBitableSimulateBusinessResult
  writebackPreview: FeishuBitableSimulateWritebackPreview
}

export interface FeishuConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export type FeishuBitableSyncEnvironment = 'test' | 'production'

export interface FeishuBitableSourceConfig {
  appToken: string
  tableId: string
  viewId?: string
  appName?: string
  tableName?: string
  viewName?: string
  sourceUrl?: string
  environment?: FeishuBitableSyncEnvironment
}

export interface FeishuBitableWritebackConfig {
  enabled?: boolean
  fields?: {
    status?: string
    syncedAt?: string
    errorMessage?: string
    reasonCode?: string
    entityId?: string
    runId?: string
    triggerSource?: string
  }
  values?: {
    success?: string
    failed?: string
    skipped?: string
  }
}

export interface FeishuBitableAutoSyncConfig {
  enabled?: boolean
  recordStatusField?: string
  syncStatusField?: string
  completedValues?: string[]
  pendingValues?: string[]
  syncedValues?: string[]
  resetRecordStatusValue?: string
  resetSyncStatusValue?: string
  useMappedFieldsAsWatched?: boolean
  watchedFieldNames?: string[]
  ignoredFieldNames?: string[]
}

export interface FeishuBitableAutoSyncRunDiagnostics {
  enabled: boolean
  recordStatusField: string
  syncStatusField: string
  completedValues: string[]
  pendingValues: string[]
  syncedValues: string[]
  recordStatusValueCounts: Record<string, number>
  syncStatusValueCounts: Record<string, number>
  completedCount: number
  pendingCount: number
  matchedCount: number
  filteredSamples?: Array<{
    recordId: string
    recordStatus: string
    syncStatus: string
    recordStatusMatched: boolean
    syncStatusMatched: boolean
    reason: 'record_status' | 'sync_status' | 'record_status_and_sync_status'
  }>
}

export interface FeishuBitableSyncRunDiagnostics {
  sourceFetchedCount: number
  processedCount: number
  autoSyncFilteredCount: number
  businessSkippedCount: number
  processedUniqueExternalIdCount?: number
  sourceDuplicateExternalIdCount?: number
  sourceDuplicateExternalIdSamples?: Array<{
    externalId: string
    count: number
    recordIds: string[]
  }>
  skipReasonCounts: Record<string, number>
  missingRequiredFieldCounts: Record<string, number>
  autoSync: FeishuBitableAutoSyncRunDiagnostics
  businessSkipSamples?: Array<{
    recordId: string
    externalId: string
    reasonCode: string
    message: string
    skippedCount: number
    missingFields: string[]
  }>
}

export type FeishuSyncRunSampleType = 'auto_sync_filtered' | 'business_skipped'

export interface FeishuSyncRunSampleRecord {
  id: string
  runId: string
  syncItemId: string
  sampleType: FeishuSyncRunSampleType
  sampleIndex: number
  recordId: string
  externalId: string | null
  reasonCode: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface FeishuSyncRunSamplePage {
  items: FeishuSyncRunSampleRecord[]
  total: number
  page: number
  pageSize: number
}

export interface FeishuBitableAppMeta {
  appToken: string
  name: string
}

export interface FeishuBitableTableMeta {
  tableId: string
  name: string
}

export interface FeishuBitableViewMeta {
  viewId: string
  name: string
}

export interface FeishuChatCandidate {
  chatId: string
  name: string
  description: string
  avatarUrl: string
}

export interface FeishuIntegrationConfig {
  enabled: boolean
  appId: string
  appSecretConfigured: boolean
  oauthRedirectUri: string
  eventTokenConfigured: boolean
  eventEncryptKeyConfigured: boolean
  adminGroupIds: string[]
  webSdkScriptUrl: string
  startupNotifyEnabled: boolean
  startupNotifyChatId: string
  startupNotifyRemark: string
  startupFallbackVersion: string
  startupFallbackCommitSha: string
  updatedAt: string
  updatedByUserId: string
}

export interface FeishuAuthBindStatus {
  linked: boolean
  unionId?: string
  name?: string
  enName?: string
  email?: string
  mobile?: string
  updatedAt?: string
}

export interface FeishuAuthUnbindResult {
  removedCount: number
  removedUnionIds: string[]
  status: FeishuAuthBindStatus
}

export interface FeishuAuthAuditItem {
  id: string
  action: 'auth.feishu.bind.self' | 'auth.feishu.unbind.self'
  createdAt: string
  payload: Record<string, unknown>
}

export interface CasdoorAuthBindStatus {
  linked: boolean
  subject?: string
  name?: string
  preferredUsername?: string
  email?: string
  updatedAt?: string
}

export type OAuthAuthBindStatus = CasdoorAuthBindStatus

export interface FeishuAdminGroupReconcileResult {
  synchronizedAt: string
  groupIds: string[]
  totalGroupMembers: number
  createdUsers: number
  grantedContestAdmin: number
  revokedContestAdmin: number
  skippedMembers: number
}

export interface FeishuAdminOverviewGroupMember {
  unionId: string
  userId?: string | null
  username?: string | null
  inContestAdmin: boolean
}

export interface FeishuAdminOverviewContestAdmin {
  userId: string
  username: string
  unionId?: string | null
}

export interface FeishuAdminOverview {
  groupIds: string[]
  groupMembers: FeishuAdminOverviewGroupMember[]
  contestAdmins: FeishuAdminOverviewContestAdmin[]
  notice?: string
}

export interface FeishuAdminCandidate {
  userId: string
  username: string
  unionId?: string | null
  hasContestAdmin: boolean
  isPlatformSuperAdmin: boolean
}

export interface FeishuDirectoryUserCandidate {
  unionId: string
  name: string
  enName?: string
  email?: string
  mobile?: string
  userId?: string | null
  username?: string | null
  hasContestAdmin: boolean
  departmentIds: string[]
}

export interface FeishuDirectoryDepartment {
  departmentId: string
  name: string
  parentDepartmentId?: string | null
}

export type FeishuDirectoryStatus = 'ok' | 'partial' | 'unavailable'

export type FeishuDirectoryFetchStatus = 'ok' | 'failed'

export type FeishuDirectoryDiagnosticCode
  = | 'none'
    | 'partial_directory_visible'
    | 'department_tree_permission_denied'
    | 'directory_unavailable'
    | 'integration_disabled'
    | 'app_config_incomplete'

export interface FeishuDirectoryContactScopeSummary {
  departmentIds: string[]
  userIds: string[]
  groupIds: string[]
  totalDepartments: number
  totalUsers: number
  totalGroups: number
}

export interface FeishuDirectorySearchResult {
  items: FeishuDirectoryUserCandidate[]
  departments?: FeishuDirectoryDepartment[]
  rootDepartmentId?: string
  notice?: string
  source?: 'tenant' | 'group_fallback'
  fromCache?: boolean
  fetchedAt?: string
  cacheExpiresAt?: string
  totalMembers?: number
  permissionHint?: string
  directoryStatus?: FeishuDirectoryStatus
  memberListStatus?: FeishuDirectoryFetchStatus
  departmentTreeStatus?: FeishuDirectoryFetchStatus
  contactScopeStatus?: FeishuDirectoryFetchStatus
  contactScopeSummary?: FeishuDirectoryContactScopeSummary
  contactScopeErrorMessage?: string
  diagnosticCode?: FeishuDirectoryDiagnosticCode
  diagnosticMessage?: string
}

export interface FeishuAdminManualAddResult {
  userId: string
  username: string
  granted: boolean
}

export interface FeishuTaskScheduleConfig {
  enabled: boolean
  mode: FeishuTaskScheduleMode
  intervalMinutes: number | null
  cronExpr: string | null
  timezone: string
}

export interface FeishuTaskScheduleRuntime {
  nextRunAt: string | null
  lastRunAt: string | null
  lastError: string
}

export interface FeishuTaskLatestRunSummary {
  runId: string
  status: FeishuBitableSyncRunStatus
  triggerSource: FeishuBitableSyncRunTriggerSource
  startedAt: string
  finishedAt: string | null
  errorCount: number
  errorMessage: string
}

export interface FeishuTaskIssueStats {
  total: number
  open: number
  resolved: number
  ignored: number
}

export interface FeishuBitableSync {
  id: string
  name: string
  enabled: boolean
  source: FeishuBitableSourceConfig
  schedule: FeishuTaskScheduleConfig
  scheduleRuntime: FeishuTaskScheduleRuntime
  itemCount: number
  enabledItemCount: number
  issueStats: FeishuTaskIssueStats
  latestRunSummary: FeishuTaskLatestRunSummary | null
  createdByUserId: string
  updatedByUserId: string
  archivedByUserId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FeishuBitableSyncItem {
  id: string
  syncId: string
  name: string
  entityType: FeishuBitableSyncItemEntityType
  appToken: string
  tableId: string
  viewId: string
  source?: FeishuBitableSourceConfig
  writeback?: FeishuBitableWritebackConfig
  autoSync?: FeishuBitableAutoSyncConfig
  isEnabled: boolean
  mapping: FeishuMappingV1 | FeishuMappingConfigV2 | Record<string, unknown>
  options: Record<string, unknown>
  lastRunAt: string | null
  schedule: FeishuTaskScheduleConfig
  scheduleRuntime: FeishuTaskScheduleRuntime
  latestRunSummary: FeishuTaskLatestRunSummary | null
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface FeishuBitableSyncDetail extends FeishuBitableSync {
  items: FeishuBitableSyncItem[]
}

export interface FeishuBitableSyncItemDetail extends FeishuBitableSyncItem {
  recentRuns: FeishuBitableSyncItemRun[]
  issues: FeishuSyncIssue[]
  issueStats: FeishuTaskIssueStats
  issueReasonStats: FeishuSyncIssueReasonStat[]
}

export interface FeishuBitableSyncItemRun {
  id: string
  syncItemId: string
  syncItemName: string
  status: FeishuBitableSyncRunStatus
  triggerSource: FeishuBitableSyncRunTriggerSource
  mode?: FeishuSyncRunMode
  deltaRecordCount?: number
  startedAt: string
  finishedAt: string | null
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errorMessage: string
  diagnostics?: FeishuBitableSyncRunDiagnostics
  createdByUserId: string | null
  createdAt: string
}

export type FeishuPostSyncTaskType = 'embedding_upsert' | 'search_index_refresh' | 'entity_analysis' | 'writeback_retry'
export type FeishuPostSyncTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed' | 'dead_letter'

export interface FeishuPostSyncTask {
  id: string
  syncItemId: string | null
  runId: string | null
  scope: FeishuBitableSyncItemEntityType
  entityId: string
  externalId: string
  taskType: FeishuPostSyncTaskType
  status: FeishuPostSyncTaskStatus
  attempt: number
  maxAttempt: number
  sourceHash: string
  nextRunAt: string
  errorMessage: string
  payload: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FeishuBitableSyncCleanupManagedDataCounts {
  externalRefs: number
  searchIndex: number
  entityAnalysis: number
  vectors: number
  postSyncTasks: number
  runSamples: number
  issues: number
  personaPresets: number
  unpublishedReleaseDrafts: number
}

export interface FeishuBitableSyncCleanupLegacySummary {
  total: number
  contest: number
  track: number
  trackTimeline: number
  resource: number
  policy: number
}

export interface FeishuBitableSyncCleanupPreview {
  syncId: string
  syncItemId: string
  entityType: FeishuBitableSyncItemEntityType
  confirmationToken: string
  managedDataCounts: FeishuBitableSyncCleanupManagedDataCounts
  legacyReleaseCleanup: FeishuBitableSyncCleanupLegacySummary
  publishedDataRetained: boolean
  publishedContestDataCount: number
  publishedPolicyDataCount: number
  blockedConflictCount: number
}

export interface FeishuBitableSyncCleanupResult {
  syncId: string
  syncItemId: string
  entityType: FeishuBitableSyncItemEntityType
  managedDataCounts: FeishuBitableSyncCleanupManagedDataCounts
  legacyReleaseCleanup: FeishuBitableSyncCleanupLegacySummary
  legacyForceCleared: boolean
  publishedDataSkipped: boolean
  blockedConflictCount: number
}

export type FeishuSyncedDataRecordStatus = 'indexed' | 'ref_only' | 'release_draft'

export interface FeishuSyncedDataQuery {
  keyword?: string
  syncId?: string
  syncItemId?: string
  scope?: FeishuBitableSyncItemEntityType
  externalId?: string
  recordId?: string
  page?: number
  pageSize?: number
}

export interface FeishuSyncedDataSyncOption {
  id: string
  name: string
}

export interface FeishuSyncedDataSyncItemOption {
  id: string
  name: string
  syncId: string
  syncName: string
  entityType: FeishuBitableSyncItemEntityType
}

export interface FeishuSyncedDataRecord {
  status: FeishuSyncedDataRecordStatus
  scope: FeishuBitableSyncItemEntityType
  syncId: string
  syncName: string
  syncItemId: string
  syncItemName: string
  title: string
  summary: string
  body: string
  externalId: string
  entityId: string
  recordId: string
  runId: string
  keywords: string[]
  metadata: Record<string, unknown>
  updatedAt: string
}

export interface FeishuSyncedDataMetrics {
  effectiveEntityTotal: number
  latestRunSourceRowTotal: number
  latestRunAutoFilteredTotal: number
  latestRunBusinessSkippedTotal: number
  latestRunDuplicateExternalIdTotal: number
  rawCountBasis: 'latest_run_per_sync_item'
}

export interface FeishuSyncedDataResult {
  items: FeishuSyncedDataRecord[]
  total: number
  page: number
  pageSize: number
  metrics: FeishuSyncedDataMetrics
  rawMetricAvailable: boolean
  rawMetricNotice: string
  syncOptions: FeishuSyncedDataSyncOption[]
  syncItemOptions: FeishuSyncedDataSyncItemOption[]
}

export interface ContestDetailPayload {
  contest: Contest
  timelines: ContestTimeline[]
  rubrics: Rubric[]
  resourceStats: Array<{ category: ResourceCategory, count: number }>
}

export interface ApiResponseMeta {
  traceId: string
  provider: string
  model: string
  latencyMs: number
  fallbackUsed: boolean
  attempts: number
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  meta: ApiResponseMeta
}
