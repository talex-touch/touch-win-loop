import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-04-21-project-export-jobs.sql')
const STORE_FILE = resolve(process.cwd(), 'server/utils/project-export-store.ts')
const JOB_SERVICE_FILE = resolve(process.cwd(), 'server/services/project/project-contest-export-job.ts')
const LIST_ROUTE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/exports/jobs.get.ts')
const RETRY_ROUTE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/exports/jobs/[jobId]/retry.post.ts')
const CREATE_ROUTE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/exports/contest-bundle.post.ts')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')

it('竞赛导出任务层已补齐任务状态、重试链路与右栏入口', async () => {
  const [
    typesSource,
    schemaSource,
    migrationSource,
    storeSource,
    serviceSource,
    listRouteSource,
    retryRouteSource,
    createRouteSource,
    workspaceSource,
    sidebarSource,
  ] = await Promise.all([
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(MIGRATION_FILE, 'utf8'),
    readFile(STORE_FILE, 'utf8'),
    readFile(JOB_SERVICE_FILE, 'utf8'),
    readFile(LIST_ROUTE_FILE, 'utf8'),
    readFile(RETRY_ROUTE_FILE, 'utf8'),
    readFile(CREATE_ROUTE_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(typesSource, /export type ProjectExportJobStatus = 'queued' \| 'processing' \| 'succeeded' \| 'failed'/, '共享类型缺少导出任务状态')
  assert.match(typesSource, /export interface ProjectExportJob \{[\s\S]*profileId\?: string \| null[\s\S]*trigger: ProjectExportJobTrigger[\s\S]*status: ProjectExportJobStatus[\s\S]*manifest\?: ProjectExportBundleManifest \| null[\s\S]*artifacts: ProjectExportArtifact\[\][\s\S]*\}/, '共享类型缺少导出任务结构')
  assert.match(typesSource, /export interface ProjectExportJobDiagnostics \{[\s\S]*processingCount: number[\s\S]*failedCount: number[\s\S]*lastSuccessAt\?: string \| null[\s\S]*\}/, '共享类型缺少导出诊断结构')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_export_jobs \(/, 'bootstrap schema 未创建 project_export_jobs 表')
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS project_export_jobs \(/, '缺少 project_export_jobs 迁移脚本')
  assert.match(storeSource, /export async function createProjectExportJob\(/, '导出任务 store 缺少创建任务入口')
  assert.match(storeSource, /export async function finishProjectExportJobSuccess\(/, '导出任务 store 缺少成功收尾入口')
  assert.match(storeSource, /export async function finishProjectExportJobFailure\(/, '导出任务 store 缺少失败收尾入口')
  assert.match(storeSource, /export async function listProjectExportJobs\(/, '导出任务 store 缺少列表入口')
  assert.match(serviceSource, /export async function runProjectContestExportJob\(/, '导出服务缺少带任务状态的执行入口')
  assert.match(serviceSource, /createProjectExportJob\(/, '导出执行服务未写入导出任务')
  assert.match(serviceSource, /finishProjectExportJobSuccess\(/, '导出执行服务未在成功时落任务结果')
  assert.match(serviceSource, /finishProjectExportJobFailure\(/, '导出执行服务未在失败时回写错误')
  assert.match(listRouteSource, /resolveProjectExportProfiles\(/, '导出任务列表接口未返回 profile 列表')
  assert.match(listRouteSource, /listProjectExportJobs\(/, '导出任务列表接口未返回任务列表')
  assert.match(retryRouteSource, /runProjectContestExportJob\(/, '导出重试接口未复用统一任务执行服务')
  assert.match(createRouteSource, /runProjectContestExportJob\(/, '竞赛导出接口未接入任务执行服务')
  assert.match(workspaceSource, /const projectExportProfiles = ref<ProjectExportProfile\[\]>\(\[\]\)/, '项目页缺少导出 profile 状态')
  assert.match(workspaceSource, /async function loadProjectExportJobs\(projectId = activeProjectId\.value\)/, '项目页缺少导出任务加载入口')
  assert.match(workspaceSource, /async function runContestBundleExport\(\)/, '项目页缺少竞赛导出执行入口')
  assert.match(workspaceSource, /async function retryContestBundleExport\(jobId: string\)/, '项目页缺少竞赛导出重试入口')
  assert.match(workspaceSource, /:contest-export-profiles="projectExportProfiles"/, '项目页未向右栏透传导出 profile')
  assert.match(workspaceSource, /@run-contest-bundle-export="runContestBundleExport"/, '项目页未接收右栏导出动作')
  assert.match(workspaceSource, /@retry-contest-bundle-export="retryContestBundleExport"/, '项目页未接收右栏重试动作')
  assert.match(sidebarSource, /return props\.workbenchMode === 'final_review'[\s\S]*props\.contestExportProfiles\.length > 0[\s\S]*props\.contestExportJobs\.length > 0/, '右栏竞赛导出面板未限定在终审工作台')
  assert.match(sidebarSource, /data-testid="workspace-contest-export-panel"/, '右栏缺少竞赛导出面板锚点')
  assert.match(sidebarSource, /最近导出任务/, '右栏缺少最近导出任务区块')
  assert.match(sidebarSource, /emit\('runContestBundleExport'\)/, '右栏缺少发起竞赛导出事件')
  assert.match(sidebarSource, /emit\('retryContestBundleExport', jobId\)/, '右栏缺少导出任务重试事件')
})
