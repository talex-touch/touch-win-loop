import type { RuntimeSettings } from '~~/server/utils/env'
import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import type {
  AiCanvasAssistSourceFormat,
  AiCanvasAssistTemplate,
  AiProjectChangeType,
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentDraftApplyMode,
  AiWorkspaceIssueDraft,
  AiWorkspaceSceneDraft,
  AiWorkspaceWorkflowDraft,
  ChatMessage,
  ProjectIssueSeverity,
  WorkflowArchitectureView,
  WorkflowLayoutPreset,
  WorkflowSnapshot,
  WorkflowStylePreset,
  WorkspaceAiActionSource,
  WorkspaceAiAssistantPreset,
  WorkspaceAiInteractionIntent,
  WorkspaceAiMode,
  WorkspaceContextualAssistantKey,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createDeepAgent } from 'deepagents'
import { tool } from 'langchain'
import { z } from 'zod'
import { fetchWebPageText, searchWithTavily } from '~~/server/services/admin-ai/web'
import { resolveCanvasSourceFormat, runCanvasAssistGeneration } from '~~/server/services/ai/canvas-assist'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { buildAiNotConfiguredMessage, isAiRuntimeConfigured } from '~~/server/utils/ai-runtime'
import { buildMergedPrompt, resolveAiRuntimeForChannel, runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { runWithRetry } from '~~/server/utils/retry'
import {
  computeAgentDocContentHash,
  extractAgentDocSelectionText,
} from '~~/shared/utils/agent-doc'

type WorkspaceSupportedMode = 'dialog_ask' | 'auto_optimize' | 'issue_discovery' | 'document_assist' | 'contextual_agent'
type WorkspaceConversationRole = 'user' | 'assistant'

interface WorkspaceConversationMessage {
  role: WorkspaceConversationRole
  content: string
}

interface ChangePayloadRule {
  requiredKeys: string[]
  allowedKeys: string[]
  changeKeys?: string[]
}

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
}

export interface WorkspaceAiExecutionContext {
  workspaceId: string
  projectId: string
  projectTitle: string
  contestId: string
  trackId: string
  major: string
  contestName: string
  trackName: string
  resourceId: string
  resourceTitle: string
  markdown: string
  selectionText: string
  selectionRange: Record<string, unknown> | null
  trigger: string
  documentAction: string
  assistantPreset: WorkspaceAiAssistantPreset
  assistantLabel: string
  contextualAssistantKey: WorkspaceContextualAssistantKey | ''
  interactionIntent: WorkspaceAiInteractionIntent
  actionSource: WorkspaceAiActionSource
  requestedAgentAction: string
  activeTabId: string
  previewMode: string
  resourcePurpose: string
  workflowSnapshot: WorkflowSnapshot | null
  workflowAction: string
  workflowTemplate: string
  workflowArchitectureView: string
  workflowStylePreset: string
  workflowLayoutPreset: string
  sceneHash: string
  sceneSourceText: string
  sceneSourceFormat: string
  sceneAction: string
  sceneTemplate: string
  sceneArchitectureView: string
  sceneStylePreset: string
  sceneLayoutPreset: string
  projectSettingsSummary: string
  projectOutlineSummary: string
  resourceSummary: string
  latestUserMessage: string
}

export interface WorkspaceAiHooks {
  onProgress?: (message: string) => Promise<void> | void
  onTool?: (name: string, payload: Record<string, unknown>) => Promise<void> | void
  onDelta?: (text: string) => Promise<void> | void
  onProposal?: (proposal: WorkspaceAiChangeDraft) => Promise<void> | void
  onIssue?: (issue: WorkspaceAiIssueDraft) => Promise<void> | void
}

interface WorkspaceAgentProfile {
  mode: WorkspaceSupportedMode
  allowWebAccess: boolean
  progressMessage: string
  maxProposals?: number
  scanDimensions?: string[]
}

interface WorkspaceAgentToolset {
  tools: any[]
}

interface WorkspaceModeState {
  changeDrafts: WorkspaceAiChangeDraft[]
  issueDrafts: WorkspaceAiIssueDraft[]
  issueFingerprints: Set<string>
  reportTitle: string
  reportSummary: string
  documentDraft: AiWorkspaceDocumentDraft | null
  workflowDraft: AiWorkspaceWorkflowDraft | null
  sceneDraft: AiWorkspaceSceneDraft | null
}

interface WorkspaceModeExecutionInput {
  runtime: RuntimeSettings
  ai: RuntimeSettings['ai']
  context: WorkspaceAiExecutionContext
  channelPrompt?: string
  hooks: WorkspaceAiHooks
  messages: ChatMessage[]
  signal?: AbortSignal
}

export interface WorkspaceExecutionOutcome {
  data: WorkspaceAiExecutionResult
  fallbackUsed: boolean
  attempts: number
}

const MAX_WORKSPACE_AGENT_MESSAGES = 10
const MAX_AUTO_OPTIMIZE_PROPOSALS = 5
const ISSUE_SCAN_DIMENSIONS = ['评分映射', '证据链', '量化指标', '资料完整度']
const DOCUMENT_ACTION_CHANNEL_MAP: Record<WorkspaceAiExecutionContext['documentAction'] | string, PlatformAiChannelKey> = {
  summarize: 'workspace_document_summarize',
  rewrite: 'workspace_document_rewrite',
  continue: 'workspace_document_continue',
  expand: 'workspace_document_expand',
  complete_context: 'workspace_document_complete_context',
  restructure: 'workspace_document_restructure',
}

const documentDraftApplyModeSchema = z.enum([
  'replace_selection',
  'replace_document',
  'insert_after_selection',
  'insert_at_cursor',
])

const documentDraftActionSchema = z.enum([
  'summarize',
  'rewrite',
  'continue',
  'expand',
  'complete_context',
  'restructure',
])

const documentDraftResultSchema = z.object({
  proposedText: z.string().min(1),
})

const workflowDraftActionSchema = z.enum([
  'generate',
  'complete',
  'refine',
  'restyle',
])

const workflowTemplateSchema = z.enum([
  'flowchart',
  'mindmap',
  'er',
  'architecture',
])

const workflowArchitectureViewSchema = z.enum([
  'system_context',
  'container',
  'dependency_map',
])

const workflowStylePresetSchema = z.enum([
  'default',
  'minimal',
  'architecture',
  'workflow',
])

const workflowLayoutPresetSchema = z.enum([
  'left_to_right',
  'top_to_bottom',
  'swimlane',
])

const WORKSPACE_AGENT_PROFILES: Record<WorkspaceSupportedMode, WorkspaceAgentProfile> = {
  dialog_ask: {
    mode: 'dialog_ask',
    allowWebAccess: true,
    progressMessage: '',
  },
  auto_optimize: {
    mode: 'auto_optimize',
    allowWebAccess: false,
    progressMessage: 'AI 正在生成可审批的最小优化提案...',
    maxProposals: MAX_AUTO_OPTIMIZE_PROPOSALS,
  },
  issue_discovery: {
    mode: 'issue_discovery',
    allowWebAccess: false,
    progressMessage: 'AI 正在按固定扫描维度检查问题与证据链...',
    scanDimensions: ISSUE_SCAN_DIMENSIONS,
  },
  document_assist: {
    mode: 'document_assist',
    allowWebAccess: false,
    progressMessage: 'AI 正在生成文稿助手结果...',
  },
  contextual_agent: {
    mode: 'contextual_agent',
    allowWebAccess: false,
    progressMessage: 'AI 正在处理当前上下文...',
  },
}

const CHANGE_PAYLOAD_RULES: Record<AiProjectChangeType, ChangePayloadRule> = {
  settings_common_patch: {
    requiredKeys: [],
    allowedKeys: [
      'title',
      'summary',
      'problemStatement',
      'innovationPoints',
      'techRouteSteps',
      'scoringMapping',
      'risks',
      'deliverables',
    ],
    changeKeys: [
      'title',
      'summary',
      'problemStatement',
      'innovationPoints',
      'techRouteSteps',
      'scoringMapping',
      'risks',
      'deliverables',
    ],
  },
  contest_bindings_replace: {
    requiredKeys: ['contestBindings'],
    allowedKeys: ['contestBindings', 'currentContestId'],
    changeKeys: ['contestBindings'],
  },
  adaptation_patch: {
    requiredKeys: ['contestId'],
    allowedKeys: [
      'contestId',
      'problemStatement',
      'innovationPoints',
      'techRouteSteps',
      'scoringMapping',
      'risks',
      'deliverables',
      'summary',
    ],
    changeKeys: [
      'problemStatement',
      'innovationPoints',
      'techRouteSteps',
      'scoringMapping',
      'risks',
      'deliverables',
      'summary',
    ],
  },
  resource_bind_library: {
    requiredKeys: ['resourceId'],
    allowedKeys: ['resourceId'],
  },
  resource_update_metadata: {
    requiredKeys: ['resourceId'],
    allowedKeys: ['resourceId', 'title', 'summary', 'category', 'availability'],
    changeKeys: ['title', 'summary', 'category', 'availability'],
  },
  resource_archive: {
    requiredKeys: ['resourceId'],
    allowedKeys: ['resourceId'],
  },
  resource_restore: {
    requiredKeys: ['resourceId'],
    allowedKeys: ['resourceId'],
  },
  resource_purge: {
    requiredKeys: ['resourceId'],
    allowedKeys: ['resourceId'],
  },
}

