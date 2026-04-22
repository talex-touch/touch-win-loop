import type {
  AiProjectChangeType,
  AiWorkspaceDocumentDraft,
  AiWorkspaceIssueDraft,
  AiWorkspaceSceneDraft,
  AiWorkspaceWorkflowDraft,
  ProjectKnowledgeMessagePayload,
  WorkspaceAiMode,
} from '~~/shared/types/domain'

export type WorkspaceSupportedMode = 'dialog_ask' | 'auto_optimize' | 'issue_discovery' | 'document_assist' | 'contextual_agent'

export interface WorkspaceAiChangeDraft {
  changeType: AiProjectChangeType
  title: string
  summary: string
  destructive: boolean
  payload: Record<string, unknown>
}

export interface WorkspaceAiIssueDraft extends AiWorkspaceIssueDraft {}

export interface WorkspaceAiExecutionResult {
  mode: WorkspaceAiMode
  assistantReply: string
  changeDrafts: WorkspaceAiChangeDraft[]
  issueDrafts: WorkspaceAiIssueDraft[]
  reportTitle: string
  reportSummary: string
  reportMarkdown: string
  documentDraft: AiWorkspaceDocumentDraft | null
  workflowDraft: AiWorkspaceWorkflowDraft | null
  sceneDraft: AiWorkspaceSceneDraft | null
  knowledge?: ProjectKnowledgeMessagePayload | null
}

export interface WorkspaceAiHooks {
  onProgress?: (message: string) => Promise<void> | void
  onTool?: (name: string, payload: Record<string, unknown>) => Promise<void> | void
  onDelta?: (text: string) => Promise<void> | void
  onProposal?: (proposal: WorkspaceAiChangeDraft) => Promise<void> | void
  onIssue?: (issue: WorkspaceAiIssueDraft) => Promise<void> | void
}

export interface WorkspaceAgentProfile {
  mode: WorkspaceSupportedMode
  allowWebAccess: boolean
  progressMessage: string
  maxProposals?: number
  scanDimensions?: string[]
}

export interface WorkspaceModeState {
  changeDrafts: WorkspaceAiChangeDraft[]
  issueDrafts: WorkspaceAiIssueDraft[]
  issueFingerprints: Set<string>
  reportTitle: string
  reportSummary: string
  documentDraft: AiWorkspaceDocumentDraft | null
  workflowDraft: AiWorkspaceWorkflowDraft | null
  sceneDraft: AiWorkspaceSceneDraft | null
}

export function createAbortError(): Error {
  const error = new Error('AbortError')
  error.name = 'AbortError'
  return error
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw createAbortError()
}

export function toText(value: unknown): string {
  return String(value || '').trim()
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

function extractAssistantTextFromMessages(messages: Array<Record<string, unknown>>): string {
  const assistant = [...messages].reverse().find((item) => {
    const role = String(item.role || item.type || '').toLowerCase()
    return role.includes('assistant') || role.includes('ai')
  })

  return extractTextFromMessageContent(assistant?.content)
}

export function extractWorkspaceStreamTextChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk))
    return ''

  const source = chunk as Record<string, unknown>
  const content = extractTextFromMessageContent(source.content)
  if (content)
    return content

  const toolCalls = source.tool_calls
  if (Array.isArray(toolCalls) && toolCalls.length > 0)
    return ''

  return ''
}

export function extractWorkspaceLangGraphOutputMessages(output: unknown): Array<Record<string, unknown>> {
  if (!output || typeof output !== 'object' || Array.isArray(output))
    return []

  const source = output as Record<string, unknown>
  if (Array.isArray(source.messages))
    return source.messages.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))

  const nestedOutput = source.output
  if (nestedOutput && typeof nestedOutput === 'object' && !Array.isArray(nestedOutput)) {
    const nestedMessages = (nestedOutput as Record<string, unknown>).messages
    if (Array.isArray(nestedMessages)) {
      return nestedMessages.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    }
  }

  return []
}

function buildIssueMarkdown(input: {
  title: string
  summary: string
  issues: WorkspaceAiIssueDraft[]
}): string {
  const lines: string[] = [
    `# ${input.title}`,
    '',
    input.summary || '以下为自动扫描得到的问题与建议。',
    '',
    `问题总数：${input.issues.length}`,
    '',
  ]

  if (input.issues.length === 0) {
    lines.push('当前未发现高置信问题，或上下文不足以形成结构化问题清单。')
    return lines.join('\n').trim()
  }

  for (const [index, issue] of input.issues.entries()) {
    lines.push(`## ${index + 1}. ${issue.title}`)
    lines.push(`- 严重级别：${issue.severity}`)
    lines.push(`- 证据：${issue.evidence || '暂无'}`)
    lines.push(`- 建议：${issue.recommendation || '暂无'}`)
    lines.push('')
  }

  return lines.join('\n').trim()
}

