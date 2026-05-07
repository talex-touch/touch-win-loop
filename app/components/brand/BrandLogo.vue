<script setup lang="ts">
import {
  resolveWinLoopBrandColor,
  WINLOOP_BRAND_LOCKUP_VIEW_BOX,
  WINLOOP_BRAND_MARK_PATHS,
  WINLOOP_BRAND_MARK_VIEW_BOX,
  WINLOOP_BRAND_WORDMARK_PATHS,
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

function resolveMarkTraceStyle(
  index: number,
  tone: 'primary' | 'accent',
): Record<string, string> {
  const isPrimary = tone === 'primary'
  const baseDelay = isPrimary ? 0 : 1380
  const step = isPrimary ? 220 : 180
  const duration = isPrimary ? 1280 : 1040

  return {
    '--winloop-brand-trace-delay': `${baseDelay + (index * step)}ms`,
    '--winloop-brand-trace-duration': `${duration}ms`,
    '--winloop-brand-dash-length': isPrimary ? '560' : '460',
  }
}

function resolveMarkFillStyle(tone: 'primary' | 'accent'): Record<string, string> {
  return {
    '--winloop-brand-fill-delay': tone === 'primary' ? '980ms' : '2160ms',
    '--winloop-brand-fill-duration': tone === 'primary' ? '260ms' : '240ms',
  }
}

function resolveWordmarkTraceStyle(index: number): Record<string, string> {
  return {
    '--winloop-brand-trace-delay': `${2680 + (index * 40)}ms`,
    '--winloop-brand-trace-duration': '1180ms',
    '--winloop-brand-dash-length': '260',
  }
}

function resolveWordmarkFillStyle(): Record<string, string> {
  return {
    '--winloop-brand-fill-delay': '3480ms',
    '--winloop-brand-fill-duration': '320ms',
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
          class="winloop-brand__fill-path winloop-brand__fill-path--mark"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveMarkFillStyle(path.tone) : undefined"
        />
        <template v-if="props.animated">
          <path
            v-for="(path, index) in WINLOOP_BRAND_MARK_PATHS"
            :key="`mark-trace-${path.d}`"
            :d="path.d"
            class="winloop-brand__trace-path winloop-brand__trace-path--mark"
            :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
            :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
            :style="resolveMarkTraceStyle(index, path.tone)"
          />
        </template>
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
          class="winloop-brand__fill-path winloop-brand__fill-path--mark"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveMarkFillStyle(path.tone) : undefined"
        />
        <template v-if="props.animated">
          <path
            v-for="(path, index) in WINLOOP_BRAND_MARK_PATHS"
            :key="`lockup-mark-trace-${path.d}`"
            :d="path.d"
            class="winloop-brand__trace-path winloop-brand__trace-path--mark"
            :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
            :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
            :style="resolveMarkTraceStyle(index, path.tone)"
          />
        </template>
      </g>
      <g class="winloop-brand__wordmark-group">
        <path
          v-for="path in WINLOOP_BRAND_WORDMARK_PATHS"
          :key="`lockup-wordmark-${path.d}`"
          :d="path.d"
          class="winloop-brand__fill-path winloop-brand__fill-path--wordmark"
          :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
          :style="props.animated ? resolveWordmarkFillStyle() : undefined"
        />
        <template v-if="props.animated">
          <path
            v-for="(path, index) in WINLOOP_BRAND_WORDMARK_PATHS"
            :key="`lockup-wordmark-trace-${path.d}`"
            :d="path.d"
            class="winloop-brand__trace-path winloop-brand__trace-path--wordmark"
            :fill="resolveWinLoopBrandColor(props.tone, path.tone)"
            :stroke="resolveWinLoopBrandColor(props.tone, path.tone)"
            :style="resolveWordmarkTraceStyle(index)"
          />
        </template>
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

.winloop-brand__wordmark-group {
  transform-origin: 50% 50%;
}

.winloop-brand__fill-path {
  opacity: 1;
}

.winloop-brand[data-animated='true'] .winloop-brand__fill-path--mark {
  opacity: 0;
  animation: winloop-brand-fill-reveal var(--winloop-brand-fill-duration) ease-out 1 forwards;
  animation-delay: var(--winloop-brand-fill-delay);
}

.winloop-brand[data-animated='true'][data-variant='lockup'] .winloop-brand__fill-path--wordmark {
  opacity: 0;
  animation: winloop-brand-fill-reveal var(--winloop-brand-fill-duration) ease-out 1 forwards;
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
  animation: winloop-brand-trace-draw var(--winloop-brand-trace-duration) ease-out 1 both;
  animation-delay: var(--winloop-brand-trace-delay);
}

.winloop-brand__trace-path--mark {
  fill-opacity: 0.06;
}

.winloop-brand__trace-path--wordmark {
  fill-opacity: 0.02;
  stroke-width: 0.86;
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
    opacity: 0.08;
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