function createAbortError(): Error {
  const error = new Error('AbortError')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw createAbortError()
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function parseSeverity(value: unknown): ProjectIssueSeverity | null {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'critical' || text === 'high' || text === 'medium' || text === 'low')
    return text
  return null
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

function buildContextSnapshot(context: WorkspaceAiExecutionContext): string {
  return JSON.stringify({
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    projectTitle: context.projectTitle,
    contestId: context.contestId,
    trackId: context.trackId,
    major: context.major,
    contestName: context.contestName,
    trackName: context.trackName,
    resourceId: context.resourceId,
    resourceTitle: context.resourceTitle,
    markdown: context.markdown,
    selectionText: context.selectionText,
    selectionRange: context.selectionRange,
    trigger: context.trigger,
    documentAction: context.documentAction,
    assistantPreset: context.assistantPreset,
    assistantLabel: context.assistantLabel,
    contextualAssistantKey: context.contextualAssistantKey,
    interactionIntent: context.interactionIntent,
    actionSource: context.actionSource,
    requestedAgentAction: context.requestedAgentAction,
    activeTabId: context.activeTabId,
    previewMode: context.previewMode,
    resourcePurpose: context.resourcePurpose,
    workflowSnapshot: context.workflowSnapshot,
    workflowAction: context.workflowAction,
    workflowTemplate: context.workflowTemplate,
    workflowArchitectureView: context.workflowArchitectureView,
    workflowStylePreset: context.workflowStylePreset,
    workflowLayoutPreset: context.workflowLayoutPreset,
    sceneHash: context.sceneHash,
    sceneSourceText: context.sceneSourceText,
    sceneSourceFormat: context.sceneSourceFormat,
    sceneAction: context.sceneAction,
    sceneTemplate: context.sceneTemplate,
    sceneArchitectureView: context.sceneArchitectureView,
    sceneStylePreset: context.sceneStylePreset,
    sceneLayoutPreset: context.sceneLayoutPreset,
    projectSettingsSummary: context.projectSettingsSummary,
    projectOutlineSummary: context.projectOutlineSummary,
    resourceSummary: context.resourceSummary,
    latestUserMessage: context.latestUserMessage,
  }, null, 2)
}

function isDocumentAction(value: unknown): value is AiWorkspaceDocumentDraft['action'] {
  return documentDraftActionSchema.safeParse(value).success
}

function isDocumentApplyMode(value: unknown): value is AiWorkspaceDocumentDraftApplyMode {
  return documentDraftApplyModeSchema.safeParse(value).success
}

function isWorkflowDraftAction(value: unknown): value is AiWorkspaceWorkflowDraft['action'] {
  return workflowDraftActionSchema.safeParse(value).success
}

function isWorkflowTemplate(value: unknown): value is AiCanvasAssistTemplate {
  return workflowTemplateSchema.safeParse(value).success
}

function isWorkflowArchitectureView(value: unknown): value is WorkflowArchitectureView {
  return workflowArchitectureViewSchema.safeParse(value).success
}

function isWorkflowStylePreset(value: unknown): value is WorkflowStylePreset {
  return workflowStylePresetSchema.safeParse(value).success
}

function isWorkflowLayoutPreset(value: unknown): value is WorkflowLayoutPreset {
  return workflowLayoutPresetSchema.safeParse(value).success
}

function isSceneDraftAction(value: unknown): value is AiWorkspaceSceneDraft['action'] {
  return workflowDraftActionSchema.safeParse(value).success
}

function normalizeDocumentSelectionRange(value: unknown): AiWorkspaceDocumentDraft['selectionRange'] {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const source = value as Record<string, unknown>
  const anchorLine = Number(source.anchorLine)
  const anchorColumn = Number(source.anchorColumn)
  const headLine = Number(source.headLine)
  const headColumn = Number(source.headColumn)
  const selectionLength = Number(source.selectionLength)
  if (![anchorLine, anchorColumn, headLine, headColumn, selectionLength].every(Number.isFinite))
    return null

  return {
    anchorLine,
    anchorColumn,
    headLine,
    headColumn,
    isCollapsed: Boolean(source.isCollapsed),
    selectionLength,
  }
}

function hasDocumentSelection(context: WorkspaceAiExecutionContext): boolean {
  const selectionRange = normalizeDocumentSelectionRange(context.selectionRange)
  return Boolean(selectionRange && !selectionRange.isCollapsed && context.selectionText)
}

function resolveDocumentActionChannelKey(action: AiWorkspaceDocumentDraft['action']): PlatformAiChannelKey {
  return DOCUMENT_ACTION_CHANNEL_MAP[action] || 'workspace_document_summarize'
}

function resolveDefaultDocumentApplyMode(
  action: AiWorkspaceDocumentDraft['action'],
  context: WorkspaceAiExecutionContext,
): AiWorkspaceDocumentDraftApplyMode {
  const selectionRange = normalizeDocumentSelectionRange(context.selectionRange)
  if (action === 'continue')
    return selectionRange?.isCollapsed ? 'insert_at_cursor' : 'insert_after_selection'
  if (action === 'summarize')
    return hasDocumentSelection(context) ? 'insert_after_selection' : 'replace_document'
  return hasDocumentSelection(context) ? 'replace_selection' : 'replace_document'
}

function validateDocumentDraftScope(input: {
  action: AiWorkspaceDocumentDraft['action']
  applyMode: AiWorkspaceDocumentDraftApplyMode
  context: WorkspaceAiExecutionContext
}): { ok: true } | { ok: false, reason: string } {
  const hasSelection = hasDocumentSelection(input.context)
  if (hasSelection) {
    if (input.applyMode === 'replace_document' || input.applyMode === 'insert_at_cursor')
      return { ok: false, reason: 'SELECTION_SCOPE_MISMATCH' }
    return { ok: true }
  }

  if (input.applyMode === 'replace_selection' || input.applyMode === 'insert_after_selection')
    return { ok: false, reason: 'DOCUMENT_SCOPE_MISMATCH' }
  return { ok: true }
}

function buildConversationDigest(messages: ChatMessage[]): string {
  return normalizeConversationMessages(messages)
    .map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
    .join('\n')
    .trim()
}

function buildDocumentGenerationSystemPrompt(input: {
  action: AiWorkspaceDocumentDraft['action']
  applyMode: AiWorkspaceDocumentDraftApplyMode
  channelPrompt: string
}): string {
  const fixedPrompt = [
    '你是 AgentDoc 的文档改写执行器。',
    '你的唯一任务是返回一段可直接用于文档替换或插入的 Markdown 正文。',
    '禁止输出解释、标题、前言、后记、代码块围栏或“以下是结果”等包装语。',
    `动作：${input.action}`,
    `写回方式：${input.applyMode}`,
  ].join('\n')
  return buildMergedPrompt(fixedPrompt, input.channelPrompt)
}

async function generateDocumentDraftText(input: {
  runtime: RuntimeSettings
  context: WorkspaceAiExecutionContext
  messages: ChatMessage[]
  action: AiWorkspaceDocumentDraft['action']
  applyMode: AiWorkspaceDocumentDraftApplyMode
  originalText: string
}): Promise<{
  proposedText: string
  channelKey: PlatformAiChannelKey
}> {
  const channelKey = resolveDocumentActionChannelKey(input.action)
  const channelRuntime = resolveAiRuntimeForChannel(input.runtime, channelKey)
  if (!channelRuntime.channel.enabled || !isAiRuntimeConfigured(channelRuntime.ai))
    throw new Error(buildAiNotConfiguredMessage(channelRuntime.channel.label || 'AgentDoc AI'))

  const conversationDigest = buildConversationDigest(input.messages)
  const fullDocument = String(input.context.markdown || '').replace(/\r\n?/g, '\n')

  const generated = await runWithPlatformAiChannelFallback(input.runtime, channelKey, async ({ ai, prompt }) => {
    const model = createChatModel(ai)
    const structuredModel = model.withStructuredOutput(documentDraftResultSchema, {
      name: 'AgentDocDraftResult',
      strict: false,
    })
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ['system', buildDocumentGenerationSystemPrompt({
        action: input.action,
        applyMode: input.applyMode,
        channelPrompt: prompt,
      })],
      ['human', [
        `文档标题：${input.context.resourceTitle || '未命名文档'}`,
        `用户最新要求：${input.context.latestUserMessage || '（无）'}`,
        conversationDigest ? `最近多轮对话：\n${conversationDigest}` : '',
        input.context.selectionText ? `当前选区：\n${input.context.selectionText}` : '',
        `当前作用文本：\n${input.originalText || '（空）'}`,
        `当前全文：\n${fullDocument || '（空文档）'}`,
        '请仅返回 proposedText 字段，对应最终要替换或插入的正文内容。',
      ].filter(Boolean).join('\n\n')],
    ])
    const promptValue = await promptTemplate.invoke({})
    return documentDraftResultSchema.parse(await structuredModel.invoke(promptValue))
  })

  return {
    proposedText: String(generated.data.proposedText || '').replace(/\r\n?/g, '\n'),
    channelKey,
  }
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

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword))
}

