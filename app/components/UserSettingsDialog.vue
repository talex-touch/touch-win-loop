<script setup lang="ts">
import type {
  AuthUser,
  WorkspaceDisplayPreferences,
  WorkspaceMemberRole,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import {
  isUserAvatarUploadFileSupported,
  USER_AVATAR_UPLOAD_ACCEPT_ATTR,
  USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  USER_AVATAR_UPLOAD_TYPES_LABEL,
} from '~~/shared/constants/user-avatar-upload'
import { formatDateTime } from '~/composables/team-ui'
import { useUserAiUsage } from '~/composables/useUserAiUsage'
import { useUserAuthBindings } from '~/composables/useUserAuthBindings'
import { useUserSessionHistory } from '~/composables/useUserSessionHistory'
import { useUserWorkspaceMembership } from '~/composables/useUserWorkspaceMembership'
import { useUserWorkspaceOverview } from '~/composables/useUserWorkspaceOverview'
import {
  normalizeWorkspaceFontSizeDraft,
  normalizeWorkspaceTabSpacingDraft,
  useWorkspaceDisplayPreferenceApi,
  WORKSPACE_FONT_SIZE_PRESET_OPTIONS,
  WORKSPACE_TAB_SPACING_PRESET_OPTIONS,
} from '~/composables/useWorkspaceDisplayPreferences'

type UserSettingsTabId = 'profile' | 'displayPreferences' | 'overview' | 'ai' | 'members' | 'bindings' | 'loginHistory' | 'audits'
type UserSettingsNavGroupId = 'profile' | 'workspace'

interface UserSettingsTabMeta {
  id: UserSettingsTabId
  groupId: UserSettingsNavGroupId
  label: string
  icon: string
  description: string
}

const props = withDefaults(defineProps<{
  visible?: boolean
  userName?: string
  userId?: string
  userEmail?: string
  userAvatarUrl?: string
  userSubtitle?: string
  showAdminBadge?: boolean
  isPlatformAdminUser?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
  activeWorkspaceId?: string
}>(), {
  visible: false,
  userName: '未登录用户',
  userId: '',
  userEmail: '',
  userAvatarUrl: '',
  userSubtitle: '',
  showAdminBadge: false,
  isPlatformAdminUser: false,
  workspaceOptions: () => [],
  activeWorkspaceId: '',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'userUpdated': [value: AuthUser]
  'workspaceUpdated': [value: { workspaceId: string, name: string }]
}>()

const route = useRoute()
const authApiFetch = useAuthApiFetch()
const runtime = useRuntimeConfig()
const { endpoint, resolveAppUrl } = useApiEndpoint(runtime)
const {
  loadUserDefaults,
  patchUserDefaults,
} = useWorkspaceDisplayPreferenceApi()

const activeTab = ref<UserSettingsTabId>('profile')
const loggingOut = ref(false)
const logoutConfirmVisible = ref(false)
const actionError = ref('')
const userWorkspaceDisplayPreferences = ref<WorkspaceDisplayPreferences | null>(null)
const userWorkspaceDisplayLoading = ref(false)
const userWorkspaceDisplaySaving = ref(false)
const userWorkspaceDisplayError = ref('')
const userWorkspaceDisplaySuccess = ref('')
const userWorkspaceDisplayFontSizeDraft = ref<ReturnType<typeof normalizeWorkspaceFontSizeDraft>>('')
const userWorkspaceDisplayTabSpacingDraft = ref<ReturnType<typeof normalizeWorkspaceTabSpacingDraft>>('')
const avatarFileInputRef = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
const profileEditorDialogVisible = ref(false)
const avatarActionError = ref('')
const avatarActionSuccess = ref('')
let suppressTabRefresh = false

const defaultTabMeta: UserSettingsTabMeta = {
  id: 'profile',
  groupId: 'profile',
  label: '个人信息',
  icon: 'person',
  description: '查看头像、账号基础资料与编辑入口。',
}

const tabItems: UserSettingsTabMeta[] = [
  defaultTabMeta,
  { id: 'displayPreferences', groupId: 'profile', label: '显示偏好', icon: 'format_size', description: '管理个人全局默认字号与标签边距。' },
  { id: 'bindings', groupId: 'profile', label: '账号绑定', icon: 'link', description: '查看绑定摘要并跳转到独立绑定页。' },
  { id: 'loginHistory', groupId: 'profile', label: '登录历史', icon: 'schedule', description: '查看个人账号近期登录与会话状态。' },
  { id: 'audits', groupId: 'profile', label: '操作记录', icon: 'history', description: '查看最近的绑定与解绑操作。' },
  { id: 'overview', groupId: 'workspace', label: '工作空间概览', icon: 'dashboard', description: '查看当前工作空间的核心信息。' },
  { id: 'ai', groupId: 'workspace', label: 'AI 配额', icon: 'neurology', description: '查看当前工作空间的 AI credits 配额。' },
  { id: 'members', groupId: 'workspace', label: '工作空间成员', icon: 'group', description: '查看成员、待处理邀请并生成邀请链接。' },
]

const tabGroupItems: Array<{ id: UserSettingsNavGroupId, label: string }> = [
  { id: 'profile', label: '个人信息' },
  { id: 'workspace', label: '工作空间' },
]

const visibleModel = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value),
})

