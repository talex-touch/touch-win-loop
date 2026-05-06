<script setup lang="ts">
import type {
  AdminOperationsMetricCard,
  AdminOperationsOverview,
  AdminOperationsTrendPoint,
} from '~~/shared/types/admin-operations'
import type {
  ApiResponse,
  AuthMeResult,
  FeishuIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

type BuildValueSource = 'env' | 'runtime' | 'missing'
type AccentTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate'

interface FeishuIntegrationConfigView extends FeishuIntegrationConfig {
  startupEffectiveVersion?: string
  startupEffectiveCommitSha?: string
  startupVersionSource?: BuildValueSource
  startupCommitShaSource?: BuildValueSource
}

interface HomeEntryCard {
  key: string
  title: string
  description: string
  to: string
  icon: string
  tone: AccentTone
  action: string
}

interface StatusCard {
  key: string
  label: string
  value: string
  hint: string
  icon: string
  tone: AccentTone
}

interface TrendChartDot {
  x: number
  y: number
  label: string
  value: number
}

interface TrendChartShape {
  width: number
  height: number
  polyline: string
  area: string
  dots: TrendChartDot[]
}

const authApiFetch = useAuthApiFetch()
const route = useRoute()

const loading = ref(true)
const errorText = ref('')
const buildInfoError = ref('')
const overviewError = ref('')
const copyFeedback = ref('')
const permissions = ref<PlatformPermission[]>([])
const currentUserName = ref('管理员')
const isPlatformAdminUser = ref(false)
const buildInfo = ref<{
  version: string
  commitSha: string
  versionSource: BuildValueSource
  commitShaSource: BuildValueSource
} | null>(null)
const overview = ref<AdminOperationsOverview | null>(null)

let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const canManageContest = computed(() => {
  return isPlatformAdminUser.value || permissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive'].includes(item),
  )
})
const canManagePricing = computed(() => isPlatformAdminUser.value || permissions.value.includes('pricing.write'))
const canManageRoles = computed(() => isPlatformAdminUser.value || permissions.value.includes('role.assign'))
const canManageUsers = computed(() => isPlatformAdminUser.value || permissions.value.includes('user.read'))
const canManageIntegrations = computed(() => canManageRoles.value || canManageContest.value)
const canManageRuntimeSettings = computed(() => isPlatformAdminUser.value || permissions.value.includes('contest.write'))
const canPublishNotifications = computed(() => isPlatformAdminUser.value || permissions.value.includes('contest.write'))
const canViewOperations = computed(() => canManageContest.value)
const canViewStorageService = computed(() => isPlatformAdminUser.value || permissions.value.includes('contest.read_internal'))
const hasAnyAdminAccess = computed(() => {
  return canManageContest.value || canManagePricing.value || canManageRoles.value || canManageUsers.value || canManageRuntimeSettings.value
})

function buildValueSourceLabel(source: BuildValueSource): string {
  if (source === 'env')
    return '环境变量'
  if (source === 'runtime')
    return '构建推导'
  return '未命中'
}

