<script setup lang="ts">
import type { ApiResponse, AuthLoginResult, AuthMeResult, FeishuIntegrationConfig } from '~~/shared/types/domain'

definePageMeta({
  layout: false,
})

useHead({
  title: '登录 - WinLoop',
})

const route = useRoute()
const authApiFetch = useAuthApiFetch()
const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorText = ref('')
const feishuLoading = ref(false)
const feishuMeta = ref<FeishuIntegrationConfig | null>(null)
const feishuConflictCode = ref('')
const feishuBoundUser = ref('')

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

function readFeishuErrorFromQuery(): string {
  const raw = route.query.feishuError
  const value = Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
  return value
}

function readQueryText(name: string): string {
  const raw = route.query[name]
  const value = Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
  return value
}

const hasFeishuConflict = computed(() => Boolean(feishuConflictCode.value))

const feishuConflictTitle = computed(() => {
  if (feishuConflictCode.value === 'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER')
    return '飞书账号已绑定其他平台账号'
  if (feishuConflictCode.value === 'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY')
    return '当前平台账号已绑定其他飞书账号'
  return '飞书账号绑定冲突'
})

function isFeishuContainer(): boolean {
  if (!import.meta.client)
    return false
  const ua = String(window.navigator.userAgent || '').toLowerCase()
  return ua.includes('lark') || ua.includes('feishu')
}

async function loadFeishuMeta() {
  if (feishuMeta.value)
    return feishuMeta.value
  try {
    const response = await authApiFetch<ApiResponse<FeishuIntegrationConfig>>('/auth/feishu/meta')
    feishuMeta.value = response.data
    return response.data
  }
  catch {
    feishuMeta.value = null
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

async function manualFeishuLogin() {
  errorText.value = ''
  const meta = await loadFeishuMeta()
  if (!meta?.enabled) {
    errorText.value = '飞书登录尚未启用。'
    return
  }
  await startFeishuOAuthRedirect()
}

async function tryFeishuAutoLogin() {
  if (!import.meta.client)
    return
  if (!isFeishuContainer())
    return

  const alreadyTried = sessionStorage.getItem('wl_feishu_auto_login_tried')
  if (alreadyTried === '1')
    return

  const meta = await loadFeishuMeta()
  if (!meta?.enabled)
    return

  sessionStorage.setItem('wl_feishu_auto_login_tried', '1')

  feishuLoading.value = true
  try {
    await ensureFeishuSdkLoaded(meta.webSdkScriptUrl)
    const authCode = await requestAuthCodeBySdk(meta.appId)
    const success = await loginByFeishuCode(authCode)
    if (!success)
      await startFeishuOAuthRedirect()
  }
  catch {
    // SDK 自动登录失败时，回退到标准 OAuth 跳转，避免静默停留在表单页。
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

  const feishuError = readFeishuErrorFromQuery()
  if (feishuError)
    errorText.value = feishuError
  feishuConflictCode.value = readQueryText('feishuConflictCode')
  feishuBoundUser.value = readQueryText('feishuBoundUser')

  await tryFeishuAutoLogin()
})
</script>

<template>
  <div class="p-4 bg-slate-100 flex min-h-screen items-center justify-center">
    <div class="p-6 border border-slate-200 rounded-xl bg-white max-w-sm w-full space-y-4">
      <h1 class="text-xl text-slate-900 font-semibold">
        登录 WinLoop
      </h1>
      <p class="text-xs text-slate-500">
        首次登录将自动注册，并初始化 Personal 空间。
      </p>
      <p class="text-xs text-slate-500">
        已有账号需合并时，请先账号密码登录，再到“个人信息-飞书账号”执行绑定。
      </p>

      <div v-if="hasFeishuConflict" class="p-3 border border-amber-200 rounded-lg bg-amber-50 space-y-2">
        <p class="text-xs text-amber-800 font-semibold m-0">
          {{ feishuConflictTitle }}
        </p>
        <p v-if="feishuBoundUser" class="text-xs text-amber-700 m-0">
          该飞书账号当前绑定到平台账号：<span class="font-mono">{{ feishuBoundUser }}</span>
        </p>
        <p class="text-xs text-amber-700 m-0">
          处理建议：先用绑定账号密码登录；如需迁移绑定，请联系管理员先解绑再重绑。
        </p>
      </div>

      <button
        class="text-sm text-slate-800 py-2 border border-slate-300 rounded bg-white w-full disabled:opacity-60"
        :disabled="feishuLoading"
        @click="manualFeishuLogin"
      >
        {{ feishuLoading ? '飞书登录准备中...' : '使用飞书登录' }}
      </button>

      <div class="space-y-3">
        <label class="text-xs text-slate-600 font-medium block">
          用户名
          <input
            v-model="username"
            type="text"
            class="text-sm mt-1 px-3 py-2 border border-slate-300 rounded w-full"
            placeholder="请输入用户名"
            autocomplete="username"
          >
        </label>

        <label class="text-xs text-slate-600 font-medium block">
          密码
          <input
            v-model="password"
            type="password"
            class="text-sm mt-1 px-3 py-2 border border-slate-300 rounded w-full"
            placeholder="请输入密码"
            autocomplete="current-password"
            @keydown.enter="submitLogin"
          >
        </label>
      </div>

      <div v-if="errorText" class="text-xs text-red-600">
        {{ errorText }}
      </div>

      <button
        class="text-sm text-white py-2 rounded bg-slate-900 w-full disabled:opacity-60"
        :disabled="loading"
        @click="submitLogin"
      >
        {{ loading ? '登录中...' : '登录 / 自动注册' }}
      </button>
    </div>
  </div>
</template>