const tabGroups = computed(() => {
  return tabGroupItems.map(group => ({
    ...group,
    tabs: tabItems.filter(item => item.groupId === group.id),
  }))
})

const currentWorkspace = computed(() => {
  const options = props.workspaceOptions || []
  const activeWorkspaceId = String(props.activeWorkspaceId || '').trim()
  if (activeWorkspaceId) {
    const matched = options.find(item => item.workspace.id === activeWorkspaceId)
    if (matched)
      return matched
  }
  return options[0] || null
})

const currentWorkspaceQuota = computed(() => currentWorkspace.value?.quota || null)
const isPersonalWorkspace = computed(() => currentWorkspace.value?.workspace.type === 'personal')
const currentWorkspaceId = computed(() => String(currentWorkspace.value?.workspace.id || '').trim())
const currentUserId = computed(() => String(props.userId || '').trim())
const currentUserEmail = computed(() => String(props.userEmail || '').trim())
const currentUserAvatarUrl = computed(() => String(props.userAvatarUrl || '').trim())
const hasUserAvatar = computed(() => Boolean(currentUserAvatarUrl.value))

function resolvePrimaryRole(roles: WorkspaceMemberRole[] | null | undefined): WorkspaceMemberRole | '' {
  const rolePriority: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'member']
  const normalizedRoles = Array.isArray(roles) ? roles : []
  return rolePriority.find(role => normalizedRoles.includes(role)) || ''
}

function formatWorkspaceRoleLabel(role: string | null | undefined): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'admin')
    return '管理员'
  if (role === 'manager')
    return '协作管理员'
  if (role === 'member')
    return '成员'
  return '未分配'
}

function resolveInitial(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return 'U'
  return normalized.slice(0, 1).toUpperCase()
}

const workspacePrimaryRole = computed<WorkspaceMemberRole | ''>(() => resolvePrimaryRole(currentWorkspace.value?.workspace.roles))

const userIdentityItems = computed(() => {
  const items: Array<{ key: string, value: string, mono?: boolean }> = []
  if (currentUserId.value) {
    items.push({
      key: 'id',
      value: currentUserId.value,
      mono: true,
    })
  }
  if (currentUserEmail.value) {
    items.push({
      key: 'email',
      value: currentUserEmail.value,
    })
  }
  return items
})

const userInitial = computed(() => resolveInitial(props.userName))

function syncUserWorkspaceDisplayPreferenceDrafts(preferences: WorkspaceDisplayPreferences | null): void {
  userWorkspaceDisplayPreferences.value = preferences
  userWorkspaceDisplayFontSizeDraft.value = normalizeWorkspaceFontSizeDraft(preferences?.fontSizePreset)
  userWorkspaceDisplayTabSpacingDraft.value = normalizeWorkspaceTabSpacingDraft(preferences?.tabSpacingPreset)
}

async function loadUserWorkspaceDisplayPreferences(): Promise<void> {
  userWorkspaceDisplayLoading.value = true
  userWorkspaceDisplayError.value = ''
  userWorkspaceDisplaySuccess.value = ''
  try {
    const preferences = await loadUserDefaults()
    syncUserWorkspaceDisplayPreferenceDrafts(preferences)
  }
  catch (error: any) {
    userWorkspaceDisplayError.value = String(error?.message || '个人显示偏好加载失败，请稍后重试。')
  }
  finally {
    userWorkspaceDisplayLoading.value = false
  }
}

async function saveUserWorkspaceDisplayPreferences(): Promise<void> {
  userWorkspaceDisplaySaving.value = true
  userWorkspaceDisplayError.value = ''
  userWorkspaceDisplaySuccess.value = ''
  try {
    const preferences = await patchUserDefaults({
      fontSizePreset: userWorkspaceDisplayFontSizeDraft.value || null,
      tabSpacingPreset: userWorkspaceDisplayTabSpacingDraft.value || null,
    })
    syncUserWorkspaceDisplayPreferenceDrafts(preferences)
    userWorkspaceDisplaySuccess.value = '显示偏好已保存。'
  }
  catch (error: any) {
    userWorkspaceDisplayError.value = String(error?.message || '个人显示偏好保存失败，请稍后重试。')
  }
  finally {
    userWorkspaceDisplaySaving.value = false
  }
}

