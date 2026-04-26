import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  createBuiltinProjectResourceWorkflowTemplate,
  normalizeAiWorkflowDefinitionPayload,
} from '../../server/services/ai/intelligence-workflow-definition.ts'

const DB_SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-04-22-intelligence-workflow-v1.sql')
const STORE_FILE = resolve(process.cwd(), 'server/utils/project-intelligence-workflow-store.ts')
const ENGINE_FILE = resolve(process.cwd(), 'server/services/ai/intelligence-workflow-engine.ts')
const TOOL_REGISTRY_FILE = resolve(process.cwd(), 'server/services/ai/intelligence-tool-registry.ts')
const LOOPY_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataTab.vue')
const LOOPY_WORKFLOWS_VIEW_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLoopyDataWorkflowsView.vue')
const WORKFLOW_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useProjectIntelligenceWorkflows.ts')
const WORKFLOWS_INDEX_GET_FILE = resolve(process.cwd(), 'server/api/projects/[id]/intelligence/workflows/index.get.ts')
const WORKFLOWS_INDEX_POST_FILE = resolve(process.cwd(), 'server/api/projects/[id]/intelligence/workflows/index.post.ts')
const WORKFLOW_RUN_POST_FILE = resolve(process.cwd(), 'server/api/projects/[id]/intelligence/workflows/[workflowId]/run.post.ts')
const WORKFLOW_CONTINUE_POST_FILE = resolve(process.cwd(), 'server/api/projects/[id]/intelligence/workflow-runs/[runId]/continue.post.ts')

