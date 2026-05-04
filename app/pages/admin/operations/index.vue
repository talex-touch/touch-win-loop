<script setup lang="ts">
import type {
  AdminContentTraceSnapshot,
  AdminEfficiencySnapshot,
  AdminMeetingRuntimeSnapshot,
  AdminOperationsAiAnalysisRunResult,
  AdminOperationsAiAnalysisSnapshot,
  AdminOperationsOverview,
  AdminOperationsTab,
  AdminReportDatasetKey,
  AdminReportFieldOption,
  AdminReportFilter,
  AdminReportFilterOperator,
  AdminReportQuery,
  AdminReportResult,
  AdminReportSchema,
  AdminRevenueSnapshot,
  AdminRiskSnapshot,
  AdminUserSegmentSnapshot,
} from '~~/shared/types/admin-operations'
import type { ApiResponse } from '~~/shared/types/domain'
import { resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

const RISK_POLLING_INTERVAL_MS = 30_000
const MEETING_POLLING_INTERVAL_MS = 30_000
const ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS = 8 * 60 * 60 * 1000
const ADMIN_OPERATIONS_AI_ANALYSIS_STALE_HOURS = ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS / (60 * 60 * 1000)

const tabs: Array<{ key: AdminOperationsTab, label: string, summary: string, icon: string }> = [
  { key: 'overview', label: '总览', summary: '平台指标、趋势与待处理事项', icon: 'i-heroicons-outline-chart-bar' },
  { key: 'users', label: '用户', summary: '用户分层画像与筛选表格', icon: 'i-heroicons-outline-users' },
  { key: 'content', label: '内容', summary: '资源规模、热度、治理与审计链路', icon: 'i-heroicons-outline-folder-open' },
  { key: 'revenue', label: '营收', summary: '套餐、席位、项目配额与估算金额', icon: 'i-heroicons-outline-currency-dollar' },
  { key: 'efficiency', label: '效能', summary: 'Worker、同步与 AI 使用效能', icon: 'i-heroicons-outline-cpu-chip' },
  { key: 'meeting', label: '会议', summary: 'LiveKit、Egress、机器与带宽监控', icon: 'i-heroicons-outline-video-camera' },
  { key: 'risks', label: '风险', summary: '准实时轮询风险监控与告警', icon: 'i-heroicons-outline-exclamation-triangle' },
  { key: 'reports', label: '报表', summary: '零代码临时报表与 CSV 导出', icon: 'i-heroicons-outline-document-chart-bar' },
]

type OperationCardTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

interface OperationKpiCard {
  key: string
  label: string
  value: string
  hint: string
  tone: OperationCardTone
  detailPath: string
}

interface OperationChartDot {
  x: number
  y: number
  label: string
  value: number
}

interface OperationChartSeries {
  key: string
  label: string
  stroke: string
  polyline: string
  dots: OperationChartDot[]
}

interface OperationChart {
  width: number
  height: number
  labels: string[]
  series: OperationChartSeries[]
}

interface OperationSlaCard {
  key: string
  label: string
  value: string
  target: string
  hint: string
  tone: OperationCardTone
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

let authRedirecting = false

function normalizeTab(value: unknown): AdminOperationsTab {
  const candidate = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
  const matched = tabs.find(item => item.key === candidate)
  return matched?.key || 'overview'
}

const activeTab = computed(() => normalizeTab(route.query.tab))

const overview = ref<AdminOperationsOverview | null>(null)
const users = ref<AdminUserSegmentSnapshot | null>(null)
const content = ref<AdminContentTraceSnapshot | null>(null)
const revenue = ref<AdminRevenueSnapshot | null>(null)
const efficiency = ref<AdminEfficiencySnapshot | null>(null)
const meetingRuntime = ref<AdminMeetingRuntimeSnapshot | null>(null)
const risks = ref<AdminRiskSnapshot | null>(null)
const aiAnalysis = ref<AdminOperationsAiAnalysisSnapshot | null>(null)
const reportSchema = ref<AdminReportSchema | null>(null)
const reportPreview = ref<AdminReportResult | null>(null)
const aiAnalysisLoading = ref(false)
const aiAnalysisRunning = ref(false)
const aiAnalysisError = ref('')

const loadingByTab = reactive<Record<AdminOperationsTab, boolean>>({
  overview: false,
  users: false,
  content: false,
  revenue: false,
  efficiency: false,
  meeting: false,
  risks: false,
  reports: false,
})

const loadedByTab = reactive<Record<AdminOperationsTab, boolean>>({
  overview: false,
  users: false,
  content: false,
  revenue: false,
  efficiency: false,
  meeting: false,
  risks: false,
  reports: false,
})

const errorByTab = reactive<Record<AdminOperationsTab, string>>({
  overview: '',
  users: '',
  content: '',
  revenue: '',
  efficiency: '',
  meeting: '',
  risks: '',
  reports: '',
})

const userFilters = reactive({
  keyword: '',
  accountStatus: '',
  primaryRole: '',
})

const contentFilters = reactive({
  category: '',
  governanceStatus: '',
})

const revenueFilters = reactive({
  planCode: '',
  hasPlan: '',
})

const reportForm = reactive({
  dataset: 'users' as AdminReportDatasetKey,
  dimensions: [] as string[],
  metrics: [] as string[],
  limit: 100,
})

const reportFilters = ref<AdminReportFilter[]>([])
const reportBusy = ref(false)
const exportBusy = ref(false)
const reportError = ref('')

const reportLimitOptions = [50, 100, 200, 500]

let riskTimer: ReturnType<typeof setInterval> | null = null
let meetingTimer: ReturnType<typeof setInterval> | null = null

function formatNumber(value: unknown): string {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatPercent(value: unknown): string {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatYuan(value: unknown): string {
  return `CNY ${Number(value || 0).toFixed(2)}`
}

function formatBytes(value: unknown): string {
  const bytes = Math.max(0, Number(value || 0))
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let current = bytes
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatRate(value: unknown): string {
  return `${formatBytes(value)}/s`
}

function formatDateTime(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatShortDate(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text)
    return '--'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text.slice(5) || text
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatMetricNumber(value: unknown): string {
  const number = Number(value || 0)
  if (!Number.isFinite(number))
    return '0'
  if (!Number.isInteger(number))
    return number.toFixed(2)
  return number.toLocaleString('zh-CN')
}

function distributionWidth(count: unknown, buckets: Array<{ count: number }> = []): string {
  const total = buckets.reduce((sum, item) => sum + Number(item.count || 0), 0)
  if (total <= 0)
    return '0%'
  return `${Math.max(4, Math.round((Number(count || 0) / total) * 100))}%`
}

function toneClass(kind: string): string {
  if (kind === 'danger' || kind === 'critical')
    return 'text-rose-700 border-rose-200 bg-rose-50'
  if (kind === 'warning' || kind === 'high')
    return 'text-amber-700 border-amber-200 bg-amber-50'
  if (kind === 'success' || kind === 'healthy')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  return 'text-sky-700 border-sky-200 bg-sky-50'
}

function operationToneClass(tone: OperationCardTone): string {
  if (tone === 'danger')
    return 'operation-tone-danger'
  if (tone === 'warning')
    return 'operation-tone-warning'
  if (tone === 'success')
    return 'operation-tone-success'
  if (tone === 'neutral')
    return 'operation-tone-neutral'
  return 'operation-tone-info'
}

function healthLabel(value: string): string {
  if (value === 'healthy')
    return '正常'
  if (value === 'warning')
    return '注意'
  if (value === 'critical')
    return '异常'
  return '空闲'
}

function findOverviewMetric(key: string) {
  return overview.value?.cards.find(item => item.key === key) || null
}

function getMetricValue(key: string): number {
  return Number(findOverviewMetric(key)?.value || 0)
}

function buildTrendChartSeries(): OperationChart {
  const points = overview.value?.trend || []
  const width = 720
  const height = 260
  const padX = 34
  const padTop = 24
  const padBottom = 36
  const labels = points.map(item => formatShortDate(item.date))
  const configs = [
    { key: 'newUsers', label: '新增用户', stroke: '#2563eb', getValue: (item: typeof points[number]) => item.newUsers },
    { key: 'activeUsers', label: '活跃用户', stroke: '#059669', getValue: (item: typeof points[number]) => item.activeUsers },
    { key: 'searchEvents', label: '搜索事件', stroke: '#d97706', getValue: (item: typeof points[number]) => item.searchEvents },
    { key: 'governanceTasks', label: '治理任务', stroke: '#7c3aed', getValue: (item: typeof points[number]) => item.governanceTasks },
  ]

  if (!points.length) {
    return {
      width,
      height,
      labels,
      series: configs.map(item => ({
        key: item.key,
        label: item.label,
        stroke: item.stroke,
        polyline: '',
        dots: [],
      })),
    }
  }

  const allValues = configs.flatMap(config => points.map(point => config.getValue(point)))
  const maxValue = Math.max(...allValues, 1)
  const minValue = Math.min(...allValues, 0)
  const range = Math.max(maxValue - minValue, 1)
  const usableWidth = width - padX * 2
  const usableHeight = height - padTop - padBottom
  const stepX = points.length > 1 ? usableWidth / (points.length - 1) : 0

  return {
    width,
    height,
    labels,
    series: configs.map((config) => {
      const dots = points.map((point, index) => {
        const value = config.getValue(point)
        const normalized = (value - minValue) / range
        return {
          x: padX + stepX * index,
          y: height - padBottom - normalized * usableHeight,
          label: formatShortDate(point.date),
          value,
        }
      })
      return {
        key: config.key,
        label: config.label,
        stroke: config.stroke,
        polyline: dots.map(dot => `${dot.x},${dot.y}`).join(' '),
        dots,
      }
    }),
  }
}

async function switchTab(tab: AdminOperationsTab) {
  if (tab === activeTab.value)
    return
  await navigateTo({
    path: '/admin/operations',
    query: {
      ...route.query,
      tab,
    },
  }, { replace: true })
}

async function redirectOnAuthFailure(error: unknown): Promise<boolean> {
  const info = resolveAuthRequestErrorInfo(error)
  if (!info.isUnauthorized && !info.isForbidden)
    return false

  if (authRedirecting)
    return true

  authRedirecting = true
  if (info.isUnauthorized) {
    await navigateTo({
      path: '/login',
      query: { redirect: resolveLoginRedirectTarget(route, '/admin/operations') },
    }, { replace: true })
    return true
  }

  await navigateTo('/admin', { replace: true })
  return true
}

async function loadOverview(force = false) {
  if (loadingByTab.overview)
    return
  if (loadedByTab.overview && !force)
    return
  loadingByTab.overview = true
  errorByTab.overview = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminOperationsOverview>>('/admin/operations/overview')
    overview.value = response.data
    loadedByTab.overview = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.overview = String(error?.data?.message || '运营总览加载失败。')
  }
  finally {
    loadingByTab.overview = false
  }
}

async function loadUsers(force = false) {
  if (loadingByTab.users)
    return
  if (loadedByTab.users && !force)
    return
  loadingByTab.users = true
  errorByTab.users = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminUserSegmentSnapshot>>('/admin/operations/users')
    users.value = response.data
    loadedByTab.users = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.users = String(error?.data?.message || '用户画像加载失败。')
  }
  finally {
    loadingByTab.users = false
  }
}

async function loadContent(force = false) {
  if (loadingByTab.content)
    return
  if (loadedByTab.content && !force)
    return
  loadingByTab.content = true
  errorByTab.content = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminContentTraceSnapshot>>('/admin/operations/content')
    content.value = response.data
    loadedByTab.content = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.content = String(error?.data?.message || '内容追踪加载失败。')
  }
  finally {
    loadingByTab.content = false
  }
}

async function loadRevenue(force = false) {
  if (loadingByTab.revenue)
    return
  if (loadedByTab.revenue && !force)
    return
  loadingByTab.revenue = true
  errorByTab.revenue = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminRevenueSnapshot>>('/admin/operations/revenue')
    revenue.value = response.data
    loadedByTab.revenue = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.revenue = String(error?.data?.message || '经营对账加载失败。')
  }
  finally {
    loadingByTab.revenue = false
  }
}

async function loadEfficiency(force = false) {
  if (loadingByTab.efficiency)
    return
  if (loadedByTab.efficiency && !force)
    return
  loadingByTab.efficiency = true
  errorByTab.efficiency = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminEfficiencySnapshot>>('/admin/operations/efficiency')
    efficiency.value = response.data
    loadedByTab.efficiency = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.efficiency = String(error?.data?.message || '效能视图加载失败。')
  }
  finally {
    loadingByTab.efficiency = false
  }
}

async function loadMeetingRuntime(force = false) {
  if (loadingByTab.meeting)
    return
  if (loadedByTab.meeting && !force)
    return
  loadingByTab.meeting = true
  errorByTab.meeting = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminMeetingRuntimeSnapshot>>('/admin/operations/meeting-runtime')
    meetingRuntime.value = response.data
    loadedByTab.meeting = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.meeting = String(error?.data?.message || '会议运行时监控加载失败。')
  }
  finally {
    loadingByTab.meeting = false
  }
}

