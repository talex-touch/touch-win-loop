import type {
  ApiResponse,
  AuthLoginMeta,
  CasdoorAuthBindStatus,
  FeishuAuthAuditItem,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuIntegrationConfig,
} from '~~/shared/types/domain'

function formatAuditAction(action: FeishuAuthAuditItem['action']): string {
  if (action === 'auth.feishu.bind.self')
    return '绑定飞书'
  return '解绑飞书'
}

export function useUserAuthBindings(options: {
  authApiFetch: <T>(url: string, init?: any) => Promise<T>
  endpoint: (path: string) => string
  route: ReturnType<typeof useRoute>
}) {
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

  function readRouteQueryText(name: string): string {
    if (import.meta.client) {
      const params = new URLSearchParams(window.location.search)
      return String(params.get(name) || '').trim()
    }
    const raw = options.route.query[name]
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

  async function loadAuthMeta() {
    try {
      const response = await options.authApiFetch<ApiResponse<AuthLoginMeta>>('/auth/meta')
      feishuMeta.value = response.data.feishu
      casdoorEnabled.value = Boolean(response.data.casdoor?.enabled)
    }
    catch {
      feishuMeta.value = null
      casdoorEnabled.value = false
    }
  }

  async function loadFeishuBindStatus() {
    feishuBindLoading.value = true
    feishuBindError.value = ''
    try {
      const response = await options.authApiFetch<ApiResponse<FeishuAuthBindStatus>>('/auth/feishu/bind-status')
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
      const response = await options.authApiFetch<ApiResponse<CasdoorAuthBindStatus>>('/auth/casdoor/bind-status')
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

  async function loadFeishuAudits() {
    feishuAuditLoading.value = true
    try {
      const response = await options.authApiFetch<ApiResponse<FeishuAuthAuditItem[]>>('/auth/feishu/audits?limit=8')
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
    const redirectTarget = options.route.fullPath && options.route.fullPath.startsWith('/') ? options.route.fullPath : '/dashboard'
    window.location.href = options.endpoint(`/auth/feishu/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
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
    const redirectTarget = options.route.fullPath && options.route.fullPath.startsWith('/') ? options.route.fullPath : '/dashboard'
    window.location.href = options.endpoint(`/auth/casdoor/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
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
      const response = await options.authApiFetch<ApiResponse<FeishuAuthUnbindResult>>('/auth/feishu/unbind', {
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

  function resetAuthBindingState() {
    feishuBindError.value = readFeishuBindErrorFromRoute()
    feishuBindSuccess.value = ''
    casdoorBindError.value = readCasdoorBindErrorFromRoute()
    feishuUnbindConfirmVisible.value = false
    feishuUnbindConfirmText.value = ''
    clearFeishuBindQueryParamsFromUrl()
    clearCasdoorBindQueryParamsFromUrl()
  }

  return {
    feishuBindLoading,
    feishuBindRedirecting,
    feishuUnbinding,
    feishuUnbindConfirmVisible,
    feishuUnbindConfirmText,
    feishuAuditLoading,
    feishuBindError,
    feishuBindSuccess,
    feishuBindStatus,
    feishuMeta,
    feishuAudits,
    casdoorEnabled,
    casdoorBindLoading,
    casdoorBindRedirecting,
    casdoorBindError,
    casdoorBindStatus,
    formatAuditAction,
    readFeishuBindErrorFromRoute,
    readCasdoorBindErrorFromRoute,
    loadAuthMeta,
    loadFeishuBindStatus,
    loadCasdoorBindStatus,
    loadFeishuAudits,
    startFeishuBind,
    startCasdoorBind,
    openFeishuUnbindConfirm,
    cancelFeishuUnbindConfirm,
    unbindFeishu,
    resetAuthBindingState,
  }
}
