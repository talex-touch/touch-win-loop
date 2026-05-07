<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  AuthUser,
  PlatformPermission,
  PlatformRole,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { ContextMenuAnchorPoint, ContextMenuItem } from '~/types/ui-context-menu'
import { resolveWorkspaceOptions } from '~/composables/team-ui'
import { readActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'
import { useAdminRouteTabs } from '~/composables/useAdminRouteTabs'
import { resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

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

const ADMIN_MOBILE_MEDIA_QUERY = '(max-width: 960px)'
const ADMIN_SIDER_EXPANDED_WIDTH = 236
const ADMIN_SIDER_COLLAPSED_WIDTH = 78

const userName = ref('平台管理员')
const userId = ref('')
const userEmail = ref('')
const userAvatarUrl = ref('')
const platformRoles = ref<PlatformRole[]>([])
const permissions = ref<PlatformPermission[]>([])
const isPlatformAdmin = ref(false)
const loadingProfile = ref(true)
const profileDialogVisible = ref(false)
const workspaceOptions = ref<WorkspaceWithQuota[]>([])
const activeWorkspaceId = ref('')
const adminSearchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const isFullscreen = ref(false)
const routeTabContextMenuVisible = ref(false)
const routeTabContextMenuTabId = ref('')
const routeTabContextMenuAnchorPoint = ref<ContextMenuAnchorPoint | null>(null)
const routeTabContextMenuAnchorEl = ref<HTMLElement | null>(null)
const routeTabContextMenuRestoreFocusEl = ref<HTMLElement | null>(null)
const desktopSidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)

const navItems: AdminNavItem[] = [
  { key: 'admin-home', to: '/admin', label: '管理首页', icon: 'i-heroicons-outline-home', section: 'core' },
  { key: 'admin-users', to: '/admin/users', label: '用户管理', icon: 'i-heroicons-outline-users', section: 'core', requiredAny: ['user.read'] },
  { key: 'admin-contests', to: '/admin/contests', label: '赛事管理', icon: 'i-heroicons-outline-academic-cap', section: 'core', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resources', to: '/admin/resources', label: '资料中心', icon: 'i-heroicons-outline-folder-open', section: 'core', requiredAny: ['contest.read_internal'] },
  { key: 'admin-ai-prompts', to: '/admin/ai-prompts', label: 'AI配置', icon: 'i-heroicons-outline-sparkles', section: 'core', requiredAny: ['contest.read_internal'] },
  { key: 'admin-operations', to: '/admin/operations', label: '运营管控', icon: 'i-heroicons-outline-chart-bar', section: 'core', requiredAny: ['contest.read_internal'] },
  { key: 'admin-storage-service', to: '/admin/storage-service', label: '存储服务', icon: 'i-heroicons-outline-server-stack', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-runtime-settings', to: '/admin/runtime-settings', label: '系统设置', icon: 'i-heroicons-outline-adjustments-horizontal', section: 'system', requiredAny: ['contest.write'] },
  { key: 'admin-roles', to: '/admin/roles', label: '权限管理', icon: 'i-heroicons-outline-shield-check', section: 'system', requiredAny: ['role.assign'] },
  { key: 'admin-notifications', to: '/admin/notifications', label: '通知管理', icon: 'i-heroicons-outline-bell', section: 'system', requiredAny: ['contest.write'] },
  { key: 'admin-integrations', to: '/admin/integrations', label: '集成中心', icon: 'i-heroicons-outline-puzzle-piece', section: 'system', requiredAny: ['role.assign', 'contest.write'] },
  { key: 'admin-organizations', to: '/admin/organizations', label: '组织管理', icon: 'i-heroicons-outline-building-office-2', section: 'system', requiredAny: ['pricing.write'] },
  { key: 'admin-billing', to: '/admin/billing', label: '套餐计费', icon: 'i-heroicons-outline-currency-dollar', section: 'system', requiredAny: ['pricing.write'] },
  { key: 'admin-meeting-providers', to: '/admin/meeting-providers', label: '会议服务', icon: 'i-heroicons-outline-video-camera', section: 'system', requiredAny: ['contest.write'] },
  { key: 'admin-canvas-library', to: '/admin/canvas-library', label: '画布资源库', icon: 'i-heroicons-outline-swatch', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-docs', to: '/admin/docs', label: '文档中心', icon: 'i-heroicons-outline-book-open', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resource-preview-worker', to: '/admin/resource-preview-worker', label: '文档转换监控', icon: 'i-heroicons-outline-arrow-path', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resource-knowledge-worker', to: '/admin/resource-knowledge-worker', label: '知识索引监控', icon: 'i-heroicons-outline-circle-stack', section: 'system', requiredAny: ['contest.read_internal'] },
  { key: 'admin-resource-recycle-worker', to: '/admin/resource-recycle-worker', label: '回收站清理', icon: 'i-heroicons-outline-trash', section: 'system', requiredAny: ['contest.read_internal'] },
]

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

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase()
}

function resolveSearchMatch(keyword: string): AdminNavItem | null {
  const normalized = normalizeKeyword(keyword)
  if (!normalized)
    return null
  return visibleNavItems.value.find((item) => {
    return normalizeKeyword(item.label).includes(normalized) || normalizeKeyword(item.to).includes(normalized)
  }) || null
}

const visibleNavItems = computed(() => navItems.filter(canAccess))
const coreItems = computed(() => visibleNavItems.value.filter(item => item.section === 'core'))
const systemItems = computed(() => visibleNavItems.value.filter(item => item.section === 'system'))
const notificationTarget = computed(() => visibleNavItems.value.find(item => item.key === 'admin-notifications')?.to || '')
const adminSiderWidth = computed(() => desktopSidebarCollapsed.value ? ADMIN_SIDER_COLLAPSED_WIDTH : ADMIN_SIDER_EXPANDED_WIDTH)
const searchMatch = computed(() => resolveSearchMatch(adminSearchQuery.value))
const searchIndicatorText = computed(() => {
  const keyword = normalizeKeyword(adminSearchQuery.value)
  if (!keyword)
    return '⌘ K'
  return searchMatch.value?.label || '无匹配'
})

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

const userSubtitle = computed(() => {
  return showAdminBadge.value ? '平台管理员' : '系统访问账号'
})

const userInitial = computed(() => {
  const normalized = userName.value.trim()
  if (!normalized)
    return 'U'
  return normalized.slice(0, 1).toUpperCase()
})

const {
  adminRouteTabs,
  activeRouteTabId,
  restoreAdminRouteTabs,
  appendRouteTab,
  openRouteTab,
  closeRouteTab,
  closeTabsToLeft,
  closeTabsToRight,
  closeOtherTabs,
  closeAllTabs,
} = useAdminRouteTabs({
  route,
  navItems,
})

const showRouteTabs = computed(() => adminRouteTabs.value.length > 0)

const routeTabContextSnapshot = computed(() => {
  const index = adminRouteTabs.value.findIndex(tab => tab.id === routeTabContextMenuTabId.value)
  if (index < 0)
    return null

  const tab = adminRouteTabs.value[index]
  if (!tab)
    return null

  return {
    tab,
    index,
    leftCount: index,
    rightCount: Math.max(adminRouteTabs.value.length - index - 1, 0),
  }
})

const routeTabContextMenuItems = computed<ContextMenuItem[]>(() => {
  const snapshot = routeTabContextSnapshot.value
  if (!snapshot)
    return []

  return [
    {
      key: 'closeSelf',
      label: '关闭标签页',
      icon: 'close',
      disabled: adminRouteTabs.value.length === 0,
    },
    {
      key: 'closeLeft',
      label: '关闭左侧标签页',
      icon: 'keyboard_double_arrow_left',
      disabled: snapshot.leftCount === 0,
    },
    {
      key: 'closeRight',
      label: '关闭右侧标签页',
      icon: 'keyboard_double_arrow_right',
      disabled: snapshot.rightCount === 0,
    },
    {
      key: 'closeOthers',
      label: '关闭其他标签页',
      icon: 'tab_close_right',
      disabled: adminRouteTabs.value.length <= 1,
    },
    {
      key: 'closeAll',
      label: '关闭全部标签页',
      icon: 'tab_close',
      tone: 'danger',
      separatorBefore: true,
      disabled: adminRouteTabs.value.length === 0,
    },
  ]
})

function onMenuItemClick(key: string | number): void {
  const target = visibleNavItems.value.find(item => item.key === String(key))
  if (!target)
    return
  closeMobileSidebarIfNeeded()
  if (route.path === target.to) {
    appendRouteTab(route.path, route.fullPath)
    return
  }
  void navigateTo(target.to)
}

async function submitAdminSearch() {
  const target = searchMatch.value
  if (!target)
    return
  adminSearchQuery.value = ''
  closeMobileSidebarIfNeeded()
  if (route.path === target.to)
    return
  await navigateTo(target.to)
}

function focusAdminSearch() {
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
}

function isAdminMobileViewport(): boolean {
  return import.meta.client && window.matchMedia(ADMIN_MOBILE_MEDIA_QUERY).matches
}

function toggleDesktopSidebar() {
  desktopSidebarCollapsed.value = !desktopSidebarCollapsed.value
}

function toggleMobileSidebar() {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}

function closeMobileSidebarIfNeeded() {
  if (isAdminMobileViewport())
    closeMobileSidebar()
}

function isRouteTabKeyboardContextMenuEvent(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

function openRouteTabContextMenu(payload: {
  tabId: string
  anchorPoint?: ContextMenuAnchorPoint | null
  anchorEl?: HTMLElement | null
  restoreFocusEl?: HTMLElement | null
}) {
  const target = adminRouteTabs.value.find(tab => tab.id === payload.tabId)
  if (!target)
    return

  routeTabContextMenuTabId.value = target.id
  routeTabContextMenuAnchorPoint.value = payload.anchorPoint || null
  routeTabContextMenuAnchorEl.value = payload.anchorEl || null
  routeTabContextMenuRestoreFocusEl.value = payload.restoreFocusEl || null
  routeTabContextMenuVisible.value = true
}

function closeRouteTabContextMenu(options?: { restoreFocus?: boolean }) {
  const shouldRestoreFocus = Boolean(options?.restoreFocus)
  const focusEl = routeTabContextMenuRestoreFocusEl.value

  routeTabContextMenuVisible.value = false
  routeTabContextMenuTabId.value = ''
  routeTabContextMenuAnchorPoint.value = null
  routeTabContextMenuAnchorEl.value = null
  routeTabContextMenuRestoreFocusEl.value = null

  if (shouldRestoreFocus && focusEl)
    nextTick(() => focusEl.focus())
}

function handleRouteTabContextMenuFromPointer(tabId: string, event: MouseEvent) {
  event.preventDefault()
  openRouteTabContextMenu({
    tabId,
    anchorPoint: {
      x: event.clientX,
      y: event.clientY,
    },
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}

function handleRouteTabContextMenuFromKeyboard(tabId: string, event: KeyboardEvent) {
  if (!isRouteTabKeyboardContextMenuEvent(event))
    return

  event.preventDefault()
  openRouteTabContextMenu({
    tabId,
    anchorEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}

async function handleRouteTabContextMenuSelect(key: string) {
  const targetTabId = routeTabContextMenuTabId.value
  if (!targetTabId)
    return

  try {
    switch (key) {
      case 'closeSelf':
        await closeRouteTab(targetTabId)
        return
      case 'closeLeft':
        await closeTabsToLeft(targetTabId)
        return
      case 'closeRight':
        await closeTabsToRight(targetTabId)
        return
      case 'closeOthers':
        await closeOtherTabs(targetTabId)
        return
      case 'closeAll':
        await closeAllTabs()
    }
  }
  finally {
    closeRouteTabContextMenu()
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if ((event.metaKey || event.ctrlKey) && key === 'k') {
    event.preventDefault()
    focusAdminSearch()
    return
  }
  if (key === 'escape' && mobileSidebarOpen.value) {
    closeMobileSidebar()
    return
  }
  if (key === 'escape' && document.activeElement === searchInputRef.value) {
    adminSearchQuery.value = ''
    searchInputRef.value?.blur()
  }
}

function syncFullscreenState() {
  if (!import.meta.client)
    return
  isFullscreen.value = Boolean(document.fullscreenElement)
}

async function toggleFullscreen() {
  if (!import.meta.client)
    return
  try {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen()
    else
      await document.exitFullscreen()
  }
  catch {
    syncFullscreenState()
  }
}

function openProfileDialog() {
  profileDialogVisible.value = true
}

function onUserUpdated(user: AuthUser) {
  userId.value = user.id || ''
  userName.value = user.username || '平台管理员'
  userAvatarUrl.value = user.avatarUrl || ''
}

function onWorkspaceUpdated(payload: { workspaceId: string, name: string }) {
  workspaceOptions.value = workspaceOptions.value.map((item) => {
    if (item.workspace.id !== payload.workspaceId)
      return item

    return {
      ...item,
      workspace: {
        ...item.workspace,
        name: payload.name,
      },
    }
  })
}

async function redirectOutOfAdmin(options?: { login?: boolean }): Promise<void> {
  if (!import.meta.client)
    return
  if (options?.login) {
    await navigateTo({
      path: '/login',
      query: { redirect: resolveLoginRedirectTarget(route, '/admin') },
    }, { replace: true })
    return
  }
  await navigateTo('/dashboard', { replace: true })
}

async function loadProfile() {
  loadingProfile.value = true
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    const nextWorkspaceOptions = resolveWorkspaceOptions(response.data)
    const preferredWorkspaceId = readActiveWorkspacePreference()
    const currentUserEmail = String((response.data.user as AuthUser & { email?: string | null }).email || '').trim()

    userId.value = response.data.user.id || ''
    userEmail.value = currentUserEmail
    userName.value = response.data.user.username || '平台管理员'
    userAvatarUrl.value = response.data.user.avatarUrl || ''
    platformRoles.value = response.data.user.platformRoles || []
    permissions.value = response.data.user.platformPermissions || []
    isPlatformAdmin.value = Boolean(response.data.user.isPlatformAdmin)
    workspaceOptions.value = nextWorkspaceOptions
    activeWorkspaceId.value = preferredWorkspaceId && nextWorkspaceOptions.some(item => item.workspace.id === preferredWorkspaceId)
      ? preferredWorkspaceId
      : (nextWorkspaceOptions[0]?.workspace.id || '')

    if (!showAdminBadge.value)
      await redirectOutOfAdmin()
  }
  catch (error) {
    userId.value = ''
    userEmail.value = ''
    userName.value = '未登录用户'
    userAvatarUrl.value = ''
    platformRoles.value = []
    permissions.value = []
    isPlatformAdmin.value = false
    workspaceOptions.value = []
    activeWorkspaceId.value = ''

    const info = resolveAuthRequestErrorInfo(error)
    if (info.isUnauthorized)
      await redirectOutOfAdmin({ login: true })
    else if (info.isForbidden)
      await redirectOutOfAdmin()
  }
  finally {
    loadingProfile.value = false
  }
}

onMounted(() => {
  void loadProfile()
  if (import.meta.client) {
    document.addEventListener('keydown', handleGlobalKeydown)
    document.addEventListener('fullscreenchange', syncFullscreenState)
    syncFullscreenState()
  }
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('fullscreenchange', syncFullscreenState)
})

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
    closeRouteTabContextMenu()
    closeMobileSidebarIfNeeded()
    appendRouteTab(route.path, fullPath)
  })
}
</script>

<template>
  <div v-if="isEmbedMode" class="admin-embed-shell">
    <slot />
  </div>
  <div
    v-else
    class="admin-shell"
    :class="{
      'is-sidebar-collapsed': desktopSidebarCollapsed,
      'is-mobile-sidebar-open': mobileSidebarOpen,
    }"
  >
    <a-layout class="admin-layout">
      <a-layout-sider
        :width="adminSiderWidth"
        class="admin-sider"
        :class="{ 'is-collapsed': desktopSidebarCollapsed, 'is-mobile-open': mobileSidebarOpen }"
      >
        <div class="admin-brand">
          <div class="admin-brand-mark">
            <BrandLogo variant="mark" />
          </div>
          <div class="admin-brand-copy">
            <p class="admin-brand-title">
              WinLoop Admin
            </p>
            <p class="admin-brand-caption">
              平台控制台
            </p>
          </div>
          <button
            type="button"
            class="admin-sider-toggle admin-sider-toggle--desktop"
            :aria-label="desktopSidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            :aria-pressed="desktopSidebarCollapsed ? 'true' : 'false'"
            @click="toggleDesktopSidebar"
          >
            <span
              class="admin-inline-icon"
              :class="desktopSidebarCollapsed ? 'i-heroicons-outline-chevron-right' : 'i-heroicons-outline-chevron-left'"
            />
          </button>
          <button
            type="button"
            class="admin-sider-toggle admin-sider-toggle--mobile"
            aria-label="关闭侧栏"
            @click="closeMobileSidebar"
          >
            <span class="admin-inline-icon i-heroicons-outline-x-mark" />
          </button>
        </div>

        <nav class="admin-scrollbar admin-menu-wrap">
          <div class="admin-section-title">
            核心管理
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
              <span class="admin-menu-label">{{ item.label }}</span>
            </a-menu-item>
          </a-menu>

          <div class="admin-section-title admin-section-title-system">
            系统管理
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
              <span class="admin-menu-label">{{ item.label }}</span>
            </a-menu-item>
          </a-menu>
        </nav>

        <div class="admin-user-panel">
          <a-button type="text" long class="admin-back-btn" @click="navigateTo('/dashboard')">
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
              <a-avatar :size="34" class="admin-avatar">
                <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="用户头像" class="admin-avatar-image">
                <template v-else>
                  {{ userInitial }}
                </template>
              </a-avatar>
              <div class="admin-user-meta">
                <p class="admin-user-name">
                  {{ userName }}
                </p>
                <p v-if="showAdminBadge" class="admin-admin-badge">
                  管理员
                </p>
              </div>
              <a-button type="text" size="mini" class="admin-setting-btn" @click.stop="openProfileDialog">
                <template #icon>
                  <span class="admin-inline-icon i-heroicons-outline-cog-6-tooth" />
                </template>
              </a-button>
            </template>
          </div>
        </div>
      </a-layout-sider>
      <button
        type="button"
        class="admin-mobile-sider-mask"
        aria-label="关闭侧栏"
        :tabindex="mobileSidebarOpen ? 0 : -1"
        @click="closeMobileSidebar"
      />

      <a-layout class="admin-main-layout">
        <a-layout-header class="admin-header">
          <div class="admin-header-left">
            <button
              type="button"
              class="admin-mobile-menu-btn"
              aria-label="打开侧栏"
              :aria-expanded="mobileSidebarOpen ? 'true' : 'false'"
              @click="toggleMobileSidebar"
            >
              <span class="admin-inline-icon i-heroicons-outline-bars-3" />
            </button>
            <div class="admin-header-copy">
              <p class="admin-header-title">
                {{ pageTitle }}
              </p>
              <p class="admin-header-subtitle">
                后台管理中心
              </p>
            </div>
          </div>

          <div class="admin-header-actions">
            <form class="admin-search" @submit.prevent="submitAdminSearch">
              <span class="admin-search-icon i-heroicons-outline-magnifying-glass" />
              <input
                ref="searchInputRef"
                v-model="adminSearchQuery"
                class="admin-search-input"
                type="text"
                placeholder="搜索菜单、功能或数据..."
              >
              <span class="admin-search-indicator">{{ searchIndicatorText }}</span>
            </form>

            <NuxtLink
              v-if="notificationTarget"
              :to="notificationTarget"
              class="admin-header-action admin-header-action--alert"
              aria-label="通知管理"
            >
              <span class="admin-action-icon i-heroicons-outline-bell" />
            </NuxtLink>

            <button type="button" class="admin-header-action" :aria-label="isFullscreen ? '退出全屏' : '进入全屏'" @click="toggleFullscreen">
              <span
                class="admin-action-icon"
                :class="isFullscreen ? 'i-heroicons-outline-arrows-pointing-in' : 'i-heroicons-outline-arrows-pointing-out'"
              />
            </button>
          </div>
        </a-layout-header>

        <div v-if="showRouteTabs" class="admin-route-tabs-wrap admin-scrollbar">
          <div class="admin-route-tabs-inner" role="tablist" aria-label="管理页标签">
            <div
              v-for="tab in adminRouteTabs"
              :key="tab.id"
              class="admin-route-tab-shell"
              :class="{ 'is-active': activeRouteTabId === tab.id }"
            >
              <button
                type="button"
                class="admin-route-tab"
                role="tab"
                :aria-selected="activeRouteTabId === tab.id ? 'true' : 'false'"
                :tabindex="activeRouteTabId === tab.id ? 0 : -1"
                @click="openRouteTab(tab.id)"
                @contextmenu="handleRouteTabContextMenuFromPointer(tab.id, $event)"
                @keydown.enter="openRouteTab(tab.id)"
                @keydown="handleRouteTabContextMenuFromKeyboard(tab.id, $event)"
              >
                <span class="admin-route-tab-label">{{ tab.label }}</span>
              </button>
              <button
                type="button"
                class="admin-route-tab-close"
                aria-label="关闭标签页"
                @click.stop="closeRouteTab(tab.id)"
              >
                <span class="material-symbols-outlined admin-route-tab-close-icon">close</span>
              </button>
            </div>
          </div>
        </div>

        <a-layout-content class="admin-content admin-scrollbar">
          <slot />
        </a-layout-content>
      </a-layout>
    </a-layout>

    <UiContextMenu
      :visible="routeTabContextMenuVisible"
      :items="routeTabContextMenuItems"
      :anchor-point="routeTabContextMenuAnchorPoint"
      :anchor-el="routeTabContextMenuAnchorEl"
      test-id="admin-route-tab-context-menu"
      @select="handleRouteTabContextMenuSelect"
      @close="closeRouteTabContextMenu({ restoreFocus: true })"
    />

    <UserSettingsDialog
      v-model:visible="profileDialogVisible"
      :user-name="userName"
      :user-id="userId"
      :user-email="userEmail"
      :user-avatar-url="userAvatarUrl"
      :user-subtitle="userSubtitle"
      :show-admin-badge="showAdminBadge"
      :is-platform-admin-user="isPlatformAdmin"
      :workspace-options="workspaceOptions"
      :active-workspace-id="activeWorkspaceId"
      @user-updated="onUserUpdated"
      @workspace-updated="onWorkspaceUpdated"
    />
  </div>
</template>

<style scoped>
.admin-shell {
  position: relative;
  max-width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(37, 99, 235, 0.08), transparent 30%),
    linear-gradient(180deg, #f8fbff 0%, #f3f6fb 100%);
  --wl-admin-primary: #2563eb;
  --wl-admin-primary-soft: rgba(37, 99, 235, 0.12);
  --wl-admin-border: #e2eaf4;
  --wl-admin-border-strong: #d5dfed;
  --wl-admin-surface: rgba(255, 255, 255, 0.9);
  --wl-admin-text: #10233f;
  --wl-admin-muted: #6b7a90;
}

.admin-embed-shell {
  min-height: 100vh;
  background: #f4f7fb;
  padding: 14px;
}

.admin-layout {
  height: 100%;
  width: 100%;
  min-width: 0;
}

.admin-sider {
  display: flex;
  flex-direction: column;
  z-index: 30;
  border-right: 1px solid var(--wl-admin-border);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px);
  transition:
    width 0.2s ease,
    min-width 0.2s ease,
    max-width 0.2s ease,
    flex-basis 0.2s ease,
    transform 0.2s ease;
}

.admin-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 58px;
  padding: 13px 12px 12px 16px;
  border-bottom: 1px solid var(--wl-admin-border);
}

.admin-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #edf4ff 100%);
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.admin-brand-mark :deep(.winloop-brand) {
  --winloop-brand-mark-size: 1.05rem;
}

.admin-brand-copy {
  min-width: 0;
  flex: 1;
}

.admin-brand-title {
  margin: 0;
  color: var(--wl-admin-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
}

.admin-brand-caption {
  margin: 2px 0 0;
  color: var(--wl-admin-muted);
  font-size: 11px;
  line-height: 1;
}

.admin-sider-toggle,
.admin-mobile-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(213, 223, 237, 0.92);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: #52657f;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.admin-sider-toggle:hover,
.admin-mobile-menu-btn:hover {
  border-color: rgba(37, 99, 235, 0.22);
  background: #edf4ff;
  color: var(--wl-admin-primary);
}

.admin-sider-toggle--mobile,
.admin-mobile-menu-btn {
  display: none;
}

.admin-mobile-sider-mask {
  display: none;
}

.admin-menu-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.admin-scrollbar::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.admin-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(140, 160, 190, 0.72);
  border-radius: 999px;
}

.admin-section-title {
  margin: 0;
  padding: 0 16px 6px;
  color: #8a98ae;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.admin-section-title-system {
  margin-top: 12px;
}

.admin-menu-icon {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.admin-menu-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-inline-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
}

.admin-user-panel {
  padding: 12px 12px 14px;
  border-top: 1px solid var(--wl-admin-border);
  background: rgba(255, 255, 255, 0.9);
}

.admin-back-btn {
  height: 36px;
  justify-content: flex-start;
  padding-inline: 10px;
  border-radius: 12px;
  color: #385070;
  font-size: 12px;
  font-weight: 600;
}

.admin-back-btn:hover {
  background: #eef4ff;
  color: var(--wl-admin-primary);
}

.admin-user-card {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--wl-admin-border);
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
  padding: 10px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.035);
}

