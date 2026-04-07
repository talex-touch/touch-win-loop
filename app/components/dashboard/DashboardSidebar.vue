<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'
import type { DashboardMenuItem, DashboardTopic } from '~/types/dashboard'
import { readActiveWorkspacePreference, writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

const props = withDefaults(defineProps<{
  menuItems?: DashboardMenuItem[]
  topics?: DashboardTopic[]
  analystName?: string
  analystTier?: string
  analystAvatar?: string
  showAdminBadge?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
}>(), {
  menuItems: () => [],
  topics: () => [],
  analystName: '分析师 张明',
  analystTier: '高级会员',
  analystAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAgO3szaJLN0mB5xXQFUAcenjGXOhK0fc6jH78_wVb6AgKHW2rx7If2DG7Zro9-woZuymuskn7rGkTJWIN-l2SRqi6dvqXNZqAE8LUhcHv4Z7uY-ptVO0eKI9sZzfUw9Jp1lzLiYTdYykbvVyXdkKLj9TeWaK9DipDXCk0g0Tgtir3CsIXTaFlEbB7EtggaKgtgnWMXjiAiW1uwj-4mVXyLJqdaJfAvFHWfRaX1dosZdLgVxspcp2tPArmit3IFKKQ4HpECByj_ZGI1',
  showAdminBadge: false,
  workspaceOptions: () => [],
})

const emit = defineEmits<{
  workspaceCreated: [value: WorkspaceWithQuota]
}>()

const route = useRoute()
const profileDialogVisible = ref(false)
const selectedWorkspaceId = ref('')

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
</script>

<template>
  <aside class="border-r border-blue-100 bg-white shrink-0 flex-col w-64 hidden lg:flex">
    <div class="p-6 flex gap-3 items-center">
      <div class="text-white rounded-lg bg-blue-700 flex h-8 w-8 items-center justify-center">
        <span class="material-symbols-outlined text-xl">analytics</span>
      </div>
      <h1 class="text-lg text-slate-900 tracking-tight font-bold">
        竞赛分析平台
      </h1>
    </div>

    <nav class="px-4 flex-1 space-y-1">
      <NuxtLink
        v-for="item in props.menuItems"
        :key="item.id"
        :to="item.to"
        class="px-3 py-2 rounded-lg flex gap-3 transition-colors items-center"
        :class="isMenuItemActive(item)
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-slate-600 hover:bg-slate-50'"
      >
        <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="mt-auto p-4">
      <div class="p-4 border border-slate-100 rounded-xl bg-slate-50">
        <p class="text-xs text-slate-400 tracking-wider font-bold mb-3 uppercase">
          热门话题
        </p>
        <ul class="text-sm space-y-2">
          <li
            v-for="topic in props.topics"
            :key="topic.id"
            class="text-slate-600 flex gap-2 items-center hover:text-blue-700"
          >
            <span class="text-xs text-blue-700 font-bold">#</span>{{ topic.label }}
          </li>
        </ul>
      </div>

      <WorkspaceSwitchEntry
        mode="select"
        :model-value="selectedWorkspaceId"
        :workspace-options="props.workspaceOptions"
        :show-quota="false"
        @update:model-value="onWorkspaceSwitch"
        @workspace-created="onWorkspaceCreated"
      />

      <div class="mt-4 p-3 border border-slate-200 rounded-xl bg-white flex gap-3 items-center">
        <img
          :src="props.analystAvatar"
          class="border border-slate-200 rounded-full h-10 w-10 object-cover"
          alt="用户头像"
        >
        <div class="min-w-0">
          <p class="text-sm text-slate-900 font-semibold truncate">
            {{ props.analystName }}
          </p>
          <p
            v-if="props.showAdminBadge"
            class="text-[10px] text-rose-700 font-semibold mt-1 px-1.5 py-0.5 border border-rose-200 rounded-md bg-rose-50 inline-flex"
          >
            管理页
          </p>
          <p class="text-xs text-slate-500 truncate">
            {{ props.analystTier }}
          </p>
        </div>
        <button
          class="text-slate-500 ml-auto rounded-md flex h-8 w-8 transition-colors items-center justify-center hover:text-slate-800 hover:bg-slate-100"
          title="个人设置"
          @click="openProfileDialog"
        >
          <span class="material-symbols-outlined text-[20px]">settings</span>
        </button>
      </div>
    </div>
  </aside>

  <UserSettingsDialog
    v-model:visible="profileDialogVisible"
    :user-name="props.analystName"
    :user-subtitle="props.analystTier"
    :show-admin-badge="props.showAdminBadge"
    :workspace-options="props.workspaceOptions"
    :active-workspace-id="selectedWorkspaceId"
  />
</template>
