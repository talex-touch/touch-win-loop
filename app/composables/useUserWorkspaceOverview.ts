import type { ComputedRef } from 'vue'
import type { ApiResponse, WorkspaceBillingEstimate, WorkspaceMemberRole, WorkspaceWithQuota } from '~~/shared/types/domain'

function formatResetCycleLabel(cycle: string | null | undefined): string {
  if (cycle === 'quarterly')
    return '每季度'
  if (cycle === 'yearly')
    return '每年'
  return '每月'
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

export function useUserWorkspaceOverview(options: {
  authApiFetch: <T>(url: string, init?: any) => Promise<T>
  currentWorkspace: ComputedRef<WorkspaceWithQuota | null>
  currentWorkspaceId: ComputedRef<string>
  currentWorkspaceQuota: ComputedRef<WorkspaceWithQuota['quota'] | null>
  isPersonalWorkspace: ComputedRef<boolean>
  workspacePrimaryRole: ComputedRef<WorkspaceMemberRole | ''>
  isPlatformAdminUser: boolean
  emitWorkspaceUpdated: (payload: { workspaceId: string, name: string }) => void
}) {
  const workspaceBillingEstimate = ref<WorkspaceBillingEstimate | null>(null)
  const workspaceNameEditing = ref(false)
  const workspaceNameDraft = ref('')
  const workspaceNameSaving = ref(false)
  const workspaceNameError = ref('')
  const workspaceNameSuccess = ref('')
  const workspaceCopyFeedback = ref('')

  let workspaceCopyFeedbackTimer: ReturnType<typeof setTimeout> | null = null
  let workspaceBillingEstimateSeq = 0

  const workspaceProjectSeatLimit = computed(() => {
    if (workspaceBillingEstimate.value?.defaultProjectSeatLimit)
      return workspaceBillingEstimate.value.defaultProjectSeatLimit
    return 15
  })

  const seatCapacity = computed(() => {
    const quota = options.currentWorkspaceQuota.value
    if (quota)
      return Math.max(quota.seatLimit, quota.seatUsed)

    const estimate = workspaceBillingEstimate.value
    if (estimate)
      return Math.max(estimate.includedSeats, estimate.seatUsed)

    return 0
  })

  const seatRemaining = computed(() => {
    const seatUsed = options.currentWorkspaceQuota.value?.seatUsed ?? workspaceBillingEstimate.value?.seatUsed ?? 0
    return Math.max(0, seatCapacity.value - seatUsed)
  })

  const seatSummaryText = computed(() => {
    const seatUsed = options.currentWorkspaceQuota.value?.seatUsed ?? workspaceBillingEstimate.value?.seatUsed ?? 0
    return seatCapacity.value ? `${seatUsed}/${seatCapacity.value}` : '未配置'
  })

  const seatDetailText = computed(() => {
    if (!seatCapacity.value)
      return '当前工作空间暂未配置成员席位信息。'
    if (options.isPersonalWorkspace.value)
      return `这里指当前工作空间可容纳的协作成员席位；个人空间最多邀请 ${seatCapacity.value} 人协作，每个项目最多 ${workspaceProjectSeatLimit.value} 人。`
    return `这里指当前工作空间可容纳的协作成员席位；剩余 ${seatRemaining.value} 个成员席位，每个项目最多 ${workspaceProjectSeatLimit.value} 人。`
  })

  const quotaResetCycleText = computed(() => {
    return formatResetCycleLabel(options.currentWorkspaceQuota.value?.resetCycle || workspaceBillingEstimate.value?.billingCycle)
  })

  const quotaUpdatedAtText = computed(() => {
    const quota = options.currentWorkspaceQuota.value
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
    return options.isPersonalWorkspace.value ? 'Personal' : 'Business'
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

  const canRenameCurrentWorkspace = computed(() => {
    if (!options.currentWorkspace.value)
      return false
    if (options.isPlatformAdminUser)
      return true
    if (options.currentWorkspace.value.workspace.type === 'personal')
      return options.workspacePrimaryRole.value === 'owner'
    return options.workspacePrimaryRole.value === 'owner' || options.workspacePrimaryRole.value === 'admin'
  })

  const canSubmitWorkspaceName = computed(() => {
    if (!options.currentWorkspace.value || !canRenameCurrentWorkspace.value || workspaceNameSaving.value)
      return false
    const normalizedDraft = String(workspaceNameDraft.value || '').trim()
    if (!normalizedDraft)
      return false
    return normalizedDraft !== String(options.currentWorkspace.value.workspace.name || '').trim()
  })

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

  function clearWorkspaceNameFeedback() {
    workspaceNameError.value = ''
    workspaceNameSuccess.value = ''
  }

  function syncWorkspaceNameDraft() {
    workspaceNameDraft.value = String(options.currentWorkspace.value?.workspace.name || '').trim()
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

  async function copyWorkspaceId() {
    const workspaceId = String(options.currentWorkspace.value?.workspace.id || '').trim()
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

  async function loadWorkspaceBillingEstimate(workspaceId: string) {
    const normalizedWorkspaceId = String(workspaceId || '').trim()
    if (!normalizedWorkspaceId) {
      workspaceBillingEstimate.value = null
      return
    }

    const requestSeq = ++workspaceBillingEstimateSeq
    try {
      const response = await options.authApiFetch<ApiResponse<WorkspaceBillingEstimate>>(`/teams/${normalizedWorkspaceId}/billing/estimate`)
      if (requestSeq !== workspaceBillingEstimateSeq || options.currentWorkspaceId.value !== normalizedWorkspaceId)
        return
      workspaceBillingEstimate.value = response.data
    }
    catch {
      if (requestSeq === workspaceBillingEstimateSeq && options.currentWorkspaceId.value === normalizedWorkspaceId)
        workspaceBillingEstimate.value = null
    }
  }

  async function saveWorkspaceName() {
    const normalizedWorkspaceId = String(options.currentWorkspaceId.value || '').trim()
    if (!normalizedWorkspaceId || !canSubmitWorkspaceName.value)
      return

    workspaceNameSaving.value = true
    clearWorkspaceNameFeedback()
    try {
      const response = await options.authApiFetch<ApiResponse<{ team: WorkspaceWithQuota['workspace'] }>>(`/teams/${normalizedWorkspaceId}`, {
        method: 'PATCH',
        body: {
          name: String(workspaceNameDraft.value || '').trim(),
        },
      })
      const nextName = String(response.data?.team?.name || workspaceNameDraft.value || '').trim()
      workspaceNameDraft.value = nextName
      workspaceNameEditing.value = false
      workspaceNameSuccess.value = '工作空间名称已更新。'
      options.emitWorkspaceUpdated({
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

  function resetWorkspaceOverviewState() {
    workspaceBillingEstimate.value = null
    workspaceNameEditing.value = false
    workspaceNameSaving.value = false
    clearWorkspaceNameFeedback()
    syncWorkspaceNameDraft()
    clearWorkspaceCopyFeedback()
  }

  watch(options.currentWorkspace, () => {
    syncWorkspaceNameDraft()
  }, { immediate: true })

  onBeforeUnmount(() => {
    clearWorkspaceCopyFeedback()
  })

  return {
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
    clearWorkspaceNameFeedback,
    syncWorkspaceNameDraft,
    openWorkspaceNameEditor,
    cancelWorkspaceNameEdit,
    copyWorkspaceId,
    loadWorkspaceBillingEstimate,
    saveWorkspaceName,
    resetWorkspaceOverviewState,
  }
}
