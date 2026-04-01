import type {
  ApiResponse,
  FeishuDirectoryDepartment,
  FeishuDirectorySearchResult,
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
  }

  async function load(forceRefresh = false) {
    if (!input.canSearch()) {
      reset()
      return
    }

    loading.value = true
    try {
      const refreshQuery = forceRefresh ? '?refresh=1' : ''
      const response = await $fetch<ApiResponse<FeishuDirectorySearchResult>>(
        input.endpoint(`/admin/integrations/feishu/admin-feishu-users${refreshQuery}`),
      )

      members.value = response.data.items || []
      departments.value = response.data.departments || []
      rootDepartmentId.value = String(response.data.rootDepartmentId || '')
      notice.value = String(response.data.notice || '')
      source.value = response.data.source || ''
      fromCache.value = Boolean(response.data.fromCache)
      fetchedAt.value = String(response.data.fetchedAt || '')
      cacheExpiresAt.value = String(response.data.cacheExpiresAt || '')
      totalMembers.value = Number(response.data.totalMembers || 0)
      permissionHint.value = String(response.data.permissionHint || '')
    }
    catch (error: any) {
      const message = String(error?.data?.message || '飞书成员目录加载失败。')
      reset()
      notice.value = message
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
    load,
    reset,
  }
}
