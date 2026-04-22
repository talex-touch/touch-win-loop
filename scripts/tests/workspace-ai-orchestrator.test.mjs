import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')
const AGENT_STREAM_HELPER_FILE = resolve(process.cwd(), 'server/services/ai/workspace-agent-stream.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')

it('工作台 AI 为四种主模式声明独立 profile，并按 profile 收敛工具白名单', async () => {
  const source = await readFile(ORCHESTRATOR_FILE, 'utf8')

  assert.match(source, /const WORKSPACE_AGENT_PROFILES: Record<WorkspaceSupportedMode, WorkspaceAgentProfile> = \{/, '工作台 orchestrator 缺少模式 profile 定义')
  assert.match(source, /dialog_ask:\s*\{[\s\S]*allowWebAccess:\s*true/, '对话询问 profile 未保留按需联网能力')
  assert.match(source, /auto_optimize:\s*\{[\s\S]*allowWebAccess:\s*false[\s\S]*maxProposals:\s*MAX_AUTO_OPTIMIZE_PROPOSALS/, '自动优化 profile 未关闭联网或未声明提案上限')
  assert.match(source, /issue_discovery:\s*\{[\s\S]*allowWebAccess:\s*false[\s\S]*scanDimensions:\s*ISSUE_SCAN_DIMENSIONS/, '寻疑发现 profile 未关闭联网或未绑定固定扫描维度')
  assert.match(source, /contextual_agent:\s*\{[\s\S]*allowWebAccess:\s*false[\s\S]*progressMessage:\s*'AI 正在处理当前上下文\.\.\.'/, 'contextual_agent profile 未声明独立上下文协作模式')
  assert.match(source, /if \(profile\.allowWebAccess\) \{[\s\S]*tools\.push\(webSearch, fetchWebPage\)/, '工作台工具集未按 profile 控制联网工具')
  assert.match(source, /if \(profile\.mode === 'auto_optimize'\)\s+tools\.push\(createWorkspaceProposalTool\(input, state, profile\)\)/, '自动优化模式未切到专用提案工具集')
  assert.match(source, /if \(profile\.mode === 'issue_discovery'\) \{[\s\S]*createWorkspaceIssueTools\(input, state\)/, '寻疑发现模式未切到专用 issue 工具集')
})

it('agentproto 在 contextual_agent 下同时支持 workflow 与 freeform 场景草案工具', async () => {
  const [orchestratorSource, streamSource] = await Promise.all([
    readFile(ORCHESTRATOR_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_FILE, 'utf8'),
  ])

  assert.match(streamSource, /contextualAssistantKey:\s*toText\(context\.contextualAssistantKey\)\s+as\s+WorkspaceContextualAssistantKey \| '',/, 'workspace 流接口未透传 contextualAssistantKey')
  assert.match(streamSource, /interactionIntent:\s*normalizeInteractionIntent\(context\.interactionIntent\),/, 'workspace 流接口未透传 contextual interactionIntent')
  assert.match(streamSource, /actionSource:\s*normalizeActionSource\(context\.actionSource\),/, 'workspace 流接口未透传 contextual actionSource')
  assert.match(streamSource, /requestedAgentAction:\s*toText\(context\.requestedAgentAction\)\s+as\s+WorkflowDraftAction \| undefined,/, 'workspace 流接口未透传 requestedAgentAction')
  assert.match(streamSource, /workflowSnapshot: context\.workflowSnapshot \|\| null,/, 'workspace 流接口未透传 workflowSnapshot')
  assert.match(streamSource, /sceneHash:\s*toText\(context\.sceneHash\),/, 'workspace 流接口未透传 sceneHash')
  assert.match(streamSource, /sceneSourceText:\s*toText\(context\.sceneSourceText\),/, 'workspace 流接口未透传 sceneSourceText')
  assert.match(streamSource, /sceneTemplate:\s*toText\(context\.sceneTemplate\)(?:\s+as\s+AiCanvasAssistTemplate\s*\|\s*undefined)?,/, 'workspace 流接口未透传 sceneTemplate')
  assert.match(streamSource, /workflowAction:\s*toText\(context\.workflowAction\)(?:\s+as\s+WorkflowDraftAction\s*\|\s*undefined)?,/, 'workspace 流接口未透传 workflowAction')
  assert.match(streamSource, /workflowTemplate:\s*toText\(context\.workflowTemplate\)(?:\s+as\s+AiCanvasAssistTemplate\s*\|\s*undefined)?,/, 'workspace 流接口未透传 workflowTemplate')
  assert.match(orchestratorSource, /workflowSnapshot: context\.workflowSnapshot,/, 'orchestrator 未将 workflowSnapshot 纳入上下文快照')
  assert.match(orchestratorSource, /contextualAssistantKey: context\.contextualAssistantKey,/, 'orchestrator 未将 contextualAssistantKey 纳入上下文快照')
  assert.match(orchestratorSource, /sceneHash: context\.sceneHash,/, 'orchestrator 未将 sceneHash 纳入上下文快照')
  assert.match(orchestratorSource, /function createWorkspaceWorkflowDraftTool\(/, 'orchestrator 缺少 workflow draft 工具')
  assert.match(orchestratorSource, /function createWorkspaceSceneDraftTool\(/, 'orchestrator 缺少 scene draft 工具')
  assert.match(orchestratorSource, /function isExplicitWorkflowDraftRequest\(message: string\): boolean \{/, 'orchestrator 缺少显式制图意图识别')
  assert.match(orchestratorSource, /function isStandaloneWorkflowTopicRequest\(message: string\): boolean \{/, 'orchestrator 缺少独立流程图主题识别')
  assert.match(orchestratorSource, /name: 'propose_workflow_draft'/, 'workflow draft 工具未以 propose_workflow_draft 暴露')
  assert.match(orchestratorSource, /name: 'propose_scene_draft'/, 'scene draft 工具未以 propose_scene_draft 暴露')
  assert.match(orchestratorSource, /if \(profile\.mode === 'contextual_agent'\) \{[\s\S]*if \(isAgentProtoWorkflowContext\(input\.context\) && shouldExposeAgentProtoDraftTools\(input\.context\)\)\s+tools\.push\(createWorkspaceWorkflowDraftTool\(input, state\)\)[\s\S]*if \(isAgentProtoSceneContext\(input\.context\) && shouldExposeAgentProtoDraftTools\(input\.context\)\)\s+tools\.push\(createWorkspaceSceneDraftTool\(input, state\)\)/, 'AgentProto 草案工具未限制在 contextual_agent + 明确动作意图')
  assert.doesNotMatch(orchestratorSource, /profile\.mode === 'dialog_ask' && isAgentProtoWorkflowContext/, 'dialog_ask 仍暴露 AgentProto 草案工具')
  assert.match(orchestratorSource, /当前这轮命中明确制图意图：优先生成 workflow 草案，不要停留在项目上下文复述。/, 'orchestrator 未提升显式制图意图优先级')
  assert.match(orchestratorSource, /当前这轮更像独立示例\/模板流程图请求：内容主题以用户输入为准，当前项目资料只用于默认布局和样式，不要把项目内容硬套进图里。/, 'orchestrator 未为独立流程图主题降权项目上下文')
  assert.match(orchestratorSource, /const standaloneWorkflowTopicRequest = action === 'generate' && isStandaloneWorkflowTopicRequest\(input\.context\.latestUserMessage\)/, 'workflow draft 工具未识别独立主题生成请求')
  assert.match(orchestratorSource, /const consumed = await consumeWorkspaceAgentStream\(/, 'orchestrator 未复用独立 stream 结果归并逻辑')
  assert.match(streamSource, /workflowDraft: execution\.data\.data\.workflowDraft \|\| null,/, 'workspace 流接口未继续透传 workflowDraft')
  assert.match(streamSource, /sceneDraft: execution\.data\.data\.sceneDraft \|\| null,/, 'workspace 流接口未继续透传 sceneDraft')
})

it('工作台 AI 将最近多轮用户/助手消息透传给 agent，并把模式说明注入最后一条用户消息', async () => {
  const [orchestratorSource, streamSource] = await Promise.all([
    readFile(ORCHESTRATOR_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_FILE, 'utf8'),
  ])

  assert.match(orchestratorSource, /const MAX_WORKSPACE_AGENT_MESSAGES = 10/, '工作台 orchestrator 未限制最近多轮消息窗口')
  assert.match(orchestratorSource, /\.filter\(\(message\): message is ChatMessage & \{ role: WorkspaceConversationRole \} => isConversationRole\(message\.role\)\)/, '工作台 orchestrator 未过滤到 user\/assistant 历史消息')
  assert.match(orchestratorSource, /\.slice\(-MAX_WORKSPACE_AGENT_MESSAGES\)/, '工作台 orchestrator 未裁剪最近消息窗口')
  assert.match(orchestratorSource, /const lastUserMessageIndex = \[\.\.\.normalizedMessages\.keys\(\)\]\.reverse\(\)\.find\(index => normalizedMessages\[index\]\?\.role === 'user'\)/, '工作台 orchestrator 未定位最后一条用户消息')
  assert.match(orchestratorSource, /'\[工作台上下文要求\]'/, '工作台 orchestrator 未把模式说明注入最后一条用户消息')
  assert.match(orchestratorSource, /messages: buildWorkspaceConversationMessages\(profile\.mode, input\.context, input\.messages\)(?:\s+as\s+any)?/, '工作台 orchestrator 未使用最近多轮消息驱动 agent')
  assert.match(streamSource, /messages: request\.messages \|\| \[\],/, 'workspace 流接口未把请求消息透传给 orchestrator')
})

it('文档增强会按 documentAction 映射到独立平台 AI 场景', async () => {
  const streamSource = await readFile(WORKSPACE_STREAM_FILE, 'utf8')

  assert.match(streamSource, /function resolveDocumentAssistChannelKey\(action: unknown\): 'workspace_document_summarize' \| 'workspace_document_rewrite' \| 'workspace_document_continue' \| 'workspace_document_expand' \| 'workspace_document_complete_context' \| 'workspace_document_restructure' \{/, 'workspace 流接口缺少文档动作到 channel 的映射')
  assert.match(streamSource, /if \(normalized === 'rewrite'\)\s+return 'workspace_document_rewrite'/, '文档润写未映射到 workspace_document_rewrite')
  assert.match(streamSource, /if \(normalized === 'expand'\)\s+return 'workspace_document_expand'/, '文档扩写未映射到 workspace_document_expand')
  assert.match(streamSource, /if \(normalized === 'complete_context'\)\s+return 'workspace_document_complete_context'/, '文档补全上下文未映射到 workspace_document_complete_context')
  assert.match(streamSource, /if \(normalized === 'restructure'\)\s+return 'workspace_document_restructure'/, '文档结构整理未映射到 workspace_document_restructure')
  assert.match(streamSource, /const channelKey = request\.mode === 'document_assist'[\s\S]*\? resolveDocumentAssistExecutionChannelKey\(runtime, request\.context\?\.documentAction\)[\s\S]*: resolveWorkspaceChannelKey\(request\.mode \|\| 'dialog_ask', request\.context\?\.documentAction\)/, 'workspace 流接口未按 documentAction 解析场景 key')
})

it('自动优化提案按审批链 payload 规则校验，并限制单次提案数量', async () => {
  const source = await readFile(ORCHESTRATOR_FILE, 'utf8')

  assert.match(source, /const CHANGE_PAYLOAD_RULES: Record<AiProjectChangeType, ChangePayloadRule> = \{/, '工作台 orchestrator 缺少审批链 payload 规则表')
  assert.match(source, /adaptation_patch:\s*\{[\s\S]*requiredKeys:\s*\['contestId'\]/, 'adaptation_patch 未强制要求 contestId')
  assert.match(source, /resource_bind_library:\s*\{[\s\S]*requiredKeys:\s*\['resourceId'\]/, 'resource_bind_library 未强制要求 resourceId')
  assert.match(source, /resource_update_metadata:\s*\{[\s\S]*requiredKeys:\s*\['resourceId'\][\s\S]*changeKeys:\s*\['title', 'summary', 'category', 'availability'\]/, 'resource_update_metadata 未限制可变更字段')
  assert.match(source, /if \(state\.changeDrafts\.length >= \(profile\.maxProposals \|\| MAX_AUTO_OPTIMIZE_PROPOSALS\)\)/, '自动优化未限制单次提案数量')
  assert.match(source, /PAYLOAD_EMPTY_OR_UNKNOWN/, '自动优化缺少空 payload 或未知字段拦截')
  assert.match(source, /NO_MUTABLE_FIELDS/, '自动优化缺少无实际变更字段拦截')
  assert.match(source, /propose_change_rejected/, '自动优化缺少提案拒绝审计事件')
})

it('寻疑发现对 issue 做必填校验、去重，并由服务端统一生成 Markdown 报告', async () => {
  const [source, helperSource] = await Promise.all([
    readFile(ORCHESTRATOR_FILE, 'utf8'),
    readFile(AGENT_STREAM_HELPER_FILE, 'utf8'),
  ])

  assert.match(source, /const ISSUE_SCAN_DIMENSIONS = \['评分映射', '证据链', '量化指标', '资料完整度'\]/, '寻疑发现缺少固定扫描维度')
  assert.match(source, /function createWorkspaceIssueFingerprint\(issue: WorkspaceAiIssueDraft\): string \{/, '寻疑发现缺少 issue 去重指纹')
  assert.match(source, /if \(state\.issueFingerprints\.has\(issueFingerprint\)\)\s+return \{ ok: false, reason: 'DUPLICATE_ISSUE' \}/, '寻疑发现未拦截重复 issue')
  assert.match(source, /if \(!issue\.evidence\)\s+return \{ ok: false, reason: 'EVIDENCE_REQUIRED' \}/, '寻疑发现未校验证据必填')
  assert.match(source, /if \(!issue\.recommendation\)\s+return \{ ok: false, reason: 'RECOMMENDATION_REQUIRED' \}/, '寻疑发现未校验建议必填')
  assert.match(helperSource, /function buildIssueMarkdown\(input: \{[\s\S]*issues: WorkspaceAiIssueDraft\[\][\s\S]*\}\): string \{/, 'stream helper 未提供统一 Markdown 报告生成器')
  assert.match(helperSource, /reportMarkdown: buildIssueMarkdown\(\{[\s\S]*issues: state\.issueDrafts,[\s\S]*\}\)/, '寻疑发现未由服务端统一生成 Markdown 报告')
  assert.doesNotMatch(source, /markdown: z\.string\(\)\.optional\(\)/, 'set_issue_report 仍允许模型直接写 Markdown')
  assert.match(source, /report_issue_rejected/, '寻疑发现缺少 issue 拒绝审计事件')
})

it('工作台 AI 正文改为消费 agent.streamEvents 真流式，并在可见输出后停止内部重试', async () => {
  const [orchestratorSource, helperSource, streamSource] = await Promise.all([
    readFile(ORCHESTRATOR_FILE, 'utf8'),
    readFile(AGENT_STREAM_HELPER_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_FILE, 'utf8'),
  ])

  assert.match(helperSource, /export function extractWorkspaceStreamTextChunk\(chunk: unknown\): string \{/, '工作台 stream helper 缺少模型 chunk 文本提取工具')
  assert.match(helperSource, /export function extractWorkspaceLangGraphOutputMessages\(output: unknown\): Array<Record<string, unknown>> \{/, '工作台 stream helper 缺少 LangGraph output messages 提取工具')
  assert.match(helperSource, /export async function consumeWorkspaceAgentStream\(/, '工作台 stream helper 缺少可复用的 stream 消费逻辑')
  assert.match(helperSource, /if \(eventType === 'on_chat_model_stream'\) \{[\s\S]*extractWorkspaceStreamTextChunk\(event\.data\?\.chunk\)/, '工作台 stream helper 未消费 on_chat_model_stream 文本 chunk')
  assert.match(helperSource, /if \(eventType === 'on_chain_end' && toText\(event\.name\) === 'LangGraph'\) \{[\s\S]*extractWorkspaceLangGraphOutputMessages\(event\.data\?\.output\)/, '工作台 stream helper 未从 LangGraph 收尾 output 提取最终 messages')
  assert.match(orchestratorSource, /from '~~\/server\/services\/ai\/workspace-agent-stream'/, '工作台 orchestrator 未复用独立 stream helper')
  assert.match(orchestratorSource, /const consumed = await consumeWorkspaceAgentStream\(/, '工作台 orchestrator 未复用独立 stream 消费逻辑')
  assert.match(orchestratorSource, /const stream = agent\.streamEvents\(\{[\s\S]*messages: buildWorkspaceConversationMessages\(profile\.mode, input\.context, input\.messages\)(?:\s+as\s+any)?,[\s\S]*\}, \{[\s\S]*version: 'v2',[\s\S]*signal: input\.signal,[\s\S]*\}\)/, '工作台 orchestrator 未切到 agent.streamEvents + signal')
  assert.match(orchestratorSource, /shouldRetryOnError: \(\{ error \}\) => !hasVisibleExecutionOutput && !isAbortError\(error\)/, '工作台 orchestrator 未在可见输出后停止内部重试')
  assert.doesNotMatch(orchestratorSource, /agent\.invoke\(/, '工作台 orchestrator 仍在使用 agent.invoke 伪流式')
  assert.doesNotMatch(orchestratorSource, /chunkText\(/, '工作台 orchestrator 仍在使用 chunkText 伪流式切片')
  assert.match(streamSource, /const abortController = new AbortController\(\)/, 'workspace 流接口缺少服务端 AbortController')
  assert.match(streamSource, /stream\.onClosed\(\(\) => \{[\s\S]*abortController\.abort\(\)/, 'workspace 流接口未在连接关闭时中断后端执行')
  assert.match(streamSource, /shouldContinueOnError: \(\) => !hasVisibleExecutionOutput && !abortController\.signal\.aborted/, 'workspace 流接口未限制可见输出后的 fallback')
  assert.match(streamSource, /onProposal: \(\) => markVisibleExecutionOutput\(\)/, 'workspace 流接口未在 proposal 阶段标记可见执行边界')
  assert.match(streamSource, /onIssue: \(\) => markVisibleExecutionOutput\(\)/, 'workspace 流接口未在 issue 阶段标记可见执行边界')
  assert.match(streamSource, /signal: abortController\.signal,/, 'workspace 流接口未把 abort signal 透传给 orchestrator')
})
