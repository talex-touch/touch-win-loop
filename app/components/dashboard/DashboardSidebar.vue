<script setup lang="ts">
import type { AuthUser, WorkspaceWithQuota } from '~~/shared/types/domain'
import type { DashboardMenuItem, DashboardTopic } from '~/types/dashboard'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

const props = withDefaults(defineProps<{
  menuItems?: DashboardMenuItem[]
  topics?: DashboardTopic[]
  analystName?: string
  analystUserId?: string
  analystUserEmail?: string
  analystTier?: string
  analystAvatar?: string
  showAdminBadge?: boolean
  isPlatformAdminUser?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
}>(), {
  menuItems: () => [],
  topics: () => [],
  analystName: '分析师 张明',
  analystUserId: '',
  analystUserEmail: '',
  analystTier: '高级会员',
  analystAvatar: '',
  showAdminBadge: false,
  isPlatformAdminUser: false,
  workspaceOptions: () => [],
})

const emit = defineEmits<{
  workspaceCreated: [value: WorkspaceWithQuota]
  workspaceUpdated: [value: { workspaceId: string, name: string }]
  userUpdated: [value: AuthUser]
}>()

const route = useRoute()
const profileDialogVisible = ref(false)
const selectedWorkspaceId = ref('')
const displayAvatarUrl = ref('')

const analystInitial = computed(() => {
  const normalizedName = String(props.analystName || '').trim()
  if (!normalizedName)
    return 'U'
  return normalizedName.slice(0, 1).toUpperCase()
})

watch(() => props.analystAvatar, (value) => {
  displayAvatarUrl.value = String(value || '').trim()
}, { immediate: true })

function isMenuItemActive(item: DashboardMenuItem): boolean {
  if (item.to === '/dashboard')
    return route.path === '/dashboard'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const routeTeamId = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '')
  const matched = normalizedPath.match(/^\/(?:team|workspace)\/([^/]+)(?:\/project\/[^/]+)?$/)
  return matched?.[1] || ''
})

watch(
  [routeTeamId, () => props.workspaceOptions],
  ([currentId, options]) => {
    const workspaceList = options || []
    if (currentId && workspaceList.some(item => item.workspace.id === currentId)) {
      selectedWorkspaceId.value = currentId
      writeActiveWorkspacePreference(currentId)
      return
    }

    const storedWorkspaceId = readActiveWorkspacePreference()
    if (storedWorkspaceId && workspaceList.some(item => item.workspace.id === storedWorkspaceId)) {
      selectedWorkspaceId.value = storedWorkspaceId
      return
    }

    selectedWorkspaceId.value = workspaceList[0]?.workspace.id || ''
    if (selectedWorkspaceId.value)
      writeActiveWorkspacePreference(selectedWorkspaceId.value)
  },
  { immediate: true },
)

function openProfileDialog() {
  profileDialogVisible.value = true
}

async function onWorkspaceSwitch(workspaceId: string) {
  const targetId = String(workspaceId || '').trim()
  if (!targetId)
    return

  selectedWorkspaceId.value = targetId
  writeActiveWorkspacePreference(targetId)

  if (routeTeamId.value === targetId)
    return

  await navigateTo(`/team/${targetId}`)
}

function onWorkspaceCreated(workspace: WorkspaceWithQuota) {
  emit('workspaceCreated', workspace)
}

function onWorkspaceUpdated(payload: { workspaceId: string, name: string }) {
  emit('workspaceUpdated', payload)
}

function onUserUpdated(user: AuthUser) {
  displayAvatarUrl.value = String(user.avatarUrl || '').trim()
  emit('userUpdated', user)
}
</script>

