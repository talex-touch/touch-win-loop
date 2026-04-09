<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  providerName: string
  boundUser?: string
  suggestion: string
}>(), {
  boundUser: '',
})
</script>

<template>
  <div class="login-conflict-notice">
    <p class="login-conflict-notice__title">
      {{ props.title }}
    </p>
    <p v-if="props.boundUser" class="login-conflict-notice__text">
      该{{ props.providerName }}当前绑定到平台账号：<span class="login-conflict-notice__code">{{ props.boundUser }}</span>
    </p>
    <p class="login-conflict-notice__text">
      {{ props.suggestion }}
    </p>
  </div>
</template>

<style scoped>
.login-conflict-notice {
  padding: 14px 16px;
  border: 1px solid rgba(251, 191, 36, 0.38);
  border-radius: 20px;
  background: rgba(255, 247, 237, 0.78);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(14px);
}

.login-conflict-notice__title {
  margin: 0 0 8px;
  color: #92400e;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}

.login-conflict-notice__text {
  margin: 0;
  color: #9a3412;
  font-size: 12px;
  line-height: 1.7;
}

.login-conflict-notice__text + .login-conflict-notice__text {
  margin-top: 6px;
}

.login-conflict-notice__code {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
</style>
