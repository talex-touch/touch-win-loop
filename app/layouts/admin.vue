<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  PlatformPermission,
  PlatformRole,
} from '~~/shared/types/domain'

interface AdminNavItem {
  key: string
  to: string
  label: string
  icon: string
  section: 'core' | 'system'
  requiredAny?: PlatformPermission[]
}

const route = useRoute()
const authApiFetch = useAuthApiFetch()

const userName = ref('平台管理员')
const platformRoles = ref<PlatformRole[]>([])
const permissions = ref<PlatformPermission[]>([])
const isPlatformAdmin = ref(false)
const loadingProfile = ref(true)
const profileDialogVisible = ref(false)
const loggingOut = ref(false)
const actionError = ref('')

const navItems: AdminNavItem[] = [
  { key: 'admin-home', to: '/admin', label: '管理首页', icon: 'i-heroicons-outline-home', section: 'core' },
  { key: 'admin-users', to: '/admin/users', label: '用户管理', icon: 'i-heroicons-outline-users', section: 'system', requiredAny: ['role.assign'] },
  { key: 'admin-orgs', to: '/admin/organizations', label: '组织管理', icon: 'i-heroicons-outline-building-office-2', section: 'system', requiredAny: ['pricing.write'] },
  { key: 'admin-contests', to: '/admin/contests', label: '赛事管理', icon: 'i-heroicons-outline-academic-cap', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-ai-prompts', to: '/admin/ai-prompts', label: 'AI配置', icon: 'i-heroicons-outline-sparkles', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-integrations', to: '/admin/integrations', label: '集成中心', icon: 'i-heroicons-outline-puzzle-piece', section: 'system', requiredAny: ['role.assign', 'contest.write'] },
  { key: 'admin-resources', to: '/admin/resources', label: '资料管理', icon: 'i-heroicons-outline-folder-open', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resource-preview-worker', to: '/admin/resource-preview-worker', label: '文档转换监控', icon: 'i-heroicons-outline-arrow-path', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resource-recycle-worker', to: '/admin/resource-recycle-worker', label: '回收站清理', icon: 'i-heroicons-outline-trash', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-billing', to: '/admin/billing', label: '套餐计费', icon: 'i-heroicons-outline-currency-dollar', section: 'system', requiredAny: ['pricing.write'] },
  { key: 'admin-roles', to: '/admin/roles', label: '角色权限', icon: 'i-heroicons-outline-shield-check', section: 'system', requiredAny: ['role.assign'] },
]

interface AdminRouteTab {
  id: string
  path: string
  fullPath: string
  label: string
}

const ADMIN_ROUTE_TABS_STORAGE_KEY = 'winloop.admin.route-tabs.v1'
const MAX_ADMIN_ROUTE_TAB_COUNT = 30

function isRouteActive(path: string): boolean {
  if (path === '/admin')
    return route.path === '/admin'
  return route.path === path || route.path.startsWith(`${path}/`)
}

function canAccess(item: AdminNavItem): boolean {
  if (!item.requiredAny || item.requiredAny.length === 0)
    return true
  if (isPlatformAdmin.value)
    return true
  return item.requiredAny.some(permission => permissions.value.includes(permission))
}

const visibleNavItems = computed(() => navItems.filter(canAccess))
const coreItems = computed(() => visibleNavItems.value.filter(item => item.section === 'core'))
const systemItems = computed(() => visibleNavItems.value.filter(item => item.section === 'system'))

const selectedMenuKeys = computed(() => {
  const current = visibleNavItems.value.find(item => isRouteActive(item.to))
  return current ? [current.key] : []
})
const isEmbedMode = computed(() => {
  const value = route.query.embed
  if (Array.isArray(value))
    return value[0] === '1'
  return value === '1'
})

const pageTitle = computed(() => {
  const current = navItems.find(item => isRouteActive(item.to))
  return current?.label || '平台管理'
})

const showAdminBadge = computed(() => {
  return isPlatformAdmin.value || platformRoles.value.length > 0 || permissions.value.length > 0
})

const userInitial = computed(() => {
  const normalized = userName.value.trim()
  if (!normalized)
    return 'U'
  return normalized.slice(0, 1).toUpperCase()
})

function onMenuItemClick(key: string | number): void {
  const target = visibleNavItems.value.find(item => item.key === String(key))
  if (!target)
    return
  if (route.path === target.to) {
    appendRouteTab(route.path, route.fullPath)
    return
  }
  void navigateTo(target.to)
}

const adminRouteTabs = ref<AdminRouteTab[]>([])

function createTabId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeAdminRoutePath(path: string): string {
  const normalizedPath = path.replace(/\/+$/, '') || '/'
  if (!normalizedPath.startsWith('/admin'))
    return ''

  if (normalizedPath === '/admin/contests/new')
    return normalizedPath

  const contestWorkspaceMatch = normalizedPath.match(/^\/admin\/contests\/([^/]+)(?:\/.*)?$/)
  if (contestWorkspaceMatch) {
    const contestId = String(contestWorkspaceMatch[1] || '').trim()
    if (!contestId || contestId === 'new')
      return '/admin/contests/new'
    return `/admin/contests/${contestId}`
  }

  return normalizedPath
}

function resolveContestModuleLabel(segment: string): string {
  const map: Record<string, string> = {
    'overview': '基础信息',
    'faq': 'FAQ',
    'tracks': '赛道',
    'timelines': '时间节点',
    'rubrics': '评委细则',
    'judge-guidelines': '赛道详解',
    'resources': '资料',
    'ai-prompts': 'AI提示词',
    'audit': '审计历史',
  }
  return map[segment] || segment
}

function resolveRouteTabLabel(path: string): string {
  if (path === '/admin')
    return '管理首页'

  if (path.startsWith('/admin/integrations/')) {
    const segments = path.split('/').filter(Boolean)
    const provider = segments[2] || ''
    if (provider === 'feishu')
      return '飞书集成'
    if (provider === 'dingtalk')
      return '钉钉集成'
    if (provider === 'wecom')
      return '企业微信集成'
    return '集成详情'
  }

  if (path.startsWith('/admin/contests/')) {
    const segments = path.split('/').filter(Boolean)
    const contestId = segments[2] || ''
    const moduleSegment = segments[3] || ''

    if (contestId === 'new')
      return '新建赛事'

    if (!moduleSegment)
      return `赛事工作区 · ${contestId}`

    if (moduleSegment === 'resources' && segments[4] === 'new')
      return `资料新建 · ${contestId}`
    if (moduleSegment === 'resources' && segments[5] === 'edit')
      return `资料编辑 · ${contestId}`
    if (moduleSegment === 'resources' && segments[5] === 'annotate')
      return `资料标注 · ${contestId}`

    return `${resolveContestModuleLabel(moduleSegment)} · ${contestId}`
  }

  const current = [...navItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => {
      if (path === item.to)
        return true
      if (item.to === '/admin')
        return false
      return path.startsWith(`${item.to}/`)
    })
  return current?.label || '管理页'
}

function persistAdminRouteTabs(): void {
  if (!import.meta.client)
    return

  localStorage.setItem(ADMIN_ROUTE_TABS_STORAGE_KEY, JSON.stringify(adminRouteTabs.value))
}

function normalizeAdminRouteTabs(source: unknown): AdminRouteTab[] {
  if (!Array.isArray(source))
    return []

  const result: AdminRouteTab[] = []
  const indexByPath = new Map<string, number>()

  for (const item of source) {
    if (!item || typeof item !== 'object')
      continue

    const candidate = item as Partial<AdminRouteTab>
    const path = normalizeAdminRoutePath(String(candidate.path || ''))
    if (!path)
      continue

    const fullPathText = String(candidate.fullPath || '').trim()
    const fullPath = fullPathText.startsWith('/admin') ? fullPathText : path

    const nextTab: AdminRouteTab = {
      id: String(candidate.id || createTabId()),
      path,
      fullPath,
      label: resolveRouteTabLabel(path),
    }

    const duplicatedIndex = indexByPath.get(path)
    if (duplicatedIndex !== undefined) {
      result.splice(duplicatedIndex, 1)
      for (const [key, value] of indexByPath.entries()) {
        if (value > duplicatedIndex)
          indexByPath.set(key, value - 1)
      }
    }

    indexByPath.set(path, result.length)
    result.push(nextTab)
  }

  if (result.length <= MAX_ADMIN_ROUTE_TAB_COUNT)
    return result
  return result.slice(-MAX_ADMIN_ROUTE_TAB_COUNT)
}

function restoreAdminRouteTabs(): void {
  if (!import.meta.client)
    return

  const raw = localStorage.getItem(ADMIN_ROUTE_TABS_STORAGE_KEY)
  if (!raw) {
    adminRouteTabs.value = []
    return
  }

  try {
    const parsed = JSON.parse(raw)
    adminRouteTabs.value = normalizeAdminRouteTabs(parsed)
  }
  catch {
    adminRouteTabs.value = []
  }

  persistAdminRouteTabs()
}

function appendRouteTab(path: string, fullPath: string): void {
  const normalizedPath = normalizeAdminRoutePath(path)
  if (!normalizedPath)
    return

  const normalizedFullPath = fullPath.startsWith('/admin') ? fullPath : normalizedPath
  const index = adminRouteTabs.value.findIndex(item => item.path === normalizedPath)
  if (index >= 0) {
    const current = adminRouteTabs.value[index]
    if (!current)
      return
    current.fullPath = normalizedFullPath
    current.label = resolveRouteTabLabel(normalizedPath)
    persistAdminRouteTabs()
    return
  }

  adminRouteTabs.value.push({
    id: createTabId(),
    path: normalizedPath,
    fullPath: normalizedFullPath,
    label: resolveRouteTabLabel(normalizedPath),
  })

  if (adminRouteTabs.value.length > MAX_ADMIN_ROUTE_TAB_COUNT)
    adminRouteTabs.value.splice(0, adminRouteTabs.value.length - MAX_ADMIN_ROUTE_TAB_COUNT)

  persistAdminRouteTabs()
}

const activeRoutePath = computed(() => normalizeAdminRoutePath(route.path))
const activeRouteTabId = computed(() => {
  const active = adminRouteTabs.value.find(tab => tab.path === activeRoutePath.value)
  if (active)
    return active.id
  return ''
})

async function openRouteTab(tabId: string) {
  const target = adminRouteTabs.value.find(item => item.id === tabId)
  if (!target || target.fullPath === route.fullPath)
    return
  await navigateTo(target.fullPath)
}

async function closeRouteTab(tabId: string) {
  const index = adminRouteTabs.value.findIndex(item => item.id === tabId)
  if (index < 0)
    return

  const target = adminRouteTabs.value[index]
  const isActive = Boolean(target && target.path === activeRoutePath.value)
  adminRouteTabs.value.splice(index, 1)
  persistAdminRouteTabs()

  if (!isActive)
    return

  const fallback = adminRouteTabs.value[index - 1] || adminRouteTabs.value[index] || null
  if (fallback) {
    await navigateTo(fallback.fullPath)
    return
  }
  await navigateTo('/admin')
}

function openProfileDialog() {
  actionError.value = ''
  profileDialogVisible.value = true
}

function closeProfileDialog() {
  if (loggingOut.value)
    return
  profileDialogVisible.value = false
}

async function logout() {
  loggingOut.value = true
  actionError.value = ''
  try {
    await authApiFetch('/auth/logout', { method: 'POST' })
    profileDialogVisible.value = false
    await navigateTo('/login')
  }
  catch (error: any) {
    actionError.value = String(error?.data?.message || '退出失败，请稍后重试。')
  }
  finally {
    loggingOut.value = false
  }
}

async function loadProfile() {
  loadingProfile.value = true
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    userName.value = response.data.user.username || '平台管理员'
    platformRoles.value = response.data.user.platformRoles || []
    permissions.value = response.data.user.platformPermissions || []
    isPlatformAdmin.value = Boolean(response.data.user.isPlatformAdmin)
  }
  catch {
    userName.value = '未登录用户'
    platformRoles.value = []
    permissions.value = []
    isPlatformAdmin.value = false
  }
  finally {
    loadingProfile.value = false
  }
}

