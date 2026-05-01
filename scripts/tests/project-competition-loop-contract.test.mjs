import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('Project Competition Loop 主链合同', () => {
  it('声明统一主链类型与兼容型数据结构', async () => {
    const [typeSource, schemaSource, migrationSource] = await Promise.all([
      readSource('shared/types/project-competition-loop.ts'),
      readSource('server/database/bootstrap/schema.ts'),
      readSource('scripts/migrations/2026-05-01-project-competition-loop.sql'),
    ])

    for (const symbol of [
      'ProjectCompetitionLoopPayload',
      'ProjectCompetitionLoopRiskSignal',
      'ProjectCompetitionLoopTask',
      'ProjectCompetitionLoopDashboardSummary',
      'ProjectCompetitionLoopDigest',
    ])
      assert.match(typeSource, new RegExp(`export interface ${symbol}`), `主链共享类型缺少 ${symbol}`)

    for (const table of [
      'project_competition_loop_snapshots',
      'project_risk_signals',
      'project_tasks',
    ]) {
      assert.match(schemaSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `bootstrap schema 缺少 ${table}`)
      assert.match(migrationSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `迁移脚本缺少 ${table}`)
    }

    assert.match(schemaSource, /idx_project_risk_signals_source_unique/, '风险信号缺少幂等来源索引')
    assert.match(schemaSource, /idx_project_tasks_source_unique/, '项目任务缺少幂等来源索引')
    assert.match(migrationSource, /status IN \('empty', 'ready', 'attention', 'blocked'\)/, '主链快照缺少状态约束')
  })

  it('服务端主链聚合赛事、知识库、AI issue、风险和任务', async () => {
    const storeSource = await readSource('server/utils/project-competition-loop-store.ts')

    assert.match(storeSource, /export async function buildProjectCompetitionLoop\(/, '缺少主链聚合入口')
    assert.match(storeSource, /export async function getVisibleProjectCompetitionLoop\(/, '缺少带权限的主链读取入口')
    assert.match(storeSource, /export async function listProjectCompetitionLoopDigests\(/, '缺少看板用主链摘要入口')
    assert.match(storeSource, /getContestDetail/, '主链未接入赛事详情')
    assert.match(storeSource, /buildProjectKnowledgeIndexDashboard/, '主链未接入知识库 dashboard')
    assert.match(storeSource, /listProjectIssuesByProject/, '主链未接入 AI 寻疑 issue')
    assert.match(storeSource, /function deriveRiskDrafts/, '主链未生成结构化风险信号')
    assert.match(storeSource, /async function upsertRisks/, '主链未落库风险信号')
    assert.match(storeSource, /async function upsertTasks/, '主链未落库联动任务')
    assert.match(storeSource, /async function persistSnapshot/, '主链未持久化分析快照')
  })

  it('提供项目主链接口和刷新接口', async () => {
    const [getApiSource, refreshApiSource, composableSource] = await Promise.all([
      readSource('server/api/projects/[id]/competition-loop.get.ts'),
      readSource('server/api/projects/[id]/competition-loop/refresh.post.ts'),
      readSource('app/composables/useProjectCompetitionLoop.ts'),
    ])

    assert.match(getApiSource, /getVisibleProjectCompetitionLoop/, 'GET 接口未读取主链')
    assert.match(getApiSource, /syncKnowledge:\s*false/, 'GET 接口不应触发知识库刷新')
    assert.match(getApiSource, /persist:\s*false/, 'GET 接口不应写入快照')
    assert.match(refreshApiSource, /withTransaction/, '刷新接口应在事务中写风险、任务和快照')
    assert.match(refreshApiSource, /syncKnowledge:\s*true/, '刷新接口应触发知识库来源同步')
    assert.match(refreshApiSource, /persist:\s*true/, '刷新接口应持久化主链快照')
    assert.match(composableSource, /competition-loop/, '前端 composable 未接入主链接口')
    assert.match(composableSource, /competition-loop\/refresh/, '前端 composable 未接入主链刷新接口')
  })

  it('dashboard、analytics 和 AI 分析读取同一主链事实源', async () => {
    const [dashboardApiSource, analyticsStoreSource, projectChatSource, workspaceStreamSource] = await Promise.all([
      readSource('server/api/dashboard/overview.get.ts'),
      readSource('server/utils/analytics-store.ts'),
      readSource('server/api/ai/project-chat.post.ts'),
      readSource('server/api/ai/workspace/stream.post.ts'),
    ])

    assert.match(dashboardApiSource, /listProjectCompetitionLoopDigests/, 'Dashboard overview 未读取主链摘要')
    assert.match(dashboardApiSource, /主链 ready|主链待办/, 'Dashboard overview 未展示主链状态口径')
    assert.match(analyticsStoreSource, /listProjectCompetitionLoopDigests/, 'analytics 未读取主链摘要')
    assert.match(analyticsStoreSource, /loopDigestCount/, 'analytics data gaps 未识别主链缺口')
    assert.match(analyticsStoreSource, /主链闭环/, '能力画像未纳入主链闭环指标')
    assert.match(projectChatSource, /summarizeCompetitionLoop/, '项目 AI 对话未注入主链上下文')
    assert.match(workspaceStreamSource, /summarizeCompetitionLoop/, '工作台 AI 流未注入主链上下文')
    assert.match(workspaceStreamSource, /mode === 'issue_discovery'[\s\S]*persist:\s*true/, 'AI 寻疑完成后未刷新风险任务主链')
  })
})