.admin-user-skeleton-avatar {
  width: 30px;
  height: 30px;
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
  border-radius: 999px;
  background: #e2e8f0;
  animation: admin-pulse 1.2s ease-in-out infinite;
}

.admin-user-skeleton-line-main {
  width: 76px;
}

.admin-user-skeleton-line-sub {
  width: 40px;
  margin-top: 6px;
}

.admin-user-skeleton-setting {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #e2e8f0;
  animation: admin-pulse 1.2s ease-in-out infinite;
}

.admin-avatar {
  flex-shrink: 0;
  background: #dbe8ff;
  color: #254169;
  font-size: 11px;
  font-weight: 700;
  overflow: hidden;
}

.admin-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.admin-user-meta {
  min-width: 0;
  flex: 1;
}

.admin-user-name {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--wl-admin-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.admin-admin-badge {
  margin: 4px 0 0;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #edf4ff;
  padding: 0 7px;
  line-height: 20px;
  font-size: 10px;
  color: var(--wl-admin-primary);
  font-weight: 700;
}

.admin-setting-btn {
  color: #6b7a90;
  min-width: 28px;
  width: 28px;
  height: 28px;
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
  background: transparent;
}

.admin-header {
  height: 62px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(226, 234, 244, 0.72);
  background: rgba(255, 255, 255, 0.56);
  backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.admin-header-left {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-header-copy {
  min-width: 0;
}

.admin-header-title {
  margin: 0;
  color: var(--wl-admin-text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
}

.admin-header-subtitle {
  margin: 2px 0 0;
  color: var(--wl-admin-muted);
  font-size: 11px;
  line-height: 1;
}

.admin-header-actions {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.admin-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(420px, 40vw);
  min-width: 260px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid rgba(213, 223, 237, 0.92);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
}

.admin-search:focus-within {
  border-color: rgba(37, 99, 235, 0.26);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}

.admin-search-icon {
  width: 18px;
  height: 18px;
  color: #8ea0bc;
  flex-shrink: 0;
}

.admin-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--wl-admin-text);
  font-size: 13px;
  outline: none;
}

.admin-search-input::placeholder {
  color: #97a8bf;
}

.admin-search-indicator {
  flex-shrink: 0;
  border-radius: 8px;
  background: #f2f6fc;
  padding: 0 8px;
  line-height: 24px;
  font-size: 11px;
  color: #70829d;
  font-weight: 600;
}

.admin-header-action {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(213, 223, 237, 0.92);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: #445978;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.04);
}

.admin-header-action:hover {
  border-color: rgba(37, 99, 235, 0.22);
  background: #edf4ff;
  color: var(--wl-admin-primary);
}

.admin-header-action--alert::after {
  content: '';
  position: absolute;
  top: 7px;
  right: 7px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.96);
}

.admin-action-icon {
  width: 18px;
  height: 18px;
}

.admin-route-tabs-wrap {
  border-bottom: 1px solid rgba(226, 234, 244, 0.72);
  background: rgba(248, 251, 255, 0.88);
  overflow-x: auto;
  overflow-y: hidden;
}

.admin-route-tabs-inner {
  min-height: 36px;
  display: flex;
  align-items: center;
  min-width: max-content;
  padding: 0 8px;
}

.admin-route-tab-shell {
  position: relative;
  display: flex;
  align-items: center;
  height: 36px;
  border-right: 1px solid rgba(226, 234, 244, 0.92);
  background: transparent;
  transition: background-color 0.16s ease;
}

.admin-route-tab-shell::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: 0;
  left: 10px;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: var(--wl-admin-primary);
  opacity: 0;
  transform: scaleX(0.56);
  transform-origin: center;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.admin-route-tab-shell:hover {
  background: rgba(37, 99, 235, 0.04);
}

.admin-route-tab-shell.is-active {
  background: rgba(255, 255, 255, 0.92);
}

.admin-route-tab-shell.is-active::after {
  opacity: 1;
  transform: scaleX(1);
}

.admin-route-tab {
  display: inline-flex;
  align-items: center;
  min-width: 128px;
  max-width: 220px;
  height: 100%;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: #5f7088;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.admin-route-tab-shell.is-active .admin-route-tab {
  color: var(--wl-admin-primary);
  font-weight: 700;
}

.admin-route-tab-label {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-route-tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 6px;
  border: none;
  background: transparent;
  color: #7d8ea7;
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
}

.admin-route-tab-close:hover,
.admin-route-tab-shell.is-active .admin-route-tab-close:hover {
  background: rgba(37, 99, 235, 0.08);
  color: var(--wl-admin-primary);
}

.admin-route-tab-close-icon {
  font-size: 15px;
  line-height: 1;
}

.admin-content {
  min-height: 0;
  min-width: 0;
  overflow: auto;
  padding: 18px 20px 20px;
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
  height: 38px;
  line-height: 38px;
  margin: 3px 10px;
  padding-inline: 12px !important;
  border-radius: 12px !important;
  color: #5f7088;
  font-size: 13px;
  transition: all 0.15s ease;
}

:deep(.admin-menu .arco-menu-item:hover) {
  background: rgba(37, 99, 235, 0.06);
  color: #23456f;
}

:deep(.admin-menu .arco-menu-item.arco-menu-selected) {
  color: var(--wl-admin-primary);
  font-weight: 700;
  background: #edf4ff;
}

:deep(.admin-menu .arco-menu-icon) {
  margin-right: 8px;
  font-size: 17px;
}

:deep(.arco-btn),
:deep(.arco-input-wrapper),
:deep(.arco-select-view),
:deep(.arco-picker) {
  border-radius: 12px !important;
}

:deep(.arco-table-container),
:deep(.arco-card) {
  border-radius: 14px !important;
  overflow: hidden;
}

:deep(.arco-table-container) {
  border: 1px solid var(--wl-admin-border);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.05);
}

