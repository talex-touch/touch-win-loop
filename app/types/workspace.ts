import type {
  ChatMessage,
  Contest,
  Project,
  ProjectPayload,
  Resource,
  Track,
  WorkspaceAiMode,
} from '~~/shared/types/domain'

export type WorkspaceSidebarTab = 'chat' | 'rules' | 'submit'
export type MappingTone = 'complete' | 'warning' | 'todo'

export interface WorkspaceMappingRow {
  id: string
  metric: string
  hint: string
  score: number
  ability: string
  tags: string[]
  tone: MappingTone
}

export interface WorkspaceKeyword {
  label: string
  count: number
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

export interface WorkspaceStatusToneMeta {
  label: string
  badgeClass: string
  barClass: string
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
