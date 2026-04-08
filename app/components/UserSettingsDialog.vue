<script setup lang="ts">
import type {
  ApiResponse,
  AuthLoginMeta,
  AuthSessionHistoryItem,
  AuthUser,
  CasdoorAuthBindStatus,
  FeishuAuthAuditItem,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuIntegrationConfig,
  InvitationWithToken,
  WorkspaceAiUsageHistory,
  WorkspaceBillingEstimate,
  WorkspaceMemberManagementSnapshot,
  WorkspaceMemberRole,
  WorkspaceMemberSummary,
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

type UserSettingsTabId = 'profile' | 'overview' | 'ai' | 'members' | 'bindings' | 'loginHistory' | 'audits'
type UserSettingsNavGroupId = 'profile' | 'workspace'
type EditableWorkspaceRole = 'admin' | 'manager' | 'member'

const props = withDefaults(defineProps<{
  visible?: boolean
  userName?: string
  userAvatarUrl?: string
  userSubtitle?: string
  showAdminBadge?: boolean
  isPlatformAdminUser?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
  activeWorkspaceId?: string
}>(), {
  visible: false,
  userName: '未登录用户',
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

const activeTab = ref<UserSettingsTabId>('profile')
const loggingOut = ref(false)
const actionError = ref('')
const avatarFileInputRef = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
const profileEditorDialogVisible = ref(false)
const avatarActionError = ref('')
const avatarActionSuccess = ref('')
const feishuBindLoading = ref(false)
const feishuBindRedirecting = ref(false)
const feishuUnbinding = ref(false)
const feishuUnbindConfirmVisible = ref(false)
const feishuUnbindConfirmText = ref('')
const feishuAuditLoading = ref(false)
const feishuBindError = ref('')
const feishuBindSuccess = ref('')
const feishuBindStatus = ref<FeishuAuthBindStatus | null>(null)
const feishuMeta = ref<FeishuIntegrationConfig | null>(null)
const feishuAudits = ref<FeishuAuthAuditItem[]>([])
const casdoorEnabled = ref(false)
const casdoorBindLoading = ref(false)
const casdoorBindRedirecting = ref(false)
const casdoorBindError = ref('')
const casdoorBindStatus = ref<CasdoorAuthBindStatus | null>(null)
const workspaceBillingEstimate = ref<WorkspaceBillingEstimate | null>(null)
const aiUsage = ref<WorkspaceAiUsageHistory | null>(null)
const aiUsageLoading = ref(false)
const aiUsageError = ref('')
const aiUsagePage = ref(1)
const workspaceMembers = ref<WorkspaceMemberSummary[]>([])
const workspaceInvitations = ref<WorkspaceMemberManagementSnapshot['invitations']>([])
const workspaceMemberLoading = ref(false)
const workspaceMemberError = ref('')
const workspaceMemberActionError = ref('')
const workspaceMemberActionSuccess = ref('')
const workspaceMemberRoleDrafts = ref<Record<string, EditableWorkspaceRole>>({})
const workspaceMemberRoleSubmittingUserId = ref('')
const workspaceInvitationDialogVisible = ref(false)
const workspaceInvitationSubmitting = ref(false)
const workspaceInvitationRevokingId = ref('')
const workspaceInvitationError = ref('')
const workspaceInvitationSuccess = ref('')
const workspaceInvitationLink = ref('')
const workspaceInviteeUsername = ref('')
const workspaceInviteRole = ref<WorkspaceMemberRole>('member')
const workspaceInviteExpiresInDays = ref(7)
const authSessions = ref<AuthSessionHistoryItem[]>([])
const authSessionsLoading = ref(false)
const authSessionsError = ref('')
const workspaceNameEditing = ref(false)
const workspaceNameDraft = ref('')
const workspaceNameSaving = ref(false)
const workspaceNameError = ref('')
const workspaceNameSuccess = ref('')
const workspaceCopyFeedback = ref('')
const workspaceInvitationCopyFeedback = ref('')
let workspaceCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
let workspaceInvitationCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
let workspaceBillingEstimateSeq = 0
let workspaceMemberSnapshotSeq = 0
let workspaceAiUsageSeq = 0
let suppressTabRefresh = false

interface UserSettingsTabMeta {
  id: UserSettingsTabId
  groupId: UserSettingsNavGroupId
  label: string
  icon: string
  description: string
}

const defaultTabMeta: UserSettingsTabMeta = {
  id: 'profile',
  groupId: 'profile',
  label: '个人信息',
  icon: 'person',
  description: '查看头像、当前账号与绑定摘要。',
}

const tabItems: UserSettingsTabMeta[] = [
  defaultTabMeta,
  { id: 'bindings', groupId: 'profile', label: '账号绑定', icon: 'link', description: '管理飞书和 Casdoor 身份绑定。' },
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

const rolePriority: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'member']

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
const currentUserAvatarUrl = computed(() => String(props.userAvatarUrl || '').trim())
const hasUserAvatar = computed(() => Boolean(currentUserAvatarUrl.value))

function resolvePrimaryRole(roles: WorkspaceMemberRole[] | null | undefined): WorkspaceMemberRole | '' {
  const normalizedRoles = Array.isArray(roles) ? roles : []
  return rolePriority.find(role => normalizedRoles.includes(role)) || ''
}

function formatWorkspaceRoleLabel(role: WorkspaceMemberRole | ''): string {
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

function normalizeEditableRole(role: WorkspaceMemberRole | ''): EditableWorkspaceRole {
  if (role === 'admin')
    return 'admin'
  if (role === 'manager')
    return 'manager'
  return 'member'
}

function resolveInitial(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return 'U'
  return normalized.slice(0, 1).toUpperCase()
}

function formatResetCycleLabel(cycle: string | null | undefined): string {
  if (cycle === 'quarterly')
    return '每季度'
  if (cycle === 'yearly')
    return '每年'
  return '每月'
}

function formatAiRouteLabel(routeValue: string | null | undefined): string {
  const normalized = String(routeValue || '').trim()
  const routeLabelMap: Record<string, string> = {
    '/api/ai/project-chat': '项目对话',
    '/api/ai/workspace/stream': '工作空间助手',
    '/api/ai/topic-proposal': '选题生成',
    '/api/ai/contest-filter': '赛事筛选',
    '/api/ai/defense/stream': '答辩助手',
    '/api/admin/ai/stream': '后台 AI 流式助手',
    '/api/admin/ai/run': '后台 AI 任务',
  }

  if (routeLabelMap[normalized])
    return routeLabelMap[normalized]

  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || '未知来源'
}

const workspacePrimaryRole = computed<WorkspaceMemberRole | ''>(() => resolvePrimaryRole(currentWorkspace.value?.workspace.roles))

const workspaceProjectSeatLimit = computed(() => {
  if (workspaceBillingEstimate.value?.defaultProjectSeatLimit)
    return workspaceBillingEstimate.value.defaultProjectSeatLimit
  return 15
})

const seatCapacity = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return Math.max(quota.seatLimit, quota.seatUsed)

  const estimate = workspaceBillingEstimate.value
  if (estimate)
    return Math.max(estimate.includedSeats, estimate.seatUsed)

  return 0
})

const seatRemaining = computed(() => {
  const seatUsed = currentWorkspaceQuota.value?.seatUsed ?? workspaceBillingEstimate.value?.seatUsed ?? 0
  return Math.max(0, seatCapacity.value - seatUsed)
})

const seatSummaryText = computed(() => {
  const seatUsed = currentWorkspaceQuota.value?.seatUsed ?? workspaceBillingEstimate.value?.seatUsed ?? 0
  return seatCapacity.value ? `${seatUsed}/${seatCapacity.value}` : '未配置'
})

const seatDetailText = computed(() => {
  if (!seatCapacity.value)
    return '当前工作空间暂未配置成员席位信息。'
  if (isPersonalWorkspace.value)
    return `这里指当前工作空间可容纳的协作成员席位；个人空间最多邀请 ${seatCapacity.value} 人协作，每个项目最多 ${workspaceProjectSeatLimit.value} 人。`
  return `这里指当前工作空间可容纳的协作成员席位；剩余 ${seatRemaining.value} 个成员席位，每个项目最多 ${workspaceProjectSeatLimit.value} 人。`
})

const aiQuotaUsedCount = computed(() => {
  if (currentWorkspaceQuota.value)
    return Math.max(0, currentWorkspaceQuota.value.aiQuotaUsed)
  if (aiUsage.value)
    return Math.max(0, aiUsage.value.totalUnits)
  return 0
})

const aiQuotaTotalCount = computed(() => {
  if (currentWorkspaceQuota.value)
    return Math.max(currentWorkspaceQuota.value.aiQuotaTotal, aiQuotaUsedCount.value)
  if (workspaceBillingEstimate.value)
    return Math.max(workspaceBillingEstimate.value.aiQuotaTotal, workspaceBillingEstimate.value.includedAiQuota, aiQuotaUsedCount.value)
  return 0
})

const aiQuotaRemainingCount = computed(() => {
  if (!aiQuotaTotalCount.value)
    return 0
  return Math.max(0, aiQuotaTotalCount.value - aiQuotaUsedCount.value)
})

const aiQuotaHeadlineText = computed(() => {
  if (!aiQuotaTotalCount.value)
    return '未配置'
  return `${aiQuotaTotalCount.value} credits`
})

const aiQuotaUsageText = computed(() => {
  if (!aiQuotaTotalCount.value)
    return '暂无可用配额数据'
  return `${aiQuotaUsedCount.value}/${aiQuotaTotalCount.value} credits`
})

const quotaResetCycleText = computed(() => {
  return formatResetCycleLabel(currentWorkspaceQuota.value?.resetCycle || workspaceBillingEstimate.value?.billingCycle)
})

const quotaUpdatedAtText = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota?.updatedAt)
    return formatDateTime(quota.updatedAt)

  const estimate = workspaceBillingEstimate.value
  if (estimate?.updatedAt)
    return formatDateTime(estimate.updatedAt)

  return '暂无配额同步记录'
})

