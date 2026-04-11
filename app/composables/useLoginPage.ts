import type { ApiResponse, AuthLoginMeta, AuthLoginResult, AuthMeResult } from '~~/shared/types/domain'

type OauthRedirectingProvider = 'feishu' | 'oauth' | ''
const DEFAULT_OAUTH_DISPLAY_NAME = '第三方 OAuth'

export function useLoginPage() {
  const route = useRoute()
  const authApiFetch = useAuthApiFetch()
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  const username = ref('')
  const password = ref('')
  const loading = ref(false)
  const errorText = ref('')
  const feishuLoading = ref(false)
  const authMeta = ref<AuthLoginMeta | null>(null)
  const oauthRedirectingProvider = ref<OauthRedirectingProvider>('')
  const feishuConflictCode = ref('')
  const feishuBoundUser = ref('')
  const oauthConflictCode = ref('')
  const oauthBoundUser = ref('')

  const feishuMeta = computed(() => authMeta.value?.feishu || null)
  const oauthMeta = computed(() => authMeta.value?.oauth || authMeta.value?.casdoor || null)
  const oauthEnabled = computed(() => Boolean(oauthMeta.value?.enabled))
  const oauthDisplayName = computed(() => String(oauthMeta.value?.displayName || '').trim() || DEFAULT_OAUTH_DISPLAY_NAME)
  const registrationEnabled = computed(() => authMeta.value?.registrationEnabled !== false)
  const registrationHint = computed(() => registrationEnabled.value
    ? '首次登录将自动注册，并初始化 Personal 空间。'
    : '当前已关闭自动注册，仅允许已有账号登录或绑定第三方账号。')

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

  function resolveRedirectTarget(): string {
    const raw = route.query.redirect
    const redirect = Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
    if (!redirect)
      return '/dashboard'
    if (!redirect.startsWith('/') || redirect.startsWith('//'))
      return '/dashboard'
    if (redirect.startsWith('/login'))
      return '/dashboard'
    return redirect
  }

  function readQueryText(name: string | string[]): string {
    const names = Array.isArray(name) ? name : [name]
    for (const item of names) {
      const raw = route.query[item]
      const value = Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
      if (value)
        return value
    }
    return ''
  }

  function isFeishuContainer(): boolean {
    if (!import.meta.client)
      return false
    const ua = String(window.navigator.userAgent || '').toLowerCase()
    return ua.includes('lark') || ua.includes('feishu')
  }

  async function loadAuthMeta() {
    if (authMeta.value)
      return authMeta.value

    try {
      const response = await authApiFetch<ApiResponse<AuthLoginMeta>>('/auth/meta')
      authMeta.value = response.data
      return response.data
    }
    catch {
      authMeta.value = null
      return null
    }
  }

  async function checkLoggedIn(): Promise<boolean> {
    try {
      await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
      await navigateTo(resolveRedirectTarget(), { replace: true })
      return true
    }
    catch {
      return false
    }
  }

  async function submitLogin() {
    errorText.value = ''
    const account = username.value.trim()
    const secret = password.value

    if (!account || !secret) {
      errorText.value = '请输入用户名和密码。'
      return
    }

    loading.value = true
    try {
      await authApiFetch<ApiResponse<AuthLoginResult>>('/auth/login', {
        method: 'POST',
        body: {
          username: account,
          password: secret,
        },
      })
      await navigateTo(resolveRedirectTarget(), { replace: true })
    }
    catch (error: any) {
      const message = String(error?.data?.message || '')
      if (message.includes('WINLOOP_PG_URL') || message.includes('client password must be a string')) {
        errorText.value = '数据库连接配置缺失：请在 .env.local 设置 WINLOOP_PG_URL（含用户名和密码）后重启服务。'
      }
      else {
        errorText.value = message || '登录失败，请检查账号密码。'
      }
    }
    finally {
      loading.value = false
    }
  }

  async function startFeishuOAuthRedirect() {
    const redirectTarget = resolveRedirectTarget()
    const url = endpoint(`/auth/feishu/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
    oauthRedirectingProvider.value = 'feishu'
    window.location.href = url
  }

  async function startOauthRedirect() {
    const redirectTarget = resolveRedirectTarget()
    const url = endpoint(`/auth/oauth/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
    oauthRedirectingProvider.value = 'oauth'
    window.location.href = url
  }

  async function requestAuthCodeBySdk(appId: string): Promise<string> {
    const w = window as any

    if (w.h5sdk?.biz?.util?.getAuthCode) {
      return new Promise((resolve, reject) => {
        w.h5sdk.biz.util.getAuthCode({
          appId,
          success: (res: any) => resolve(String(res?.code || res?.authCode || '').trim()),
          fail: (error: any) => reject(error),
        })
      })
    }

    if (w.tt?.requestAuthCode) {
      return new Promise((resolve, reject) => {
        w.tt.requestAuthCode({
          appId,
          success: (res: any) => resolve(String(res?.code || res?.authCode || '').trim()),
          fail: (error: any) => reject(error),
        })
      })
    }

    return ''
  }

  async function ensureFeishuSdkLoaded(scriptUrl: string): Promise<void> {
    const w = window as any
    if (w.h5sdk || w.tt)
      return

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = scriptUrl
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('FEISHU_SDK_LOAD_FAILED'))
      document.head.appendChild(script)
    })
  }

  async function loginByFeishuCode(code: string): Promise<boolean> {
    const normalizedCode = String(code || '').trim()
    if (!normalizedCode)
      return false

    await authApiFetch<ApiResponse<AuthLoginResult>>('/auth/feishu/websdk-login', {
      method: 'POST',
      body: {
        code: normalizedCode,
      },
    })
    await navigateTo(resolveRedirectTarget(), { replace: true })
    return true
  }

  function logFeishuAutoLoginFallback(reason: string, error?: unknown) {
    console.warn('[feishu-auto-login] fallback to standard oauth', {
      reason,
      error,
    })
  }

  async function manualFeishuLogin() {
    errorText.value = ''
    const meta = await loadAuthMeta()
    if (!meta?.feishu?.enabled) {
      errorText.value = '飞书登录尚未启用。'
      return
    }
    await startFeishuOAuthRedirect()
  }

  async function manualOauthLogin() {
    errorText.value = ''
    const meta = await loadAuthMeta()
    const oauthEnabled = Boolean(meta?.oauth?.enabled || meta?.casdoor?.enabled)
    if (!oauthEnabled) {
      errorText.value = `${oauthDisplayName.value} 登录尚未启用。`
      return
    }
    await startOauthRedirect()
  }

  async function tryFeishuAutoLogin() {
    if (!import.meta.client || !isFeishuContainer())
      return

    const alreadyTried = sessionStorage.getItem('wl_feishu_auto_login_tried')
    if (alreadyTried === '1')
      return

    const meta = await loadAuthMeta()
    if (!meta?.feishu?.enabled)
      return

    sessionStorage.setItem('wl_feishu_auto_login_tried', '1')

    feishuLoading.value = true
    try {
      await ensureFeishuSdkLoaded(meta.feishu.webSdkScriptUrl)
      const authCode = await requestAuthCodeBySdk(meta.feishu.appId)
      const success = await loginByFeishuCode(authCode)
      if (!success) {
        logFeishuAutoLoginFallback('empty_auth_code')
        await startFeishuOAuthRedirect()
      }
    }
    catch (error) {
      logFeishuAutoLoginFallback('sdk_failed', error)
      await startFeishuOAuthRedirect()
    }
    finally {
      feishuLoading.value = false
    }
  }

  onMounted(async () => {
    const loggedIn = await checkLoggedIn()
    if (loggedIn)
      return

    await loadAuthMeta()

    const oauthError = readQueryText(['oauthError', 'casdoorError'])
    const feishuError = readQueryText('feishuError')
    if (oauthError) {
      errorText.value = oauthError
    }
    else if (feishuError) {
      errorText.value = feishuError
    }

    feishuConflictCode.value = readQueryText('feishuConflictCode')
    feishuBoundUser.value = readQueryText('feishuBoundUser')
    oauthConflictCode.value = readQueryText(['oauthConflictCode', 'casdoorConflictCode'])
    oauthBoundUser.value = readQueryText(['oauthBoundUser', 'casdoorBoundUser'])

    await tryFeishuAutoLogin()
  })

  return {
    username,
    password,
    loading,
    errorText,
    feishuLoading,
    feishuMeta,
    oauthEnabled,
    oauthDisplayName,
    registrationEnabled,
    registrationHint,
    oauthRedirectingProvider,
    hasFeishuConflict,
    hasOauthConflict,
    feishuConflictTitle,
    oauthConflictTitle,
    feishuBoundUser,
    oauthBoundUser,
    submitLogin,
    manualFeishuLogin,
    manualOauthLogin,
  }
}
