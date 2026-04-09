<script setup lang="ts">
const props = withDefaults(defineProps<{
  casdoorEnabled?: boolean
  feishuEnabled?: boolean
  feishuLoading?: boolean
  oauthRedirectingProvider?: 'feishu' | 'casdoor' | ''
}>(), {
  casdoorEnabled: false,
  feishuEnabled: false,
  feishuLoading: false,
  oauthRedirectingProvider: '',
})

defineEmits<{
  casdoorLogin: []
  feishuLogin: []
}>()

const hasOauthActions = computed(() => props.casdoorEnabled || props.feishuEnabled)
</script>

<template>
  <div v-if="hasOauthActions" class="login-oauth-actions">
    <div class="login-oauth-actions__divider">
      <span>组织身份登录</span>
    </div>

    <div class="login-oauth-actions__list">
      <button
        v-if="feishuEnabled"
        type="button"
        class="login-oauth-actions__button"
        :disabled="props.feishuLoading || props.oauthRedirectingProvider !== ''"
        @click="$emit('feishuLogin')"
      >
        {{ props.feishuLoading ? '飞书登录准备中...' : (props.oauthRedirectingProvider === 'feishu' ? '飞书跳转中...' : '使用飞书登录') }}
      </button>

      <button
        v-if="props.casdoorEnabled"
        type="button"
        class="login-oauth-actions__button"
        :disabled="props.oauthRedirectingProvider !== '' || props.feishuLoading"
        @click="$emit('casdoorLogin')"
      >
        {{ props.oauthRedirectingProvider === 'casdoor' ? 'Casdoor 跳转中...' : '使用 Casdoor 登录' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.login-oauth-actions {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-oauth-actions__divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(71, 85, 105, 0.8);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.login-oauth-actions__divider::before,
.login-oauth-actions__divider::after {
  content: '';
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(90deg, rgba(148, 163, 184, 0), rgba(148, 163, 184, 0.55), rgba(148, 163, 184, 0));
}

.login-oauth-actions__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-oauth-actions__button {
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.login-oauth-actions__button:hover:not(:disabled),
.login-oauth-actions__button:focus-visible:not(:disabled) {
  border-color: rgba(148, 163, 184, 0.98);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.12);
  transform: translateY(-1px);
  outline: none;
}

.login-oauth-actions__button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
</style>
