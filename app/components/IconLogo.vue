<script setup lang="ts">
import { ICON_LOGO_PATHS, ICON_LOGO_VIEW_BOX } from '~/constants/icon-logo'

const props = withDefaults(defineProps<{
  animation?: 'none' | 'draw' | 'loop'
}>(), {
  animation: 'none',
})

function resolvePathStyle(length: number, index: number): Record<string, string> | undefined {
  if (props.animation === 'none')
    return undefined

  return {
    '--icon-logo-path-length': `${length}`,
    'animation': props.animation === 'loop'
      ? 'icon-logo-draw 1600ms ease-in-out infinite'
      : 'icon-logo-draw 900ms ease-out forwards',
    'animationDelay': props.animation === 'draw' ? `${index * 120}ms` : '0ms',
    'strokeDasharray': `${length}`,
    'strokeDashoffset': `${length}`,
  }
}
</script>

<template>
  <svg
    class="icon-logo"
    xmlns="http://www.w3.org/2000/svg"
    :viewBox="ICON_LOGO_VIEW_BOX"
    fill="none"
    aria-hidden="true"
  >
    <path
      v-for="(path, index) in ICON_LOGO_PATHS"
      :key="path.d"
      :d="path.d"
      :transform="path.transform"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      :style="resolvePathStyle(path.length, index)"
    />
  </svg>
</template>

<style scoped>
.icon-logo {
  display: block;
  overflow: visible;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@keyframes icon-logo-draw {
  0% {
    opacity: 0.72;
    stroke-dashoffset: var(--icon-logo-path-length);
  }

  70%,
  100% {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}
</style>
