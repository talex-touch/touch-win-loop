import type { ProjectSettingsDraftUi } from '~~/shared/types/domain'
import { computed, ref } from 'vue'
import {
  normalizeWorkspaceLeftSidebarWidth,
  normalizeWorkspaceRightSidebarWidth,
} from '~~/shared/utils/workspace-layout'

const DEFAULT_RIGHT_SIDEBAR_BREAKPOINT_QUERY = '(min-width: 1280px)'

export function useWorkspaceSidebarLayout(breakpointQuery = DEFAULT_RIGHT_SIDEBAR_BREAKPOINT_QUERY) {
  const leftSidebarCollapsed = ref(true)
  const leftSidebarWidth = ref(normalizeWorkspaceLeftSidebarWidth(null))
  const rightSidebarUserCollapsed = ref(true)
  const rightSidebarWidth = ref(normalizeWorkspaceRightSidebarWidth(null))
  const rightSidebarAutoCollapsed = ref(false)
  const rightSidebarAutoRestorePending = ref(false)
  const sidebarLayoutHydrating = ref(false)
  const rightSidebarCollapsed = computed(() => rightSidebarUserCollapsed.value || rightSidebarAutoCollapsed.value)

  let rightSidebarBreakpointMediaQuery: MediaQueryList | null = null
  let unsubscribeRightSidebarBreakpoint: (() => void) | null = null

  function withSidebarLayoutHydrating<T>(callback: () => T): T {
    sidebarLayoutHydrating.value = true
    try {
      return callback()
    }
    finally {
      sidebarLayoutHydrating.value = false
    }
  }

  function applyRightSidebarAutoCollapse(nextCollapsed: boolean, nextRestorePending = rightSidebarAutoRestorePending.value): void {
    const normalizedCollapsed = Boolean(nextCollapsed)
    const normalizedRestorePending = Boolean(nextRestorePending)
    if (
      rightSidebarAutoCollapsed.value === normalizedCollapsed
      && rightSidebarAutoRestorePending.value === normalizedRestorePending
    ) {
      return
    }

    withSidebarLayoutHydrating(() => {
      rightSidebarAutoCollapsed.value = normalizedCollapsed
      rightSidebarAutoRestorePending.value = normalizedRestorePending
    })
  }

  function handleRightSidebarBreakpointChange(isWide: boolean): void {
    if (isWide) {
      if (rightSidebarAutoCollapsed.value || rightSidebarAutoRestorePending.value)
        applyRightSidebarAutoCollapse(false, false)
      return
    }

    if (rightSidebarCollapsed.value)
      return

    applyRightSidebarAutoCollapse(true, true)
  }

  function initializeRightSidebarBreakpointTracking(): void {
    if (!import.meta.client)
      return

    disposeRightSidebarBreakpointTracking()

    rightSidebarBreakpointMediaQuery = window.matchMedia(breakpointQuery)
    handleRightSidebarBreakpointChange(rightSidebarBreakpointMediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => {
      handleRightSidebarBreakpointChange(event.matches)
    }

    if (typeof rightSidebarBreakpointMediaQuery.addEventListener === 'function') {
      rightSidebarBreakpointMediaQuery.addEventListener('change', handleChange)
      unsubscribeRightSidebarBreakpoint = () => {
        rightSidebarBreakpointMediaQuery?.removeEventListener('change', handleChange)
        rightSidebarBreakpointMediaQuery = null
      }
      return
    }

    rightSidebarBreakpointMediaQuery.addListener(handleChange)
    unsubscribeRightSidebarBreakpoint = () => {
      rightSidebarBreakpointMediaQuery?.removeListener(handleChange)
      rightSidebarBreakpointMediaQuery = null
    }
  }

  function disposeRightSidebarBreakpointTracking(): void {
    unsubscribeRightSidebarBreakpoint?.()
    unsubscribeRightSidebarBreakpoint = null
    rightSidebarBreakpointMediaQuery = null
  }

  function setRightSidebarUserCollapsed(nextCollapsed: boolean, options: { suppressPersist?: boolean } = {}): void {
    const normalizedCollapsed = Boolean(nextCollapsed)
    const apply = () => {
      rightSidebarUserCollapsed.value = normalizedCollapsed
      rightSidebarAutoCollapsed.value = false
      rightSidebarAutoRestorePending.value = false
    }

    if (options.suppressPersist) {
      withSidebarLayoutHydrating(apply)
      return
    }

    apply()
  }

  function setLeftSidebarWidth(nextWidth: number): void {
    leftSidebarWidth.value = normalizeWorkspaceLeftSidebarWidth(nextWidth)
  }

  function setRightSidebarWidth(nextWidth: number): void {
    rightSidebarWidth.value = normalizeWorkspaceRightSidebarWidth(nextWidth)
  }

  function applySidebarLayoutState(value: ProjectSettingsDraftUi | null | undefined): void {
    const nextLeftCollapsed = Boolean(value?.leftSidebarCollapsed)
    const nextRightCollapsed = Boolean(value?.rightSidebarCollapsed)
    if (
      leftSidebarCollapsed.value === nextLeftCollapsed
      && rightSidebarUserCollapsed.value === nextRightCollapsed
    ) {
      return
    }

    withSidebarLayoutHydrating(() => {
      leftSidebarCollapsed.value = nextLeftCollapsed
      rightSidebarUserCollapsed.value = nextRightCollapsed
    })
  }

  function collapseRightSidebar(): void {
    setRightSidebarUserCollapsed(true)
  }

  function expandRightSidebar(): void {
    setRightSidebarUserCollapsed(false)
  }

  return {
    leftSidebarCollapsed,
    leftSidebarWidth,
    rightSidebarUserCollapsed,
    rightSidebarWidth,
    rightSidebarAutoCollapsed,
    rightSidebarAutoRestorePending,
    sidebarLayoutHydrating,
    rightSidebarCollapsed,
    withSidebarLayoutHydrating,
    initializeRightSidebarBreakpointTracking,
    disposeRightSidebarBreakpointTracking,
    setRightSidebarUserCollapsed,
    setLeftSidebarWidth,
    setRightSidebarWidth,
    applySidebarLayoutState,
    collapseRightSidebar,
    expandRightSidebar,
  }
}
