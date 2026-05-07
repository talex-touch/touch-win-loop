<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  description: string
  boundUser?: string
  boundUserLabel?: string
}>(), {
  boundUser: '',
  boundUserLabel: '关联平台账号',
})
</script>

<template>
  <div class="auth-conflict-notice">
    <p class="auth-conflict-notice__title">
      {{ props.title }}
    </p>
    <p class="auth-conflict-notice__description">
      {{ props.description }}
    </p>
    <p v-if="props.boundUser" class="auth-conflict-notice__meta">
      {{ props.boundUserLabel }}：<span class="auth-conflict-notice__code">{{ props.boundUser }}</span>
    </p>
  </div>
</template>

<style scoped>
.auth-conflict-notice {
  padding: 14px 16px;
  border: 1px solid rgba(251, 191, 36, 0.36);
  border-radius: 20px;
  background: rgba(255, 247, 237, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(14px);
}

.auth-conflict-notice__title {
  margin: 0;
  color: #92400e;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.6;
}

.auth-conflict-notice__description,
.auth-conflict-notice__meta {
  margin: 8px 0 0;
  color: #9a3412;
  font-size: 12px;
  line-height: 1.7;
}

.auth-conflict-notice__code {
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
}
</style>