function formatNumber(value: unknown): string {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatMetricValue(card?: AdminOperationsMetricCard | null): string {
  if (!card)
    return '-'
  if (card.unit)
    return `${formatNumber(card.value)} ${card.unit}`
  return formatNumber(card.value)
}

function formatDateTime(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatShortDate(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text)
    return '--'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text.slice(5)
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toneClass(tone: AccentTone): string {
  return `tone-${tone}`
}

function findMetric(key: string): AdminOperationsMetricCard | null {
  return overview.value?.cards.find(item => item.key === key) || null
}

function resetCopyFeedbackLater() {
  if (copyFeedbackTimer)
    clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => {
    copyFeedback.value = ''
  }, 2200)
}

function buildTrendChart(points: AdminOperationsTrendPoint[]): TrendChartShape {
  const width = 560
  const height = 208
  const padX = 18
  const padTop = 18
  const padBottom = 30
  if (points.length === 0) {
    return {
      width,
      height,
      polyline: '',
      area: '',
      dots: [],
    }
  }

  const values = points.map(item => item.activeUsers)
  const maxValue = Math.max(...values)
  const minValue = Math.min(...values)
  const range = Math.max(maxValue - minValue, 1)
  const usableWidth = width - (padX * 2)
  const usableHeight = height - padTop - padBottom
  const stepX = points.length > 1 ? usableWidth / (points.length - 1) : 0

  const dots = points.map((point, index) => {
    const x = padX + (stepX * index)
    const normalized = (point.activeUsers - minValue) / range
    const y = height - padBottom - (normalized * usableHeight)
    return {
      x,
      y,
      label: formatShortDate(point.date),
      value: point.activeUsers,
    }
  })

  const polyline = dots.map(dot => `${dot.x},${dot.y}`).join(' ')
  const first = dots[0]
  const last = dots[dots.length - 1]
  if (!first || !last) {
    return {
      width,
      height,
      polyline: '',
      area: '',
      dots: [],
    }
  }
  const area = `M ${first.x} ${height - padBottom} L ${dots.map(dot => `${dot.x} ${dot.y}`).join(' L ')} L ${last.x} ${height - padBottom} Z`

  return {
    width,
    height,
    polyline,
    area,
    dots,
  }
}

const summaryRows = computed(() => {
  return [
    { label: '赛事内容管理', value: canManageContest.value ? '已授权' : '未授权' },
    { label: '计费规则管理', value: canManagePricing.value ? '已授权' : '未授权' },
    { label: '平台角色分配', value: canManageRoles.value ? '已授权' : '未授权' },
    { label: '当前权限数', value: String(permissions.value.length) },
  ]
})

const pendingTodoCount = computed(() => {
  return (overview.value?.todos || []).reduce((total, item) => total + Number(item.count || 0), 0)
})

const statusCards = computed<StatusCard[]>(() => {
  const riskMetric = findMetric('risk-count')
  const activeUsersMetric = findMetric('active-users')
  const syncFailureMetric = findMetric('sync-failures') || findMetric('open-sync-issues')
  const hasFullAdminCapability = canManageContest.value && canManagePricing.value && canManageRoles.value

  return [
    {
      key: 'permission',
      label: '权限状态',
      value: hasAnyAdminAccess.value ? (hasFullAdminCapability ? '已授权' : '部分授权') : '未授权',
      hint: `${permissions.value.length} 项平台权限可用`,
      icon: 'i-heroicons-outline-shield-check',
      tone: hasAnyAdminAccess.value ? 'emerald' : 'rose',
    },
    {
      key: 'build',
      label: '服务状态',
      value: buildInfo.value?.version ? '运行正常' : (canManageRoles.value ? '待读取' : '待授权'),
      hint: buildInfo.value?.version ? `版本 ${buildInfo.value.version}` : '构建标识依赖角色权限读取',
      icon: 'i-heroicons-outline-server-stack',
      tone: buildInfo.value?.version ? 'blue' : 'slate',
    },
    {
      key: 'worker',
      label: 'Worker 状态',
      value: syncFailureMetric?.value ? `${formatNumber(syncFailureMetric.value)} 异常` : '无明显异常',
      hint: syncFailureMetric?.hint || '同步与后台任务近 7 天告警',
      icon: 'i-heroicons-outline-cpu-chip',
      tone: syncFailureMetric?.value ? 'amber' : 'violet',
    },
    {
      key: 'active-users',
      label: '活跃用户',
      value: activeUsersMetric ? formatMetricValue(activeUsersMetric) : '-',
      hint: activeUsersMetric?.hint || '近 7 天平台活跃度',
      icon: 'i-heroicons-outline-user-group',
      tone: 'blue',
    },
    {
      key: 'todo',
      label: '待处理事项',
      value: pendingTodoCount.value > 0 ? `${formatNumber(pendingTodoCount.value)} 项` : '已清空',
      hint: overview.value?.todos.length ? `${overview.value.todos.length} 类任务待跟进` : '暂无运营待办',
      icon: 'i-heroicons-outline-clipboard-document-check',
      tone: pendingTodoCount.value > 0 ? 'amber' : 'emerald',
    },
    {
      key: 'risk',
      label: '错误 / 告警',
      value: riskMetric ? formatMetricValue(riskMetric) : '-',
      hint: riskMetric?.hint || '未闭环风险与平台告警',
      icon: 'i-heroicons-outline-exclamation-circle',
      tone: Number(riskMetric?.value || 0) > 0 ? 'rose' : 'slate',
    },
  ]
})

const homeEntries = computed<HomeEntryCard[]>(() => {
  const candidates: Array<HomeEntryCard & { visible: boolean }> = [
    {
      key: 'users',
      title: '用户管理',
      description: '管理用户状态、角色和访问会话。',
      to: '/admin/users',
      icon: 'i-heroicons-outline-users',
      tone: 'blue',
      action: '进入管理',
      visible: canManageUsers.value,
    },
    {
      key: 'contests',
      title: '赛事管理',
      description: '维护赛事主数据、赛道、时间轴与规则。',
      to: '/admin/contests',
      icon: 'i-heroicons-outline-academic-cap',
      tone: 'emerald',
      action: '进入管理',
      visible: canManageContest.value,
    },
    {
      key: 'resources',
      title: '资料中心',
      description: '统一管理资料分类、状态和内容可访问性。',
      to: '/admin/resources',
      icon: 'i-heroicons-outline-folder-open',
      tone: 'violet',
      action: '进入管理',
      visible: canManageContest.value,
    },
    {
      key: 'release-queue',
      title: '发布审批',
      description: '集中处理待初审、待二审与待发布的版本队列。',
      to: '/admin/releases/queue',
      icon: 'i-heroicons-outline-clipboard-document-list',
      tone: 'amber',
      action: '进入审批',
      visible: canManageContest.value,
    },
    {
      key: 'policies',
      title: '政策库',
      description: '查看政策库内容与对应版本发布流。',
      to: '/admin/policies',
      icon: 'i-heroicons-outline-book-open',
      tone: 'emerald',
      action: '进入管理',
      visible: canManageContest.value,
    },
    {
      key: 'ai-prompts',
      title: 'AI 配置',
      description: '配置 Embeddings、模型参数与后台密钥。',
      to: '/admin/ai-prompts',
      icon: 'i-heroicons-outline-sparkles',
      tone: 'blue',
      action: '进入配置',
      visible: canManageContest.value,
    },
    {
      key: 'operations',
      title: '运行监控',
      description: '查看平台指标、风险、任务趋势和运营异常。',
      to: '/admin/operations',
      icon: 'i-heroicons-outline-chart-bar',
      tone: 'amber',
      action: '进入监控',
      visible: canViewOperations.value,
    },
    {
      key: 'runtime-settings',
      title: '系统设置',
      description: '维护运行参数、调度策略与平台基础配置。',
      to: '/admin/runtime-settings',
      icon: 'i-heroicons-outline-cog-6-tooth',
      tone: 'slate',
      action: '进入设置',
      visible: canManageRuntimeSettings.value,
    },
    {
      key: 'storage-service',
      title: '存储服务',
      description: '查看对象存储容量、水位、流量与渠道配置。',
      to: '/admin/storage-service',
      icon: 'i-heroicons-outline-server-stack',
      tone: 'blue',
      action: '查看存储',
      visible: canViewStorageService.value,
    },
    {
      key: 'notifications',
      title: '通知管理',
      description: '发布平台通知，按全局或 workspace 下发。',
      to: '/admin/notifications',
      icon: 'i-heroicons-outline-bell',
      tone: 'violet',
      action: '进入通知',
      visible: canPublishNotifications.value,
    },
    {
      key: 'integrations',
      title: '集成中心',
      description: '管理飞书、OAuth 与外部系统接入。',
      to: '/admin/integrations',
      icon: 'i-heroicons-outline-puzzle-piece',
      tone: 'emerald',
      action: '进入集成',
      visible: canManageIntegrations.value,
    },
  ]

  return candidates.filter(item => item.visible).slice(0, 6)
})

const spotlightMetrics = computed(() => {
  const preferredKeys = ['total-users', 'active-users', 'contest-count', 'resource-count', 'estimated-revenue']
  const cards = overview.value?.cards || []
  const selected = preferredKeys
    .map(key => cards.find(item => item.key === key))
    .filter((item): item is AdminOperationsMetricCard => Boolean(item))
  return selected.length > 0 ? selected.slice(0, 4) : cards.slice(0, 4)
})

const todoPreview = computed(() => (overview.value?.todos || []).slice(0, 4))
const trendPoints = computed(() => overview.value?.trend || [])
const trendChart = computed(() => buildTrendChart(trendPoints.value))
const latestTrendPoint = computed(() => trendPoints.value[trendPoints.value.length - 1] || null)
const peakTrendPoint = computed(() => {
  return trendPoints.value.reduce<AdminOperationsTrendPoint | null>((highest, point) => {
    if (!highest || point.activeUsers > highest.activeUsers)
      return point
    return highest
  }, null)
})

const buildIdentityRows = computed(() => {
  return [
    {
      label: '当前生效版本',
      value: buildInfo.value?.version || '-',
      hint: `来源：${buildValueSourceLabel(buildInfo.value?.versionSource || 'missing')}`,
    },
    {
      label: '当前 Commit',
      value: buildInfo.value?.commitSha || '-',
      hint: `来源：${buildValueSourceLabel(buildInfo.value?.commitShaSource || 'missing')}`,
    },
    {
      label: '最近洞察刷新',
      value: formatDateTime(overview.value?.generatedAt),
      hint: overviewError.value || '来自 /admin/operations/overview',
    },
  ]
})

async function copyBuildIdentity() {
  if (!import.meta.client || !navigator.clipboard?.writeText || !buildInfo.value)
    return
  try {
    const payload = [
      `version=${buildInfo.value.version || '-'}`,
      `commit=${buildInfo.value.commitSha || '-'}`,
      `versionSource=${buildValueSourceLabel(buildInfo.value.versionSource)}`,
      `commitSource=${buildValueSourceLabel(buildInfo.value.commitShaSource)}`,
    ].join('\n')
    await navigator.clipboard.writeText(payload)
    copyFeedback.value = '构建标识已复制'
  }
  catch {
    copyFeedback.value = '复制失败'
  }
  resetCopyFeedbackLater()
}

async function loadBuildInfo() {
  buildInfo.value = null
  buildInfoError.value = ''
  if (!canManageRoles.value)
    return
  try {
    const response = await authApiFetch<ApiResponse<FeishuIntegrationConfigView>>('/admin/integrations/feishu/config')
    buildInfo.value = {
      version: String(response.data.startupEffectiveVersion || '').trim(),
      commitSha: String(response.data.startupEffectiveCommitSha || '').trim(),
      versionSource: response.data.startupVersionSource || 'missing',
      commitShaSource: response.data.startupCommitShaSource || 'missing',
    }
  }
  catch (error: any) {
    buildInfoError.value = String(error?.data?.message || '构建标识加载失败。')
  }
}

async function loadOverview() {
  overview.value = null
  overviewError.value = ''
  if (!canViewOperations.value)
    return
  try {
    const response = await authApiFetch<ApiResponse<AdminOperationsOverview>>('/admin/operations/overview')
    overview.value = response.data
  }
  catch (error: any) {
    overviewError.value = String(error?.data?.message || '运营洞察加载失败。')
  }
}

async function loadPermissions() {
  loading.value = true
  errorText.value = ''
  buildInfo.value = null
  buildInfoError.value = ''
  overview.value = null
  overviewError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    permissions.value = response.data.user.platformPermissions || []
    currentUserName.value = response.data.user.username || '管理员'
    isPlatformAdminUser.value = Boolean(response.data.user.isPlatformAdmin)
    if (!hasAnyAdminAccess.value) {
      await navigateTo('/dashboard', { replace: true })
      return
    }
    await Promise.allSettled([
      loadBuildInfo(),
      loadOverview(),
    ])
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    permissions.value = []
    currentUserName.value = '管理员'
    isPlatformAdminUser.value = false
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin') },
      }, { replace: true })
      return
    }
    errorText.value = resolveAuthDisplayMessage(error, '权限加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadPermissions)

onBeforeUnmount(() => {
  if (copyFeedbackTimer)
    clearTimeout(copyFeedbackTimer)
})
</script>

<template>
  <div class="admin-home">
    <section class="admin-home-hero admin-home-panel">
      <div class="admin-home-hero-copy">
        <p class="admin-home-eyebrow">
          管理控制台
        </p>
        <h1 class="admin-home-title">
          欢迎回来，{{ currentUserName }} <span>👋</span>
        </h1>
        <p class="admin-home-description">
          这里集中查看平台状态、权限覆盖、后台任务和核心运营入口。页面结构按“状态优先、动作其次、洞察兜底”重新收束。
        </p>
      </div>

      <div class="admin-home-hero-actions">
        <NuxtLink v-if="canViewOperations" to="/admin/operations" class="admin-home-action-button is-primary">
          查看运行监控
        </NuxtLink>
        <NuxtLink v-if="canViewOperations" to="/admin/resource-knowledge-worker" class="admin-home-action-button">
          知识索引监控
        </NuxtLink>
        <button
          type="button"
          class="admin-home-action-button"
          :disabled="!buildInfo"
          @click="copyBuildIdentity"
        >
          {{ copyFeedback || '复制构建标识' }}
        </button>
      </div>
    </section>

    <section v-if="loading" class="admin-home-panel">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="admin-home-feedback admin-home-feedback--danger">
      {{ errorText }}
    </section>

    <section
      v-else-if="!hasAnyAdminAccess"
      class="admin-home-feedback admin-home-feedback--danger"
    >
      403：当前账号没有平台管理权限。
    </section>

    <template v-else>
      <section class="admin-home-panel">
        <div class="admin-home-panel-head">
          <div>
            <h2 class="admin-home-section-title">
              系统状态
            </h2>
            <p class="admin-home-section-desc">
              聚合权限、构建身份和近 7 天平台信号，先给管理台一个可扫描的首屏。
            </p>
          </div>
          <NuxtLink v-if="canViewOperations" to="/admin/operations" class="admin-home-text-link">
            查看运行监控
          </NuxtLink>
        </div>

        <div class="admin-home-status-grid">
          <article
            v-for="card in statusCards"
            :key="card.key"
            class="admin-home-status-card"
          >
            <div class="admin-home-status-icon" :class="toneClass(card.tone)">
              <span :class="card.icon" />
            </div>
            <div class="admin-home-status-copy">
              <p class="admin-home-status-label">
                {{ card.label }}
              </p>
              <p class="admin-home-status-value">
                {{ card.value }}
              </p>
              <p class="admin-home-status-hint">
                {{ card.hint }}
              </p>
            </div>
          </article>
        </div>
      </section>

      <section class="admin-home-module">
        <div class="admin-home-section-row">
          <div>
            <h2 class="admin-home-section-title">
              核心功能
            </h2>
            <p class="admin-home-section-desc">
              只保留当前后台最常用的管理入口，避免首页继续退化成链接堆。
            </p>
          </div>
        </div>

        <NuxtLink v-if="false" to="/admin/notifications" />

        <div class="admin-home-entry-grid">
          <NuxtLink
            v-for="item in homeEntries"
            :key="item.key"
            :to="item.to"
            class="admin-home-entry-card"
          >
            <div class="admin-home-entry-icon" :class="toneClass(item.tone)">
              <span :class="item.icon" />
            </div>
            <div class="admin-home-entry-copy">
              <p class="admin-home-entry-title">
                {{ item.title }}
              </p>
              <p class="admin-home-entry-desc">
                {{ item.description }}
              </p>
              <span class="admin-home-entry-link" :class="toneClass(item.tone)">
                {{ item.action }}
                <span class="i-heroicons-outline-arrow-right" />
              </span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="admin-home-section-row admin-home-section-row--tight">
        <div>
          <h2 class="admin-home-section-title">
            系统洞察
          </h2>
          <p class="admin-home-section-desc">
            趋势、关键指标、待办与构建身份拆成四块，保证首屏之后仍然是可操作的信息，而不是装饰性图表。
          </p>
        </div>
      </section>

      <div class="admin-home-insight-grid">
        <section class="admin-home-panel admin-home-panel--trend">
          <div class="admin-home-panel-head">
            <div>
              <h3 class="admin-home-card-title">
                活跃用户趋势（近 7 天）
              </h3>
              <p class="admin-home-card-subtitle">
                默认使用运营总览里的 active users 曲线。
              </p>
            </div>
            <NuxtLink v-if="canViewOperations" to="/admin/operations?tab=overview" class="admin-home-text-link">
              查看详情
            </NuxtLink>
          </div>

          <div v-if="trendChart.dots.length" class="admin-home-chart">
            <svg
              class="admin-home-chart-svg"
              :viewBox="`0 0 ${trendChart.width} ${trendChart.height}`"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="活跃用户趋势图"
            >
              <defs>
                <linearGradient id="admin-home-area" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="rgba(37, 99, 235, 0.24)" />
                  <stop offset="100%" stop-color="rgba(37, 99, 235, 0.02)" />
                </linearGradient>
              </defs>
              <path :d="trendChart.area" fill="url(#admin-home-area)" />
              <polyline
                :points="trendChart.polyline"
                fill="none"
                stroke="#2563eb"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle
                v-for="dot in trendChart.dots"
                :key="`${dot.label}-${dot.value}`"
                :cx="dot.x"
                :cy="dot.y"
                r="4.5"
                fill="#ffffff"
                stroke="#2563eb"
                stroke-width="2"
              />
            </svg>

            <div class="admin-home-chart-axis">
              <span
                v-for="dot in trendChart.dots"
                :key="`${dot.label}-axis`"
                class="admin-home-chart-axis-label"
              >
                {{ dot.label }}
              </span>
            </div>
          </div>

          <div v-else class="admin-home-empty">
            运营趋势暂未加载。
          </div>

          <div class="admin-home-trend-summary">
            <div class="admin-home-trend-pill">
              <span class="admin-home-trend-pill-label">最新值</span>
              <strong>{{ latestTrendPoint ? formatNumber(latestTrendPoint.activeUsers) : '-' }}</strong>
            </div>
            <div class="admin-home-trend-pill">
              <span class="admin-home-trend-pill-label">峰值</span>
              <strong>{{ peakTrendPoint ? formatNumber(peakTrendPoint.activeUsers) : '-' }}</strong>
            </div>
          </div>
        </section>

        <section class="admin-home-panel">
          <div class="admin-home-panel-head">
            <div>
              <h3 class="admin-home-card-title">
                关键指标
              </h3>
              <p class="admin-home-card-subtitle">
                直接取运营总览的核心卡片，不重复造数据。
              </p>
            </div>
          </div>

          <div v-if="spotlightMetrics.length" class="admin-home-kpi-list">
            <div v-for="card in spotlightMetrics" :key="card.key" class="admin-home-kpi-item">
              <p class="admin-home-kpi-label">
                {{ card.label }}
              </p>
              <p class="admin-home-kpi-value">
                {{ formatMetricValue(card) }}
              </p>
              <p class="admin-home-kpi-hint">
                {{ card.hint || '来自运营总览' }}
              </p>
            </div>
          </div>

          <div v-else class="admin-home-empty">
            暂无指标数据。
          </div>
        </section>

        <section class="admin-home-panel">
          <div class="admin-home-panel-head">
            <div>
              <h3 class="admin-home-card-title">
                待办清单
              </h3>
              <p class="admin-home-card-subtitle">
                首屏只保留最需要被处理的四类事项。
              </p>
            </div>
          </div>

          <div v-if="todoPreview.length" class="admin-home-todo-list">
            <NuxtLink
              v-for="item in todoPreview"
              :key="item.key"
              :to="item.detailPath || '/admin/operations?tab=risks'"
              class="admin-home-todo-item"
            >
              <div class="admin-home-todo-main">
                <p class="admin-home-todo-label">
                  {{ item.label }}
                </p>
                <p class="admin-home-todo-desc">
                  {{ item.description }}
                </p>
              </div>
              <div class="admin-home-todo-side">
                <strong>{{ formatNumber(item.count) }}</strong>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="admin-home-empty">
            当前没有待处理事项。
          </div>
        </section>

        <section class="admin-home-panel">
          <div class="admin-home-panel-head">
            <div>
              <h3 class="admin-home-card-title">
                构建身份
              </h3>
              <p class="admin-home-card-subtitle">
                版本、commit 和来源都直接展示，避免后台状态不可追溯。
              </p>
            </div>
          </div>

          <div class="admin-home-build-list">
            <div v-for="item in buildIdentityRows" :key="item.label" class="admin-home-build-item">
              <p class="admin-home-build-label">
                {{ item.label }}
              </p>
              <p class="admin-home-build-value">
                {{ item.value }}
              </p>
              <p class="admin-home-build-hint">
                {{ item.hint }}
              </p>
            </div>
          </div>

          <div class="admin-home-summary-grid">
            <div v-for="item in summaryRows" :key="item.label" class="admin-home-summary-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </section>
      </div>

      <section v-if="buildInfoError || overviewError" class="admin-home-feedback admin-home-feedback--warn">
        <p v-if="buildInfoError" class="admin-home-feedback-line">
          {{ buildInfoError }}
        </p>
        <p v-if="overviewError" class="admin-home-feedback-line">
          {{ overviewError }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-home {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: #10233f;
}

.admin-home-panel {
  border: 1px solid #e1eaf5;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  padding: 20px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.045);
}

.admin-home-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 249, 255, 0.98) 100%),
    linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(255, 255, 255, 0) 60%);
}