:deep(.arco-table-th) {
  background: #f7faff;
}

.admin-shell.is-sidebar-collapsed .admin-brand {
  justify-content: center;
  padding-inline: 12px;
}

.admin-shell.is-sidebar-collapsed .admin-brand-copy,
.admin-shell.is-sidebar-collapsed .admin-section-title,
.admin-shell.is-sidebar-collapsed .admin-menu-label,
.admin-shell.is-sidebar-collapsed .admin-user-meta,
.admin-shell.is-sidebar-collapsed .admin-setting-btn,
.admin-shell.is-sidebar-collapsed .admin-user-skeleton-meta,
.admin-shell.is-sidebar-collapsed .admin-user-skeleton-setting {
  display: none;
}

.admin-shell.is-sidebar-collapsed .admin-sider-toggle--desktop {
  position: absolute;
  top: 12px;
  right: 8px;
  width: 28px;
  height: 28px;
}

.admin-shell.is-sidebar-collapsed .admin-brand-mark {
  margin-right: 18px;
}

.admin-shell.is-sidebar-collapsed .admin-menu-wrap {
  padding-top: 10px;
}

.admin-shell.is-sidebar-collapsed .admin-section-title-system {
  margin-top: 8px;
}

.admin-shell.is-sidebar-collapsed :deep(.admin-menu .arco-menu-item) {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 42px;
  margin-inline: 12px;
  padding-inline: 0 !important;
}

