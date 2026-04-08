import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const CHAT_STORE_FILE = resolve(process.cwd(), 'server/utils/chat-store.ts')
const TEAM_SESSIONS_GET_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/index.get.ts')
const TEAM_SESSIONS_POST_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/index.post.ts')
const TEAM_MESSAGES_GET_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.get.ts')
const TEAM_MESSAGES_POST_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.post.ts')
const WORKSPACE_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const ADMIN_AGENT_PANEL_FILE = resolve(process.cwd(), 'app/components/admin/AdminAgentPanel.vue')

it('ai_chat_sessions 表包含 project_id 与 mode 字段', async () => {
  const source = await readFile(DB_FILE, 'utf8')
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS ai_chat_sessions \([\s\S]*project_id TEXT NOT NULL DEFAULT ''[\s\S]*mode TEXT NOT NULL DEFAULT 'dialog_ask'/,
    'ai_chat_sessions 缺少 project_id/mode 字段定义，无法实现 project+mode 作用域隔离',
  )
})

it('chat-store 支持按 project_id + mode 严格过滤会话，并为 workspace 级 dialog_ask 放开空 projectId', async () => {
  const source = await readFile(CHAT_STORE_FILE, 'utf8')
  assert.match(
    source,
    /listAiChatSessionsByWorkspace[\s\S]*projectId\?: string[\s\S]*mode\?: WorkspaceAiMode[\s\S]*strictScope\?: boolean/,
    'listAiChatSessionsByWorkspace 未暴露 projectId/mode/strictScope 入参',
  )
  assert.match(
    source,
    /if \(normalizedMode === 'dialog_ask'\)\s+return true/,
    'strictScope 未允许 dialog_ask 在空 projectId 下继续使用',
  )
  assert.match(
    source,
    /const hasProjectFilter = input\.projectId !== undefined/,
    'chat-store 未保留空 projectId 的严格过滤能力',
  )
  assert.match(
    source,
    /where\.push\(`s\.project_id = \$\$\{values\.length\}`\)[\s\S]*where\.push\(`s\.mode = \$\$\{values\.length\}`\)/,
    'chat-store 查询缺少 project_id + mode 条件',
  )
})

it('team 会话 API 允许 dialog_ask 省略 projectId，其它模式仍强制 projectId', async () => {
  const getSource = await readFile(TEAM_SESSIONS_GET_FILE, 'utf8')
  const postSource = await readFile(TEAM_SESSIONS_POST_FILE, 'utf8')

  assert.match(
    getSource,
    /if \(!workspaceId \|\| !mode \|\| \(mode !== 'dialog_ask' && !projectId\)\)/,
    'Team 会话列表接口未放行 workspace 级 dialog_ask 或未保留其它模式的 projectId 校验',
  )
  assert.match(
    postSource,
    /if \(!workspaceId \|\| !mode \|\| \(mode !== 'dialog_ask' && !projectId\)\)/,
    'Team 创建会话接口未放行 workspace 级 dialog_ask 或未保留其它模式的 projectId 校验',
  )
})

it('team 消息接口对 dialog_ask 放行空 projectId，并继续使用 strictScope 做作用域校验', async () => {
  const getSource = await readFile(TEAM_MESSAGES_GET_FILE, 'utf8')
  const postSource = await readFile(TEAM_MESSAGES_POST_FILE, 'utf8')

  assert.match(
    getSource,
    /if \(!workspaceId \|\| !sessionId \|\| !mode \|\| \(mode !== 'dialog_ask' && !projectId\)\)/,
    'Team 消息读取接口未放行 workspace 级 dialog_ask 或未保留其它模式的 projectId 校验',
  )
  assert.match(
    postSource,
    /if \(!workspaceId \|\| !sessionId \|\| !mode \|\| !content \|\| \(mode !== 'dialog_ask' && !projectId\)\)/,
    'Team 消息写入接口未放行 workspace 级 dialog_ask 或未保留其它模式的 projectId 校验',
  )
  assert.match(
    getSource,
    /getAiChatSessionById\([\s\S]*projectId,[\s\S]*mode,[\s\S]*strictScope: true/,
    'Team 消息读取接口未使用 strictScope 进行作用域校验',
  )
  assert.match(
    getSource,
    /listAiChatMessagesBySession\([\s\S]*projectId,[\s\S]*mode,[\s\S]*strictScope: true/,
    'Team 消息读取接口未按 projectId/mode 过滤消息',
  )
  assert.match(
    postSource,
    /getAiChatSessionById\([\s\S]*projectId,[\s\S]*mode,[\s\S]*strictScope: true/,
    'Team 消息写入接口未按 strictScope 校验会话作用域',
  )
})

it('项目页会话请求携带 projectId + mode 并在切模式时重载会话', async () => {
  const source = await readFile(WORKSPACE_PAGE_FILE, 'utf8')
  assert.match(
    source,
    /endpoint\(`\/teams\/\$\{activeWorkspaceId\.value\}\/chat\/sessions`\),[\s\S]*query: \{[\s\S]*projectId,[\s\S]*mode: aiMode\.value/,
    '项目页会话列表请求未携带 projectId + mode',
  )
  assert.match(
    source,
    /watch\(aiMode,[\s\S]*await loadChatSessions\(\)/,
    '项目页切换模式后未重载会话作用域',
  )
})

it('管理端 Agent 面板改用 Team 会话接口并带 projectId + mode', async () => {
  const source = await readFile(ADMIN_AGENT_PANEL_FILE, 'utf8')
  assert.match(
    source,
    /endpoint\(`\/teams\/\$\{props\.workspaceId\}\/chat\/sessions`\),[\s\S]*projectId:[\s\S]*mode:/,
    'AdminAgentPanel 会话列表未切换到 Team 接口或缺少 projectId/mode',
  )
  assert.match(
    source,
    /endpoint\(`\/teams\/\$\{props\.workspaceId\}\/chat\/sessions\/\$\{sessionId\}\/messages`\),[\s\S]*projectId:[\s\S]*mode:/,
    'AdminAgentPanel 消息接口未切换到 Team 接口或缺少 projectId/mode',
  )
})
