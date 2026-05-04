import type {
  WorkspaceFixedTabId,
} from '~~/shared/types/domain'
import type { WorkspacePreviewMode } from '~/composables/useWorkspaceProjectResources'
import type { WorkspaceMainTabId } from '~/composables/useWorkspaceProjectShell'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { normalizeWorkspaceMainTabIds } from '~/composables/useWorkspaceProjectShell'

export interface WorkspaceMainTab {
  id: WorkspaceMainTabId
  kind: 'fixed' | 'resource' | 'meeting' | 'meeting_create'
  title: string
  icon: string
  closeable: boolean
  resourceId?: string
  meetingId?: string
  meetingMode?: 'audio' | 'video'
  previewMode?: WorkspacePreviewMode
}

interface UseWorkspaceMainTabsOptions {
  fixedTabs: WorkspaceMainTab[]
  propOpenTabs: () => WorkspaceMainTabId[] | undefined
  propActiveTabId: () => WorkspaceMainTabId | '' | undefined
  previewResourceId: () => string
  resolveTabFromId: (tabId: WorkspaceMainTabId) => WorkspaceMainTab | null
  resolvePreviewTab: () => WorkspaceMainTab | null
  onActivateResource: (resourceId: string) => void
  onClosePreviewResource: (resourceId: string) => void
  emitUpdateOpenTabs: (tabIds: WorkspaceMainTabId[]) => void
  emitUpdateActiveTabId: (tabId: WorkspaceMainTabId | '') => void
}

export function areWorkspaceMainTabIdListsEqual(
  left: readonly WorkspaceMainTabId[],
  right: readonly WorkspaceMainTabId[],
): boolean {
  if (left.length !== right.length)
    return false
  return left.every((tabId, index) => tabId === right[index])
}