function isExplicitWorkflowDraftRequest(message: string): boolean {
  const normalized = toText(message).toLowerCase()
  if (!normalized)
    return false

  const isQuestionLike = includesAnyKeyword(normalized, [
    '怎么',
    '如何',
    '为什么',
    '一般',
    '缺什么',
    '是否',
    '是不是',
    '能不能',
  ])
  if (isQuestionLike) {
    return false
  }

  return includesAnyKeyword(normalized, [
    '生成',
    '画',
    '绘制',
    '做',
    '做个',
    '补全',
    '续改',
    '调样式',
    '输出',
    '来个',
    '来一版',
    '给我一个',
    '给我一版',
    '出一版',
  ]) && includesAnyKeyword(normalized, [
    '流程图',
    '流程',
    '脑图',
    '架构图',
    'er图',
    'er 图',
    'mindmap',
    'mermaid',
    '泳道图',
    'workflow',
    'flowchart',
    'architecture',
  ])
}

function isExplicitContextualDraftRequest(message: string): boolean {
  const normalized = toText(message).toLowerCase()
  if (!normalized)
    return false

  if (isExplicitWorkflowDraftRequest(normalized))
    return true

  return includesAnyKeyword(normalized, [
    '生成',
    '画',
    '绘制',
    '补全',
    '续改',
    '调样式',
    '改成',
    '应用这个',
    '按这个生成',
    '就按这个',
  ]) && !includesAnyKeyword(normalized, [
    '怎么',
    '如何',
    '为什么',
    '是否',
    '是不是',
    '能不能',
    '可以吗',
  ])
}

function isContextualDraftActionIntent(context: WorkspaceAiExecutionContext): boolean {
  return context.interactionIntent === 'draft_action'
    || context.actionSource === 'toolbar'
    || Boolean(toText(context.requestedAgentAction))
    || Boolean(toText(context.workflowAction))
    || Boolean(toText(context.sceneAction))
}

function shouldExposeAgentProtoDraftTools(context: WorkspaceAiExecutionContext): boolean {
  return isContextualDraftActionIntent(context)
    || isExplicitContextualDraftRequest(context.latestUserMessage)
}

function isStandaloneWorkflowTopicRequest(message: string): boolean {
  const normalized = toText(message).toLowerCase()
  if (!isExplicitWorkflowDraftRequest(normalized))
    return false

  if (includesAnyKeyword(normalized, ['当前项目', '本项目', '这个项目', '当前流程', '这个流程', '该流程', '会议', '纪要', '赛道', '比赛', '工作台', '资源', '画布']))
    return false

  return includesAnyKeyword(normalized, [
    '示例',
    '模板',
    '通用',
    '比如',
    '例如',
    '演示',
    'demo',
    '健身',
    '训练',
    '减脂',
    '增肌',
    '饮食',
    '跑步',
    '课程',
    '请假',
    '旅行',
    '注册',
    '下单',
    '订单',
    '招聘',
    '面试',
    '报销',
    '点餐',
  ])
}

function buildModePrompt(profile: WorkspaceAgentProfile, context?: WorkspaceAiExecutionContext): string {
  if (profile.mode === 'dialog_ask') {
    return [
      '模式：对话询问（只读）。',
      '仅允许解释、澄清、对比、归纳和下一步建议。',
      '禁止输出任何写入、审批通过、自动执行或文档已修改之类的暗示。',
      '如果信息不足，要明确指出缺口，而不是编造结论。',
      '如果上下文提供了方括号资料引用标签，引用依据时必须保留对应标签，不要编造新的 citation。',
      '如果上下文提示索引未完成，必须明确说明“索引未完成，结果可能不完整”。',
      '即使当前资源是 AgentProto，也不要调用草案工具；如果用户要生成或修改图，请提示切回 AgentProto 上下文助手或使用工具栏动作。',
    ].join('\n')
  }

  if (profile.mode === 'contextual_agent') {
    const draftActionIntent = context
      ? isContextualDraftActionIntent(context) || isExplicitContextualDraftRequest(context.latestUserMessage)
      : false
    return [
      '模式：Contextual Agent（上下文协作 + 明确动作草案）。',
      draftActionIntent
        ? '本轮来自工具栏动作或明确草案请求：请先读取必要上下文，再调用匹配的草案工具。'
        : '本轮默认是自由上下文聊天：可以先帮用户补充上下文、发散思路、整理方案或追问关键缺口，不要强行生成草案。',
      '禁止暗示已自动写入资源、已替换画布、已导入设计稿或已直接修改内容。',
      '只有在用户点击工具栏动作，或明确要求生成、补全、续改、调样式时，才允许调用草案工具。',
      'AgentProto 的流程图场景使用 propose_workflow_draft。',
      'AgentProto 的自由画布/原型画布场景使用 propose_scene_draft。',
      '设计助手只输出结构源草案与导入建议，不做静默覆盖。',
      '普通聊天可以自然回答，并在合适时提示“可以继续生成待确认草案”。',
    ].join('\n')
  }

  if (profile.mode === 'auto_optimize') {
    return [
      '模式：自动优化（只生成提案，不执行）。',
      '你只能通过 propose_change 提交最小可审批提案，禁止直接假设已执行。',
      `单次最多生成 ${profile.maxProposals || MAX_AUTO_OPTIMIZE_PROPOSALS} 条提案。`,
      '提案必须能映射到现有审批链 changeType；空 payload、未知字段、缺少必填字段都不允许。',
      '如果当前没有安全提案，明确说明“当前无安全提案”。',
    ].join('\n')
  }

  if (profile.mode === 'issue_discovery') {
    return [
      '模式：寻疑发现（结构化扫描）。',
      `请固定从以下四个视角扫描：${(profile.scanDimensions || ISSUE_SCAN_DIMENSIONS).join('、')}。`,
      '只记录高置信问题，不要凑数；如果没有高置信问题，明确说明。',
      '只能通过 report_issue 记录问题，通过 set_issue_report 设置报告标题和摘要。',
      '报告 Markdown 由系统统一生成，你不需要自己拼接 Markdown 正文。',
    ].join('\n')
  }

  return [
    '模式：AgentDoc（文档草案模式，用户确认后才真正落文）。',
    '你必须先调用 get_workspace_context 读取上下文，再判断是否需要调用 propose_document_change。',
    '只有在请求可安全映射为文档修改时，才允许调用 propose_document_change。',
    '如果只是问答、上下文不足，或无法安全判断修改范围，就直接用自然语言说明，不要伪造草案。',
    '禁止暗示文档已经被修改，也禁止输出审批通过、已替换等语气。',
  ].join('\n')
}

