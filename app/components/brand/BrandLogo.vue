<script setup lang="ts">
import {
  WINLOOP_BRAND_LOCKUP_VIEW_BOX,
  WINLOOP_BRAND_MARK_PATHS,
  WINLOOP_BRAND_MARK_VIEW_BOX,
  WINLOOP_BRAND_WORDMARK_PATHS,
  resolveWinLoopBrandColor,
} from '~/constants/brand-logo'

const props = withDefaults(defineProps<{
  variant?: 'mark' | 'lockup'
  tone?: 'brand' | 'white'
  animated?: boolean
}>(), {
  variant: 'mark',
  tone: 'brand',
  animated: false,
})
</script>

<template>
  <span
    class="winloop-brand"
    :data-variant="props.variant"
    :data-tone="props.tone"
    :data-animated="props.animated ? 'true' : 'false'"
    aria-hidden="true"
  >
    <svg
      v-if="props.variant === 'mark'"
      class="winloop-brand__svg"
      xmlns="http://www.w3.org/2000/svg"
      :viewBox="WINLOOP_BRAND_MARK_VIEW_BOX"
      fill="none"
      focusable="false"
    >
      <g class="winloop-brand__mark-group">
        <path
          v-for="path in WINLOOP_BRAND_MARK_PATHS"
          :key="`mark-${path.d}`"
          :d="path.d"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
        />
      </g>
    </svg>

    <svg
      v-else
      class="winloop-brand__svg"
      xmlns="http://www.w3.org/2000/svg"
      :viewBox="WINLOOP_BRAND_LOCKUP_VIEW_BOX"
      fill="none"
      focusable="false"
    >
      <g class="winloop-brand__mark-group">
        <path
          v-for="path in WINLOOP_BRAND_MARK_PATHS"
          :key="`lockup-mark-${path.d}`"
          :d="path.d"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
        />
      </g>
      <g class="winloop-brand__wordmark-group">
        <path
          v-for="path in WINLOOP_BRAND_WORDMARK_PATHS"
          :key="`lockup-wordmark-${path.d}`"
          :d="path.d"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
        />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.winloop-brand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.winloop-brand[data-variant='mark'] {
  width: var(--winloop-brand-mark-size, 1.625rem);
}

.winloop-brand[data-variant='lockup'] {
  width: var(--winloop-brand-lockup-width, clamp(140px, 18vw, 220px));
}

.winloop-brand__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.winloop-brand__mark-group {
  transform-box: fill-box;
  transform-origin: 50% 50%;
}

.winloop-brand[data-animated='true'] .winloop-brand__mark-group {
  animation: winloop-brand-breathe 4.8s ease-in-out infinite;
}

@keyframes winloop-brand-breathe {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
  }

  35% {
    transform: translate3d(0, -1px, 0) scale(1.018) rotate(-1deg);
  }

  65% {
    transform: translate3d(0, 1px, 0) scale(0.988) rotate(1deg);
  }
}
</style>
