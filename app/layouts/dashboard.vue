<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  PlatformPermission,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'

const {
  analystProfile,
  menuItems: baseMenuItems,
  hotTopics,
} = useDashboardWorkspace()
const route = useRoute()
const authApiFetch = useAuthApiFetch()

const searchQuery = ref('')
const platformPermissions = ref<PlatformPermission[]>([])
const analystName = ref(analystProfile.name)
const isPlatformAdmin = ref(false)
const workspaceOptions = ref<WorkspaceWithQuota[]>([])

const canEnterAdmin = computed(() => {
  if (isPlatformAdmin.value)
    return true
  return platformPermissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive', 'pricing.write', 'role.assign'].includes(item),
  )
})

const analystTier = computed(() => {
  if (platformPermissions.value.length > 0)
    return '平台管理员'
  return analystProfile.tier
})

const menuItems = computed(() => {
  const items = [...baseMenuItems]
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
  return /^\/team\/[^/]+(?:\/project\/[^/]+)?$/.test(normalizedPath) || /^\/workspace\/[^/]+$/.test(normalizedPath)
})

useHead({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@300;400;500;600;700&display=swap',
    },
  ],
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
    platformPermissions.value = response.data.user.platformPermissions || []
    analystName.value = response.data.user.username || analystProfile.name
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
    analystName.value = analystProfile.name
    isPlatformAdmin.value = false
    workspaceOptions.value = []
  }
})
</script>

<template>
  <div
    v-if="isWorkspaceFullscreen"
    class="dashboard-shell workspace-fullscreen text-slate-900 bg-white h-screen overflow-hidden fixed inset-0"
  >
    <slot />
  </div>

  <div v-else class="dashboard-shell text-slate-900 bg-[#f6f6f8] flex h-screen overflow-hidden">
    <DashboardSidebar
      :menu-items="menuItems"
      :topics="hotTopics"
      :analyst-name="analystName"
      :analyst-tier="analystTier"
      :show-admin-badge="showAdminBadge"
      :workspace-options="workspaceOptions"
    />

    <main class="flex flex-1 flex-col min-w-0 overflow-hidden">
      <DashboardTopbar v-model="searchQuery" />

      <div class="dashboard-scrollbar p-4 flex-1 overflow-y-auto md:p-8">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-shell {
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.workspace-fullscreen {
  width: 100%;
  height: 100dvh;
  min-height: 0;
}

.dashboard-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.dashboard-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 9999px;
}
</style>
