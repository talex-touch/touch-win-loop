import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_STREAM_API_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')
const WORKSPACE_ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'internal/shared-types/domain-legacy.ts')

it('工作台对话会把当前打开项目显式注入 AI 上下文，并用项目级进度文案替代空泛会话提示', async () => {
  const [workspaceSource, streamSource, orchestratorSource, domainSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_API_FILE, 'utf8'),
    readFile(WORKSPACE_ORCHESTRATOR_FILE, 'utf8'),
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
  ])

  assert.match(domainSource, /projectTitle\?: string/, '工作台 AI 请求类型缺少 projectTitle 上下文字段')
  assert.match(domainSource, /export interface AiWorkflowDefinitionPayload/, '内部共享类型缺少 AI workflow 定义契约')
  assert.match(domainSource, /export interface AiWorkflowToolRef[\s\S]*key: string/, '内部共享类型缺少 AI workflow 工具 key 契约')
  assert.match(workspaceSource, /projectTitle: headerProjectName\.value/, '项目页未把当前打开项目名写入 AI 请求上下文')
  assert.match(streamSource, /projectTitle: toText\(context\.projectTitle\)/, '工作台流式接口未标准化 projectTitle')
  assert.match(streamSource, /return `正在读取当前项目「\$\{projectTitle \|\| '未命名项目'\}」的上下文\.\.\.`/, '工作台流式接口仍未使用项目级上下文提示文案')
  assert.match(streamSource, /projectTitle: request\.context\?\.projectTitle \|\| ''/, '工作台流式接口未把 projectTitle 继续传入编排器上下文')
  assert.match(orchestratorSource, /projectTitle: string/, '工作台编排器上下文缺少 projectTitle 字段')
  assert.match(orchestratorSource, /projectTitle: context\.projectTitle,/, '工作台上下文快照未包含 projectTitle')
  assert.match(orchestratorSource, /`当前项目：\$\{context\.projectTitle \|\| '未命名项目'\}`/, '工作台主提示词未显式注入当前项目名')
  assert.match(orchestratorSource, /document_assist 必须先调用 get_workspace_context 读取项目设置、大纲、知识索引与 citation\/warning/, 'AgentDoc 未强制读取真实知识索引上下文')
  assert.match(orchestratorSource, /如果上下文提示 degraded、fallback、索引未完成或规则回退/, 'AgentDoc 未要求显式暴露降级上下文')
})
