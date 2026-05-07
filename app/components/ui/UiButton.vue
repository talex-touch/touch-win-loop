<script setup lang="ts">
import { computed, useAttrs } from 'vue'

interface UiButtonProps {
  disabled?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
  loading?: boolean
  long?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<UiButtonProps>(), {
  disabled: false,
  htmlType: 'button',
  loading: false,
  long: false,
  variant: 'primary',
})

const attrs = useAttrs()

const arcoType = computed(() => {
  return props.variant === 'primary' ? 'primary' : 'outline'
})

const arcoStatus = computed(() => {
  return props.variant === 'danger' ? 'danger' : undefined
})
</script>

<template>
  <a-button
    v-bind="attrs"
    :html-type="props.htmlType"
    :loading="props.loading"
    :disabled="props.disabled"
    :long="props.long"
    size="large"
    :type="arcoType"
    :status="arcoStatus"
    class="ui-button"
    :class="`ui-button--${props.variant}`"
  >
    <slot />
  </a-button>
</template>

<style scoped>
.ui-button.arco-btn {
  min-height: 48px;
  border-radius: var(--wl-radius-md);
  padding-inline: 18px;
  font-family: var(--wl-font-sans);
  font-size: 15px;
  font-weight: 600;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.ui-button.ui-button--primary.arco-btn {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.ui-button.ui-button--primary.arco-btn:hover:not(.arco-btn-disabled),
.ui-button.ui-button--primary.arco-btn:focus-visible:not(.arco-btn-disabled) {
  background: #020617;
  border-color: #020617;
}

.ui-button.ui-button--secondary.arco-btn {
  background: rgba(255, 255, 255, 0.74);
  border-color: rgba(255, 255, 255, 0.64);
  color: #1e293b;
  backdrop-filter: blur(12px);
}

.ui-button.ui-button--secondary.arco-btn:hover:not(.arco-btn-disabled),
.ui-button.ui-button--secondary.arco-btn:focus-visible:not(.arco-btn-disabled) {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.ui-button.ui-button--danger.arco-btn {
  background: rgba(255, 241, 242, 0.92);
  border-color: rgba(244, 63, 94, 0.28);
  color: #be123c;
}

.ui-button.ui-button--danger.arco-btn:hover:not(.arco-btn-disabled),
.ui-button.ui-button--danger.arco-btn:focus-visible:not(.arco-btn-disabled) {
  background: #be123c;
  border-color: #be123c;
  color: #fff;
}
</style>
