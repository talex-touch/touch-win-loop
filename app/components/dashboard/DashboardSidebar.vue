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

function resolveMenuItemTo(item: DashboardMenuItem): string {
  if (item.id === 'team' && selectedWorkspaceId.value)
    return `/team/${selectedWorkspaceId.value}`
  return item.to
}

function isMenuItemActive(item: DashboardMenuItem): boolean {
  if (item.to === '/dashboard')
    return route.path === '/dashboard'
  if (item.id === 'team') {
    const normalizedPath = route.path.replace(/\/+$/, '') || '/'
    return normalizedPath === '/team'
      || /^\/team\/[^/]+(?:\/project\/[^/]+)?$/.test(normalizedPath)
      || /^\/workspace\/[^/]+(?:\/project\/[^/]+)?$/.test(normalizedPath)
  }
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

function isBrandIcon(icon: string): boolean {
  return icon === 'brand-mark'
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
  <aside class="dashboard-sidebar hidden lg:flex">
    <div class="dashboard-sidebar__inner">
      <div class="dashboard-sidebar__brand-panel">
        <div class="dashboard-sidebar__brand-mark-shell" aria-hidden="true">
          <BrandLogo variant="mark" class="dashboard-sidebar__brand-mark" />
        </div>
        <div class="dashboard-sidebar__brand-copy">
          <p class="dashboard-sidebar__brand-title">
            WinLoop
          </p>
          <p class="dashboard-sidebar__brand-subtitle">
            竞赛分析平台
          </p>
        </div>
      </div>

      <nav class="dashboard-sidebar__nav" aria-label="主导航">
        <NuxtLink
          v-for="item in props.menuItems"
          :key="item.id"
          :to="resolveMenuItemTo(item)"
          class="dashboard-sidebar__nav-item"
          :class="{ 'dashboard-sidebar__nav-item--active': isMenuItemActive(item) }"
        >
          <span class="dashboard-sidebar__nav-icon" :class="{ 'dashboard-sidebar__nav-icon--brand': isBrandIcon(item.icon) }">
            <BrandLogo
              v-if="isBrandIcon(item.icon)"
              variant="mark"
              class="dashboard-sidebar__nav-brand"
            />
            <span v-else class="material-symbols-outlined dashboard-sidebar__nav-glyph">{{ item.icon }}</span>
          </span>
          <span class="dashboard-sidebar__nav-label">{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="dashboard-sidebar__footer">
        <section class="dashboard-sidebar__topic-card" aria-label="热门话题">
          <div class="dashboard-sidebar__topic-heading">
            <span class="material-symbols-outlined dashboard-sidebar__topic-heading-icon">local_fire_department</span>
            <span>热门话题</span>
          </div>
          <ul class="dashboard-sidebar__topic-list">
            <li
              v-for="topic in props.topics"
              :key="topic.id"
              class="dashboard-sidebar__topic-item"
            >
              <span class="dashboard-sidebar__topic-prefix">#</span>
              <span class="dashboard-sidebar__topic-label">{{ topic.label }}</span>
            </li>
          </ul>
        </section>

        <div class="dashboard-sidebar__workspace-entry">
          <WorkspaceSwitchEntry
            v-if="props.workspaceOptions.length > 0"
            mode="select"
            :model-value="selectedWorkspaceId"
            :workspace-options="props.workspaceOptions"
            :show-quota="false"
            @update:model-value="onWorkspaceSwitch"
            @workspace-created="onWorkspaceCreated"
          />
          <WorkspaceSwitchEntry
            v-else
            mode="link"
            label="项目台"
            icon="brand-mark"
            to="/team"
          />
        </div>

        <div class="dashboard-sidebar__account-card">
          <img
            v-if="displayAvatarUrl"
            :src="displayAvatarUrl"
            class="dashboard-sidebar__account-avatar"
            alt="用户头像"
          >
          <div
            v-else
            class="dashboard-sidebar__account-avatar dashboard-sidebar__account-avatar--fallback"
          >
            {{ analystInitial }}
          </div>
          <div class="dashboard-sidebar__account-copy">
            <div class="dashboard-sidebar__account-name-row">
              <p class="dashboard-sidebar__account-name">
                {{ props.analystName }}
              </p>
              <p v-if="props.showAdminBadge" class="dashboard-sidebar__account-badge">
                管理页
              </p>
            </div>
            <p class="dashboard-sidebar__account-tier">
              {{ props.analystTier }}
            </p>
          </div>
          <button
            type="button"
            class="dashboard-sidebar__account-action"
            title="个人设置"
            @click.stop="openProfileDialog"
          >
            <span class="material-symbols-outlined dashboard-sidebar__account-action-icon">settings</span>
          </button>
        </div>
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

<style scoped>
.dashboard-sidebar {
  width: 14.5rem;
  flex-shrink: 0;
  flex-direction: column;
  border-right: 1px solid #e7ecf5;
  background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
  font-size: 0.875rem;
}

.dashboard-sidebar__inner {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 0.625rem 0.625rem;
}

.dashboard-sidebar__brand-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.5rem 0.75rem;
  border-bottom: 1px solid #eef3f8;
  text-align: center;
}

.dashboard-sidebar__brand-mark-shell {
  display: flex;
  width: 3rem;
  height: 3rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.875rem;
  background: radial-gradient(
    circle at 50% 35%,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(248, 251, 255, 0.98) 66%,
    rgba(241, 246, 255, 0.94) 100%
  );
}

.dashboard-sidebar__brand-mark {
  --winloop-brand-mark-size: 1.9rem;
}

.dashboard-sidebar__brand-copy {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
}

.dashboard-sidebar__brand-title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: #0f172a;
}

.dashboard-sidebar__brand-subtitle {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
  font-weight: 600;
  color: #98a3b7;
}

.dashboard-sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  padding: 0 0.125rem;
}

