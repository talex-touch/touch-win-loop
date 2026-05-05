import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const API_FILES = [
  'server/api/admin/operations/overview.get.ts',
  'server/api/admin/operations/users.get.ts',
  'server/api/admin/operations/content.get.ts',
  'server/api/admin/operations/revenue.get.ts',
  'server/api/admin/operations/efficiency.get.ts',
  'server/api/admin/operations/meeting-runtime.get.ts',
  'server/api/admin/operations/risks.get.ts',
  'server/api/admin/operations/ai-analysis.get.ts',
  'server/api/admin/operations/ai-analysis/run.post.ts',
  'server/api/admin/operations/reports/schema.get.ts',
  'server/api/admin/operations/reports/query.post.ts',
  'server/api/admin/operations/reports/export.post.ts',
]

const STORE_FILE = resolve(process.cwd(), 'server/utils/admin-operations-store.ts')
const EXPORT_FILE = resolve(process.cwd(), 'server/api/admin/operations/reports/export.post.ts')
const MEETING_RUNTIME_FILE = resolve(process.cwd(), 'server/services/meeting/runtime-monitoring.ts')
const AI_ANALYSIS_SERVICE_FILE = resolve(process.cwd(), 'server/services/admin-operations-ai-analysis.ts')
const PLATFORM_AI_CHANNELS_FILE = resolve(process.cwd(), 'server/utils/platform-ai-channels.ts')

it('admin operations API 全量路由均复用鉴权和 contest.read_internal 权限门槛', async () => {
  for (const relativePath of API_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.match(source, /requireAuth/, `${relativePath} 未复用 requireAuth`)
    assert.match(source, /checkPlatformPermission/, `${relativePath} 未复用平台权限校验`)
    assert.match(source, /contest\.read_internal/, `${relativePath} 未校验 contest.read_internal`)
  }
})

it('报表导出接口返回 CSV 附件，并支持 PDF 预览/导出', async () => {
  const source = await readFile(EXPORT_FILE, 'utf8')
  const storeSource = await readFile(STORE_FILE, 'utf8')
  assert.match(source, /exportAdminOperationsReportCsv/, '报表导出接口未接入 CSV 导出实现')
  assert.match(source, /exportAdminOperationsReportPdf/, '报表导出接口未接入 PDF 导出实现')
  assert.match(source, /format = String\(query\.format/, '报表导出接口未按 query format 区分导出格式')
  assert.match(source, /application\/pdf/, '报表导出接口未设置 PDF Content-Type')
  assert.match(source, /\$\{disposition\}; filename="\$\{exported\.fileName\}"/, '报表导出接口未支持 inline PDF 预览')
  assert.match(source, /text\/csv; charset=utf-8/, '报表导出接口未设置 CSV Content-Type')
  assert.match(source, /Content-Disposition/, '报表导出接口未设置下载文件名')
  assert.match(storeSource, /generateProjectExportPdfBuffer/, '运营报表 PDF 未复用现有 PDF 生成器')
  assert.match(storeSource, /export async function exportAdminOperationsReportPdf/, 'store 未导出运营报表 PDF 生成函数')
})

it('admin operations store 固化核心风险阈值与报表数据集', async () => {
  const source = await readFile(STORE_FILE, 'utf8')
  assert.match(source, /PREVIEW_SUCCESS_RATE_RISK_THRESHOLD = 95/, 'store 未固化文档预览成功率阈值 95%')
  assert.match(source, /PREVIEW_QUEUE_MINUTES_RISK_THRESHOLD = 30/, 'store 未固化文档预览排队阈值 30 分钟')
  assert.match(source, /GOVERNANCE_BACKLOG_RISK_THRESHOLD = 30/, 'store 未固化治理积压阈值')
  assert.match(source, /key: 'users'/, '报表 schema 缺少 users 数据集')
  assert.match(source, /key: 'content'/, '报表 schema 缺少 content 数据集')
  assert.match(source, /key: 'revenue'/, '报表 schema 缺少 revenue 数据集')
  assert.match(source, /key: 'efficiency'/, '报表 schema 缺少 efficiency 数据集')
  assert.match(source, /key: 'risks'/, '报表 schema 缺少 risks 数据集')
  assert.match(source, /COALESCE\(MAX\(queue\.queued_count\), 0\)::INTEGER AS queued_count/, '预览队列统计未对 queued_count 执行聚合，overview 查询会触发 GROUP BY 错误')
  assert.match(source, /COALESCE\(MAX\(queue\.processing_count\), 0\)::INTEGER AS processing_count/, '预览队列统计未对 processing_count 执行聚合')
  assert.match(source, /COALESCE\(MAX\(queue\.oldest_queued_minutes\), 0\)::DOUBLE PRECISION AS oldest_queued_minutes/, '预览队列统计未对 oldest_queued_minutes 执行聚合')
})

it('会议运行时监控只通过 Prometheus 聚合，不直连 SSH 或 Docker socket', async () => {
  const source = await readFile(MEETING_RUNTIME_FILE, 'utf8')
  assert.match(source, /\/api\/v1\/query/, '会议监控未通过 Prometheus query API 聚合')
  assert.match(source, /\/api\/v1\/targets/, '会议监控未读取 Prometheus targets 健康状态')
  assert.doesNotMatch(source, /\bssh\b/, '会议监控不应执行 SSH')
  assert.doesNotMatch(source, /docker\.sock|docker stats|child_process|exec\(/, '会议监控不应直连 Docker 或执行命令')
})

it('运营 AI 分析使用专属 channel、8h 缓存和失败兜底', async () => {
  const serviceSource = await readFile(AI_ANALYSIS_SERVICE_FILE, 'utf8')
  const channelSource = await readFile(PLATFORM_AI_CHANNELS_FILE, 'utf8')

  assert.match(serviceSource, /ADMIN_OPERATIONS_AI_ANALYSIS_CHANNEL = 'admin_operations_analysis'/, '运营 AI 分析未使用专属 channel')
  assert.match(serviceSource, /ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS = 8 \* 60 \* 60 \* 1000/, '运营 AI 分析未固化 8h 过期策略')
  assert.match(serviceSource, /getAdminOperationsOverview/, '运营 AI 分析未读取 overview 快照')
  assert.match(serviceSource, /getAdminOperationsEfficiency/, '运营 AI 分析未读取 efficiency 快照')
  assert.match(serviceSource, /getAdminOperationsRisks/, '运营 AI 分析未读取 risks 快照')
  assert.match(serviceSource, /buildAdminMeetingRuntimeSnapshot/, '运营 AI 分析未读取会议运行时快照')
  assert.match(serviceSource, /cachedSnapshot\.result \? 'completed' : 'failed'/, '运营 AI 失败时未保留旧结果并兜底 failed')
  assert.match(serviceSource, /runWithPlatformAiChannelFallback/, '运营 AI 分析未走平台 AI channel fallback')
  assert.match(channelSource, /key: 'admin_operations_analysis'/, '平台 AI channel 缺少 admin_operations_analysis')
  assert.match(channelSource, /运营管控-AI 分析/, '平台 AI channel 缺少运营管控标签')
})
