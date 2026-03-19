export type ContestLevel = 'national' | 'provincial' | 'school' | 'industry'
export type ResourceAvailability = 'public' | 'login_required' | 'unavailable'
export type WorkloadLevel = 'low' | 'medium' | 'high'
export type ProjectSource = 'chat' | 'form'
export type ProjectStatus = 'draft' | 'in_progress' | 'completed'

export type WorkspaceType = 'personal' | 'team'
export type WorkspaceMemberRole = 'team_owner' | 'team_admin' | 'school_admin' | 'college_admin' | 'advisor' | 'member'
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
  title: string
  type: string
  year: number
  sourceLink: string
  availability: ResourceAvailability
  summary: string
  copyrightNote: string
  content?: string
  metadata?: Record<string, unknown>
  category?: ResourceCategory
  sourceType?: string
  status?: ResourceStatus
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
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

export interface SchoolCollege {
  code: string
  name: string
  parentCode?: string
}

export interface SchoolProfile {
  schoolId: string
  schoolName: string
  colleges?: SchoolCollege[]
}

export interface Workspace {
  id: string
  type: WorkspaceType
  name: string
  ownerUserId: string
  schoolProfile: SchoolProfile | null
  roles: WorkspaceMemberRole[]
  createdAt: string
  updatedAt: string
}

export interface TeamQuota {
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
  workspaces: WorkspaceWithQuota[]
  onboarding: {
    needCreateTeam: boolean
  }
}

export interface AuthMeResult {
  user: AuthUser
  workspaces: WorkspaceWithQuota[]
  onboarding: {
    needCreateTeam: boolean
  }
}

export interface Invitation {
  id: string
  workspaceId: string
  role: WorkspaceMemberRole
  inviteeUsername: string | null
  collegeCodes: string[]
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface InvitationWithToken extends Invitation {
  token: string
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

export interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

export interface AiChatSession {
  id: string
  workspaceId: string
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
  id: string
  workspaceId: string
  sessionId: string
  role: ChatMessage['role']
  content: string
  provider: string
  model: string
  fallbackUsed: boolean
  createdByUserId: string
  createdAt: string
}

export interface AiContestFilterRequest {
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
  workspaceId?: string
  sessionId?: string
  messages: ChatMessage[]
  context: {
    workspaceId?: string
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

export type AdminAgentTaskType
  = 'publish_assistant'
    | 'topic_proposals'
    | 'review'
    | 'defense'
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
    reviewText?: string
    strictness?: 'normal' | 'strict'
    rounds?: number
    csvText?: string
    sourceId?: string
    sourceUrl?: string
    targetModule?: AdminDraftModule
  }
}

export interface AdminAgentArtifact {
  id: string
  type: 'draft' | 'publish_fix' | 'topic_proposal' | 'review' | 'defense' | 'import_sync'
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
  basePriceCents: number
  includedSeats: number
  extraSeatPriceCents: number
  includedAiQuota: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkspaceBillingEstimate {
  workspaceId: string
  planId: string | null
  planCode: string | null
  billingCycle: BillingCycle
  seatUsed: number
  includedSeats: number
  extraSeats: number
  basePriceCents: number
  extraSeatPriceCents: number
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