.admin-home-hero-copy {
  max-width: 760px;
}

.admin-home-eyebrow {
  margin: 0;
  color: #5b7cd8;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.admin-home-title {
  margin: 12px 0 0;
  color: #112849;
  font-size: clamp(28px, 2.6vw, 38px);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.admin-home-description {
  margin: 12px 0 0;
  max-width: 760px;
  color: #697a92;
  font-size: 14px;
  line-height: 1.68;
}

.admin-home-hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.admin-home-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 144px;
  height: 40px;
  border: 1px solid #d7e2f0;
  border-radius: 14px;
  background: #ffffff;
  color: #425877;
  font-size: 13px;
  font-weight: 600;
}

.admin-home-action-button.is-primary {
  border-color: transparent;
  background: linear-gradient(135deg, #2563eb 0%, #4f7dff 100%);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.22);
}

.admin-home-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.admin-home-feedback {
  border-radius: 18px;
  padding: 16px 18px;
  font-size: 14px;
  line-height: 1.7;
}

.admin-home-feedback--danger {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #be123c;
}

.admin-home-feedback--warn {
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
}

.admin-home-feedback-line {
  margin: 0;
}

.admin-home-feedback-line + .admin-home-feedback-line {
  margin-top: 8px;
}

.admin-home-panel-head,
.admin-home-section-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.admin-home-section-row--tight {
  margin-top: -2px;
}

.admin-home-section-title {
  margin: 0;
  color: #112849;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.15;
}

.admin-home-section-desc {
  margin: 6px 0 0;
  color: #72829a;
  font-size: 13px;
  line-height: 1.62;
}

.admin-home-text-link {
  display: inline-flex;
  align-items: center;
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.admin-home-status-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 14px;
  border-top: 1px solid #edf2f9;
}

.admin-home-status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 16px 12px 2px 0;
  border-right: 1px solid #edf2f9;
}