.dashboard-sidebar__nav-item {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.625rem;
  padding: 0.5rem 0.75rem;
  color: #6a7890;
  text-decoration: none;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.dashboard-sidebar__nav-item:hover {
  background: #f7f9fc;
  color: #334155;
}

.dashboard-sidebar__nav-item--active {
  background: #edf3ff;
  color: #2563eb;
  box-shadow: inset 0 0 0 1px #dbe6ff;
}

.dashboard-sidebar__nav-item--active .dashboard-sidebar__nav-label {
  font-weight: 700;
}

.dashboard-sidebar__nav-icon {
  display: flex;
  width: 1.25rem;
  min-width: 1.25rem;
  align-items: center;
  justify-content: center;
}

.dashboard-sidebar__nav-brand {
  --winloop-brand-mark-size: 1rem;
}

.dashboard-sidebar__nav-glyph {
  font-size: 1rem;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 320,
    'opsz' 24;
}

.dashboard-sidebar__nav-label {
  font-size: 0.875rem;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.dashboard-sidebar__footer {
  display: flex;
  margin-top: auto;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.375rem 0.125rem 0;
}

.dashboard-sidebar__topic-card {
  border: 1px solid #edf1f7;
  border-radius: 0.875rem;
  background: #ffffff;
  padding: 0.625rem 0.75rem;
}

.dashboard-sidebar__topic-heading {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 700;
  color: #a0abc0;
}

.dashboard-sidebar__topic-heading-icon {
  font-size: 0.8125rem;
  line-height: 1;
  color: #4f7dff;
}

.dashboard-sidebar__topic-list {
  display: flex;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  flex-direction: column;
  gap: 0.5rem;
}

.dashboard-sidebar__topic-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.dashboard-sidebar__topic-prefix {
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 700;
  color: #2563eb;
}

.dashboard-sidebar__topic-label {
  font-size: 0.875rem;
  line-height: 1.35;
  font-weight: 600;
  color: #52627c;
}

.dashboard-sidebar__account-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #edf1f7;
  border-radius: 0.875rem;
  background: #ffffff;
  padding: 0.5rem 0.625rem;
}

.dashboard-sidebar__account-avatar {
  display: flex;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  object-fit: cover;
}

.dashboard-sidebar__account-avatar--fallback {
  background: #0f172a;
  color: #ffffff;
  font-size: 0.75rem;
  line-height: 1;
  font-weight: 700;
}

.dashboard-sidebar__account-copy {
  min-width: 0;
  flex: 1;
}

.dashboard-sidebar__account-name-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.dashboard-sidebar__account-name {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  line-height: 1.2;
  font-weight: 700;
  color: #0f172a;
}

.dashboard-sidebar__account-badge {
  margin: 0;
  flex-shrink: 0;
  border: 1px solid #fecdd3;
  border-radius: 9999px;
  background: #fff1f2;
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  line-height: 1;
  font-weight: 700;
  color: #be123c;
}

.dashboard-sidebar__account-tier {
  margin: 0.1875rem 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  line-height: 1.35;
  font-weight: 600;
  color: #97a3b8;
}

.dashboard-sidebar__account-action {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  color: #7f8ca2;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.dashboard-sidebar__account-action:hover {
  background: #f5f7fb;
  color: #334155;
}

.dashboard-sidebar__account-action-icon {
  font-size: 0.875rem;
  line-height: 1;
}

.dashboard-sidebar__workspace-entry :deep(.mt-3\.5) {
  margin-top: 0;
}
</style>
