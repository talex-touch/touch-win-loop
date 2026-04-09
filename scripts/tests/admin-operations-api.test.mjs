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
  'server/api/admin/operations/risks.get.ts',
  'server/api/admin/operations/reports/schema.get.ts',
  'server/api/admin/operations/reports/query.post.ts',
  'server/api/admin/operations/reports/export.post.ts',
]

const STORE_FILE = resolve(process.cwd(), 'server/utils/admin-operations-store.ts')
const EXPORT_FILE = resolve(process.cwd(), 'server/api/admin/operations/reports/export.post.ts')

it('admin operations API 全量路由均复用鉴权和 contest.read_internal 权限门槛', async () => {
  for (const relativePath of API_FILES) {
    const source = await readFile(resolve(process.cwd(), relativePath), 'utf8')
    assert.match(source, /requireAuth/, `${relativePath} 未复用 requireAuth`)
    assert.match(source, /checkPlatformPermission/, `${relativePath} 未复用平台权限校验`)
    assert.match(source, /contest\.read_internal/, `${relativePath} 未校验 contest.read_internal`)
  }
})

it('报表导出接口返回 CSV 附件', async () => {
  const source = await readFile(EXPORT_FILE, 'utf8')
  assert.match(source, /exportAdminOperationsReportCsv/, '报表导出接口未接入 CSV 导出实现')
  assert.match(source, /text\/csv; charset=utf-8/, '报表导出接口未设置 CSV Content-Type')
  assert.match(source, /Content-Disposition/, '报表导出接口未设置下载文件名')
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
})
