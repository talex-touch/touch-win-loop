import type { ComputedRef } from 'vue'
import type {
  ApiResponse,
  InvitationWithToken,
  WorkspaceMemberManagementSnapshot,
  WorkspaceMemberRole,
  WorkspaceMemberSummary,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'

type EditableWorkspaceRole = 'admin' | 'manager' | 'member'

function resolvePrimaryRole(roles: WorkspaceMemberRole[] | null | undefined): WorkspaceMemberRole | '' {
  const rolePriority: WorkspaceMemberRole[] = ['owner', 'admin', 'manager', 'member']
  const normalizedRoles = Array.isArray(roles) ? roles : []
  return rolePriority.find(role => normalizedRoles.includes(role)) || ''
}

function normalizeEditableRole(role: WorkspaceMemberRole | ''): EditableWorkspaceRole {
  if (role === 'admin')
    return 'admin'
  if (role === 'manager')
    return 'manager'
  return 'member'
}

export function useUserWorkspaceMembership(options: {
  authApiFetch: <T>(url: string, init?: any) => Promise<T>
  currentWorkspace: ComputedRef<WorkspaceWithQuota | null>
  currentWorkspaceId: ComputedRef<string>
  currentUserId: ComputedRef<string>
  isPersonalWorkspace: ComputedRef<boolean>
  workspacePrimaryRole: ComputedRef<WorkspaceMemberRole | ''>
  isPlatformAdminUser: boolean
  resolveWorkspaceInvitationUrl: (token: string) => string
  formatWorkspaceRoleLabel: (role: WorkspaceMemberRole | '') => string
}) {
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
  const workspaceInvitationCopyFeedback = ref('')

  let workspaceInvitationCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
  let workspaceMemberSnapshotSeq = 0

  const pendingWorkspaceInvitations = computed(() => {
    return workspaceInvitations.value.filter(item => !item.acceptedAt && !item.isExpired)
  })

  const workspaceInvitationPendingCount = computed(() => pendingWorkspaceInvitations.value.length)

  const memberSummaryText = computed(() => {
    const totalMembers = workspaceMembers.value.length
    if (!totalMembers)
      return '当前工作空间暂无成员记录。'
    if (options.isPersonalWorkspace.value)
      return `当前共 ${totalMembers} 位成员，个人空间最多邀请 15 人协作。`
    return `当前共 ${totalMembers} 位成员，待处理邀请 ${workspaceInvitationPendingCount.value} 条。`
  })

  const inviteRoleOptions = computed<Array<{ value: WorkspaceMemberRole, label: string }>>(() => {
    if (!options.currentWorkspace.value)
      return []

    if (options.isPersonalWorkspace.value) {
      return [
        { value: 'member', label: '成员' },
      ]
    }

    if (options.workspacePrimaryRole.value === 'owner' || options.workspacePrimaryRole.value === 'admin') {
      return [
        { value: 'admin', label: '管理员' },
        { value: 'manager', label: '协作管理员' },
        { value: 'member', label: '成员' },
      ]
    }

    if (options.workspacePrimaryRole.value === 'manager') {
      return [
        { value: 'member', label: '成员' },
      ]
    }

    return []
  })

  const canInviteWorkspaceMembers = computed(() => inviteRoleOptions.value.length > 0)

  const editableRoleOptions = computed<Array<{ value: EditableWorkspaceRole, label: string }>>(() => {
    if (options.isPersonalWorkspace.value)
      return []
    return [
      { value: 'admin', label: '管理员' },
      { value: 'manager', label: '协作管理员' },
      { value: 'member', label: '成员' },
    ]
  })

  const canManageWorkspaceRoles = computed(() => {
    return options.isPlatformAdminUser || options.workspacePrimaryRole.value === 'owner' || options.workspacePrimaryRole.value === 'admin'
  })

  const workspaceInvitationRoleHint = computed(() => {
    if (options.isPersonalWorkspace.value)
      return '个人工作空间仅支持邀请成员角色；留空用户名时为通用邀请，可多人加入。'
    if (options.workspacePrimaryRole.value === 'manager')
      return '协作管理员仅可邀请成员；留空用户名时为通用邀请，可多人加入。'
    if (!canInviteWorkspaceMembers.value)
      return '当前账号无工作空间邀请权限。'
    return '可生成工作空间邀请链接并发送给协作者；留空用户名时为通用邀请，可多人加入，填写后仅指定账号可加入。'
  })

  function clearWorkspaceMemberActionFeedback() {
    workspaceMemberActionError.value = ''
    workspaceMemberActionSuccess.value = ''
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

  function resolveMemberPrimaryRole(member: WorkspaceMemberSummary | null | undefined): WorkspaceMemberRole | '' {
    return resolvePrimaryRole(member?.roles)
  }

  function resolveMemberRoleLabel(member: WorkspaceMemberSummary | null | undefined): string {
    return options.formatWorkspaceRoleLabel(resolveMemberPrimaryRole(member))
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

  function updateWorkspaceMemberRoleDraft(userId: string, role: EditableWorkspaceRole) {
    workspaceMemberRoleDrafts.value = {
      ...workspaceMemberRoleDrafts.value,
      [userId]: role,
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
      const response = await options.authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/members`)
      if (requestSeq !== workspaceMemberSnapshotSeq || options.currentWorkspaceId.value !== normalizedWorkspaceId)
        return
      applyWorkspaceMemberSnapshot(response.data)
    }
    catch (error: any) {
      if (requestSeq !== workspaceMemberSnapshotSeq || options.currentWorkspaceId.value !== normalizedWorkspaceId)
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
    if (!options.currentWorkspaceId.value) {
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
    const normalizedWorkspaceId = String(options.currentWorkspaceId.value || '').trim()
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
      const response = await options.authApiFetch<ApiResponse<InvitationWithToken>>(`/teams/${normalizedWorkspaceId}/invitations`, {
        method: 'POST',
        body: {
          inviteeUsername: String(workspaceInviteeUsername.value || '').trim() || undefined,
          role: workspaceInviteRole.value,
          expiresInDays: Math.max(1, Math.min(30, Number(workspaceInviteExpiresInDays.value || 7))),
        },
      })

      if (options.currentWorkspaceId.value !== normalizedWorkspaceId)
        return

      workspaceInvitationLink.value = options.resolveWorkspaceInvitationUrl(response.data.token)
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

  async function revokeWorkspaceInvitation(invitationId: string) {
    const normalizedWorkspaceId = String(options.currentWorkspaceId.value || '').trim()
    const normalizedInvitationId = String(invitationId || '').trim()
    if (!normalizedWorkspaceId || !normalizedInvitationId)
      return

    workspaceInvitationRevokingId.value = normalizedInvitationId
    clearWorkspaceMemberActionFeedback()
    try {
      const response = await options.authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/invitations/${normalizedInvitationId}/revoke`, {
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
    const normalizedWorkspaceId = String(options.currentWorkspaceId.value || '').trim()
    const nextRole = resolveMemberRoleDraft(member)
    if (!normalizedWorkspaceId || !canSubmitRoleChange(member))
      return

    workspaceMemberRoleSubmittingUserId.value = member.userId
    clearWorkspaceMemberActionFeedback()
    try {
      const response = await options.authApiFetch<ApiResponse<WorkspaceMemberManagementSnapshot>>(`/teams/${normalizedWorkspaceId}/members/${member.userId}/role`, {
        method: 'PATCH',
        body: {
          role: nextRole,
        },
      })
      applyWorkspaceMemberSnapshot(response.data)
      workspaceMemberActionSuccess.value = `已将 ${member.username} 调整为${options.formatWorkspaceRoleLabel(nextRole)}。`
    }
    catch (error: any) {
      workspaceMemberActionError.value = String(error?.data?.message || '更新成员权限失败，请稍后重试。')
    }
    finally {
      workspaceMemberRoleSubmittingUserId.value = ''
    }
  }

  function resetWorkspaceMembershipState() {
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
    clearWorkspaceInvitationCopyFeedback()
  }

  watch(inviteRoleOptions, (roles) => {
    if (roles.some(item => item.value === workspaceInviteRole.value))
      return
    workspaceInviteRole.value = roles[0]?.value || 'member'
  }, { immediate: true })

  onBeforeUnmount(() => {
    clearWorkspaceInvitationCopyFeedback()
  })

  return {
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
    resolveMemberRoleDraft,
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
  }
}
