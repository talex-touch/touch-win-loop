<script setup lang="ts">
import type { ApiResponse, AuthLoginResult, AuthMeResult } from '~~/shared/types/domain'

useHead({
  title: '登录 - WinLoop',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorText = ref('')

async function checkLoggedIn() {
  try {
    await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    await navigateTo('/workspace')
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
    await $fetch<ApiResponse<AuthLoginResult>>(endpoint('/auth/login'), {
      method: 'POST',
      body: {
        username: account,
        password: secret,
      },
    })
    await navigateTo('/workspace')
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
  <div class="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div class="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <h1 class="text-xl font-semibold text-slate-900">
        登录 WinLoop
      </h1>
      <p class="text-xs text-slate-500">
        首次登录将自动注册，并初始化 Personal 空间。
      </p>

      <div class="space-y-3">
        <label class="block text-xs font-medium text-slate-600">
          用户名
          <input
            v-model="username"
            type="text"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="请输入用户名"
            autocomplete="username"
          >
        </label>

        <label class="block text-xs font-medium text-slate-600">
          密码
          <input
            v-model="password"
            type="password"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
        class="w-full rounded bg-slate-900 text-white text-sm py-2 disabled:opacity-60"
        :disabled="loading"
        @click="submitLogin"
      >
        {{ loading ? '登录中...' : '登录 / 自动注册' }}
      </button>
    </div>
  </div>
</template>
