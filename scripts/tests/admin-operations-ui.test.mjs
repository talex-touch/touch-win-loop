import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/operations/index.vue')
const LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const ADMIN_INDEX_FILE = resolve(process.cwd(), 'app/pages/admin/index.vue')

it('运营管控页面固定八个 tab 并基于 query tab 切换', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  assert.match(source, /key: 'overview'/, '运营管控页面缺少 overview tab')
  assert.match(source, /key: 'users'/, '运营管控页面缺少 users tab')
  assert.match(source, /key: 'content'/, '运营管控页面缺少 content tab')
  assert.match(source, /key: 'revenue'/, '运营管控页面缺少 revenue tab')
  assert.match(source, /key: 'efficiency'/, '运营管控页面缺少 efficiency tab')
  assert.match(source, /key: 'meeting'/, '运营管控页面缺少 meeting tab')
  assert.match(source, /key: 'risks'/, '运营管控页面缺少 risks tab')
  assert.match(source, /key: 'reports'/, '运营管控页面缺少 reports tab')
  assert.match(source, /path: '\/admin\/operations'/, '运营管控页面未固定 /admin/operations 路径跳转')
  assert.match(source, /route\.query\.tab/, '运营管控页面未基于 tab query 驱动当前视图')
})

it('风险页与会议页开启 30 秒轮询且报表页支持 CSV 导出', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  assert.match(source, /RISK_POLLING_INTERVAL_MS = 30_000/, '风险页未固化 30 秒轮询间隔')
  assert.match(source, /MEETING_POLLING_INTERVAL_MS = 30_000/, '会议页未固化 30 秒轮询间隔')
  assert.match(source, /setInterval\(\(\) => \{\s+void loadRisks\(true\)\s+\}, RISK_POLLING_INTERVAL_MS\)/, '风险页未对 risks 接口开启轮询刷新')
  assert.match(source, /\/admin\/operations\/meeting-runtime/, '会议页未接入会议运行时监控接口')
  assert.match(source, /void loadMeetingRuntime\(true\)/, '会议页未定时刷新会议监控')
  assert.match(source, /activeTab === 'meeting'/, '会议页未基于 meeting tab 渲染')
  assert.match(source, /Prometheus 只读聚合/, '会议页未说明 Prometheus 只读监控边界')
  assert.match(source, /\/admin\/operations\/reports\/query/, '报表页未接入 query 接口')
  assert.match(source, /\/admin\/operations\/reports\/export/, '报表页未接入 export 接口')
})

it('admin 导航与管理首页均暴露 运营管控 入口', async () => {
  const layoutSource = await readFile(LAYOUT_FILE, 'utf8')
  const adminIndexSource = await readFile(ADMIN_INDEX_FILE, 'utf8')

  assert.match(layoutSource, /key: 'admin-operations'/, 'admin 左侧导航缺少运营管控菜单')
  assert.match(layoutSource, /to: '\/admin\/operations'/, 'admin 左侧导航未指向 /admin/operations')
  assert.match(adminIndexSource, /to="\/admin\/operations"/, '管理首页缺少运营管控卡片入口')
  assert.match(adminIndexSource, /运营管控|运行监控/, '管理首页卡片未暴露运营管控文案')
})