.admin-home-status-card:last-child {
  border-right: none;
  padding-right: 0;
}

.admin-home-status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 16px;
  font-size: 22px;
  flex-shrink: 0;
}

.admin-home-status-copy {
  min-width: 0;
}

.admin-home-status-label {
  margin: 0;
  color: #7a8aa3;
  font-size: 12px;
  line-height: 1.4;
}

.admin-home-status-value {
  margin: 8px 0 0;
  color: #13305a;
  font-size: 24px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-home-status-hint {
  margin: 6px 0 0;
  color: #7a8aa3;
  font-size: 11px;
  line-height: 1.5;
}

.admin-home-module {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.admin-home-entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.admin-home-entry-card {
  display: flex;
  gap: 14px;
  border: 1px solid #e1eaf5;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  padding: 20px;
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.038);
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    border-color 0.16s ease;
}

.admin-home-entry-card:hover {
  transform: translateY(-1px);
  border-color: #d2dff0;
  box-shadow: 0 22px 44px rgba(15, 23, 42, 0.06);
}

.admin-home-entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  font-size: 26px;
  flex-shrink: 0;
}

.admin-home-entry-copy {
  min-width: 0;
}

.admin-home-entry-title {
  margin: 0;
  color: #112849;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.25;
}

.admin-home-entry-desc {
  margin: 8px 0 0;
  color: #70819a;
  font-size: 13px;
  line-height: 1.62;
}