async function loadRisks(force = false) {
  if (loadingByTab.risks)
    return
  if (loadedByTab.risks && !force)
    return
  loadingByTab.risks = true
  errorByTab.risks = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminRiskSnapshot>>('/admin/operations/risks')
    risks.value = response.data
    loadedByTab.risks = true
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.risks = String(error?.data?.message || '风险视图加载失败。')
  }
  finally {
    loadingByTab.risks = false
  }
}

async function loadReportSchema(force = false) {
  if (loadingByTab.reports)
    return
  if (loadedByTab.reports && !force)
    return
  loadingByTab.reports = true
  errorByTab.reports = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminReportSchema>>('/admin/operations/reports/schema')
    reportSchema.value = response.data
    loadedByTab.reports = true
    syncReportDefaults(true)
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    errorByTab.reports = String(error?.data?.message || '报表配置加载失败。')
  }
  finally {
    loadingByTab.reports = false
  }
}

async function runAiAnalysis(force = true) {
  if (aiAnalysisRunning.value)
    return
  aiAnalysisRunning.value = true
  aiAnalysisError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminOperationsAiAnalysisRunResult>>('/admin/operations/ai-analysis/run', {
      method: 'POST',
      body: { force },
    })
    aiAnalysis.value = response.data
    if (response.data.error)
      aiAnalysisError.value = response.data.error
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    aiAnalysisError.value = String(error?.data?.message || error?.message || 'AI 分析运行失败。')
  }
  finally {
    aiAnalysisRunning.value = false
  }
}

async function loadAiAnalysis(force = false) {
  if (aiAnalysisLoading.value)
    return
  if (aiAnalysis.value && !force)
    return
  aiAnalysisLoading.value = true
  aiAnalysisError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AdminOperationsAiAnalysisSnapshot>>('/admin/operations/ai-analysis')
    aiAnalysis.value = response.data
    if (response.data.error)
      aiAnalysisError.value = response.data.error
    if (!response.data.result || response.data.stale)
      void runAiAnalysis(false)
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    aiAnalysisError.value = String(error?.data?.message || 'AI 分析状态加载失败。')
  }
  finally {
    aiAnalysisLoading.value = false
  }
}

async function loadOverviewDashboard(force = false) {
  await Promise.allSettled([
    loadOverview(force),
    loadEfficiency(force),
    loadRisks(force),
    loadMeetingRuntime(force),
    loadAiAnalysis(force),
  ])
}

async function ensureTabLoaded(tab: AdminOperationsTab, force = false) {
  if (tab === 'overview')
    return loadOverviewDashboard(force)
  if (tab === 'users')
    return loadUsers(force)
  if (tab === 'content')
    return loadContent(force)
  if (tab === 'revenue')
    return loadRevenue(force)
  if (tab === 'efficiency')
    return loadEfficiency(force)
  if (tab === 'meeting')
    return loadMeetingRuntime(force)
  if (tab === 'risks')
    return loadRisks(force)
  return loadReportSchema(force)
}

function syncPolling() {
  if (riskTimer) {
    clearInterval(riskTimer)
    riskTimer = null
  }
  if (meetingTimer) {
    clearInterval(meetingTimer)
    meetingTimer = null
  }
  if (!import.meta.client)
    return
  if (activeTab.value === 'risks') {
    riskTimer = setInterval(() => {
      void loadRisks(true)
    }, RISK_POLLING_INTERVAL_MS)
  }
  if (activeTab.value === 'meeting') {
    meetingTimer = setInterval(() => {
      void loadMeetingRuntime(true)
    }, MEETING_POLLING_INTERVAL_MS)
  }
}

