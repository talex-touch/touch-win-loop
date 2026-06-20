import type {
  ChatMessage,
  Contest,
  Project,
  ProjectPayload,
  Resource,
  Track,
  WorkspaceAiMode,
} from '~~/shared/types/domain'

export type MappingTone = 'critical' | 'high' | 'medium' | 'low' | 'complete' | 'warning' | 'todo'

export interface WorkspaceStatusToneMeta {
  label: string
  badgeClass: string
  barClass: string
}

export interface WorkspaceMappingRow {
  id: string
  metric: string
  hint: string
  score: number
  scoreLabel: string
  ability: string
  supportingNote: string
  tone: MappingTone
  tags: string[]
}

export interface WorkspaceKeyword {
  label: string
  count?: number | null
  active?: boolean
}

export interface WorkspaceFormState {
  source: 'form' | 'chat'
  title: string
  problemStatement: string
  innovationPointsText: string
  techRouteStepsText: string
  scoringMappingText: string
  risksText: string
  deliverablesText: string
  summary: string
}

export interface WorkspaceTopicBoardDraft {
  discipline: string
  topicType: string
  expectedDifficulty: string
  keywordsText: string
  teamSkillTagsText: string
  candidateCount: number
}

export interface WorkspaceChatPanelState {
  mode: WorkspaceAiMode
  messages: ChatMessage[]
  input: string
  loading: boolean
  draft: ProjectPayload | null
  missingFields: string[]
}

export interface WorkspaceRulePanelState {
  normalizedInfo: string
  selectedContest: Contest | null
  selectedTrack: Track | null
  selectedResources: Resource[]
}

export interface WorkspaceSubmitPanelState {
  form: WorkspaceFormState
  submitting: boolean
  projects: Project[]
}

export interface WorkspaceProjectContestBindingForm {
  contestId: string
  trackId: string
  sortOrder: number
}

export interface WorkspaceLinkedContestResourceGroup {
  contestId: string
  contestName: string
  trackId: string
  trackName: string
  resources: Resource[]
}

export interface WorkspaceProjectCommonForm {
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

export interface WorkspaceProjectAdaptationForm {
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

export type WorkspaceProjectSaveState = 'idle' | 'saving' | 'saved_auto' | 'saved_manual' | 'conflict' | 'error'