const workspacePlanTierLabel = computed(() => {
  if (workspaceBillingEstimate.value?.planTier === 'business_team')
    return 'Business'
  if (workspaceBillingEstimate.value?.planTier === 'personal_team')
    return 'Personal'
  return isPersonalWorkspace.value ? 'Personal' : 'Business'
})

const workspaceTypeDetailText = computed(() => {
  if (workspaceBillingEstimate.value?.planCode)
    return `套餐 ${workspaceBillingEstimate.value.planCode}`
  return '套餐未配置'
})

const workspaceTypeActionLabel = computed(() => {
  return workspacePlanTierLabel.value === 'Business' ? '查看套餐' : '升级到 Business'
})

const workspaceTypeActionHint = computed(() => {
  if (workspacePlanTierLabel.value === 'Business')
    return '当前工作空间已接入 Business 套餐，可在计费页继续调整。'
  return '当前为 Personal 套餐，可升级到 Business 获取更高协作与配额能力。'
})

const userInitial = computed(() => {
  return resolveInitial(props.userName)
})

const canRenameCurrentWorkspace = computed(() => {
  if (!currentWorkspace.value)
    return false
  if (props.isPlatformAdminUser)
    return true
  if (currentWorkspace.value.workspace.type === 'personal')
    return workspacePrimaryRole.value === 'owner'
  return workspacePrimaryRole.value === 'owner' || workspacePrimaryRole.value === 'admin'
})

const canSubmitWorkspaceName = computed(() => {
  if (!currentWorkspace.value || !canRenameCurrentWorkspace.value || workspaceNameSaving.value)
    return false
  const normalizedDraft = String(workspaceNameDraft.value || '').trim()
  if (!normalizedDraft)
    return false
  return normalizedDraft !== String(currentWorkspace.value.workspace.name || '').trim()
})

const pendingWorkspaceInvitations = computed(() => {
  return workspaceInvitations.value.filter(item => !item.acceptedAt && !item.isExpired)
})

const workspaceInvitationPendingCount = computed(() => pendingWorkspaceInvitations.value.length)
const memberSummaryText = computed(() => {
  const totalMembers = workspaceMembers.value.length
  if (!totalMembers)
    return '当前工作空间暂无成员记录。'
  if (isPersonalWorkspace.value)
    return `当前共 ${totalMembers} 位成员，个人空间最多邀请 15 人协作。`
  return `当前共 ${totalMembers} 位成员，待处理邀请 ${workspaceInvitationPendingCount.value} 条。`
})
const aiUsageMemberSummaries = computed(() => aiUsage.value?.memberSummaries || [])
const aiUsageHistoryItems = computed(() => aiUsage.value?.items || [])
const aiUsageTotalPages = computed(() => {
  if (!aiUsage.value?.pageSize)
    return 1
  return Math.max(1, Math.ceil((aiUsage.value.total || 0) / aiUsage.value.pageSize))
})

const inviteRoleOptions = computed<Array<{ value: WorkspaceMemberRole, label: string }>>(() => {
  if (!currentWorkspace.value)
    return []

  if (isPersonalWorkspace.value) {
    return [
      { value: 'member', label: '成员' },
    ]
  }

  if (workspacePrimaryRole.value === 'owner' || workspacePrimaryRole.value === 'admin') {
    return [
      { value: 'admin', label: '管理员' },
      { value: 'manager', label: '协作管理员' },
      { value: 'member', label: '成员' },
    ]
  }

  if (workspacePrimaryRole.value === 'manager') {
    return [
      { value: 'member', label: '成员' },
    ]
  }

  return []
})

const canInviteWorkspaceMembers = computed(() => inviteRoleOptions.value.length > 0)
const editableRoleOptions = computed<Array<{ value: EditableWorkspaceRole, label: string }>>(() => {
  if (isPersonalWorkspace.value)
    return []
  return [
    { value: 'admin', label: '管理员' },
    { value: 'manager', label: '协作管理员' },
    { value: 'member', label: '成员' },
  ]
})
const canManageWorkspaceRoles = computed(() => {
  return props.isPlatformAdminUser || workspacePrimaryRole.value === 'owner' || workspacePrimaryRole.value === 'admin'
})

const workspaceInvitationRoleHint = computed(() => {
  if (isPersonalWorkspace.value)
    return '个人工作空间仅支持邀请成员角色。'
  if (workspacePrimaryRole.value === 'manager')
    return '协作管理员仅可邀请成员。'
  if (!canInviteWorkspaceMembers.value)
    return '当前账号无工作空间邀请权限。'
  return '可生成工作空间邀请链接并发送给协作者。'
})

function resolveMemberUsagePercent(member: WorkspaceAiUsageHistory['memberSummaries'][number]): string {
  const totalUnits = Math.max(0, aiUsage.value?.totalUnits || 0)
  if (!totalUnits)
    return '0%'
  return `${Math.round((member.units / totalUnits) * 100)}%`
}

function resolveMemberUsageBarStyle(member: WorkspaceAiUsageHistory['memberSummaries'][number]): { width: string } {
  const totalUnits = Math.max(0, aiUsage.value?.totalUnits || 0)
  if (!totalUnits || member.units <= 0)
    return { width: '0%' }
  const ratio = Math.max(8, Math.round((member.units / totalUnits) * 100))
  return { width: `${Math.min(100, ratio)}%` }
}

function resolveMemberRoleDraft(member: WorkspaceMemberSummary): EditableWorkspaceRole {
  return workspaceMemberRoleDrafts.value[member.userId] || normalizeEditableRole(resolveMemberPrimaryRole(member))
}

function isRoleEditorVisible(member: WorkspaceMemberSummary): boolean {
  if (!canManageWorkspaceRoles.value)
    return false
  return editableRoleOptions.value.length > 0 && resolveMemberPrimaryRole(member) !== 'owner'
}

function canSubmitRoleChange(member: WorkspaceMemberSummary): boolean {
  if (!isRoleEditorVisible(member))
    return false
  if (workspaceMemberRoleSubmittingUserId.value === member.userId)
    return false
  return resolveMemberRoleDraft(member) !== normalizeEditableRole(resolveMemberPrimaryRole(member))
}

function resolveInvitationStatusLabel(invitation: WorkspaceMemberManagementSnapshot['invitations'][number]): string {
  return invitation.isExpired ? '已过期' : '待接受'
}

function formatSessionStatusLabel(status: AuthSessionHistoryItem['status']): string {
  if (status === 'current')
    return '当前会话'
  if (status === 'active')
    return '仍有效'
  if (status === 'revoked')
    return '已退出'
  return '已过期'
}

function resolveSessionStatusClass(status: AuthSessionHistoryItem['status']): string {
  if (status === 'current')
    return 'user-settings-chip user-settings-chip--strong'
  if (status === 'active')
    return 'user-settings-chip user-settings-chip--success'
  if (status === 'revoked')
    return 'user-settings-chip'
  return 'user-settings-chip user-settings-chip--muted'
}

watch(inviteRoleOptions, (options) => {
  if (options.some(item => item.value === workspaceInviteRole.value))
    return
  workspaceInviteRole.value = options[0]?.value || 'member'
}, { immediate: true })

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

function clearWorkspaceNameFeedback() {
  workspaceNameError.value = ''
  workspaceNameSuccess.value = ''
}

function syncWorkspaceNameDraft() {
  workspaceNameDraft.value = String(currentWorkspace.value?.workspace.name || '').trim()
}

function openWorkspaceNameEditor() {
  if (!canRenameCurrentWorkspace.value)
    return
  clearWorkspaceNameFeedback()
  syncWorkspaceNameDraft()
  workspaceNameEditing.value = true
}

