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
            <div class="text-center flex flex-col items-center space-y-4">
              <LoginTextIcon compact />
              <p class="text-sm text-slate-600 leading-6 m-0 max-w-sm">
                {{ registrationHint }}
              </p>
            </div>

            <div class="space-y-3">
              <LoginConflictNotice
                v-if="hasFeishuConflict"
                :title="feishuConflictTitle"
                provider-name="飞书账号"
                :bound-user="feishuBoundUser"
                suggestion="处理建议：先用绑定账号密码登录；如需迁移绑定，请联系管理员先解绑再重绑。"
              />

              <LoginConflictNotice
                v-if="hasOauthConflict"
                :title="oauthConflictTitle"
                :provider-name="`${oauthDisplayName} 账号`"
                :bound-user="oauthBoundUser"
                suggestion="处理建议：先用绑定账号密码登录；如需迁移绑定，请联系管理员处理后再重绑。"
              />
            </div>

            <LoginOauthActions
              :oauth-enabled="oauthEnabled"
              :oauth-display-name="oauthDisplayName"
              :feishu-enabled="Boolean(feishuMeta?.enabled)"
              :feishu-loading="feishuLoading"
              :oauth-redirecting-provider="oauthRedirectingProvider"
              @oauth-login="manualOauthLogin"
              @feishu-login="manualFeishuLogin"
            />

            <LoginCredentialForm
              v-model:username="username"
              v-model:password="password"
              :loading="loading"
              :error-text="errorText"
              :registration-enabled="registrationEnabled"
              @submit="submitLogin"
            />
          </div>
        </section>
      </div>

      <div class="pt-6">
        <LoginFooterBar />
      </div>
    </div>
  </div>
</template>
