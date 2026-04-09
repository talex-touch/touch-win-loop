<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { resolveWorkspaceCollabPresenceInitial } from '~/components/workspace/collab/presence'

type StackMode = 'inline' | 'overlay'
type AvatarStackSize = 'md' | 'sm'
type AvatarStackAppearance = 'default' | 'flat'

interface RectBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface RectCandidate {
  left: number
  top: number
}

type RectLike = RectBounds | DOMRect | DOMRectReadOnly

const props = withDefaults(defineProps<{
  users?: WorkspaceCollabPresenceUser[]
  mode?: StackMode
  size?: AvatarStackSize
  appearance?: AvatarStackAppearance
}>(), {
  users: () => [],
  mode: 'inline',
  size: 'md',
  appearance: 'default',
})

const rootRef = ref<HTMLDivElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)
const openUserId = ref('')
const triggerRefs = new Map<string, HTMLButtonElement>()
const overlayAnchor = reactive({
  right: 16,
  bottom: 16,
})
const popoverPosition = reactive({
  top: 0,
  left: 0,
})

const STACK_PADDING = 16
const STACK_GAP = 12
const POPOVER_WIDTH = 288
const POPOVER_FALLBACK_HEIGHT = 248
const COLLISION_SELECTORS = [
  '.tlui-style-panel__wrapper',
  '.tlui-style-panel',
  '.tlui-layout__bottom',
  '.tlui-navigation-panel',
  '.tlui-help-menu',
  '.tlui-minimap',
  '.tlui-zoom-menu__button',
].join(', ')

let closePopoverTimer: ReturnType<typeof setTimeout> | null = null
let layoutFrame: number | null = null
let overlayResizeObserver: ResizeObserver | null = null
let overlayMutationObserver: MutationObserver | null = null
let removeWindowListeners: (() => void) | null = null

const isOverlayMode = computed(() => props.mode === 'overlay')
const isSmallSize = computed(() => props.size === 'sm')
const isFlatAppearance = computed(() => props.appearance === 'flat')
const visibleUsers = computed(() => props.users.slice(0, 5))
const overflowCount = computed(() => Math.max(0, props.users.length - visibleUsers.value.length))
const openUser = computed(() => {
  const targetUserId = String(openUserId.value || '').trim()
  if (!targetUserId)
    return null
  return props.users.find(user => user.userId === targetUserId) || null
})
const rootClassName = computed(() => {
  return isOverlayMode.value
    ? 'absolute z-30 select-none'
    : 'relative flex items-center justify-end'
})
const rootStyle = computed<CSSProperties | undefined>(() => {
  if (!isOverlayMode.value)
    return undefined
  return {
    right: `${overlayAnchor.right}px`,
    bottom: `${overlayAnchor.bottom}px`,
  }
})
const popoverStyle = computed<CSSProperties>(() => {
  return {
    top: `${popoverPosition.top}px`,
    left: `${popoverPosition.left}px`,
  }
})
const avatarButtonClassName = computed(() => {
  return [
    'border-2 rounded-full bg-white flex shrink-0 items-center justify-center relative overflow-visible',
    isSmallSize.value ? 'h-6 w-6' : 'h-7 w-7',
    isFlatAppearance.value ? 'shadow-none' : 'shadow-sm',
  ]
})
const avatarFallbackClassName = computed(() => {
  return isSmallSize.value
    ? 'text-[10px] font-semibold flex h-full w-full items-center justify-center'
    : 'text-[11px] font-semibold flex h-full w-full items-center justify-center'
})
const overflowClassName = computed(() => {
  return [
    'text-[10px] text-slate-600 font-semibold px-1 border border-slate-300 rounded-full bg-slate-100 flex shrink-0 items-center justify-center relative',
    isSmallSize.value ? 'h-6 min-w-6' : 'h-7 min-w-7',
    isFlatAppearance.value ? 'shadow-none' : 'shadow-sm',
  ]
})
const popoverClassName = computed(() => {
  return [
    'p-4 border border-slate-200 rounded-2xl bg-white w-72 fixed z-[4000]',
    isFlatAppearance.value ? 'shadow-none' : 'shadow-[0_18px_48px_rgba(15,23,42,0.18)]',
  ]
})

function resolveAvatarWidth(): number {
  return isSmallSize.value ? 24 : 28
}

function resolveAvatarOverlapOffset(): number {
  return isSmallSize.value ? 8 : 10
}

function resolveCanvasRoot(): HTMLElement | null {
  if (!import.meta.client)
    return null
  return rootRef.value?.closest('[data-collab-canvas-root]') as HTMLElement | null
}

