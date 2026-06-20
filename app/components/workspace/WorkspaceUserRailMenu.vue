<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'

type UserActionEvent = 'openWorkspaceHome' | 'openWorkspaceSettings' | 'openDisplayPreferences' | 'openMemberManagement' | 'openAccountCenter'

const props = withDefaults(defineProps<{
  workspaceId?: string
  userName?: string
  userEmail?: string
  userAvatarUrl?: string
  workspaceOptions?: WorkspaceWithQuota[]
  workspaceCanManageMembers?: boolean
}>(), {
  workspaceId: '',
  userName: '',
  userEmail: '',
  userAvatarUrl: '',
  workspaceOptions: () => [],
  workspaceCanManageMembers: false,
})

const emit = defineEmits<{
  switchWorkspace: [workspaceId: string]
  openWorkspaceHome: []
  openWorkspaceSettings: []
  openDisplayPreferences: []
  openMemberManagement: []
  openAccountCenter: []
}>()

const userMenuRootRef = ref<HTMLElement | null>(null)
const userTriggerRef = ref<HTMLButtonElement | null>(null)
const userPopoverRef = ref<HTMLElement | null>(null)
const userPopoverVisible = ref(false)
const userPopoverPosition = reactive({
  top: 0,
  left: 0,
})

const USER_POPOVER_GAP = 12
const USER_POPOVER_WIDTH = 320
const USER_POPOVER_FALLBACK_HEIGHT = 420
const USER_POPOVER_VIEWPORT_PADDING = 16

let userPopoverCloseTimer: ReturnType<typeof setTimeout> | null = null
let userPopoverLayoutFrame: number | null = null

const normalizedUserName = computed(() => String(props.userName || '').trim() || '当前用户')
const normalizedUserEmail = computed(() => String(props.userEmail || '').trim())
const currentWorkspace = computed(() => {
  const normalizedWorkspaceId = String(props.workspaceId || '').trim()
  if (normalizedWorkspaceId) {
    const matched = props.workspaceOptions.find(item => item.workspace.id === normalizedWorkspaceId)
    if (matched)
      return matched
  }
  return props.workspaceOptions[0] || null
})
const currentWorkspaceName = computed(() => {
  return String(currentWorkspace.value?.workspace.name || '').trim() || '未连接空间'
})
const orderedWorkspaceOptions = computed(() => {
  const currentId = String(props.workspaceId || '').trim()
  const current: WorkspaceWithQuota[] = []
  const otherTeams: WorkspaceWithQuota[] = []
  const personal: WorkspaceWithQuota[] = []
  const seen = new Set<string>()

  for (const item of props.workspaceOptions) {
    const workspaceId = String(item.workspace.id || '').trim()
    if (!workspaceId || seen.has(workspaceId))
      continue
    seen.add(workspaceId)

    if (workspaceId === currentId) {
      current.push(item)
      continue
    }

    if (item.workspace.type === 'team')
      otherTeams.push(item)
    else
      personal.push(item)
  }

  return [...current, ...otherTeams, ...personal]
})
const userPopoverStyle = computed(() => ({
  top: `${userPopoverPosition.top}px`,
  left: `${userPopoverPosition.left}px`,
}))

function workspaceTypeLabel(type: WorkspaceWithQuota['workspace']['type']): string {
  if (type === 'personal')
    return '个人空间'
  return 'Team 空间'
}

function clearUserPopoverCloseTimer(): void {
  if (!userPopoverCloseTimer)
    return

  clearTimeout(userPopoverCloseTimer)
  userPopoverCloseTimer = null
}

function clearUserPopoverLayoutFrame(): void {
  if (userPopoverLayoutFrame === null || !import.meta.client)
    return

  cancelAnimationFrame(userPopoverLayoutFrame)
  userPopoverLayoutFrame = null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveUserPopoverDimensions(): { width: number, height: number } {
  const rect = userPopoverRef.value?.getBoundingClientRect()
  return {
    width: rect?.width || USER_POPOVER_WIDTH,
    height: rect?.height || USER_POPOVER_FALLBACK_HEIGHT,
  }
}

function syncUserPopoverPosition(): void {
  if (!import.meta.client || !userPopoverVisible.value)
    return

  const trigger = userTriggerRef.value
  if (!trigger)
    return

  const triggerRect = trigger.getBoundingClientRect()
  const { width, height } = resolveUserPopoverDimensions()
  const maxLeft = Math.max(USER_POPOVER_VIEWPORT_PADDING, window.innerWidth - width - USER_POPOVER_VIEWPORT_PADDING)
  const maxTop = Math.max(USER_POPOVER_VIEWPORT_PADDING, window.innerHeight - height - USER_POPOVER_VIEWPORT_PADDING)
  const preferredRightLeft = triggerRect.right + USER_POPOVER_GAP
  const preferredLeftLeft = triggerRect.left - width - USER_POPOVER_GAP
  const resolvedLeft = preferredRightLeft <= maxLeft || preferredLeftLeft < USER_POPOVER_VIEWPORT_PADDING
    ? preferredRightLeft
    : preferredLeftLeft
  const resolvedTop = triggerRect.bottom - height

  userPopoverPosition.left = clamp(resolvedLeft, USER_POPOVER_VIEWPORT_PADDING, maxLeft)
  userPopoverPosition.top = clamp(resolvedTop, USER_POPOVER_VIEWPORT_PADDING, maxTop)
}

function scheduleUserPopoverPositionSync(): void {
  if (!import.meta.client)
    return

  clearUserPopoverLayoutFrame()
  userPopoverLayoutFrame = window.requestAnimationFrame(() => {
    userPopoverLayoutFrame = null
    syncUserPopoverPosition()
  })
}

function openUserPopover(): void {
  clearUserPopoverCloseTimer()
  userPopoverVisible.value = true
}

function closeUserPopover(): void {
  clearUserPopoverCloseTimer()
  userPopoverVisible.value = false
}

function scheduleUserPopoverClose(): void {
  clearUserPopoverCloseTimer()
  userPopoverCloseTimer = setTimeout(() => {
    userPopoverVisible.value = false
  }, 120)
}

function handleUserPopoverFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget as Node | null
  const root = userMenuRootRef.value
  if (root && nextTarget && root.contains(nextTarget))
    return
  const popover = userPopoverRef.value
  if (popover && nextTarget && popover.contains(nextTarget))
    return
  scheduleUserPopoverClose()
}