.admin-home-entry-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  border-radius: 999px;
  padding: 7px 11px;
  font-size: 12px;
  font-weight: 700;
}

.admin-home-insight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.admin-home-panel--trend {
  min-width: 0;
}

.admin-home-card-title {
  margin: 0;
  color: #112849;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.admin-home-card-subtitle {
  margin: 6px 0 0;
  color: #7a8aa3;
  font-size: 12px;
  line-height: 1.55;
}

.admin-home-chart {
  margin-top: 14px;
}

.admin-home-chart-svg {
  display: block;
  width: 100%;
  height: auto;
}

.admin-home-chart-axis {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-top: 6px;
}

.admin-home-chart-axis-label {
  text-align: center;
  color: #8a99af;
  font-size: 11px;
}

.admin-home-trend-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.admin-home-trend-pill {
  border-radius: 16px;
  background: #f7faff;
  padding: 10px 12px;
}

.admin-home-trend-pill-label {
  display: block;
  color: #7a8aa3;
  font-size: 12px;
}

.admin-home-trend-pill strong {
  display: block;
  margin-top: 6px;
  color: #112849;
  font-size: 20px;
  line-height: 1;
}

.admin-home-kpi-list,
.admin-home-build-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.admin-home-kpi-item,
.admin-home-build-item {
  border-radius: 18px;
  background: #f7faff;
  padding: 12px 14px;
}