.admin-shell.is-sidebar-collapsed :deep(.admin-menu .arco-menu-icon) {
  margin-right: 0;
}

.admin-shell.is-sidebar-collapsed .admin-user-panel {
  padding-inline: 10px;
}

.admin-shell.is-sidebar-collapsed .admin-back-btn {
  justify-content: center;
  padding-inline: 0;
}

.admin-shell.is-sidebar-collapsed :deep(.admin-back-btn .arco-btn-content) {
  display: none;
}

.admin-shell.is-sidebar-collapsed .admin-user-card {
  justify-content: center;
  padding: 9px;
}

@media (max-width: 1280px) {
  .admin-header {
    padding-inline: 16px;
  }

  .admin-search {
    width: min(340px, 34vw);
    min-width: 220px;
  }

  .admin-content {
    padding: 16px;
  }
}

@media (max-width: 960px) {
  .admin-layout {
    position: relative;
  }

  .admin-sider {
    position: fixed !important;
    inset: 0 auto 0 0;
    width: min(82vw, 300px) !important;
    min-width: min(82vw, 300px) !important;
    max-width: min(82vw, 300px) !important;
    flex: 0 0 min(82vw, 300px) !important;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 24px 0 48px rgba(15, 23, 42, 0.18);
    transform: translateX(-104%);
  }

  .admin-sider.is-mobile-open {
    transform: translateX(0);
  }

  .admin-shell.is-sidebar-collapsed .admin-brand {
    justify-content: flex-start;
    padding: 13px 12px 12px 16px;
  }

  .admin-shell.is-sidebar-collapsed .admin-brand-copy,
  .admin-shell.is-sidebar-collapsed .admin-section-title,
  .admin-shell.is-sidebar-collapsed .admin-menu-label,
  .admin-shell.is-sidebar-collapsed .admin-user-meta,
  .admin-shell.is-sidebar-collapsed .admin-setting-btn,
  .admin-shell.is-sidebar-collapsed .admin-user-skeleton-meta,
  .admin-shell.is-sidebar-collapsed .admin-user-skeleton-setting {
    display: block;
  }

  .admin-shell.is-sidebar-collapsed .admin-menu-label {
    display: inline-block;
  }

  .admin-shell.is-sidebar-collapsed .admin-setting-btn,
  .admin-shell.is-sidebar-collapsed .admin-user-skeleton-setting {
    display: inline-flex;
  }

  .admin-shell.is-sidebar-collapsed .admin-brand-mark {
    margin-right: 0;
  }

  .admin-shell.is-sidebar-collapsed .admin-sider-toggle--desktop {
    position: static;
    width: 34px;
    height: 34px;
  }

  .admin-shell.is-sidebar-collapsed :deep(.admin-menu .arco-menu-item) {
    display: flex;
    justify-content: flex-start;
    height: 38px;
    margin: 3px 10px;
    padding-inline: 12px !important;
  }

  .admin-shell.is-sidebar-collapsed :deep(.admin-menu .arco-menu-icon) {
    margin-right: 8px;
  }

  .admin-shell.is-sidebar-collapsed .admin-user-panel {
    padding: 12px 12px 14px;
  }

  .admin-shell.is-sidebar-collapsed .admin-back-btn {
    justify-content: flex-start;
    padding-inline: 10px;
  }

  .admin-shell.is-sidebar-collapsed :deep(.admin-back-btn .arco-btn-content) {
    display: inline-flex;
  }

  .admin-shell.is-sidebar-collapsed .admin-user-card {
    justify-content: flex-start;
    padding: 10px;
  }

  .admin-sider-toggle--desktop {
    display: none;
  }

  .admin-sider-toggle--mobile,
  .admin-mobile-menu-btn {
    display: inline-flex;
  }

  .admin-mobile-sider-mask {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: block;
    border: none;
    background: rgba(15, 23, 42, 0.34);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .admin-shell.is-mobile-sidebar-open .admin-mobile-sider-mask {
    opacity: 1;
    pointer-events: auto;
  }

  .admin-main-layout {
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
  }

  .admin-header {
    height: auto;
    padding: 12px;
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .admin-header-left {
    width: 100%;
  }

  .admin-header-copy {
    flex: 1;
  }

  .admin-header-title {
    font-size: 17px;
  }

  .admin-header-actions {
    width: 100%;
    gap: 6px;
  }

  .admin-search {
    flex: 1;
    width: auto;
    min-width: 0;
    height: 38px;
    padding-inline: 10px;
  }

  .admin-header-action {
    width: 38px;
    height: 38px;
  }

  .admin-search-indicator {
    display: none;
  }

  .admin-route-tabs-inner {
    min-height: 34px;
    min-width: max-content;
    padding-inline: 4px;
  }

  .admin-route-tab {
    min-width: 104px;
    max-width: 168px;
    padding-inline: 8px;
  }

  .admin-route-tab-close {
    width: 22px;
    margin-right: 4px;
  }

  .admin-content {
    padding: 12px;
  }
}

@media (max-width: 640px) {
  .admin-brand {
    min-height: 56px;
  }

  .admin-header-title {
    font-size: 16px;
  }

  .admin-header-subtitle {
    display: none;
  }

  .admin-search-input {
    font-size: 12px;
  }

  .admin-search-input::placeholder {
    color: transparent;
  }

  .admin-content {
    padding: 10px;
    max-width: 100vw;
  }

  :deep(.arco-card),
  :deep(.arco-table-container) {
    border-radius: 10px !important;
  }
}
</style>
