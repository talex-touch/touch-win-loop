import { computed, ref } from 'vue'

export interface AdminRouteTab {
  id: string
  path: string
  fullPath: string
  label: string
}

interface AdminNavRouteItem {
  to: string
  label: string
}

const ADMIN_ROUTE_TABS_STORAGE_KEY = 'winloop.admin.route-tabs.v1'
const MAX_ADMIN_ROUTE_TAB_COUNT = 30

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
    'track-timelines': '赛道时间线',
    'timelines': '时间节点',
    'rubrics': '评委细则',
    'judge-guidelines': '赛道详解',
    'resources': '资料',
    'ai-prompts': 'AI提示词',
    'audit': '审计历史',
  }
  return map[segment] || segment
}

export function useAdminRouteTabs(input: {
  route: { path: string, fullPath: string }
  navItems: AdminNavRouteItem[]
}) {
  const adminRouteTabs = ref<AdminRouteTab[]>([])

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

    const current = [...input.navItems]
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
      adminRouteTabs.value = normalizeAdminRouteTabs(JSON.parse(raw))
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

  const activeRoutePath = computed(() => normalizeAdminRoutePath(input.route.path))
  const activeRouteTabId = computed(() => {
    const active = adminRouteTabs.value.find(tab => tab.path === activeRoutePath.value)
    if (active)
      return active.id
    return ''
  })

  async function openRouteTab(tabId: string) {
    const target = adminRouteTabs.value.find(item => item.id === tabId)
    if (!target || target.fullPath === input.route.fullPath)
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

  return {
    adminRouteTabs,
    activeRouteTabId,
    restoreAdminRouteTabs,
    appendRouteTab,
    openRouteTab,
    closeRouteTab,
  }
}