.admin-home-kpi-label,
.admin-home-build-label {
  margin: 0;
  color: #7a8aa3;
  font-size: 12px;
  line-height: 1.5;
}

.admin-home-kpi-value,
.admin-home-build-value {
  margin: 6px 0 0;
  color: #112849;
  font-size: 24px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.admin-home-kpi-hint,
.admin-home-build-hint {
  margin: 6px 0 0;
  color: #7a8aa3;
  font-size: 11px;
  line-height: 1.55;
}

.admin-home-todo-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.admin-home-todo-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-radius: 18px;
  background: #f7faff;
  padding: 12px 14px;
}

.admin-home-todo-main {
  min-width: 0;
}

.admin-home-todo-label {
  margin: 0;
  color: #112849;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}

.admin-home-todo-desc {
  margin: 6px 0 0;
  color: #7a8aa3;
  font-size: 11px;
  line-height: 1.6;
}

.admin-home-todo-side {
  flex-shrink: 0;
  border-radius: 999px;
  background: #edf4ff;
  padding: 0 12px;
  line-height: 32px;
  color: #2563eb;
}

.admin-home-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.admin-home-summary-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 16px;
  background: #f7faff;
  padding: 12px 14px;
  color: #7a8aa3;
  font-size: 12px;
}

.admin-home-summary-item strong {
  color: #112849;
  font-size: 16px;
}

