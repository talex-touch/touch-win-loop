<script setup lang="ts">
const props = withDefaults(defineProps<{
  label?: string
}>(), {
  label: 'WinLoop 工作区加载中',
})
</script>

<template>
  <div class="workspace-shell-loading-overlay" role="status" aria-live="polite" aria-atomic="true">
    <span class="workspace-shell-loading-overlay__label">{{ props.label }}</span>
  </div>
</template>

<style scoped>
.workspace-shell-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 520;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(255, 255, 255, 0.64);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.workspace-shell-loading-overlay__label {
  color: #0f172a;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: center;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
  user-select: none;
}
</style>
