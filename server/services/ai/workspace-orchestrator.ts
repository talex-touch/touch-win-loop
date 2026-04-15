import type {
  AiProjectChangeType,
  AiWorkspaceIssueDraft,
  ChatMessage,
  ProjectIssueSeverity,
  WorkspaceAiAssistantPreset,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import { createDeepAgent } from 'deepagents'
import { tool } from 'langchain'
import { z } from 'zod'
import { fetchWebPageText, searchWithTavily } from '~~/server/services/admin-ai/web'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { runWithRetry } from '~~/server/utils/retry'

type WorkspaceSupportedMode = 'dialog_ask' | 'auto_optimize' | 'issue_discovery' | 'document_assist'
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
}

export interface WorkspaceAiExecutionContext {
  workspaceId: string
  projectId: string
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
  activeTabId: string
  previewMode: string
  resourcePurpose: string
  projectSettingsSummary: string
  projectOutlineSummary: string
  resourceSummary: string
  latestUserMessage: string
}

export interface WorkspaceAiRuntime {
  ai: {
    provider: string
    baseURL: string
    apiKey: string
    model: string
    temperature?: number
    topP?: number
    maxTokens?: number
    presencePenalty?: number
    frequencyPenalty?: number
    timeoutMs: number
    maxRetries: number
  }
  adminAi: {
    tavilyApiKey: string
    maxWebResults: number
    webTimeoutMs: number
    maxPageChars: number
  }
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
}

interface WorkspaceModeExecutionInput {
  runtime: WorkspaceAiRuntime
  context: WorkspaceAiExecutionContext
  channelPrompt?: string
  hooks: WorkspaceAiHooks
  messages: ChatMessage[]
}

export interface WorkspaceExecutionOutcome {
  data: WorkspaceAiExecutionResult
  fallbackUsed: boolean
  attempts: number
}

const MAX_WORKSPACE_AGENT_MESSAGES = 10
const MAX_AUTO_OPTIMIZE_PROPOSALS = 5
const ISSUE_SCAN_DIMENSIONS = ['评分映射', '证据链', '量化指标', '资料完整度']