onMounted(loadProfile)

if (import.meta.client) {
  onMounted(() => {
    if (isEmbedMode.value)
      return
    restoreAdminRouteTabs()
    appendRouteTab(route.path, route.fullPath)
  })

  watch(() => route.fullPath, (fullPath) => {
    if (isEmbedMode.value)
      return
    appendRouteTab(route.path, fullPath)
  })
}
</script>

<template>
  <div v-if="isEmbedMode" class="admin-embed-shell">
    <slot />
  </div>
  <div v-else class="admin-shell">
    <a-layout class="admin-layout">
      <a-layout-sider :width="224" class="admin-sider">
        <div class="admin-brand">
          <div class="admin-brand-icon">
            <span class="i-heroicons-solid-chart-bar-square h-3.5 w-3.5" />
          </div>
          <p class="admin-brand-text">
            WinLoop Admin
          </p>
        </div>

        <nav class="admin-scrollbar admin-menu-wrap">
          <div class="admin-section-title">
            Core
          </div>
          <a-menu
            mode="vertical"
            :selected-keys="selectedMenuKeys"
            class="admin-menu"
            @menu-item-click="onMenuItemClick"
          >
            <a-menu-item v-for="item in coreItems" :key="item.key">
              <template #icon>
                <span class="admin-menu-icon" :class="item.icon" />
              </template>
              {{ item.label }}
            </a-menu-item>
          </a-menu>

          <div class="admin-section-title admin-section-title-system">
            System
          </div>
          <a-menu
            mode="vertical"
            :selected-keys="selectedMenuKeys"
            class="admin-menu"
            @menu-item-click="onMenuItemClick"
          >
            <a-menu-item v-for="item in systemItems" :key="item.key">
              <template #icon>
                <span class="admin-menu-icon" :class="item.icon" />
              </template>
              {{ item.label }}
            </a-menu-item>
          </a-menu>
        </nav>

        <div class="admin-user-panel">
          <a-button type="outline" size="mini" long class="admin-back-btn" @click="navigateTo('/dashboard')">
            <template #icon>
              <span class="admin-inline-icon i-heroicons-outline-arrow-uturn-left" />
            </template>
            返回业务看板
          </a-button>

          <div class="admin-user-card">
            <template v-if="loadingProfile">
              <span class="admin-user-skeleton-avatar" />
              <div class="admin-user-skeleton-meta">
                <span class="admin-user-skeleton-line admin-user-skeleton-line-main" />
                <span class="admin-user-skeleton-line admin-user-skeleton-line-sub" />
              </div>
              <span class="admin-user-skeleton-setting" />
            </template>
            <template v-else>
              <a-avatar :size="28" class="admin-avatar">
                {{ userInitial }}
              </a-avatar>
              <div class="admin-user-meta">
                <p class="admin-user-name">
                  {{ userName }}
                </p>
                <p v-if="showAdminBadge" class="admin-admin-badge">
                  管理页
                </p>
              </div>
              <a-button type="text" size="mini" class="admin-setting-btn" @click="openProfileDialog">
                <template #icon>
                  <span class="admin-inline-icon i-heroicons-outline-cog-6-tooth" />
                </template>
              </a-button>
            </template>
          </div>
        </div>
      </a-layout-sider>

      <a-layout class="admin-main-layout">
        <a-layout-header class="admin-header">
          <div class="admin-header-left">
            <a-breadcrumb class="admin-breadcrumb" size="mini">
              <a-breadcrumb-item>WinLoop Admin</a-breadcrumb-item>
              <a-breadcrumb-item>{{ pageTitle }}</a-breadcrumb-item>
            </a-breadcrumb>
          </div>
        </a-layout-header>

        <div class="admin-route-tabs-wrap admin-scrollbar">
          <div class="admin-route-tabs-inner">
            <div
              v-for="tab in adminRouteTabs"
              :key="tab.id"
              role="button"
              tabindex="0"
              class="admin-route-tab"
              :class="{ 'is-active': activeRouteTabId === tab.id }"
              @click="openRouteTab(tab.id)"
              @keydown.enter="openRouteTab(tab.id)"
            >
              <span class="admin-route-tab-label">{{ tab.label }}</span>
              <button type="button" class="admin-route-tab-close" @click.stop="closeRouteTab(tab.id)">
                ×
              </button>
            </div>
          </div>
        </div>

        <a-layout-content class="admin-content admin-scrollbar">
          <slot />
        </a-layout-content>
      </a-layout>
    </a-layout>

    <a-modal
      v-model:visible="profileDialogVisible"
      :mask-closable="!loggingOut"
      :closable="!loggingOut"
      :footer="false"
      title="个人信息"
      class="admin-profile-modal"
    >
      <div class="admin-profile-card">
        <template v-if="loadingProfile">
          <span class="admin-user-skeleton-line admin-user-skeleton-line-main" />
          <span class="admin-user-skeleton-line admin-user-skeleton-line-sub mt-1" />
        </template>
        <template v-else>
          <p class="admin-user-name">
            {{ userName }}
          </p>
          <p v-if="showAdminBadge" class="admin-admin-badge mt-1">
            管理页
          </p>
        </template>
      </div>

      <p v-if="actionError" class="admin-error-text">
        {{ actionError }}
      </p>

      <div class="admin-profile-actions">
        <a-button size="small" @click="closeProfileDialog">
          关闭
        </a-button>
        <a-button status="danger" size="small" :loading="loggingOut" @click="logout">
          <template #icon>
            <span class="admin-inline-icon i-heroicons-outline-arrow-right-on-rectangle" />
          </template>
          退出登录
        </a-button>
      </div>
    </a-modal>
  </div>
