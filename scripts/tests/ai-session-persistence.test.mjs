import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DB_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const CHAT_STORE_FILE = resolve(process.cwd(), 'server/utils/chat-store.ts')
const SESSION_CONTEXT_STORE_FILE = resolve(process.cwd(), 'server/utils/chat-session-context-store.ts')
const TEAM_MESSAGES_GET_FILE = resolve(process.cwd(), 'server/api/teams/[id]/chat/sessions/[sessionId]/messages/index.get.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')
const WORKSPACE_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const ADMIN_RUN_FILE = resolve(process.cwd(), 'server/api/admin/ai/run.post.ts')
const ADMIN_STREAM_FILE = resolve(process.cwd(), 'server/api/admin/ai/stream.post.ts')
const DEEPAGENT_FACTORY_FILE = resolve(process.cwd(), 'server/services/ai/deepagent-factory.ts')
const WORKSPACE_ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')
const ADMIN_ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/admin-ai/orchestrator.ts')

describe('ai session persistence', () => {
  it('Schema 已补齐 session context、checkpoint 与 deepagent store 三张表', async () => {
    const source = await readFile(DB_FILE, 'utf8')

    assert.match(source, /CREATE TABLE IF NOT EXISTS ai_chat_session_context \(/, '缺少 ai_chat_session_context 表')
    assert.match(source, /CREATE TABLE IF NOT EXISTS ai_deepagent_checkpoints \(/, '缺少 ai_deepagent_checkpoints 表')
    assert.match(source, /CREATE TABLE IF NOT EXISTS ai_deepagent_store_items \(/, '缺少 ai_deepagent_store_items 表')
    assert.match(source, /idx_ai_chat_session_context_resume/, 'ai_chat_session_context 缺少 resume 索引')
    assert.match(source, /idx_ai_deepagent_checkpoints_thread_updated/, 'ai_deepagent_checkpoints 缺少线程维度索引')
    assert.match(source, /idx_ai_deepagent_store_items_namespace/, 'ai_deepagent_store_items 缺少 namespace 索引')
  })

  it('session context store 负责 snapshot + runState 归一化与 upsert', async () => {
    const source = await readFile(SESSION_CONTEXT_STORE_FILE, 'utf8')

    assert.match(source, /export function normalizeAiChatSessionContextSnapshot/, 'session context store 未暴露 context snapshot 归一化工具')
    assert.match(source, /export function normalizeAiChatSessionRunState/, 'session context store 未暴露 run state 归一化工具')
    assert.match(source, /export async function getAiChatSessionContext/, 'session context store 未提供读取接口')
    assert.match(source, /export async function upsertAiChatSessionContext/, 'session context store 未提供 upsert 接口')
    assert.match(source, /run_state_json/, 'session context store 未持久化 run_state_json')
    assert.match(source, /last_checkpoint_ref/, 'session context store 未持久化 last_checkpoint_ref')
  })

  it('chat-store 与 Team 消息接口会回传 contextSnapshot + runState', async () => {
    const [chatStoreSource, messagesGetSource] = await Promise.all([
      readFile(CHAT_STORE_FILE, 'utf8'),
      readFile(TEAM_MESSAGES_GET_FILE, 'utf8'),
    ])

    assert.match(chatStoreSource, /LEFT JOIN ai_chat_session_context c/, 'chat-store 未关联 ai_chat_session_context')
    assert.match(chatStoreSource, /has_context_snapshot/, 'chat-store 未映射 hasContextSnapshot')
    assert.match(chatStoreSource, /resume_available/, 'chat-store 未映射 resumeAvailable')
    assert.match(chatStoreSource, /degraded/, 'chat-store 未映射 degraded 状态')

    assert.match(messagesGetSource, /getAiChatSessionContext\(db,\s*\{[\s\S]*sessionId,[\s\S]*\}\)/, 'Team 消息读取接口未加载 session context')
    assert.match(messagesGetSource, /contextSnapshot:\s*\(contextRecord\?\.contextSnapshot \|\| null\)/, 'Team 消息读取接口未返回 contextSnapshot')
    assert.match(messagesGetSource, /runState:\s*\(contextRecord\?\.runState \|\| \{[\s\S]*status:\s*'idle',[\s\S]*resumeAvailable:\s*false,[\s\S]*\}\)/, 'Team 消息读取接口未返回 runState')
  })

  it('workspace 流式主链会持久化 running/completed/interrupted/failed 四类 runState', async () => {
    const source = await readFile(WORKSPACE_STREAM_FILE, 'utf8')

    assert.match(source, /await upsertAiChatSessionContext\(db,\s*\{[\s\S]*status: 'running'/, 'workspace 流接口未在执行开始时写入 running runState')
    assert.match(source, /await upsertAiChatSessionContext\(db,\s*\{[\s\S]*status: 'completed'[\s\S]*lastCheckpointRef: execution\.data\.checkpointRef/, 'workspace 流接口未在完成时写入 checkpointRef')
    assert.match(source, /status: 'interrupted'/, 'workspace 流接口未在中断时写入 interrupted 状态')
    assert.match(source, /status: 'failed'/, 'workspace 流接口未在失败时写入 failed 状态')
    assert.match(source, /checkpointRef: execution\.data\.checkpointRef \|\| ''/, 'workspace assistant metadata 未写入 checkpointRef')
    assert.match(source, /degradedReason: execution\.data\.degradedReason \|\| ''/, 'workspace assistant metadata 未写入 degradedReason')
  })

  it('项目页会恢复 session snapshot，并继续使用 runState 驱动会话恢复', async () => {
    const source = await readFile(WORKSPACE_PAGE_FILE, 'utf8')

    assert.match(source, /const activeChatSessionContextSnapshot = ref<AiChatSessionContextSnapshot \| null>\(null\)/, '项目页未缓存 context snapshot')
    assert.match(source, /const activeChatSessionRunState = ref<AiChatSessionRunState \| null>\(null\)/, '项目页未缓存 runState')
    assert.match(source, /async function restoreChatSessionContextSnapshot\(/, '项目页缺少 session snapshot 恢复函数')
    assert.match(source, /await restoreChatSessionContextSnapshot\(data\.contextSnapshot\)/, '项目页加载消息后未恢复 snapshot')
    assert.match(source, /activeChatSessionRunState\.value = data\.runState \|\| null/, '项目页加载消息后未写入 runState')
  })

  it('DeepAgent 已统一切到 Postgres 持久化工厂，并禁止写链路假恢复', async () => {
    const [factorySource, workspaceSource, adminSource, adminRunSource, adminStreamSource] = await Promise.all([
      readFile(DEEPAGENT_FACTORY_FILE, 'utf8'),
      readFile(WORKSPACE_ORCHESTRATOR_FILE, 'utf8'),
      readFile(ADMIN_ORCHESTRATOR_FILE, 'utf8'),
      readFile(ADMIN_RUN_FILE, 'utf8'),
      readFile(ADMIN_STREAM_FILE, 'utf8'),
    ])

    assert.match(factorySource, /class PostgresCheckpointSaver extends BaseCheckpointSaver/, 'DeepAgent 工厂缺少 Postgres checkpointer')
    assert.match(factorySource, /class PostgresStore extends BaseStoreClass/, 'DeepAgent 工厂缺少 Postgres store')
    assert.match(factorySource, /export function buildDeepAgentThreadBinding/, 'DeepAgent 工厂缺少统一 thread binding')
    assert.match(factorySource, /export function createPersistedDeepAgent/, 'DeepAgent 工厂缺少统一 createPersistedDeepAgent 入口')

    assert.match(workspaceSource, /resolveLatestDeepAgentCheckpointRef\(threadBinding\)/, '工作台 orchestrator 未探测 checkpoint 可恢复性')
    assert.match(workspaceSource, /createPersistedDeepAgent\(/, '工作台 orchestrator 未接入持久化 DeepAgent 工厂')
    assert.match(workspaceSource, /DEEPAGENT_PERSISTENCE_REQUIRED:/, '工作台写链路未在持久化不可用时硬失败')
    assert.match(workspaceSource, /degradedReason = 'DEEPAGENT_PERSISTENCE_UNAVAILABLE'/, '工作台只读链路未显式标记 persistence degraded')

    assert.match(adminSource, /createPersistedDeepAgent\(/, '管理端 Agent 未复用持久化 DeepAgent 工厂')
    assert.match(adminSource, /buildDeepAgentThreadBinding\(/, '管理端 Agent 未使用统一 thread key 绑定')
    assert.match(adminRunSource, /await upsertAiChatSessionContext\(db,\s*\{[\s\S]*status: 'running'/, '管理端 run 接口未持久化 running runState')
    assert.match(adminRunSource, /status: 'completed'/, '管理端 run 接口未持久化 completed runState')
    assert.match(adminRunSource, /status: 'failed'/, '管理端 run 接口未持久化 failed runState')
    assert.match(adminStreamSource, /await upsertAiChatSessionContext\(db,\s*\{[\s\S]*status: 'running'/, '管理端 stream 接口未持久化 running runState')
    assert.match(adminStreamSource, /status: 'completed'/, '管理端 stream 接口未持久化 completed runState')
    assert.match(adminStreamSource, /status: 'failed'/, '管理端 stream 接口未持久化 failed runState')
  })
})
