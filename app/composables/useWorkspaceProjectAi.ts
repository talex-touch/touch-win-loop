import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefenseScorecard,
  AiDefenseStage,
  AiDefenseSummary,
  AiProjectChangeRequest,
  ChatMessage,
  Contest,
  ProjectIssue,
  ProjectIssueReport,
  ProjectPayload,
  ProjectTopicBoard,
  ProjectWorkbenchMode,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import type {
  WorkspaceFormState,
  WorkspaceTopicBoardDraft,
} from '~/types/workspace'
import { reactive, ref } from 'vue'

export type WorkspacePrimaryAiMode = Exclude<WorkspaceAiMode, 'defense'>
export type WorkspaceWorkbenchMode = ProjectWorkbenchMode

function createEmptyTopicBoardDraft(): WorkspaceTopicBoardDraft {
  return {
    discipline: '',
    topicType: '',
    expectedDifficulty: '',
    keywordsText: '',
    teamSkillTagsText: '',
    candidateCount: 3,
  }
}

export function splitTopicBoardTags(text: string): string[] {
  return String(text || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function useWorkspaceProjectAi() {
  const naturalQuery = ref('')
  const major = ref('')
  const discipline = ref('')
  const level = ref('')
  const trackType = ref('')
  const topK = ref(6)

  const topicBoardDraft = reactive<WorkspaceTopicBoardDraft>(createEmptyTopicBoardDraft())
  const topicBoardLoading = ref(false)
  const topicBoardFetching = ref(false)
  const topicBoardError = ref('')
  const topicBoardSnapshot = ref<ProjectTopicBoard | null>(null)
  const topicBoardHistory = ref<ProjectTopicBoard[]>([])
  const topicBoardActioningCandidateId = ref('')
  const topicBoardCreateSeedHandled = ref(false)

  const contests = ref<Contest[]>([])
  const contestCatalog = ref<Contest[]>([])
  const aiReasoning = ref('')
  const normalizedInfo = ref('')

  const chatMessages = ref<ChatMessage[]>([])
  const chatSessions = ref<AiChatSession[]>([])
  const activeChatSessionId = ref('')
  const chatInput = ref('')
  const chatMissingFields = ref<string[]>([])
  const chatDraft = ref<ProjectPayload | null>(null)
  const aiMode = ref<WorkspaceAiMode>('dialog_ask')
  const workbenchMode = ref<WorkspaceWorkbenchMode>('project')
  const lastPrimaryAiMode = ref<WorkspacePrimaryAiMode>('dialog_ask')

  const finalReviewMaterialsOpen = ref(false)
  const finalReviewAssistantOpen = ref(false)
  const preFinalReviewLeftCollapsed = ref(false)
  const preFinalReviewRightCollapsed = ref(false)
  const preFinalReviewActiveMainTabId = ref('')
  const preFinalReviewOpenTabs = ref<string[]>(['dashboard'])

  const aiFiltering = ref(false)
  const chatLoading = ref(false)
  const chatSessionsLoading = ref(false)
  const formSubmitting = ref(false)

  const aiChangeRequests = ref<AiProjectChangeRequest[]>([])
  const aiChangeRequestsLoading = ref(false)
  const aiChangeActingIds = ref<string[]>([])
  const aiChangeSecondConfirmIds = ref<string[]>([])

  const projectIssueReports = ref<ProjectIssueReport[]>([])
  const projectIssues = ref<ProjectIssue[]>([])
  const issueCenterLoading = ref(false)
  const issueReportSubmitting = ref(false)
  const issueReportExporting = ref(false)
  const metaKRemoteLoading = ref(false)

  const defenseRounds = ref<AiDefenseJudgeRound[]>([])
  const defenseScorecard = ref<AiDefenseScorecard | null>(null)
  const defensePersonas = ref<AiDefensePersona[]>([])
  const defensePersonasLoading = ref(false)
  const defenseSummary = ref<AiDefenseSummary | null>(null)
  const defenseSummaryLoading = ref(false)
  const defenseStage = ref<AiDefenseStage | undefined>(undefined)
  const defenseTurnCount = ref(0)

  const formState = reactive<WorkspaceFormState>({
    source: 'form',
    title: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  })

  function resetChatState() {
    chatMessages.value = []
    chatDraft.value = null
    chatMissingFields.value = []
    defenseRounds.value = []
    defenseScorecard.value = null
    defenseSummary.value = null
    defenseStage.value = undefined
    defenseTurnCount.value = 0
  }

  return {
    naturalQuery,
    major,
    discipline,
    level,
    trackType,
    topK,
    topicBoardDraft,
    topicBoardLoading,
    topicBoardFetching,
    topicBoardError,
    topicBoardSnapshot,
    topicBoardHistory,
    topicBoardActioningCandidateId,
    topicBoardCreateSeedHandled,
    contests,
    contestCatalog,
    aiReasoning,
    normalizedInfo,
    chatMessages,
    chatSessions,
    activeChatSessionId,
    chatInput,
    chatMissingFields,
    chatDraft,
    aiMode,
    workbenchMode,
    lastPrimaryAiMode,
    finalReviewMaterialsOpen,
    finalReviewAssistantOpen,
    preFinalReviewLeftCollapsed,
    preFinalReviewRightCollapsed,
    preFinalReviewActiveMainTabId,
    preFinalReviewOpenTabs,
    aiFiltering,
    chatLoading,
    chatSessionsLoading,
    formSubmitting,
    aiChangeRequests,
    aiChangeRequestsLoading,
    aiChangeActingIds,
    aiChangeSecondConfirmIds,
    projectIssueReports,
    projectIssues,
    issueCenterLoading,
    issueReportSubmitting,
    issueReportExporting,
    metaKRemoteLoading,
    defenseRounds,
    defenseScorecard,
    defensePersonas,
    defensePersonasLoading,
    defenseSummary,
    defenseSummaryLoading,
    defenseStage,
    defenseTurnCount,
    formState,
    resetChatState,
  }
}
