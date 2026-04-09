import type { ApiResponse, UserNotification, UserNotificationListResult } from '~~/shared/types/domain'
import { computed } from 'vue'
import { readActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

const POLL_INTERVAL_MS = 60_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let focusHandlerRegistered = false
let refreshRunner: (() => Promise<void>) | null = null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function resolveWorkspaceContext(workspaceId?: string): string {
  return normalizeString(workspaceId) || readActiveWorkspacePreference()
}

function mergeNotificationItems(current: UserNotification[], incoming: UserNotification[]): UserNotification[] {
  const map = new Map<string, UserNotification>()
  for (const item of [...current, ...incoming])
    map.set(item.id, item)
  return Array.from(map.values()).sort((left, right) => {
    const timeDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    if (timeDiff !== 0)
      return timeDiff
    return right.id.localeCompare(left.id)
  })
}

function shouldUseExternalNavigation(url: string): boolean {
  return /^https?:\/\//i.test(normalizeString(url))
}

export function useNotificationCenter() {
  const drawerVisible = useState<boolean>('notification-center:drawer-visible', () => false)
  const loading = useState<boolean>('notification-center:loading', () => false)
  const loadingMore = useState<boolean>('notification-center:loading-more', () => false)
  const markingAllRead = useState<boolean>('notification-center:marking-all-read', () => false)
  const errorText = useState<string>('notification-center:error-text', () => '')
  const items = useState<UserNotification[]>('notification-center:items', () => [])
  const unreadCount = useState<number>('notification-center:unread-count', () => 0)
  const nextCursor = useState<string>('notification-center:next-cursor', () => '')
  const activeWorkspaceId = useState<string>('notification-center:active-workspace-id', () => '')
  const initialized = useState<boolean>('notification-center:initialized', () => false)
  const latestRequestKey = useState<string>('notification-center:latest-request-key', () => '')
  const authApiFetch = useAuthApiFetch()

  async function fetchNotifications(options?: { append?: boolean, cursor?: string, silent?: boolean }) {
    const workspaceId = resolveWorkspaceContext(activeWorkspaceId.value)
    const append = options?.append === true
    const cursor = normalizeString(options?.cursor) || (append ? nextCursor.value : '')
    const requestKey = `${workspaceId}:${cursor}:${append ? 'append' : 'replace'}`
    latestRequestKey.value = requestKey

    if (append)
      loadingMore.value = true
    else if (!options?.silent)
      loading.value = true

    errorText.value = ''
    try {
      const response = await authApiFetch<ApiResponse<UserNotificationListResult>>('/notifications', {
        method: 'GET',
        query: {
          workspaceId: workspaceId || undefined,
          limit: 20,
          cursor: cursor || undefined,
        },
      })

      if (latestRequestKey.value !== requestKey)
        return

      items.value = append
        ? mergeNotificationItems(items.value, response.data.items || [])
        : (response.data.items || [])
      unreadCount.value = Math.max(0, Number(response.data.unreadCount || 0))
      nextCursor.value = String(response.data.nextCursor || '').trim()
      initialized.value = true
    }
    catch (error: any) {
      if (latestRequestKey.value !== requestKey)
        return
      errorText.value = String(error?.data?.message || '通知加载失败，请稍后重试。')
    }
    finally {
      if (latestRequestKey.value === requestKey) {
        loading.value = false
        loadingMore.value = false
      }
    }
  }

  async function refresh(options?: { silent?: boolean }) {
    await fetchNotifications({
      append: false,
      silent: options?.silent,
    })
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value)
      return
    await fetchNotifications({
      append: true,
      cursor: nextCursor.value,
      silent: true,
    })
  }

  async function markRead(notificationId: string) {
    const normalizedId = normalizeString(notificationId)
    if (!normalizedId)
      return

    const current = items.value.find(item => item.id === normalizedId)
    if (!current || current.readAt)
      return

    const optimisticReadAt = new Date().toISOString()
    items.value = items.value.map(item => item.id === normalizedId ? { ...item, readAt: optimisticReadAt } : item)
    unreadCount.value = Math.max(0, unreadCount.value - 1)

    try {
      await authApiFetch<ApiResponse<{ updated: boolean }>>(`/notifications/${encodeURIComponent(normalizedId)}/read`, {
        method: 'POST',
      })
    }
    catch {
      items.value = items.value.map(item => item.id === normalizedId ? { ...item, readAt: current.readAt || null } : item)
      unreadCount.value += 1
    }
  }

  async function markAllRead() {
    if (markingAllRead.value)
      return

    markingAllRead.value = true
    const workspaceId = resolveWorkspaceContext(activeWorkspaceId.value)
    const optimisticItems = items.value.map(item => item.readAt ? item : { ...item, readAt: new Date().toISOString() })
    const optimisticUnread = unreadCount.value
    items.value = optimisticItems
    unreadCount.value = 0

    try {
      await authApiFetch<ApiResponse<{ updatedCount: number }>>('/notifications/read-all', {
        method: 'POST',
        body: {
          workspaceId: workspaceId || undefined,
        },
      })
    }
    catch {
      unreadCount.value = optimisticUnread
      await refresh({
        silent: true,
      })
    }
    finally {
      markingAllRead.value = false
    }
  }

  async function openDrawer() {
    drawerVisible.value = true
    await refresh()
  }

  function closeDrawer() {
    drawerVisible.value = false
  }

  async function openNotification(item: UserNotification) {
    await markRead(item.id)
    const actionUrl = normalizeString(item.actionUrl)
    if (!actionUrl)
      return

    if (shouldUseExternalNavigation(actionUrl) && import.meta.client) {
      window.location.href = actionUrl
      return
    }

    await navigateTo(actionUrl)
  }

  function setWorkspaceId(workspaceId?: string) {
    const nextWorkspaceId = resolveWorkspaceContext(workspaceId)
    if (activeWorkspaceId.value === nextWorkspaceId)
      return

    activeWorkspaceId.value = nextWorkspaceId
    nextCursor.value = ''
    initialized.value = false
    if (drawerVisible.value)
      void refresh()
  }

  function ensureStarted() {
    refreshRunner = async () => {
      await refresh({
        silent: true,
      })
    }

    if (!import.meta.client)
      return

    if (!focusHandlerRegistered) {
      window.addEventListener('focus', () => {
        if (refreshRunner)
          void refreshRunner()
      })
      focusHandlerRegistered = true
    }

    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (refreshRunner)
          void refreshRunner()
      }, POLL_INTERVAL_MS)
    }
  }

  ensureStarted()

  return {
    drawerVisible,
    loading,
    loadingMore,
    markingAllRead,
    errorText,
    items,
    unreadCount: computed(() => unreadCount.value),
    nextCursor,
    initialized,
    activeWorkspaceId: computed(() => activeWorkspaceId.value),
    setWorkspaceId,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    openDrawer,
    closeDrawer,
    openNotification,
  }
}