function buildPrimaryModePrompt(profile: WorkspaceAgentProfile, context: WorkspaceAiExecutionContext): string {
  const explicitWorkflowDraftRequest = isExplicitWorkflowDraftRequest(context.latestUserMessage)
  const explicitContextualDraftRequest = isExplicitContextualDraftRequest(context.latestUserMessage)
  const draftActionIntent = isContextualDraftActionIntent(context)
  const shouldRunDraftFlow = draftActionIntent || explicitContextualDraftRequest
  const standaloneWorkflowTopicRequest = isStandaloneWorkflowTopicRequest(context.latestUserMessage)

  if (profile.mode === 'auto_optimize') {
    return [
      `当前模式：${profile.mode}`,
      `当前项目：${context.projectTitle || '未命名项目'}`,
      `竞赛：${context.contestName || '未选择'}`,
      `赛道：${context.trackName || '未选择'}`,
      `专业：${context.major || '未提供'}`,
      '',
      '请先调用 get_workspace_context 读取当前项目上下文，再决定是否生成提案。',
      '只允许生成能直接落入审批链的最小提案；不要输出任何已执行语气。',
      '',
      '用户当前目标：',
      context.latestUserMessage || '（无）',
    ].join('\n')
  }

  if (profile.mode === 'issue_discovery') {
    return [
      `当前模式：${profile.mode}`,
      `当前项目：${context.projectTitle || '未命名项目'}`,
      `竞赛：${context.contestName || '未选择'}`,
      `赛道：${context.trackName || '未选择'}`,
      `专业：${context.major || '未提供'}`,
      '',
      '请先调用 get_workspace_context 读取当前项目上下文。',
      `按以下四个视角扫描：${(profile.scanDimensions || ISSUE_SCAN_DIMENSIONS).join('、')}。`,
      '如果没有高置信问题，不要凑数，直接说明上下文不足或未发现明显风险。',
      '',
      '用户当前关注点：',
      context.latestUserMessage || '（无）',
    ].join('\n')
  }

  const assistantGuide = context.assistantPreset === 'design'
    ? (profile.mode === 'contextual_agent'
        ? [
            `当前助手：${context.assistantLabel || '设计助手'}`,
            `当前标签：${context.activeTabId || '未指定'}`,
            `当前画布：${context.resourceTitle || '未命名设计画布'}`,
            shouldRunDraftFlow
              ? '本轮如果要生成结构源草案，必须等待用户确认导入后才会真正应用到当前设计内容。'
              : '本轮优先作为设计搭子自然分析页面层级、组件拆分和交互路径；不要强行生成草案。',
            shouldRunDraftFlow
              ? '优先围绕页面结构、组件层次、交互状态与视觉一致性生成清晰草案。'
              : '优先围绕页面结构、组件层次、交互状态与视觉一致性给出清晰建议。',
          ]
        : [
            `当前助手：${context.assistantLabel || '设计助手'}`,
            `当前标签：${context.activeTabId || '未指定'}`,
            `当前画布：${context.resourceTitle || '未命名设计画布'}`,
            '优先围绕页面层级、布局结构、视觉一致性和关键交互说明给出只读建议。',
          ])
    : context.assistantPreset === 'prototype' && context.resourcePurpose === 'workflow'
      ? (profile.mode === 'contextual_agent'
          ? [
              `当前助手：${context.assistantLabel || 'AgentProto'}`,
              `当前标签：${context.activeTabId || '未指定'}`,
              `当前画布：${context.resourceTitle || '未命名流程画布'}`,
              shouldRunDraftFlow
                ? '本轮是明确制图动作：围绕流程阶段、责任角色、输入输出、分支条件、异常回路和跨节点衔接生成可确认草案。'
                : '本轮优先自由协作：可以先帮用户补流程结构、找缺口、给组织建议，不要强行生成草案。',
              context.workflowSnapshot
                ? `当前流程摘要：单页=${context.workflowSnapshot.isSinglePage ? '是' : '否'}，节点 ${context.workflowSnapshot.nodeCount}，连线 ${context.workflowSnapshot.edgeCount}，分组 ${context.workflowSnapshot.groupCount}。`
                : '当前流程摘要：暂无可用 workflowSnapshot。',
              context.workflowAction ? `当前指定动作：${context.workflowAction}` : '',
              context.workflowTemplate ? `当前图类型：${context.workflowTemplate}` : '',
              context.workflowArchitectureView ? `当前架构视图：${context.workflowArchitectureView}` : '',
              context.workflowStylePreset ? `当前样式预设：${context.workflowStylePreset}` : '',
              context.workflowLayoutPreset ? `当前布局预设：${context.workflowLayoutPreset}` : '',
              '只有用户明确要生成、补全、续改或调样式时，才调用 propose_workflow_draft 生成完整草案；禁止暗示已经直接改图。',
              explicitWorkflowDraftRequest ? '当前这轮命中明确制图意图：优先生成 workflow 草案，不要停留在项目上下文复述。' : '',
              standaloneWorkflowTopicRequest ? '当前这轮更像独立示例/模板流程图请求：内容主题以用户输入为准，当前项目资料只用于默认布局和样式，不要把项目内容硬套进图里。' : '',
            ]
          : [
              `当前助手：${context.assistantLabel || 'AgentProto'}`,
              `当前标签：${context.activeTabId || '未指定'}`,
              `当前画布：${context.resourceTitle || '未命名流程画布'}`,
              '优先围绕流程阶段、责任角色、输入输出、分支条件、异常回路和跨节点衔接给出只读梳理建议。',
              context.workflowSnapshot
                ? `当前流程摘要：单页=${context.workflowSnapshot.isSinglePage ? '是' : '否'}，节点 ${context.workflowSnapshot.nodeCount}，连线 ${context.workflowSnapshot.edgeCount}，分组 ${context.workflowSnapshot.groupCount}。`
                : '当前流程摘要：暂无可用 workflowSnapshot。',
              context.workflowAction ? `当前指定动作：${context.workflowAction}` : '',
              context.workflowTemplate ? `当前图类型：${context.workflowTemplate}` : '',
              context.workflowArchitectureView ? `当前架构视图：${context.workflowArchitectureView}` : '',
              context.workflowStylePreset ? `当前样式预设：${context.workflowStylePreset}` : '',
              context.workflowLayoutPreset ? `当前布局预设：${context.workflowLayoutPreset}` : '',
              '如果用户明确要生成、补全、续改或调样式，请提示切回 AgentProto 上下文助手或使用工具栏动作；当前只读模式不要调用草案工具。',
              explicitWorkflowDraftRequest ? '当前这轮命中明确制图意图：优先生成 workflow 草案，不要停留在项目上下文复述。' : '',
              standaloneWorkflowTopicRequest ? '当前这轮更像独立示例/模板流程图请求：内容主题以用户输入为准，当前项目资料只用于默认布局和样式，不要把项目内容硬套进图里。' : '',
            ])
      : context.assistantPreset === 'prototype'
        ? (profile.mode === 'contextual_agent'
            ? [
                `当前助手：${context.assistantLabel || 'AgentProto'}`,
                `当前标签：${context.activeTabId || '未指定'}`,
                `当前画布：${context.resourceTitle || '未命名原型画布'}`,
                shouldRunDraftFlow
                  ? '本轮是明确原型/自由画布动作：可以生成、补全、续改或调样式，结果必须先产出待确认草案。'
                  : '本轮优先自由协作：可以先帮用户整理结构、补充上下文、讨论页面流转，不要强行生成草案。',
                context.sceneAction ? `当前指定动作：${context.sceneAction}` : '',
                context.sceneTemplate ? `当前图类型：${context.sceneTemplate}` : '',
                context.sceneArchitectureView ? `当前架构视图：${context.sceneArchitectureView}` : '',
                context.sceneStylePreset ? `当前样式预设：${context.sceneStylePreset}` : '',
                context.sceneLayoutPreset ? `当前布局预设：${context.sceneLayoutPreset}` : '',
                context.sceneHash ? `当前画布哈希：${context.sceneHash}` : '',
                '只有用户明确要生成、补全、续改或调样式时，才调用 propose_scene_draft 返回结构源草案；禁止暗示已经直接改图。',
              ]
            : [
                `当前助手：${context.assistantLabel || 'AgentProto'}`,
                `当前标签：${context.activeTabId || '未指定'}`,
                `当前画布：${context.resourceTitle || '未命名原型画布'}`,
                '优先围绕页面流转、模块拆分、核心状态与交互路径给出只读建议。',
              ])
        : [
            `当前助手：${context.assistantLabel || '对话询问'}`,
          ]

  return [
    `当前模式：${profile.mode}`,
    `当前项目：${context.projectTitle || '未命名项目'}`,
    `竞赛：${context.contestName || '未选择'}`,
    `赛道：${context.trackName || '未选择'}`,
    `专业：${context.major || '未提供'}`,
    '',
    ...assistantGuide,
    '',
    profile.mode === 'contextual_agent' && !shouldRunDraftFlow
      ? '如果只是创意讨论、结构建议或上下文补充，可以直接回答；只有依赖当前资源细节时才调用 get_workspace_context。'
      : '请先调用 get_workspace_context 读取当前项目上下文，再决定是否联网检索。',
    profile.mode === 'contextual_agent'
      ? (shouldRunDraftFlow
          ? '本轮输出围绕待确认草案；不要把草案描述成已落盘结果。'
          : '本轮优先自然协作，不要强行进入草案模式；如适合继续执行，可提示用户使用工具栏或明确说“生成草案”。')
      : '只做只读问答，输出必须简洁、具体、可执行。',
    '如果上下文带有方括号资料引用标签，回答引用依据时必须保留对应标签。',
    '',
    '用户最新输入：',
    context.latestUserMessage || '（无）',
  ].join('\n')
}

function buildDocumentAssistPrompt(context: WorkspaceAiExecutionContext): string {
  return [
    '当前模式：document_assist',
    `当前项目：${context.projectTitle || '未命名项目'}`,
    `文档标题：${context.resourceTitle || '未命名文档'}`,
    `触发来源：${context.trigger || 'right_sidebar'}`,
    '',
    '当前选区：',
    context.selectionText || '（无选区）',
    '',
    '文档正文（截断前文）：',
    context.markdown || '（空文档）',
    '',
    '请结合最近多轮对话，判断用户想对文档做什么。',
    '如果能够安全生成文档草案，请调用 propose_document_change；否则直接回复原因或补充建议。',
  ].join('\n')
}

