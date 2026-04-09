<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import {
  resolveWorkspaceCollabPresenceInitial,

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

  if (preferredLeft >= viewportPadding) {
    popoverPosition.left = Math.min(preferredLeft, allowedMaxLeft)
  }
  else {
    popoverPosition.left = Math.min(
      Math.max(viewportPadding, fallbackLeft),
      allowedMaxLeft,
    )
  }

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
  <div v-if="users.length > 0" class="flex items-center justify-end relative" data-testid="collab-presence-avatar-stack">
    <div class="flex items-center justify-end">
      <button
        v-for="(user, index) in visibleUsers"
        :key="user.userId"
        :ref="(element) => setTriggerRef(user.userId, element as Element | null)"
        type="button"
        class="border-2 rounded-full bg-white flex shrink-0 h-7 w-7 shadow-sm items-center justify-center relative"
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
            class="text-[11px] font-semibold flex h-full w-full items-center justify-center"
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
        class="text-[10px] text-slate-600 font-semibold px-1 border border-slate-300 rounded-full bg-slate-100 flex shrink-0 h-7 min-w-7 items-center justify-center relative"
        :style="overflowStyle()"
      >
        +{{ overflowCount }}
      </span>
    </div>

    <Teleport to="body">
      <div
        v-if="openUser"
        class="p-4 border border-slate-200 rounded-2xl bg-white w-72 shadow-[0_18px_48px_rgba(15,23,42,0.18)] fixed z-[2600]"
        :style="popoverStyle"
        data-testid="collab-presence-avatar-card"
        @mouseenter="clearClosePopoverTimer"
        @mouseleave="scheduleClosePopover"
      >
        <div class="flex gap-3 items-start">
          <div
            class="border-2 rounded-full bg-white flex shrink-0 h-12 w-12 items-center justify-center relative"
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