</template>

<style src="@arco-design/web-vue/dist/arco.css"></style>

<style scoped>
.admin-shell {
  height: 100vh;
  overflow: hidden;
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --wl-admin-primary: #1152d4;
}

.admin-embed-shell {
  min-height: 100vh;
  background: #f4f6f8;
  padding: 12px;
  font-family: 'IBM Plex Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.admin-layout {
  height: 100%;
}

.admin-sider {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
  background: #f8f9fb;
}

.admin-brand {
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
}

.admin-brand-icon {
  display: flex;
  height: 20px;
  width: 20px;
  align-items: center;
  justify-content: center;
  background: var(--wl-admin-primary);
  color: #fff;
}

.admin-brand-text {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #0f172a;
  line-height: 1;
  white-space: nowrap;
}

.admin-menu-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.admin-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.admin-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
}

.admin-section-title {
  margin: 0;
  padding: 4px 12px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.admin-section-title-system {
  margin-top: 8px;
}

.admin-menu-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.admin-inline-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
}

.admin-user-panel {
  padding: 8px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}

.admin-back-btn {
  height: 28px;
  font-size: 11px;
  font-weight: 700;
  border-color: #d0d7de;
  color: #334155;
}

.admin-user-card {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 8px;
}

.admin-user-skeleton-avatar {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: #e2e8f0;
  animation: admin-pulse 1.2s ease-in-out infinite;
}