function buildPrompt(profile: WorkspaceAgentProfile, context: WorkspaceAiExecutionContext): string {
  if (profile.mode === 'document_assist')
    return buildDocumentAssistPrompt(context)
  return buildPrimaryModePrompt(profile, context)
}

function isConversationRole(role: unknown): role is WorkspaceConversationRole {
  return role === 'user' || role === 'assistant'
}

function normalizeConversationMessages(messages: ChatMessage[]): WorkspaceConversationMessage[] {
  return messages
    .filter((message): message is ChatMessage & { role: WorkspaceConversationRole } => isConversationRole(message.role))
    .map(message => ({
      role: message.role,
      content: toText(message.content),
    }))
    .filter(message => Boolean(message.content))
    .slice(-MAX_WORKSPACE_AGENT_MESSAGES)
}

function buildWorkspaceConversationMessages(
  mode: WorkspaceSupportedMode,
  context: WorkspaceAiExecutionContext,
  messages: ChatMessage[],
): WorkspaceConversationMessage[] {
  const profile = WORKSPACE_AGENT_PROFILES[mode]
  const prompt = buildPrompt(profile, context)
  const normalizedMessages = normalizeConversationMessages(messages)
  if (normalizedMessages.length === 0)
    return [{ role: 'user', content: prompt }]

  const lastUserMessageIndex = [...normalizedMessages.keys()].reverse().find(index => normalizedMessages[index]?.role === 'user')
  if (lastUserMessageIndex === undefined)
    return [...normalizedMessages, { role: 'user', content: prompt }]

  return normalizedMessages.map((message, index) => {
    if (index !== lastUserMessageIndex)
      return message

    return {
      ...message,
      content: [
        message.content,
        '',
        '[工作台上下文要求]',
        prompt,
      ].filter(Boolean).join('\n'),
    }
  })
}

function createWorkspaceModeState(): WorkspaceModeState {
  return {
    changeDrafts: [],
    issueDrafts: [],
    issueFingerprints: new Set<string>(),
    reportTitle: 'AI 寻疑报告',
    reportSummary: '',
    documentDraft: null,
    workflowDraft: null,
    sceneDraft: null,
  }
}

function hasRequiredPayloadValue(value: unknown): boolean {
  if (Array.isArray(value))
    return value.length > 0
  if (value && typeof value === 'object')
    return Object.keys(value as Record<string, unknown>).length > 0
  return Boolean(toText(value))
}

function sanitizeWorkspaceChangePayload(
  changeType: AiProjectChangeType,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const rule = CHANGE_PAYLOAD_RULES[changeType]
  if (!rule)
    return null

  const sanitizedPayload: Record<string, unknown> = {}
  for (const key of rule.allowedKeys) {
    if (payload[key] !== undefined)
      sanitizedPayload[key] = payload[key]
  }

  return sanitizedPayload
}

function validateWorkspaceChangeDraft(
  draft: WorkspaceAiChangeDraft,
): { ok: true, changeDraft: WorkspaceAiChangeDraft } | { ok: false, reason: string } {
  const rule = CHANGE_PAYLOAD_RULES[draft.changeType]
  if (!rule)
    return { ok: false, reason: 'UNSUPPORTED_CHANGE_TYPE' }

  const title = toText(draft.title)
  const summary = toText(draft.summary)
  if (title.length < 2)
    return { ok: false, reason: 'TITLE_REQUIRED' }
  if (summary.length < 4)
    return { ok: false, reason: 'SUMMARY_REQUIRED' }

  const sanitizedPayload = sanitizeWorkspaceChangePayload(draft.changeType, draft.payload || {})
  if (!sanitizedPayload || Object.keys(sanitizedPayload).length === 0)
    return { ok: false, reason: 'PAYLOAD_EMPTY_OR_UNKNOWN' }

  for (const requiredKey of rule.requiredKeys) {
    if (!hasRequiredPayloadValue(sanitizedPayload[requiredKey]))
      return { ok: false, reason: `MISSING_REQUIRED_${requiredKey.toUpperCase()}` }
  }

  if (Array.isArray(rule.changeKeys) && rule.changeKeys.length > 0) {
    const hasChangeKeys = rule.changeKeys.some(key => hasRequiredPayloadValue(sanitizedPayload[key]))
    if (!hasChangeKeys)
      return { ok: false, reason: 'NO_MUTABLE_FIELDS' }
  }

  return {
    ok: true,
    changeDraft: {
      ...draft,
      title,
      summary,
      payload: sanitizedPayload,
    },
  }
}

function createWorkspaceIssueFingerprint(issue: WorkspaceAiIssueDraft): string {
  return `${issue.title.toLowerCase()}::${issue.evidence.toLowerCase()}`
}

function validateWorkspaceIssueDraft(
  rawIssue: WorkspaceAiIssueDraft,
  state: WorkspaceModeState,
): { ok: true, issueDraft: WorkspaceAiIssueDraft } | { ok: false, reason: string } {
  const severity = parseSeverity(rawIssue.severity)
  const issue: WorkspaceAiIssueDraft = {
    title: toText(rawIssue.title),
    severity: severity || 'medium',
    evidence: toText(rawIssue.evidence),
    recommendation: toText(rawIssue.recommendation),
  }

  if (!issue.title)
    return { ok: false, reason: 'TITLE_REQUIRED' }
  if (!severity)
    return { ok: false, reason: 'SEVERITY_REQUIRED' }
  if (!issue.evidence)
    return { ok: false, reason: 'EVIDENCE_REQUIRED' }
  if (!issue.recommendation)
    return { ok: false, reason: 'RECOMMENDATION_REQUIRED' }

  const issueFingerprint = createWorkspaceIssueFingerprint(issue)
  if (state.issueFingerprints.has(issueFingerprint))
    return { ok: false, reason: 'DUPLICATE_ISSUE' }

  state.issueFingerprints.add(issueFingerprint)
  return {
    ok: true,
    issueDraft: issue,
  }
}

function createWorkspaceContextTool(input: WorkspaceModeExecutionInput, contextSnapshot: string): any {
  return tool(
    async () => {
      await input.hooks.onTool?.('get_workspace_context', {
        bytes: contextSnapshot.length,
      })
      return contextSnapshot
    },
    {
      name: 'get_workspace_context',
      description: '读取当前工作台上下文（项目配置、资料摘要、大纲与用户输入）。',
      schema: z.object({}),
    },
  )
}

function createWorkspaceWebTools(input: WorkspaceModeExecutionInput): [any, any] {
  const webEnabled = Boolean(input.runtime.adminAi.tavilyApiKey)

  const webSearch = tool(
    async ({ query }: { query: string }) => {
      if (!webEnabled)
        return JSON.stringify({ disabled: true, reason: '平台未配置联网检索密钥' })

      const items = await searchWithTavily({
        query,
        tavilyApiKey: input.runtime.adminAi.tavilyApiKey,
        maxResults: input.runtime.adminAi.maxWebResults,
        timeoutMs: input.runtime.adminAi.webTimeoutMs,
      })
      await input.hooks.onTool?.('web_search', {
        query,
        results: items.length,
      })
      return JSON.stringify(items)
    },
    {
      name: 'web_search',
      description: '联网检索公开信息（优先 Tavily）。',
      schema: z.object({
        query: z.string().min(2),
      }),
    },
  )

  const fetchWebPage = tool(
    async ({ url }: { url: string }) => {
      const text = await fetchWebPageText({
        url,
        timeoutMs: input.runtime.adminAi.webTimeoutMs,
        maxChars: input.runtime.adminAi.maxPageChars,
      })
      await input.hooks.onTool?.('fetch_web_page', {
        url,
        chars: text.length,
      })
      return text
    },
    {
      name: 'fetch_web_page',
      description: '抓取公开网页文本（内置 SSRF 防护）。',
      schema: z.object({
        url: z.string().url(),
      }),
    },
  )

  return [webSearch, fetchWebPage]
}