const userRows = computed(() => {
  const rows = users.value?.users || []
  return rows.filter((item) => {
    if (userFilters.keyword.trim()) {
      const keyword = userFilters.keyword.trim().toLowerCase()
      if (!item.username.toLowerCase().includes(keyword))
        return false
    }
    if (userFilters.accountStatus && item.accountStatus !== userFilters.accountStatus)
      return false
    if (userFilters.primaryRole && item.primaryRole !== userFilters.primaryRole)
      return false
    return true
  })
})

const contentRows = computed(() => {
  const rows = content.value?.resources || []
  return rows.filter((item) => {
    if (contentFilters.category && item.category !== contentFilters.category)
      return false
    if (contentFilters.governanceStatus && item.governanceStatus !== contentFilters.governanceStatus)
      return false
    return true
  })
})

const revenueRows = computed(() => {
  const rows = revenue.value?.workspaces || []
  return rows.filter((item) => {
    if (revenueFilters.planCode && item.planCode !== revenueFilters.planCode)
      return false
    if (revenueFilters.hasPlan === 'yes' && !item.hasPlan)
      return false
    if (revenueFilters.hasPlan === 'no' && item.hasPlan)
      return false
    return true
  })
})

const currentTabMeta = computed(() => tabs.find(item => item.key === activeTab.value) ?? tabs[0]!)

const latestGeneratedAt = computed(() => {
  if (activeTab.value === 'overview')
    return overview.value?.generatedAt
  if (activeTab.value === 'users')
    return users.value?.generatedAt
  if (activeTab.value === 'content')
    return content.value?.generatedAt
  if (activeTab.value === 'revenue')
    return revenue.value?.generatedAt
  if (activeTab.value === 'efficiency')
    return efficiency.value?.generatedAt
  if (activeTab.value === 'meeting')
    return meetingRuntime.value?.generatedAt
  if (activeTab.value === 'risks')
    return risks.value?.generatedAt
  return undefined
})

const pendingTodoCount = computed(() => {
  return (overview.value?.todos || []).reduce((total, item) => total + Number(item.count || 0), 0)
})

const operationKpiCards = computed<OperationKpiCard[]>(() => {
  const cards = overview.value?.cards || []
  const find = (key: string) => cards.find(item => item.key === key)
  const riskCount = getMetricValue('risk-count')
  const syncFailures = getMetricValue('sync-failures') || getMetricValue('open-sync-issues')
  const estimatedRevenue = find('estimated-revenue')

  return [
    {
      key: 'users',
      label: '用户规模',
      value: formatMetricNumber(getMetricValue('total-users')),
      hint: `7 天活跃 ${formatMetricNumber(getMetricValue('active-users'))}`,
      tone: 'info',
      detailPath: '/admin/operations?tab=users',
    },
    {
      key: 'content',
      label: '内容资产',
      value: formatMetricNumber(getMetricValue('resource-count')),
      hint: `赛事 ${formatMetricNumber(getMetricValue('contest-count'))}`,
      tone: 'success',
      detailPath: '/admin/operations?tab=content',
    },
    {
      key: 'revenue',
      label: '估算营收',
      value: estimatedRevenue ? formatMetricNumber(estimatedRevenue.value) : '0',
      hint: estimatedRevenue?.unit ? `单位：${estimatedRevenue.unit}` : '来自套餐与席位估算',
      tone: 'info',
      detailPath: '/admin/operations?tab=revenue',
    },
    {
      key: 'efficiency',
      label: '同步异常',
      value: formatMetricNumber(syncFailures),
      hint: '近 7 天 Worker / 集成异常',
      tone: syncFailures > 0 ? 'warning' : 'success',
      detailPath: '/admin/operations?tab=efficiency',
    },
    {
      key: 'risk',
      label: '未闭环风险',
      value: formatMetricNumber(riskCount),
      hint: riskCount > 0 ? '需要运营确认闭环' : '暂无待处理风险',
      tone: riskCount > 0 ? 'danger' : 'success',
      detailPath: '/admin/operations?tab=risks',
    },
    {
      key: 'todo',
      label: '运营待办',
      value: formatMetricNumber(pendingTodoCount.value),
      hint: `${overview.value?.todos.length || 0} 类事项`,
      tone: pendingTodoCount.value > 0 ? 'warning' : 'success',
      detailPath: '/admin/operations?tab=overview',
    },
  ]
})

const trendChartSeries = computed(() => buildTrendChartSeries())

const operationSlaCards = computed<OperationSlaCard[]>(() => {
  const previewRate = efficiency.value?.summary.previewSuccessRate24h
  const previewQueue = efficiency.value?.summary.previewQueuedCount
  const feishuRate = efficiency.value?.summary.feishuSuccessRate7d
  const riskTotal = risks.value?.summary.total
  const capacity = meetingRuntime.value?.capacity

  return [
    {
      key: 'preview-success',
      label: '文档预览 SLA',
      value: previewRate == null ? '数据不足' : formatPercent(previewRate),
      target: '目标 >= 95%',
      hint: previewQueue == null ? '需加载效能数据' : `当前排队 ${formatNumber(previewQueue)}`,
      tone: previewRate == null ? 'neutral' : previewRate >= 95 ? 'success' : 'danger',
    },
    {
      key: 'feishu-sync',
      label: '飞书同步 SLA',
      value: feishuRate == null ? '数据不足' : formatPercent(feishuRate),
      target: '目标 >= 95%',
      hint: efficiency.value ? `7 天运行 ${formatNumber(efficiency.value.summary.feishuRunCount7d)}` : '需加载效能数据',
      tone: feishuRate == null ? 'neutral' : feishuRate >= 95 ? 'success' : 'warning',
    },
    {
      key: 'risk-closure',
      label: '风险闭环',
      value: riskTotal == null ? '数据不足' : `${formatNumber(riskTotal)} 项`,
      target: '目标 = 0 高危积压',
      hint: risks.value ? `Critical ${formatNumber(risks.value.summary.critical)} / High ${formatNumber(risks.value.summary.high)}` : '需加载风险数据',
      tone: riskTotal == null ? 'neutral' : riskTotal > 0 ? 'danger' : 'success',
    },
    {
      key: 'meeting-capacity',
      label: '会议容量',
      value: capacity ? healthLabel(capacity.health) : '数据不足',
      target: '目标保持正常',
      hint: capacity ? `${capacity.estimatedSafeParticipantCount}/${capacity.maxExpectedParticipants} 人安全容量` : '需加载会议数据',
      tone: !capacity ? 'neutral' : capacity.health === 'healthy' ? 'success' : capacity.health === 'critical' ? 'danger' : 'warning',
    },
  ]
})

const aiStatusMeta = computed(() => {
  const status = aiAnalysis.value?.status || 'idle'
  if (aiAnalysisRunning.value || status === 'running')
    return { label: 'AI 运行中', tone: 'info' as OperationCardTone }
  if (status === 'completed')
    return { label: 'AI 已完成', tone: 'success' as OperationCardTone }
  if (status === 'stale')
    return { label: 'AI 已过期', tone: 'warning' as OperationCardTone }
  if (status === 'failed')
    return { label: 'AI 失败', tone: 'danger' as OperationCardTone }
  return { label: 'AI 待运行', tone: 'neutral' as OperationCardTone }
})

const aiProviderLabel = computed(() => {
  const provider = aiAnalysis.value?.provider
  const model = aiAnalysis.value?.model
  if (!provider && !model)
    return '未生成'
  return [provider, model].filter(Boolean).join(' / ')
})

const currentDatasetSchema = computed(() => {
  return reportSchema.value?.datasets.find(item => item.key === reportForm.dataset) || null
})

function buildDefaultReportFilter(field?: AdminReportFieldOption): AdminReportFilter {
  return {
    field: field?.key || '',
    operator: (field?.operators?.[0] || 'eq') as AdminReportFilterOperator,
    value: '',
  }
}