export function useWorkspaceMainTabs(options: UseWorkspaceMainTabsOptions) {
  const openTabs = ref<WorkspaceMainTab[]>([])
  const activeTabId = ref<WorkspaceMainTabId | ''>('')
  const hasOpenTabs = computed(() => openTabs.value.length > 0)
  const draggingTabId = ref<WorkspaceMainTabId | ''>('')
  const dragOverTabId = ref<WorkspaceMainTabId | ''>('')
  const tabContextMenuVisible = ref(false)
  const tabContextMenuTabId = ref<WorkspaceMainTabId | ''>('')
  const tabContextMenuPosition = reactive({ x: 0, y: 0 })

  function findFixedTab(tabId: WorkspaceFixedTabId): WorkspaceMainTab | undefined {
    return options.fixedTabs.find(tab => tab.id === tabId)
  }

  function ensureFixedTabOpen(tabId: WorkspaceFixedTabId, activate = true): void {
    const existed = openTabs.value.some(tab => tab.id === tabId)
    if (!existed) {
      const target = findFixedTab(tabId)
      if (target)
        openTabs.value = [...openTabs.value, target]
    }

    if (activate)
      activeTabId.value = tabId
  }

  function ensurePreviewTabOpen(activate = true): WorkspaceMainTab | null {
    const previewTab = options.resolvePreviewTab()
    if (!previewTab)
      return null

    const existingIndex = openTabs.value.findIndex(tab => tab.id === previewTab.id)
    if (existingIndex < 0) {
      openTabs.value = [...openTabs.value, previewTab]
    }
    else {
      const nextTabs = [...openTabs.value]
      nextTabs.splice(existingIndex, 1, {
        ...nextTabs[existingIndex],
        ...previewTab,
      })
      openTabs.value = nextTabs
    }

    if (activate)
      activeTabId.value = previewTab.id

    return previewTab
  }

  function closeTabContextMenu(): void {
    tabContextMenuVisible.value = false
    tabContextMenuTabId.value = ''
  }

  function emitActivatePreviewResource(resourceId: string): void {
    const normalizedResourceId = String(resourceId || '').trim()
    if (!normalizedResourceId)
      return
    options.onActivateResource(normalizedResourceId)
  }

  function activateTab(tabId: WorkspaceMainTabId): void {
    closeTabContextMenu()
    activeTabId.value = tabId
    const target = openTabs.value.find(tab => tab.id === tabId)
    if (target?.kind === 'resource' && target.resourceId)
      emitActivatePreviewResource(target.resourceId)
  }

  function resolveFallbackTab(closingSet: Set<WorkspaceMainTabId>, closingTabId: WorkspaceMainTabId): WorkspaceMainTab | null {
    const currentIndex = openTabs.value.findIndex(tab => tab.id === closingTabId)
    if (currentIndex < 0)
      return null

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = openTabs.value[index]
      if (candidate && !closingSet.has(candidate.id))
        return candidate
    }

    for (let index = currentIndex + 1; index < openTabs.value.length; index += 1) {
      const candidate = openTabs.value[index]
      if (candidate && !closingSet.has(candidate.id))
        return candidate
    }

    return null
  }

  function closeTabsByIds(
    tabIds: WorkspaceMainTabId[],
    optionsOverrides: { emitClosePreview?: boolean, emitActivate?: boolean } = {},
  ): void {
    const existingTabIds = new Set(openTabs.value.map(tab => tab.id))
    const closingIds = normalizeWorkspaceMainTabIds(
      [...new Set(tabIds)].filter(tabId => existingTabIds.has(tabId)),
      { allowEmpty: true },
    )
    if (closingIds.length === 0)
      return

    closeTabContextMenu()

    const closingSet = new Set<WorkspaceMainTabId>(closingIds)
    const currentActiveTabId = activeTabId.value
    const activeTabBeforeClose = currentActiveTabId
      ? openTabs.value.find(tab => tab.id === currentActiveTabId) || null
      : null
    const activeTabWillClose = Boolean(currentActiveTabId && closingSet.has(currentActiveTabId))
    const fallbackTab = activeTabWillClose && currentActiveTabId
      ? resolveFallbackTab(closingSet, currentActiveTabId)
      : null
    const currentPreviewResourceId = String(options.previewResourceId() || '').trim()
    const currentPreviewTabId = currentPreviewResourceId
      ? (`resource:${currentPreviewResourceId}` as WorkspaceMainTabId)
      : null
    const hiddenPreviewTabWillClose = Boolean(
      currentPreviewTabId
      && closingSet.has(currentPreviewTabId)
      && activeTabBeforeClose?.id !== currentPreviewTabId,
    )

    openTabs.value = openTabs.value.filter(tab => !closingSet.has(tab.id))

    if (hiddenPreviewTabWillClose && optionsOverrides.emitClosePreview !== false && currentPreviewResourceId)
      options.onClosePreviewResource(currentPreviewResourceId)

    if (!activeTabWillClose)
      return

    activeTabId.value = fallbackTab?.id || ''

    if (fallbackTab?.kind === 'resource' && fallbackTab.resourceId) {
      if (optionsOverrides.emitActivate !== false)
        emitActivatePreviewResource(fallbackTab.resourceId)
      return
    }

    if (activeTabBeforeClose?.kind === 'resource' && activeTabBeforeClose.resourceId && optionsOverrides.emitClosePreview !== false)
      options.onClosePreviewResource(activeTabBeforeClose.resourceId)
  }

  function closeTab(tabId: WorkspaceMainTabId): void {
    closeTabsByIds([tabId], {
      emitClosePreview: true,
      emitActivate: true,
    })
  }

  function closeResourceTabByResourceId(
    resourceId: string,
    optionsOverrides: { emitClosePreview?: boolean, emitActivate?: boolean } = {},
  ): void {
    const normalizedResourceId = String(resourceId || '').trim()
    if (!normalizedResourceId)
      return
    closeTabsByIds([`resource:${normalizedResourceId}` as WorkspaceMainTabId], optionsOverrides)
  }

  function syncOpenTabsFromProp(tabIds: WorkspaceMainTabId[] | undefined): void {
    const normalizedIds = normalizeWorkspaceMainTabIds(tabIds || [], { allowEmpty: true })
    const resolvedTabs = normalizedIds
      .map(tabId => options.resolveTabFromId(tabId))
      .filter((tab): tab is WorkspaceMainTab => Boolean(tab))
    const nextTabs = resolvedTabs
    const currentTabIds = openTabs.value.map(tab => tab.id)
    const nextTabIds = nextTabs.map(tab => tab.id)
    if (areWorkspaceMainTabIdListsEqual(currentTabIds, nextTabIds))
      return
    openTabs.value = nextTabs
  }

  function openTabContextMenu(
    tabId: WorkspaceMainTabId,
    optionsOverrides: {
      event?: MouseEvent | null
      position?: { x: number, y: number } | null
    } = {},
  ): void {
    optionsOverrides.event?.preventDefault()
    tabContextMenuTabId.value = tabId
    if (optionsOverrides.position) {
      tabContextMenuPosition.x = Math.max(0, Math.trunc(Number(optionsOverrides.position.x) || 0))
      tabContextMenuPosition.y = Math.max(0, Math.trunc(Number(optionsOverrides.position.y) || 0))
    }
    else if (optionsOverrides.event) {
      tabContextMenuPosition.x = optionsOverrides.event.clientX
      tabContextMenuPosition.y = optionsOverrides.event.clientY
    }
    tabContextMenuVisible.value = true
  }

  const tabContextMenuTab = computed(() => {
    return openTabs.value.find(tab => tab.id === tabContextMenuTabId.value) || null
  })

  const tabContextMenuIndex = computed(() => {
    if (!tabContextMenuTabId.value)
      return -1
    return openTabs.value.findIndex(tab => tab.id === tabContextMenuTabId.value)
  })

  const tabContextMenuLeftIds = computed<WorkspaceMainTabId[]>(() => {
    const index = tabContextMenuIndex.value
    if (index <= 0)
      return []
    return openTabs.value.slice(0, index).map(tab => tab.id)
  })

  const tabContextMenuRightIds = computed<WorkspaceMainTabId[]>(() => {
    const index = tabContextMenuIndex.value
    if (index < 0)
      return []
    return openTabs.value.slice(index + 1).map(tab => tab.id)
  })

  function closeTabsToLeft(): void {
    if (tabContextMenuLeftIds.value.length === 0)
      return
    closeTabsByIds(tabContextMenuLeftIds.value, {
      emitClosePreview: true,
      emitActivate: true,
    })
  }

  function closeTabsToRight(): void {
    if (tabContextMenuRightIds.value.length === 0)
      return
    closeTabsByIds(tabContextMenuRightIds.value, {
      emitClosePreview: true,
      emitActivate: true,
    })
  }

  function closeOtherTabs(): void {
    const currentTab = tabContextMenuTab.value
    if (!currentTab)
      return
    closeTabsByIds(
      openTabs.value
        .filter(tab => tab.id !== currentTab.id)
        .map(tab => tab.id),
      {
        emitClosePreview: true,
        emitActivate: true,
      },
    )
  }

  function closeAllTabs(): void {
    closeTabsByIds(openTabs.value.map(tab => tab.id), {
      emitClosePreview: true,
      emitActivate: true,
    })
  }

  function handleGlobalPointerDown(event: PointerEvent): void {
    if (!tabContextMenuVisible.value)
      return
    const target = event.target as HTMLElement | null
    if (target?.closest('.workspace-tab-context-menu') || target?.closest('.wl-context-menu'))
      return
    closeTabContextMenu()
  }

  function handleGlobalEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape')
      closeTabContextMenu()
  }

  function moveTab(fromId: WorkspaceMainTabId, toId: WorkspaceMainTabId): void {
    if (fromId === toId)
      return

    const nextTabs = [...openTabs.value]
    const fromIndex = nextTabs.findIndex(tab => tab.id === fromId)
    const toIndex = nextTabs.findIndex(tab => tab.id === toId)
    if (fromIndex < 0 || toIndex < 0)
      return

    const [moved] = nextTabs.splice(fromIndex, 1)
    if (!moved)
      return

    nextTabs.splice(toIndex, 0, moved)
    openTabs.value = nextTabs
  }

  function onTabDragStart(tabId: WorkspaceMainTabId): void {
    draggingTabId.value = tabId
    dragOverTabId.value = ''
  }

  function onTabDragOver(tabId: WorkspaceMainTabId, event: DragEvent): void {
    if (!draggingTabId.value || draggingTabId.value === tabId)
      return
    event.preventDefault()
    dragOverTabId.value = tabId
  }

  function onTabDrop(tabId: WorkspaceMainTabId, event: DragEvent): void {
    event.preventDefault()
    const fromId = draggingTabId.value
    if (!fromId || fromId === tabId) {
      dragOverTabId.value = ''
      return
    }

    moveTab(fromId, tabId)
    dragOverTabId.value = ''
  }

  function onTabDragEnd(): void {
    draggingTabId.value = ''
    dragOverTabId.value = ''
  }

  onMounted(() => {
    document.addEventListener('pointerdown', handleGlobalPointerDown)
    document.addEventListener('keydown', handleGlobalEscape)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleGlobalPointerDown)
    document.removeEventListener('keydown', handleGlobalEscape)
  })

  watch(() => options.propOpenTabs(), (next) => {
    syncOpenTabsFromProp(next)
  }, { immediate: true })

  watch(() => options.propActiveTabId(), (next) => {
    const normalizedTabId = String(next || '').trim() as WorkspaceMainTabId | ''
    if (!normalizedTabId) {
      activeTabId.value = openTabs.value[0]?.id || ''
      return
    }

    const hasTab = openTabs.value.some(tab => tab.id === normalizedTabId)
    if (!hasTab)
      syncOpenTabsFromProp([...normalizeWorkspaceMainTabIds(options.propOpenTabs() || [], { allowEmpty: true }), normalizedTabId])
    activeTabId.value = normalizedTabId
  }, { immediate: true })

  watch(() => openTabs.value.map(tab => tab.id), (nextTabIds, previousTabIds) => {
    if (previousTabIds && areWorkspaceMainTabIdListsEqual(nextTabIds, previousTabIds))
      return
    options.emitUpdateOpenTabs([...nextTabIds])
  }, { immediate: true })

  watch(activeTabId, (next) => {
    options.emitUpdateActiveTabId(next)
  }, { immediate: true })

  return {
    openTabs,
    activeTabId,
    hasOpenTabs,
    draggingTabId,
    dragOverTabId,
    tabContextMenuVisible,
    tabContextMenuPosition,
    tabContextMenuTab,
    tabContextMenuLeftIds,
    tabContextMenuRightIds,
    ensureFixedTabOpen,
    ensurePreviewTabOpen,
    closeTabContextMenu,
    activateTab,
    closeTab,
    closeResourceTabByResourceId,
    closeTabsToLeft,
    closeTabsToRight,
    closeOtherTabs,
    closeAllTabs,
    openTabContextMenu,
    onTabDragStart,
    onTabDragOver,
    onTabDrop,
    onTabDragEnd,
  }
}
