<script setup lang="ts">
import type {
  ApiResponse,
  AuthLoginMeta,
  AuthSessionHistoryItem,
  CasdoorAuthBindStatus,
  FeishuAuthAuditItem,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuIntegrationConfig,
  InvitationWithToken,
  WorkspaceBillingEstimate,
  WorkspaceMemberManagementSnapshot,
  WorkspaceMemberRole,
  WorkspaceMemberSummary,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { formatDateTime, formatWorkspaceTypeLabel } from '~/composables/team-ui'

type UserSettingsTabId = 'overview' | 'ai' | 'members' | 'bindings' | 'loginHistory' | 'audits'

const props = withDefaults(defineProps<{
  visible?: boolean
  userName?: string
  userSubtitle?: string
  showAdminBadge?: boolean
  workspaceOptions?: WorkspaceWithQuota[]
  activeWorkspaceId?: string
}>(), {
  visible: false,
  userName: '未登录用户',
  userSubtitle: '',
  showAdminBadge: false,
  workspaceOptions: () => [],
  activeWorkspaceId: '',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const route = useRoute()
const authApiFetch = useAuthApiFetch()
const runtime = useRuntimeConfig()
const { endpoint, resolveAppUrl } = useApiEndpoint(runtime)

const activeTab = ref<UserSettingsTabId>('overview')
const loggingOut = ref(false)
const actionError = ref('')
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
const workspaceMembers = ref<WorkspaceMemberSummary[]>([])
const workspaceInvitations = ref<WorkspaceMemberManagementSnapshot['invitations']>([])
const workspaceMemberLoading = ref(false)
const workspaceMemberError = ref('')
const workspaceInvitationSubmitting = ref(false)
const workspaceInvitationError = ref('')
const workspaceInvitationSuccess = ref('')
const workspaceInvitationLink = ref('')
const workspaceInviteeUsername = ref('')
const workspaceInviteRole = ref<WorkspaceMemberRole>('member')
const workspaceInviteExpiresInDays = ref(7)
const authSessions = ref<AuthSessionHistoryItem[]>([])
const authSessionsLoading = ref(false)
const authSessionsError = ref('')
const workspaceCopyFeedback = ref('')
const workspaceInvitationCopyFeedback = ref('')
let workspaceCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
let workspaceInvitationCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
let workspaceBillingEstimateSeq = 0
let workspaceMemberSnapshotSeq = 0

const defaultTabMeta: { id: UserSettingsTabId, label: string, icon: string, description: string } = {
  id: 'overview',
  label: '概览',
  icon: 'dashboard',
  description: '查看当前账号与项目台的核心信息。',
}

const tabItems: Array<{ id: UserSettingsTabId, label: string, icon: string, description: string }> = [
  defaultTabMeta,
  { id: 'ai', label: 'AI 配额', icon: 'neurology', description: '查看当前工作空间的 AI credits 配额。' },
  { id: 'members', label: '工作空间成员', icon: 'group', description: '查看成员、待处理邀请并生成邀请链接。' },
  { id: 'bindings', label: '账号绑定', icon: 'link', description: '管理飞书和 Casdoor 身份绑定。' },
  { id: 'loginHistory', label: '登录历史', icon: 'schedule', description: '查看个人账号近期登录与会话状态。' },
  { id: 'audits', label: '操作记录', icon: 'history', description: '查看最近的绑定与解绑操作。' },
]

const rolePriority: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'member']

const visibleModel = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value),
})

