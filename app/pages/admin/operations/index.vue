<script setup lang="ts">
import type {
  AdminContentTraceSnapshot,
  AdminEfficiencySnapshot,
  AdminMeetingRuntimeSnapshot,
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

definePageMeta({
  layout: 'admin',
})

const RISK_POLLING_INTERVAL_MS = 30_000
const MEETING_POLLING_INTERVAL_MS = 30_000

const tabs: Array<{ key: AdminOperationsTab, label: string, summary: string }> = [
  { key: 'overview', label: '总览', summary: '平台指标、趋势与待处理事项' },
  { key: 'users', label: '用户', summary: '用户分层画像与筛选表格' },
  { key: 'content', label: '内容', summary: '资源规模、热度、治理与审计链路' },
  { key: 'revenue', label: '营收', summary: '套餐、席位、项目配额与估算金额' },
  { key: 'efficiency', label: '效能', summary: 'Worker、同步与 AI 使用效能' },
  { key: 'meeting', label: '会议', summary: 'LiveKit、Egress、机器与带宽监控' },
  { key: 'risks', label: '风险', summary: '准实时轮询风险监控与告警' },
  { key: 'reports', label: '报表', summary: '零代码临时报表与 CSV 导出' },
]

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

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
const reportSchema = ref<AdminReportSchema | null>(null)
const reportPreview = ref<AdminReportResult | null>(null)

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

function toneClass(kind: string): string {
  if (kind === 'danger' || kind === 'critical')
    return 'text-rose-700 border-rose-200 bg-rose-50'
  if (kind === 'warning' || kind === 'high')
    return 'text-amber-700 border-amber-200 bg-amber-50'
  if (kind === 'success' || kind === 'healthy')
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  return 'text-sky-700 border-sky-200 bg-sky-50'
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
    errorByTab.reports = String(error?.data?.message || '报表配置加载失败。')
  }
  finally {
    loadingByTab.reports = false
  }
}

