import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const CHAT_STORE_FILE = resolve(process.cwd(), 'server/utils/chat-store.ts')
const TEAM_SESSIONS_GET_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/index.get.ts')
const TEAM_SESSIONS_POST_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/index.post.ts')
const TEAM_MESSAGES_GET_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.get.ts')
const WORKSPACE_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

it('ai_chat_sessions 表包含 project_id 与 mode 字段', async () => {
  const source = await readFile(DB_FILE, 'utf8')
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS ai_chat_sessions \([\s\S]*project_id TEXT NOT NULL DEFAULT ''[\s\S]*mode TEXT NOT NULL DEFAULT 'dialog_ask'/,
    'ai_chat_sessions 缺少 project_id/mode 字段定义，无法实现 project+mode 作用域隔离',
  )
})

it('chat-store 支持按 project_id + mode 严格过滤会话', async () => {
  const source = await readFile(CHAT_STORE_FILE, 'utf8')
  assert.match(
    source,
    /listAiChatSessionsByWorkspace[\s\S]*projectId\?: string[\s\S]*mode\?: WorkspaceAiMode[\s\S]*strictScope\?: boolean/,
    'listAiChatSessionsByWorkspace 未暴露 projectId/mode/strictScope 入参',
  )
  assert.match(
    source,
    /where\.push\(`s\.project_id = \$\$\{values\.length\}`\)[\s\S]*where\.push\(`s\.mode = \$\$\{values\.length\}`\)/,
    'chat-store 查询缺少 project_id + mode 条件',
  )
})

it('Team 会话 API 强制 projectId 与 mode 参数', async () => {
  const getSource = await readFile(TEAM_SESSIONS_GET_FILE, 'utf8')
  const postSource = await readFile(TEAM_SESSIONS_POST_FILE, 'utf8')

  assert.match(
    getSource,
    /if \(!workspaceId \|\| !projectId \|\| !mode\)/,
    'Team 会话列表接口未强制 projectId/mode',
  )
  assert.match(
    postSource,
    /if \(!workspaceId \|\| !projectId \|\| !mode\)/,
    'Team 创建会话接口未强制 projectId/mode',
  )
})

it('Team 消息读取接口按 projectId + mode 做严格校验', async () => {
  const source = await readFile(TEAM_MESSAGES_GET_FILE, 'utf8')
  assert.match(
    source,
    /getAiChatSessionById\([\s\S]*projectId,[\s\S]*mode,[\s\S]*strictScope: true/,
    'Team 消息读取接口未使用 strictScope 进行作用域校验',
  )
  assert.match(
    source,
    /listAiChatMessagesBySession\([\s\S]*projectId,[\s\S]*mode,[\s\S]*strictScope: true/,
    'Team 消息读取接口未按 projectId/mode 过滤消息',
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
