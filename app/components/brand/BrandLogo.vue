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

function resolveTraceStyle(index: number, group: 'mark' | 'wordmark'): Record<string, string> {
  const baseDelay = group === 'mark' ? 0 : 780
  const step = group === 'mark' ? 140 : 110
  const duration = group === 'mark' ? 860 : 720

  return {
    '--winloop-brand-trace-delay': `${baseDelay + (index * step)}ms`,
    '--winloop-brand-trace-duration': `${duration}ms`,
    '--winloop-brand-dash-length': group === 'mark' ? '520' : '260',
  }
}

function resolveFillStyle(group: 'mark' | 'wordmark'): Record<string, string> {
  return {
    '--winloop-brand-fill-delay': group === 'mark' ? '700ms' : '1680ms',
    '--winloop-brand-fill-duration': group === 'mark' ? '260ms' : '320ms',
  }
}
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
          class="winloop-brand__fill-path"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveFillStyle('mark') : undefined"
        />
        <path
          v-if="props.animated"
          v-for="(path, index) in WINLOOP_BRAND_MARK_PATHS"
          :key="`mark-trace-${path.d}`"
          :d="path.d"
          class="winloop-brand__trace-path"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="resolveTraceStyle(index, 'mark')"
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
          class="winloop-brand__fill-path"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveFillStyle('mark') : undefined"
        />
        <path
          v-if="props.animated"
          v-for="(path, index) in WINLOOP_BRAND_MARK_PATHS"
          :key="`lockup-mark-trace-${path.d}`"
          :d="path.d"
          class="winloop-brand__trace-path"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="resolveTraceStyle(index, 'mark')"
        />
      </g>
      <g class="winloop-brand__wordmark-group">
        <path
          v-for="path in WINLOOP_BRAND_WORDMARK_PATHS"
          :key="`lockup-wordmark-${path.d}`"
          :d="path.d"
          class="winloop-brand__fill-path"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveFillStyle('wordmark') : undefined"
        />
        <path
          v-if="props.animated"
          v-for="(path, index) in WINLOOP_BRAND_WORDMARK_PATHS"
          :key="`lockup-wordmark-trace-${path.d}`"
          :d="path.d"
          class="winloop-brand__trace-path winloop-brand__trace-path--wordmark"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="resolveTraceStyle(index, 'wordmark')"
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

.winloop-brand__fill-path {
  opacity: 1;
}

.winloop-brand[data-animated='true'] .winloop-brand__fill-path {
  opacity: 0;
  animation: winloop-brand-fill-reveal var(--winloop-brand-fill-duration) ease-out infinite;
  animation-delay: var(--winloop-brand-fill-delay);
}

.winloop-brand__trace-path {
  fill-opacity: 0.08;
  stroke-width: 1.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: var(--winloop-brand-dash-length);
  stroke-dashoffset: var(--winloop-brand-dash-length);
  animation: winloop-brand-trace-draw var(--winloop-brand-trace-duration) ease-out infinite;
  animation-delay: var(--winloop-brand-trace-delay);
}

.winloop-brand__trace-path--wordmark {
  stroke-width: 0.85;
  fill-opacity: 0.02;
}

@keyframes winloop-brand-trace-draw {
  0% {
    opacity: 0;
    stroke-dashoffset: var(--winloop-brand-dash-length);
  }

  8% {
    opacity: 0.96;
  }

  68% {
    opacity: 0.96;
    stroke-dashoffset: 0;
  }

  100% {
    opacity: 0;
    stroke-dashoffset: 0;
  }
}

@keyframes winloop-brand-fill-reveal {
  0%,
  8% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}
</style>