function resolveWorkspaceInvitationUrl(token: string): string {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken)
    return ''
  return resolveAppUrl(`/invite/${encodeURIComponent(normalizedToken)}`)
}

const {
  workspaceBillingEstimate,
  workspaceNameEditing,
  workspaceNameDraft,
  workspaceNameSaving,
  workspaceNameError,
  workspaceNameSuccess,
  workspaceCopyFeedback,
  seatSummaryText,
  seatDetailText,
  quotaResetCycleText,
  quotaUpdatedAtText,
  workspacePlanTierLabel,
  workspaceTypeDetailText,
  workspaceTypeActionLabel,
  workspaceTypeActionHint,
  canRenameCurrentWorkspace,
  canSubmitWorkspaceName,
  openWorkspaceNameEditor,
  cancelWorkspaceNameEdit,
  copyWorkspaceId,
  loadWorkspaceBillingEstimate,
  saveWorkspaceName,
  resetWorkspaceOverviewState,
} = useUserWorkspaceOverview({
  authApiFetch,
  currentWorkspace,
  currentWorkspaceId,
  currentWorkspaceQuota,
  isPersonalWorkspace,
  workspacePrimaryRole,
  isPlatformAdminUser: props.isPlatformAdminUser,
  emitWorkspaceUpdated: payload => emit('workspaceUpdated', payload),
})

const {
  aiUsage,
  aiUsageLoading,
  aiUsageError,
  aiUsagePage,
  aiQuotaHeadlineText,
  aiQuotaUsageText,
  aiQuotaUsedCount,
  aiQuotaRemainingCount,
  aiUsageMemberSummaries,
  aiUsageHistoryItems,
  aiUsageTotalPages,
  formatAiRouteLabel,
  resolveMemberUsagePercent,
  resolveMemberUsageBarStyle,
  loadWorkspaceAiUsage,
  changeAiUsagePage,
  resetAiUsageState,
} = useUserAiUsage({
  authApiFetch,
  currentWorkspaceQuota,
  currentWorkspaceId,
  workspaceBillingEstimate: computed(() => workspaceBillingEstimate.value),
})

const {
  workspaceMembers,
  workspaceInvitations,
  workspaceMemberLoading,
  workspaceMemberError,
  workspaceMemberActionError,
  workspaceMemberActionSuccess,
  workspaceMemberRoleDrafts,
  workspaceMemberRoleSubmittingUserId,
  workspaceInvitationDialogVisible,
  workspaceInvitationSubmitting,
  workspaceInvitationRevokingId,
  workspaceInvitationError,
  workspaceInvitationSuccess,
  workspaceInvitationLink,
  workspaceInviteeUsername,
  workspaceInviteRole,
  workspaceInviteExpiresInDays,
  workspaceInvitationCopyFeedback,
  memberSummaryText,
  inviteRoleOptions,
  editableRoleOptions,
  canInviteWorkspaceMembers,
  workspaceInvitationRoleHint,
  resolveMemberRoleLabel,
  isRoleEditorVisible,
  canSubmitRoleChange,
  resolveInvitationStatusLabel,
  updateWorkspaceMemberRoleDraft,
  loadWorkspaceMemberManagement,
  openWorkspaceInvitationDialog,
  closeWorkspaceInvitationDialog,
  createWorkspaceInvitation,
  copyWorkspaceInvitationLink,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  resetWorkspaceMembershipState,
} = useUserWorkspaceMembership({
  authApiFetch,
  currentWorkspace,
  currentWorkspaceId,
  currentUserId,
  isPersonalWorkspace,
  workspacePrimaryRole,
  isPlatformAdminUser: props.isPlatformAdminUser,
  resolveWorkspaceInvitationUrl,
  formatWorkspaceRoleLabel,
})

const {
  authSessions,
  authSessionsLoading,
  authSessionsError,
  formatSessionStatusLabel,
  resolveSessionStatusClass,
  loadAuthSessions,
  resetAuthSessionState,
} = useUserSessionHistory({
  authApiFetch,
})

const {
  feishuBindLoading,
  feishuAuditLoading,
  feishuBindError,
  feishuBindStatus,
  oauthEnabled,
  oauthDisplayName,
  oauthBindLoading,
  oauthBindError,
  oauthBindStatus,
  feishuAudits,
  formatAuditAction,
  loadAuthMeta,
  loadFeishuBindStatus,
  loadOauthBindStatus,
  loadFeishuAudits,
  resetAuthBindingState,
} = useUserAuthBindings({
  authApiFetch,
  endpoint,
  route,
})

function selectTab(tabId: UserSettingsTabId) {
  if (activeTab.value === tabId) {
    if (props.visible)
      void refreshActiveTabData(tabId, { resetAiPage: tabId === 'ai' })
    return
  }
  activeTab.value = tabId
}

function clearAvatarActionFeedback() {
  avatarActionError.value = ''
  avatarActionSuccess.value = ''
}