function createWorkspaceProposalTool(
  input: WorkspaceModeExecutionInput,
  state: WorkspaceModeState,
  profile: WorkspaceAgentProfile,
): any {
  return tool(
    async (payload: {
      changeType: AiProjectChangeType
      title: string
      summary: string
      destructive?: boolean
      payload?: Record<string, unknown>
    }) => {
      if (state.changeDrafts.length >= (profile.maxProposals || MAX_AUTO_OPTIMIZE_PROPOSALS)) {
        await input.hooks.onTool?.('propose_change_rejected', {
          reason: 'MAX_PROPOSALS_REACHED',
          max: profile.maxProposals || MAX_AUTO_OPTIMIZE_PROPOSALS,
        })
        return JSON.stringify({ ok: false, reason: 'MAX_PROPOSALS_REACHED' })
      }

      const validated = validateWorkspaceChangeDraft({
        changeType: payload.changeType,
        title: toText(payload.title) || 'AI 变更提案',
        summary: toText(payload.summary),
        destructive: Boolean(payload.destructive),
        payload: payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
          ? payload.payload
          : {},
      })

      if (!validated.ok) {
        await input.hooks.onTool?.('propose_change_rejected', {
          changeType: payload.changeType,
          reason: validated.reason,
        })
        return JSON.stringify({ ok: false, reason: validated.reason })
      }

      state.changeDrafts.push(validated.changeDraft)
      await input.hooks.onProposal?.(validated.changeDraft)
      await input.hooks.onTool?.('propose_change', {
        changeType: validated.changeDraft.changeType,
        destructive: validated.changeDraft.destructive,
        proposalCount: state.changeDrafts.length,
      })
      return JSON.stringify({ ok: true, proposalCount: state.changeDrafts.length })
    },
    {
      name: 'propose_change',
      description: '提交自动优化模式下的可审批变更提案。',
      schema: z.object({
        changeType: z.enum([
          'settings_common_patch',
          'contest_bindings_replace',
          'adaptation_patch',
          'resource_bind_library',
          'resource_update_metadata',
          'resource_archive',
          'resource_restore',
          'resource_purge',
        ]),
        title: z.string().min(2),
        summary: z.string().min(4),
        destructive: z.boolean().optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    },
  )
}

function createWorkspaceIssueTools(
  input: WorkspaceModeExecutionInput,
  state: WorkspaceModeState,
): [any, any] {
  const reportIssue = tool(
    async (payload: {
      title: string
      severity: ProjectIssueSeverity
      evidence: string
      recommendation: string
    }) => {
      const validated = validateWorkspaceIssueDraft({
        title: payload.title,
        severity: payload.severity,
        evidence: payload.evidence,
        recommendation: payload.recommendation,
      }, state)

      if (!validated.ok) {
        await input.hooks.onTool?.('report_issue_rejected', {
          reason: validated.reason,
        })
        return JSON.stringify({ ok: false, reason: validated.reason })
      }

      state.issueDrafts.push(validated.issueDraft)
      await input.hooks.onIssue?.(validated.issueDraft)
      await input.hooks.onTool?.('report_issue', {
        severity: validated.issueDraft.severity,
        issueCount: state.issueDrafts.length,
      })
      return JSON.stringify({ ok: true, issueCount: state.issueDrafts.length })
    },
    {
      name: 'report_issue',
      description: '在寻疑发现模式下记录结构化问题。',
      schema: z.object({
        title: z.string().min(2),
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        evidence: z.string().min(2),
        recommendation: z.string().min(2),
      }),
    },
  )

  const setIssueReport = tool(
    async (payload: { title?: string, summary?: string }) => {
      state.reportTitle = toText(payload.title) || state.reportTitle
      state.reportSummary = toText(payload.summary) || state.reportSummary
      await input.hooks.onTool?.('set_issue_report', {
        hasTitle: Boolean(toText(payload.title)),
        hasSummary: Boolean(toText(payload.summary)),
      })
      return JSON.stringify({ ok: true })
    },
    {
      name: 'set_issue_report',
      description: '设置寻疑报告标题和摘要。',
      schema: z.object({
        title: z.string().optional(),
        summary: z.string().optional(),
      }),
    },
  )

  return [reportIssue, setIssueReport]
}

function createWorkspaceDocumentDraftTool(
  input: WorkspaceModeExecutionInput,
  state: WorkspaceModeState,
): any {
  return tool(
    async (payload: {
      action: AiWorkspaceDocumentDraft['action']
      title: string
      summary: string
      applyMode?: AiWorkspaceDocumentDraftApplyMode
    }) => {
      if (state.documentDraft) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: 'DOCUMENT_DRAFT_ALREADY_EXISTS',
        })
        return JSON.stringify({ ok: false, reason: 'DOCUMENT_DRAFT_ALREADY_EXISTS' })
      }

      if (!isDocumentAction(payload.action)) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: 'INVALID_DOCUMENT_ACTION',
        })
        return JSON.stringify({ ok: false, reason: 'INVALID_DOCUMENT_ACTION' })
      }

      const action = payload.action
      const title = toText(payload.title) || 'AgentDoc 文档草案'
      const summary = toText(payload.summary)
      if (title.length < 2 || summary.length < 4) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: 'TITLE_OR_SUMMARY_REQUIRED',
        })
        return JSON.stringify({ ok: false, reason: 'TITLE_OR_SUMMARY_REQUIRED' })
      }

      const applyMode = isDocumentApplyMode(payload.applyMode)
        ? payload.applyMode
        : resolveDefaultDocumentApplyMode(action, input.context)
      const scopeValidation = validateDocumentDraftScope({
        action,
        applyMode,
        context: input.context,
      })
      if (!scopeValidation.ok) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: scopeValidation.reason,
          action,
          applyMode,
        })
        return JSON.stringify({ ok: false, reason: scopeValidation.reason })
      }

      const markdown = String(input.context.markdown || '').replace(/\r\n?/g, '\n')
      const selectionText = String(input.context.selectionText || '').replace(/\r\n?/g, '\n')
      const selectionRange = normalizeDocumentSelectionRange(input.context.selectionRange)
      const originalText = applyMode === 'replace_document'
        ? markdown
        : applyMode === 'insert_at_cursor'
          ? ''
          : extractAgentDocSelectionText(markdown, selectionRange)

      if ((applyMode === 'replace_selection' || applyMode === 'insert_after_selection') && !originalText) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: 'SELECTION_REQUIRED',
          action,
          applyMode,
        })
        return JSON.stringify({ ok: false, reason: 'SELECTION_REQUIRED' })
      }

      const generated = await generateDocumentDraftText({
        runtime: input.runtime,
        context: input.context,
        messages: input.messages,
        action,
        applyMode,
        originalText: originalText || selectionText,
      })
      const proposedText = String(generated.proposedText || '')
      if (!proposedText.trim()) {
        await input.hooks.onTool?.('propose_document_change_rejected', {
          reason: 'PROPOSED_TEXT_REQUIRED',
          action,
          channelKey: generated.channelKey,
        })
        return JSON.stringify({ ok: false, reason: 'PROPOSED_TEXT_REQUIRED' })
      }

      state.documentDraft = {
        action,
        title,
        summary,
        resourceId: toText(input.context.resourceId),
        resourceTitle: toText(input.context.resourceTitle),
        selectionText,
        selectionRange,
        applyMode,
        baseDocumentHash: computeAgentDocContentHash(markdown),
        originalText,
        proposedText,
      }

      await input.hooks.onTool?.('propose_document_change', {
        action,
        applyMode,
        channelKey: generated.channelKey,
      })
      return JSON.stringify({ ok: true, action, applyMode })
    },
    {
      name: 'propose_document_change',
      description: '为 AgentDoc 生成一条待确认的文档改写草案。仅允许产出单条草案。',
      schema: z.object({
        action: documentDraftActionSchema,
        title: z.string().min(2),
        summary: z.string().min(4),
        applyMode: documentDraftApplyModeSchema.optional(),
      }),
    },
  )
}

function isAgentProtoWorkflowContext(context: WorkspaceAiExecutionContext): boolean {
  return context.resourcePurpose === 'workflow'
    && context.assistantPreset === 'prototype'
    && context.contextualAssistantKey === 'agent_proto'
}

function isAgentProtoSceneContext(context: WorkspaceAiExecutionContext): boolean {
  return context.assistantPreset === 'prototype'
    && context.contextualAssistantKey === 'agent_proto'
    && context.resourcePurpose !== 'workflow'
}

function resolveSceneSourceSummary(context: WorkspaceAiExecutionContext): string {
  return [
    context.projectSettingsSummary,
    context.projectOutlineSummary,
    context.resourceSummary,
    context.sceneHash ? `当前画布哈希：${context.sceneHash}` : '',
    context.sceneSourceText ? `当前结构源：\n${context.sceneSourceText}` : '',
  ].filter(Boolean).join('\n\n')
}

