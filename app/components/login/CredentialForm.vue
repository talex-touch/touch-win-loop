<script setup lang="ts">
const props = withDefaults(defineProps<{
  username?: string
  password?: string
  loading?: boolean
  errorText?: string
  registrationEnabled?: boolean
}>(), {
  username: '',
  password: '',
  loading: false,
  errorText: '',
  registrationEnabled: true,
})

const emit = defineEmits<{
  'update:username': [value: string]
  'update:password': [value: string]
  'submit': []
}>()

const submitText = computed(() => props.loading
  ? '登录中...'
  : (props.registrationEnabled ? '登录 / 自动注册' : '登录'))

function updateUsername(event: Event) {
  emit('update:username', (event.target as HTMLInputElement).value)
}

function updatePassword(event: Event) {
  emit('update:password', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <form class="login-credential-form" @submit.prevent="emit('submit')">
    <label class="login-credential-form__field">
      <span class="login-credential-form__label">用户名</span>
      <input
        :value="props.username"
        type="text"
        data-testid="login-username-input"
        class="login-credential-form__input"
        placeholder="请输入用户名"
        autocomplete="username"
        @input="updateUsername"
      >
    </label>

    <label class="login-credential-form__field">
      <span class="login-credential-form__label">密码</span>
      <input
        :value="props.password"
        type="password"
        data-testid="login-password-input"
        class="login-credential-form__input"
        placeholder="请输入密码"
        autocomplete="current-password"
        @input="updatePassword"
      >
    </label>

    <div v-if="props.errorText" class="login-credential-form__error" data-testid="login-error-text">
      {{ props.errorText }}
    </div>

    <button
      type="submit"
      data-testid="login-submit-button"
      class="login-credential-form__submit"
      :disabled="props.loading"
    >
      {{ submitText }}
    </button>
  </form>
</template>

<style scoped>
.login-credential-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-credential-form__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.login-credential-form__label {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.login-credential-form__input {
  width: 100%;
  min-height: 48px;
  padding: 0 15px;
  border: 1px solid rgba(191, 219, 254, 0.92);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  color: #0f172a;
  font-size: 14px;
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.68),
    0 8px 24px rgba(148, 163, 184, 0.12);
  backdrop-filter: blur(12px);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background-color 0.2s ease;
}

.login-credential-form__input::placeholder {
  color: #94a3b8;
}

.login-credential-form__input:focus {
  border-color: rgba(96, 165, 250, 0.92);
  background: rgba(255, 255, 255, 0.72);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.76),
    0 0 0 4px rgba(191, 219, 254, 0.42);
}

.login-credential-form__error {
  color: #dc2626;
  font-size: 12px;
  line-height: 1.6;
}

.login-credential-form__submit {
  width: 100%;
  min-height: 50px;
  border: none;
  border-radius: 18px;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.22);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.login-credential-form__submit:hover:not(:disabled),
.login-credential-form__submit:focus-visible:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 22px 40px rgba(15, 23, 42, 0.28);
  outline: none;
}

.login-credential-form__submit:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
</style>
