import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const REVIEW_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-review-store.ts')
const REVIEW_RUNNER_FILE = resolve(process.cwd(), 'server/services/document/project-resource-review-runner.ts')
const REVIEW_CHAIN_FILE = resolve(process.cwd(), 'server/services/document/page-review.ts')
const REVIEW_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/review-jobs/index.post.ts')
const REVIEW_GET_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/review-jobs/[jobId].get.ts')
const PREVIEW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourcePreviewTab.vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')

it('pdf/ppt 页级审稿具备 job 与 finding 持久化模型', async () => {
  const [schema, store] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(REVIEW_STORE_FILE, 'utf8'),
  ])

  assert.match(schema, /CREATE TABLE IF NOT EXISTS project_resource_review_jobs/, '缺少页级审稿 job 表')
  assert.match(schema, /fallback_used BOOLEAN NOT NULL DEFAULT FALSE/, '审稿 job 未持久化 AI fallback 标记')
  assert.match(schema, /CREATE TABLE IF NOT EXISTS project_resource_review_findings/, '缺少页级审稿 finding 表')
  assert.match(schema, /source_block_ids JSONB/, 'finding 未持久化来源 block ids')
  assert.match(schema, /locator_json JSONB/, 'finding 未持久化页码与 locator')
  assert.match(store, /fallback_used: boolean/, 'review store 行类型缺少 fallback_used')
  assert.match(store, /fallbackUsed: Boolean\(row\.fallback_used\)/, 'review store 未把 fallback_used 映射到 job')
  assert.match(store, /replaceProjectResourceReviewFindings/, 'review store 缺少 finding 替换写入')
  assert.match(store, /getLatestProjectResourceReviewJob/, 'review store 缺少最新 job 查询')
})

it('pdf/ppt 页级审稿复用预览 PDF 与 document_analysis，并保证每页来源', async () => {
  const [runner, chain, api] = await Promise.all([
    readFile(REVIEW_RUNNER_FILE, 'utf8'),
    readFile(REVIEW_CHAIN_FILE, 'utf8'),
    readFile(REVIEW_API_FILE, 'utf8'),
  ])

  assert.match(runner, /getProjectResourcePreviewFileRef/, 'review runner 未复用项目预览 PDF')
  assert.match(runner, /analyzePdfBufferWithDocAi/, 'review runner 未在缺少 analysis 时解析 PDF')
  assert.match(runner, /updateProjectResourceDocumentAnalysis/, 'review runner 未回填 document analysis')
  assert.match(runner, /fallbackUsed: review\.fallbackUsed/, 'review runner 未持久化审稿链路 fallbackUsed')
  assert.match(chain, /sourceBlockIds/, '审稿链路未要求 sourceBlockIds')
  assert.match(chain, /quote/, '审稿链路未要求 quote')
  assert.match(chain, /coveredPages/, '审稿链路未补齐无意见页面')
  assert.match(chain, /fallbackFilledPageCount/, '审稿链路未统计 AI 漏页后的规则补齐页数')
  assert.match(chain, /fallbackUsed: fallbackFilledPageCount > 0/, '审稿链路未把部分页面规则补齐透出为 fallbackUsed')
  assert.match(api, /runProjectResourcePageReview/, '创建接口未运行页级审稿')
  assert.match(api, /fallbackUsed: job\.fallbackUsed/, '创建接口 meta 未按实际 job fallbackUsed 返回')
})

it('资源预览 UI 提供页级意见面板与来源跳页', async () => {
  const [previewTab, mainPanel, getApi] = await Promise.all([
    readFile(PREVIEW_TAB_FILE, 'utf8'),
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(REVIEW_GET_FILE, 'utf8'),
  ])

  assert.match(mainPanel, /:project-id="props\.activeProjectId"/, '主面板未向资源预览传递 projectId')
  assert.match(previewTab, /data-testid="workspace-resource-page-review-create"/, '资源预览缺少 AI 页审稿入口')
  assert.match(previewTab, /data-testid="workspace-resource-page-review-panel"/, '资源预览缺少页级意见面板')
  assert.match(previewTab, /reviewJob\?\.fallbackUsed/, '资源预览未显式展示规则回退审稿结果')
  assert.match(previewTab, /当前意见包含规则回退结果/, '资源预览未覆盖部分页面规则回退提示')
  assert.match(previewTab, /#page=\$\{page\}/, '资源预览未通过 PDF page anchor 定位来源页')
  assert.match(getApi, /getProjectResourceReviewJob/, '审稿详情接口未读取 job findings')
})