function resolveBoundaryRect(): RectBounds {
  if (isOverlayMode.value) {
    const canvasRoot = resolveCanvasRoot()
    if (canvasRoot)
      return normalizeRect(canvasRoot.getBoundingClientRect())
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function normalizeRect(rect: RectLike): RectBounds {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function normalizeRelativeRect(rect: RectLike, boundary: RectBounds): RectBounds {
  return {
    left: rect.left - boundary.left,
    top: rect.top - boundary.top,
    right: rect.right - boundary.left,
    bottom: rect.bottom - boundary.top,
    width: rect.width,
    height: rect.height,
  }
}

function rectsIntersect(left: RectBounds, right: RectBounds): boolean {
  return !(
    left.right <= right.left
    || left.left >= right.right
    || left.bottom <= right.top
    || left.top >= right.bottom
  )
}

function rectIntersectionArea(left: RectBounds, right: RectBounds): number {
  if (!rectsIntersect(left, right))
    return 0

  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
  return width * height
}

function clearClosePopoverTimer(): void {
  if (!closePopoverTimer)
    return
  clearTimeout(closePopoverTimer)
  closePopoverTimer = null
}

function clearLayoutFrame(): void {
  if (layoutFrame === null || !import.meta.client)
    return
  cancelAnimationFrame(layoutFrame)
  layoutFrame = null
}

function clearOverlayObservers(): void {
  overlayResizeObserver?.disconnect()
  overlayResizeObserver = null
  overlayMutationObserver?.disconnect()
  overlayMutationObserver = null
  removeWindowListeners?.()
  removeWindowListeners = null
}

function scheduleClosePopover(): void {
  clearClosePopoverTimer()
  closePopoverTimer = setTimeout(() => {
    openUserId.value = ''
  }, 120)
}

function closePopover(): void {
  clearClosePopoverTimer()
  openUserId.value = ''
}

function setTriggerRef(userId: string, element: Element | null): void {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return

  if (element instanceof HTMLButtonElement) {
    triggerRefs.set(normalizedUserId, element)
    return
  }

  triggerRefs.delete(normalizedUserId)
}

function estimateStackWidth(): number {
  const avatarCount = visibleUsers.value.length
  if (avatarCount === 0)
    return 0

  const avatarWidth = resolveAvatarWidth()
  const overlapOffset = resolveAvatarOverlapOffset()
  const overlapWidth = avatarWidth - overlapOffset
  const overflowWidth = overflowCount.value > 0 ? avatarWidth : 0
  return avatarWidth + Math.max(0, avatarCount - 1) * overlapWidth + overflowWidth
}

function resolveCollisionRects(boundary: RectBounds, excludeElement?: HTMLElement | null): RectBounds[] {
  if (!import.meta.client || !isOverlayMode.value)
    return []

  const canvasRoot = resolveCanvasRoot()
  if (!canvasRoot)
    return []

  const candidates = Array.from(canvasRoot.querySelectorAll(COLLISION_SELECTORS))
  return candidates.flatMap((node) => {
    if (!(node instanceof HTMLElement))
      return []
    if (excludeElement && (node === excludeElement || excludeElement.contains(node) || node.contains(excludeElement)))
      return []
    if (rootRef.value && (node === rootRef.value || rootRef.value.contains(node)))
      return []

    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') === 0)
      return []

    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0)
      return []

    return [normalizeRect(rect)]
  })
}

function syncOverlayAnchor(): void {
  if (!import.meta.client || !isOverlayMode.value)
    return

  const boundary = resolveBoundaryRect()
  const width = rootRef.value?.offsetWidth || estimateStackWidth()
  const height = rootRef.value?.offsetHeight || resolveAvatarWidth()
  if (width <= 0 || height <= 0)
    return

  let nextRight = STACK_PADDING
  let nextBottom = STACK_PADDING
  const collisionRects = resolveCollisionRects(boundary)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stackRect: RectBounds = {
      left: boundary.width - nextRight - width,
      top: boundary.height - nextBottom - height,
      right: boundary.width - nextRight,
      bottom: boundary.height - nextBottom,
      width,
      height,
    }

    let moved = false
    for (const collisionRect of collisionRects) {
      const relativeRect = normalizeRelativeRect(collisionRect, boundary)
      if (!rectsIntersect(stackRect, relativeRect))
        continue

      if (relativeRect.left >= boundary.width / 2) {
        const maxRight = Math.max(STACK_PADDING, boundary.width - width - STACK_PADDING)
        const candidateRight = Math.min(maxRight, Math.max(nextRight, boundary.width - relativeRect.left + STACK_GAP))
        if (candidateRight !== nextRight) {
          nextRight = candidateRight
          moved = true
        }
      }

      if (relativeRect.top >= boundary.height / 2) {
        const maxBottom = Math.max(STACK_PADDING, boundary.height - height - STACK_PADDING)
        const candidateBottom = Math.min(maxBottom, Math.max(nextBottom, boundary.height - relativeRect.top + STACK_GAP))
        if (candidateBottom !== nextBottom) {
          nextBottom = candidateBottom
          moved = true
        }
      }
    }

    if (!moved)
      break
  }

  overlayAnchor.right = nextRight
  overlayAnchor.bottom = nextBottom
}

function resolvePopoverDimensions(): { width: number, height: number } {
  const rect = popoverRef.value?.getBoundingClientRect()
  return {
    width: rect?.width || POPOVER_WIDTH,
    height: rect?.height || POPOVER_FALLBACK_HEIGHT,
  }
}

function constrainPopoverCandidate(candidate: RectCandidate, boundary: RectBounds, width: number, height: number): RectCandidate {
  const minLeft = boundary.left + STACK_PADDING
  const maxLeft = Math.max(minLeft, boundary.right - width - STACK_PADDING)
  const minTop = boundary.top + STACK_PADDING
  const maxTop = Math.max(minTop, boundary.bottom - height - STACK_PADDING)

  return {
    left: Math.min(maxLeft, Math.max(minLeft, candidate.left)),
    top: Math.min(maxTop, Math.max(minTop, candidate.top)),
  }
}

function resolvePopoverScore(candidate: RectCandidate, boundary: RectBounds, width: number, height: number, collisionRects: RectBounds[]): number {
  const candidateRect: RectBounds = {
    left: candidate.left,
    top: candidate.top,
    right: candidate.left + width,
    bottom: candidate.top + height,
    width,
    height,
  }

  const overflowArea
    = Math.max(0, boundary.left - candidateRect.left)
      + Math.max(0, boundary.top - candidateRect.top)
      + Math.max(0, candidateRect.right - boundary.right)
      + Math.max(0, candidateRect.bottom - boundary.bottom)

  const collisionArea = collisionRects.reduce((total, rect) => {
    return total + rectIntersectionArea(candidateRect, rect)
  }, 0)

  return overflowArea * 1000 + collisionArea
}

function syncPopoverPosition(userId: string, target?: EventTarget | null): void {
  if (!import.meta.client)
    return

  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return

  const anchor = target instanceof HTMLButtonElement
    ? target
    : triggerRefs.get(normalizedUserId)
  if (!anchor)
    return

  const anchorRect = normalizeRect(anchor.getBoundingClientRect())
  const boundary = resolveBoundaryRect()
  const { width, height } = resolvePopoverDimensions()
  const collisionRects = resolveCollisionRects(boundary, anchor)
  const candidates = [
    { left: anchorRect.left - width - STACK_GAP, top: anchorRect.top - height - STACK_GAP },
    { left: anchorRect.left - width - STACK_GAP, top: anchorRect.bottom + STACK_GAP },
    { left: anchorRect.right + STACK_GAP, top: anchorRect.top - height - STACK_GAP },
    { left: anchorRect.right + STACK_GAP, top: anchorRect.bottom + STACK_GAP },
    { left: anchorRect.right - width, top: anchorRect.top - height - STACK_GAP },
  ].map(candidate => constrainPopoverCandidate(candidate, boundary, width, height))

  const bestCandidate = candidates.reduce((best, candidate) => {
    const score = resolvePopoverScore(candidate, boundary, width, height, collisionRects)
    if (!best || score < best.score)
      return { candidate, score }
    return best
  }, null as { candidate: RectCandidate, score: number } | null)
  const fallbackCandidate = candidates[0] || {
    left: anchorRect.left,
    top: anchorRect.top,
  }

  popoverPosition.left = bestCandidate?.candidate.left || fallbackCandidate.left
  popoverPosition.top = bestCandidate?.candidate.top || fallbackCandidate.top
}

function scheduleLayoutSync(): void {
  if (!import.meta.client)
    return

  clearLayoutFrame()
  layoutFrame = window.requestAnimationFrame(() => {
    layoutFrame = null
    syncOverlayAnchor()
    if (openUserId.value)
      syncPopoverPosition(openUserId.value)
  })
}

function bindOverlayObservers(): void {
  clearOverlayObservers()
  if (!import.meta.client || !isOverlayMode.value)
    return

  const canvasRoot = resolveCanvasRoot()
  if (!canvasRoot)
    return

  if (typeof ResizeObserver !== 'undefined') {
    overlayResizeObserver = new ResizeObserver(() => {
      scheduleLayoutSync()
    })
    overlayResizeObserver.observe(canvasRoot)
    if (rootRef.value)
      overlayResizeObserver.observe(rootRef.value)
  }

  if (typeof MutationObserver !== 'undefined') {
    overlayMutationObserver = new MutationObserver(() => {
      scheduleLayoutSync()
    })
    overlayMutationObserver.observe(canvasRoot, {
      subtree: true,
      childList: true,
    })
  }

  const handleWindowLayoutChange = () => {
    scheduleLayoutSync()
  }
  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target
    if (target instanceof Node) {
      if (popoverRef.value?.contains(target))
        return
      for (const triggerRef of triggerRefs.values()) {
        if (triggerRef.contains(target))
          return
      }
    }
    closePopover()
  }

  window.addEventListener('resize', handleWindowLayoutChange)
  window.addEventListener('scroll', handleWindowLayoutChange, true)
  document.addEventListener('pointerdown', handlePointerDown, true)
  removeWindowListeners = () => {
    window.removeEventListener('resize', handleWindowLayoutChange)
    window.removeEventListener('scroll', handleWindowLayoutChange, true)
    document.removeEventListener('pointerdown', handlePointerDown, true)
    removeWindowListeners = null
  }
}