function syncReportDefaults(resetFilters = false) {
  const schema = currentDatasetSchema.value
  if (!schema)
    return

  const dimensionKeys = new Set(schema.dimensions.map(item => item.key))
  const metricKeys = new Set(schema.metrics.map(item => item.key))
  reportForm.dimensions = reportForm.dimensions.filter(item => dimensionKeys.has(item))
  reportForm.metrics = reportForm.metrics.filter(item => metricKeys.has(item))
  if (reportForm.dimensions.length === 0)
    reportForm.dimensions = [...schema.defaultDimensions]
  if (reportForm.metrics.length === 0)
    reportForm.metrics = [...schema.defaultMetrics]

  if (resetFilters || reportFilters.value.length === 0) {
    reportFilters.value = [buildDefaultReportFilter(schema.filters[0])]
    return
  }

  reportFilters.value = reportFilters.value.map((item) => {
    const field = schema.filters.find(filter => filter.key === item.field) || schema.filters[0]
    return {
      field: field?.key || '',
      operator: (field?.operators?.includes(item.operator) ? item.operator : field?.operators?.[0] || 'eq') as AdminReportFilterOperator,
      value: item.value,
    }
  })
}

function getReportField(key: string): AdminReportFieldOption | null {
  return currentDatasetSchema.value?.filters.find(item => item.key === key) || null
}

function addReportFilter() {
  const field = currentDatasetSchema.value?.filters[0]
  reportFilters.value = [...reportFilters.value, buildDefaultReportFilter(field)]
}

function removeReportFilter(index: number) {
  reportFilters.value = reportFilters.value.filter((_, current) => current !== index)
}

function buildReportPayload(): AdminReportQuery {
  return {
    dataset: reportForm.dataset,
    dimensions: [...reportForm.dimensions],
    metrics: [...reportForm.metrics],
    limit: reportForm.limit,
    filters: reportFilters.value
      .map((item) => {
        const field = getReportField(item.field)
        if (!field || !String(item.value ?? '').trim())
          return null
        if (field.type === 'number') {
          return {
            ...item,
            value: Number(item.value || 0),
          }
        }
        return item
      })
      .filter(Boolean) as AdminReportFilter[],
  }
}

async function queryReport() {
  if (!currentDatasetSchema.value)
    return
  reportBusy.value = true
  reportError.value = ''
  try {
    const payload = await authApiFetch<ApiResponse<AdminReportResult>>('/admin/operations/reports/query', {
      method: 'POST',
      body: buildReportPayload(),
    })
    reportPreview.value = payload.data
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    reportError.value = String(error?.data?.message || '报表查询失败。')
  }
  finally {
    reportBusy.value = false
  }
}

