import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/operations/index.vue')
const LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const ADMIN_INDEX_FILE = resolve(process.cwd(), 'app/pages/admin/index.vue')

it('运营管控页面固定八个 tab 并基于 query tab 切换', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  const tabIcons = {
    overview: 'i-heroicons-outline-chart-bar',
    users: 'i-heroicons-outline-users',
    content: 'i-heroicons-outline-folder-open',
    revenue: 'i-heroicons-outline-currency-dollar',
    efficiency: 'i-heroicons-outline-cpu-chip',
    meeting: 'i-heroicons-outline-video-camera',
    risks: 'i-heroicons-outline-exclamation-triangle',
    reports: 'i-heroicons-outline-document-chart-bar',
  }
  for (const [key, icon] of Object.entries(tabIcons)) {
    assert.match(source, new RegExp(`key: '${key}'`), `运营管控页面缺少 ${key} tab`)
    assert.match(source, new RegExp(`icon: '${icon}'`), `${key} tab 缺少图标 ${icon}`)
  }
  assert.match(source, /path: '\/admin\/operations'/, '运营管控页面未固定 /admin/operations 路径跳转')
  assert.match(source, /route\.query\.tab/, '运营管控页面未基于 tab query 驱动当前视图')
})

it('风险页开启 30 秒轮询且报表页支持 CSV 导出', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  assert.match(source, /RISK_POLLING_INTERVAL_MS = 30_000/, '风险页未固化 30 秒轮询间隔')
  assert.match(source, /setInterval\(\(\) => \{\s+void loadRisks\(true\)\s+\}, RISK_POLLING_INTERVAL_MS\)/, '风险页未对 risks 接口开启轮询刷新')
  assert.match(source, /\/admin\/operations\/reports\/query/, '报表页未接入 query 接口')
  assert.match(source, /\/admin\/operations\/reports\/export/, '报表页未接入 export 接口')
})

it('会议运行时页接入监控接口并开启 30 秒轮询', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  assert.match(source, /MEETING_POLLING_INTERVAL_MS = 30_000/, '会议页未固化 30 秒轮询间隔')
  assert.match(source, /\/admin\/operations\/meeting-runtime/, '会议页未接入会议运行时监控接口')
  assert.match(source, /void loadMeetingRuntime\(true\)/, '会议页未定时刷新会议监控')
  assert.match(source, /activeTab === 'meeting'/, '会议页未基于 meeting tab 渲染')
  assert.match(source, /Prometheus 只读聚合/, '会议页未说明 Prometheus 只读监控边界')
})

it('运营管控接口鉴权失败会自动跳回安全页面', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /redirectOnAuthFailure/, '运营管控页缺少统一鉴权失败跳转处理')
  assert.match(source, /info\.isUnauthorized/, '运营管控页未识别未登录状态')
  assert.match(source, /path: '\/login'/, '运营管控页未在未登录时跳回登录页')
  assert.match(source, /info\.isForbidden/, '运营管控页未识别无权限状态')
  assert.match(source, /navigateTo\('\/admin', \{ replace: true \}\)/, '运营管控页无权限时未自动跳回管理首页')
})

it('运营总览使用合并 shell、静态仪表盘布局和真实 AI 分析入口', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /operation-shell/, '运营页未将标题与 Tab 合并到 operation-shell')
  assert.match(source, /operationSlaCards/, '运营总览缺少 SLA 派生指标')
  assert.match(source, /aiAnalysis/, '运营总览缺少真实 AI 分析状态')
  assert.match(source, /ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS = 8 \* 60 \* 60 \* 1000/, '运营总览未固化 8h AI 过期策略')
  assert.match(source, /\/admin\/operations\/ai-analysis/, '运营总览未读取 AI 分析接口')
  assert.match(source, /\/admin\/operations\/ai-analysis\/run/, '运营总览未接入 AI 分析运行接口')
  assert.match(source, /admin_operations_analysis/, '运营总览未展示运营专属 AI 场景')
  assert.match(source, /trendChartSeries/, '运营总览缺少 SVG 趋势图数据')
  assert.match(source, /SLA \/ 健康度/, '运营总览未渲染 SLA 健康度面板')
  assert.match(source, /AI 分析/, '运营总览未渲染 AI 分析面板')
  assert.match(source, /趋势图/, '运营总览未渲染趋势图')
  assert.doesNotMatch(source, /基于现有后台能力聚合运营、内容、营收、效能、风险与报表数据/, '运营页仍保留旧顶部大说明文案')
  assert.doesNotMatch(source, /基于规则洞察生成，不调用大模型|operationAiInsights/, '运营页仍保留规则洞察 AI 文案或实现')
  assert.doesNotMatch(source, /<section class="operation-header">[\s\S]*<section class="operation-tabs">/, '运营页仍保留标题卡片 + Tab 卡片分离布局')
  assert.doesNotMatch(source, /hover:/, '运营页不应保留 hover 动画类')
  assert.doesNotMatch(source, /box-shadow|\bshadow\b|(^|[;\s{])transform:/m, '运营页不应保留阴影或位移动画样式')
})

it('运营管控各业务 tab 首屏补充图标化摘要和分布条', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /operation-mini-icon i-heroicons-outline-users/, '用户 tab 摘要缺少图标')
  assert.match(source, /operation-mini-icon i-heroicons-outline-folder-open/, '内容 tab 摘要缺少图标')
  assert.match(source, /operation-mini-icon i-heroicons-outline-currency-dollar/, '营收 tab 摘要缺少图标')
  assert.match(source, /operation-mini-icon i-heroicons-outline-cpu-chip/, '效能或会议摘要缺少图标')
  assert.match(source, /operation-mini-icon i-heroicons-outline-video-camera|operation-mini-icon i-heroicons-outline-users/, '会议 tab 摘要缺少图标')
  assert.match(source, /operation-mini-icon i-heroicons-outline-exclamation-triangle/, '风险 tab 摘要缺少图标')
  assert.match(source, /operation-inline-button[\s\S]*i-heroicons-outline-plus/, '报表新增条件按钮缺少图标')
  assert.match(source, /operation-primary-button[\s\S]*i-heroicons-outline-document-magnifying-glass/, '报表预览按钮缺少图标')
  assert.match(source, /distributionWidth/, '用户/内容分布未使用条形宽度表达')
  assert.match(source, /operation-distribution-track/, '用户/内容分布缺少条形图样式')
})

it('admin 导航与管理首页均暴露 运营管控 入口', async () => {
  const layoutSource = await readFile(LAYOUT_FILE, 'utf8')
  const adminIndexSource = await readFile(ADMIN_INDEX_FILE, 'utf8')

  assert.match(layoutSource, /key: 'admin-operations'/, 'admin 左侧导航缺少运营管控菜单')
  assert.match(layoutSource, /to: '\/admin\/operations'/, 'admin 左侧导航未指向 /admin/operations')
  assert.match(adminIndexSource, /to="\/admin\/operations"/, '管理首页缺少运营管控卡片入口')
  assert.match(adminIndexSource, /运营管控|运行监控/, '管理首页卡片未暴露运营管控入口文案')
})
