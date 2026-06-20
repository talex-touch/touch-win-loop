import type { ApiResponse, AuthSessionHistoryItem } from '~~/shared/types/domain'

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

export function useUserSessionHistory(options: {
  authApiFetch: <T>(url: string, init?: any) => Promise<T>
}) {
  const authSessions = ref<AuthSessionHistoryItem[]>([])
  const authSessionsLoading = ref(false)
  const authSessionsError = ref('')

  async function loadAuthSessions() {
    authSessionsLoading.value = true
    authSessionsError.value = ''
    try {
      const response = await options.authApiFetch<ApiResponse<AuthSessionHistoryItem[]>>('/auth/sessions?limit=10')
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

  function resetAuthSessionState() {
    authSessions.value = []
    authSessionsError.value = ''
    authSessionsLoading.value = false
  }

  return {
    authSessions,
    authSessionsLoading,
    authSessionsError,
    formatSessionStatusLabel,
    resolveSessionStatusClass,
    loadAuthSessions,
    resetAuthSessionState,
  }
}