function openProfileEditorDialog() {
  clearAvatarActionFeedback()
  profileEditorDialogVisible.value = true
}

function closeProfileEditorDialog() {
  if (avatarUploading.value)
    return
  profileEditorDialogVisible.value = false
}

function openLogoutConfirm() {
  if (loggingOut.value)
    return
  logoutConfirmVisible.value = true
}

function closeLogoutConfirm() {
  if (loggingOut.value)
    return
  logoutConfirmVisible.value = false
}

function triggerAvatarUpload() {
  if (avatarUploading.value)
    return
  avatarFileInputRef.value?.click()
}

async function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file)
    return

  clearAvatarActionFeedback()
  const normalizedFileName = String(file.name || '').trim()
  if (!isUserAvatarUploadFileSupported(normalizedFileName)) {
    avatarActionError.value = `头像格式不支持，支持格式：${USER_AVATAR_UPLOAD_TYPES_LABEL}。`
    if (input)
      input.value = ''
    return
  }

  if (file.size > USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
    avatarActionError.value = `头像文件过大，单文件上限 ${formatFileSize(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES)}。`
    if (input)
      input.value = ''
    return
  }

  avatarUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file, normalizedFileName)
    const response = await authApiFetch<{ data: AuthUser }>('/auth/avatar', {
      method: 'POST',
      body: formData,
    })
    emit('userUpdated', response.data)
    avatarActionSuccess.value = '头像已更新。'
  }
  catch (error: any) {
    avatarActionError.value = String(error?.data?.message || '头像上传失败，请稍后重试。')
  }
  finally {
    avatarUploading.value = false
    if (input)
      input.value = ''
  }
}

async function openWorkspaceBillingConsole(errorMessage: string) {
  actionError.value = ''
  if (props.isPlatformAdminUser || (route.path.startsWith('/admin') && props.showAdminBadge)) {
    visibleModel.value = false
    await navigateTo('/admin/billing')
    return
  }
  actionError.value = errorMessage
}

async function handleAiQuotaAction() {
  await openWorkspaceBillingConsole('当前版本请联系管理员调整 AI 配额。')
}

async function handleWorkspaceTypeAction() {
  await openWorkspaceBillingConsole('当前版本请联系管理员升级工作空间类型。')
}

function closeDialog() {
  if (loggingOut.value)
    return
  logoutConfirmVisible.value = false
  profileEditorDialogVisible.value = false
  visibleModel.value = false
}

function openAuthBindPage() {
  visibleModel.value = false
  void navigateTo('/auth/bind')
}

function resetDialogState() {
  activeTab.value = 'profile'
  actionError.value = ''
  userWorkspaceDisplayPreferences.value = null
  userWorkspaceDisplayLoading.value = false
  userWorkspaceDisplaySaving.value = false
  userWorkspaceDisplayError.value = ''
  userWorkspaceDisplaySuccess.value = ''
  userWorkspaceDisplayFontSizeDraft.value = ''
  userWorkspaceDisplayTabSpacingDraft.value = ''
  avatarUploading.value = false
  logoutConfirmVisible.value = false
  profileEditorDialogVisible.value = false
  clearAvatarActionFeedback()
  resetWorkspaceOverviewState()
  resetAiUsageState()
  resetWorkspaceMembershipState()
  resetAuthSessionState()
  resetAuthBindingState()
}

async function refreshActiveTabData(tabId: UserSettingsTabId, options: { resetAiPage?: boolean } = {}) {
  const workspaceId = currentWorkspaceId.value
  if (tabId === 'profile') {
    await Promise.allSettled([
      loadAuthMeta(),
      loadFeishuBindStatus(),
      loadOauthBindStatus(),
    ])
    return
  }

  if (tabId === 'displayPreferences') {
    await Promise.allSettled([
      loadUserWorkspaceDisplayPreferences(),
    ])
    return
  }

  if (tabId === 'overview') {
    await Promise.allSettled([
      loadWorkspaceBillingEstimate(workspaceId),
    ])
    return
  }

  if (tabId === 'ai') {
    const nextPage = options.resetAiPage ? 1 : aiUsagePage.value
    if (options.resetAiPage)
      aiUsagePage.value = 1
    await Promise.allSettled([
      loadWorkspaceBillingEstimate(workspaceId),
      loadWorkspaceAiUsage(workspaceId, nextPage),
    ])
    return
  }

  if (tabId === 'members') {
    await Promise.allSettled([
      loadWorkspaceMemberManagement(workspaceId),
    ])
    return
  }

  if (tabId === 'bindings') {
    await Promise.allSettled([
      loadAuthMeta(),
      loadFeishuBindStatus(),
      loadOauthBindStatus(),
    ])
    return
  }

  if (tabId === 'loginHistory') {
    await Promise.allSettled([
      loadAuthSessions(),
    ])
    return
  }

  await Promise.allSettled([
    loadFeishuAudits(),
  ])
}