function openPopover(userId: string, target?: EventTarget | null): void {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return
  clearClosePopoverTimer()
  openUserId.value = normalizedUserId
  syncOverlayAnchor()
  syncPopoverPosition(normalizedUserId, target)
  void nextTick(() => {
    syncOverlayAnchor()
    syncPopoverPosition(normalizedUserId, target)
  })
}

function avatarButtonStyle(user: WorkspaceCollabPresenceUser, index: number): CSSProperties {
  return {
    marginLeft: index === 0 ? '0px' : `-${resolveAvatarOverlapOffset()}px`,
    zIndex: String(visibleUsers.value.length - index),
    borderColor: user.colorToken,
    filter: user.activityState === 'background' ? 'grayscale(1)' : 'none',
    opacity: user.activityState === 'background' ? '0.6' : '1',
  }
}

function avatarFallbackStyle(user: WorkspaceCollabPresenceUser): CSSProperties {
  return {
    backgroundColor: `${user.colorToken}1A`,
    color: user.colorToken,
  }
}

function statusDotStyle(user: WorkspaceCollabPresenceUser): CSSProperties {
  return {
    backgroundColor: user.activityState === 'background' ? '#94a3b8' : user.colorToken,
  }
}

function overflowStyle(): CSSProperties {
  return {
    marginLeft: visibleUsers.value.length > 0 ? `-${resolveAvatarOverlapOffset()}px` : '0px',
  }
}