async function ensureTabLoaded(tab: AdminOperationsTab, force = false) {
  if (tab === 'overview')
    return loadOverview(force)
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
      throw new Error(String(errorPayload?.message || '导出失败'))
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
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
            运营管控
          </h1>
          <p class="text-[11px] text-slate-500 mt-1">
            基于现有后台能力聚合运营、内容、营收、效能、风险与报表数据，一期先打通可看、可查、可筛选、可预警、可追溯。
          </p>
        </div>
        <div class="text-[10px] text-slate-500">
          入口固定在 <code>/admin/operations</code>，底层配置修改仍回到原有页面处理。
        </div>
      </div>
    </section>

    <section class="border border-slate-200 bg-white overflow-hidden">
      <div class="grid md:grid-cols-4 xl:grid-cols-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="px-3 py-3 text-left border-b border-r border-slate-200 transition-colors last:border-r-0 hover:bg-slate-50"
          :class="activeTab === tab.key ? 'bg-slate-100' : 'bg-white'"
          @click="switchTab(tab.key)"
        >
          <p class="text-[12px] text-slate-900 font-semibold">
            {{ tab.label }}
          </p>
          <p class="text-[10px] text-slate-500 mt-1">
            {{ tab.summary }}
          </p>
        </button>
      </div>
    </section>

    <section v-if="activeTab === 'overview'" class="space-y-3">
      <section v-if="loadingByTab.overview && !overview" class="p-3 border border-slate-200 bg-white">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="10" />
        </a-skeleton>
      </section>
      <section v-else-if="errorByTab.overview" class="text-rose-700 p-3 border border-rose-200 bg-rose-50">
        {{ errorByTab.overview }}
      </section>
      <template v-else-if="overview">
        <section class="gap-2 grid md:grid-cols-3 xl:grid-cols-4">
          <NuxtLink
            v-for="card in overview.cards"
            :key="card.key"
            :to="card.detailPath || '/admin/operations'"
            class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
          >
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              {{ card.label }}
            </p>
            <p class="text-[18px] text-slate-900 font-bold mt-2">
              {{ typeof card.value === 'number' && String(card.value).includes('.') ? Number(card.value).toFixed(2) : formatNumber(card.value) }}
            </p>
          </NuxtLink>
        </section>

        <section class="gap-3 grid xl:grid-cols-[1.3fr,0.9fr]">
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              Trend
            </div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <thead class="text-slate-500 bg-white">
                  <tr>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      日期
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      新增用户
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      活跃用户
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      搜索事件
                    </th>
                    <th class="px-3 py-2 text-left border-b border-slate-200">
                      治理任务
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in overview.trend" :key="item.date" class="border-b border-slate-100">
                    <td class="px-3 py-2">
                      {{ item.date }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.newUsers) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.activeUsers) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.searchEvents) }}
                    </td>
                    <td class="px-3 py-2">
                      {{ formatNumber(item.governanceTasks) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
              Todo
            </div>
            <div class="divide-slate-100 divide-y">
              <NuxtLink
                v-for="item in overview.todos"
                :key="item.key"
                :to="item.detailPath || '/admin/operations'"
                class="px-3 py-3 block hover:bg-slate-50"
              >
                <div class="flex gap-3 items-center justify-between">
                  <p class="text-[12px] text-slate-900 font-semibold">
                    {{ item.label }}
                  </p>
                  <span class="text-[10px] px-2 py-1 border" :class="toneClass(item.tone)">
                    {{ formatNumber(item.count) }}
                  </span>
                </div>
                <p class="text-[10px] text-slate-500 mt-1">
                  {{ item.description }}
                </p>
              </NuxtLink>
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
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              用户总量
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.totalUsers) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              活跃用户(7天)
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.activeUsers7d) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              停用账号
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.disabledUsers) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              平台管理员
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.platformAdmins) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              新增用户(30天)
            </p><p class="text-[16px] text-slate-900 font-bold mt-2">
              {{ formatNumber(users.summary.newUsers30d) }}
            </p>
          </div>
        </section>

        <section class="gap-2 grid xl:grid-cols-3">
          <div v-for="(bucketList, label) in users.dimensions" :key="label" class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              {{ label }}
            </p>
            <div class="mt-3 space-y-2">
              <div v-for="item in bucketList" :key="item.key" class="flex items-center justify-between">
                <span class="text-slate-700">{{ item.label }}</span>
                <span class="text-slate-900 font-semibold">{{ formatNumber(item.count) }}</span>
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
                    <NuxtLink :to="item.detailPath || '/admin/users'" class="text-sky-700 hover:underline">
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
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              竞赛数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.contestCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              资源数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.resourceCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              治理待处理
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.governancePendingCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              30天搜索/点击
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.searchCount30d) }} / {{ formatNumber(content.summary.clickCount30d) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              文档待处理/失败
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(content.summary.documentPendingCount) }} / {{ formatNumber(content.summary.documentFailedCount) }}
            </p>
          </div>
        </section>

        <section class="gap-3 grid xl:grid-cols-[0.8fr,0.8fr,1.2fr]">
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              分类分布
            </p>
            <div class="mt-3 space-y-2">
              <div v-for="item in content.categoryDistribution" :key="item.key" class="flex items-center justify-between">
                <span>{{ item.label }}</span>
                <span class="font-semibold">{{ formatNumber(item.count) }}</span>
              </div>
            </div>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              治理分布
            </p>
            <div class="mt-3 space-y-2">
              <div v-for="item in content.governanceDistribution" :key="item.key" class="flex items-center justify-between">
                <span>{{ item.label }}</span>
                <span class="font-semibold">{{ formatNumber(item.count) }}</span>
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
                    <NuxtLink :to="item.detailPath || '/admin/resources'" class="text-sky-700 hover:underline">
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
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              团队工作区
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.teamWorkspaceCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              已绑套餐
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.planBoundWorkspaceCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              无套餐
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.noPlanWorkspaceCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              超限工作区
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(revenue.summary.overSeatWorkspaceCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
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
                      <NuxtLink :to="item.detailPath || '/admin/organizations'" class="text-sky-700 hover:underline">
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
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              预览成功率(24h)
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatPercent(efficiency.summary.previewSuccessRate24h) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              预览排队
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(efficiency.summary.previewQueuedCount) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              飞书运行(7天)
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(efficiency.summary.feishuRunCount7d) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
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
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700 hover:underline">
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
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700 hover:underline">
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
        <section class="text-sky-700 p-3 border border-sky-200 bg-sky-50">
          Prometheus 只读聚合，30 秒自动刷新；后台不执行 SSH，也不直连 Docker socket。
        </section>

        <section v-if="meetingRuntime.issues.length" class="text-amber-700 p-3 border border-amber-200 bg-amber-50 space-y-1">
          <p v-for="item in meetingRuntime.issues" :key="item">
            {{ item }}
          </p>
        </section>

        <section class="gap-2 grid md:grid-cols-3 xl:grid-cols-5">
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">CPU</p>
            <p class="text-[16px] font-bold mt-2">{{ formatPercent(meetingRuntime.host.cpuUsagePercent) }}</p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">内存</p>
            <p class="text-[16px] font-bold mt-2">{{ formatPercent(meetingRuntime.host.memoryUsagePercent) }}</p>
            <p class="text-[10px] text-slate-500 mt-1">{{ formatBytes(meetingRuntime.host.memoryUsedBytes) }} / {{ formatBytes(meetingRuntime.host.memoryTotalBytes) }}</p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">出站带宽</p>
            <p class="text-[16px] font-bold mt-2">{{ formatRate(meetingRuntime.host.networkTxBytesPerSecond) }}</p>
            <p class="text-[10px] text-slate-500 mt-1">累计 {{ formatBytes(meetingRuntime.host.networkTxTotalBytes) }}</p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">在线参会</p>
            <p class="text-[16px] font-bold mt-2">{{ formatNumber(meetingRuntime.livekit.participantCount) }}</p>
            <p class="text-[10px] text-slate-500 mt-1">房间 {{ formatNumber(meetingRuntime.livekit.roomCount) }}</p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">5人容量</p>
            <p class="text-[16px] font-bold mt-2">{{ meetingRuntime.capacity.estimatedSafeParticipantCount }} / {{ meetingRuntime.capacity.maxExpectedParticipants }}</p>
            <p class="text-[10px] text-slate-500 mt-1">{{ healthLabel(meetingRuntime.capacity.health) }} / {{ meetingRuntime.capacity.bottleneck }}</p>
          </div>
        </section>

        <section class="gap-3 grid xl:grid-cols-[1fr,1fr]">
          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">LiveKit / Egress</div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <tbody>
                  <tr class="border-b border-slate-100"><td class="px-3 py-2 text-slate-500">LiveKit 入/出站</td><td class="px-3 py-2">{{ formatRate(meetingRuntime.livekit.inboundBytesPerSecond) }} / {{ formatRate(meetingRuntime.livekit.outboundBytesPerSecond) }}</td></tr>
                  <tr class="border-b border-slate-100"><td class="px-3 py-2 text-slate-500">轨道发布/订阅</td><td class="px-3 py-2">{{ formatNumber(meetingRuntime.livekit.publishedTrackCount) }} / {{ formatNumber(meetingRuntime.livekit.subscribedTrackCount) }}</td></tr>
                  <tr class="border-b border-slate-100"><td class="px-3 py-2 text-slate-500">丢包 / RTT</td><td class="px-3 py-2">{{ formatPercent(meetingRuntime.livekit.packetLossPercent) }} / {{ formatNumber(meetingRuntime.livekit.rttMs) }} ms</td></tr>
                  <tr class="border-b border-slate-100"><td class="px-3 py-2 text-slate-500">Egress 运行/失败</td><td class="px-3 py-2">{{ formatNumber(meetingRuntime.egress.activeTaskCount) }} / {{ formatNumber(meetingRuntime.egress.failedTaskCount) }}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="border border-slate-200 bg-white overflow-hidden">
            <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">Health</div>
            <div class="overflow-auto">
              <table class="text-[11px] min-w-full">
                <thead class="text-slate-500 bg-white"><tr><th class="px-3 py-2 text-left border-b border-slate-200">服务</th><th class="px-3 py-2 text-left border-b border-slate-200">状态</th><th class="px-3 py-2 text-left border-b border-slate-200">说明</th></tr></thead>
                <tbody>
                  <tr v-for="item in meetingRuntime.health" :key="item.key" class="border-b border-slate-100">
                    <td class="px-3 py-2">{{ item.label }}</td>
                    <td class="px-3 py-2"><span class="text-[10px] px-2 py-1 border" :class="toneClass(item.health)">{{ item.status }}</span></td>
                    <td class="px-3 py-2">{{ item.detail }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section class="border border-slate-200 bg-white overflow-hidden">
          <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">Containers / 最近 {{ formatDateTime(meetingRuntime.generatedAt) }}</div>
          <div class="overflow-auto">
            <table class="text-[11px] min-w-full">
              <thead class="text-slate-500 bg-white"><tr><th class="px-3 py-2 text-left border-b border-slate-200">容器</th><th class="px-3 py-2 text-left border-b border-slate-200">CPU</th><th class="px-3 py-2 text-left border-b border-slate-200">内存</th><th class="px-3 py-2 text-left border-b border-slate-200">入/出站</th></tr></thead>
              <tbody>
                <tr v-for="item in meetingRuntime.containers" :key="item.key" class="border-b border-slate-100">
                  <td class="px-3 py-2">{{ item.label }}</td>
                  <td class="px-3 py-2">{{ formatPercent(item.cpuUsagePercent) }}</td>
                  <td class="px-3 py-2">{{ formatBytes(item.memoryUsageBytes) }}</td>
                  <td class="px-3 py-2">{{ formatRate(item.networkRxBytesPerSecond) }} / {{ formatRate(item.networkTxBytesPerSecond) }}</td>
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
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              总风险数
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.total) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              Critical
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.critical) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
            <p class="text-[10px] text-slate-500 tracking-wider uppercase">
              High
            </p><p class="text-[16px] font-bold mt-2">
              {{ formatNumber(risks.summary.high) }}
            </p>
          </div>
          <div class="p-3 border border-slate-200 bg-white">
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
                    <NuxtLink :to="item.detailPath || '/admin/operations'" class="text-sky-700 hover:underline">
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
              <button type="button" class="px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50" @click="addReportFilter">
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
              <button type="button" class="px-2 py-1 border border-slate-200 bg-white hover:bg-slate-50" @click="removeReportFilter(index)">
                删除
              </button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="text-white px-3 py-2 border border-slate-200 bg-slate-900 hover:bg-slate-800" :disabled="reportBusy" @click="queryReport">
              {{ reportBusy ? '查询中...' : '预览报表' }}
            </button>
            <button type="button" class="px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50" :disabled="exportBusy" @click="exportReport">
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