async function confirmLogout() {
  loggingOut.value = true
  actionError.value = ''
  try {
    logoutConfirmVisible.value = false
    await authApiFetch('/auth/logout', {
      method: 'POST',
    })
    visibleModel.value = false
    await navigateTo('/login')
  }
  catch (error: any) {
    actionError.value = String(error?.data?.message || '退出失败，请稍后重试。')
  }
  finally {
    loggingOut.value = false
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      logoutConfirmVisible.value = false
      profileEditorDialogVisible.value = false
      workspaceInvitationDialogVisible.value = false
      return
    }

    suppressTabRefresh = true
    resetDialogState()
    suppressTabRefresh = false

    void Promise.allSettled([
      loadAuthMeta(),
      loadFeishuBindStatus(),
      loadOauthBindStatus(),
      loadFeishuAudits(),
      loadAuthSessions(),
    ])
    void refreshActiveTabData(activeTab.value, { resetAiPage: true })
  },
)

watch(
  () => route.fullPath,
  () => {
    if (!props.visible)
      return
    resetAuthBindingState()
  },
)

watch(activeTab, (tabId, previousTabId) => {
  if (!props.visible || suppressTabRefresh || tabId === previousTabId)
    return
  if (tabId !== 'members')
    workspaceInvitationDialogVisible.value = false
  void refreshActiveTabData(tabId, { resetAiPage: tabId === 'ai' })
})

watch(currentWorkspaceId, (workspaceId, previousWorkspaceId) => {
  if (!props.visible || workspaceId === previousWorkspaceId)
    return
  resetWorkspaceOverviewState()
  resetAiUsageState()
  resetWorkspaceMembershipState()
  void refreshActiveTabData(activeTab.value, { resetAiPage: activeTab.value === 'ai' })
})
</script>