<template>
  <aside class="border-r border-[var(--db-border)] bg-white/[0.72] shrink-0 flex-col w-[288px] hidden backdrop-blur-xl lg:flex">
    <div class="p-5">
      <div class="db-panel db-panel-soft px-5 py-4">
        <div class="flex gap-3 items-center">
          <div class="text-white rounded-[18px] bg-[var(--db-primary)] flex h-11 w-11 shadow-[0_14px_28px_rgba(36,84,215,0.22)] items-center justify-center">
            <span class="material-symbols-outlined text-[22px]">analytics</span>
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-[var(--db-subtle)] tracking-[0.16em] font-semibold uppercase">
              Analysis Workspace
            </p>
            <h1 class="text-lg text-slate-900 tracking-[-0.03em] font-black mt-1">
              竞赛分析平台
            </h1>
          </div>
        </div>
        <p class="db-muted text-sm leading-6 mt-3">
          围绕赛事、资料与项目推进构建的统一分析工作台。
        </p>
      </div>
    </div>

    <div class="px-4 pb-4 flex flex-1 flex-col min-h-0">
      <div class="text-[11px] text-[var(--db-subtle)] tracking-[0.16em] font-semibold px-2 uppercase">
        工作台导航
      </div>
      <nav class="mt-3 space-y-2">
        <NuxtLink
          v-for="item in props.menuItems"
          :key="item.id"
          :to="item.to"
          class="db-focus-ring group px-3.5 py-3 rounded-[18px] flex gap-3 transition-all items-center relative"
          :class="isMenuItemActive(item)
            ? 'bg-[var(--db-primary-soft)] text-[var(--db-primary)] shadow-[0_12px_28px_rgba(36,84,215,0.12)]'
            : 'text-slate-600 hover:bg-white/[0.86] hover:text-slate-900'"
        >
          <span
            class="rounded-2xl flex shrink-0 h-10 w-10 transition-colors items-center justify-center"
            :class="isMenuItemActive(item) ? 'bg-white text-[var(--db-primary)]' : 'bg-[var(--db-bg)] text-slate-500 group-hover:text-[var(--db-primary)]'"
          >
            <span class="material-symbols-outlined text-[21px]">{{ item.icon }}</span>
          </span>
          <span class="font-semibold flex-1 min-w-0 truncate">{{ item.label }}</span>
          <span
            v-if="isMenuItemActive(item)"
            class="rounded-full bg-[var(--db-primary)] h-2.5 w-2.5"
          />
        </NuxtLink>
      </nav>

      <div class="db-panel db-panel-muted mt-6 p-4">
        <p class="text-[11px] text-[var(--db-subtle)] tracking-[0.16em] font-semibold uppercase">
          热门话题
        </p>
        <ul class="mt-3 space-y-2.5">
          <li
            v-for="topic in props.topics"
            :key="topic.id"
            class="db-hover-lift text-sm text-slate-600 px-3 py-2.5 border border-[var(--db-border)] rounded-[16px] bg-white/70 flex gap-2 items-center"
          >
            <span class="text-xs text-[var(--db-primary)] font-bold">#</span>
            <span class="truncate">{{ topic.label }}</span>
          </li>
        </ul>
      </div>

      <div class="db-panel mt-4 p-4">
        <p class="text-[11px] text-[var(--db-subtle)] tracking-[0.16em] font-semibold uppercase">
          工作区入口
        </p>
        <WorkspaceSwitchEntry
          v-if="props.workspaceOptions.length > 0"
          class="mt-3"
          mode="select"
          label="项目台切换"
          :model-value="selectedWorkspaceId"
          :workspace-options="props.workspaceOptions"
          :show-quota="false"
          @update:model-value="onWorkspaceSwitch"
          @workspace-created="onWorkspaceCreated"
        />
        <WorkspaceSwitchEntry
          v-else
          class="mt-3"
          mode="link"
          label="项目台"
          icon="workspaces"
          to="/team"
        />
      </div>

      <div class="db-panel mt-4 p-3.5 flex gap-3 items-center">
        <img
          v-if="displayAvatarUrl"
          :src="displayAvatarUrl"
          class="border border-[var(--db-border)] rounded-full h-11 w-11 shadow-sm object-cover"
          alt="用户头像"
        >
        <div
          v-else
          class="text-sm text-white font-semibold border border-[var(--db-border)] rounded-full bg-slate-900 flex shrink-0 h-11 w-11 shadow-sm items-center justify-center"
        >
          {{ analystInitial }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-slate-900 font-semibold truncate">
            {{ props.analystName }}
          </p>
          <p
            v-if="props.showAdminBadge"
            class="db-chip db-chip-warning mt-1"
          >
            管理页
          </p>
          <p class="db-muted text-xs truncate" :class="props.showAdminBadge ? 'mt-1.5' : 'mt-1'">
            {{ props.analystTier }}
          </p>
        </div>
        <button
          class="db-btn db-btn-ghost db-focus-ring ml-auto px-0 h-10 w-10"
          title="个人设置"
          type="button"
          @click.stop="openProfileDialog"
        >
          <span class="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>
    </div>
  </aside>

  <UserSettingsDialog
    v-model:visible="profileDialogVisible"
    :user-name="props.analystName"
    :user-id="props.analystUserId"
    :user-email="props.analystUserEmail"
    :user-subtitle="props.analystTier"
    :user-avatar-url="displayAvatarUrl"
    :show-admin-badge="props.showAdminBadge"
    :is-platform-admin-user="props.isPlatformAdminUser"
    :workspace-options="props.workspaceOptions"
    :active-workspace-id="selectedWorkspaceId"
    @user-updated="onUserUpdated"
    @workspace-updated="onWorkspaceUpdated"
  />
</template>
