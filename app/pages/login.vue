<script setup lang="ts">
import UniverseBackground from '~/components/common/UniverseBackground.vue'

definePageMeta({
  layout: false,
})

useHead({
  title: '登录 - WinLoop',
})

const {
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
} = useLoginPage()
</script>

<template>
  <div class="bg-slate-100 min-h-screen relative overflow-hidden isolate" data-testid="login-page">
    <div class="op-50 inset-0 absolute">
      <UniverseBackground
        :color-stops="['#5227FF', '#FF9FFC', '#B19EEF']"
        :speed="0.25"
        :blend="0.5"
        :amplitude="1.0"
        :intensity="1.0"
        class="h-full w-full"
      />
    </div>

    <div class="mx-auto px-4 py-6 flex flex-col max-w-6xl min-h-screen w-full relative z-10 lg:px-8 sm:px-6">
      <div class="flex flex-1 items-center justify-center">
        <section class="p-6 border border-white/45 rounded-[32px] bg-white/42 max-w-[460px] w-full shadow-[0_28px_90px_rgba(15,23,42,0.18)] relative overflow-hidden backdrop-blur-2xl sm:p-8">
          <div class="pointer-events-none inset-0 absolute">
            <div class="rounded-full bg-white/55 h-48 w-48 right-[-56px] absolute blur-3xl -top-20" />
            <div class="rounded-full bg-slate-200/45 h-36 w-36 bottom-[-72px] left-[-44px] absolute blur-3xl" />
            <div class="h-px inset-x-8 top-0 absolute from-transparent to-transparent via-white/90 bg-gradient-to-r" />
          </div>

          <div class="relative space-y-5">
            <div class="text-center flex flex-col items-center space-y-3">
              <span class="px-3 py-1 border border-white/60 rounded-full bg-white/60 text-[13px] text-slate-600 font-medium inline-flex items-center backdrop-blur">
                WinLoop
              </span>
              <div class="space-y-2">
                <h1 class="text-3xl text-slate-900 font-semibold tracking-tight m-0">
                  登录 WinLoop
                </h1>
                <p class="text-sm text-slate-600 leading-6 m-0 max-w-sm">
                  {{ registrationHint }}
                </p>
                <p class="text-xs text-slate-500 leading-5 m-0 max-w-sm">
                  已有账号需合并时，请先账号密码登录，再到“个人信息”里绑定飞书或 {{ oauthDisplayName }} 账号。
                </p>
              </div>
            </div>

            <div class="space-y-3">
              <div v-if="hasFeishuConflict" class="p-3 border border-amber-200/80 rounded-2xl bg-white/80 backdrop-blur">
                <p class="m-0 font-semibold text-amber-800">
                  {{ feishuConflictTitle }}
                </p>
                <p v-if="feishuBoundUser" class="m-0 mt-2 text-sm text-amber-700">
                  该飞书账号当前绑定到平台账号：<span class="font-mono">{{ feishuBoundUser }}</span>
                </p>
                <p class="m-0 mt-2 text-sm text-amber-700">
                  处理建议：先用绑定账号密码登录；如需迁移绑定，请联系管理员先解绑再重绑。
                </p>
              </div>

              <div v-if="hasOauthConflict" class="p-3 border border-amber-200/80 rounded-2xl bg-white/80 backdrop-blur">
                <p class="m-0 font-semibold text-amber-800">
                  {{ oauthConflictTitle }}
                </p>
                <p v-if="oauthBoundUser" class="m-0 mt-2 text-sm text-amber-700">
                  该 {{ oauthDisplayName }} 账号当前绑定到平台账号：<span class="font-mono">{{ oauthBoundUser }}</span>
                </p>
                <p class="m-0 mt-2 text-sm text-amber-700">
                  处理建议：先用绑定账号密码登录；如需迁移绑定，请联系管理员处理后再重绑。
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <button
                v-if="oauthEnabled"
                class="dense-btn w-full justify-center border-white/60 bg-white/72 text-slate-800 backdrop-blur hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                :disabled="oauthRedirectingProvider !== '' || feishuLoading"
                @click="manualOauthLogin"
              >
                {{ oauthRedirectingProvider === 'oauth' ? `${oauthDisplayName} 跳转中...` : `使用 ${oauthDisplayName} 登录` }}
              </button>

              <button
                v-if="feishuMeta?.enabled"
                class="dense-btn w-full justify-center border-white/60 bg-white/72 text-slate-800 backdrop-blur hover:border-slate-900 hover:bg-slate-900 hover:text-white"
                :disabled="feishuLoading || oauthRedirectingProvider !== ''"
                @click="manualFeishuLogin"
              >
                {{ feishuLoading ? '飞书登录准备中...' : (oauthRedirectingProvider === 'feishu' ? '飞书跳转中...' : '使用飞书登录') }}
              </button>
            </div>

            <div class="space-y-3">
              <label class="text-xs text-slate-600 font-medium block">
                用户名
                <input
                  v-model="username"
                  type="text"
                  data-testid="login-username-input"
                  class="dense-input mt-1 border-white/70 bg-white/85 backdrop-blur focus:border-slate-900"
                  placeholder="请输入用户名"
                  autocomplete="username"
                >
              </label>

              <label class="text-xs text-slate-600 font-medium block">
                密码
                <input
                  v-model="password"
                  type="password"
                  data-testid="login-password-input"
                  class="dense-input mt-1 border-white/70 bg-white/85 backdrop-blur focus:border-slate-900"
                  placeholder="请输入密码"
                  autocomplete="current-password"
                  @keydown.enter="submitLogin"
                >
              </label>
            </div>

            <div
              v-if="errorText"
              class="p-3 border border-rose-200/80 rounded-2xl bg-white/80 text-sm text-rose-700 backdrop-blur"
              data-testid="login-error-text"
            >
              {{ errorText }}
            </div>

            <button
              data-testid="login-submit-button"
              class="dense-btn w-full justify-center h-9 border-slate-900 bg-slate-900 text-white hover:bg-black"
              :disabled="loading"
              @click="submitLogin"
            >
              {{ loading ? '登录中...' : (registrationEnabled ? '登录 / 自动注册' : '登录') }}
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
