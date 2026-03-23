<script setup lang="ts">
import type { ApiResponse, AuthLoginResult, AuthMeResult } from '~~/shared/types/domain'

definePageMeta({
  layout: false,
})

useHead({
  title: '登录 - WinLoop',
})

const route = useRoute()
const authApiFetch = useAuthApiFetch()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorText = ref('')

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

async function checkLoggedIn() {
  try {
    await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    await navigateTo(resolveRedirectTarget(), { replace: true })
  }
  catch {
    // ignore
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

onMounted(checkLoggedIn)
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
