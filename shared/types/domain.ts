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
export type CollabPurpose = 'workflow' | 'freeform' | 'notes'
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

export interface Resource {
  id: string
  contestId: string
  projectId?: string
  resourceKind?: ResourceKind
  collabPurpose?: CollabPurpose
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
  uploaderUserId?: string
  uploaderUsername?: string
  uploaderAvatarUrl?: string | null
  createdAt?: string
  updatedAt?: string
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
  workspaceId?: string
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

export interface CasdoorAuthMeta {
  enabled: boolean
}

export interface CasdoorIntegrationConfig {
  enabled: boolean
  issuer: string
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
  workspaceId?: string
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
    | 'general'

export type AdminDraftModule = 'overview' | 'tracks' | 'timelines' | 'track_timelines' | 'rubrics' | 'resources'

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

export interface PlatformRoleAssignment {
  userId: string
  username: string
  roles: PlatformRole[]
  createdAt: string
  updatedAt: string
}

export type FeishuBitableSyncItemEntityType = 'contest' | 'track' | 'track_timeline' | 'resource'
export type FeishuBitableSyncRunStatus = 'running' | 'success' | 'partial_success' | 'failed'
export type FeishuBitableSyncRunTriggerSource = 'manual' | 'event' | 'scheduled'
export type FeishuSyncRunMode = 'full' | 'delta'
export type FeishuTaskScheduleMode = 'interval' | 'cron'
export type RuleSeverity = 'error' | 'warning' | 'info'
export type RuleCategory = 'eligibility' | 'material' | 'workflow' | 'reminder'
export type RuleVersionStatus = 'draft' | 'published'
export type ScopeType = 'global' | 'activity' | 'instance' | 'region' | 'stage' | 'track' | 'policy'
export type FeishuSyncIssueStatus = 'open' | 'resolved' | 'ignored'
export type FeishuSyncIssueResolution = 'manual_bind' | 'ignored'

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