function cancelWorkspaceNameEdit() {
  if (workspaceNameSaving.value)
    return
  workspaceNameEditing.value = false
  clearWorkspaceNameFeedback()
  syncWorkspaceNameDraft()
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
    const response = await authApiFetch<ApiResponse<AuthUser>>('/auth/avatar', {
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

async function saveWorkspaceName() {
  const normalizedWorkspaceId = String(currentWorkspaceId.value || '').trim()
  if (!normalizedWorkspaceId || !canSubmitWorkspaceName.value)
    return

  workspaceNameSaving.value = true
  clearWorkspaceNameFeedback()
  try {
    const response = await authApiFetch<ApiResponse<{ team: WorkspaceWithQuota['workspace'] }>>(`/teams/${normalizedWorkspaceId}`, {
      method: 'PATCH',
      body: {
        name: String(workspaceNameDraft.value || '').trim(),
      },
    })
    const nextName = String(response.data?.team?.name || workspaceNameDraft.value || '').trim()
    workspaceNameDraft.value = nextName
    workspaceNameEditing.value = false
    workspaceNameSuccess.value = '工作空间名称已更新。'
    emit('workspaceUpdated', {
      workspaceId: normalizedWorkspaceId,
      name: nextName,
    })
  }
  catch (error: any) {
    workspaceNameError.value = String(error?.data?.message || '工作空间名称保存失败，请稍后重试。')
  }
  finally {
    workspaceNameSaving.value = false
  }
}

function closeDialog() {
  if (loggingOut.value)
    return
  profileEditorDialogVisible.value = false
  visibleModel.value = false
}

function clearWorkspaceCopyFeedback() {
  workspaceCopyFeedback.value = ''
  if (workspaceCopyFeedbackTimer) {
    clearTimeout(workspaceCopyFeedbackTimer)
    workspaceCopyFeedbackTimer = null
  }
}

function setWorkspaceCopyFeedback(message: string) {
  clearWorkspaceCopyFeedback()
  workspaceCopyFeedback.value = message
  workspaceCopyFeedbackTimer = setTimeout(() => {
    workspaceCopyFeedback.value = ''
    workspaceCopyFeedbackTimer = null
  }, 2200)
}

function clearWorkspaceInvitationCopyFeedback() {
  workspaceInvitationCopyFeedback.value = ''
  if (workspaceInvitationCopyFeedbackTimer) {
    clearTimeout(workspaceInvitationCopyFeedbackTimer)
    workspaceInvitationCopyFeedbackTimer = null
  }
}

function setWorkspaceInvitationCopyFeedback(message: string) {
  clearWorkspaceInvitationCopyFeedback()
  workspaceInvitationCopyFeedback.value = message
  workspaceInvitationCopyFeedbackTimer = setTimeout(() => {
    workspaceInvitationCopyFeedback.value = ''
    workspaceInvitationCopyFeedbackTimer = null
  }, 2200)
}

function copyTextWithFallback(text: string): boolean {
  if (!import.meta.client)
    return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }

  document.body.removeChild(textarea)
  return copied
}

async function copyWorkspaceId() {
  const workspaceId = String(currentWorkspace.value?.workspace.id || '').trim()
  if (!workspaceId) {
    setWorkspaceCopyFeedback('当前没有可复制的工作区 UUID。')
    return
  }

  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(workspaceId)
      setWorkspaceCopyFeedback('工作区 UUID 已复制。')
      return
    }
    catch {
      // ignore clipboard permission errors and fallback to execCommand
    }
  }

  if (copyTextWithFallback(workspaceId)) {
    setWorkspaceCopyFeedback('工作区 UUID 已复制。')
    return
  }

  setWorkspaceCopyFeedback(`复制失败，请手动复制：${workspaceId}`)
}

function resolveWorkspaceInvitationUrl(token: string): string {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken)
    return ''

  return resolveAppUrl(`/invite/${encodeURIComponent(normalizedToken)}`)
}

function resolveMemberPrimaryRole(member: WorkspaceMemberSummary | null | undefined): WorkspaceMemberRole | '' {
  return resolvePrimaryRole(member?.roles)
}

function resolveMemberRoleLabel(member: WorkspaceMemberSummary | null | undefined): string {
  return formatWorkspaceRoleLabel(resolveMemberPrimaryRole(member))
}

function clearWorkspaceMemberActionFeedback() {
  workspaceMemberActionError.value = ''
  workspaceMemberActionSuccess.value = ''
}

function syncWorkspaceMemberRoleDrafts(members: WorkspaceMemberSummary[]) {
  const nextDrafts: Record<string, EditableWorkspaceRole> = {}
  for (const member of members)
    nextDrafts[member.userId] = normalizeEditableRole(resolveMemberPrimaryRole(member))
  workspaceMemberRoleDrafts.value = nextDrafts
}

function applyWorkspaceMemberSnapshot(snapshot: { members?: WorkspaceMemberSummary[], invitations?: WorkspaceMemberManagementSnapshot['invitations'] } | null | undefined) {
  const members = Array.isArray(snapshot?.members) ? snapshot.members : []
  const invitations = Array.isArray(snapshot?.invitations) ? snapshot.invitations : []
  workspaceMembers.value = members
  workspaceInvitations.value = invitations
  syncWorkspaceMemberRoleDrafts(members)
}

function resetWorkspaceScopedState() {
  workspaceBillingEstimate.value = null
  aiUsage.value = null
  aiUsageError.value = ''
  aiUsageLoading.value = false
  aiUsagePage.value = 1
  applyWorkspaceMemberSnapshot(null)
  workspaceMemberLoading.value = false
  workspaceMemberError.value = ''
  clearWorkspaceMemberActionFeedback()
  workspaceMemberRoleSubmittingUserId.value = ''
  workspaceInvitationDialogVisible.value = false
  workspaceInvitationSubmitting.value = false
  workspaceInvitationRevokingId.value = ''
  workspaceInvitationError.value = ''
  workspaceInvitationSuccess.value = ''
  workspaceInvitationLink.value = ''
  workspaceInviteeUsername.value = ''
  workspaceInviteExpiresInDays.value = 7
  workspaceNameEditing.value = false
  workspaceNameSaving.value = false
  clearWorkspaceNameFeedback()
  syncWorkspaceNameDraft()
  clearWorkspaceInvitationCopyFeedback()
}

function resetDialogState() {
  activeTab.value = 'profile'
  actionError.value = ''
  avatarUploading.value = false
  profileEditorDialogVisible.value = false
  clearAvatarActionFeedback()
  clearWorkspaceCopyFeedback()
  resetWorkspaceScopedState()
  authSessions.value = []
  authSessionsError.value = ''
  feishuBindError.value = readFeishuBindErrorFromRoute()
  feishuBindSuccess.value = ''
  casdoorBindError.value = readCasdoorBindErrorFromRoute()
  feishuUnbindConfirmVisible.value = false
  feishuUnbindConfirmText.value = ''
  clearFeishuBindQueryParamsFromUrl()
  clearCasdoorBindQueryParamsFromUrl()
}

async function copyWorkspaceInvitationLink() {
  const invitationLink = String(workspaceInvitationLink.value || '').trim()
  if (!invitationLink) {
    setWorkspaceInvitationCopyFeedback('当前还没有可复制的邀请链接。')
    return
  }

  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(invitationLink)
      setWorkspaceInvitationCopyFeedback('邀请链接已复制。')
      return
    }
    catch {
      // ignore clipboard permission errors and fallback to execCommand
    }
  }

  if (copyTextWithFallback(invitationLink)) {
    setWorkspaceInvitationCopyFeedback('邀请链接已复制。')
    return
  }

  setWorkspaceInvitationCopyFeedback('复制失败，请手动复制邀请链接。')
}

async function loadAuthMeta() {
  try {
    const response = await authApiFetch<ApiResponse<AuthLoginMeta>>('/auth/meta')
    feishuMeta.value = response.data.feishu
    casdoorEnabled.value = Boolean(response.data.casdoor?.enabled)
  }
  catch {
    feishuMeta.value = null
    casdoorEnabled.value = false
  }
}

async function loadWorkspaceBillingEstimate(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    workspaceBillingEstimate.value = null
    return
  }

  const requestSeq = ++workspaceBillingEstimateSeq
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceBillingEstimate>>(`/teams/${normalizedWorkspaceId}/billing/estimate`)
    if (requestSeq !== workspaceBillingEstimateSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    workspaceBillingEstimate.value = response.data
  }
  catch {
    if (requestSeq === workspaceBillingEstimateSeq && currentWorkspaceId.value === normalizedWorkspaceId)
      workspaceBillingEstimate.value = null
  }
}

async function loadWorkspaceAiUsage(workspaceId: string, page = 1) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    aiUsageLoading.value = false
    aiUsage.value = null
    aiUsageError.value = ''
    return
  }

  aiUsageLoading.value = true
  aiUsageError.value = ''
  const requestSeq = ++workspaceAiUsageSeq
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceAiUsageHistory>>(`/teams/${normalizedWorkspaceId}/ai/usage?page=${page}&pageSize=10`)
    if (requestSeq !== workspaceAiUsageSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    aiUsage.value = response.data
    aiUsagePage.value = response.data.page || page
  }
  catch (error: any) {
    if (requestSeq !== workspaceAiUsageSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    aiUsage.value = null
    aiUsageError.value = String(error?.data?.message || 'AI 消耗记录加载失败。')
  }
  finally {
    if (requestSeq === workspaceAiUsageSeq)
      aiUsageLoading.value = false
  }
}

