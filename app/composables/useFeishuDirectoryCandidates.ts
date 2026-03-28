import type {
  ApiResponse,
  FeishuDirectorySearchResult,
  FeishuDirectoryUserCandidate,
} from '~~/shared/types/domain'

interface UseFeishuDirectoryCandidatesInput {
  endpoint: (path: string) => string
  canSearch: () => boolean
  onError?: (message: string) => void
}

export function useFeishuDirectoryCandidates(input: UseFeishuDirectoryCandidatesInput) {
  const keyword = ref('')
  const loading = ref(false)
  const candidates = ref<FeishuDirectoryUserCandidate[]>([])
  const notice = ref('')
  const source = ref<'tenant' | 'group_fallback' | ''>('')
  const fromCache = ref(false)
  const fetchedAt = ref('')
  const cacheExpiresAt = ref('')
  const totalMembers = ref(0)
  const permissionHint = ref('')

  function reset() {
    candidates.value = []
    notice.value = ''
    source.value = ''
    fromCache.value = false
    fetchedAt.value = ''
    cacheExpiresAt.value = ''
    totalMembers.value = 0
    permissionHint.value = ''
  }

  async function search(nextKeyword?: string, forceRefresh = false) {
    const normalizedKeyword = String(nextKeyword ?? keyword.value ?? '').trim()
    keyword.value = normalizedKeyword

    if (!input.canSearch()) {
      reset()
      return
    }

    loading.value = true
    try {
      const refreshQuery = forceRefresh ? '&refresh=1' : ''
      const response = await $fetch<ApiResponse<FeishuDirectorySearchResult>>(
        input.endpoint(`/admin/integrations/feishu/admin-feishu-users?keyword=${encodeURIComponent(normalizedKeyword)}&limit=20${refreshQuery}`),
      )

      candidates.value = response.data.items || []
      notice.value = String(response.data.notice || '')
      source.value = response.data.source || ''
      fromCache.value = Boolean(response.data.fromCache)
      fetchedAt.value = String(response.data.fetchedAt || '')
      cacheExpiresAt.value = String(response.data.cacheExpiresAt || '')
      totalMembers.value = Number(response.data.totalMembers || 0)
      permissionHint.value = String(response.data.permissionHint || '')
    }
    catch (error: any) {
      const message = String(error?.data?.message || '飞书成员搜索失败。')
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
    keyword,
    loading,
    candidates,
    notice,
    source,
    fromCache,
    fetchedAt,
    cacheExpiresAt,
    totalMembers,
    permissionHint,
    search,
    reset,
  }
}