function createWorkspaceSceneDraftTool(
  input: WorkspaceModeExecutionInput,
  state: WorkspaceModeState,
): any {
  return tool(
    async (payload: {
      action: AiWorkspaceSceneDraft['action']
      title: string
      summary: string
      template?: AiCanvasAssistTemplate
      architectureView?: WorkflowArchitectureView
      stylePreset?: WorkflowStylePreset
      layoutPreset?: WorkflowLayoutPreset
    }) => {
      if (state.sceneDraft) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'SCENE_DRAFT_ALREADY_EXISTS',
        })
        return JSON.stringify({ ok: false, reason: 'SCENE_DRAFT_ALREADY_EXISTS' })
      }

      if (!isAgentProtoSceneContext(input.context)) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'SCENE_CONTEXT_REQUIRED',
        })
        return JSON.stringify({ ok: false, reason: 'SCENE_CONTEXT_REQUIRED' })
      }

      if (!isSceneDraftAction(payload.action)) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'INVALID_SCENE_ACTION',
        })
        return JSON.stringify({ ok: false, reason: 'INVALID_SCENE_ACTION' })
      }

      const title = toText(payload.title) || 'AgentProto 原型草案'
      const summary = toText(payload.summary)
      if (title.length < 2 || summary.length < 4) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'TITLE_OR_SUMMARY_REQUIRED',
        })
        return JSON.stringify({ ok: false, reason: 'TITLE_OR_SUMMARY_REQUIRED' })
      }

      const action = payload.action
      const template = isWorkflowTemplate(payload.template)
        ? payload.template
        : (isWorkflowTemplate(input.context.sceneTemplate) ? input.context.sceneTemplate : 'flowchart')
      const architectureView = isWorkflowArchitectureView(payload.architectureView)
        ? payload.architectureView
        : (isWorkflowArchitectureView(input.context.sceneArchitectureView) ? input.context.sceneArchitectureView : undefined)
      const stylePreset = isWorkflowStylePreset(payload.stylePreset)
        ? payload.stylePreset
        : (isWorkflowStylePreset(input.context.sceneStylePreset) ? input.context.sceneStylePreset : 'default')
      const layoutPreset = isWorkflowLayoutPreset(payload.layoutPreset)
        ? payload.layoutPreset
        : (isWorkflowLayoutPreset(input.context.sceneLayoutPreset) ? input.context.sceneLayoutPreset : 'left_to_right')

      if ((action === 'complete' || action === 'refine' || action === 'restyle') && !toText(input.context.sceneHash)) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'SCENE_HASH_REQUIRED',
          action,
        })
        return JSON.stringify({ ok: false, reason: 'SCENE_HASH_REQUIRED' })
      }

      if ((action === 'complete' || action === 'refine') && !toText(input.context.sceneSourceText)) {
        await input.hooks.onTool?.('propose_scene_draft_rejected', {
          reason: 'SCENE_SOURCE_REQUIRED',
          action,
        })
        return JSON.stringify({ ok: false, reason: 'SCENE_SOURCE_REQUIRED' })
      }

      let sourceText = toText(input.context.sceneSourceText)
      let sourceFormat: AiCanvasAssistSourceFormat = resolveCanvasSourceFormat(template)
      let channelKey: PlatformAiChannelKey | null = null

      if (action !== 'restyle') {
        const generated = await runCanvasAssistGeneration({
          runtime: input.runtime,
          action,
          template,
          messages: input.messages,
          resourceTitle: input.context.resourceTitle || title,
          resourceSummary: resolveSceneSourceSummary(input.context),
          sourceText: toText(input.context.sceneSourceText),
          aiOptions: {
            temperature: input.ai.temperature,
          },
        })
        sourceText = generated.data.sourceText
        sourceFormat = generated.data.sourceFormat
        channelKey = generated.channelKey
      }
      else if (toText(input.context.sceneSourceFormat)) {
        sourceFormat = toText(input.context.sceneSourceFormat) as AiCanvasAssistSourceFormat
      }

      state.sceneDraft = {
        action,
        title,
        summary,
        resourceId: toText(input.context.resourceId),
        resourceTitle: toText(input.context.resourceTitle),
        template,
        sourceFormat,
        sourceText,
        architectureView: template === 'architecture' ? (architectureView || null) : null,
        stylePreset,
        layoutPreset,
        baseSceneHash: toText(input.context.sceneHash),
      }

      await input.hooks.onTool?.('propose_scene_draft', {
        action,
        template,
        architectureView: architectureView || null,
        stylePreset,
        layoutPreset,
        channelKey,
      })
      return JSON.stringify({
        ok: true,
        action,
        template,
        sourceFormat,
      })
    },
    {
      name: 'propose_scene_draft',
      description: '为 AgentProto 生成自由画布/原型画布草案。只返回待确认草案，绝不直接写回画布。',
      schema: z.object({
        action: workflowDraftActionSchema,
        title: z.string().min(2),
        summary: z.string().min(4),
        template: workflowTemplateSchema.optional(),
        architectureView: workflowArchitectureViewSchema.optional(),
        stylePreset: workflowStylePresetSchema.optional(),
        layoutPreset: workflowLayoutPresetSchema.optional(),
      }),
    },
  )
}

function createWorkspaceWorkflowDraftTool(
  input: WorkspaceModeExecutionInput,
  state: WorkspaceModeState,
): any {
  return tool(
    async (payload: {
      action: AiWorkspaceWorkflowDraft['action']
      title: string
      summary: string
      template?: AiCanvasAssistTemplate
      architectureView?: WorkflowArchitectureView
      stylePreset?: WorkflowStylePreset
      layoutPreset?: WorkflowLayoutPreset
    }) => {
      if (state.workflowDraft) {
        await input.hooks.onTool?.('propose_workflow_draft_rejected', {
          reason: 'WORKFLOW_DRAFT_ALREADY_EXISTS',
        })
        return JSON.stringify({ ok: false, reason: 'WORKFLOW_DRAFT_ALREADY_EXISTS' })
      }

      if (!isAgentProtoWorkflowContext(input.context)) {
        await input.hooks.onTool?.('propose_workflow_draft_rejected', {
          reason: 'WORKFLOW_CONTEXT_REQUIRED',
        })
        return JSON.stringify({ ok: false, reason: 'WORKFLOW_CONTEXT_REQUIRED' })
      }

      if (!isWorkflowDraftAction(payload.action)) {
        await input.hooks.onTool?.('propose_workflow_draft_rejected', {
          reason: 'INVALID_WORKFLOW_ACTION',
        })
        return JSON.stringify({ ok: false, reason: 'INVALID_WORKFLOW_ACTION' })
      }

      const title = toText(payload.title) || 'AgentProto 流程草案'
      const summary = toText(payload.summary)
      if (title.length < 2 || summary.length < 4) {
        await input.hooks.onTool?.('propose_workflow_draft_rejected', {
          reason: 'TITLE_OR_SUMMARY_REQUIRED',
        })
        return JSON.stringify({ ok: false, reason: 'TITLE_OR_SUMMARY_REQUIRED' })
      }

      const action = payload.action
      const template = isWorkflowTemplate(payload.template)
        ? payload.template
        : (isWorkflowTemplate(input.context.workflowTemplate) ? input.context.workflowTemplate : 'flowchart')
      const architectureView = isWorkflowArchitectureView(payload.architectureView)
        ? payload.architectureView
        : (isWorkflowArchitectureView(input.context.workflowArchitectureView) ? input.context.workflowArchitectureView : undefined)
      const stylePreset = isWorkflowStylePreset(payload.stylePreset)
        ? payload.stylePreset
        : (isWorkflowStylePreset(input.context.workflowStylePreset) ? input.context.workflowStylePreset : 'default')
      const layoutPreset = isWorkflowLayoutPreset(payload.layoutPreset)
        ? payload.layoutPreset
        : (isWorkflowLayoutPreset(input.context.workflowLayoutPreset) ? input.context.workflowLayoutPreset : 'left_to_right')
      const workflowSnapshot = input.context.workflowSnapshot
      const standaloneWorkflowTopicRequest = action === 'generate' && isStandaloneWorkflowTopicRequest(input.context.latestUserMessage)

      if ((action === 'complete' || action === 'refine' || action === 'restyle') && !workflowSnapshot) {
        await input.hooks.onTool?.('propose_workflow_draft_rejected', {
          reason: 'WORKFLOW_SNAPSHOT_REQUIRED',
          action,
        })
        return JSON.stringify({ ok: false, reason: 'WORKFLOW_SNAPSHOT_REQUIRED' })
      }

      let sourceText = ''
      let sourceFormat: AiCanvasAssistSourceFormat = resolveCanvasSourceFormat(template)
      let channelKey: PlatformAiChannelKey | null = null

      if (action !== 'restyle') {
        const generated = await runCanvasAssistGeneration({
          runtime: input.runtime,
          action,
          template,
          messages: input.messages,
          resourceTitle: standaloneWorkflowTopicRequest ? title : (input.context.resourceTitle || ''),
          resourceSummary: standaloneWorkflowTopicRequest
            ? '当前请求是独立主题流程图，请以本轮用户主题为准生成结构源，不要把当前项目资料写入图中。'
            : [
                input.context.projectSettingsSummary,
                input.context.projectOutlineSummary,
                input.context.resourceSummary,
                workflowSnapshot
                  ? [
                      `当前流程哈希：${workflowSnapshot.hash}`,
                      `当前单页：${workflowSnapshot.isSinglePage ? '是' : '否'}`,
                      `当前节点数：${workflowSnapshot.nodeCount}`,
                      `当前连线数：${workflowSnapshot.edgeCount}`,
                      workflowSnapshot.sampleLabels.length > 0 ? `节点示例：${workflowSnapshot.sampleLabels.join('、')}` : '',
                    ].filter(Boolean).join('\n')
                  : '',
              ].filter(Boolean).join('\n\n'),
          sourceText: workflowSnapshot ? JSON.stringify(workflowSnapshot, null, 2) : '',
          aiOptions: {
            temperature: input.ai.temperature,
          },
        })
        sourceText = generated.data.sourceText
        sourceFormat = generated.data.sourceFormat
        channelKey = generated.channelKey
      }

      state.workflowDraft = {
        action,
        title,
        summary,
        resourceId: toText(input.context.resourceId),
        resourceTitle: toText(input.context.resourceTitle),
        template,
        sourceFormat,
        sourceText,
        architectureView: template === 'architecture' ? (architectureView || null) : null,
        stylePreset,
        layoutPreset,
        baseWorkflowHash: workflowSnapshot?.hash || '',
      }

      await input.hooks.onTool?.('propose_workflow_draft', {
        action,
        template,
        architectureView: architectureView || null,
        stylePreset,
        layoutPreset,
        channelKey,
      })
      return JSON.stringify({
        ok: true,
        action,
        template,
        sourceFormat,
      })
    },
    {
      name: 'propose_workflow_draft',
      description: '为 AgentProto 生成 workflow 完整草案。只返回预览草案，绝不直接写回画布。',
      schema: z.object({
        action: workflowDraftActionSchema,
        title: z.string().min(2),
        summary: z.string().min(4),
        template: workflowTemplateSchema.optional(),
        architectureView: workflowArchitectureViewSchema.optional(),
        stylePreset: workflowStylePresetSchema.optional(),
        layoutPreset: workflowLayoutPresetSchema.optional(),
      }),
    },
  )
}

