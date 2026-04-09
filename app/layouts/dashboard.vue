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

const isDashboardHome = computed(() => {
  const normalizedPath = route.path.replace(/\/+$/, '') || '/'
  return normalizedPath === '/dashboard'
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
  if (/^\/team\/[^/]+$/.test(normalizedPath))
    return true
  if (normalizedPath === '/contests' || normalizedPath.startsWith('/contests/'))
    return true
  if (normalizedPath === '/resources' || normalizedPath.startsWith('/resources/'))
    return true
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/'))
    return true
  return false
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

    <div v-else class="dashboard-shell dashboard-shell--default text-slate-900 flex h-screen min-h-0 overflow-hidden">
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

      <main class="dashboard-main flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
        <DashboardTopbar v-model="searchQuery" />

        <div
          ref="shellScrollRef"
          class="dashboard-scrollbar dashboard-canvas flex-1 min-h-0 overflow-y-auto"
          :class="isDashboardHome ? 'p-0' : 'p-4 md:p-8'"
        >
          <div class="dashboard-content" :class="isDashboardHome ? 'h-full max-w-none' : ''">
            <slot />
          </div>
        </div>
      </main>
    </div>

    <LoopyFloatingEntry
      v-show="showLoopyFloating"
      :workspace-options="workspaceOptions"
    />
  </div>
</template>

<style>
.dashboard-shell {
  --db-primary: #2454d7;
  --db-primary-strong: #173ea6;
  --db-primary-soft: #e8efff;
  --db-primary-soft-strong: #dbe7ff;
  --db-success: #0f9f6e;
  --db-success-soft: #e7f8f1;
  --db-warning: #b9771d;
  --db-warning-soft: #fff4df;
  --db-danger: #d9485f;
  --db-danger-soft: #fff0f3;
  --db-text: #11203b;
  --db-muted: #61708a;
  --db-subtle: #8b97ac;
  --db-bg: #f3f7fd;
  --db-bg-alt: #f8fbff;
  --db-panel: rgba(255, 255, 255, 0.9);
  --db-panel-strong: rgba(255, 255, 255, 0.96);
  --db-panel-muted: rgba(246, 249, 255, 0.96);
  --db-border: rgba(138, 151, 175, 0.2);
  --db-border-strong: rgba(36, 84, 215, 0.18);
  --db-shadow-sm: 0 12px 30px rgba(15, 23, 42, 0.06);
  --db-shadow-md: 0 18px 48px rgba(36, 84, 215, 0.14);
  --db-shadow-lg: 0 26px 70px rgba(17, 32, 59, 0.14);
  --db-radius-xl: 28px;
  --db-radius-lg: 22px;
  --db-radius-md: 18px;
  --db-radius-sm: 14px;
  --db-duration: 180ms;
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.dashboard-shell--default {
  background:
    radial-gradient(circle at top left, rgba(36, 84, 215, 0.14), transparent 26%),
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.1), transparent 22%),
    linear-gradient(180deg, #f2f6fd 0%, #f7faff 52%, #f3f7fd 100%);
}

.dashboard-main {
  position: relative;
}

.dashboard-main::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.04) 100%);
  pointer-events: none;
}

.workspace-fullscreen {
  width: 100%;
  height: 100dvh;
  min-height: 0;
}

.dashboard-canvas {
  position: relative;
}

.dashboard-canvas::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0)),
    radial-gradient(circle at 18% 0%, rgba(36, 84, 215, 0.06), transparent 30%);
  pointer-events: none;
}

.dashboard-content {
  position: relative;
  max-width: 1480px;
  margin: 0 auto;
}

.dashboard-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.dashboard-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.dashboard-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.42);
  border-radius: 9999px;
}

.db-panel {
  background: var(--db-panel-strong);
  border: 1px solid var(--db-border);
  border-radius: var(--db-radius-lg);
  box-shadow: var(--db-shadow-sm);
  backdrop-filter: blur(16px);
}