const WORKSPACE_AGENT_PROFILES: Record<WorkspaceSupportedMode, WorkspaceAgentProfile> = {
  dialog_ask: {
    mode: 'dialog_ask',
    allowWebAccess: true,
    progressMessage: 'AI 正在读取工作台上下文并生成只读建议...',
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

function chunkText(text: string, chunkSize = 24): string[] {
  const normalized = String(text || '')
  if (!normalized)
    return []

  const chunks: string[] = []
  for (let i = 0; i < normalized.length; i += chunkSize)
    chunks.push(normalized.slice(i, i + chunkSize))
  return chunks
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

function extractAssistantText(payload: unknown): string {
  const source = payload as {
    messages?: Array<{ type?: string, role?: string, content?: unknown }>
  }

  const messages = source.messages || []
  const assistant = [...messages].reverse().find((item) => {
    const role = String(item.role || item.type || '').toLowerCase()
    return role.includes('assistant') || role.includes('ai')
  })

  const content = assistant?.content
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

function buildContextSnapshot(context: WorkspaceAiExecutionContext): string {
  return JSON.stringify({
    workspaceId: context.workspaceId,
    projectId: context.projectId,
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
    activeTabId: context.activeTabId,
    previewMode: context.previewMode,
    resourcePurpose: context.resourcePurpose,
    projectSettingsSummary: context.projectSettingsSummary,
    projectOutlineSummary: context.projectOutlineSummary,
    resourceSummary: context.resourceSummary,
    latestUserMessage: context.latestUserMessage,
  }, null, 2)
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

function buildModePrompt(profile: WorkspaceAgentProfile): string {
  if (profile.mode === 'dialog_ask') {
    return [
      '模式：对话询问（只读）。',
      '仅允许解释、澄清、对比、归纳和下一步建议。',
      '禁止输出任何写入、审批通过、自动执行或文档已修改之类的暗示。',
      '如果信息不足，要明确指出缺口，而不是编造结论。',
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
    '模式：文稿助手（只读生成，用户确认后才落文）。',
    '禁止产出任何可执行写入动作，也不要假设已经修改文档。',
    '仅输出适合直接插入 markdown 文档的结果正文，不要附加冗长说明。',
    '若是 summarize，则输出精炼摘要；若是 rewrite，则直接输出润写后的替代文本；若是 continue，则输出自然续写段落；若是 expand，则输出扩写后的完整替代文本；若是 complete_context，则输出补全后的完整正文；若是 restructure，则输出整理结构后的完整正文。',
  ].join('\n')
}

function buildPrimaryModePrompt(profile: WorkspaceAgentProfile, context: WorkspaceAiExecutionContext): string {
  if (profile.mode === 'auto_optimize') {
    return [
      `当前模式：${profile.mode}`,
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
    ? [
        `当前助手：${context.assistantLabel || '设计助手'}`,
        `当前标签：${context.activeTabId || '未指定'}`,
        `当前画布：${context.resourceTitle || '未命名设计画布'}`,
        '优先围绕页面层级、布局结构、视觉一致性和关键交互说明给出只读建议。',
      ]
    : context.assistantPreset === 'prototype'
      ? [
          `当前助手：${context.assistantLabel || '原型助手'}`,
          `当前标签：${context.activeTabId || '未指定'}`,
          `当前画布：${context.resourceTitle || '未命名原型画布'}`,
          '优先围绕页面流转、模块拆分、核心状态与交互路径给出只读建议。',
        ]
      : [
          `当前助手：${context.assistantLabel || '对话询问'}`,
        ]

  return [
    `当前模式：${profile.mode}`,
    `竞赛：${context.contestName || '未选择'}`,
    `赛道：${context.trackName || '未选择'}`,
    `专业：${context.major || '未提供'}`,
    '',
    ...assistantGuide,
    '',
    '请先调用 get_workspace_context 读取当前项目上下文，再决定是否联网检索。',
    '只做只读问答，输出必须简洁、具体、可执行。',
    '',
    '用户最新输入：',
    context.latestUserMessage || '（无）',
  ].join('\n')
}

function buildDocumentAssistPrompt(context: WorkspaceAiExecutionContext): string {
  return [
    '当前模式：document_assist',
    `文档标题：${context.resourceTitle || '未命名文档'}`,
    `动作：${context.documentAction || 'summarize'}`,
    `触发来源：${context.trigger || 'right_sidebar'}`,
    '',
    '当前选区：',
    context.selectionText || '（无选区）',
    '',
    '文档正文（截断前文）：',
    context.markdown || '（空文档）',
    '',
    '请严格按动作返回可直接落入文档的正文内容，不要返回解释、标题或代码块围栏。',
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
    .filter(message => isConversationRole(message.role))
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
  if (mode === 'document_assist')
    return [{ role: 'user', content: prompt }]

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

  return { tools }
}

function buildWorkspaceSystemPrompt(profile: WorkspaceAgentProfile, channelPrompt: string): string {
  return [
    '你是 Loopy，负责 Team 与项目上下文下的工作台问答与分析。',
    buildModePrompt(profile),
    channelPrompt ? `[场景提示词]\n${channelPrompt}` : '',
    '必须先获取上下文再作答，避免与上下文冲突。',
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
    }
  }

  return {
    mode: profile.mode,
    assistantReply: assistantText || 'AI 未返回有效结果，请稍后重试。',
    changeDrafts: [],
    issueDrafts: [],
    reportTitle: '',
    reportSummary: '',
    reportMarkdown: '',
  }
}

async function executeWorkspaceAgentMode(
  input: WorkspaceModeExecutionInput,
  profile: WorkspaceAgentProfile,
): Promise<WorkspaceExecutionOutcome> {
  const contextSnapshot = buildContextSnapshot(input.context)
  const channelPrompt = toText(input.channelPrompt)

  const executed = await runWithRetry<WorkspaceAiExecutionResult>({
    maxRetries: input.runtime.ai.maxRetries,
    run: async () => {
      await input.hooks.onProgress?.(profile.progressMessage)

      const state = createWorkspaceModeState()
      const toolset = createWorkspaceToolset(input, profile, state, contextSnapshot)
      const agent = createDeepAgent({
        model: createChatModel(input.runtime.ai),
        tools: toolset.tools,
        systemPrompt: buildWorkspaceSystemPrompt(profile, channelPrompt),
      })

      const response = await agent.invoke({
        messages: buildWorkspaceConversationMessages(profile.mode, input.context, input.messages),
      })

      const result = finalizeWorkspaceExecutionResult(profile, state, extractAssistantText(response))
      for (const chunk of chunkText(result.assistantReply))
        await input.hooks.onDelta?.(chunk)
      return result
    },
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

export async function executeWorkspaceAi(input: {
  runtime: WorkspaceAiRuntime
  mode: WorkspaceAiMode
  context: WorkspaceAiExecutionContext
  messages?: ChatMessage[]
  channelPrompt?: string
  hooks?: WorkspaceAiHooks
}): Promise<WorkspaceExecutionOutcome> {
  const executionInput: WorkspaceModeExecutionInput = {
    runtime: input.runtime,
    context: input.context,
    channelPrompt: input.channelPrompt,
    hooks: input.hooks || {},
    messages: Array.isArray(input.messages) ? input.messages : [],
  }

  if (input.mode === 'auto_optimize')
    return executeAutoOptimizeWorkspaceAi(executionInput)
  if (input.mode === 'issue_discovery')
    return executeIssueDiscoveryWorkspaceAi(executionInput)
  if (input.mode === 'document_assist')
    return executeDocumentAssistWorkspaceAi(executionInput)
  return executeDialogAskWorkspaceAi(executionInput)
}
