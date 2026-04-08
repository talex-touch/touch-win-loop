<script setup lang="ts">
import { type CSSProperties } from 'vue'
import {
  resolveWorkspaceCollabPresenceInitial,
  type WorkspaceCollabPresenceUser,
} from '~/components/workspace/collab/presence'

const props = withDefaults(defineProps<{
  users?: WorkspaceCollabPresenceUser[]
}>(), {
  users: () => [],
})

const openUserId = ref('')
const triggerRefs = new Map<string, HTMLButtonElement>()
const popoverPosition = reactive({
  top: 0,
  left: 0,
})

let closePopoverTimer: ReturnType<typeof setTimeout> | null = null
const DRAW_TOOLBAR_SAFE_WIDTH = 220

const visibleUsers = computed(() => props.users.slice(0, 5))
const overflowCount = computed(() => Math.max(0, props.users.length - visibleUsers.value.length))
const openUser = computed(() => {
  const targetUserId = String(openUserId.value || '').trim()
  if (!targetUserId)
    return null
  return props.users.find(user => user.userId === targetUserId) || null
})

watch(() => props.users, (users) => {
  const targetUserId = String(openUserId.value || '').trim()
  if (!targetUserId)
    return
  if (!users.some(user => user.userId === targetUserId))
    openUserId.value = ''
}, { deep: true })

const popoverStyle = computed<CSSProperties>(() => {
  return {
    top: `${popoverPosition.top}px`,
    left: `${popoverPosition.left}px`,
  }
})

function clearClosePopoverTimer(): void {
  if (!closePopoverTimer)
    return
  clearTimeout(closePopoverTimer)
  closePopoverTimer = null
}

function scheduleClosePopover(): void {
  clearClosePopoverTimer()
  closePopoverTimer = setTimeout(() => {
    openUserId.value = ''
  }, 120)
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

  const rect = anchor.getBoundingClientRect()
  const popoverWidth = 288
  const popoverHeight = 220
  const viewportPadding = 16
  const preferredLeft = rect.left - popoverWidth - 12
  const fallbackLeft = rect.right - popoverWidth
  const maxLeft = Math.max(viewportPadding, window.innerWidth - popoverWidth - viewportPadding)
  const safeMaxLeft = Math.max(
    viewportPadding,
    window.innerWidth - DRAW_TOOLBAR_SAFE_WIDTH - popoverWidth - viewportPadding,
  )
  const allowedMaxLeft = Math.min(maxLeft, safeMaxLeft)

  if (preferredLeft >= viewportPadding)
    popoverPosition.left = Math.min(preferredLeft, allowedMaxLeft)
  else
    popoverPosition.left = Math.min(
      Math.max(viewportPadding, fallbackLeft),
      allowedMaxLeft,
    )

  let nextTop = rect.bottom + 8
  if (nextTop + popoverHeight > window.innerHeight - viewportPadding)
    nextTop = Math.max(viewportPadding, rect.top - popoverHeight - 8)
  popoverPosition.top = nextTop
}

function openPopover(userId: string, target?: EventTarget | null): void {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId)
    return
  clearClosePopoverTimer()
  openUserId.value = normalizedUserId
  syncPopoverPosition(normalizedUserId, target)
}

function closePopover(): void {
  clearClosePopoverTimer()
  openUserId.value = ''
}

function avatarButtonStyle(user: WorkspaceCollabPresenceUser, index: number): CSSProperties {
  return {
    marginLeft: index === 0 ? '0px' : '-10px',
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
    marginLeft: visibleUsers.value.length > 0 ? '-10px' : '0px',
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

onBeforeUnmount(() => {
  closePopover()
})
</script>

<template>
  <div v-if="users.length > 0" class="relative flex items-center justify-end" data-testid="collab-presence-avatar-stack">
    <div class="flex items-center justify-end">
      <button
        v-for="(user, index) in visibleUsers"
        :key="user.userId"
        type="button"
        :ref="(element) => setTriggerRef(user.userId, element as Element | null)"
        class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-sm"
        :style="avatarButtonStyle(user, index)"
        :title="user.username"
        :aria-label="`查看 ${user.username} 的在线状态`"
        data-testid="collab-presence-avatar-trigger"
        @mouseenter="openPopover(user.userId, $event.currentTarget)"
        @mouseleave="scheduleClosePopover"
        @focus="openPopover(user.userId, $event.currentTarget)"
        @blur="scheduleClosePopover"
      >
        <span class="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            :alt="user.username"
            class="h-full w-full object-cover"
          >
          <span
            v-else
            class="flex h-full w-full items-center justify-center text-[11px] font-semibold"
            :style="avatarFallbackStyle(user)"
          >
            {{ resolveWorkspaceCollabPresenceInitial(user.username) }}
          </span>
        </span>
        <span
          class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
          :style="statusDotStyle(user)"
        />
      </button>

      <span
        v-if="overflowCount > 0"
        class="relative flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-slate-100 px-1 text-[10px] font-semibold text-slate-600"
        :style="overflowStyle()"
      >
        +{{ overflowCount }}
      </span>
    </div>

    <Teleport to="body">
      <div
        v-if="openUser"
        class="fixed z-[2600] w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
        :style="popoverStyle"
        data-testid="collab-presence-avatar-card"
        @mouseenter="clearClosePopoverTimer"
        @mouseleave="scheduleClosePopover"
      >
        <div class="flex items-start gap-3">
          <div
            class="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 bg-white"
            :style="{ borderColor: openUser.colorToken }"
          >
            <span class="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
              <img
                v-if="openUser.avatarUrl"
                :src="openUser.avatarUrl"
                :alt="openUser.username"
                class="h-full w-full object-cover"
              >
              <span
                v-else
                class="flex h-full w-full items-center justify-center text-sm font-semibold"
                :style="avatarFallbackStyle(openUser)"
              >
                {{ resolveWorkspaceCollabPresenceInitial(openUser.username) }}
              </span>
            </span>
            <span
              class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
              :style="statusDotStyle(openUser)"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <p class="truncate text-sm font-semibold text-slate-900">
                {{ openUser.username }}
              </p>
              <span
                v-if="openUser.isCurrentUser"
                class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
              >
                我
              </span>
            </div>
            <p class="mt-1 text-xs text-slate-500">
              {{ activityStateLabel(openUser) }}
            </p>
          </div>
        </div>

        <dl class="mt-4 space-y-2 text-xs text-slate-600">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              项目角色
            </dt>
            <dd class="text-right text-slate-700">
              {{ roleLabel(openUser.role) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              当前状态
            </dt>
            <dd class="text-right text-slate-700">
              {{ activityStateLabel(openUser) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              当前定位
            </dt>
            <dd class="text-right text-slate-700">
              {{ selectionStatusText(openUser) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              选区摘要
            </dt>
            <dd class="max-w-[168px] truncate text-right text-slate-700" :title="selectionPreviewText(openUser)">
              {{ selectionPreviewText(openUser) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              最后活跃
            </dt>
            <dd class="text-right text-slate-700">
              {{ formatDateTime(openUser.updatedAt) }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-400">
              用户 ID
            </dt>
            <dd class="max-w-[168px] truncate text-right font-mono text-[11px] text-slate-700" :title="openUser.userId">
              {{ openUser.userId }}
            </dd>
          </div>
        </dl>
      </div>
    </Teleport>
  </div>
</template>
