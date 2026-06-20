<script setup lang="ts">
import type {
  ApiResponse,
  AuthOnboardingCompleteResult,
  AuthOnboardingPendingResult,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'auth',
})

useHead({
  title: '完善账号 - WinLoop',
})

type OnboardingMode = 'create' | 'link'

const authApiFetch = useAuthApiFetch()
const mode = ref<OnboardingMode>('create')
const username = ref('')
const password = ref('')
const loading = ref(false)
const pendingLoading = ref(true)
const errorText = ref('')
const pending = ref<AuthOnboardingPendingResult | null>(null)

const providerLabel = computed(() => pending.value?.providerLabel || '第三方账号')
const displayName = computed(() => pending.value?.displayName || providerLabel.value)
const email = computed(() => pending.value?.email || '')
const avatarUrl = computed(() => pending.value?.avatarUrl || '')
const initial = computed(() => {
  const source = String(displayName.value || username.value || providerLabel.value || 'W').trim()
  return (source.slice(0, 1) || 'W').toUpperCase()
})

async function loadPending() {
  pendingLoading.value = true
  errorText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthOnboardingPendingResult>>('/auth/onboarding/pending')
    pending.value = response.data
    if (!response.data?.pending) {
      await navigateTo('/login', { replace: true })
      return
    }
    username.value = String(response.data.suggestedUsername || '').trim()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '登录引导状态读取失败，请重新登录。')
  }
  finally {
    pendingLoading.value = false
  }
}

function selectMode(nextMode: OnboardingMode) {
  mode.value = nextMode
  errorText.value = ''
}

async function completeOnboarding() {
  errorText.value = ''
  const account = username.value.trim()
  if (!account) {
    errorText.value = '请输入 WinLoop 名字。'
    return
  }
  if (mode.value === 'link' && !password.value) {
    errorText.value = '请输入已有账号密码。'
    return
  }

  loading.value = true
  try {
    const response = await authApiFetch<ApiResponse<AuthOnboardingCompleteResult>>('/auth/onboarding/complete', {
      method: 'POST',
      body: {
        mode: mode.value,
        username: account,
        password: mode.value === 'link' ? password.value : undefined,
      },
    })
    await navigateTo(response.data.redirectTarget || '/dashboard', { replace: true })
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '登录引导完成失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadPending()
})
</script>

<template>
  <AuthPanelCard data-testid="auth-onboarding-page">
    <div class="space-y-5">
      <div class="text-center flex flex-col gap-3 items-center">
        <div class="text-white rounded-[20px] bg-slate-900 flex h-16 w-16 shadow-lg items-center justify-center overflow-hidden">
          <img v-if="avatarUrl" :src="avatarUrl" alt="第三方头像" class="h-full w-full object-cover">
          <span v-else class="text-2xl font-semibold">{{ initial }}</span>
        </div>
        <div class="space-y-2">
          <h1 class="text-3xl text-slate-900 tracking-tight font-semibold m-0">
            完善 WinLoop 账号
          </h1>
          <p class="text-sm text-slate-600 leading-6 m-0 max-w-sm">
            已通过 {{ providerLabel }} 验证，继续前请设置你的 WinLoop 名字。
          </p>
        </div>
      </div>

      <div v-if="pendingLoading" class="text-sm text-slate-500 py-6 text-center">
        正在读取登录状态...
      </div>

      <template v-else>
        <AuthBindingCard
          :title="displayName"
          :description="email || '第三方身份已验证'"
          linked
        >
          <div class="gap-2 grid grid-cols-2">
            <button
              type="button"
              class="dense-btn justify-center"
              :class="mode === 'create' ? 'text-white border-slate-900 bg-slate-900' : 'text-slate-700 border-white/60 bg-white/72'"
              :disabled="loading"
              @click="selectMode('create')"
            >
              创建新账号
            </button>
            <button
              type="button"
              class="dense-btn justify-center"
              :class="mode === 'link' ? 'text-white border-slate-900 bg-slate-900' : 'text-slate-700 border-white/60 bg-white/72'"
              :disabled="loading"
              @click="selectMode('link')"
            >
              关联已有账号
            </button>
          </div>

          <div class="space-y-3">
            <label class="block space-y-1.5">
              <span class="text-xs text-slate-600 font-semibold">WinLoop 名字</span>
              <input
                v-model="username"
                class="dense-input"
                type="text"
                autocomplete="username"
                placeholder="输入你的名字"
                data-testid="auth-onboarding-username"
                :disabled="loading"
                @keydown.enter="completeOnboarding"
              >
            </label>

            <label v-if="mode === 'link'" class="block space-y-1.5">
              <span class="text-xs text-slate-600 font-semibold">已有账号密码</span>
              <input
                v-model="password"
                class="dense-input"
                type="password"
                autocomplete="current-password"
                placeholder="输入已有账号密码"
                data-testid="auth-onboarding-password"
                :disabled="loading"
                @keydown.enter="completeOnboarding"
              >
            </label>
          </div>

          <p v-if="errorText" class="text-sm text-rose-700 leading-6 m-0" data-testid="auth-onboarding-error">
            {{ errorText }}
          </p>

          <template #actions>
            <button
              class="dense-btn text-white border-slate-900 bg-slate-900 justify-center hover:bg-black"
              :disabled="loading"
              data-testid="auth-onboarding-submit"
              @click="completeOnboarding"
            >
              {{ loading ? '处理中...' : (mode === 'link' ? '关联并进入' : '创建并进入') }}
            </button>
          </template>
        </AuthBindingCard>
      </template>
    </div>
  </AuthPanelCard>
</template>