async function exportReport() {
  if (!currentDatasetSchema.value || !import.meta.client)
    return
  exportBusy.value = true
  reportError.value = ''
  try {
    const response = await fetch(endpoint('/admin/operations/reports/export'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildReportPayload()),
    })
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const error = new Error(String(errorPayload?.message || '导出失败')) as Error & {
        statusCode?: number
        data?: unknown
      }
      error.statusCode = response.status
      error.data = errorPayload
      throw error
    }
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `admin-operations-${reportForm.dataset}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }
  catch (error: any) {
    if (await redirectOnAuthFailure(error))
      return
    reportError.value = String(error?.message || '导出失败。')
  }
  finally {
    exportBusy.value = false
  }
}

watch(activeTab, (tab) => {
  void ensureTabLoaded(tab)
  syncPolling()
})

watch(() => reportForm.dataset, () => {
  reportPreview.value = null
  syncReportDefaults(true)
})

onMounted(() => {
  void ensureTabLoaded(activeTab.value)
  syncPolling()
})

onBeforeUnmount(() => {
  if (riskTimer)
    clearInterval(riskTimer)
  if (meetingTimer)
    clearInterval(meetingTimer)
})
</script>

<template>
  <div class="operation-page">
    <section class="operation-shell">
      <div class="operation-shell-head">
        <div>
          <p class="operation-eyebrow">
            Admin Operations
          </p>
          <h1 class="operation-title">
            运营管控
          </h1>
          <p class="operation-description">
            {{ currentTabMeta.summary }}
          </p>
        </div>
        <div class="operation-header-meta">
          <span class="operation-badge operation-tone-info">当前：{{ currentTabMeta.label }}</span>
          <span class="operation-badge operation-tone-neutral">刷新：{{ formatDateTime(latestGeneratedAt) }}</span>
          <span class="operation-badge" :class="operationToneClass(aiStatusMeta.tone)">{{ aiStatusMeta.label }}</span>
          <span class="operation-badge operation-tone-neutral">AI：{{ formatDateTime(aiAnalysis?.lastRunAt) }}</span>
          <button
            type="button"
            class="operation-icon-button"
            :disabled="aiAnalysisRunning"
            title="重新分析"
            @click="runAiAnalysis(true)"
          >
            <span class="i-heroicons-outline-arrow-path" />
            {{ aiAnalysisRunning ? '分析中' : '重新分析' }}
          </button>
        </div>
      </div>

      <div class="operation-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="operation-tab"
          :class="activeTab === tab.key ? 'is-active' : ''"
          @click="switchTab(tab.key)"
        >
          <span class="operation-tab-icon" :class="tab.icon" />
          <span>
            <span class="operation-tab-label">
              {{ tab.label }}
            </span>
            <span class="operation-tab-summary">
              {{ tab.summary }}
            </span>
          </span>
        </button>
      </div>
    </section>

    <section v-if="activeTab === 'overview'" class="operation-stack">
      <section v-if="loadingByTab.overview && !overview" class="operation-panel">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.overview" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.overview }}
      </section>
      <template v-else-if="overview">
        <section class="operation-kpi-grid">
          <NuxtLink
            v-for="card in operationKpiCards"
            :key="card.key"
            :to="card.detailPath"
            class="operation-kpi-card"
            :class="operationToneClass(card.tone)"
          >
            <div class="operation-kpi-head">
              <span
                class="operation-mini-icon"
                :class="card.key === 'users' ? 'i-heroicons-outline-users' : card.key === 'content' ? 'i-heroicons-outline-folder-open' : card.key === 'revenue' ? 'i-heroicons-outline-currency-dollar' : card.key === 'efficiency' ? 'i-heroicons-outline-cpu-chip' : card.key === 'risk' ? 'i-heroicons-outline-exclamation-triangle' : 'i-heroicons-outline-clipboard-document-list'"
              />
              <p class="operation-kpi-label">
                {{ card.label }}
              </p>
            </div>
            <p class="operation-kpi-value">
              {{ card.value }}
            </p>
            <p class="operation-kpi-hint">
              {{ card.hint }}
            </p>
          </NuxtLink>
        </section>

        <section class="operation-overview-grid">
          <div class="operation-panel operation-panel--trend">
            <div class="operation-panel-head">
              <div>
                <h2 class="operation-section-title">
                  趋势图
                </h2>
                <p class="operation-section-desc">
                  左侧为近 7 天新增、活跃、搜索与治理任务变化；右侧为真实 AI 分析场景输出。
                </p>
              </div>
              <div class="operation-legend">
                <span
                  v-for="series in trendChartSeries.series"
                  :key="series.key"
                  class="operation-legend-item"
                >
                  <i :style="{ backgroundColor: series.stroke }" />
                  {{ series.label }}
                </span>
              </div>
            </div>
            <div v-if="trendChartSeries.series.some(series => series.polyline)" class="operation-chart">
              <svg
                class="operation-chart-svg"
                :viewBox="`0 0 ${trendChartSeries.width} ${trendChartSeries.height}`"
                role="img"
                aria-label="运营趋势图"
              >
                <line x1="34" y1="24" x2="34" :y2="trendChartSeries.height - 36" class="operation-chart-grid-line" />
                <line x1="34" :y1="trendChartSeries.height - 36" :x2="trendChartSeries.width - 34" :y2="trendChartSeries.height - 36" class="operation-chart-grid-line" />
                <polyline
                  v-for="series in trendChartSeries.series"
                  :key="series.key"
                  :points="series.polyline"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  :stroke="series.stroke"
                />
                <g v-for="series in trendChartSeries.series" :key="`${series.key}-dots`">
                  <circle
                    v-for="dot in series.dots"
                    :key="`${series.key}-${dot.label}`"
                    :cx="dot.x"
                    :cy="dot.y"
                    r="3"
                    :fill="series.stroke"
                  />
                </g>
              </svg>
              <div class="operation-chart-axis">
                <span v-for="label in trendChartSeries.labels" :key="label">{{ label }}</span>
              </div>
            </div>
            <div v-else class="operation-empty">
              暂无趋势数据
            </div>
          </div>

          <div class="operation-panel operation-ai-panel">
            <div class="operation-panel-head">
              <div>
                <h2 class="operation-section-title">
                  AI 分析
                </h2>
                <p class="operation-section-desc">
                  admin_operations_analysis 场景，超过 {{ ADMIN_OPERATIONS_AI_ANALYSIS_STALE_HOURS }} 小时自动刷新一次。
                </p>
              </div>
              <button
                type="button"
                class="operation-icon-button"
                :disabled="aiAnalysisRunning"
                @click="runAiAnalysis(true)"
              >
                <span class="i-heroicons-outline-sparkles" />
                {{ aiAnalysisRunning ? '分析中' : '运行 AI' }}
              </button>
            </div>
            <div v-if="aiAnalysis?.result" class="operation-ai-body">
              <article class="operation-ai-summary" :class="operationToneClass(aiAnalysis.result.riskLevel)">
                <div class="operation-ai-summary-icon">
                  <span class="i-heroicons-outline-sparkles" />
                </div>
                <div>
                  <p class="operation-insight-title">
                    {{ aiAnalysis.result.summary }}
                  </p>
                  <p class="operation-insight-desc">
                    {{ aiProviderLabel }}，生成于 {{ formatDateTime(aiAnalysis.result.generatedAt) }}。
                    <span v-if="aiAnalysis.fallbackUsed">已使用 fallback。</span>
                  </p>
                </div>
              </article>
              <div class="operation-ai-columns">
                <div>
                  <p class="operation-ai-list-title">
                    关键风险
                  </p>
                  <ul class="operation-ai-list">
                    <li v-for="item in aiAnalysis.result.keyRisks" :key="item">
                      {{ item }}
                    </li>
                    <li v-if="!aiAnalysis.result.keyRisks.length">
                      暂无高优先级风险。
                    </li>
                  </ul>
                </div>
                <div>
                  <p class="operation-ai-list-title">
                    SLA 解释
                  </p>
                  <ul class="operation-ai-list">
                    <li v-for="item in aiAnalysis.result.slaNotes" :key="item">
                      {{ item }}
                    </li>
                    <li v-if="!aiAnalysis.result.slaNotes.length">
                      暂无 SLA 补充说明。
                    </li>
                  </ul>
                </div>
              </div>
              <div>
                <p class="operation-ai-list-title">
                  建议动作
                </p>
                <ul class="operation-ai-list">
                  <li v-for="item in aiAnalysis.result.actions" :key="item">
                    {{ item }}
                  </li>
                  <li v-if="!aiAnalysis.result.actions.length">
                    暂无建议动作。
                  </li>
                </ul>
              </div>
              <div v-if="aiAnalysis.result.citations.length" class="operation-ai-citations">
                <span
                  v-for="item in aiAnalysis.result.citations"
                  :key="`${item.label}-${item.value}`"
                  class="operation-badge operation-tone-neutral"
                >
                  {{ item.label }}：{{ item.value }}
                </span>
              </div>
            </div>
            <div v-else-if="aiAnalysisLoading || aiAnalysisRunning" class="operation-empty">
              AI 分析运行中
            </div>
            <div v-else class="operation-empty">
              AI 分析暂不可用
            </div>
            <p v-if="aiAnalysisError" class="operation-ai-error">
              {{ aiAnalysisError }}
            </p>
          </div>
        </section>

        <section class="operation-overview-grid operation-overview-grid--balanced">
          <div class="operation-panel">
            <div class="operation-panel-head">
              <div>
                <h2 class="operation-section-title">
                  SLA / 健康度
                </h2>
                <p class="operation-section-desc">
                  汇总效能、风险与会议运行状态。
                </p>
              </div>
            </div>
            <div class="operation-sla-grid">
              <article
                v-for="card in operationSlaCards"
                :key="card.key"
                class="operation-sla-card"
                :class="operationToneClass(card.tone)"
              >
                <p class="operation-sla-label">
                  {{ card.label }}
                </p>
                <p class="operation-sla-value">
                  {{ card.value }}
                </p>
                <p class="operation-sla-target">
                  {{ card.target }}
                </p>
                <p class="operation-sla-hint">
                  {{ card.hint }}
                </p>
              </article>
            </div>
          </div>

          <div class="operation-panel">
            <div class="operation-panel-head">
              <div>
                <h2 class="operation-section-title">
                  运营待办
                </h2>
                <p class="operation-section-desc">
                  需要人工确认或跳转处理的事项。
                </p>
              </div>
            </div>
            <div v-if="overview.todos.length" class="operation-todo-list">
              <NuxtLink
                v-for="item in overview.todos"
                :key="item.key"
                :to="item.detailPath || '/admin/operations'"
                class="operation-todo-item"
              >
                <div>
                  <p class="operation-todo-label">
                    {{ item.label }}
                  </p>
                  <p class="operation-todo-desc">
                    {{ item.description }}
                  </p>
                </div>
                <span class="operation-badge" :class="toneClass(item.tone)">
                  {{ formatNumber(item.count) }}
                </span>
              </NuxtLink>
            </div>
            <div v-else class="operation-empty">
              暂无运营待办
            </div>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'users'" class="space-y-3">
      <section v-if="loadingByTab.users && !users" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.users" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.users }}
      </section>
      <template v-else-if="users">
        <section class="gap-2 grid md:grid-cols-5">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-users" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              用户总量
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.totalUsers) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-signal" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              活跃用户(7天)
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.activeUsers7d) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-no-symbol" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              停用账号
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.disabledUsers) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-shield-check" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              平台管理员
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.platformAdmins) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-user-plus" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              新增用户(30天)
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.newUsers30d) }}
            </p>
          </div>
        </section>

        <section class="gap-2 grid xl:grid-cols-3">
          <div v-for="(bucketList, label) in users.dimensions" :key="label" class="operation-panel operation-panel--compact">
            <div class="operation-subhead">
              <span class="operation-mini-icon" :class="label === 'platformRole' ? 'i-heroicons-outline-shield-check' : label === 'aiUsage' ? 'i-heroicons-outline-sparkles' : label === 'resourceSearchActivity' ? 'i-heroicons-outline-magnifying-glass' : 'i-heroicons-outline-chart-pie'" />
              <p class="text-[10px] text-slate-500 tracking-wider uppercase">
                {{ label }}
              </p>
            </div>
            <div class="mt-3 space-y-2">
              <div v-for="item in bucketList" :key="item.key" class="operation-distribution-row">
                <div class="operation-distribution-meta">
                  <span class="text-slate-700">{{ item.label }}</span>
                  <span class="text-slate-900 font-semibold">{{ formatNumber(item.count) }}</span>
                </div>
                <div class="operation-distribution-track">
                  <i :style="{ width: distributionWidth(item.count, bucketList) }" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-col gap-2 md:flex-row">
            <input v-model="userFilters.keyword" class="px-2 py-1 border border-slate-200 bg-white" placeholder="搜索用户名">
            <select v-model="userFilters.accountStatus" class="px-2 py-1 border border-slate-200 bg-white">
              <option value="">
                全部账号状态
              </option>
              <option v-for="item in users.dimensions.accountStatus" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
            <select v-model="userFilters.primaryRole" class="px-2 py-1 border border-slate-200 bg-white">
              <option value="">
                全部平台角色
              </option>
              <option v-for="item in users.dimensions.platformRole" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    用户
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    角色/状态
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    工作区
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    项目
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    AI
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    资源搜索
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    最近活跃
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in userRows" :key="item.userId" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    <NuxtLink :to="item.detailPath || '/admin/users'" class="text-sky-700">
                      {{ item.username }}
                    </NuxtLink>
                  </td>
                  <td class="px-3 py-2">
                    {{ item.primaryRole }} / {{ item.accountStatus }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.workspaceCount }} (团队 {{ item.teamWorkspaceCount }})
                  </td>
                  <td class="px-3 py-2">
                    {{ item.projectCount }} / 完成 {{ item.completedProjectCount }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.aiUsageBand }} / 会话 {{ item.aiSessionCount30d }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.searchActivityBand }} / {{ item.resourceSearchCount30d }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDateTime(item.lastSeenAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'content'" class="space-y-3">
      <section v-if="loadingByTab.content && !content" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.content" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.content }}
      </section>
      <template v-else-if="content">
        <section class="gap-2 grid md:grid-cols-3 xl:grid-cols-5">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-academic-cap" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              竞赛数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.contestCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-folder-open" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              资源数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.resourceCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-clipboard-document-check" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              治理待处理
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.governancePendingCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-magnifying-glass" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              30天搜索/点击
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.searchCount30d) }} / {{ formatNumber(content.summary.clickCount30d) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-document-text" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              文档待处理/失败
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.documentPendingCount) }} / {{ formatNumber(content.summary.documentFailedCount) }}
            </p>
          </div>
        </section>

        <section class="gap-3 grid xl:grid-cols-[0.8fr,0.8fr,1.2fr]">
          <div class="operation-panel operation-panel--compact">
            <div class="operation-subhead">
              <span class="operation-mini-icon i-heroicons-outline-chart-pie" />
              <p class="text-[10px] text-slate-500 tracking-wider uppercase">
                分类分布
              </p>
            </div>
            <div class="mt-3 space-y-2">
              <div v-for="item in content.categoryDistribution" :key="item.key" class="operation-distribution-row">
                <div class="operation-distribution-meta">
                  <span>{{ item.label }}</span>
                  <span class="font-semibold">{{ formatNumber(item.count) }}</span>
                </div>
                <div class="operation-distribution-track">
                  <i :style="{ width: distributionWidth(item.count, content.categoryDistribution) }" />
                </div>
              </div>
            </div>
          </div>
          <div class="operation-panel operation-panel--compact">
            <div class="operation-subhead">
              <span class="operation-mini-icon i-heroicons-outline-clipboard-document-check" />
              <p class="text-[10px] text-slate-500 tracking-wider uppercase">
                治理分布
              </p>
            </div>
            <div class="mt-3 space-y-2">
              <div v-for="item in content.governanceDistribution" :key="item.key" class="operation-distribution-row">
                <div class="operation-distribution-meta">
                  <span>{{ item.label }}</span>
                  <span class="font-semibold">{{ formatNumber(item.count) }}</span>
                </div>
                <div class="operation-distribution-track">
                  <i :style="{ width: distributionWidth(item.count, content.governanceDistribution) }" />
                </div>
              </div>
            </div>
          </div>
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              需求洞察
            </div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <thead class="text-slate-500 bg-white">
                  <tr>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      查询词
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      搜索
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      点击
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      零结果
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      CTR
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in content.searchInsights" :key="item.query" class="border-b border-slate-100">
                    <td class="px-3 py-2">
                      {{ item.query }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.searchCount) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.clickCount) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.zeroResultCount) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatPercent(item.ctr) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-col gap-2 md:flex-row">
            <select v-model="contentFilters.category" class="px-2 py-1 border border-slate-200 bg-white">
              <option value="">
                全部分类
              </option>
              <option v-for="item in content.categoryDistribution" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
            <select v-model="contentFilters.governanceStatus" class="px-2 py-1 border border-slate-200 bg-white">
              <option value="">
                全部治理状态
              </option>
              <option v-for="item in content.governanceDistribution" :key="item.key" :value="item.key">
                {{ item.label }}
              </option>
            </select>
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    资源
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    竞赛/分类
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    状态
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    质量/价值/热度
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    30天搜索/点击
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in contentRows" :key="item.resourceId" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    <NuxtLink :to="item.detailPath || '/admin/resources'" class="text-sky-700">
                      {{ item.title }}
                    </NuxtLink>
                  </td>
                  <td class="px-3 py-2">
                    {{ item.contestName }} / {{ item.category }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.status }} / {{ item.governanceStatus }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.qualityScore }} / {{ item.valueScore }} / {{ item.hotScore }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.searchCount30d }} / {{ item.clickCount30d }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'revenue'" class="space-y-3">
      <section v-if="loadingByTab.revenue && !revenue" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.revenue" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.revenue }}
      </section>
      <template v-else-if="revenue">
        <section class="gap-2 grid md:grid-cols-3 xl:grid-cols-5">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-building-office-2" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              团队工作区
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.teamWorkspaceCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-credit-card" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              已绑套餐
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.planBoundWorkspaceCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-minus-circle" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              无套餐
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.noPlanWorkspaceCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-exclamation-triangle" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              超限工作区
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.overSeatWorkspaceCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-currency-dollar" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              估算金额
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatYuan(revenue.summary.estimatedAmountYuan) }}
            </p>
          </div>
        </section>

        <section class="gap-3 grid xl:grid-cols-[0.8fr,1.2fr]">
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              套餐分布
            </div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <thead class="text-slate-500 bg-white">
                  <tr>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      套餐
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      工作区数
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      估算金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in revenue.planDistribution" :key="item.planCode" class="border-b border-slate-100">
                    <td class="px-3 py-2">
                      {{ item.planName }} ({{ item.planCode }})
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.workspaceCount) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatYuan(item.estimatedAmountYuan) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="px-3 py-2 border-b border-slate-200 bg-slate-50 flex flex-col gap-2 md:flex-row">
              <select v-model="revenueFilters.planCode" class="px-2 py-1 border border-slate-200 bg-white">
                <option value="">
                  全部套餐
                </option>
                <option v-for="item in revenue.planDistribution" :key="item.planCode" :value="item.planCode">
                  {{ item.planCode }}
                </option>
              </select>
              <select v-model="revenueFilters.hasPlan" class="px-2 py-1 border border-slate-200 bg-white">
                <option value="">
                  全部工作区
                </option>
                <option value="yes">
                  已绑套餐
                </option>
                <option value="no">
                  无套餐
                </option>
              </select>
            </div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <thead class="text-slate-500 bg-white">
                  <tr>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      工作区
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      套餐/周期
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      团队席位
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      项目席位
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      估算金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in revenueRows" :key="item.workspaceId" class="border-b border-slate-100">
                    <td class="px-3 py-2">
                      <NuxtLink :to="item.detailPath || '/admin/organizations'" class="text-sky-700">
                        {{ item.workspaceName }}
                      </NuxtLink>
                    </td>
                    <td class="px-3 py-2">
                      {{ item.planName }} / {{ item.billingCycle }}
                    </td>
                    <td class="px-3 py-2">
                      {{ item.seatUsed }} / {{ item.seatLimit }}
                    </td>
                    <td class="px-3 py-2">
                      {{ item.projectSeatUsedTotal }} / {{ item.projectSeatLimitTotal }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatYuan(item.estimatedAmountYuan) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'efficiency'" class="space-y-3">
      <section v-if="loadingByTab.efficiency && !efficiency" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.efficiency" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.efficiency }}
      </section>
      <template v-else-if="efficiency">
        <section class="gap-2 grid md:grid-cols-4">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-check-circle" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              预览成功率(24h)
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatPercent(efficiency.summary.previewSuccessRate24h) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-clock" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              预览排队
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(efficiency.summary.previewQueuedCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-arrow-path-rounded-square" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              飞书运行(7天)
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(efficiency.summary.feishuRunCount7d) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-sparkles" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              AI 活跃会话(7天)
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(efficiency.summary.aiActiveSessions7d) }}
            </p>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Systems
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    系统
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    健康度
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    吞吐
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    成功率
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    积压
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    最近结果
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in efficiency.systems" :key="item.key" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700">
                      {{ item.label }}
                    </NuxtLink>
                  </td>
                  <td class="px-3 py-2">
                    <span class="text-[10px] px-2 py-1 border" :class="toneClass(item.health)">{{ item.health }}</span>
                  </td>
                  <td class="px-3 py-2">
                    {{ formatNumber(item.throughput) }} / {{ item.throughputLabel }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatPercent(item.successRate) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatNumber(item.backlog) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.lastResult }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Recent Failures
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    来源
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    标题
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    时间
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    原因
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in efficiency.recentFailures" :key="item.id" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    {{ item.source }}
                  </td>
                  <td class="px-3 py-2">
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700">
                      {{ item.title }}
                    </NuxtLink>
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDateTime(item.occurredAt) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.reason }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'meeting'" class="space-y-3">
      <section v-if="loadingByTab.meeting && !meetingRuntime" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.meeting" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.meeting }}
      </section>
      <template v-else-if="meetingRuntime">
        <section class="p-3 border border-slate-200 bg-white flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-[12px] text-slate-900 font-semibold">
              会议运行时监控
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              数据源为 Prometheus 只读聚合，每 30 秒自动刷新；后台不直连 Docker，也不执行远程命令。
            </p>
          </div>
          <div class="flex flex-wrap gap-2 items-center">
            <span class="text-[10px] px-2 py-1 border" :class="toneClass(meetingRuntime.capacity.health)">
              {{ healthLabel(meetingRuntime.capacity.health) }}
            </span>
            <span class="text-[10px] text-slate-500">
              {{ formatDateTime(meetingRuntime.generatedAt) }}
            </span>
          </div>
        </section>

        <section v-if="meetingRuntime.issues.length" class="text-amber-700 p-3 border border-amber-200 bg-amber-50 space-y-1">
          <p v-for="item in meetingRuntime.issues" :key="item">
            {{ item }}
          </p>
        </section>

        <section class="gap-2 grid md:grid-cols-3 xl:grid-cols-6">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-cpu-chip" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              CPU
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatPercent(meetingRuntime.host.cpuUsagePercent) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-circle-stack" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              内存
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatPercent(meetingRuntime.host.memoryUsagePercent) }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              {{ formatBytes(meetingRuntime.host.memoryUsedBytes) }} / {{ formatBytes(meetingRuntime.host.memoryTotalBytes) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-server-stack" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              磁盘
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatPercent(meetingRuntime.host.diskUsagePercent) }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              {{ formatBytes(meetingRuntime.host.diskUsedBytes) }} / {{ formatBytes(meetingRuntime.host.diskTotalBytes) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-arrow-up-tray" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              出站带宽
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatRate(meetingRuntime.host.networkTxBytesPerSecond) }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              累计 {{ formatBytes(meetingRuntime.host.networkTxTotalBytes) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-users" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              参会人数
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(meetingRuntime.livekit.participantCount) }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              房间 {{ formatNumber(meetingRuntime.livekit.roomCount) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-chart-bar" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              容量判断
            </p>
            <p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ meetingRuntime.capacity.estimatedSafeParticipantCount }} / {{ meetingRuntime.capacity.maxExpectedParticipants }}
            </p>
            <p class="text-[10px] text-slate-500 mt-1">
              {{ meetingRuntime.capacity.bottleneck }}
            </p>
          </div>
        </section>

        <section class="gap-3 grid xl:grid-cols-[1fr,1fr]">
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              LiveKit
            </div>
            <div class="bg-slate-100 gap-px grid grid-cols-2">
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  入站
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatRate(meetingRuntime.livekit.inboundBytesPerSecond) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  出站
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatRate(meetingRuntime.livekit.outboundBytesPerSecond) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  发布轨道
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatNumber(meetingRuntime.livekit.publishedTrackCount) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  订阅轨道
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatNumber(meetingRuntime.livekit.subscribedTrackCount) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  丢包
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatPercent(meetingRuntime.livekit.packetLossPercent) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  RTT
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatNumber(meetingRuntime.livekit.rttMs) }} ms
                </p>
              </div>
            </div>
          </div>

          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              Egress
            </div>
            <div class="bg-slate-100 gap-px grid grid-cols-2">
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  运行任务
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatNumber(meetingRuntime.egress.activeTaskCount) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  失败累计
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatNumber(meetingRuntime.egress.failedTaskCount) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  CPU
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatPercent(meetingRuntime.egress.cpuUsagePercent) }}
                </p>
              </div>
              <div class="p-3 bg-white">
                <p class="text-[10px] text-slate-500">
                  内存
                </p>
                <p class="text-[14px] font-semibold mt-1">
                  {{ formatBytes(meetingRuntime.egress.memoryUsageBytes) }}
                </p>
              </div>
              <div class="p-3 bg-white col-span-2">
                <p class="text-[10px] text-slate-500">
                  建议
                </p>
                <p class="text-[12px] text-slate-700 mt-1">
                  {{ meetingRuntime.capacity.recommendation }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Health
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    服务
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    状态
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    最近采集
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in meetingRuntime.health" :key="item.key" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    {{ item.label }}
                  </td>
                  <td class="px-3 py-2">
                    <span class="text-[10px] px-2 py-1 border" :class="toneClass(item.health)">
                      {{ item.status }}
                    </span>
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDateTime(item.lastScrapeAt) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.detail }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Containers
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    容器
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    CPU
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    内存
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    入站
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    出站
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    累计流量
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in meetingRuntime.containers" :key="item.key" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    {{ item.label }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatPercent(item.cpuUsagePercent) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatBytes(item.memoryUsageBytes) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatRate(item.networkRxBytesPerSecond) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatRate(item.networkTxBytesPerSecond) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatBytes(item.networkRxTotalBytes) }} / {{ formatBytes(item.networkTxTotalBytes) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Bandwidth Trend
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    时间
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    主机入/出
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    LiveKit 入/出
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in meetingRuntime.trend.slice(-12)" :key="item.time" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    {{ formatDateTime(item.time) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatRate(item.hostRxBytesPerSecond) }} / {{ formatRate(item.hostTxBytesPerSecond) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatRate(item.livekitRxBytesPerSecond) }} / {{ formatRate(item.livekitTxBytesPerSecond) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'risks'" class="space-y-3">
      <section v-if="loadingByTab.risks && !risks" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.risks" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.risks }}
      </section>
      <template v-else-if="risks">
        <section class="text-sky-700 p-3 border border-sky-200 bg-sky-50">
          风险页每 30 秒自动轮询刷新一次，当前刷新粒度为准实时，不引入新的实时总线。
        </section>
        <section class="gap-2 grid md:grid-cols-4">
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-exclamation-triangle" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              总风险数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.total) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-fire" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              Critical
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.critical) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-bell-alert" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              High
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.high) }}
            </p>
          </div>
          <div class="operation-metric-card">
            <span class="operation-mini-icon i-heroicons-outline-information-circle" />
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              Medium
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.medium) }}
            </p>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Alerts
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    级别
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    来源
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    标题
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    当前值/阈值
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    检测时间
                  </th>
                  <th class="px-3 py-2 text-left border-b border-slate-200">
                    说明
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in risks.alerts" :key="item.id" class="border-b border-slate-100">
                  <td class="px-3 py-2">
                    <span class="text-[10px] px-2 py-1 border" :class="toneClass(item.severity)">{{ item.severity }}</span>
                  </td>
                  <td class="px-3 py-2">
                    {{ item.source }}
                  </td>
                  <td class="px-3 py-2">
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700">
                      {{ item.title }}
                    </NuxtLink>
                  </td>
                  <td class="px-3 py-2">
                    {{ item.currentValue }} / {{ item.threshold }}
                  </td>
                  <td class="px-3 py-2">
                    {{ formatDateTime(item.detectedAt) }}
                  </td>
                  <td class="px-3 py-2">
                    {{ item.description }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activeTab === 'reports'" class="space-y-3">
      <section v-if="loadingByTab.reports && !reportSchema" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.reports" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.reports }}
      </section>
      <template v-else-if="reportSchema && currentDatasetSchema">
        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="gap-3 grid md:grid-cols-4">
            <label class="space-y-1">
              <span class="text-[10px] text-slate-500 tracking-wider uppercase">数据集</span>
              <select v-model="reportForm.dataset" class="px-2 py-1 border border-slate-200 bg-white w-full">
                <option v-for="dataset in reportSchema.datasets" :key="dataset.key" :value="dataset.key">{{ dataset.label }}</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-[10px] text-slate-500 tracking-wider uppercase">维度</span>
              <select v-model="reportForm.dimensions" multiple class="px-2 py-1 border border-slate-200 bg-white min-h-[120px] w-full">
                <option v-for="item in currentDatasetSchema.dimensions" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-[10px] text-slate-500 tracking-wider uppercase">指标</span>
              <select v-model="reportForm.metrics" multiple class="px-2 py-1 border border-slate-200 bg-white min-h-[120px] w-full">
                <option v-for="item in currentDatasetSchema.metrics" :key="item.key" :value="item.key">{{ item.label }}</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-[10px] text-slate-500 tracking-wider uppercase">预览行数</span>
              <select v-model="reportForm.limit" class="px-2 py-1 border border-slate-200 bg-white w-full">
                <option v-for="item in reportLimitOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-[10px] text-slate-500 tracking-wider uppercase">
                过滤条件
              </p>
              <button type="button" class="operation-inline-button" @click="addReportFilter">
                <span class="i-heroicons-outline-plus" />
                新增条件
              </button>
            </div>
            <div v-for="(filter, index) in reportFilters" :key="`${filter.field}-${index}`" class="gap-2 grid md:grid-cols-[1fr,0.8fr,1fr,auto]">
              <select v-model="filter.field" class="px-2 py-1 border border-slate-200 bg-white" @change="syncReportDefaults()">
                <option v-for="field in currentDatasetSchema.filters" :key="field.key" :value="field.key">
                  {{ field.label }}
                </option>
              </select>
              <select v-model="filter.operator" class="px-2 py-1 border border-slate-200 bg-white">
                <option v-for="operator in (getReportField(filter.field)?.operators || ['eq'])" :key="operator" :value="operator">
                  {{ operator }}
                </option>
              </select>
              <input v-model="filter.value" class="px-2 py-1 border border-slate-200 bg-white" placeholder="条件值">
              <button type="button" class="operation-inline-button" @click="removeReportFilter(index)">
                <span class="i-heroicons-outline-trash" />
                删除
              </button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="operation-primary-button" :disabled="reportBusy" @click="queryReport">
              <span class="i-heroicons-outline-document-magnifying-glass" />
              {{ reportBusy ? '查询中...' : '预览报表' }}
            </button>
            <button type="button" class="operation-inline-button" :disabled="exportBusy" @click="exportReport">
              <span class="i-heroicons-outline-arrow-down-tray" />
              {{ exportBusy ? '导出中...' : '导出 CSV' }}
            </button>
          </div>
          <p v-if="reportError" class="text-rose-700">
            {{ reportError }}
          </p>
        </section>

        <section v-if="reportPreview" class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
            Preview / 共 {{ formatNumber(reportPreview.total) }} 组
          </div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white">
                <tr>
                  <th v-for="column in reportPreview.columns" :key="column.key" class="px-3 py-2 text-left border-b border-slate-200">
                    {{ column.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, index) in reportPreview.rows" :key="index" class="border-b border-slate-100">
                  <td v-for="column in reportPreview.columns" :key="column.key" class="px-3 py-2">
                    {{ row[column.key] ?? '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </section>
  </div>
</template>

<style scoped>
.operation-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #172033;
  font-size: 12px;
}

.operation-shell,
.operation-panel,
.operation-kpi-card,
.operation-metric-card {
  border: 1px solid #e1eaf5;
  border-radius: 12px;
  background: #fff;
}

.operation-shell {
  padding: 16px 18px;
}

.operation-shell-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 768px) {
  .operation-shell-head {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.operation-eyebrow {
  margin: 0;
  color: #5b7cd8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.operation-title {
  margin: 6px 0 0;
  color: #112849;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 800;
}

.operation-description,
.operation-section-desc,
.operation-tab-summary,
.operation-kpi-hint,
.operation-sla-target,
.operation-sla-hint,
.operation-insight-desc,
.operation-insight-action,
.operation-todo-desc {
  color: #6f7f96;
}

.operation-description {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.6;
}

.operation-header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.operation-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe6f4;
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.operation-icon-button,
.operation-inline-button,
.operation-primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #dbe6f4;
  border-radius: 8px;
  padding: 6px 10px;
  background: #fff;
  color: #243b5a;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}

.operation-primary-button {
  border-color: #10223f;
  background: #10223f;
  color: #fff;
}

.operation-icon-button:disabled,
.operation-inline-button:disabled,
.operation-primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.operation-tabs {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  margin: 14px -18px -16px;
  overflow: hidden;
  border-top: 1px solid #e7eef7;
}

.operation-tab {
  display: flex;
  min-height: 78px;
  align-items: flex-start;
  gap: 9px;
  border-right: 1px solid #e7eef7;
  border-bottom: 1px solid #e7eef7;
  background: #fff;
  padding: 12px 14px;
  text-align: left;
}

.operation-tab.is-active {
  background: #f5f8fc;
}

.operation-tab-label {
  display: block;
  color: #122544;
  font-size: 13px;
  font-weight: 700;
}

.operation-tab-summary {
  display: block;
  margin: 5px 0 0;
  font-size: 11px;
  line-height: 1.45;
}

.operation-tab-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: #315b9c;
}

.operation-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.operation-panel {
  padding: 16px;
  overflow: hidden;
}

.operation-panel--compact {
  padding: 13px;
}

.operation-panel--trend {
  min-width: 0;
}

.operation-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.operation-section-title {
  margin: 0;
  color: #112849;
  font-size: 16px;
  line-height: 1.2;
  font-weight: 800;
}

.operation-section-desc {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.55;
}

.operation-kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.operation-kpi-card {
  display: block;
  min-width: 0;
  padding: 15px;
  text-decoration: none;
}

.operation-kpi-head,
.operation-subhead {
  display: flex;
  align-items: center;
  gap: 8px;
}

.operation-metric-card {
  min-width: 0;
  padding: 13px;
}

.operation-mini-icon {
  display: inline-flex;
  width: 17px;
  height: 17px;
  color: #315b9c;
}

.operation-kpi-label,
.operation-sla-label {
  margin: 0;
  color: #74849c;
  font-size: 11px;
  line-height: 1.4;
  font-weight: 700;
}

.operation-kpi-value,
.operation-sla-value {
  margin: 9px 0 0;
  color: #10223f;
  font-size: 24px;
  line-height: 1.05;
  font-weight: 800;
}

.operation-kpi-hint {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
}

.operation-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.75fr);
  gap: 14px;
}

.operation-overview-grid--balanced {
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.85fr);
}

.operation-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px 12px;
}

.operation-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #63758e;
  font-size: 11px;
  white-space: nowrap;
}

.operation-legend-item i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.operation-chart {
  min-width: 0;
}

.operation-chart-svg {
  display: block;
  width: 100%;
  min-height: 260px;
}

.operation-chart-grid-line {
  stroke: #dce6f2;
  stroke-width: 1;
}

.operation-chart-axis {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #8390a4;
  font-size: 10px;
}

.operation-insight-list,
.operation-todo-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.operation-insight-item,
.operation-sla-card,
.operation-todo-item {
  border: 1px solid #e7eef7;
  border-radius: 14px;
  background: #fff;
}

.operation-insight-item {
  padding: 12px;
}

.operation-insight-title,
.operation-todo-label {
  margin: 0;
  color: #112849;
  font-size: 13px;
  line-height: 1.35;
  font-weight: 800;
}

.operation-insight-desc,
.operation-insight-action,
.operation-todo-desc {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.55;
}

.operation-insight-action {
  color: #405774;
  font-weight: 700;
}

.operation-ai-panel {
  min-width: 0;
}

.operation-ai-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.operation-ai-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  border: 1px solid #e7eef7;
  border-radius: 12px;
  padding: 12px;
}

.operation-ai-summary-icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
  border-radius: 8px;
}

.operation-ai-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.operation-ai-list-title {
  margin: 0 0 6px;
  color: #112849;
  font-size: 11px;
  font-weight: 800;
}

.operation-ai-list {
  margin: 0;
  padding-left: 16px;
  color: #405774;
  font-size: 11px;
  line-height: 1.6;
}

.operation-ai-citations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.operation-ai-error {
  margin: 10px 0 0;
  color: #be123c;
  font-size: 11px;
  line-height: 1.5;
}

.operation-distribution-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.operation-distribution-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.operation-distribution-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf3fb;
}

.operation-distribution-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #5b7cd8;
}

.operation-sla-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.operation-sla-card {
  min-width: 0;
  padding: 13px;
}

.operation-sla-value {
  font-size: 20px;
}

.operation-sla-target,
.operation-sla-hint {
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.45;
}

.operation-todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  text-decoration: none;
}

.operation-empty {
  border: 1px dashed #dbe6f4;
  border-radius: 14px;
  padding: 20px;
  color: #7a8aa2;
  text-align: center;
}

.operation-tone-info {
  border-color: #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
}

.operation-tone-success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #047857;
}

.operation-tone-warning {
  border-color: #fde68a;
  background: #fffbeb;
  color: #b45309;
}

.operation-tone-danger {
  border-color: #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.operation-tone-neutral {
  border-color: #dbe6f4;
  background: #f8fafc;
  color: #475569;
}

@media (max-width: 1280px) {
  .operation-tabs {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .operation-kpi-grid,
  .operation-sla-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .operation-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .operation-overview-grid,
  .operation-overview-grid--balanced {
    grid-template-columns: 1fr;
  }

  .operation-kpi-grid,
  .operation-sla-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .operation-header-meta,
  .operation-panel-head,
  .operation-legend {
    justify-content: flex-start;
  }

  .operation-panel-head {
    flex-direction: column;
  }

  .operation-tabs {
    grid-template-columns: 1fr;
  }

  .operation-ai-columns {
    grid-template-columns: 1fr;
  }

  .operation-kpi-grid,
  .operation-sla-grid {
    grid-template-columns: 1fr;
  }

  .operation-title {
    font-size: 20px;
  }
}
</style>