function toggleUserPopover(): void {
  if (userPopoverVisible.value) {
    closeUserPopover()
    return
  }
  openUserPopover()
}

function selectWorkspace(item: WorkspaceWithQuota): void {
  const workspaceId = String(item.workspace.id || '').trim()
  if (!workspaceId) {
    closeUserPopover()
    return
  }
  if (workspaceId === String(props.workspaceId || '').trim()) {
    closeUserPopover()
    return
  }
  closeUserPopover()
  emit('switchWorkspace', workspaceId)
}

function triggerUserAction(eventName: UserActionEvent): void {
  closeUserPopover()
  switch (eventName) {
    case 'openWorkspaceHome':
      emit('openWorkspaceHome')
      break
    case 'openWorkspaceSettings':
      emit('openWorkspaceSettings')
      break
    case 'openDisplayPreferences':
      emit('openDisplayPreferences')
      break
    case 'openMemberManagement':
      emit('openMemberManagement')
      break
    case 'openAccountCenter':
      emit('openAccountCenter')
      break
  }
}

function handleGlobalPointerDown(event: Event): void {
  const target = event.target as Node | null
  if (!target || !userPopoverVisible.value)
    return

  const root = userMenuRootRef.value
  if (root?.contains(target))
    return

  const popover = userPopoverRef.value
  if (popover?.contains(target))
    return

  closeUserPopover()
}

function handleGlobalEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape')
    return
  closeUserPopover()
}

function handleGlobalLayoutChange(): void {
  if (!userPopoverVisible.value)
    return
  scheduleUserPopoverPositionSync()
}

watch(userPopoverVisible, (visible) => {
  if (!visible) {
    clearUserPopoverLayoutFrame()
    return
  }

  void nextTick(() => {
    syncUserPopoverPosition()
    scheduleUserPopoverPositionSync()
  })
})

onMounted(() => {
  if (!import.meta.client)
    return
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  document.addEventListener('keydown', handleGlobalEscape)
  window.addEventListener('resize', handleGlobalLayoutChange)
  window.addEventListener('scroll', handleGlobalLayoutChange, true)
})

onBeforeUnmount(() => {
  clearUserPopoverCloseTimer()
  clearUserPopoverLayoutFrame()
  if (!import.meta.client)
    return
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleGlobalEscape)
  window.removeEventListener('resize', handleGlobalLayoutChange)
  window.removeEventListener('scroll', handleGlobalLayoutChange, true)
})
</script>