describe('intelligence workflow v1', () => {
  it('schema 与显式迁移已补齐 workflow definition/run/run step 三张表', async () => {
    const [schemaSource, migrationSource] = await Promise.all([
      readFile(DB_SCHEMA_FILE, 'utf8'),
      readFile(MIGRATION_FILE, 'utf8'),
    ])

    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS ai_workflow_definitions \(/, 'bootstrap schema 缺少 ai_workflow_definitions 表')
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS ai_workflow_runs \(/, 'bootstrap schema 缺少 ai_workflow_runs 表')
    assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS ai_workflow_run_steps \(/, 'bootstrap schema 缺少 ai_workflow_run_steps 表')
    assert.match(schemaSource, /idx_ai_workflow_runs_project_status_updated/, 'bootstrap schema 缺少 run 状态索引')
    assert.match(schemaSource, /idx_ai_workflow_run_steps_run_status/, 'bootstrap schema 缺少 step 状态索引')

    assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS ai_workflow_definitions \(/, '迁移脚本缺少 ai_workflow_definitions 表')
    assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS ai_workflow_runs \(/, '迁移脚本缺少 ai_workflow_runs 表')
    assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS ai_workflow_run_steps \(/, '迁移脚本缺少 ai_workflow_run_steps 表')
    assert.match(migrationSource, /ai_workflow_runs_status_check/, '迁移脚本缺少 run 状态约束回填')
    assert.match(migrationSource, /ai_workflow_run_steps_status_check/, '迁移脚本缺少 step 状态约束回填')
  })

  it('definition 归一化与内置模板符合 v1 线性 workflow 约束', () => {
    const normalized = normalizeAiWorkflowDefinitionPayload({
      name: '资源整理',
      trigger: { type: 'resource.batch' },
      contextSources: ['project.settings', 'resource.selection'],
      steps: [
        {
          type: 'prompt',
          prompt: '先整理目标',
        },
        {
          type: 'agent',
          prompt: '输出分组与缺口',
        },
      ],
    })

    assert.equal(normalized.name, '资源整理')
    assert.equal(normalized.trigger.type, 'resource.batch')
    assert.equal(normalized.steps.length, 2)
    assert.equal(normalized.steps[0].type, 'prompt')
    assert.equal(normalized.steps[1].type, 'agent')
    assert.ok(normalized.steps.every(step => step.id), '归一化后每个 step 都应补齐 id')

    const template = createBuiltinProjectResourceWorkflowTemplate()
    assert.equal(template.key, 'organize_project_resources')
    assert.equal(template.trigger.type, 'resource.batch')
    assert.ok(template.contextSources.includes('resource.selection'))
    assert.equal(template.steps.some(step => step.type === 'agent'), true)
  })

  it('工具桥、执行引擎、项目内 API 与 Loopy 工作台入口都已接通', async () => {
    const [
      storeSource,
      engineSource,
      toolRegistrySource,
      loopyTabSource,
      loopyWorkflowsSource,
      workflowComposableSource,
      workflowsIndexGetSource,
      workflowsIndexPostSource,
      workflowRunPostSource,
      workflowContinuePostSource,
    ] = await Promise.all([
      readFile(STORE_FILE, 'utf8'),
      readFile(ENGINE_FILE, 'utf8'),
      readFile(TOOL_REGISTRY_FILE, 'utf8'),
      readFile(LOOPY_TAB_FILE, 'utf8'),
      readFile(LOOPY_WORKFLOWS_VIEW_FILE, 'utf8'),
      readFile(WORKFLOW_COMPOSABLE_FILE, 'utf8'),
      readFile(WORKFLOWS_INDEX_GET_FILE, 'utf8'),
      readFile(WORKFLOWS_INDEX_POST_FILE, 'utf8'),
      readFile(WORKFLOW_RUN_POST_FILE, 'utf8'),
      readFile(WORKFLOW_CONTINUE_POST_FILE, 'utf8'),
    ])

    assert.match(toolRegistrySource, /key: 'context\.get_workspace_context'/, '缺少 context.get_workspace_context 工具')
    assert.match(toolRegistrySource, /key: 'project\.propose_change'/, '缺少 project.propose_change 工具')
    assert.match(toolRegistrySource, /key: 'provider\.feishu_bitable_run'/, '缺少 provider.feishu_bitable_run 工具')

    assert.match(storeSource, /export async function saveAiWorkflowDefinition\(/, 'workflow store 缺少保存定义入口')
    assert.match(storeSource, /export async function createAiWorkflowRun\(/, 'workflow store 缺少创建 run 入口')
    assert.match(storeSource, /export async function saveAiWorkflowRunStep\(/, 'workflow store 缺少 step 持久化入口')

    assert.match(engineSource, /export async function executeIntelligenceWorkflow\(/, 'workflow engine 缺少执行入口')
    assert.match(engineSource, /export async function continueIntelligenceWorkflow\(/, 'workflow engine 缺少继续入口')
    assert.match(engineSource, /status: 'needs_review'/, 'workflow engine 未处理 needs_review 暂停状态')

    assert.match(workflowsIndexGetSource, /listBuiltinWorkflowTemplates\(\)/, 'workflows list API 未返回 builtin templates')
    assert.match(workflowsIndexPostSource, /saveAiWorkflowDefinition/, 'workflows save API 未接入 store')
    assert.match(workflowsIndexPostSource, /function normalizeRecord/, 'workflows save API 未窄化请求体结构')
    assert.match(workflowsIndexPostSource, /resolveProjectWorkspaceId\(project\)/, 'workflows save API 未兜底解析项目 workspaceId')
    assert.match(workflowRunPostSource, /executeIntelligenceWorkflow\(/, 'workflow run API 未接入执行引擎')
    assert.match(workflowRunPostSource, /const \{ runtime \} = await readEffectiveRuntimeSettings\(event\)/, 'workflow run API 未等待有效 AI runtime')
    assert.match(workflowContinuePostSource, /continueIntelligenceWorkflow\(/, 'workflow continue API 未接入继续引擎')
    assert.match(workflowContinuePostSource, /const \{ runtime \} = await readEffectiveRuntimeSettings\(event\)/, 'workflow continue API 未等待有效 AI runtime')

    assert.match(loopyTabSource, /id: 'workflows'/, 'Loopy 数据 tab 未新增 workflows 子视图')
    assert.match(loopyWorkflowsSource, /项目级智能工作流/, '缺少项目内 workflow 面板文案')
    assert.match(loopyWorkflowsSource, /continueRun\(run\.id\)/, '工作流面板未暴露 continue 入口')
    assert.match(loopyWorkflowsSource, /change\.destructive/, '工作流面板未展示破坏性变更风险')
    assert.match(loopyWorkflowsSource, /workflowChangeSecondConfirmIds/, '工作流面板未维护破坏性变更二次确认状态')
    assert.match(loopyWorkflowsSource, /approveWorkflowChange\(change\)/, '工作流面板未通过本地状态机审批变更')
    assert.match(loopyWorkflowsSource, /workflowDeleteSecondConfirmId/, '工作流面板未维护删除二次确认状态')
    assert.match(loopyWorkflowsSource, /deleteSelectedWorkflow\(selectedWorkflow\)/, '工作流面板未通过本地状态机删除工作流')
    assert.doesNotMatch(workflowComposableSource, /destructiveConfirm:\s*true/, '工作流审批 composable 不应自动确认破坏性变更')
    assert.match(workflowComposableSource, /destructiveConfirm:\s*Boolean\(options\.destructiveConfirm\)/, '工作流审批 composable 未把破坏性确认交给调用方显式传入')
  })
})