.admin-home-empty {
  margin-top: 14px;
  border-radius: 18px;
  background: #f7faff;
  padding: 14px;
  color: #7a8aa3;
  font-size: 12px;
}

.tone-blue {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.tone-emerald {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.tone-violet {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.tone-amber {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.tone-rose {
  background: rgba(244, 63, 94, 0.12);
  color: #e11d48;
}

.tone-slate {
  background: rgba(71, 85, 105, 0.12);
  color: #475569;
}

@media (max-width: 1440px) {
  .admin-home-status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0 14px;
  }

  .admin-home-status-card:nth-child(3n) {
    border-right: none;
    padding-right: 0;
  }

  .admin-home-entry-grid,
  .admin-home-insight-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .admin-home-panel,
  .admin-home-entry-card {
    padding: 18px;
  }

  .admin-home-hero,
  .admin-home-panel-head,
  .admin-home-section-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .admin-home-hero-actions {
    justify-content: flex-start;
  }

  .admin-home-status-grid,
  .admin-home-entry-grid,
  .admin-home-insight-grid,
  .admin-home-summary-grid,
  .admin-home-trend-summary {
    grid-template-columns: 1fr;
  }

  .admin-home-status-card {
    border-right: none;
    border-bottom: 1px solid #edf2f9;
    padding-right: 0;
    padding-bottom: 18px;
  }

  .admin-home-status-card:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .admin-home-chart-axis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
