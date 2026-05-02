import type { ApiResponse, AuthLoginMeta, AuthLoginResult, AuthSessionProbeResult } from '~~/shared/types/domain'
import { logAuthProbeDegraded, resolveAuthDisplayMessage, resolveAuthRequestErrorInfo } from '~/utils/auth-request'

type OauthRedirectingProvider = 'oauth' | 'feishu' | ''
const DEFAULT_OAUTH_DISPLAY_NAME = '第三方 OAuth'
type SessionProbeState = 'authenticated' | 'unauthenticated' | 'degraded'

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

  const feishuMeta = computed(() => authMeta.value?.feishu || null)
  const feishuEnabled = computed(() => Boolean(feishuMeta.value?.enabled))
  const oauthMeta = computed(() => authMeta.value?.oauth || authMeta.value?.casdoor || null)
  const oauthEnabled = computed(() => Boolean(oauthMeta.value?.enabled))
  const oauthDisplayName = computed(() => String(oauthMeta.value?.displayName || '').trim() || DEFAULT_OAUTH_DISPLAY_NAME)

  function resolveExplicitRedirectTarget(): string {
    const raw = route.query.redirect
    const redirect = Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
    if (!redirect)
      return ''
    if (!redirect.startsWith('/') || redirect.startsWith('//'))
      return ''
    if (redirect.startsWith('/login'))
      return ''
    return redirect
  }

  function resolveRedirectTarget(): string {
    return resolveExplicitRedirectTarget() || '/dashboard'
  }

  function resolveFeishuLoginTarget(result: AuthLoginResult): string {
    if (result.onboarding?.needsProfileSetup)
      return '/auth/onboarding'

    const explicitTarget = resolveExplicitRedirectTarget()
    if (explicitTarget)
      return explicitTarget

    const user = result.user
    const shouldLandInAdmin = Boolean(
      user.isPlatformAdmin
      || user.platformRoles?.length
      || user.platformPermissions?.length,
    )
    return shouldLandInAdmin ? '/admin' : '/dashboard'
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

  async function checkLoggedIn(): Promise<SessionProbeState> {
    try {
      await authApiFetch<ApiResponse<AuthSessionProbeResult>>('/auth/session')
      await navigateTo(resolveRedirectTarget(), { replace: true })
      return 'authenticated'
    }
    catch (error) {
      const info = resolveAuthRequestErrorInfo(error)
      if (info.isUnauthorized)
        return 'unauthenticated'

      if (!info.isForbidden) {
        logAuthProbeDegraded({
          context: 'login-page',
          route: route.fullPath || '/login',
          error,
        })
      }

      errorText.value = resolveAuthDisplayMessage(info, '登录态校验失败，请稍后重试。')
      return 'degraded'
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

  async function startOauthRedirect() {
    const redirectTarget = resolveRedirectTarget()
    const url = endpoint(`/auth/oauth/authorize?redirect=${encodeURIComponent(redirectTarget)}`)
    oauthRedirectingProvider.value = 'oauth'
    window.location.href = url
  }

  async function startFeishuRedirect() {
    const redirectTarget = resolveExplicitRedirectTarget()
    const query = redirectTarget ? `?redirect=${encodeURIComponent(redirectTarget)}` : ''
    oauthRedirectingProvider.value = 'feishu'
    window.location.href = endpoint(`/auth/feishu/authorize${query}`)
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

    const response = await authApiFetch<ApiResponse<AuthLoginResult>>('/auth/feishu/websdk-login', {
      method: 'POST',
      body: {
        code: normalizedCode,
        redirectTarget: resolveExplicitRedirectTarget(),
      },
    })
    await navigateTo(resolveFeishuLoginTarget(response.data), { replace: true })
    return true
  }

  function logFeishuAutoLoginFailure(reason: string, error?: unknown) {
    console.warn('[feishu-auto-login] fallback to credential login', {
      reason,
      error,
    })
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

  async function manualFeishuLogin() {
    errorText.value = ''
    const meta = await loadAuthMeta()
    if (!meta?.feishu?.enabled) {
      errorText.value = '飞书登录尚未启用，请联系管理员。'
      return
    }
    await startFeishuRedirect()
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
        logFeishuAutoLoginFailure('empty_auth_code')
      }
    }
    catch (error) {
      logFeishuAutoLoginFailure('sdk_failed', error)
    }
    finally {
      feishuLoading.value = false
    }
  }

  onMounted(async () => {
    const sessionState = await checkLoggedIn()
    if (sessionState === 'authenticated')
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

    if (sessionState === 'unauthenticated' && !oauthError && !feishuError)
      await tryFeishuAutoLogin()
  })

  return {
    username,
    password,
    loading,
    errorText,
    feishuLoading,
    feishuMeta,
    feishuEnabled,
    oauthEnabled,
    oauthDisplayName,
    oauthRedirectingProvider,
    submitLogin,
    manualOauthLogin,
    manualFeishuLogin,
  }
}
