import type {
  AiProjectChangeType,
  AiWorkspaceIssueDraft,
  ProjectIssueSeverity,
  WorkspaceAiMode,
} from '~~/shared/types/domain'
import { createDeepAgent } from 'deepagents'
import { tool } from 'langchain'
import { z } from 'zod'
import { fetchWebPageText, searchWithTavily } from '~~/server/services/admin-ai/web'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { scanRepoArchitecture } from '~~/server/services/scene/data-source-connectors'
import {
  applySceneTemplate,
  buildDeviceMockupSceneDocument,
  exportArchitectureModelToMermaid,
  exportSchemaModelToDDL,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  relayoutSceneDocument,
  sceneDocumentFromUnknown,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'
import { runWithRetry } from '~~/server/utils/retry'

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

function toSeverity(value: unknown): ProjectIssueSeverity {
  const text = String(value || '').trim().toLowerCase()
  if (text === 'critical' || text === 'high' || text === 'medium' || text === 'low')
    return text
  return 'medium'
}

function parseJsonValue(rawValue: string): unknown {
  const normalized = String(rawValue || '').trim()
  if (!normalized)
    return {}
  try {
    return JSON.parse(normalized)
  }
  catch {
    return {}
  }
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

  for (const [index, issue] of input.issues.entries()) {
    lines.push(`## ${index + 1}. ${issue.title}`)
    lines.push(`- 严重级别：${issue.severity}`)
    lines.push(`- 证据：${issue.evidence || '暂无'}`)
    lines.push(`- 建议：${issue.recommendation || '暂无'}`)
    lines.push('')
  }

  return lines.join('\n').trim()
}

function buildFallbackResult(mode: WorkspaceAiMode, context: WorkspaceAiExecutionContext): WorkspaceAiExecutionResult {
  if (mode === 'document_assist') {
    const selection = context.selectionText || '当前选区'
    if (context.documentAction === 'rewrite') {
      return {
        mode,
        assistantReply: `改写建议：围绕“${selection.slice(0, 36)}”补齐主语、动作和结果，让句子更直接、更像项目文档。`,
        changeDrafts: [],
        issueDrafts: [],
        reportTitle: '',
        reportSummary: '',
        reportMarkdown: '',
      }
    }

    if (context.documentAction === 'continue') {
      return {
        mode,
        assistantReply: `建议继续补一段“目标、方法、预期产出”三句式说明，承接 ${context.resourceTitle || '当前文档'} 的上下文。`,
        changeDrafts: [],
        issueDrafts: [],
        reportTitle: '',
        reportSummary: '',
        reportMarkdown: '',
      }
    }

    return {
      mode,
      assistantReply: `摘要：${selection.slice(0, 72) || context.resourceTitle || '当前文档'} 的核心是先明确问题，再用可验证路径组织方案与交付。`,
      changeDrafts: [],
      issueDrafts: [],
      reportTitle: '',
      reportSummary: '',
      reportMarkdown: '',
    }
  }

  if (mode === 'auto_optimize') {
    const draftSummary = context.projectSettingsSummary || '项目设置信息较少，建议先补齐。'
    const changeDrafts: WorkspaceAiChangeDraft[] = [
      {
        changeType: 'settings_common_patch',
        title: '补齐项目摘要与问题陈述',
        summary: '建议基于当前竞赛上下文补全项目摘要和问题定义，提升可读性。',
        destructive: false,
        payload: {
          summary: `围绕 ${context.contestName || '目标竞赛'} 的 ${context.trackName || '目标赛道'} 形成可验证方案，分阶段推进交付。`,
          problemStatement: context.latestUserMessage || draftSummary,
        },
      },
    ]

    if (context.contestId) {
      changeDrafts.push({
        changeType: 'adaptation_patch',
        title: '补齐当前竞赛适配摘要',
        summary: '补全当前竞赛下的适配稿摘要，便于评审快速理解方案定位。',
        destructive: false,
        payload: {
          contestId: context.contestId,
          summary: `面向 ${context.contestName || '当前竞赛'} 的 ${context.trackName || '目标赛道'} 输出阶段化落地方案与验收路径。`,
        },
      })
    }

    return {
      mode,
      assistantReply: '已生成可执行优化建议，请逐条审批后执行。',
      changeDrafts,
      issueDrafts: [],
      reportTitle: '',
      reportSummary: '',
      reportMarkdown: '',
    }
  }

  if (mode === 'issue_discovery') {
    const issueDrafts: WorkspaceAiIssueDraft[] = [
      {
        title: '缺少可量化指标',
        severity: 'high',
        evidence: '项目描述未给出核心指标与验收阈值。',
        recommendation: '补充准确率、时延、成本等核心指标，并定义验收标准。',
      },
      {
        title: '资料与评分维度映射不足',
        severity: 'medium',
        evidence: '现有资料摘要未明确映射评分项与证据来源。',
        recommendation: '新增“评分项-证据”对照表，并绑定到关键文档段落。',
      },
    ]
    const reportTitle = 'AI 寻疑报告'
    const reportSummary = '识别到 2 个高优先级改进点，建议先补齐量化指标与评分映射。'
    return {
      mode,
      assistantReply: reportSummary,
      changeDrafts: [],
      issueDrafts,
      reportTitle,
      reportSummary,
      reportMarkdown: buildIssueMarkdown({
        title: reportTitle,
        summary: reportSummary,
        issues: issueDrafts,
      }),
    }
  }

  return {
    mode,
    assistantReply: '已基于当前项目配置与资料给出只读建议，不会修改项目数据。',
    changeDrafts: [],
    issueDrafts: [],
    reportTitle: '',
    reportSummary: '',
    reportMarkdown: '',
  }
}

function buildModePrompt(mode: WorkspaceAiMode): string {
  if (mode === 'dialog_ask') {
    return [
      '模式：对话询问（只读）。',
      '禁止产出任何可执行写入动作。',
      '仅根据上下文给出解释、建议、澄清与下一步方案。',
    ].join('\n')
  }

  if (mode === 'auto_optimize') {
    return [
      '模式：自动优化（先提案后审批）。',
      '你必须通过 propose_change 工具提交变更提案，禁止直接假设已执行。',
      '提案应最小化、可回滚、可审计。',
      '遇到删除/覆盖风险时必须将 destructive 设为 true 并在 summary 中说明影响范围。',
    ].join('\n')
  }

  if (mode === 'issue_discovery') {
    return [
      '模式：寻疑发现（自动扫描并产出问题清单）。',
      '你必须通过 report_issue 工具记录每个问题，至少 2 条。',
      '最终输出需要包含结构化问题与结论性摘要。',
      '可通过 set_issue_report 工具设置报告标题/摘要/Markdown。',
    ].join('\n')
  }

  if (mode === 'document_assist') {
    return [
      '模式：文档增强（只读生成，用户确认后才落文）。',
      '禁止产出任何可执行写入动作，也不要假设已经修改文档。',
      '仅输出适合直接插入 markdown 文档的结果正文，不要附加冗长说明。',
      '若是 summarize，则输出精炼摘要；若是 rewrite，则直接输出改写后的替代文本；若是 continue，则输出自然续写段落。',
    ].join('\n')
  }

  return '模式：答辩模拟。'
}

function buildPrompt(mode: WorkspaceAiMode, context: WorkspaceAiExecutionContext): string {
  if (mode === 'document_assist') {
    return [
      `当前模式：${mode}`,
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
      '请严格按动作返回可直接落入文档的正文内容。',
    ].join('\n')
  }

  const lines = [
    `当前模式：${mode}`,
    `竞赛：${context.contestName || '未选择'}`,
    `赛道：${context.trackName || '未选择'}`,
    `专业：${context.major || '未提供'}`,
    '',
    '请先调用 get_workspace_context 获取完整上下文，再决定是否调用联网工具。',
    '输出必须简洁、可执行、避免空话。',
    '',
    '用户最新输入：',
    context.latestUserMessage || '（无）',
  ]
  return lines.join('\n')
}

export async function executeWorkspaceAi(input: {
  runtime: WorkspaceAiRuntime
  mode: WorkspaceAiMode
  context: WorkspaceAiExecutionContext
  channelPrompt?: string
  hooks?: WorkspaceAiHooks
}): Promise<{
  data: WorkspaceAiExecutionResult
  fallbackUsed: boolean
  attempts: number
}> {
  const hooks = input.hooks || {}
  const fallback = buildFallbackResult(input.mode, input.context)
  const onlyFallback = input.runtime.ai.provider === 'mock' || !input.runtime.ai.apiKey

  if (onlyFallback) {
    for (const issue of fallback.issueDrafts)
      await hooks.onIssue?.(issue)
    for (const proposal of fallback.changeDrafts)
      await hooks.onProposal?.(proposal)
    for (const chunk of chunkText(fallback.assistantReply))
      await hooks.onDelta?.(chunk)
    return {
      data: fallback,
      fallbackUsed: true,
      attempts: 1,
    }
  }

  const contextSnapshot = buildContextSnapshot(input.context)
  const webEnabled = Boolean(input.runtime.adminAi.tavilyApiKey)
  const channelPrompt = toText(input.channelPrompt)

  const runOnce = async () => {
    await hooks.onProgress?.('调用 DeepAgent 处理中...')

    const changeDrafts: WorkspaceAiChangeDraft[] = []
    const issueDrafts: WorkspaceAiIssueDraft[] = []
    let reportTitle = 'AI 寻疑报告'
    let reportSummary = ''
    let reportMarkdown = ''

    const getWorkspaceContext = tool(
      async () => contextSnapshot,
      {
        name: 'get_workspace_context',
        description: '读取当前工作台上下文（项目配置、资料摘要、大纲与用户输入）。',
        schema: z.object({}),
      },
    )

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
        await hooks.onTool?.('web_search', {
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
        await hooks.onTool?.('fetch_web_page', { url, chars: text.length })
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

    const proposeChange = tool(
      async (payload: {
        changeType: AiProjectChangeType
        title: string
        summary: string
        destructive?: boolean
        payload?: Record<string, unknown>
      }) => {
        const proposal: WorkspaceAiChangeDraft = {
          changeType: payload.changeType,
          title: toText(payload.title) || 'AI 变更提案',
          summary: toText(payload.summary),
          destructive: Boolean(payload.destructive),
          payload: payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
            ? payload.payload
            : {},
        }
        changeDrafts.push(proposal)
        await hooks.onProposal?.(proposal)
        await hooks.onTool?.('propose_change', {
          changeType: proposal.changeType,
          destructive: proposal.destructive,
        })
        return JSON.stringify({ ok: true, proposalCount: changeDrafts.length })
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

    const reportIssue = tool(
      async (payload: {
        title: string
        severity: ProjectIssueSeverity
        evidence: string
        recommendation: string
      }) => {
        const issue: WorkspaceAiIssueDraft = {
          title: toText(payload.title) || '未命名问题',
          severity: toSeverity(payload.severity),
          evidence: toText(payload.evidence),
          recommendation: toText(payload.recommendation),
        }
        issueDrafts.push(issue)
        await hooks.onIssue?.(issue)
        await hooks.onTool?.('report_issue', {
          severity: issue.severity,
          count: issueDrafts.length,
        })
        return JSON.stringify({ ok: true, issueCount: issueDrafts.length })
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
      async (payload: { title?: string, summary?: string, markdown?: string }) => {
        reportTitle = toText(payload.title) || reportTitle
        reportSummary = toText(payload.summary) || reportSummary
        reportMarkdown = toText(payload.markdown) || reportMarkdown
        await hooks.onTool?.('set_issue_report', {
          hasTitle: Boolean(toText(payload.title)),
          hasSummary: Boolean(toText(payload.summary)),
          hasMarkdown: Boolean(toText(payload.markdown)),
        })
        return JSON.stringify({ ok: true })
      },
      {
        name: 'set_issue_report',
        description: '设置寻疑报告标题、摘要和 Markdown 正文。',
        schema: z.object({
          title: z.string().optional(),
          summary: z.string().optional(),
          markdown: z.string().optional(),
        }),
      },
    )

    const generateSceneFromText = tool(
      async ({ format, text }: { format: 'mermaid' | 'markdown_outline' | 'architecture', text: string }) => {
        const sceneDocument = format === 'mermaid'
          ? importFromMermaid(text)
          : format === 'markdown_outline'
            ? importFromMarkdownOutline(text)
            : importArchitectureFromMetadata(text).sceneDocument
        await hooks.onTool?.('generate_scene_from_text', {
          format,
          drawMode: sceneDocument.drawMode,
        })
        return serializeSceneDocument(sceneDocument)
      },
      {
        name: 'generate_scene_from_text',
        description: '把 Mermaid、Markdown 大纲或架构文本描述转成结构化 SceneDocument JSON。',
        schema: z.object({
          format: z.enum(['mermaid', 'markdown_outline', 'architecture']).default('mermaid'),
          text: z.string().min(2),
        }),
      },
    )

    const generateSchemaFromDdl = tool(
      async ({ ddl }: { ddl: string }) => {
        const result = importFromDDL(ddl)
        await hooks.onTool?.('generate_schema_from_ddl', {
          tables: result.schemaModel.tables.length,
          warnings: result.warnings.length,
        })
        return JSON.stringify(result)
      },
      {
        name: 'generate_schema_from_ddl',
        description: '把 SQL DDL 转成 SchemaModel 和对应 SceneDocument JSON。',
        schema: z.object({
          ddl: z.string().min(8),
        }),
      },
    )

    const generateArchitectureFromMetadata = tool(
      async ({ metadata }: { metadata: string }) => {
        const result = importArchitectureFromMetadata(metadata)
        await hooks.onTool?.('generate_architecture_from_metadata', {
          services: result.architectureModel.services.length,
          relations: result.architectureModel.relations.length,
        })
        return JSON.stringify(result)
      },
      {
        name: 'generate_architecture_from_metadata',
        description: '把 repo/config/依赖关系文本或 JSON 元数据转成 ArchitectureModel 与 SceneDocument。',
        schema: z.object({
          metadata: z.string().min(2),
        }),
      },
    )

    const generateArchitectureFromRepo = tool(
      async () => {
        const result = await scanRepoArchitecture()
        await hooks.onTool?.('generate_architecture_from_repo', {
          workspaceName: result.workspaceName,
          packageManifestCount: result.packageManifestCount,
          relations: result.architectureModel.relations.length,
        })
        return JSON.stringify(result)
      },
      {
        name: 'generate_architecture_from_repo',
        description: '扫描当前服务端工作区的 package.json / workspace manifests，生成 ArchitectureModel 与 SceneDocument。',
        schema: z.object({}),
      },
    )

    const exportSchemaToDdl = tool(
      async ({ sceneDocument }: { sceneDocument: string }) => {
        const ddl = exportSchemaModelToDDL(parseJsonValue(sceneDocument))
        await hooks.onTool?.('export_schema_to_ddl', {
          length: ddl.length,
        })
        return ddl
      },
      {
        name: 'export_schema_to_ddl',
        description: '把 SchemaModel 或 schema SceneDocument JSON 导出成 SQL DDL 文本。',
        schema: z.object({
          sceneDocument: z.string().min(2),
        }),
      },
    )

    const exportArchitectureToMermaid = tool(
      async ({ sceneDocument, view }: {
        sceneDocument: string
        view?: 'system_context' | 'container' | 'dependency_map'
      }) => {
        const mermaid = exportArchitectureModelToMermaid(parseJsonValue(sceneDocument), view || 'dependency_map')
        await hooks.onTool?.('export_architecture_to_mermaid', {
          length: mermaid.length,
          view: view || 'dependency_map',
        })
        return mermaid
      },
      {
        name: 'export_architecture_to_mermaid',
        description: '把 ArchitectureModel 或 architecture SceneDocument JSON 导出成 Mermaid flowchart 文本。',
        schema: z.object({
          sceneDocument: z.string().min(2),
          view: z.enum(['system_context', 'container', 'dependency_map']).optional(),
        }),
      },
    )

    const applyTemplateToScene = tool(
      async (payload: {
        sceneDocument: string
        templateKey: string
        title?: string
        subtitle?: string
        badge?: string
        imageSrc?: string
        deviceFramePresetKey?: string
        themeTokens?: Record<string, string>
      }) => {
        const sceneDocument = applySceneTemplate({
          sceneDocument: parseJsonValue(payload.sceneDocument),
          templateKey: payload.templateKey,
          title: payload.title,
          subtitle: payload.subtitle,
          badge: payload.badge,
          imageSrc: payload.imageSrc,
          deviceFramePresetKey: payload.deviceFramePresetKey,
          themeTokens: payload.themeTokens,
        })
        await hooks.onTool?.('apply_template', {
          templateKey: payload.templateKey,
          drawMode: sceneDocument.drawMode,
        })
        return serializeSceneDocument(sceneDocument)
      },
      {
        name: 'apply_template',
        description: '对 SceneDocument 应用模板、主题和设备边框参数，输出新的 SceneDocument JSON。',
        schema: z.object({
          sceneDocument: z.string().min(2),
          templateKey: z.string().min(2),
          title: z.string().optional(),
          subtitle: z.string().optional(),
          badge: z.string().optional(),
          imageSrc: z.string().optional(),
          deviceFramePresetKey: z.string().optional(),
          themeTokens: z.record(z.string(), z.string()).optional(),
        }),
      },
    )

    const relayoutScene = tool(
      async ({ sceneDocument }: { sceneDocument: string }) => {
        const nextDocument = relayoutSceneDocument(parseJsonValue(sceneDocument))
        await hooks.onTool?.('relayout_scene', {
          drawMode: nextDocument.drawMode,
          nodeCount: nextDocument.sceneModel.nodes.length,
        })
        return serializeSceneDocument(nextDocument)
      },
      {
        name: 'relayout_scene',
        description: '对已有 SceneDocument 重新布局，保持 canonical schema 不变。',
        schema: z.object({
          sceneDocument: z.string().min(2),
        }),
      },
    )

    const generateDeviceMockup = tool(
      async (payload: {
        title?: string
        subtitle?: string
        badge?: string
        imageSrc?: string
        templateKey?: string
        deviceFramePresetKey?: string
        themeTokens?: Record<string, string>
      }) => {
        const sceneDocument = buildDeviceMockupSceneDocument(payload)
        await hooks.onTool?.('generate_device_mockup', {
          templateKey: sceneDocument.templateKey,
          drawMode: sceneDocument.drawMode,
        })
        return serializeSceneDocument(sceneDocument)
      },
      {
        name: 'generate_device_mockup',
        description: '为截图生成带设备边框的 composition SceneDocument JSON。',
        schema: z.object({
          title: z.string().optional(),
          subtitle: z.string().optional(),
          badge: z.string().optional(),
          imageSrc: z.string().optional(),
          templateKey: z.string().optional(),
          deviceFramePresetKey: z.string().optional(),
          themeTokens: z.record(z.string(), z.string()).optional(),
        }),
      },
    )

    const exportSceneAsset = tool(
      async ({ sceneDocument, format }: { sceneDocument: string, format: 'svg' | 'png' | 'pdf' }) => {
        const normalizedDocument = sceneDocumentFromUnknown(parseJsonValue(sceneDocument))
        const artboard = normalizedDocument.sceneModel.artboards?.[0]
        const job = {
          id: `scene-export-${Date.now()}`,
          format,
          status: 'succeeded',
          width: artboard?.width || 1600,
          height: artboard?.height || 900,
          background: artboard?.background || '',
          templateKey: normalizedDocument.templateKey || '',
          drawMode: normalizedDocument.drawMode,
        }
        await hooks.onTool?.('export_scene_asset', job)
        return JSON.stringify({
          job,
          note: '当前工具返回导出任务元数据，真正的 SVG/PNG/PDF 由后续导出插件执行。',
        })
      },
      {
        name: 'export_scene_asset',
        description: '创建结构化导出任务描述，供后续导出插件消费，不直接返回原始 SVG/XML。',
        schema: z.object({
          sceneDocument: z.string().min(2),
          format: z.enum(['svg', 'png', 'pdf']),
        }),
      },
    )

    const tools: any[] = [
      getWorkspaceContext,
      webSearch,
      fetchWebPage,
      generateSceneFromText,
      generateSchemaFromDdl,
      generateArchitectureFromMetadata,
      generateArchitectureFromRepo,
      exportSchemaToDdl,
      exportArchitectureToMermaid,
      applyTemplateToScene,
      relayoutScene,
      generateDeviceMockup,
      exportSceneAsset,
    ]
    if (input.mode === 'auto_optimize')
      tools.push(proposeChange)
    if (input.mode === 'issue_discovery')
      tools.push(reportIssue, setIssueReport)

    const agent = createDeepAgent({
      model: createChatModel(input.runtime.ai),
      tools,
      systemPrompt: [
        '你是 Loopy，负责 Team 与项目上下文下的工作台问答与分析。',
        buildModePrompt(input.mode),
        channelPrompt ? `[场景提示词]\n${channelPrompt}` : '',
        '必须先获取上下文再作答，避免与上下文冲突。',
      ].filter(Boolean).join('\n'),
    })

    const response = await agent.invoke({
      messages: [{ role: 'user', content: buildPrompt(input.mode, input.context) }],
    })

    const assistantText = extractAssistantText(response)
    const finalReply = assistantText || fallback.assistantReply

    if (input.mode === 'issue_discovery') {
      if (!reportSummary)
        reportSummary = finalReply || '已完成项目扫描并输出问题建议。'
      if (!reportMarkdown)
        reportMarkdown = buildIssueMarkdown({ title: reportTitle, summary: reportSummary, issues: issueDrafts })
    }

    if (input.mode === 'auto_optimize' && changeDrafts.length === 0)
      changeDrafts.push(...fallback.changeDrafts)

    if (input.mode === 'issue_discovery' && issueDrafts.length === 0)
      issueDrafts.push(...fallback.issueDrafts)

    const result: WorkspaceAiExecutionResult = {
      mode: input.mode,
      assistantReply: finalReply,
      changeDrafts,
      issueDrafts,
      reportTitle,
      reportSummary,
      reportMarkdown,
    }

    for (const chunk of chunkText(result.assistantReply))
      await hooks.onDelta?.(chunk)
    return result
  }

  const executed = await runWithRetry<WorkspaceAiExecutionResult>({
    maxRetries: input.runtime.ai.maxRetries,
    run: runOnce,
    fallback: () => fallback,
  })

  return {
    data: executed.data,
    fallbackUsed: executed.fallbackUsed,
    attempts: executed.attempts,
  }
}