function roleLabel(role: WorkspaceCollabPresenceUser['role']): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  if (role === 'viewer')
    return '查看者'
  return '-'
}

function activityStateLabel(user: WorkspaceCollabPresenceUser): string {
  return user.activityState === 'background' ? '后台协作中' : '在线协作中'
}

function selectionStatusText(user: WorkspaceCollabPresenceUser): string {
  const selection = user.selection
  if (!selection)
    return '光标信息待同步'
  if (selection.isCollapsed)
    return `位置 行 ${selection.headLine}，列 ${selection.headColumn}`
  return `范围 ${selection.anchorLine}:${selection.anchorColumn} - ${selection.headLine}:${selection.headColumn}`
}

function selectionPreviewText(user: WorkspaceCollabPresenceUser): string {
  const selection = user.selection
  if (!selection || selection.isCollapsed || !selection.selectedTextPreview)
    return '未选中文本'
  return `已选 ${selection.selectionLength} 字 · ${selection.selectedTextPreview}`
}

function formatDateTime(value?: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'

  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime()))
    return normalized

  return date.toLocaleString('zh-CN', { hour12: false })
}

watch(() => props.users, (users) => {
  const targetUserId = String(openUserId.value || '').trim()
  if (targetUserId && !users.some(user => user.userId === targetUserId))
    openUserId.value = ''
  void nextTick(() => {
    bindOverlayObservers()
    scheduleLayoutSync()
  })
}, { deep: true })

watch(openUserId, (value) => {
  if (!value)
    return
  void nextTick(() => {
    syncPopoverPosition(value)
  })
})

onMounted(() => {
  bindOverlayObservers()
  scheduleLayoutSync()
})

onBeforeUnmount(() => {
  closePopover()
  clearLayoutFrame()
  clearOverlayObservers()
})
</script>