async function loadWorkspaceMemberManagement(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    workspaceMemberLoading.value = false
    applyWorkspaceMemberSnapshot(null)
    workspaceMemberError.value = ''
    return
  }

  workspaceMemberLoading.value = true
  workspaceMemberError.value = ''
  const requestSeq = ++workspaceMemberSnapshotSeq
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/members`)
    if (requestSeq !== workspaceMemberSnapshotSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    applyWorkspaceMemberSnapshot(response.data)
  }
  catch (error: any) {
    if (requestSeq !== workspaceMemberSnapshotSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    applyWorkspaceMemberSnapshot(null)
    workspaceMemberError.value = String(error?.data?.message || '工作空间成员信息加载失败。')
  }
  finally {
    if (requestSeq === workspaceMemberSnapshotSeq)
      workspaceMemberLoading.value = false
  }
}

function openWorkspaceInvitationDialog() {
  clearWorkspaceMemberActionFeedback()
  if (!currentWorkspaceId.value) {
    workspaceMemberActionError.value = '当前没有可邀请的工作空间。'
    return
  }

  if (!canInviteWorkspaceMembers.value) {
    workspaceMemberActionError.value = '当前账号无工作空间邀请权限。'
    return
  }

  workspaceInvitationDialogVisible.value = true
  workspaceInvitationError.value = ''
  workspaceInvitationSuccess.value = ''
  workspaceInvitationLink.value = ''
  workspaceInviteeUsername.value = ''
  workspaceInviteExpiresInDays.value = 7
  clearWorkspaceInvitationCopyFeedback()
}

function closeWorkspaceInvitationDialog() {
  if (workspaceInvitationSubmitting.value)
    return
  workspaceInvitationDialogVisible.value = false
}

async function createWorkspaceInvitation() {
  const normalizedWorkspaceId = String(currentWorkspaceId.value || '').trim()
  if (!normalizedWorkspaceId) {
    workspaceInvitationError.value = '当前没有可邀请的工作空间。'
    return
  }

  if (!canInviteWorkspaceMembers.value) {
    workspaceInvitationError.value = '当前账号无工作空间邀请权限。'
    return
  }

  workspaceInvitationSubmitting.value = true
  workspaceInvitationError.value = ''
  workspaceInvitationSuccess.value = ''
  clearWorkspaceInvitationCopyFeedback()
  try {
    const response = await authApiFetch<ApiResponse<InvitationWithToken>>(`/teams/${normalizedWorkspaceId}/invitations`, {
      method: 'POST',
      body: {
        inviteeUsername: String(workspaceInviteeUsername.value || '').trim() || undefined,
        role: workspaceInviteRole.value,
        expiresInDays: Math.max(1, Math.min(30, Number(workspaceInviteExpiresInDays.value || 7))),
      },
    })

    if (currentWorkspaceId.value !== normalizedWorkspaceId)
      return

    workspaceInvitationLink.value = resolveWorkspaceInvitationUrl(response.data.token)
    workspaceInvitationSuccess.value = '工作空间邀请已生成，可复制链接发送给协作者。'
    workspaceInviteeUsername.value = ''
    await loadWorkspaceMemberManagement(normalizedWorkspaceId)
  }
  catch (error: any) {
    workspaceInvitationError.value = String(error?.data?.message || '创建工作空间邀请失败，请稍后重试。')
  }
  finally {
    workspaceInvitationSubmitting.value = false
  }
}

async function revokeWorkspaceInvitation(invitationId: string) {
  const normalizedWorkspaceId = String(currentWorkspaceId.value || '').trim()
  const normalizedInvitationId = String(invitationId || '').trim()
  if (!normalizedWorkspaceId || !normalizedInvitationId)
    return

  workspaceInvitationRevokingId.value = normalizedInvitationId
  clearWorkspaceMemberActionFeedback()
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/invitations/${normalizedInvitationId}/revoke`, {
      method: 'POST',
    })
    applyWorkspaceMemberSnapshot(response.data)
    workspaceMemberActionSuccess.value = '邀请已撤销。'
  }
  catch (error: any) {
    workspaceMemberActionError.value = String(error?.data?.message || '撤销邀请失败，请稍后重试。')
  }
  finally {
    workspaceInvitationRevokingId.value = ''
  }
}

