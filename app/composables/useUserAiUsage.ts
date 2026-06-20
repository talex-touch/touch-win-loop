import type { ComputedRef } from 'vue'
import type { ApiResponse, WorkspaceAiUsageHistory, WorkspaceBillingEstimate, WorkspaceWithQuota } from '~~/shared/types/domain'

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
    '/api/ai/workspace/document-completion/accept': '文档自动补齐',
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

export function useUserAiUsage(options: {
  authApiFetch: <T>(url: string, init?: any) => Promise<T>
  currentWorkspaceQuota: ComputedRef<WorkspaceWithQuota['quota'] | null>
  currentWorkspaceId: ComputedRef<string>
  workspaceBillingEstimate: ComputedRef<WorkspaceBillingEstimate | null>
}) {
  const aiUsage = ref<WorkspaceAiUsageHistory | null>(null)
  const aiUsageLoading = ref(false)
  const aiUsageError = ref('')
  const aiUsagePage = ref(1)
  let workspaceAiUsageSeq = 0

  const aiQuotaUsedCount = computed(() => {
    if (options.currentWorkspaceQuota.value)
      return Math.max(0, options.currentWorkspaceQuota.value.aiQuotaUsed)
    if (aiUsage.value)
      return Math.max(0, aiUsage.value.totalUnits)
    return 0
  })

  const aiQuotaTotalCount = computed(() => {
    if (options.currentWorkspaceQuota.value)
      return Math.max(options.currentWorkspaceQuota.value.aiQuotaTotal, aiQuotaUsedCount.value)
    if (options.workspaceBillingEstimate.value) {
      return Math.max(
        options.workspaceBillingEstimate.value.aiQuotaTotal,
        options.workspaceBillingEstimate.value.includedAiQuota,
        aiQuotaUsedCount.value,
      )
    }
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
    return formatResetCycleLabel(options.currentWorkspaceQuota.value?.resetCycle || options.workspaceBillingEstimate.value?.billingCycle)
  })

  const aiUsageMemberSummaries = computed(() => aiUsage.value?.memberSummaries || [])
  const aiUsageHistoryItems = computed(() => aiUsage.value?.items || [])
  const aiUsageTotalPages = computed(() => {
    if (!aiUsage.value?.pageSize)
      return 1
    return Math.max(1, Math.ceil((aiUsage.value.total || 0) / aiUsage.value.pageSize))
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
      const response = await options.authApiFetch<ApiResponse<WorkspaceAiUsageHistory>>(`/teams/${normalizedWorkspaceId}/ai/usage?page=${page}&pageSize=10`)
      if (requestSeq !== workspaceAiUsageSeq || options.currentWorkspaceId.value !== normalizedWorkspaceId)
        return
      aiUsage.value = response.data
      aiUsagePage.value = response.data.page || page
    }
    catch (error: any) {
      if (requestSeq !== workspaceAiUsageSeq || options.currentWorkspaceId.value !== normalizedWorkspaceId)
        return
      aiUsage.value = null
      aiUsageError.value = String(error?.data?.message || 'AI 消耗记录加载失败。')
    }
    finally {
      if (requestSeq === workspaceAiUsageSeq)
        aiUsageLoading.value = false
    }
  }

  async function changeAiUsagePage(nextPage: number) {
    const targetPage = Math.max(1, Math.min(aiUsageTotalPages.value, nextPage))
    if (targetPage === aiUsagePage.value)
      return
    aiUsagePage.value = targetPage
    await loadWorkspaceAiUsage(options.currentWorkspaceId.value, targetPage)
  }

  function resetAiUsageState() {
    aiUsage.value = null
    aiUsageError.value = ''
    aiUsageLoading.value = false
    aiUsagePage.value = 1
  }

  return {
    aiUsage,
    aiUsageLoading,
    aiUsageError,
    aiUsagePage,
    aiQuotaHeadlineText,
    aiQuotaUsageText,
    aiQuotaUsedCount,
    aiQuotaRemainingCount,
    quotaResetCycleText,
    aiUsageMemberSummaries,
    aiUsageHistoryItems,
    aiUsageTotalPages,
    formatAiRouteLabel,
    resolveMemberUsagePercent,
    resolveMemberUsageBarStyle,
    loadWorkspaceAiUsage,
    changeAiUsagePage,
    resetAiUsageState,
  }
}