<template>
  <div
    ref="userMenuRootRef"
    class="workspace-user-rail-menu"
    @mouseenter="openUserPopover"
    @mouseleave="scheduleUserPopoverClose"
    @focusin="openUserPopover"
    @focusout="handleUserPopoverFocusOut"
  >
    <button
      ref="userTriggerRef"
      data-testid="workspace-left-rail-user-trigger"
      class="workspace-user-rail-menu__trigger"
      type="button"
      :aria-expanded="userPopoverVisible ? 'true' : 'false'"
      aria-haspopup="menu"
      title="打开空间与账号菜单"
      @click.stop="toggleUserPopover"
    >
      <UnifiedAvatar
        :name="normalizedUserName"
        :src="props.userAvatarUrl"
        :size="30"
      />
      <span class="workspace-user-rail-menu__hint" aria-hidden="true">空间与账号</span>
    </button>
  </div>

  <Teleport to="body">
    <div
      v-if="userPopoverVisible"
      ref="userPopoverRef"
      data-testid="workspace-left-rail-user-popover"
      class="workspace-user-rail-menu__popover"
      :style="userPopoverStyle"
      @mouseenter="clearUserPopoverCloseTimer"
      @mouseleave="scheduleUserPopoverClose"
      @focusin="openUserPopover"
      @focusout="handleUserPopoverFocusOut"
    >
      <section class="pb-3 border-b border-slate-100">
        <div class="flex gap-3 items-start">
          <UnifiedAvatar
            :name="normalizedUserName"
            :src="props.userAvatarUrl"
            :size="42"
          />
          <div class="flex-1 min-w-0">
            <div class="text-sm text-slate-900 font-semibold truncate">
              {{ normalizedUserName }}
            </div>
            <div v-if="normalizedUserEmail" class="text-[11px] text-slate-500 mt-0.5 truncate">
              {{ normalizedUserEmail }}
            </div>
            <div class="text-[11px] text-slate-500 mt-1.5">
              当前空间
            </div>
            <div class="mt-1 flex gap-2 items-center">
              <span class="text-xs text-slate-700 font-medium truncate">
                {{ currentWorkspaceName }}
              </span>
              <span
                v-if="currentWorkspace"
                class="text-[10px] text-slate-500 px-2 py-0.5 rounded-full bg-slate-100 shrink-0"
              >
                {{ workspaceTypeLabel(currentWorkspace.workspace.type) }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="py-3 border-b border-slate-100">
        <div class="text-[11px] text-slate-500 font-medium px-1 pb-2">
          快速切换空间
        </div>
        <div v-if="orderedWorkspaceOptions.length > 0" class="space-y-1">
          <button
            v-for="item in orderedWorkspaceOptions"
            :key="item.workspace.id"
            data-testid="workspace-left-rail-user-workspace-item"
            class="px-2.5 py-2 text-left rounded-xl w-full transition-colors"
            :class="item.workspace.id === props.workspaceId
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-700 hover:bg-slate-50'"
            type="button"
            @click="selectWorkspace(item)"
          >
            <div class="flex gap-2 items-center justify-between">
              <span class="text-xs font-semibold truncate">{{ item.workspace.name }}</span>
              <span class="text-[10px] px-2 py-0.5 border border-slate-200 rounded-full bg-white/80 shrink-0">
                {{ workspaceTypeLabel(item.workspace.type) }}
              </span>
            </div>
            <div class="text-[11px] mt-1" :class="item.workspace.id === props.workspaceId ? 'text-blue-600/80' : 'text-slate-500'">
              {{ item.workspace.id === props.workspaceId ? '当前空间' : '切换后将沿用当前工作区跳转逻辑' }}
            </div>
          </button>
        </div>
        <div v-else class="text-[11px] text-slate-400 px-1 py-2">
          暂无可切换空间
        </div>
      </section>

      <section class="pt-3 space-y-1">
        <button
          class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
          data-testid="workspace-left-rail-user-action-workspace-home"
          type="button"
          @click="triggerUserAction('openWorkspaceHome')"
        >
          <span class="material-symbols-outlined text-[18px]">home</span>
          <span>打开空间首页</span>
        </button>
        <button
          class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
          data-testid="workspace-left-rail-user-action-settings"
          type="button"
          @click="triggerUserAction('openWorkspaceSettings')"
        >
          <span class="material-symbols-outlined text-[18px]">tune</span>
          <span>项目设置</span>
        </button>
        <button
          class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
          data-testid="workspace-left-rail-user-action-display-preferences"
          type="button"
          @click="triggerUserAction('openDisplayPreferences')"
        >
          <span class="material-symbols-outlined text-[18px]">format_size</span>
          <span>显示偏好</span>
        </button>
        <button
          v-if="props.workspaceCanManageMembers"
          class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
          data-testid="workspace-left-rail-user-action-member-management"
          type="button"
          @click="triggerUserAction('openMemberManagement')"
        >
          <span class="material-symbols-outlined text-[18px]">group</span>
          <span>成员管理</span>
        </button>
        <button
          class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
          data-testid="workspace-left-rail-user-action-account-center"
          type="button"
          @click="triggerUserAction('openAccountCenter')"
        >
          <span class="material-symbols-outlined text-[18px]">manage_accounts</span>
          <span>账号中心</span>
        </button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-user-rail-menu {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
  z-index: 200;
  isolation: isolate;
}

.workspace-user-rail-menu__trigger {
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-user-rail-menu__trigger:hover,
.workspace-user-rail-menu__trigger:focus-visible {
  background: #f5f8fd;
}

.workspace-user-rail-menu__trigger:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 1px;
}

.workspace-user-rail-menu__hint {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid rgba(214, 222, 236, 0.96);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  padding: 6px 9px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.12);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    visibility 0.16s ease;
  z-index: 40;
}

.workspace-user-rail-menu__trigger:hover .workspace-user-rail-menu__hint,
.workspace-user-rail-menu__trigger:focus-visible .workspace-user-rail-menu__hint {
  opacity: 1;
  visibility: visible;
}

.workspace-user-rail-menu__popover {
  position: fixed;
  top: 0;
  left: 0;
  width: 320px;
  max-width: min(320px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  background: #ffffff;
  backdrop-filter: blur(18px);
  box-shadow: 0 22px 56px rgba(15, 23, 42, 0.18);
  z-index: 4000;
}
</style>