const activeTabMeta = computed(() => {
  return tabItems.find(item => item.id === activeTab.value) || defaultTabMeta
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
const hasWorkspaceUsageMetrics = computed(() => Boolean(currentWorkspaceQuota.value || workspaceBillingEstimate.value))
const isPersonalWorkspace = computed(() => currentWorkspace.value?.workspace.type === 'personal')
const currentWorkspaceId = computed(() => String(currentWorkspace.value?.workspace.id || '').trim())

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

function resolveInitial(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return 'U'
  return normalized.slice(0, 1).toUpperCase()
}

const workspacePrimaryRole = computed<WorkspaceMemberRole | ''>(() => resolvePrimaryRole(currentWorkspace.value?.workspace.roles))
const workspaceRoleLabel = computed(() => formatWorkspaceRoleLabel(workspacePrimaryRole.value))

const workspaceProjectSeatLimit = computed(() => {
  if (workspaceBillingEstimate.value?.defaultProjectSeatLimit)
    return workspaceBillingEstimate.value.defaultProjectSeatLimit
  return 15
})

const seatRemaining = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return Math.max(0, Math.max(quota.seatLimit, quota.seatUsed) - quota.seatUsed)

  const estimate = workspaceBillingEstimate.value
  if (!estimate)
    return null
  return Math.max(0, Math.max(estimate.includedSeats, estimate.seatUsed) - estimate.seatUsed)
})

const aiRemaining = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return Math.max(0, Math.max(quota.aiQuotaTotal, quota.aiQuotaUsed) - quota.aiQuotaUsed)

  const estimate = workspaceBillingEstimate.value
  if (!estimate)
    return null
  return Math.max(0, Math.max(estimate.aiQuotaTotal, estimate.includedAiQuota) - 0)
})

const seatSummaryText = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return `${quota.seatUsed}/${Math.max(quota.seatLimit, quota.seatUsed)}`

  const estimate = workspaceBillingEstimate.value
  if (estimate)
    return `${estimate.seatUsed}/${Math.max(estimate.includedSeats, estimate.seatUsed)}`

  return '未配置'
})

const seatDetailText = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return `剩余 ${seatRemaining.value ?? 0} 个协作席位；单项目最多 ${workspaceProjectSeatLimit.value} 人`

  const estimate = workspaceBillingEstimate.value
  if (estimate)
    return `剩余 ${seatRemaining.value ?? 0} 个协作席位；单项目最多 ${estimate.defaultProjectSeatLimit} 人`

  return '当前 Team 项目台暂未配置席位配额。'
})

const aiQuotaSummaryText = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return `${quota.aiQuotaUsed}/${Math.max(quota.aiQuotaTotal, quota.aiQuotaUsed)} credits`

  const estimate = workspaceBillingEstimate.value
  if (estimate)
    return `${estimate.aiQuotaTotal} credits`

  return '未配置'
})

