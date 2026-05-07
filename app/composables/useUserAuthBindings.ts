import type {
  ApiResponse,
  AuthLoginMeta,
  FeishuAuthAuditItem,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuIntegrationConfig,
  OAuthAuthBindStatus,
} from '~~/shared/types/domain'

const DEFAULT_OAUTH_DISPLAY_NAME = '第三方 OAuth'

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
  const feishuBindRequestError = ref('')
  const feishuBindRouteError = ref('')
  const feishuBindSuccess = ref('')
  const feishuBindStatus = ref<FeishuAuthBindStatus | null>(null)
  const feishuMeta = ref<FeishuIntegrationConfig | null>(null)
  const feishuAudits = ref<FeishuAuthAuditItem[]>([])
  const feishuConflictCode = ref('')
  const feishuBoundUser = ref('')
  const oauthEnabled = ref(false)
  const oauthDisplayName = ref(DEFAULT_OAUTH_DISPLAY_NAME)
  const oauthBindLoading = ref(false)
  const oauthBindRedirecting = ref(false)
  const oauthBindRequestError = ref('')
  const oauthBindRouteError = ref('')
  const oauthBindStatus = ref<OAuthAuthBindStatus | null>(null)
  const oauthConflictCode = ref('')
  const oauthBoundUser = ref('')

  const feishuBindError = computed(() => String(feishuBindRequestError.value || feishuBindRouteError.value || '').trim())
  const oauthBindError = computed(() => String(oauthBindRequestError.value || oauthBindRouteError.value || '').trim())
  const hasFeishuConflict = computed(() => Boolean(feishuConflictCode.value))
  const hasOauthConflict = computed(() => Boolean(oauthConflictCode.value))
  const feishuConflictTitle = computed(() => {
    if (feishuConflictCode.value === 'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER')
      return '飞书账号已绑定其他平台账号'
    if (feishuConflictCode.value === 'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY')
      return '当前平台账号已绑定其他飞书账号'
    return '飞书账号绑定冲突'
  })
  const oauthConflictTitle = computed(() => {
    if (oauthConflictCode.value === 'CASDOOR_IDENTITY_ALREADY_BOUND_OTHER_USER')
      return `${oauthDisplayName.value} 账号已绑定其他平台账号`
    if (oauthConflictCode.value === 'CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY')
      return `当前平台账号已绑定其他 ${oauthDisplayName.value} 身份`
    return `${oauthDisplayName.value} 账号绑定冲突`
  })

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

  function readOauthBindErrorFromRoute(): string {
    const bindError = readRouteQueryText('oauthBindError') || readRouteQueryText('casdoorBindError')
    const boundUser = readRouteQueryText('oauthBoundUser') || readRouteQueryText('casdoorBoundUser')
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

  function clearOauthBindQueryParamsFromUrl() {
    if (!import.meta.client)
      return

    const url = new URL(window.location.href)
    let changed = false
    for (const key of ['oauthBindError', 'oauthConflictCode', 'oauthBoundUser', 'casdoorBindError', 'casdoorConflictCode', 'casdoorBoundUser']) {
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

  function resolveCurrentRedirectTarget(fallback = '/dashboard'): string {
    if (import.meta.client) {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      if (currentPath.startsWith('/') && !currentPath.startsWith('//'))
        return currentPath
    }

    const routeTarget = String(options.route.fullPath || options.route.path || '').trim()
    if (routeTarget.startsWith('/') && !routeTarget.startsWith('//'))
      return routeTarget

    return fallback
  }

  function clearFeishuBindingFeedback(options: { includeRoute?: boolean } = {}) {
    feishuBindRequestError.value = ''
    feishuBindSuccess.value = ''
    if (!options.includeRoute)
      return

    feishuBindRouteError.value = ''
    feishuConflictCode.value = ''
    feishuBoundUser.value = ''
  }

  function clearOauthBindingFeedback(options: { includeRoute?: boolean } = {}) {
    oauthBindRequestError.value = ''
    if (!options.includeRoute)
      return

    oauthBindRouteError.value = ''
    oauthConflictCode.value = ''
    oauthBoundUser.value = ''
  }

  async function loadAuthMeta() {
    try {
      const response = await options.authApiFetch<ApiResponse<AuthLoginMeta>>('/auth/meta')
      feishuMeta.value = response.data.feishu
      const oauthMeta = response.data.oauth || response.data.casdoor
      oauthEnabled.value = Boolean(oauthMeta?.enabled)
      oauthDisplayName.value = String(oauthMeta?.displayName || '').trim() || DEFAULT_OAUTH_DISPLAY_NAME
    }
    catch {
      feishuMeta.value = null
      oauthEnabled.value = false
      oauthDisplayName.value = DEFAULT_OAUTH_DISPLAY_NAME
    }
  }

  async function loadFeishuBindStatus() {
    feishuBindLoading.value = true
    feishuBindRequestError.value = ''
    try {
      const response = await options.authApiFetch<ApiResponse<FeishuAuthBindStatus>>('/auth/feishu/bind-status')
      feishuBindStatus.value = response.data
    }
    catch (error: any) {
      feishuBindStatus.value = null
      feishuBindRequestError.value = String(error?.data?.message || '飞书绑定状态加载失败。')
    }
    finally {
      feishuBindLoading.value = false
    }
  }

  async function loadOauthBindStatus() {
    oauthBindLoading.value = true
    oauthBindRequestError.value = ''
    try {
      const response = await options.authApiFetch<ApiResponse<OAuthAuthBindStatus>>('/auth/oauth/bind-status')
      oauthBindStatus.value = response.data
    }
    catch (error: any) {
      oauthBindStatus.value = null
      oauthBindRequestError.value = String(error?.data?.message || `${oauthDisplayName.value} 绑定状态加载失败。`)
    }
    finally {
      oauthBindLoading.value = false
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

    clearFeishuBindingFeedback({ includeRoute: true })
    if (!feishuMeta.value)
      await loadAuthMeta()

    if (!feishuMeta.value?.enabled) {
      feishuBindRequestError.value = '飞书登录尚未启用，请联系管理员。'
      return
    }

    feishuBindRedirecting.value = true
    const redirectTarget = resolveCurrentRedirectTarget('/dashboard')
    window.location.href = options.endpoint(`/auth/feishu/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
  }

  async function startOauthBind() {
    if (!import.meta.client || oauthBindRedirecting.value)
      return

    clearOauthBindingFeedback({ includeRoute: true })
    if (!oauthEnabled.value)
      await loadAuthMeta()

    if (!oauthEnabled.value) {
      oauthBindRequestError.value = `${oauthDisplayName.value} 登录尚未启用，请联系管理员。`
      return
    }

    oauthBindRedirecting.value = true
    const redirectTarget = resolveCurrentRedirectTarget('/dashboard')
    window.location.href = options.endpoint(`/auth/oauth/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
  }

  function openFeishuUnbindConfirm() {
    clearFeishuBindingFeedback()
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
      feishuBindRequestError.value = '当前账号未绑定飞书。'
      return
    }

    const normalized = String(feishuUnbindConfirmText.value || '').trim().toUpperCase()
    if (normalized !== 'UNBIND') {
      feishuBindRequestError.value = '请输入确认口令 UNBIND 后再解绑。'
      return
    }

    feishuUnbinding.value = true
    clearFeishuBindingFeedback()
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
      feishuBindRequestError.value = String(error?.data?.message || '解绑飞书失败，请稍后重试。')
    }
    finally {
      feishuUnbinding.value = false
    }
  }

  function resetAuthBindingState() {
    feishuBindRequestError.value = ''
    feishuBindRouteError.value = readFeishuBindErrorFromRoute()
    feishuConflictCode.value = readRouteQueryText('feishuConflictCode')
    feishuBoundUser.value = readRouteQueryText('feishuBoundUser')
    feishuBindSuccess.value = ''
    oauthBindRequestError.value = ''
    oauthBindRouteError.value = readOauthBindErrorFromRoute()
    oauthConflictCode.value = readRouteQueryText('oauthConflictCode') || readRouteQueryText('casdoorConflictCode')
    oauthBoundUser.value = readRouteQueryText('oauthBoundUser') || readRouteQueryText('casdoorBoundUser')
    feishuUnbindConfirmVisible.value = false
    feishuUnbindConfirmText.value = ''
    clearFeishuBindQueryParamsFromUrl()
    clearOauthBindQueryParamsFromUrl()
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
    hasFeishuConflict,
    feishuConflictTitle,
    feishuConflictCode,
    feishuBoundUser,
    oauthEnabled,
    oauthDisplayName,
    oauthBindLoading,
    oauthBindRedirecting,
    oauthBindError,
    oauthBindStatus,
    hasOauthConflict,
    oauthConflictTitle,
    oauthConflictCode,
    oauthBoundUser,
    formatAuditAction,
    readFeishuBindErrorFromRoute,
    readOauthBindErrorFromRoute,
    loadAuthMeta,
    loadFeishuBindStatus,
    loadOauthBindStatus,
    loadFeishuAudits,
    startFeishuBind,
    startOauthBind,
    openFeishuUnbindConfirm,
    cancelFeishuUnbindConfirm,
    unbindFeishu,
    resetAuthBindingState,
  }
}