function createWorkspaceToolset(
  input: WorkspaceModeExecutionInput,
  profile: WorkspaceAgentProfile,
  state: WorkspaceModeState,
  contextSnapshot: string,
): WorkspaceAgentToolset {
  const tools: any[] = [
    createWorkspaceContextTool(input, contextSnapshot),
  ]

  if (profile.allowWebAccess) {
    const [webSearch, fetchWebPage] = createWorkspaceWebTools(input)
    tools.push(webSearch, fetchWebPage)
  }

  if (profile.mode === 'auto_optimize')
    tools.push(createWorkspaceProposalTool(input, state, profile))

  if (profile.mode === 'issue_discovery') {
    const [reportIssue, setIssueReport] = createWorkspaceIssueTools(input, state)
    tools.push(reportIssue, setIssueReport)
  }

  if (profile.mode === 'document_assist')
    tools.push(createWorkspaceDocumentDraftTool(input, state))

  if (profile.mode === 'contextual_agent') {
    if (isAgentProtoWorkflowContext(input.context) && shouldExposeAgentProtoDraftTools(input.context))
      tools.push(createWorkspaceWorkflowDraftTool(input, state))
    if (isAgentProtoSceneContext(input.context) && shouldExposeAgentProtoDraftTools(input.context))
      tools.push(createWorkspaceSceneDraftTool(input, state))
  }

  return { tools }
}

function buildWorkspaceSystemPrompt(profile: WorkspaceAgentProfile, channelPrompt: string, context: WorkspaceAiExecutionContext): string {
  return [
    '你是 Loopy，负责 Team 与项目上下文下的工作台问答与分析。',
    buildModePrompt(profile, context),
    channelPrompt ? `[场景提示词]\n${channelPrompt}` : '',
    profile.mode === 'contextual_agent'
      ? '需要依赖当前资源细节或准备草案时先获取上下文；普通上下文讨论可以直接回答。'
      : '需要依赖当前项目事实时先获取上下文，避免与上下文冲突。',
  ].filter(Boolean).join('\n')
}

function finalizeWorkspaceExecutionResult(
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

async function executeWorkspaceAgentMode(
  input: WorkspaceModeExecutionInput,
  profile: WorkspaceAgentProfile,
): Promise<WorkspaceExecutionOutcome> {
  const contextSnapshot = buildContextSnapshot(input.context)
  const channelPrompt = toText(input.channelPrompt)
  let hasVisibleExecutionOutput = false

  const retryAwareHooks: WorkspaceAiHooks = {
    onProgress: message => input.hooks.onProgress?.(message),
    onTool: async (name, payload) => {
      hasVisibleExecutionOutput = true
      await input.hooks.onTool?.(name, payload)
    },
    onDelta: async (text) => {
      if (text)
        hasVisibleExecutionOutput = true
      await input.hooks.onDelta?.(text)
    },
    onProposal: async (proposal) => {
      hasVisibleExecutionOutput = true
      await input.hooks.onProposal?.(proposal)
    },
    onIssue: async (issue) => {
      hasVisibleExecutionOutput = true
      await input.hooks.onIssue?.(issue)
    },
  }

  const executed = await runWithRetry<WorkspaceAiExecutionResult>({
    maxRetries: input.ai.maxRetries,
    run: async () => {
      throwIfAborted(input.signal)
      if (profile.progressMessage)
        await input.hooks.onProgress?.(profile.progressMessage)

      const state = createWorkspaceModeState()
      const toolset = createWorkspaceToolset({
        ...input,
        hooks: retryAwareHooks,
      }, profile, state, contextSnapshot)
      const agent = createDeepAgent({
        model: createChatModel(input.ai),
        tools: toolset.tools,
        systemPrompt: buildWorkspaceSystemPrompt(profile, channelPrompt, input.context),
      })

      const stream = agent.streamEvents({
        messages: buildWorkspaceConversationMessages(profile.mode, input.context, input.messages) as any,
      }, {
        version: 'v2',
        signal: input.signal,
      })
      return consumeWorkspaceAgentStream({
        stream,
        profile,
        state,
        hooks: retryAwareHooks,
        signal: input.signal,
      })
    },
    shouldRetryOnError: ({ error }) => !hasVisibleExecutionOutput && !isAbortError(error),
  })

  return {
    data: executed.data,
    fallbackUsed: executed.fallbackUsed,
    attempts: executed.attempts,
  }
}

async function executeDialogAskWorkspaceAi(input: WorkspaceModeExecutionInput): Promise<WorkspaceExecutionOutcome> {
  return executeWorkspaceAgentMode(input, WORKSPACE_AGENT_PROFILES.dialog_ask)
}

async function executeAutoOptimizeWorkspaceAi(input: WorkspaceModeExecutionInput): Promise<WorkspaceExecutionOutcome> {
  return executeWorkspaceAgentMode(input, WORKSPACE_AGENT_PROFILES.auto_optimize)
}

async function executeIssueDiscoveryWorkspaceAi(input: WorkspaceModeExecutionInput): Promise<WorkspaceExecutionOutcome> {
  return executeWorkspaceAgentMode(input, WORKSPACE_AGENT_PROFILES.issue_discovery)
}

async function executeDocumentAssistWorkspaceAi(input: WorkspaceModeExecutionInput): Promise<WorkspaceExecutionOutcome> {
  return executeWorkspaceAgentMode(input, WORKSPACE_AGENT_PROFILES.document_assist)
}

async function executeContextualAgentWorkspaceAi(input: WorkspaceModeExecutionInput): Promise<WorkspaceExecutionOutcome> {
  return executeWorkspaceAgentMode(input, WORKSPACE_AGENT_PROFILES.contextual_agent)
}

export async function executeWorkspaceAi(input: {
  runtime: RuntimeSettings
  ai: RuntimeSettings['ai']
  mode: WorkspaceAiMode
  context: WorkspaceAiExecutionContext
  messages?: ChatMessage[]
  channelPrompt?: string
  hooks?: WorkspaceAiHooks
  signal?: AbortSignal
}): Promise<WorkspaceExecutionOutcome> {
  const executionInput: WorkspaceModeExecutionInput = {
    runtime: input.runtime,
    ai: input.ai,
    context: input.context,
    channelPrompt: input.channelPrompt,
    hooks: input.hooks || {},
    messages: Array.isArray(input.messages) ? input.messages : [],
    signal: input.signal,
  }

  if (input.mode === 'auto_optimize')
    return executeAutoOptimizeWorkspaceAi(executionInput)
  if (input.mode === 'issue_discovery')
    return executeIssueDiscoveryWorkspaceAi(executionInput)
  if (input.mode === 'document_assist')
    return executeDocumentAssistWorkspaceAi(executionInput)
  if (input.mode === 'contextual_agent')
    return executeContextualAgentWorkspaceAi(executionInput)
  return executeDialogAskWorkspaceAi(executionInput)
}
