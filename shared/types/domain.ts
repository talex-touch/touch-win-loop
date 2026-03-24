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
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly'
export type DocumentParseStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type DocumentTaskStatus = 'queued' | 'processing' | 'succeeded' | 'failed'
export type DocumentBlockType = 'title' | 'paragraph' | 'table' | 'image' | 'header' | 'footer' | 'unknown' | 'ocr_candidate'
export type ResourceKind = 'binary' | 'markdown' | 'draw'
export type ResourcePreviewStatus = 'queued' | 'converting' | 'finalizing' | 'succeeded' | 'failed'
export type ProjectResourceShareVisibility = 'public' | 'workspace'
export type ProjectResourceShareDurationPreset = '1h' | '1d' | '3d' | '7d' | '1mon'

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
export type ContestSyncSourceType = 'csv_url'
export type ContestSyncRunStatus = 'running' | 'success' | 'partial_success' | 'failed'

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

export interface Resource {
  id: string
  contestId: string
  projectId?: string
  resourceKind?: ResourceKind
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
  status?: ResourceStatus
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
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

export interface ContestFilterInput {
  discipline?: string
  level?: ContestLevel | ''
  major?: string
  trackType?: string
  keyword?: string[]
}

export interface TopicProposalItem {
  title: string
  reason: string
  innovationPoints: string[]
  techRouteSteps: string[]
  scoringMapping: string[]
  risks: string[]
  references: string[]
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
  workspaceId: string
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

export interface Invitation {
  id: string
  teamId: string
  workspaceId: string
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
  isExpired: boolean
}

export interface WorkspaceMemberManagementSnapshot {
  teamId: string
  workspaceId: string
  members: WorkspaceMemberSummary[]
  invitations: WorkspaceInvitationSummary[]
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

export interface Project extends ProjectPayload {
  id: string
  teamId: string
  workspaceId: string
  ownerUserId: string
  creatorUserId: string
  payerUserId: string | null
  source: ProjectSource
  status: ProjectStatus
  collegeBindings: ProjectCollegeBinding[]
  advisorBindings: ProjectAdvisorBinding[]
  createdAt: string
  updatedAt: string
}

export interface ProjectMemberSummary {
  projectId: string
  userId: string
  username: string
  role: ProjectMemberRole
  addedByUserId: string
  addedByUsername: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMemberManagementSnapshot {
  projectId: string
  teamId: string
  workspaceId: string
  members: ProjectMemberSummary[]
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

export interface ProjectSettingsDraftCommon {
  title: string
  summary: string
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
}

export interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
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
  workspaceId: string
  projectId?: string
  mode?: WorkspaceAiMode
  createdByUserId: string
  title: string
  contestId?: string
  trackId?: string
  major?: string
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AiChatMessage {
  teamId?: string
  id: string
  workspaceId: string
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
  sessionId?: string
}

export type WorkspaceAiMode = 'dialog_ask' | 'auto_optimize' | 'issue_discovery' | 'defense'

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
  references: AiTopicReference[]
  missingFields: string[]
  sessionId?: string
  webSearchEnabled?: boolean
}

export interface AiDefenseJudgeRound {
  judge: 'technical' | 'business' | 'expression'
  question: string
  score: number
  comment: string
  followUp: string
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

export interface AiDefenseRequest {
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

export interface AiDefenseResult {
  assistantReply: string
  rounds: AiDefenseJudgeRound[]
  scorecard: AiDefenseScorecard
  missingFields: string[]
  sessionId?: string
}

export type AiDefenseStreamEventType = 'progress' | 'delta' | 'judge' | 'score' | 'done' | 'error'

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
    contestId?: string
    trackId?: string
    major?: string
  }
  aiOptions?: Partial<AiAssistantOptions>
}

export interface AiWorkspaceIssueDraft {
  title: string
  severity: ProjectIssueSeverity
  evidence: string
  recommendation: string
}

export interface AiWorkspaceResult {
  assistantReply: string
  mode: WorkspaceAiMode
  sessionId?: string
  proposals?: AiProjectChangeRequest[]
  issues?: ProjectIssue[]
  report?: ProjectIssueReport | null
}

export type AdminAgentTaskType
  = 'publish_assistant'
    | 'import_sync_analysis'
    | 'general'

export type AdminDraftModule = 'overview' | 'tracks' | 'timelines' | 'rubrics' | 'resources'

export interface AdminAgentRunRequest {
  workspaceId: string
  contestId: string
  sessionId?: string
  taskType: AdminAgentTaskType
  message: string
  context?: {
    trackId?: string
    major?: string
    csvText?: string
    sourceId?: string
    sourceUrl?: string
    targetModule?: AdminDraftModule
  }
}

export interface AdminAgentArtifact {
  id: string
  type: 'draft' | 'publish_fix' | 'import_sync'
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

export type AdminAgentStreamEventType = 'progress' | 'tool' | 'delta' | 'artifact' | 'done' | 'error'

export interface AdminAgentStreamEvent {
  event: AdminAgentStreamEventType
  data: Record<string, unknown>
}

export interface ContestSyncSource {
  id: string
  name: string
  sourceType: ContestSyncSourceType
  sourceUrl: string
  isActive: boolean
  lastRunAt: string | null
  createdByUserId: string
  updatedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface ContestSyncRun {
  id: string
  sourceId: string
  sourceName: string
  status: ContestSyncRunStatus
  startedAt: string
  finishedAt: string | null
  previewTotal: number
  previewValid: number
  previewInvalid: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  errorMessage: string
  createdByUserId: string
  createdAt: string
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

export interface PlatformRoleAssignment {
  userId: string
  username: string
  roles: PlatformRole[]
  createdAt: string
  updatedAt: string
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
