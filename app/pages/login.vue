<script setup lang="ts">
definePageMeta({
  layout: 'auth',
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
  feishuEnabled,
  oauthEnabled,
  oauthDisplayName,
  oauthRedirectingProvider,
  submitLogin,
  manualFeishuLogin,
  manualOauthLogin,
} = useLoginPage()
</script>

<template>
  <div class="flex w-full justify-center" data-testid="login-page">
    <MagicCard borderless class="mx-auto max-w-[680px] min-w-[520px] w-full relative max-sm:min-w-0">
      <div class="space-y-7">
        <div class="flex items-center justify-center">
          <WinLoopTextLogo class="login-page__logo scale-[0.64] sm:scale-[0.72]" />
        </div>

        <div v-if="feishuEnabled || oauthEnabled" class="space-y-2">
          <UiButton
            v-if="feishuEnabled"
            data-testid="login-feishu-button"
            variant="secondary"
            long
            :disabled="oauthRedirectingProvider !== '' || feishuLoading"
            @click="manualFeishuLogin"
          >
            {{ feishuLoading ? '飞书登录中...' : (oauthRedirectingProvider === 'feishu' ? '飞书跳转中...' : '使用飞书登录') }}
          </UiButton>

          <UiButton
            v-if="oauthEnabled"
            variant="secondary"
            long
            :disabled="oauthRedirectingProvider !== '' || feishuLoading"
            @click="manualOauthLogin"
          >
            {{ oauthRedirectingProvider === 'oauth' ? `${oauthDisplayName} 跳转中...` : `使用 ${oauthDisplayName} 登录` }}
          </UiButton>
        </div>

        <div class="space-y-4">
          <UiInputField
            v-model="username"
            label="用户名"
            type="text"
            placeholder="请输入用户名"
            autocomplete="username"
            data-testid="login-username-input"
          />

          <UiInputField
            v-model="password"
            label="密码"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            data-testid="login-password-input"
            @keydown.enter="submitLogin"
          />
        </div>

        <div
          v-if="errorText"
          class="text-sm text-rose-700 p-3 border border-rose-200/80 rounded-2xl bg-white/80 backdrop-blur"
          data-testid="login-error-text"
        >
          {{ errorText }}
        </div>

        <UiButton
          data-testid="login-submit-button"
          long
          variant="primary"
          :loading="loading"
          :disabled="loading"
          @click="submitLogin"
        >
          {{ loading ? '登录中...' : '登录' }}
        </UiButton>
      </div>
    </MagicCard>
  </div>
</template>

<style scoped>
.login-page__logo {
  --winloop-text-logo-size: 30px;
}

@media (min-width: 640px) {
  .login-page__logo {
    --winloop-text-logo-size: 40px;
  }
}
</style>