.admin-user-skeleton-meta {
  min-width: 0;
  flex: 1;
}

.admin-user-skeleton-line {
  display: block;
  height: 10px;
  border-radius: 6px;
  background: #e2e8f0;
  animation: admin-pulse 1.2s ease-in-out infinite;
}

.admin-user-skeleton-line-main {
  width: 72px;
}

.admin-user-skeleton-line-sub {
  width: 40px;
  margin-top: 6px;
}

.admin-user-skeleton-setting {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #e2e8f0;
  animation: admin-pulse 1.2s ease-in-out infinite;
}

.admin-avatar {
  flex-shrink: 0;
  background: #e2e8f0;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
}

.admin-user-meta {
  min-width: 0;
  flex: 1;
}

.admin-user-name {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-admin-badge {
  margin: 4px 0 0;
  display: inline-flex;
  align-items: center;
  border: 1px solid #fecaca;
  background: #fef2f2;
  padding: 0 4px;
  line-height: 16px;
  font-size: 10px;
  color: #b91c1c;
  font-weight: 700;
}

.admin-setting-btn {
  color: #64748b;
  min-width: 26px;
  width: 26px;
  height: 26px;
}

@keyframes admin-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.admin-main-layout {
  min-width: 0;
  height: 100%;
  background: #f4f6f8;
}

.admin-header {
  height: 48px;
  padding: 0 12px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.admin-route-tabs-wrap {
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  overflow-x: auto;
  overflow-y: hidden;
}

.admin-route-tabs-inner {
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
}

.admin-route-tab {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d6dde5;
  background: #ffffff;
  color: #475569;
  padding: 0 8px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.admin-route-tab:hover {
  border-color: #94a3b8;
}

.admin-route-tab.is-active {
  border-color: #0f172a;
  color: #0f172a;
  font-weight: 700;
}

.admin-route-tab-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-route-tab-close {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.admin-route-tab-close:hover {
  color: #0f172a;
}

.admin-header-left {
  min-width: 0;
  display: flex;
  align-items: center;
}

.admin-breadcrumb {
  font-size: 11px;
}

.admin-breadcrumb :deep(.arco-breadcrumb-item) {
  color: #64748b;
}

.admin-breadcrumb :deep(.arco-breadcrumb-item:last-child) {
  color: #0f172a;
  font-weight: 700;
}

.admin-create-btn {
  height: 28px;
  font-size: 11px;
  font-weight: 700;
  background: var(--wl-admin-primary);
}

.admin-content {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.admin-profile-card {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  padding: 10px;
}

.admin-profile-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.admin-error-text {
  margin: 10px 0 0;
  color: #dc2626;
  font-size: 11px;
}

:deep(*) {
  border-radius: 0 !important;
}

:deep(.arco-layout-sider-children) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:deep(.admin-menu.arco-menu) {
  border-right: none;
  background: transparent;
}

:deep(.admin-menu .arco-menu-inner) {
  padding: 0;
}

:deep(.admin-menu .arco-menu-item) {
  height: 30px;
  line-height: 30px;
  margin: 0;
  padding-inline: 12px !important;
  border-right: 2px solid transparent;
  color: #475569;
  font-size: 12px;
  transition: all 0.15s ease;
}

:deep(.admin-menu .arco-menu-item:hover) {
  background: rgba(226, 232, 240, 0.45);
}

:deep(.admin-menu .arco-menu-item.arco-menu-selected) {
  color: var(--wl-admin-primary);
  font-weight: 700;
  border-right-color: var(--wl-admin-primary);
  background: #fff;
}

:deep(.admin-menu .arco-menu-icon) {
  margin-right: 8px;
  font-size: 16px;
}

:deep(.arco-btn-size-mini) {
  font-size: 11px;
}

:deep(.arco-modal-header .arco-modal-title) {
  font-size: 12px;
  font-weight: 700;
}

:deep(.arco-modal-body) {
  padding-top: 10px;
}
</style>
