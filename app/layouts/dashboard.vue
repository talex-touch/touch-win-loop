<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  AuthUser,
  PlatformPermission,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'

const {
  analystProfile,
  menuItems: baseMenuItems,
  hotTopics,
  searchQuery,
} = useDashboardWorkspace()
const route = useRoute()
const authApiFetch = useAuthApiFetch()
const shellScrollRef = ref<HTMLDivElement | null>(null)

const platformPermissions = ref<PlatformPermission[]>([])
const analystName = ref(analystProfile.name)
const analystUserId = ref('')
const analystUserEmail = ref('')
const analystAvatar = ref('')
const isPlatformAdmin = ref(false)
const workspaceOptions = ref<WorkspaceWithQuota[]>([])

const canEnterAdmin = computed(() => {
  if (isPlatformAdmin.value)
    return true
  return platformPermissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive', 'pricing.write', 'user.read', 'role.assign'].includes(item),
  )
})

const analystTier = computed(() => {
  if (platformPermissions.value.length > 0)
    return '平台管理员'
  return analystProfile.tier
})

const menuItems = computed(() => {
  const items = [...baseMenuItems]
  if (!items.some(item => item.id === 'analytics')) {
    items.splice(1, 0, {
      id: 'analytics',
      label: '综合分析',
      icon: 'monitoring',
      to: '/dashboard/analytics',
    })
  }
  if (canEnterAdmin.value || route.path.startsWith('/admin')) {
    items.push({
      id: 'platform-admin',
      label: '平台管理',
      icon: 'admin_panel_settings',
      to: '/admin',
    })
  }
  return items
})

const showAdminBadge = computed(() => {
  return canEnterAdmin.value && route.path.startsWith('/admin')
})

const isWorkspaceFullscreen = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '') || '/'
  return /^\/team\/[^/]+\/project\/[^/]+$/.test(normalizedPath)
})

const showLoopyFloating = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '') || '/'
  if (normalizedPath === '/dashboard')
    return false
  if (/^\/team\/[^/]+\/project\/[^/]+$/.test(normalizedPath))
    return false
  if (normalizedPath === '/contests' || normalizedPath.startsWith('/contests/'))
    return true
  if (/^\/team\/[^/]+$/.test(normalizedPath))
    return true
  if (normalizedPath === '/resources' || normalizedPath.startsWith('/resources/'))
    return true
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/'))
    return true
  return false
})

useHead(() => ({
  htmlAttrs: {
    class: {
      'wl-scroll-lock': isWorkspaceFullscreen.value,
    },
  },
  bodyAttrs: {
    class: {
      'wl-scroll-lock': isWorkspaceFullscreen.value,
    },
  },
}))

onMounted(async () => {
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    const userEmail = String((response.data.user as AuthUser & { email?: string | null }).email || '').trim()
    platformPermissions.value = response.data.user.platformPermissions || []
    analystUserId.value = response.data.user.id || ''
    analystUserEmail.value = userEmail
    analystName.value = response.data.user.username || analystProfile.name
    analystAvatar.value = response.data.user.avatarUrl || ''
    isPlatformAdmin.value = Boolean(response.data.user.isPlatformAdmin)
    if (Array.isArray(response.data.teams) && response.data.teams.length > 0) {
      workspaceOptions.value = response.data.teams.map(item => ({ workspace: item.team, quota: item.quota }))
    }
    else {
      workspaceOptions.value = response.data.workspaces || []
    }
  }
  catch {
    platformPermissions.value = []
    analystUserId.value = ''
    analystUserEmail.value = ''
    analystName.value = analystProfile.name
    analystAvatar.value = ''
    isPlatformAdmin.value = false
    workspaceOptions.value = []
  }
})

function onWorkspaceCreated(workspace: WorkspaceWithQuota) {
  const nextOptions = workspaceOptions.value.filter(item => item.workspace.id !== workspace.workspace.id)
  workspaceOptions.value = [workspace, ...nextOptions]
}

function onWorkspaceUpdated(payload: { workspaceId: string, name: string }) {
  workspaceOptions.value = workspaceOptions.value.map((item) => {
    if (item.workspace.id !== payload.workspaceId)
      return item

    return {
      ...item,
      workspace: {
        ...item.workspace,
        name: payload.name,
      },
    }
  })
}

function onUserUpdated(user: AuthUser) {
  analystUserId.value = user.id || ''
  analystName.value = user.username || analystProfile.name
  analystAvatar.value = user.avatarUrl || ''
}

watch(() => route.fullPath, async () => {
  if (isWorkspaceFullscreen.value)
    return

  await nextTick()
  if (shellScrollRef.value)
    shellScrollRef.value.scrollTop = 0
})
</script>

<template>
  <div class="contents">
    <div
      v-if="isWorkspaceFullscreen"
      class="dashboard-shell workspace-fullscreen text-slate-900 bg-white h-screen inset-0 fixed overflow-hidden"
    >
      <slot />
    </div>

    <div v-else class="dashboard-shell text-slate-900 bg-[#f6f6f8] flex h-screen min-h-0 overflow-hidden">
      <DashboardSidebar
        :menu-items="menuItems"
        :topics="hotTopics"
        :analyst-name="analystName"
        :analyst-user-id="analystUserId"
        :analyst-user-email="analystUserEmail"
        :analyst-tier="analystTier"
        :analyst-avatar="analystAvatar"
        :show-admin-badge="showAdminBadge"
        :is-platform-admin-user="isPlatformAdmin"
        :workspace-options="workspaceOptions"
        @workspace-created="onWorkspaceCreated"
        @workspace-updated="onWorkspaceUpdated"
        @user-updated="onUserUpdated"
      />

      <main class="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
        <DashboardTopbar v-model="searchQuery" />

        <div
          ref="shellScrollRef"
          class="dashboard-scrollbar flex-1 min-h-0 overflow-y-auto"
        >
          <slot />
        </div>
      </main>
    </div>

    <LoopyFloatingEntry
      v-show="showLoopyFloating"
      :workspace-options="workspaceOptions"
    />
  </div>
</template>

<style scoped>
.workspace-fullscreen {
  width: 100%;
  height: 100dvh;
  min-height: 0;
}

.dashboard-scrollbar {
  padding: 0 !important;
}

.dashboard-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.dashboard-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 9999px;
}
</style>