<template>
  <UserSettingsShell
    :visible="props.visible"
    :active-tab="activeTab"
    :tab-groups="tabGroups"
    :close-disabled="loggingOut"
    @close="closeDialog"
    @select-tab="selectTab($event as UserSettingsTabId)"
  >
    <input
      ref="avatarFileInputRef"
      type="file"
      class="sr-only"
      :accept="USER_AVATAR_UPLOAD_ACCEPT_ATTR"
      @change="handleAvatarFileChange"
    >

    <UserSettingsProfilePanel
      v-if="activeTab === 'profile'"
      :user-name="props.userName"
      :has-user-avatar="hasUserAvatar"
      :user-avatar-url="currentUserAvatarUrl"
      :user-initial="userInitial"
      :user-identity-items="userIdentityItems"
      :logging-out="loggingOut"
      @open-logout-confirm="openLogoutConfirm"
      @open-profile-editor-dialog="openProfileEditorDialog"
    />

    <section
      v-else-if="activeTab === 'displayPreferences'"
      data-testid="user-settings-display-preferences-panel"
      class="user-settings-display-preferences-tab space-y-4"
    >
      <div class="p-5 border border-slate-200 rounded-2xl bg-white">
        <div class="flex gap-3 items-start justify-between">
          <div>
            <div class="text-sm text-slate-800 font-semibold">
              个人全局显示偏好
            </div>
            <p class="text-xs text-slate-500 mt-1">
              系统默认固定为 默认字号 / 默认间距
            </p>
          </div>
          <button
            class="text-xs text-slate-500 font-semibold"
            type="button"
            :disabled="userWorkspaceDisplayLoading"
            @click="loadUserWorkspaceDisplayPreferences"
          >
            刷新
          </button>
        </div>

        <div class="mt-4 gap-4 grid md:grid-cols-2">
          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-semibold">默认字号</span>
            <select
              :value="userWorkspaceDisplayFontSizeDraft"
              data-testid="user-settings-display-font-size-select"
              class="text-xs px-3 outline-none border border-slate-200 rounded-xl bg-white h-10 w-full focus:border-blue-500"
              @change="userWorkspaceDisplayFontSizeDraft = normalizeWorkspaceFontSizeDraft(($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                跟随系统默认
              </option>
              <option v-for="option in WORKSPACE_FONT_SIZE_PRESET_OPTIONS" :key="`user-settings-font-size-${option.value}`" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-semibold">默认标签边距</span>
            <select
              :value="userWorkspaceDisplayTabSpacingDraft"
              data-testid="user-settings-display-tab-spacing-select"
              class="text-xs px-3 outline-none border border-slate-200 rounded-xl bg-white h-10 w-full focus:border-blue-500"
              @change="userWorkspaceDisplayTabSpacingDraft = normalizeWorkspaceTabSpacingDraft(($event.target as HTMLSelectElement).value)"
            >
              <option value="">
                跟随系统默认
              </option>
              <option v-for="option in WORKSPACE_TAB_SPACING_PRESET_OPTIONS" :key="`user-settings-tab-spacing-${option.value}`" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <p v-if="userWorkspaceDisplayError" class="user-settings-feedback user-settings-feedback--danger mt-4">
          {{ userWorkspaceDisplayError }}
        </p>
        <p v-else-if="userWorkspaceDisplaySuccess" class="user-settings-feedback mt-4">
          {{ userWorkspaceDisplaySuccess }}
        </p>

        <div class="mt-4 flex justify-end">
          <button
            class="text-xs text-white font-semibold px-4 py-2 rounded-xl bg-slate-900 inline-flex transition-colors items-center hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            :disabled="userWorkspaceDisplayLoading || userWorkspaceDisplaySaving"
            @click="saveUserWorkspaceDisplayPreferences"
          >
            保存显示偏好
          </button>
        </div>
      </div>
    </section>

    <UserSettingsWorkspaceOverviewPanel
      v-else-if="activeTab === 'overview'"
      :current-workspace="currentWorkspace"
      :workspace-copy-feedback="workspaceCopyFeedback"
      :workspace-name-editing="workspaceNameEditing"
      :workspace-name-draft="workspaceNameDraft"
      :workspace-name-saving="workspaceNameSaving"
      :workspace-name-error="workspaceNameError"
      :workspace-name-success="workspaceNameSuccess"
      :can-submit-workspace-name="canSubmitWorkspaceName"
      :can-rename-current-workspace="canRenameCurrentWorkspace"
      :workspace-plan-tier-label="workspacePlanTierLabel"
      :workspace-type-detail-text="workspaceTypeDetailText"
      :workspace-type-action-label="workspaceTypeActionLabel"
      :workspace-type-action-hint="workspaceTypeActionHint"
      :seat-summary-text="seatSummaryText"
      :quota-reset-cycle-text="quotaResetCycleText"
      :seat-detail-text="seatDetailText"
      :can-invite-workspace-members="canInviteWorkspaceMembers"
      :quota-updated-at-text="quotaUpdatedAtText"
      @copy-workspace-id="copyWorkspaceId"
      @update-workspace-name-draft="workspaceNameDraft = $event"
      @cancel-workspace-name-edit="cancelWorkspaceNameEdit"
      @save-workspace-name="saveWorkspaceName"
      @open-workspace-name-editor="openWorkspaceNameEditor"
      @handle-workspace-type-action="handleWorkspaceTypeAction"
      @select-members-tab="selectTab('members')"
      @open-workspace-invitation-dialog="openWorkspaceInvitationDialog"
    />

    <UserSettingsAiUsagePanel
      v-else-if="activeTab === 'ai'"
      :current-workspace="currentWorkspace"
      :ai-quota-headline-text="aiQuotaHeadlineText"
      :ai-quota-usage-text="aiQuotaUsageText"
      :ai-quota-used-count="aiQuotaUsedCount"
      :ai-quota-remaining-count="aiQuotaRemainingCount"
      :quota-reset-cycle-text="quotaResetCycleText"
      :quota-updated-at-text="quotaUpdatedAtText"
      :ai-usage="aiUsage"
      :ai-usage-error="aiUsageError"
      :ai-usage-loading="aiUsageLoading"
      :ai-usage-page="aiUsagePage"
      :ai-usage-total-pages="aiUsageTotalPages"
      :ai-usage-member-summaries="aiUsageMemberSummaries"
      :ai-usage-history-items="aiUsageHistoryItems"
      :resolve-initial="resolveInitial"
      :resolve-member-usage-percent="resolveMemberUsagePercent"
      :resolve-member-usage-bar-style="resolveMemberUsageBarStyle"
      :format-ai-route-label="formatAiRouteLabel"
      :format-date-time="formatDateTime"
      @handle-ai-quota-action="handleAiQuotaAction"
      @change-ai-usage-page="changeAiUsagePage"
    />

    <UserSettingsMembersPanel
      v-else-if="activeTab === 'members'"
      :current-workspace="currentWorkspace"
      :member-summary-text="memberSummaryText"
      :can-invite-workspace-members="canInviteWorkspaceMembers"
      :workspace-member-loading="workspaceMemberLoading"
      :workspace-member-error="workspaceMemberError"
      :workspace-member-action-error="workspaceMemberActionError"
      :workspace-member-action-success="workspaceMemberActionSuccess"
      :workspace-members="workspaceMembers"
      :workspace-invitations="workspaceInvitations"
      :workspace-member-role-drafts="workspaceMemberRoleDrafts"
      :workspace-member-role-submitting-user-id="workspaceMemberRoleSubmittingUserId"
      :workspace-invitation-revoking-id="workspaceInvitationRevokingId"
      :editable-role-options="editableRoleOptions"
      :resolve-initial="resolveInitial"
      :format-date-time="formatDateTime"
      :resolve-member-role-label="resolveMemberRoleLabel"
      :format-workspace-role-label="formatWorkspaceRoleLabel"
      :resolve-invitation-status-label="resolveInvitationStatusLabel"
      :is-role-editor-visible="isRoleEditorVisible"
      :can-submit-role-change="canSubmitRoleChange"
      @open-workspace-invitation-dialog="openWorkspaceInvitationDialog"
      @update-workspace-member-role-draft="updateWorkspaceMemberRoleDraft($event.userId, $event.role)"
      @update-workspace-member-role="updateWorkspaceMemberRole"
      @revoke-workspace-invitation="revokeWorkspaceInvitation"
    />

    <UserSettingsBindingsPanel
      v-else-if="activeTab === 'bindings'"
      :feishu-bind-status="feishuBindStatus"
      :feishu-bind-loading="feishuBindLoading"
      :feishu-bind-error="feishuBindError"
      :oauth-bind-status="oauthBindStatus"
      :oauth-bind-loading="oauthBindLoading"
      :oauth-bind-error="oauthBindError"
      :oauth-enabled="oauthEnabled"
      :oauth-display-name="oauthDisplayName"
      :format-date-time="formatDateTime"
      @open-bind-page="openAuthBindPage"
    />

    <UserSettingsLoginHistoryPanel
      v-else-if="activeTab === 'loginHistory'"
      :auth-sessions="authSessions"
      :auth-sessions-loading="authSessionsLoading"
      :auth-sessions-error="authSessionsError"
      :format-date-time="formatDateTime"
      :resolve-session-status-class="resolveSessionStatusClass"
      :format-session-status-label="formatSessionStatusLabel"
    />

    <UserSettingsAuditPanel
      v-else
      :feishu-audits="feishuAudits"
      :feishu-audit-loading="feishuAuditLoading"
      :format-audit-action="formatAuditAction"
      :format-date-time="formatDateTime"
      @load-feishu-audits="loadFeishuAudits"
    />

    <p v-if="actionError" class="user-settings-feedback user-settings-feedback--danger mt-4">
      {{ actionError }}
    </p>
  </UserSettingsShell>

  <div
    v-if="profileEditorDialogVisible"
    class="p-4 bg-slate-950/35 flex items-center inset-0 justify-center fixed z-[60]"
    @click.self="closeProfileEditorDialog"
  >
    <div class="p-5 border border-slate-200 rounded-[24px] bg-white max-w-[460px] w-full shadow-2xl sm:p-6">
      <div class="flex gap-4 items-start justify-between">
        <div>
          <p class="text-xl text-slate-900 font-semibold">
            编辑资料
          </p>
          <p class="text-sm text-slate-500 mt-2">
            当前仅支持修改头像，用户名暂不支持编辑。
          </p>
        </div>
        <button
          class="text-slate-500 rounded-full flex h-9 w-9 transition items-center justify-center hover:text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="avatarUploading"
          @click="closeProfileEditorDialog"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div class="user-settings-profile-editor">
        <div class="user-settings-profile-editor__preview">
          <div class="user-settings-avatar user-settings-avatar--editor">
            <img
              v-if="hasUserAvatar"
              :src="currentUserAvatarUrl"
              alt="头像预览"
              class="user-settings-avatar__image"
            >
            <span v-else>{{ userInitial }}</span>
          </div>
          <div class="min-w-0">
            <p class="text-base text-slate-900 font-semibold">
              {{ props.userName }}
            </p>
            <div class="user-settings-identity-list mt-2">
              <p
                v-for="item in userIdentityItems"
                :key="`editor-${item.key}`"
                class="user-settings-identity-item"
              >
                <span
                  class="user-settings-identity-item__value"
                  :class="{ 'user-settings-identity-item__value--mono': item.mono }"
                >
                  {{ item.value }}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div class="user-settings-profile-editor__hint">
          <p class="text-sm text-slate-600">
            支持 {{ USER_AVATAR_UPLOAD_TYPES_LABEL }}，单文件上限 {{ formatFileSize(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) }}。
          </p>
          <p class="text-sm text-slate-500">
            上传后立即生效，并同步刷新当前设置面板与外层用户卡片。
          </p>
        </div>

        <div class="user-settings-profile-editor__actions">
          <button
            class="user-settings-btn user-settings-btn--primary"
            :disabled="avatarUploading"
            @click="triggerAvatarUpload"
          >
            {{ avatarUploading ? '上传中...' : '选择头像' }}
          </button>
        </div>

        <p v-if="avatarActionError" class="user-settings-feedback user-settings-feedback--danger">
          {{ avatarActionError }}
        </p>
        <p v-if="avatarActionSuccess" class="user-settings-feedback user-settings-feedback--success">
          {{ avatarActionSuccess }}
        </p>
      </div>
    </div>
  </div>

  <div
    v-if="logoutConfirmVisible"
    class="p-4 bg-slate-950/35 flex items-center inset-0 justify-center fixed z-[60]"
    @click.self="closeLogoutConfirm"
  >
    <div class="p-5 border border-slate-200 rounded-[24px] bg-white max-w-[400px] w-full shadow-2xl sm:p-6">
      <div class="flex gap-4 items-start justify-between">
        <div>
          <p class="text-xl text-slate-900 font-semibold">
            确认退出登录
          </p>
          <p class="text-sm text-slate-500 mt-2">
            退出后将返回登录页，当前会话会立即失效。
          </p>
        </div>
        <button
          class="text-slate-500 rounded-full flex h-9 w-9 transition items-center justify-center hover:text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="loggingOut"
          @click="closeLogoutConfirm"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div class="mt-6 flex flex-wrap gap-2 items-center justify-end">
        <button class="user-settings-btn" :disabled="loggingOut" @click="closeLogoutConfirm">
          取消
        </button>
        <button class="user-settings-btn user-settings-btn--danger" :disabled="loggingOut" @click="confirmLogout">
          {{ loggingOut ? '退出中...' : '确认退出' }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="workspaceInvitationDialogVisible"
    class="p-4 bg-slate-950/35 flex items-center inset-0 justify-center fixed z-[60]"
    @click.self="closeWorkspaceInvitationDialog"
  >
    <div class="p-5 border border-slate-200 rounded-[24px] bg-white max-w-[560px] w-full shadow-2xl sm:p-6">
      <div class="flex gap-4 items-start justify-between">
        <div>
          <p class="text-xl text-slate-900 font-semibold">
            发起邀请
          </p>
          <p class="text-sm text-slate-500 mt-2">
            {{ workspaceInvitationRoleHint }}
          </p>
        </div>
        <button
          class="text-slate-500 rounded-full flex h-9 w-9 transition items-center justify-center hover:text-slate-800 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="workspaceInvitationSubmitting"
          @click="closeWorkspaceInvitationDialog"
        >
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div class="mt-5 gap-4 grid">
        <label class="user-settings-field">
          <span class="user-settings-field__label">指定用户名</span>
          <input
            v-model="workspaceInviteeUsername"
            type="text"
            class="user-settings-input"
            placeholder="可选，留空则生成可多人加入的通用邀请"
            :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
          >
        </label>

        <div class="gap-4 grid sm:grid-cols-2">
          <label class="user-settings-field">
            <span class="user-settings-field__label">空间角色</span>
            <select
              v-model="workspaceInviteRole"
              class="user-settings-select"
              :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
            >
              <option
                v-for="option in inviteRoleOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="user-settings-field">
            <span class="user-settings-field__label">有效期</span>
            <select
              v-model="workspaceInviteExpiresInDays"
              class="user-settings-select"
              :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
            >
              <option :value="3">
                3 天
              </option>
              <option :value="7">
                7 天
              </option>
              <option :value="14">
                14 天
              </option>
              <option :value="30">
                30 天
              </option>
            </select>
          </label>
        </div>
      </div>

      <p v-if="workspaceInvitationError" class="user-settings-feedback user-settings-feedback--danger mt-4">
        {{ workspaceInvitationError }}
      </p>
      <p v-if="workspaceInvitationSuccess" class="user-settings-feedback user-settings-feedback--success mt-4">
        {{ workspaceInvitationSuccess }}
      </p>

      <div v-if="workspaceInvitationLink" class="user-settings-link-card mt-4">
        <div class="flex gap-3 items-start justify-between">
          <div class="min-w-0">
            <p class="text-sm text-slate-900 font-medium">
              最新邀请链接
            </p>
            <p class="text-xs text-slate-500 mt-1 break-all">
              {{ workspaceInvitationLink }}
            </p>
          </div>
          <button class="user-settings-icon-btn shrink-0" title="复制邀请链接" @click="copyWorkspaceInvitationLink">
            <span class="material-symbols-outlined text-[16px]">content_copy</span>
          </button>
        </div>
        <p v-if="workspaceInvitationCopyFeedback" class="text-xs text-slate-500 mt-2">
          {{ workspaceInvitationCopyFeedback }}
        </p>
      </div>

      <div class="mt-5 flex flex-wrap gap-2 justify-end">
        <button class="user-settings-btn" :disabled="workspaceInvitationSubmitting" @click="closeWorkspaceInvitationDialog">
          关闭
        </button>
        <button
          class="user-settings-btn user-settings-btn--primary"
          :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
          @click="createWorkspaceInvitation"
        >
          {{ workspaceInvitationSubmitting ? '生成中...' : '生成邀请链接' }}
        </button>
      </div>
    </div>
  </div>
</template>
