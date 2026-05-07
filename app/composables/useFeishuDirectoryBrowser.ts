import type {
  ApiResponse,
  FeishuDirectoryContactScopeSummary,
  FeishuDirectoryDepartment,
  FeishuDirectoryDiagnosticCode,
  FeishuDirectoryFetchStatus,
  FeishuDirectorySearchResult,
  FeishuDirectoryStatus,
  FeishuDirectoryUserCandidate,
} from '~~/shared/types/domain'

interface UseFeishuDirectoryBrowserInput {
  endpoint: (path: string) => string
  canSearch: () => boolean
  onError?: (message: string) => void
}

export function useFeishuDirectoryBrowser(input: UseFeishuDirectoryBrowserInput) {
  const loading = ref(false)
  const members = ref<FeishuDirectoryUserCandidate[]>([])
  const departments = ref<FeishuDirectoryDepartment[]>([])
  const rootDepartmentId = ref('')
  const notice = ref('')
  const source = ref<'tenant' | 'group_fallback' | ''>('')
  const fromCache = ref(false)
  const fetchedAt = ref('')
  const cacheExpiresAt = ref('')
  const totalMembers = ref(0)
  const permissionHint = ref('')
  const directoryStatus = ref<FeishuDirectoryStatus>('unavailable')
  const memberListStatus = ref<FeishuDirectoryFetchStatus>('failed')
  const departmentTreeStatus = ref<FeishuDirectoryFetchStatus>('failed')
  const contactScopeStatus = ref<FeishuDirectoryFetchStatus>('failed')
  const contactScopeSummary = ref<FeishuDirectoryContactScopeSummary | null>(null)
  const contactScopeErrorMessage = ref('')
  const diagnosticCode = ref<FeishuDirectoryDiagnosticCode>('directory_unavailable')
  const diagnosticMessage = ref('')

  function reset() {
    members.value = []
    departments.value = []
    rootDepartmentId.value = ''
    notice.value = ''
    source.value = ''
    fromCache.value = false
    fetchedAt.value = ''
    cacheExpiresAt.value = ''
    totalMembers.value = 0
    permissionHint.value = ''
    directoryStatus.value = 'unavailable'
    memberListStatus.value = 'failed'
    departmentTreeStatus.value = 'failed'
    contactScopeStatus.value = 'failed'
    contactScopeSummary.value = null
    contactScopeErrorMessage.value = ''
    diagnosticCode.value = 'directory_unavailable'
    diagnosticMessage.value = ''
  }

  async function load(forceRefresh = false) {
    if (!input.canSearch()) {
      reset()
      return
    }

    loading.value = true
    try {
      const refreshQuery = forceRefresh ? '?refresh=1' : ''
      const response = await fetch(String(input.endpoint(`/admin/integrations/feishu/admin-feishu-users${refreshQuery}`)), {
        credentials: 'include',
      })
      const payload = await response.json() as ApiResponse<FeishuDirectorySearchResult>
      if (!response.ok)
        throw new Error(String(payload?.message || '飞书成员目录加载失败。'))

      members.value = payload.data.items || []
      departments.value = payload.data.departments || []
      rootDepartmentId.value = String(payload.data.rootDepartmentId || '')
      notice.value = String(payload.data.notice || '')
      source.value = payload.data.source || ''
      fromCache.value = Boolean(payload.data.fromCache)
      fetchedAt.value = String(payload.data.fetchedAt || '')
      cacheExpiresAt.value = String(payload.data.cacheExpiresAt || '')
      totalMembers.value = Number(payload.data.totalMembers || 0)
      permissionHint.value = String(payload.data.permissionHint || '')
      directoryStatus.value = payload.data.directoryStatus || 'unavailable'
      memberListStatus.value = payload.data.memberListStatus || 'failed'
      departmentTreeStatus.value = payload.data.departmentTreeStatus || 'failed'
      contactScopeStatus.value = payload.data.contactScopeStatus || 'failed'
      contactScopeSummary.value = payload.data.contactScopeSummary || null
      contactScopeErrorMessage.value = String(payload.data.contactScopeErrorMessage || '')
      diagnosticCode.value = payload.data.diagnosticCode || 'directory_unavailable'
      diagnosticMessage.value = String(payload.data.diagnosticMessage || '')
    }
    catch (error: any) {
      const message = String(error?.data?.message || error?.message || '飞书成员目录加载失败。')
      reset()
      notice.value = message
      diagnosticMessage.value = message
      if (input.onError)
        input.onError(message)
    }
    finally {
      loading.value = false
    }
  }

  return {
    loading,
    members,
    departments,
    rootDepartmentId,
    notice,
    source,
    fromCache,
    fetchedAt,
    cacheExpiresAt,
    totalMembers,
    permissionHint,
    directoryStatus,
    memberListStatus,
    departmentTreeStatus,
    contactScopeStatus,
    contactScopeSummary,
    contactScopeErrorMessage,
    diagnosticCode,
    diagnosticMessage,
    load,
    reset,
  }
}