.db-panel-soft {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94) 0%, rgba(246, 249, 255, 0.96) 100%);
}

.db-panel-muted {
  background: linear-gradient(180deg, rgba(249, 251, 255, 0.96) 0%, rgba(241, 245, 252, 0.98) 100%);
}

.db-panel-elevated {
  box-shadow: var(--db-shadow-md);
}

.db-hover-lift {
  transition:
    transform var(--db-duration) ease,
    box-shadow var(--db-duration) ease,
    border-color var(--db-duration) ease,
    background-color var(--db-duration) ease;
}

.db-hover-lift:hover {
  transform: translateY(-2px);
  border-color: var(--db-border-strong);
  box-shadow: var(--db-shadow-md);
}

.db-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  border-radius: var(--db-radius-sm);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1;
  transition:
    transform var(--db-duration) ease,
    box-shadow var(--db-duration) ease,
    border-color var(--db-duration) ease,
    background-color var(--db-duration) ease,
    color var(--db-duration) ease;
}

.db-btn:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.db-btn-ghost {
  color: var(--db-text);
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid var(--db-border);
}

.db-btn-ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.96);
  border-color: var(--db-border-strong);
  box-shadow: var(--db-shadow-sm);
}

.db-btn-primary {
  color: #fff;
  border: 1px solid transparent;
  background: linear-gradient(135deg, var(--db-primary) 0%, #3772ff 100%);
  box-shadow: 0 16px 32px rgba(36, 84, 215, 0.22);
}

.db-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 20px 36px rgba(36, 84, 215, 0.28);
}

.db-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
  padding: 0 0.875rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  border: 1px solid transparent;
}

.db-chip-primary {
  color: var(--db-primary);
  background: var(--db-primary-soft);
  border-color: rgba(36, 84, 215, 0.14);
}

.db-chip-success {
  color: var(--db-success);
  background: var(--db-success-soft);
  border-color: rgba(15, 159, 110, 0.14);
}

.db-chip-warning {
  color: var(--db-warning);
  background: var(--db-warning-soft);
  border-color: rgba(185, 119, 29, 0.14);
}

.db-chip-muted {
  color: var(--db-muted);
  background: rgba(148, 163, 184, 0.12);
  border-color: rgba(148, 163, 184, 0.12);
}

.db-focus-ring:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(36, 84, 215, 0.14);
}

.db-eyebrow {
  margin-bottom: 0.75rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--db-primary);
}

.db-eyebrow-tight {
  margin-bottom: 0.5rem;
}

.db-title {
  color: var(--db-text);
  letter-spacing: -0.03em;
}

.db-muted {
  color: var(--db-muted);
}

.db-subtle {
  color: var(--db-subtle);
}

.db-skeleton {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    110deg,
    rgba(226, 232, 240, 0.7) 8%,
    rgba(248, 250, 252, 0.95) 18%,
    rgba(226, 232, 240, 0.7) 33%
  );
  background-size: 220% 100%;
  animation: db-shimmer 1.8s linear infinite;
}

.db-appear {
  animation: db-fade-up 420ms ease both;
}

.dashboard-profile-dialog .dense-btn {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--db-border);
  background: rgba(255, 255, 255, 0.78);
  color: var(--db-text);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
  transition:
    border-color var(--db-duration) ease,
    background-color var(--db-duration) ease,
    box-shadow var(--db-duration) ease;
}

.dashboard-profile-dialog .dense-btn:hover:enabled {
  border-color: var(--db-border-strong);
  background: #fff;
  box-shadow: var(--db-shadow-sm);
}

.dashboard-profile-dialog .dense-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@keyframes db-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes db-fade-up {
  0% {
    opacity: 0;
    transform: translateY(12px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .db-hover-lift,
  .db-btn,
  .db-appear,
  .dashboard-main::before,
  .dashboard-canvas::before {
    animation: none !important;
    transition: none !important;
  }

  .db-skeleton {
    animation: none !important;
  }
}
</style>