const aiQuotaDetailText = computed(() => {
  const quota = currentWorkspaceQuota.value
  if (quota)
    return `剩余 ${aiRemaining.value ?? 0} credits`

  const estimate = workspaceBillingEstimate.value
  if (estimate)
    return `默认可用 ${estimate.includedAiQuota} credits`

  return '当前 Team 项目台暂未配置 AI 配额。'
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

const userInitial = computed(() => {
  return resolveInitial(props.userName)
})

const memberSummaryText = computed(() => {
  const totalMembers = workspaceMembers.value.length
  if (!totalMembers)
    return '当前工作空间暂无成员记录。'
  return `当前共 ${totalMembers} 位成员${isPersonalWorkspace.value ? '，个人空间最多邀请 15 人协作' : ''}。`
})

const pendingWorkspaceInvitations = computed(() => {
  return workspaceInvitations.value.filter(item => !item.acceptedAt && !item.isExpired)
})

const workspaceInvitationPendingCount = computed(() => pendingWorkspaceInvitations.value.length)

const workspaceMembersPreview = computed(() => workspaceMembers.value.slice(0, 6))
const workspaceMemberOverflowCount = computed(() => Math.max(0, workspaceMembers.value.length - workspaceMembersPreview.value.length))
const authSessionsPreview = computed(() => authSessions.value.slice(0, 10))

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

const workspaceInvitationRoleHint = computed(() => {
  if (isPersonalWorkspace.value)
    return '个人工作空间仅支持邀请成员角色。'
  if (workspacePrimaryRole.value === 'manager')
    return '协作管理员仅可邀请成员。'
  if (!canInviteWorkspaceMembers.value)
    return '当前账号无工作空间邀请权限。'
  return '可生成工作空间邀请链接并发送给协作者。'
})

const loginHistorySummaryText = computed(() => {
  if (!authSessions.value.length)
    return '当前账号暂无可见登录历史。'
  return `最近记录 ${authSessions.value.length} 次登录会话，当前仅展示登录时间与会话状态。`
})

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
  activeTab.value = tabId
}

function closeDialog() {
  if (loggingOut.value)
    return
  visibleModel.value = false
}

function resetDialogState() {
  activeTab.value = 'overview'
  actionError.value = ''
  clearWorkspaceCopyFeedback()
  clearWorkspaceInvitationCopyFeedback()
  workspaceBillingEstimate.value = null
  workspaceMembers.value = []
  workspaceInvitations.value = []
  workspaceMemberError.value = ''
  workspaceInvitationError.value = ''
  workspaceInvitationSuccess.value = ''
  workspaceInvitationLink.value = ''
  workspaceInviteeUsername.value = ''
  workspaceInviteExpiresInDays.value = 7
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

async function loadWorkspaceMemberManagement(workspaceId: string) {
  const normalizedWorkspaceId = String(workspaceId || '').trim()
  if (!normalizedWorkspaceId) {
    workspaceMemberLoading.value = false
    workspaceMembers.value = []
    workspaceInvitations.value = []
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
    workspaceMembers.value = Array.isArray(response.data.members) ? response.data.members : []
    workspaceInvitations.value = Array.isArray(response.data.invitations) ? response.data.invitations : []
  }
  catch (error: any) {
    if (requestSeq !== workspaceMemberSnapshotSeq || currentWorkspaceId.value !== normalizedWorkspaceId)
      return
    workspaceMembers.value = []
    workspaceInvitations.value = []
    workspaceMemberError.value = String(error?.data?.message || '工作空间成员信息加载失败。')
  }
  finally {
    if (requestSeq === workspaceMemberSnapshotSeq)
      workspaceMemberLoading.value = false
  }
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

async function refreshDialogData() {
  await Promise.allSettled([
    loadAuthMeta(),
    loadFeishuBindStatus(),
    loadCasdoorBindStatus(),
    loadFeishuAudits(),
    loadAuthSessions(),
    loadWorkspaceBillingEstimate(currentWorkspaceId.value),
    loadWorkspaceMemberManagement(currentWorkspaceId.value),
  ])
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
    if (!visible)
      return
    resetDialogState()
    void refreshDialogData()
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

watch(currentWorkspaceId, (workspaceId) => {
  if (!props.visible)
    return
  workspaceInvitationSubmitting.value = false
  workspaceInvitationError.value = ''
  workspaceInvitationSuccess.value = ''
  workspaceInvitationLink.value = ''
  clearWorkspaceInvitationCopyFeedback()
  void Promise.allSettled([
    loadWorkspaceBillingEstimate(workspaceId),
    loadWorkspaceMemberManagement(workspaceId),
  ])
})

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
      <div class="border border-slate-200 rounded-[28px] bg-white flex flex-col h-full max-h-[88vh] max-w-[1100px] w-full shadow-2xl overflow-hidden lg:h-[720px] lg:max-h-[720px]">
        <div class="flex flex-1 flex-col min-h-0 lg:flex-row">
          <aside class="border-b border-slate-200 bg-slate-50 flex shrink-0 flex-col lg:border-b-0 lg:border-r lg:w-[244px]">
            <div class="px-4 pb-2 pt-4 flex items-center lg:px-5 lg:pb-3 lg:pt-5">
              <button
                class="text-slate-500 rounded-full flex h-10 w-10 transition items-center justify-center hover:text-slate-800 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="loggingOut"
                @click="closeDialog"
              >
                <span class="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <div class="px-4 pb-4 flex gap-2 overflow-x-auto lg:px-5 lg:pb-5 lg:flex-1 lg:flex-col lg:overflow-y-auto">
              <button
                v-for="tab in tabItems"
                :key="tab.id"
                type="button"
                class="user-settings-tab"
                :class="{ 'is-active': activeTab === tab.id }"
                @click="selectTab(tab.id)"
              >
                <span class="material-symbols-outlined text-[18px]">{{ tab.icon }}</span>
                <span>{{ tab.label }}</span>
              </button>
            </div>
          </aside>

          <section class="bg-white flex flex-1 flex-col min-h-0">
            <div class="px-5 py-5 border-b border-slate-200 sm:px-6">
              <p class="text-2xl text-slate-900 font-semibold">
                {{ activeTabMeta.label }}
              </p>
              <p class="text-sm text-slate-500 mt-2">
                {{ activeTabMeta.description }}
              </p>
            </div>

            <div class="px-5 py-5 flex-1 min-h-0 overflow-y-auto sm:px-6">
              <div v-if="activeTab === 'overview'" class="user-settings-panel">
                <div class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      账号信息
                    </p>
                    <p class="user-settings-row__desc">
                      当前登录账号、身份标签与工作空间角色。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="user-settings-profile-card">
                      <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap gap-2 items-center">
                          <p class="text-base text-slate-900 font-semibold">
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
                        <div class="mt-3 flex flex-wrap gap-2">
                          <span class="user-settings-chip user-settings-chip--strong">
                            {{ workspaceRoleLabel }}
                          </span>
                          <span
                            v-if="currentWorkspace"
                            class="user-settings-chip"
                          >
                            {{ formatWorkspaceTypeLabel(currentWorkspace.workspace.type) }}
                          </span>
                        </div>
                      </div>
                      <div class="user-settings-avatar">
                        {{ userInitial }}
                      </div>
                    </div>
                  </div>
                </div>

                <template v-if="currentWorkspace">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间详情
                      </p>
                      <p class="user-settings-row__desc">
                        当前用于展示配额、成员与邀请信息的工作空间。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--start">
                      <div class="user-settings-detail-card">
                        <div class="flex flex-wrap gap-2 items-center">
                          <span class="text-base text-slate-900 font-semibold">{{ currentWorkspace.workspace.name }}</span>
                          <span class="text-[11px] text-slate-600 font-medium px-2.5 py-1 border border-slate-200 rounded-full bg-slate-50 inline-flex">
                            {{ formatWorkspaceTypeLabel(currentWorkspace.workspace.type) }}
                          </span>
                        </div>
                        <div class="user-settings-code-row">
                          <code class="text-xs text-slate-500 font-mono break-all">{{ currentWorkspace.workspace.id }}</code>
                          <button class="user-settings-icon-btn" title="复制工作空间 UUID" @click="copyWorkspaceId">
                            <span class="material-symbols-outlined text-[16px]">content_copy</span>
                          </button>
                        </div>
                        <p class="text-sm text-slate-500">
                          工作空间 UUID 可用于排查、授权配置和成员协作确认。
                        </p>
                        <p v-if="workspaceCopyFeedback" class="text-xs text-slate-500">
                          {{ workspaceCopyFeedback }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        协作席位
                      </p>
                      <p class="user-settings-row__desc">
                        当前工作空间协作席位使用情况。
                      </p>
                    </div>
                    <div class="user-settings-row__content">
                      <p :class="hasWorkspaceUsageMetrics ? 'user-settings-stat' : 'user-settings-value-text'">
                        {{ seatSummaryText }}
                      </p>
                      <p class="text-sm text-slate-500">
                        {{ seatDetailText }}
                      </p>
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
                    <div class="user-settings-row__content">
                      <p class="text-base text-slate-900 font-medium">
                        {{ quotaUpdatedAtText }}
                      </p>
                    </div>
                  </div>
                </template>

                <div v-else class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      当前项目台
                    </p>
                    <p class="user-settings-row__desc">
                      当前账号暂无可见项目台信息。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                      当前账号暂无可见项目台信息。
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="activeTab === 'ai'" class="user-settings-panel">
                <template v-if="currentWorkspace">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        AI 配额
                      </p>
                      <p class="user-settings-row__desc">
                        当前工作空间 AI credits 配额与默认额度说明。
                      </p>
                    </div>
                    <div class="user-settings-row__content">
                      <p :class="hasWorkspaceUsageMetrics ? 'user-settings-stat' : 'user-settings-value-text'">
                        {{ aiQuotaSummaryText }}
                      </p>
                      <p class="text-sm text-slate-500">
                        {{ aiQuotaDetailText }}
                      </p>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间
                      </p>
                      <p class="user-settings-row__desc">
                        当前正在查看的 AI 配额归属空间。
                      </p>
                    </div>
                    <div class="user-settings-row__content">
                      <div class="user-settings-inline-value">
                        <span class="text-base text-slate-900 font-semibold">{{ currentWorkspace.workspace.name }}</span>
                        <span class="user-settings-chip">
                          {{ formatWorkspaceTypeLabel(currentWorkspace.workspace.type) }}
                        </span>
                      </div>
                      <p class="text-sm text-slate-500">
                        配额更新时间：{{ quotaUpdatedAtText }}
                      </p>
                    </div>
                  </div>
                </template>

                <div v-else class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      AI 配额
                    </p>
                    <p class="user-settings-row__desc">
                      当前账号暂无可见工作空间信息。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                      当前账号暂无可见工作空间信息。
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="activeTab === 'members'" class="user-settings-panel">
                <template v-if="currentWorkspace">
                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        工作空间成员
                      </p>
                      <p class="user-settings-row__desc">
                        查看当前成员与待处理邀请。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--start">
                      <div class="user-settings-member-toolbar">
                        <div class="min-w-0">
                          <p class="text-base text-slate-900 font-medium">
                            {{ memberSummaryText }}
                          </p>
                          <p class="text-sm text-slate-500 mt-1">
                            待处理邀请 {{ workspaceInvitationPendingCount }} 条
                          </p>
                        </div>
                        <button class="user-settings-btn user-settings-btn--compact" :disabled="workspaceMemberLoading" @click="loadWorkspaceMemberManagement(currentWorkspaceId)">
                          {{ workspaceMemberLoading ? '刷新中...' : '刷新成员' }}
                        </button>
                      </div>

                      <p v-if="workspaceMemberError" class="user-settings-feedback user-settings-feedback--danger w-full">
                        {{ workspaceMemberError }}
                      </p>

                      <div v-else-if="workspaceMembersPreview.length > 0" class="user-settings-member-list">
                        <div
                          v-for="member in workspaceMembersPreview"
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
                            <p class="text-xs text-slate-500">
                              {{ formatDateTime(member.joinedAt) }}
                            </p>
                          </div>
                          <span class="user-settings-chip">
                            {{ resolveMemberRoleLabel(member) }}
                          </span>
                        </div>
                      </div>

                      <div v-else class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                        {{ workspaceMemberLoading ? '成员信息加载中...' : '当前工作空间暂无成员记录。' }}
                      </div>

                      <p v-if="workspaceMemberOverflowCount > 0" class="text-xs text-slate-500">
                        还有 {{ workspaceMemberOverflowCount }} 位成员未在此处展开显示。
                      </p>
                    </div>
                  </div>

                  <div class="user-settings-row">
                    <div class="user-settings-row__heading">
                      <p class="user-settings-row__title">
                        邀请协作者
                      </p>
                      <p class="user-settings-row__desc">
                        生成工作空间邀请链接并分配空间角色。
                      </p>
                    </div>
                    <div class="user-settings-row__content user-settings-row__content--start">
                      <div class="user-settings-invite-panel">
                        <div class="user-settings-invite-panel__header">
                          <div>
                            <p class="text-sm text-slate-900 font-semibold">
                              邀请协作者
                            </p>
                            <p class="text-xs text-slate-500 mt-1">
                              {{ workspaceInvitationRoleHint }}
                            </p>
                          </div>
                        </div>

                        <div class="user-settings-invite-form">
                          <label class="user-settings-field">
                            <span class="user-settings-field__label">指定用户名</span>
                            <input
                              v-model="workspaceInviteeUsername"
                              type="text"
                              class="user-settings-input"
                              placeholder="可选，不填则任意可加入"
                              :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
                            >
                          </label>
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
                          <div class="user-settings-invite-form__actions">
                            <button
                              class="user-settings-btn user-settings-btn--primary w-full sm:w-auto"
                              :disabled="workspaceInvitationSubmitting || !canInviteWorkspaceMembers"
                              @click="createWorkspaceInvitation"
                            >
                              {{ workspaceInvitationSubmitting ? '生成中...' : '生成邀请链接' }}
                            </button>
                          </div>
                        </div>

                        <p v-if="workspaceInvitationError" class="user-settings-feedback user-settings-feedback--danger w-full">
                          {{ workspaceInvitationError }}
                        </p>
                        <p v-if="workspaceInvitationSuccess" class="user-settings-feedback user-settings-feedback--success w-full">
                          {{ workspaceInvitationSuccess }}
                        </p>

                        <div v-if="workspaceInvitationLink" class="user-settings-link-card">
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
                      </div>
                    </div>
                  </div>
                </template>

                <div v-else class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      工作空间成员
                    </p>
                    <p class="user-settings-row__desc">
                      当前账号暂无可见工作空间信息。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                      当前账号暂无可见工作空间信息。
                    </div>
                  </div>
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

              <div v-else-if="activeTab === 'loginHistory'" class="user-settings-panel">
                <div class="user-settings-row">
                  <div class="user-settings-row__heading">
                    <p class="user-settings-row__title">
                      个人登录历史
                    </p>
                    <p class="user-settings-row__desc">
                      当前仅展示登录时间、会话有效期与会话状态。
                    </p>
                  </div>
                  <div class="user-settings-row__content user-settings-row__content--start">
                    <div class="user-settings-member-toolbar">
                      <div class="min-w-0">
                        <p class="text-base text-slate-900 font-medium">
                          {{ loginHistorySummaryText }}
                        </p>
                      </div>
                      <button class="user-settings-btn user-settings-btn--compact" :disabled="authSessionsLoading" @click="loadAuthSessions">
                        {{ authSessionsLoading ? '刷新中...' : '刷新历史' }}
                      </button>
                    </div>

                    <p v-if="authSessionsError" class="user-settings-feedback user-settings-feedback--danger w-full">
                      {{ authSessionsError }}
                    </p>

                    <div v-else-if="authSessionsPreview.length > 0" class="user-settings-session-list">
                      <div
                        v-for="session in authSessionsPreview"
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

                    <div v-else class="text-sm text-slate-500 px-4 py-4 border border-slate-200 rounded-2xl border-dashed bg-slate-50 w-full">
                      {{ authSessionsLoading ? '登录历史加载中...' : '当前账号暂无可见登录历史。' }}
                    </div>
                  </div>
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
    </div>
  </Teleport>
</template>

<style scoped>
.user-settings-panel {
  border-top: 1px solid #e2e8f0;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.user-settings-avatar {
  display: flex;
  height: 56px;
  width: 56px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: #0f172a;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
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

.user-settings-detail-card {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fbfdff;
}

.user-settings-code-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.user-settings-stat {
  color: #0f172a;
  font-size: 30px;
  font-weight: 600;
  line-height: 1.1;
}

.user-settings-value-text {
  color: #0f172a;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
}

.user-settings-member-toolbar {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.user-settings-member-list {
  display: grid;
  width: 100%;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.user-settings-member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
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

.user-settings-invite-panel {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
}

.user-settings-invite-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.user-settings-invite-form {
  display: grid;
  width: 100%;
  gap: 12px;
  grid-template-columns: minmax(0, 1.3fr) minmax(128px, 0.8fr) minmax(112px, 0.8fr) auto;
  align-items: end;
}

.user-settings-invite-form__actions {
  display: flex;
  justify-content: flex-end;
}

.user-settings-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
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
  display: inline-flex;
  min-width: max-content;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  padding: 11px 12px;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
}

.user-settings-tab:hover {
  background: #f8fafc;
  color: #0f172a;
}

.user-settings-tab.is-active {
  border-color: transparent;
  background: #eef4ff;
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

  .user-settings-profile-card,
  .user-settings-member-toolbar {
    flex-direction: column;
  }

  .user-settings-avatar {
    align-self: flex-start;
  }

  .user-settings-code-row {
    align-items: flex-start;
  }

  .user-settings-member-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .user-settings-invite-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .user-settings-invite-form__actions {
    justify-content: stretch;
  }
}
</style>
