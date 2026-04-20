<script setup lang="ts">
const props = withDefaults(defineProps<{
  collapsed?: boolean
}>(), {
  collapsed: false,
})

const emit = defineEmits<{
  toggle: []
}>()

const buttonLabel = computed(() => {
  return props.collapsed ? '展开 AI 工作台' : '收起 AI 工作台'
})
</script>

<template>
  <button
    data-testid="workspace-header-ai-toggle"
    class="workspace-ai-toggle"
    :class="{ 'workspace-ai-toggle--active': !props.collapsed }"
    type="button"
    :aria-label="buttonLabel"
    :aria-pressed="!props.collapsed"
    :title="buttonLabel"
    @click="emit('toggle')"
  >
    <span class="workspace-ai-toggle__spark" aria-hidden="true" />
    <svg
      class="workspace-ai-toggle__icon"
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M23 18v2h-2v1h-1v2h-2v-2h-1v-1h-2v-2h2v-1h1v-2h2v2h1v1zm0-14v2h-2v1h-1v2h-2V7h-1V6h-2V4h2V3h1V1h2v2h1v1zm-6 7v2h-2v1h-2v1h-1v1h-1v2h-1v2H8v-2H7v-2H6v-1H5v-1H3v-1H1v-2h2v-1h2V9h1V8h1V6h1V4h2v2h1v2h1v1h1v1h2v1z"
      />
    </svg>
  </button>
</template>

<style scoped>
.workspace-ai-toggle {
  position: relative;
  width: 36px;
  height: 36px;
  border: 1px solid #d6e0ee;
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, #f9fbff 100%);
  color: #4e627f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.workspace-ai-toggle__spark {
  position: absolute;
  inset: 6px;
  border-radius: 11px;
  background:
    radial-gradient(circle at 28% 30%, rgba(255, 213, 120, 0.88) 0%, rgba(255, 213, 120, 0) 48%),
    radial-gradient(circle at 72% 26%, rgba(116, 191, 255, 0.8) 0%, rgba(116, 191, 255, 0) 52%),
    radial-gradient(circle at 60% 76%, rgba(151, 132, 255, 0.66) 0%, rgba(151, 132, 255, 0) 48%),
    conic-gradient(
      from 0deg,
      rgba(255, 191, 73, 0.1),
      rgba(82, 164, 255, 0.42),
      rgba(124, 103, 255, 0.18),
      rgba(255, 191, 73, 0.1)
    );
  filter: blur(6px) saturate(118%);
  opacity: 0.72;
  animation: workspace-ai-toggle-spark 5.8s linear infinite;
  z-index: 0;
}

.workspace-ai-toggle:hover {
  background: #f8fbff;
  border-color: #cfd9ea;
  color: #304867;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}

.workspace-ai-toggle:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 2px;
}

.workspace-ai-toggle--active {
  background: linear-gradient(135deg, #0f172a 0%, #15294b 52%, #17315c 100%);
  border-color: #1b3157;
  color: #ffffff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}

.workspace-ai-toggle--active:hover {
  background: linear-gradient(135deg, #101c34 0%, #18315a 52%, #1a3a6b 100%);
  border-color: #25426e;
  color: #ffffff;
}

.workspace-ai-toggle__icon {
  position: relative;
  z-index: 1;
  width: 16px;
  height: 16px;
  display: block;
  filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.14));
}

@keyframes workspace-ai-toggle-spark {
  from {
    transform: rotate(0deg) scale(1);
  }
  50% {
    transform: rotate(180deg) scale(1.06);
  }
  to {
    transform: rotate(360deg) scale(1);
  }
}
</style>