export function finalizeWorkspaceExecutionResult(
  profile: WorkspaceAgentProfile,
  state: WorkspaceModeState,
  assistantText: string,
): WorkspaceAiExecutionResult {
  if (profile.mode === 'auto_optimize') {
    const hasProposals = state.changeDrafts.length > 0
    return {
      mode: profile.mode,
      assistantReply: hasProposals
        ? (assistantText || '已生成可审批的优化提案，请逐条确认后再执行。')
        : (assistantText || '当前无安全提案。'),
      changeDrafts: state.changeDrafts,
      issueDrafts: [],
      reportTitle: '',
      reportSummary: '',
      reportMarkdown: '',
      documentDraft: null,
      workflowDraft: null,
      sceneDraft: null,
    }
  }

  if (profile.mode === 'issue_discovery') {
    const hasIssues = state.issueDrafts.length > 0
    const reportTitle = toText(state.reportTitle) || 'AI 寻疑报告'
    const reportSummary = hasIssues
      ? (toText(state.reportSummary) || assistantText || '已完成问题扫描并生成结构化报告。')
      : (toText(state.reportSummary) || assistantText || '当前未发现高置信问题，或上下文不足以形成结构化结论。')
    return {
      mode: profile.mode,
      assistantReply: hasIssues
        ? (assistantText || reportSummary)
        : reportSummary,
      changeDrafts: [],
      issueDrafts: state.issueDrafts,
      reportTitle,
      reportSummary,
      reportMarkdown: buildIssueMarkdown({
        title: reportTitle,
        summary: reportSummary,
        issues: state.issueDrafts,
      }),
      documentDraft: null,
      workflowDraft: null,
      sceneDraft: null,
    }
  }

  return {
    mode: profile.mode,
    assistantReply: assistantText || (
      profile.mode === 'document_assist'
        ? (state.documentDraft
            ? '已生成一条待确认的文档草案，请先查看差异并确认后再应用。'
            : '当前无法安全生成文档草案，请补充更明确的文档修改意图。')
        : (state.workflowDraft
            ? '已生成一条待确认的流程草案，请先预览后再决定是否应用。'
            : (state.sceneDraft
                ? '已生成一条待确认的自由画布草案，请先预览后再决定是否应用。'
                : (profile.mode === 'contextual_agent'
                    ? '我可以先帮你梳理上下文；如果要落到画布，请继续明确生成、补全、续改或调样式。'
                    : 'AI 未返回有效结果，请稍后重试。')))
    ),
    changeDrafts: [],
    issueDrafts: [],
    reportTitle: '',
    reportSummary: '',
    reportMarkdown: '',
    documentDraft: state.documentDraft,
    workflowDraft: state.workflowDraft,
    sceneDraft: state.sceneDraft,
  }
}

export async function consumeWorkspaceAgentStream(input: {
  stream: AsyncIterable<unknown>
  profile: WorkspaceAgentProfile
  state: WorkspaceModeState
  hooks: WorkspaceAiHooks
  signal?: AbortSignal
}): Promise<WorkspaceAiExecutionResult> {
  let streamedAssistantText = ''
  let finalMessages: Array<Record<string, unknown>> = []

  for await (const rawEvent of input.stream) {
    throwIfAborted(input.signal)
    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent))
      continue

    const event = rawEvent as {
      event?: unknown
      name?: unknown
      data?: Record<string, unknown>
    }
    const eventType = toText(event.event)

    if (eventType === 'on_chat_model_stream') {
      const textChunk = extractWorkspaceStreamTextChunk(event.data?.chunk)
      if (!textChunk)
        continue

      streamedAssistantText += textChunk
      await input.hooks.onDelta?.(textChunk)
      continue
    }

    if (eventType === 'on_chain_end' && toText(event.name) === 'LangGraph') {
      const messages = extractWorkspaceLangGraphOutputMessages(event.data?.output)
      if (messages.length > 0)
        finalMessages = messages
    }
  }

  throwIfAborted(input.signal)
  const assistantText = finalMessages.length > 0
    ? extractAssistantTextFromMessages(finalMessages)
    : streamedAssistantText
  return finalizeWorkspaceExecutionResult(input.profile, input.state, assistantText)
}