async function updateWorkspaceMemberRole(member: WorkspaceMemberSummary) {
  const normalizedWorkspaceId = String(currentWorkspaceId.value || '').trim()
  const nextRole = resolveMemberRoleDraft(member)
  if (!normalizedWorkspaceId || !canSubmitRoleChange(member))
    return

  workspaceMemberRoleSubmittingUserId.value = member.userId
  clearWorkspaceMemberActionFeedback()
  try {
    const response = await authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/members/${member.userId}/role`, {
      method: 'PATCH',
      body: {
        role: nextRole,
      },
    })
    applyWorkspaceMemberSnapshot(response.data)
    workspaceMemberActionSuccess.value = `已将 ${member.username} 调整为${formatWorkspaceRoleLabel(nextRole)}。`
  }
  catch (error: any) {
    workspaceMemberActionError.value = String(error?.data?.message || '更新成员权限失败，请稍后重试。')
  }
  finally {
    workspaceMemberRoleSubmittingUserId.value = ''
  }
}

async function loadAuthSessions() {
  authSessionsLoading.value = true
  authSessionsError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthSessionHistoryItem[]>>('/auth/sessions?limit=10')
    authSessions.value = Array.isArray(response.data) ? response.data : []
  }
  catch (error: any) {
    authSessions.value = []
    authSessionsError.value = String(error?.data?.message || '登录历史加载失败。')
  }
  finally {
    authSessionsLoading.value = false
  }
}

async function changeAiUsagePage(nextPage: number) {
  const targetPage = Math.max(1, Math.min(aiUsageTotalPages.value, nextPage))
  if (targetPage === aiUsagePage.value)
    return
  aiUsagePage.value = targetPage
  await loadWorkspaceAiUsage(currentWorkspaceId.value, targetPage)
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

async function refreshActiveTabData(tabId: UserSettingsTabId, options: { resetAiPage?: boolean } = {}) {
  const workspaceId = currentWorkspaceId.value
  if (tabId === 'profile') {
    await Promise.allSettled([
      loadAuthMeta(),
      loadFeishuBindStatus(),
      loadCasdoorBindStatus(),
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
      loadCasdoorBindStatus(),
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

async function loadFeishuBindStatus() {
  feishuBindLoading.value = true
  feishuBindError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthBindStatus>>('/auth/feishu/bind-status')
    feishuBindStatus.value = response.data
  }
  catch (error: any) {
    feishuBindStatus.value = null
    feishuBindError.value = String(error?.data?.message || '飞书绑定状态加载失败。')
  }
  finally {
    feishuBindLoading.value = false
  }
}

async function loadCasdoorBindStatus() {
  casdoorBindLoading.value = true
  casdoorBindError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<CasdoorAuthBindStatus>>('/auth/casdoor/bind-status')
    casdoorBindStatus.value = response.data
  }
  catch (error: any) {
    casdoorBindStatus.value = null
    casdoorBindError.value = String(error?.data?.message || 'Casdoor 绑定状态加载失败。')
  }
  finally {
    casdoorBindLoading.value = false
  }
}

function readRouteQueryText(name: string): string {
  if (import.meta.client) {
    const params = new URLSearchParams(window.location.search)
    return String(params.get(name) || '').trim()
  }
  const raw = route.query[name]
  return Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
}

function readFeishuBindErrorFromRoute(): string {
  const bindError = readRouteQueryText('feishuBindError')
  const boundUser = readRouteQueryText('feishuBoundUser')
  if (!bindError)
    return ''
  if (!boundUser)
    return bindError
  return `${bindError}（关联账号：${boundUser}）`
}

function readCasdoorBindErrorFromRoute(): string {
  const bindError = readRouteQueryText('casdoorBindError')
  const boundUser = readRouteQueryText('casdoorBoundUser')
  if (!bindError)
    return ''
  if (!boundUser)
    return bindError
  return `${bindError}（关联账号：${boundUser}）`
}

function clearFeishuBindQueryParamsFromUrl() {
  if (!import.meta.client)
    return

  const url = new URL(window.location.href)
  let changed = false
  for (const key of ['feishuBindError', 'feishuConflictCode', 'feishuBoundUser']) {
    if (!url.searchParams.has(key))
      continue
    url.searchParams.delete(key)
    changed = true
  }

  if (!changed)
    return

  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

function clearCasdoorBindQueryParamsFromUrl() {
  if (!import.meta.client)
    return

  const url = new URL(window.location.href)
  let changed = false
  for (const key of ['casdoorBindError', 'casdoorConflictCode', 'casdoorBoundUser']) {
    if (!url.searchParams.has(key))
      continue
    url.searchParams.delete(key)
    changed = true
  }

  if (!changed)
    return

  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, '', next)
}

function formatAuditAction(action: FeishuAuthAuditItem['action']): string {
  if (action === 'auth.feishu.bind.self')
    return '绑定飞书'
  return '解绑飞书'
}

async function loadFeishuAudits() {
  feishuAuditLoading.value = true
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthAuditItem[]>>('/auth/feishu/audits?limit=8')
    feishuAudits.value = response.data || []
  }
  catch {
    feishuAudits.value = []
  }
  finally {
    feishuAuditLoading.value = false
  }
}

async function startFeishuBind() {
  if (!import.meta.client || feishuBindRedirecting.value)
    return

  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  if (!feishuMeta.value)
    await loadAuthMeta()

  if (!feishuMeta.value?.enabled) {
    feishuBindError.value = '飞书登录尚未启用，请联系管理员。'
    return
  }

  feishuBindRedirecting.value = true
  const redirectTarget = route.fullPath && route.fullPath.startsWith('/') ? route.fullPath : '/dashboard'
  const url = endpoint(`/auth/feishu/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
  window.location.href = url
}

async function startCasdoorBind() {
  if (!import.meta.client || casdoorBindRedirecting.value)
    return

  casdoorBindError.value = ''
  if (!casdoorEnabled.value)
    await loadAuthMeta()

  if (!casdoorEnabled.value) {
    casdoorBindError.value = 'Casdoor 登录尚未启用，请联系管理员。'
    return
  }

  casdoorBindRedirecting.value = true
  const redirectTarget = route.fullPath && route.fullPath.startsWith('/') ? route.fullPath : '/dashboard'
  const url = endpoint(`/auth/casdoor/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
  window.location.href = url
}

async function unbindFeishu() {
  if (feishuUnbinding.value)
    return

  if (!feishuBindStatus.value?.linked) {
    feishuBindError.value = '当前账号未绑定飞书。'
    return
  }

  const normalized = String(feishuUnbindConfirmText.value || '').trim().toUpperCase()
  if (normalized !== 'UNBIND') {
    feishuBindError.value = '请输入确认口令 UNBIND 后再解绑。'
    return
  }

  feishuUnbinding.value = true
  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  try {
    const response = await authApiFetch<ApiResponse<FeishuAuthUnbindResult>>('/auth/feishu/unbind', {
      method: 'POST',
      body: {
        confirmText: normalized,
      },
    })
    feishuBindStatus.value = response.data.status
    feishuBindSuccess.value = response.data.removedCount > 0
      ? `解绑成功，已移除 ${response.data.removedCount} 条飞书身份。`
      : '当前账号没有可解绑的飞书身份。'
    feishuUnbindConfirmVisible.value = false
    feishuUnbindConfirmText.value = ''
    await loadFeishuAudits()
  }
  catch (error: any) {
    feishuBindError.value = String(error?.data?.message || '解绑飞书失败，请稍后重试。')
  }
  finally {
    feishuUnbinding.value = false
  }
}

function openFeishuUnbindConfirm() {
  feishuBindError.value = ''
  feishuBindSuccess.value = ''
  feishuUnbindConfirmVisible.value = true
  feishuUnbindConfirmText.value = ''
}

function cancelFeishuUnbindConfirm() {
  if (feishuUnbinding.value)
    return
  feishuUnbindConfirmVisible.value = false
  feishuUnbindConfirmText.value = ''
}

async function logout() {
  loggingOut.value = true
  actionError.value = ''
  try {
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
      loadCasdoorBindStatus(),
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
    feishuBindError.value = readFeishuBindErrorFromRoute()
    casdoorBindError.value = readCasdoorBindErrorFromRoute()
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
  resetWorkspaceScopedState()
  void refreshActiveTabData(activeTab.value, { resetAiPage: activeTab.value === 'ai' })
})

watch(currentWorkspace, () => {
  syncWorkspaceNameDraft()
}, { immediate: true })

onBeforeUnmount(() => {
  clearWorkspaceCopyFeedback()
  clearWorkspaceInvitationCopyFeedback()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      class="p-4 bg-slate-950/40 flex items-center inset-0 justify-center fixed z-50"
      @click.self="closeDialog"
    >
      <div class="border border-slate-200 rounded-[28px] bg-white flex flex-col h-full max-h-[88vh] max-w-[1160px] w-full shadow-2xl overflow-hidden lg:h-[720px] lg:max-h-[720px]">
        <div class="flex flex-1 flex-col min-h-0 lg:flex-row">
          <aside class="border-b border-slate-200 bg-slate-50 flex shrink-0 flex-col lg:border-b-0 lg:border-r lg:w-[192px]">
            <div class="px-4 pb-2 pt-4 flex items-center lg:px-5 lg:pb-3 lg:pt-5">
              <button
                class="text-slate-500 rounded-full flex h-10 w-10 transition items-center justify-center hover:text-slate-800 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loggingOut"
                @click="closeDialog"
              >
                <span class="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <div class="user-settings-nav">
              <section
                v-for="group in tabGroups"
                :key="group.id"
                class="user-settings-nav-group"
              >
                <p class="user-settings-nav-group__label">
                  {{ group.label }}
                </p>
                <div class="user-settings-nav-group__tabs">
                  <button
                    v-for="tab in group.tabs"
                    :key="tab.id"
                    type="button"
                    class="user-settings-tab"
                    :class="{ 'is-active': activeTab === tab.id }"
                    @click="selectTab(tab.id)"
                  >
                    <span class="material-symbols-outlined text-[18px]">{{ tab.icon }}</span>
                    <span class="user-settings-tab__label">{{ tab.label }}</span>
                  </button>
                </div>
              </section>
            </div>
          </aside>

          <section class="bg-white flex flex-1 flex-col min-h-0">
            <div class="px-5 py-5 flex-1 min-h-0 overflow-y-auto sm:px-6">
              <div v-if="activeTab === 'profile'" class="user-settings-panel user-settings-panel--stack">
                <input
                  ref="avatarFileInputRef"
                  type="file"
                  class="sr-only"
                  :accept="USER_AVATAR_UPLOAD_ACCEPT_ATTR"
                  @change="handleAvatarFileChange"
                >

                <section class="user-settings-card">
                  <div class="user-settings-profile-card user-settings-profile-card--profile">
                    <div class="user-settings-profile-card__main">
                      <div class="user-settings-avatar user-settings-avatar--large">
                        <img
                          v-if="hasUserAvatar"
                          :src="currentUserAvatarUrl"
                          alt="当前头像"
                          class="user-settings-avatar__image"
                        >
                        <span v-else>{{ userInitial }}</span>
                      </div>

                      <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap gap-2 items-center">
                          <p class="text-lg text-slate-900 font-semibold">
                            {{ props.userName }}
                          </p>
                          <span
                            v-if="props.showAdminBadge"
                            class="text-[11px] text-rose-700 font-semibold px-2 py-0.5 border border-rose-200 rounded-full bg-rose-50 inline-flex"
                          >
                            管理页
                          </span>
                        </div>
                        <p v-if="props.userSubtitle" class="text-sm text-slate-500 mt-1">
                          {{ props.userSubtitle }}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div class="user-settings-profile-card__footer">
                    <button class="user-settings-btn user-settings-btn--primary" @click="openProfileEditorDialog">
                      编辑资料
                    </button>
                  </div>
                </section>
              </div>

              <div v-else-if="activeTab === 'overview'" class="user-settings-panel">
                <template v-if="currentWorkspace">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间 ID
                      </p>
                      <p class="user-settings-row__desc">
                        用于排查、授权配置和成员协作确认。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--overview">
                      <div class="user-settings-overview-row">
                        <div class="user-settings-overview-row__main">
                          <code class="user-settings-overview-code">{{ currentWorkspace.workspace.id }}</code>
                          <button class="user-settings-icon-btn" title="复制工作空间 UUID" @click="copyWorkspaceId">
                            <span class="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                        </div>
                        <p v-if="workspaceCopyFeedback" class="text-xs text-slate-500">
                          {{ workspaceCopyFeedback }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间名称
                      </p>
                      <p class="user-settings-row__desc">
                        当前工作空间展示名称。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--overview">
                      <div v-if="workspaceNameEditing" class="user-settings-overview-row">
                        <div class="user-settings-inline-editor">
                          <input
                            v-model="workspaceNameDraft"
                            type="text"
                            class="user-settings-input"
                            maxlength="80"
                            placeholder="请输入工作空间名称"
                            :disabled="workspaceNameSaving"
                          >
                          <div class="user-settings-overview-actions">
                            <button class="user-settings-btn user-settings-btn--compact" :disabled="workspaceNameSaving" @click="cancelWorkspaceNameEdit">
                              取消
                            </button>
                            <button
                              class="user-settings-btn user-settings-btn--compact user-settings-btn--primary"
                              :disabled="!canSubmitWorkspaceName"
                              @click="saveWorkspaceName"
                            >
                              {{ workspaceNameSaving ? '保存中...' : '保存名称' }}
                            </button>
                          </div>
                        </div>
                        <p v-if="workspaceNameError" class="user-settings-feedback user-settings-feedback--danger">
                          {{ workspaceNameError }}
                        </p>
                        <p v-if="workspaceNameSuccess" class="user-settings-feedback user-settings-feedback--success">
                          {{ workspaceNameSuccess }}
                        </p>
                      </div>
                      <div v-else class="user-settings-overview-row">
                        <div class="user-settings-overview-row__main">
                          <div class="user-settings-overview-value-group">
                            <span class="user-settings-overview-value">{{ currentWorkspace.workspace.name }}</span>
                          </div>
                          <button
                            v-if="canRenameCurrentWorkspace"
                            class="user-settings-btn user-settings-btn--compact"
                            title="编辑工作空间名称"
                            @click="openWorkspaceNameEditor"
                          >
                            修改
                          </button>
                        </div>
                        <p class="text-sm text-slate-500">
                          {{ canRenameCurrentWorkspace ? '当前工作空间名称可直接修改。' : '当前工作空间名称仅所有者或管理员可修改。' }}
                        </p>
                        <p v-if="workspaceNameError" class="user-settings-feedback user-settings-feedback--danger">
                          {{ workspaceNameError }}
                        </p>
                        <p v-if="workspaceNameSuccess" class="user-settings-feedback user-settings-feedback--success">
                          {{ workspaceNameSuccess }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间类型
                      </p>
                      <p class="user-settings-row__desc">
                        Personal / Business 套餐类型与当前项目台形态。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--overview">
                      <div class="user-settings-overview-row">
                        <div class="user-settings-overview-row__main">
                          <div class="user-settings-overview-value-group">
                            <span class="user-settings-overview-value">{{ workspacePlanTierLabel }}</span>
                            <span class="user-settings-chip">{{ workspaceTypeDetailText }}</span>
                          </div>
                          <button
                            class="user-settings-btn user-settings-btn--compact user-settings-btn--primary"
                            @click="handleWorkspaceTypeAction"
                          >
                            {{ workspaceTypeActionLabel }}
                          </button>
                        </div>
                        <p class="text-sm text-slate-500">
                          {{ workspaceTypeActionHint }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间席位管理
                      </p>
                      <p class="user-settings-row__desc">
                        当前工作空间成员席位与协作入口。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--overview">
                      <div class="user-settings-overview-row">
                        <div class="user-settings-overview-row__main">
                          <div class="user-settings-overview-value-group">
                            <span class="user-settings-overview-value">{{ seatSummaryText }}</span>
                            <span class="text-sm text-slate-500">{{ quotaResetCycleText }}</span>
                          </div>
                          <div class="user-settings-overview-actions">
                            <button class="user-settings-btn user-settings-btn--compact" @click="selectTab('members')">
                              查看成员
                            </button>
                            <button
                              class="user-settings-btn user-settings-btn--compact user-settings-btn--primary"
                              :disabled="!canInviteWorkspaceMembers"
                              @click="openWorkspaceInvitationDialog"
                            >
                              发起邀请
                            </button>
                          </div>
                        </div>
                        <p class="text-sm text-slate-500">
                          {{ seatDetailText }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        最近更新时间
                      </p>
                      <p class="user-settings-row__desc">
                        最近一次配额同步时间。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--overview">
                      <div class="user-settings-overview-row">
                        <div class="user-settings-overview-row__main">
                          <span class="user-settings-overview-value user-settings-overview-value--secondary">{{ quotaUpdatedAtText }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

                <div v-else class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      当前工作空间
                    </p>
                    <p class="user-settings-row__desc">
                      当前账号暂无可见工作空间信息。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="text-sm text-slate-500">
                      当前账号暂无可见工作空间信息。
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="activeTab === 'ai'" class="user-settings-panel user-settings-panel--stack">
                <template v-if="currentWorkspace">
                  <section class="user-settings-card">
                    <div class="flex gap-4 items-start justify-between">
                      <div class="min-w-0">
                        <p class="text-sm text-slate-500 font-medium">
                          AI 配额
                        </p>
                        <div class="mt-2 flex gap-2 items-end">
                          <p class="user-settings-ai-headline">
                            {{ aiQuotaHeadlineText.replace(' credits', '') }}
                          </p>
                          <span class="user-settings-ai-unit">credits</span>
                        </div>
                        <p class="text-sm text-slate-500 mt-2">
                          已用 {{ aiQuotaUsageText }}，剩余 {{ aiQuotaRemainingCount }} credits
                        </p>
                      </div>
                      <button class="user-settings-plus-btn" title="调整 AI 配额" @click="handleAiQuotaAction">
                        +
                      </button>
                    </div>

                    <div class="user-settings-metric-grid">
                      <div class="user-settings-mini-card">
                        <p class="user-settings-mini-card__label">
                          已用配额
                        </p>
                        <p class="user-settings-mini-card__value">
                          {{ aiQuotaUsedCount }} credits
                        </p>
                      </div>
                      <div class="user-settings-mini-card">
                        <p class="user-settings-mini-card__label">
                          剩余配额
                        </p>
                        <p class="user-settings-mini-card__value">
                          {{ aiQuotaRemainingCount }} credits
                        </p>
                      </div>
                      <div class="user-settings-mini-card">
                        <p class="user-settings-mini-card__label">
                          下次重置周期
                        </p>
                        <p class="user-settings-mini-card__value">
                          {{ quotaResetCycleText }}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section class="user-settings-card">
                    <div class="user-settings-section-header">
                      <div>
                        <p class="text-base text-slate-900 font-semibold">
                          配额同步记录
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          当前展示最近一次配额同步时间。
                        </p>
                      </div>
                    </div>
                    <div class="user-settings-record-item">
                      <div class="min-w-0">
                        <p class="text-sm text-slate-900 font-medium">
                          最近一次同步
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          {{ quotaUpdatedAtText }}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section class="user-settings-card">
                    <div class="user-settings-section-header">
                      <div>
                        <p class="text-base text-slate-900 font-semibold">
                          成员消耗占比
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          按当前工作空间累计消耗统计。
                        </p>
                      </div>
                    </div>

                    <p v-if="aiUsageError" class="user-settings-feedback user-settings-feedback--danger">
                      {{ aiUsageError }}
                    </p>

                    <div v-else-if="aiUsageMemberSummaries.length > 0" class="user-settings-usage-list">
                      <div
                        v-for="member in aiUsageMemberSummaries"
                        :key="member.userId"
                        class="user-settings-usage-item"
                      >
                        <div class="flex gap-3 items-start justify-between">
                          <div class="min-w-0">
                            <div class="flex gap-3 items-center">
                              <div class="user-settings-member-avatar">
                                {{ resolveInitial(member.username) }}
                              </div>
                              <div class="min-w-0">
                                <p class="text-sm text-slate-900 font-medium truncate">
                                  {{ member.username }}
                                </p>
                                <p class="text-xs text-slate-500 mt-1">
                                  {{ member.calls }} 次调用 · 最近消耗：{{ member.lastUsedAt ? formatDateTime(member.lastUsedAt) : '暂无记录' }}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div class="text-right">
                            <p class="text-sm text-slate-900 font-semibold">
                              {{ member.units }} credits
                            </p>
                            <p class="text-xs text-slate-500 mt-1">
                              {{ resolveMemberUsagePercent(member) }}
                            </p>
                          </div>
                        </div>
                        <div class="user-settings-progress-track">
                          <span class="user-settings-progress-fill" :style="resolveMemberUsageBarStyle(member)" />
                        </div>
                      </div>
                    </div>

                    <div v-else class="user-settings-empty">
                      {{ aiUsageLoading ? 'AI 消耗统计加载中...' : '当前工作空间暂无 AI 消耗记录。' }}
                    </div>
                  </section>

                  <section class="user-settings-card">
                    <div class="user-settings-section-header">
                      <div>
                        <p class="text-base text-slate-900 font-semibold">
                          消耗历史
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          当前共 {{ aiUsage?.total || 0 }} 条记录，累计 {{ aiUsage?.totalUnits || 0 }} credits。
                        </p>
                      </div>
                    </div>

                    <p v-if="aiUsageError" class="user-settings-feedback user-settings-feedback--danger">
                      {{ aiUsageError }}
                    </p>

                    <div v-else-if="aiUsageHistoryItems.length > 0" class="user-settings-record-list">
                      <div
                        v-for="item in aiUsageHistoryItems"
                        :key="item.id"
                        class="user-settings-record-item"
                      >
                        <div class="flex-1 min-w-0">
                          <div class="flex flex-wrap gap-2 items-center">
                            <p class="text-sm text-slate-900 font-semibold">
                              {{ formatAiRouteLabel(item.route) }}
                            </p>
                            <span class="user-settings-chip">
                              {{ item.units }} credits
                            </span>
                          </div>
                          <p class="text-xs text-slate-500 mt-2">
                            {{ item.username }} · {{ formatDateTime(item.createdAt) }}
                          </p>
                          <p class="text-xs text-slate-400 font-mono mt-1 break-all">
                            {{ item.route }}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div v-else class="user-settings-empty">
                      {{ aiUsageLoading ? 'AI 消耗历史加载中...' : '当前工作空间暂无 AI 消耗历史。' }}
                    </div>

                    <div v-if="aiUsageHistoryItems.length > 0" class="user-settings-pagination">
                      <button
                        class="user-settings-btn user-settings-btn--compact"
                        :disabled="aiUsageLoading || aiUsagePage <= 1"
                        @click="changeAiUsagePage(aiUsagePage - 1)"
                      >
                        上一页
                      </button>
                      <span class="text-xs text-slate-500">
                        第 {{ aiUsagePage }} / {{ aiUsageTotalPages }} 页
                      </span>
                      <button
                        class="user-settings-btn user-settings-btn--compact"
                        :disabled="aiUsageLoading || aiUsagePage >= aiUsageTotalPages"
                        @click="changeAiUsagePage(aiUsagePage + 1)"
                      >
                        下一页
                      </button>
                    </div>
                  </section>
                </template>

                <div v-else class="user-settings-empty">
                  当前账号暂无可见工作空间信息。
                </div>
              </div>

              <div v-else-if="activeTab === 'members'" class="user-settings-panel user-settings-panel--stack">
                <template v-if="currentWorkspace">
                  <section class="user-settings-card">
                    <div class="user-settings-section-header">
                      <div>
                        <p class="text-base text-slate-900 font-semibold">
                          工作空间成员
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          {{ memberSummaryText }}
                        </p>
                      </div>
                      <button
                        class="user-settings-btn user-settings-btn--primary"
                        :disabled="!canInviteWorkspaceMembers"
                        @click="openWorkspaceInvitationDialog"
                      >
                        发起邀请
                      </button>
                    </div>

                    <p v-if="workspaceMemberError" class="user-settings-feedback user-settings-feedback--danger">
                      {{ workspaceMemberError }}
                    </p>
                    <p v-if="workspaceMemberActionError" class="user-settings-feedback user-settings-feedback--danger">
                      {{ workspaceMemberActionError }}
                    </p>
                    <p v-if="workspaceMemberActionSuccess" class="user-settings-feedback user-settings-feedback--success">
                      {{ workspaceMemberActionSuccess }}
                    </p>

                    <div v-if="workspaceMembers.length > 0" class="user-settings-member-list">
                      <div
                        v-for="member in workspaceMembers"
                        :key="member.userId"
                        class="user-settings-member-item"
                      >
                        <div class="user-settings-member-avatar">
                          {{ resolveInitial(member.username) }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm text-slate-900 font-medium truncate">
                            {{ member.username }}
                          </p>
                          <p class="text-xs text-slate-500 mt-1">
                            加入时间 {{ formatDateTime(member.joinedAt) }}
                          </p>
                          <p class="text-xs text-slate-500 mt-1">
                            当前权限 {{ resolveMemberRoleLabel(member) }} · 最近更新 {{ formatDateTime(member.updatedAt) }}
                          </p>
                        </div>
                        <div class="user-settings-member-actions">
                          <template v-if="isRoleEditorVisible(member)">
                            <select
                              v-model="workspaceMemberRoleDrafts[member.userId]"
                              class="user-settings-select user-settings-select--compact"
                              :disabled="workspaceMemberRoleSubmittingUserId === member.userId"
                            >
                              <option
                                v-for="option in editableRoleOptions"
                                :key="option.value"
                                :value="option.value"
                              >
                                {{ option.label }}
                              </option>
                            </select>
                            <button
                              class="user-settings-btn user-settings-btn--compact"
                              :disabled="!canSubmitRoleChange(member)"
                              @click="updateWorkspaceMemberRole(member)"
                            >
                              {{ workspaceMemberRoleSubmittingUserId === member.userId ? '保存中...' : '保存' }}
                            </button>
                          </template>
                          <span v-else class="user-settings-chip">
                            {{ resolveMemberRoleLabel(member) }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div v-else class="user-settings-empty">
                      {{ workspaceMemberLoading ? '成员信息加载中...' : '当前工作空间暂无成员记录。' }}
                    </div>
                  </section>

                  <section class="user-settings-card">
                    <div class="user-settings-section-header">
                      <div>
                        <p class="text-base text-slate-900 font-semibold">
                          邀请记录
                        </p>
                        <p class="text-sm text-slate-500 mt-1">
                          展示当前工作空间待接受或已过期的邀请，以及邀请人信息。
                        </p>
                      </div>
                    </div>

                    <div v-if="workspaceInvitations.length > 0" class="user-settings-record-list">
                      <div
                        v-for="invitation in workspaceInvitations"
                        :key="invitation.id"
                        class="user-settings-record-item"
                      >
                        <div class="flex-1 min-w-0">
                          <div class="flex flex-wrap gap-2 items-center">
                            <p class="text-sm text-slate-900 font-semibold">
                              {{ invitation.inviteeUsername || '任意账号可加入' }}
                            </p>
                            <span class="user-settings-chip">
                              {{ formatWorkspaceRoleLabel(invitation.role) }}
                            </span>
                            <span class="user-settings-chip user-settings-chip--muted">
                              {{ resolveInvitationStatusLabel(invitation) }}
                            </span>
                          </div>
                          <p class="text-xs text-slate-500 mt-2">
                            邀请人 {{ invitation.invitedByUsername }} · 创建于 {{ formatDateTime(invitation.createdAt) }}
                          </p>
                          <p class="text-xs text-slate-500 mt-1">
                            过期时间 {{ formatDateTime(invitation.expiresAt) }}
                          </p>
                        </div>
                        <button
                          v-if="canInviteWorkspaceMembers && !invitation.isExpired"
                          class="user-settings-btn user-settings-btn--compact user-settings-btn--danger"
                          :disabled="workspaceInvitationRevokingId === invitation.id"
                          @click="revokeWorkspaceInvitation(invitation.id)"
                        >
                          {{ workspaceInvitationRevokingId === invitation.id ? '撤销中...' : '撤销邀请' }}
                        </button>
                      </div>
                    </div>

                    <div v-else class="user-settings-empty">
                      当前工作空间暂无邀请记录。
                    </div>
                  </section>
                </template>

                <div v-else class="user-settings-empty">
                  当前账号暂无可见工作空间信息。
                </div>
              </div>

              <div v-else-if="activeTab === 'bindings'" class="space-y-10">
                <section class="user-settings-panel">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        飞书账号
                      </p>
                      <p class="user-settings-row__desc">
                        绑定后可直接通过飞书身份登录并关联当前平台账号。
                      </p>
                    </div>
                    <div class="user-settings-row__content">
                      <span
                        class="text-[11px] font-medium px-2.5 py-1 border rounded-full inline-flex"
                        :class="feishuBindStatus?.linked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'"
                      >
                        {{ feishuBindStatus?.linked ? '已绑定' : '未绑定' }}
                      </span>
                      <p v-if="feishuBindStatus?.linked && feishuBindStatus.unionId" class="text-sm text-slate-500 break-all">
                        unionId：{{ feishuBindStatus.unionId }}
                      </p>
                      <p v-if="feishuBindStatus?.linked && feishuBindStatus.updatedAt" class="text-sm text-slate-500">
                        最近同步：{{ formatDateTime(feishuBindStatus.updatedAt) }}
                      </p>
                      <div class="flex flex-wrap gap-2 justify-end">
                        <button class="user-settings-btn" :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding" @click="loadFeishuBindStatus">
                          {{ feishuBindLoading ? '刷新中...' : '刷新状态' }}
                        </button>
                        <button
                          class="user-settings-btn user-settings-btn--primary"
                          :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
                          @click="startFeishuBind"
                        >
                          {{ feishuBindRedirecting ? '跳转中...' : (feishuBindStatus?.linked ? '重新绑定飞书' : '绑定飞书') }}
                        </button>
                        <button
                          v-if="feishuBindStatus?.linked"
                          class="user-settings-btn user-settings-btn--danger"
                          :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
                          @click="openFeishuUnbindConfirm"
                        >
                          {{ feishuUnbinding ? '解绑中...' : '解绑飞书' }}
                        </button>
                      </div>
                      <p v-if="feishuBindError" class="user-settings-feedback user-settings-feedback--danger">
                        {{ feishuBindError }}
                      </p>
                      <p v-if="feishuBindSuccess" class="user-settings-feedback user-settings-feedback--success">
                        {{ feishuBindSuccess }}
                      </p>
                      <div v-if="feishuUnbindConfirmVisible" class="user-settings-feedback user-settings-feedback--danger space-y-3">
                        <p class="text-xs text-rose-700">
                          解绑后将移除当前账号所有飞书身份映射。请输入 <span class="font-mono">UNBIND</span> 确认。
                        </p>
                        <input
                          v-model="feishuUnbindConfirmText"
                          type="text"
                          class="text-sm px-3 py-2 outline-none border border-rose-300 rounded-xl w-full transition focus:border-rose-500"
                          placeholder="输入 UNBIND"
                          :disabled="feishuUnbinding"
                        >
                        <div class="flex flex-wrap gap-2 justify-end">
                          <button class="user-settings-btn" :disabled="feishuUnbinding" @click="cancelFeishuUnbindConfirm">
                            取消
                          </button>
                          <button class="user-settings-btn user-settings-btn--danger" :disabled="feishuUnbinding" @click="unbindFeishu">
                            {{ feishuUnbinding ? '解绑中...' : '确认解绑' }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section class="user-settings-panel">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        Casdoor 账号
                      </p>
                      <p class="user-settings-row__desc">
                        绑定后可复用 Casdoor OAuth 身份登录当前平台。
                      </p>
                    </div>
                    <div class="user-settings-row__content">
                      <span
                        class="text-[11px] font-medium px-2.5 py-1 border rounded-full inline-flex"
                        :class="casdoorBindStatus?.linked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'"
                      >
                        {{ casdoorBindStatus?.linked ? '已绑定' : '未绑定' }}
                      </span>
                      <p v-if="casdoorBindStatus?.linked && casdoorBindStatus.subject" class="text-sm text-slate-500 break-all">
                        sub：{{ casdoorBindStatus.subject }}
                      </p>
                      <p v-if="casdoorBindStatus?.linked && casdoorBindStatus.updatedAt" class="text-sm text-slate-500">
                        最近同步：{{ formatDateTime(casdoorBindStatus.updatedAt) }}
                      </p>
                      <div class="flex flex-wrap gap-2 justify-end">
                        <button class="user-settings-btn" :disabled="casdoorBindLoading || casdoorBindRedirecting" @click="loadCasdoorBindStatus">
                          {{ casdoorBindLoading ? '刷新中...' : '刷新状态' }}
                        </button>
                        <button
                          class="user-settings-btn user-settings-btn--primary"
                          :disabled="casdoorBindLoading || casdoorBindRedirecting"
                          @click="startCasdoorBind"
                        >
                          {{ casdoorBindRedirecting ? '跳转中...' : (casdoorBindStatus?.linked ? '重新绑定 Casdoor' : '绑定 Casdoor') }}
                        </button>
                      </div>
                      <p v-if="casdoorBindError" class="user-settings-feedback user-settings-feedback--danger">
                        {{ casdoorBindError }}
                      </p>
                      <p v-if="!casdoorEnabled" class="text-sm text-slate-500">
                        当前环境未启用 Casdoor OAuth。
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              <div v-else-if="activeTab === 'loginHistory'" class="user-settings-panel user-settings-panel--stack">
                <p class="sr-only">
                  个人登录历史
                </p>

                <p v-if="authSessionsError" class="user-settings-feedback user-settings-feedback--danger">
                  {{ authSessionsError }}
                </p>

                <div v-else-if="authSessions.length > 0" class="user-settings-session-list">
                  <div
                    v-for="session in authSessions"
                    :key="session.id"
                    class="user-settings-session-item"
                  >
                    <div class="min-w-0">
                      <div class="flex flex-wrap gap-2 items-center">
                        <p class="text-sm text-slate-900 font-semibold">
                          {{ formatDateTime(session.createdAt) }}
                        </p>
                        <span :class="resolveSessionStatusClass(session.status)">
                          {{ formatSessionStatusLabel(session.status) }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500 mt-2">
                        有效至 {{ formatDateTime(session.expiresAt) }}
                      </p>
                      <p class="text-xs text-slate-400 font-mono mt-2 break-all">
                        session: {{ session.id }}
                      </p>
                    </div>
                  </div>
                </div>

                <div v-else class="user-settings-empty">
                  {{ authSessionsLoading ? '登录历史加载中...' : '当前账号暂无可见登录历史。' }}
                </div>
              </div>

              <div v-else class="user-settings-panel">
                <div class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      绑定相关记录
                    </p>
                    <p class="user-settings-row__desc">
                      当前仅展示飞书绑定与解绑的最近操作记录。
                    </p>
                  </div>
                  <div class="user-settings-row__content">
                    <div class="flex flex-wrap gap-2 justify-end">
                      <button class="user-settings-btn" :disabled="feishuAuditLoading" @click="loadFeishuAudits">
                        {{ feishuAuditLoading ? '加载中...' : '刷新' }}
                      </button>
                    </div>
                    <div v-if="!feishuAudits.length" class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                      暂无绑定/解绑记录
                    </div>
                    <div v-else class="w-full space-y-3">
                      <div
                        v-for="item in feishuAudits"
                        :key="item.id"
                        class="py-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between last:border-b-0"
                      >
                        <span class="text-sm text-slate-700 font-medium">{{ formatAuditAction(item.action) }}</span>
                        <span class="text-xs text-slate-500 font-mono">{{ formatDateTime(item.createdAt) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p v-if="actionError" class="user-settings-feedback user-settings-feedback--danger mt-4">
                {{ actionError }}
              </p>
            </div>

            <div class="px-5 py-4 border-t border-slate-200 flex flex-wrap gap-2 items-center justify-end sm:px-6">
              <button class="user-settings-btn" :disabled="loggingOut" @click="closeDialog">
                关闭
              </button>
              <button class="user-settings-btn user-settings-btn--danger" :disabled="loggingOut" @click="logout">
                {{ loggingOut ? '退出中...' : '退出登录' }}
              </button>
            </div>
          </section>
        </div>
      </div>

      <div
        v-if="profileEditorDialogVisible"
        class="p-4 bg-slate-950/35 flex items-center inset-0 justify-center fixed z-[60]"
        @click.self="closeProfileEditorDialog"
      >
        <div class="p-5 border border-slate-200 rounded-[24px] bg-white max-w-[520px] w-full shadow-2xl sm:p-6">
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
                <p v-if="props.userSubtitle" class="text-sm text-slate-500 mt-1">
                  {{ props.userSubtitle }}
                </p>
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
                placeholder="可选，不填则任意账号可加入"
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
    </div>
  </Teleport>
</template>

<style scoped>
.user-settings-nav {
  padding: 0 16px 16px;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.user-settings-nav-group {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.user-settings-nav-group__label {
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.user-settings-nav-group__tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  overflow: visible;
}

.user-settings-panel {
  border-top: 1px solid #e2e8f0;
}

.user-settings-panel--stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: none;
}

.user-settings-row {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 0;
  border-bottom: 1px solid #e2e8f0;
}

.user-settings-row:last-child {
  border-bottom: none;
}

.user-settings-row__heading {
  flex: 0 0 188px;
  min-width: 168px;
}

.user-settings-row__title {
  color: #0f172a;
  font-size: 16px;
  font-weight: 500;
}

.user-settings-row__desc {
  margin-top: 8px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.6;
}

.user-settings-row__content {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  text-align: right;
}

.user-settings-row__content--start {
  align-items: flex-start;
  text-align: left;
}

.user-settings-row__content--overview {
  align-items: flex-end;
  text-align: left;
}

.user-settings-inline-value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.user-settings-profile-card {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.user-settings-profile-card--profile {
  align-items: flex-start;
}

.user-settings-profile-card__main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 16px;
}

.user-settings-profile-card__footer {
  display: flex;
  justify-content: flex-end;
}

.user-settings-avatar {
  position: relative;
  display: flex;
  height: 56px;
  width: 56px;
  overflow: hidden;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: #0f172a;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.user-settings-avatar--large {
  height: 72px;
  width: 72px;
  border-radius: 22px;
  font-size: 26px;
}

.user-settings-avatar--editor {
  height: 88px;
  width: 88px;
  border-radius: 28px;
  font-size: 30px;
}

.user-settings-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-settings-profile-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin-top: 20px;
}

.user-settings-profile-editor__preview {
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-settings-profile-editor__hint {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-settings-profile-editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.user-settings-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid #dbe4ee;
  border-radius: 999px;
  background: #f8fafc;
  padding: 4px 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}

.user-settings-chip--strong {
  border-color: #cbd5e1;
  background: #eef2ff;
  color: #1e3a8a;
}

.user-settings-chip--success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.user-settings-chip--muted {
  border-color: #e2e8f0;
  background: #f8fafc;
  color: #64748b;
}

.user-settings-overview-row {
  display: flex;
  width: 100%;
  max-width: 760px;
  flex-direction: column;
  gap: 8px;
  margin-left: auto;
}

.user-settings-overview-row__main {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.user-settings-overview-value-group {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.user-settings-overview-value {
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.user-settings-overview-value--secondary {
  color: #64748b;
  font-weight: 400;
}

.user-settings-overview-code {
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-all;
}

.user-settings-overview-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.user-settings-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  padding: 18px 20px;
  border: 1px solid #e2e8f0;
  border-radius: 22px;
  background: #fff;
}

.user-settings-ai-headline {
  color: #0f172a;
  font-size: 34px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.03em;
}

.user-settings-ai-unit {
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  padding-bottom: 4px;
}

.user-settings-plus-btn {
  display: inline-flex;
  height: 34px;
  width: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 20px;
  font-weight: 500;
  line-height: 1;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.user-settings-plus-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.user-settings-plus-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.user-settings-metric-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.user-settings-metric-grid--profile {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.user-settings-mini-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.user-settings-mini-card__label {
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
}

.user-settings-mini-card__value {
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.user-settings-section-header {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.user-settings-member-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 12px;
}

.user-settings-member-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.user-settings-member-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-left: auto;
}

.user-settings-member-avatar {
  display: flex;
  height: 36px;
  width: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 14px;
  font-weight: 600;
}

.user-settings-record-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;
}

.user-settings-record-item {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.user-settings-usage-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;
}

.user-settings-usage-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.user-settings-progress-track {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
}

.user-settings-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2563eb 0%, #60a5fa 100%);
}

.user-settings-pagination {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.user-settings-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.user-settings-inline-editor {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;
}

.user-settings-field__label {
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}

.user-settings-input,
.user-settings-select {
  height: 40px;
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 0 12px;
  color: #0f172a;
  font-size: 14px;
  outline: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.user-settings-input:focus,
.user-settings-select:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.18);
}

.user-settings-input:disabled,
.user-settings-select:disabled {
  cursor: not-allowed;
  background: #f8fafc;
  color: #94a3b8;
}

.user-settings-select--compact {
  min-width: 132px;
  height: 32px;
  padding: 0 28px 0 10px;
  font-size: 12px;
  border-radius: 10px;
}

.user-settings-link-card {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #dbe4ee;
  border-radius: 16px;
  background: #f8fafc;
}

.user-settings-session-list {
  display: grid;
  width: 100%;
  gap: 12px;
}

.user-settings-session-item {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
}

.user-settings-empty {
  width: 100%;
  padding: 16px;
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  background: #f8fafc;
  color: #64748b;
  font-size: 14px;
  line-height: 1.6;
}

.user-settings-feedback {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
}

.user-settings-feedback--danger {
  border-color: #fecdd3;
  background: #fff1f2;
  color: #e11d48;
}

.user-settings-feedback--success {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #15803d;
}

.user-settings-tab {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  padding: 9px 10px;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.user-settings-tab__label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: keep-all;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
}

.user-settings-tab:hover {
  background: #fff;
  color: #0f172a;
}

.user-settings-tab.is-active {
  border-color: #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
}

.user-settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #fff;
  padding: 0 12px;
  height: 36px;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.user-settings-btn:hover:enabled {
  border-color: #94a3b8;
  background: #f8fafc;
}

.user-settings-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.user-settings-btn--primary {
  border-color: #93c5fd;
  color: #1d4ed8;
}

.user-settings-btn--primary:hover:enabled {
  background: #eff6ff;
  border-color: #60a5fa;
}

.user-settings-btn--danger {
  border-color: #fda4af;
  color: #e11d48;
}

.user-settings-btn--danger:hover:enabled {
  background: #fff1f2;
  border-color: #fb7185;
}

.user-settings-btn--compact {
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.user-settings-icon-btn {
  display: inline-flex;
  height: 32px;
  width: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  transition: all 0.15s ease;
}

.user-settings-icon-btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
}

@media (min-width: 1024px) {
  .user-settings-tab {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 1023px) {
  .user-settings-nav {
    flex-direction: column;
    gap: 12px;
    padding: 0 16px 16px;
  }

  .user-settings-nav-group {
    flex: none;
  }

  .user-settings-nav-group__tabs {
    flex-direction: row;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .user-settings-panel--stack {
    gap: 14px;
  }

  .user-settings-row {
    flex-direction: column;
    gap: 14px;
  }

  .user-settings-row__heading {
    flex: none;
    min-width: 0;
  }

  .user-settings-row__content {
    align-items: flex-start;
    text-align: left;
  }

  .user-settings-inline-value {
    justify-content: flex-start;
  }

  .user-settings-card,
  .user-settings-profile-card,
  .user-settings-section-header,
  .user-settings-record-item,
  .user-settings-member-item {
    flex-direction: column;
  }

  .user-settings-avatar {
    align-self: flex-start;
  }

  .user-settings-profile-card__main,
  .user-settings-profile-card__footer {
    width: 100%;
  }

  .user-settings-member-actions,
  .user-settings-pagination {
    justify-content: flex-start;
    margin-left: 0;
  }

  .user-settings-metric-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .user-settings-nav-group__tabs,
  .user-settings-tab {
    white-space: nowrap;
  }

  .user-settings-tab {
    width: auto;
    min-width: max-content;
    flex: 0 0 auto;
  }

  .user-settings-nav-group__tabs {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    padding-bottom: 2px;
  }

  .user-settings-overview-row__main {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 639px) {
  .user-settings-card {
    padding: 16px;
    border-radius: 18px;
  }

  .user-settings-ai-headline {
    font-size: 30px;
  }

  .user-settings-mini-card__value {
    font-size: 15px;
  }
}
</style>
