<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'

type WorkspaceWorkbenchMode = 'project' | 'defense'
type UserActionEvent = 'openWorkspaceHome' | 'openWorkspaceSettings' | 'openDisplayPreferences' | 'openMemberManagement' | 'openAccountCenter'

interface WorkspaceQuickSwitchProject {
  projectId: string
  workspaceId: string
  title: string
  workspaceName: string
  updatedAt: string
}

const props = withDefaults(defineProps<{
  modelValue?: string
  projectName?: string
  workspaceId?: string
  userName?: string
  userEmail?: string
  userAvatarUrl?: string
  workspaceOptions?: WorkspaceWithQuota[]
  workspaceCanManageMembers?: boolean
  myProjects?: WorkspaceQuickSwitchProject[]
  recentProjects?: WorkspaceQuickSwitchProject[]
  workbenchMode?: WorkspaceWorkbenchMode
}>(), {
  modelValue: '',
  projectName: '未命名项目',
  workspaceId: '',
  userName: '',
  userEmail: '',
  userAvatarUrl: '',
  workspaceOptions: () => [],
  workspaceCanManageMembers: false,
  myProjects: () => [],
  recentProjects: () => [],
  workbenchMode: 'project',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:workbenchMode', value: WorkspaceWorkbenchMode): void
  (event: 'quickSwitchProject', value: { projectId: string, workspaceId: string }): void
  (event: 'switchWorkspace', value: string): void
  (event: 'finalReview'): void
  (event: 'openWorkspaceHome'): void
  (event: 'openWorkspaceSettings'): void
  (event: 'openDisplayPreferences'): void
  (event: 'openMemberManagement'): void
  (event: 'openAccountCenter'): void
}>()

const quickSwitchOpen = ref(false)
const quickSwitchRef = ref<HTMLElement | null>(null)
const userPopoverRef = ref<HTMLElement | null>(null)
const userPopoverVisible = ref(false)

let userPopoverCloseTimer: ReturnType<typeof setTimeout> | null = null

const hasQuickSwitchOptions = computed(() => {
  return props.myProjects.length > 0 || props.recentProjects.length > 0
})
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

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function formatShortTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '-'

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

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

function openUserPopover(): void {
  clearUserPopoverCloseTimer()
  closeQuickSwitch()
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
  const container = userPopoverRef.value
  if (container && nextTarget && container.contains(nextTarget))
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

function toggleQuickSwitch() {
  if (!hasQuickSwitchOptions.value)
    return

  if (!quickSwitchOpen.value)
    closeUserPopover()
  quickSwitchOpen.value = !quickSwitchOpen.value
}

function closeQuickSwitch() {
  quickSwitchOpen.value = false
}

function switchProject(item: WorkspaceQuickSwitchProject) {
  emit('quickSwitchProject', {
    projectId: item.projectId,
    workspaceId: item.workspaceId,
  })
  closeQuickSwitch()
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

function triggerUserAction(
  eventName: UserActionEvent,
): void {
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

function goWorkspaceList() {
  closeQuickSwitch()
  closeUserPopover()
  navigateTo('/team')
}

function openFinalReview() {
  closeQuickSwitch()
  closeUserPopover()
  emit('finalReview')
}

function selectWorkbench(mode: WorkspaceWorkbenchMode) {
  if (props.workbenchMode === mode)
    return
  emit('update:workbenchMode', mode)
}

function handleGlobalPointerDown(event: Event) {
  const target = event.target as Node | null
  if (!target)
    return

  if (quickSwitchOpen.value) {
    const quickSwitchContainer = quickSwitchRef.value
    if (!quickSwitchContainer || !quickSwitchContainer.contains(target))
      closeQuickSwitch()
  }

  if (userPopoverVisible.value) {
    const userPopoverContainer = userPopoverRef.value
    if (!userPopoverContainer || !userPopoverContainer.contains(target))
      closeUserPopover()
  }
}

function handleGlobalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  closeQuickSwitch()
  closeUserPopover()
}

onMounted(() => {
  if (!import.meta.client)
    return
  document.addEventListener('pointerdown', handleGlobalPointerDown)
  document.addEventListener('keydown', handleGlobalEscape)
})

onBeforeUnmount(() => {
  clearUserPopoverCloseTimer()
  if (!import.meta.client)
    return
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
  document.removeEventListener('keydown', handleGlobalEscape)
})
</script>

<template>
  <header class="px-4 border-b border-slate-200 bg-white flex shrink-0 gap-3 h-12 items-center z-10">
    <div class="flex flex-1 gap-2 min-w-0 items-center">
      <nav
        aria-label="项目工作区面包屑"
        class="flex gap-1 min-w-0 items-center"
      >
        <span class="material-symbols-outlined text-xl text-blue-600">dataset</span>
        <button
          class="text-sm text-slate-900 font-bold px-1 py-0.5 rounded transition-colors hover:bg-slate-100"
          type="button"
          @click="goWorkspaceList"
        >
          项目台
        </button>
        <span class="text-sm text-slate-300/75 leading-none font-normal mx-0.5">/</span>

        <div ref="quickSwitchRef" class="min-w-0 relative">
          <button
            class="text-xs text-slate-600 font-semibold px-1 py-0.5 rounded inline-flex gap-1 max-w-72 min-w-0 transition-colors items-center hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!hasQuickSwitchOptions"
            title="快速切换项目"
            type="button"
            @click.stop="toggleQuickSwitch"
          >
            <span class="leading-none truncate">{{ projectName }}</span>
            <span class="material-symbols-outlined text-[12px] text-slate-500/70 leading-none shrink-0 block translate-y-[0.5px] rotate-90">swap_horiz</span>
          </button>

          <div
            v-if="quickSwitchOpen"
            class="mt-2 p-2 border border-slate-200 rounded-lg bg-white max-h-96 w-80 shadow-lg left-0 top-full absolute z-20 overflow-y-auto"
          >
            <div class="text-[11px] text-slate-500 px-2 pb-2 pt-1">
              快速切换
            </div>
            <section class="space-y-1">
              <p class="text-[11px] text-slate-500 px-2">
                我的项目
              </p>
              <button
                v-for="item in props.myProjects"
                :key="`mine-${item.projectId}`"
                class="px-2 py-1.5 text-left rounded-md w-full transition-colors hover:bg-slate-50"
                type="button"
                @click="switchProject(item)"
              >
                <div class="text-xs text-slate-800 font-medium truncate">
                  {{ item.title }}
                </div>
                <div class="text-[11px] text-slate-500 flex gap-2 items-center justify-between">
                  <span class="truncate">{{ item.workspaceName }}</span>
                  <span class="shrink-0">{{ formatShortTime(item.updatedAt) }}</span>
                </div>
              </button>
              <p v-if="props.myProjects.length === 0" class="text-[11px] text-slate-400 px-2 py-1">
                暂无可切换项目
              </p>
            </section>

            <section class="mt-2 pt-2 border-t border-slate-100 space-y-1">
              <p class="text-[11px] text-slate-500 px-2">
                最近项目
              </p>
              <button
                v-for="item in props.recentProjects"
                :key="`recent-${item.projectId}`"
                class="px-2 py-1.5 text-left rounded-md w-full transition-colors hover:bg-slate-50"
                type="button"
                @click="switchProject(item)"
              >
                <div class="text-xs text-slate-800 font-medium truncate">
                  {{ item.title }}
                </div>
                <div class="text-[11px] text-slate-500 flex gap-2 items-center justify-between">
                  <span class="truncate">{{ item.workspaceName }}</span>
                  <span class="shrink-0">{{ formatShortTime(item.updatedAt) }}</span>
                </div>
              </button>
              <p v-if="props.recentProjects.length === 0" class="text-[11px] text-slate-400 px-2 py-1">
                暂无最近项目
              </p>
            </section>
          </div>
        </div>
      </nav>
    </div>
    <div class="shrink-0 max-w-[40vw] w-96 relative">
      <span class="material-symbols-outlined text-sm text-slate-400 left-2.5 top-1/2 absolute -translate-y-1/2">search</span>
      <input
        :value="modelValue"
        class="text-xs py-1 pl-8 pr-4 outline-none border border-slate-200 rounded bg-slate-50 w-full focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        placeholder="搜索资源、文档或指令..."
        type="text"
        @input="onInput"
      >
      <span class="text-[10px] text-slate-400 px-1 border border-slate-200 rounded right-2 top-1/2 absolute -translate-y-1/2">⌘K</span>
    </div>

    <div class="flex flex-1 gap-2 items-center justify-end">
      <div
        data-testid="workspace-header-workbench-tabs"
        class="p-0.5 border border-slate-200 rounded-xl bg-slate-100/80 inline-flex gap-0.5 items-center"
      >
        <button
          class="text-xs px-3 py-1.5 rounded-[10px] transition-colors"
          :class="workbenchMode === 'project'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'"
          type="button"
          @click="selectWorkbench('project')"
        >
          项目工作台
        </button>
        <button
          class="text-xs px-3 py-1.5 rounded-[10px] transition-colors"
          :class="workbenchMode === 'defense'
            ? 'bg-[#d4a017] text-white shadow-sm'
            : 'text-slate-500 hover:text-amber-700'"
          type="button"
          @click="selectWorkbench('defense')"
        >
          答辩工作台
        </button>
      </div>
      <button
        class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 hover:opacity-90"
        type="button"
        @click="openFinalReview"
      >
        终审
      </button>

      <div
        ref="userPopoverRef"
        class="relative"
        @mouseenter="openUserPopover"
        @mouseleave="scheduleUserPopoverClose"
        @focusin="openUserPopover"
        @focusout="handleUserPopoverFocusOut"
      >
        <button
          type="button"
          class="p-0.5 rounded-full flex transition-colors items-center justify-center focus:outline-none hover:bg-slate-100 focus:ring-2 focus:ring-blue-500/30"
          :aria-expanded="userPopoverVisible ? 'true' : 'false'"
          aria-haspopup="menu"
          data-testid="workspace-header-user-trigger"
          title="打开空间与账号菜单"
          @click.stop="toggleUserPopover"
        >
          <UnifiedAvatar
            :name="normalizedUserName"
            :src="props.userAvatarUrl"
            :size="32"
          />
        </button>

        <div
          v-if="userPopoverVisible"
          class="mt-2 p-3 border border-slate-200 rounded-2xl bg-white w-80 shadow-[0_18px_48px_rgba(15,23,42,0.16)] right-0 top-full absolute z-30"
          data-testid="workspace-header-user-popover"
        >
          <section class="pb-3 border-b border-slate-100">
            <div class="flex gap-3 items-start">
              <UnifiedAvatar
                :name="normalizedUserName"
                :src="props.userAvatarUrl"
                :size="40"
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
                class="px-2.5 py-2 text-left rounded-xl w-full transition-colors"
                :class="item.workspace.id === props.workspaceId
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'"
                data-testid="workspace-header-user-workspace-item"
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
              data-testid="workspace-header-user-action-workspace-home"
              type="button"
              @click="triggerUserAction('openWorkspaceHome')"
            >
              <span class="material-symbols-outlined text-[18px]">home</span>
              <span>打开空间首页</span>
            </button>
            <button
              class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
              data-testid="workspace-header-user-action-settings"
              type="button"
              @click="triggerUserAction('openWorkspaceSettings')"
            >
              <span class="material-symbols-outlined text-[18px]">tune</span>
              <span>项目设置</span>
            </button>
            <button
              class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
              data-testid="workspace-header-user-action-display-preferences"
              type="button"
              @click="triggerUserAction('openDisplayPreferences')"
            >
              <span class="material-symbols-outlined text-[18px]">format_size</span>
              <span>显示偏好</span>
            </button>
            <button
              v-if="props.workspaceCanManageMembers"
              class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
              data-testid="workspace-header-user-action-member-management"
              type="button"
              @click="triggerUserAction('openMemberManagement')"
            >
              <span class="material-symbols-outlined text-[18px]">group</span>
              <span>成员管理</span>
            </button>
            <button
              class="text-xs text-slate-700 px-2.5 py-2 rounded-xl flex gap-2 w-full transition-colors items-center hover:bg-slate-50"
              data-testid="workspace-header-user-action-account-center"
              type="button"
              @click="triggerUserAction('openAccountCenter')"
            >
              <span class="material-symbols-outlined text-[18px]">manage_accounts</span>
              <span>账号中心</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  </header>
</template>
