import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')

it('工作台 AI 为三种主模式声明独立 profile，并按 profile 收敛工具白名单', async () => {
  const source = await readFile(ORCHESTRATOR_FILE, 'utf8')

  assert.match(source, /const WORKSPACE_AGENT_PROFILES: Record<WorkspaceSupportedMode, WorkspaceAgentProfile> = \{/, '工作台 orchestrator 缺少模式 profile 定义')
  assert.match(source, /dialog_ask:\s*\{[\s\S]*allowWebAccess:\s*true/, '对话询问 profile 未保留按需联网能力')
  assert.match(source, /auto_optimize:\s*\{[\s\S]*allowWebAccess:\s*false[\s\S]*maxProposals:\s*MAX_AUTO_OPTIMIZE_PROPOSALS/, '自动优化 profile 未关闭联网或未声明提案上限')
  assert.match(source, /issue_discovery:\s*\{[\s\S]*allowWebAccess:\s*false[\s\S]*scanDimensions:\s*ISSUE_SCAN_DIMENSIONS/, '寻疑发现 profile 未关闭联网或未绑定固定扫描维度')
  assert.match(source, /if \(profile\.allowWebAccess\) \{[\s\S]*tools\.push\(webSearch, fetchWebPage\)/, '工作台工具集未按 profile 控制联网工具')
  assert.match(source, /if \(profile\.mode === 'auto_optimize'\)\s+tools\.push\(createWorkspaceProposalTool\(input, state, profile\)\)/, '自动优化模式未切到专用提案工具集')
  assert.match(source, /if \(profile\.mode === 'issue_discovery'\) \{[\s\S]*createWorkspaceIssueTools\(input, state\)/, '寻疑发现模式未切到专用 issue 工具集')
})

it('工作台 AI 将最近多轮用户/助手消息透传给 agent，并把模式说明注入最后一条用户消息', async () => {
  const [orchestratorSource, streamSource] = await Promise.all([
    readFile(ORCHESTRATOR_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_FILE, 'utf8'),
  ])

  assert.match(orchestratorSource, /const MAX_WORKSPACE_AGENT_MESSAGES = 10/, '工作台 orchestrator 未限制最近多轮消息窗口')
  assert.match(orchestratorSource, /\.filter\(message => isConversationRole\(message\.role\)\)/, '工作台 orchestrator 未过滤到 user\/assistant 历史消息')
  assert.match(orchestratorSource, /\.slice\(-MAX_WORKSPACE_AGENT_MESSAGES\)/, '工作台 orchestrator 未裁剪最近消息窗口')
  assert.match(orchestratorSource, /const lastUserMessageIndex = \[\.\.\.normalizedMessages\.keys\(\)\]\.reverse\(\)\.find\(index => normalizedMessages\[index\]\?\.role === 'user'\)/, '工作台 orchestrator 未定位最后一条用户消息')
  assert.match(orchestratorSource, /'\[工作台上下文要求\]'/, '工作台 orchestrator 未把模式说明注入最后一条用户消息')
  assert.match(orchestratorSource, /messages: buildWorkspaceConversationMessages\(profile\.mode, input\.context, input\.messages\)/, '工作台 orchestrator 未使用最近多轮消息驱动 agent')
  assert.match(streamSource, /messages: request\.messages \|\| \[\],/, 'workspace 流接口未把请求消息透传给 orchestrator')
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
  const source = await readFile(ORCHESTRATOR_FILE, 'utf8')

  assert.match(source, /const ISSUE_SCAN_DIMENSIONS = \['评分映射', '证据链', '量化指标', '资料完整度'\]/, '寻疑发现缺少固定扫描维度')
  assert.match(source, /function createWorkspaceIssueFingerprint\(issue: WorkspaceAiIssueDraft\): string \{/, '寻疑发现缺少 issue 去重指纹')
  assert.match(source, /if \(state\.issueFingerprints\.has\(issueFingerprint\)\)\s+return \{ ok: false, reason: 'DUPLICATE_ISSUE' \}/, '寻疑发现未拦截重复 issue')
  assert.match(source, /if \(!issue\.evidence\)\s+return \{ ok: false, reason: 'EVIDENCE_REQUIRED' \}/, '寻疑发现未校验证据必填')
  assert.match(source, /if \(!issue\.recommendation\)\s+return \{ ok: false, reason: 'RECOMMENDATION_REQUIRED' \}/, '寻疑发现未校验建议必填')
  assert.match(source, /reportMarkdown: buildIssueMarkdown\(\{[\s\S]*issues: state\.issueDrafts,[\s\S]*\}\)/, '寻疑发现未由服务端统一生成 Markdown 报告')
  assert.doesNotMatch(source, /markdown: z\.string\(\)\.optional\(\)/, 'set_issue_report 仍允许模型直接写 Markdown')
  assert.match(source, /report_issue_rejected/, '寻疑发现缺少 issue 拒绝审计事件')
})