<template>
  <div
    v-if="users.length > 0"
    ref="rootRef"
    :class="rootClassName"
    :style="rootStyle"
    data-testid="collab-presence-avatar-stack"
  >
    <div class="flex items-center justify-end pointer-events-auto">
      <button
        v-for="(user, index) in visibleUsers"
        :key="user.userId"
        :ref="(element) => setTriggerRef(user.userId, element as Element | null)"
        type="button"
        :class="avatarButtonClassName"
        :style="avatarButtonStyle(user, index)"
        :title="user.username"
        :aria-label="`查看 ${user.username} 的在线状态`"
        data-testid="collab-presence-avatar-trigger"
        @mouseenter="openPopover(user.userId, $event.currentTarget)"
        @mouseleave="scheduleClosePopover"
        @focus="openPopover(user.userId, $event.currentTarget)"
        @blur="scheduleClosePopover"
      >
        <span class="rounded-full flex h-full w-full items-center justify-center overflow-hidden">
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            :alt="user.username"
            class="h-full w-full object-cover"
          >
          <span
            v-else
            :class="avatarFallbackClassName"
            :style="avatarFallbackStyle(user)"
          >
            {{ resolveWorkspaceCollabPresenceInitial(user.username) }}
          </span>
        </span>
        <span
          class="rounded-full h-2.5 w-2.5 absolute -bottom-0.5 -right-0.5"
          :style="statusDotStyle(user)"
        />
      </button>

      <span
        v-if="overflowCount > 0"
        :class="overflowClassName"
        :style="overflowStyle()"
      >
        +{{ overflowCount }}
      </span>
    </div>

    <Teleport to="body">
      <div
        v-if="openUser"
        ref="popoverRef"
        :class="popoverClassName"
        :style="popoverStyle"
        data-testid="collab-presence-avatar-card"
        @mouseenter="clearClosePopoverTimer"
        @mouseleave="scheduleClosePopover"
      >
        <div class="flex gap-3 items-start">
          <div
            class="border-2 rounded-full bg-white flex shrink-0 h-12 w-12 items-center justify-center relative overflow-visible"
            :style="{ borderColor: openUser.colorToken }"
          >
            <span class="rounded-full flex h-full w-full items-center justify-center overflow-hidden">
              <img
                v-if="openUser.avatarUrl"
                :src="openUser.avatarUrl"
                :alt="openUser.username"
                class="h-full w-full object-cover"
              >
              <span
                v-else
                class="text-sm font-semibold flex h-full w-full items-center justify-center"
                :style="avatarFallbackStyle(openUser)"
              >
                {{ resolveWorkspaceCollabPresenceInitial(openUser.username) }}
              </span>
            </span>
            <span
              class="rounded-full h-3 w-3 absolute -bottom-0.5 -right-0.5"
              :style="statusDotStyle(openUser)"
            />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex gap-2 items-center">
              <p class="text-sm text-slate-900 font-semibold truncate">
                {{ openUser.username }}
              </p>
              <span
                v-if="openUser.isCurrentUser"
                class="text-[10px] text-slate-500 font-medium px-2 py-0.5 rounded-full bg-slate-100"
              >
                我
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              {{ activityStateLabel(openUser) }}
            </p>
          </div>
        </div>

        <dl class="text-xs text-slate-600 mt-4 space-y-2">
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              项目角色
            </dt>
            <dd class="text-slate-700 text-right">
              {{ roleLabel(openUser.role) }}
            </dd>
          </div>
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              当前状态
            </dt>
            <dd class="text-slate-700 text-right">
              {{ activityStateLabel(openUser) }}
            </dd>
          </div>
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              当前定位
            </dt>
            <dd class="text-slate-700 text-right">
              {{ selectionStatusText(openUser) }}
            </dd>
          </div>
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              选区摘要
            </dt>
            <dd class="text-slate-700 text-right max-w-[168px] truncate" :title="selectionPreviewText(openUser)">
              {{ selectionPreviewText(openUser) }}
            </dd>
          </div>
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              最后活跃
            </dt>
            <dd class="text-slate-700 text-right">
              {{ formatDateTime(openUser.updatedAt) }}
            </dd>
          </div>
          <div class="flex gap-3 items-center justify-between">
            <dt class="text-slate-400">
              用户 ID
            </dt>
            <dd class="text-[11px] text-slate-700 font-mono text-right max-w-[168px] truncate" :title="openUser.userId">
              {{ openUser.userId }}
            </dd>
          </div>
        </dl>
      </div>
    </Teleport>
  </div>
</template>
