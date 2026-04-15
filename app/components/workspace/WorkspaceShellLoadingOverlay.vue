<script setup lang="ts">
const props = withDefaults(defineProps<{
  label?: string
  brand?: string
  progress?: number
}>(), {
  label: 'WinLoop 工作区加载中',
  brand: 'WinLoop',
  progress: 0,
})

const WORDMARK_VIEWBOX_WIDTH = 1480
const WORDMARK_VIEWBOX_HEIGHT = 320

const displayProgress = ref(clampProgress(props.progress))
const wordmarkBaseTextRef = ref<SVGTextElement | null>(null)
const wordmarkBounds = ref({
  y: 0,
  height: WORDMARK_VIEWBOX_HEIGHT,
})

const progressLabel = computed(() => `${Math.round(displayProgress.value)}%`)
const statusLabel = computed(() => `${props.label} ${progressLabel.value}`)
const progressClipHeight = computed(() => (wordmarkBounds.value.height * displayProgress.value) / 100)
const progressClipY = computed(() => (wordmarkBounds.value.y + wordmarkBounds.value.height) - progressClipHeight.value)

let progressAnimationFrame: ReturnType<typeof requestAnimationFrame> | null = null

function clampProgress(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.min(100, value))
}

function stopProgressAnimation(): void {
  if (!import.meta.client || progressAnimationFrame === null)
    return
  cancelAnimationFrame(progressAnimationFrame)
  progressAnimationFrame = null
}

function animateProgress(nextProgress: number): void {
  const resolvedProgress = clampProgress(nextProgress)
  if (!import.meta.client) {
    displayProgress.value = resolvedProgress
    return
  }

  stopProgressAnimation()
  const startProgress = displayProgress.value
  const delta = resolvedProgress - startProgress

  if (Math.abs(delta) < 0.2) {
    displayProgress.value = resolvedProgress
    return
  }

  const duration = resolvedProgress >= 100
    ? 220
    : Math.max(260, Math.min(640, Math.abs(delta) * 12))
  const startedAt = performance.now()

  const step = (timestamp: number) => {
    const ratio = Math.min(1, (timestamp - startedAt) / duration)
    const eased = 1 - ((1 - ratio) ** 3)
    displayProgress.value = clampProgress(startProgress + (delta * eased))

    if (ratio >= 1) {
      progressAnimationFrame = null
      return
    }

    progressAnimationFrame = requestAnimationFrame(step)
  }

  progressAnimationFrame = requestAnimationFrame(step)
}

watch(() => props.progress, nextProgress => animateProgress(nextProgress), { immediate: true })
watch(() => props.brand, () => {
  void syncWordmarkBounds()
})

async function syncWordmarkBounds(): Promise<void> {
  if (!import.meta.client)
    return
  await nextTick()
  const textEl = wordmarkBaseTextRef.value
  if (!textEl)
    return
  try {
    const bounds = textEl.getBBox()
    if (!Number.isFinite(bounds.y) || !Number.isFinite(bounds.height) || bounds.height <= 0)
      return
    const nextY = Math.max(0, bounds.y)
    const nextHeight = Math.min(WORDMARK_VIEWBOX_HEIGHT - nextY, bounds.height)
    if (nextHeight <= 0)
      return
    wordmarkBounds.value = {
      y: nextY,
      height: nextHeight,
    }
  }
  catch {
  }
}

onMounted(() => {
  void syncWordmarkBounds()
  if (!import.meta.client || !('fonts' in document) || !document.fonts?.ready)
    return
  void document.fonts.ready.then(() => syncWordmarkBounds())
})

onBeforeUnmount(() => {
  stopProgressAnimation()
})
</script>

<template>
  <div
    class="workspace-shell-loading-overlay"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :aria-label="statusLabel"
    @contextmenu.prevent.stop
  >
    <div class="workspace-shell-loading-overlay__content" aria-hidden="true">
      <svg
        class="workspace-shell-loading-overlay__wordmark"
        :viewBox="`0 0 ${WORDMARK_VIEWBOX_WIDTH} ${WORDMARK_VIEWBOX_HEIGHT}`"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id="workspace-shell-loading-wordmark-fill">
            <rect
              x="0"
              :y="progressClipY"
              :width="WORDMARK_VIEWBOX_WIDTH"
              :height="progressClipHeight"
            />
          </clipPath>
        </defs>
        <text
          ref="wordmarkBaseTextRef"
          x="50%"
          y="56%"
          text-anchor="middle"
          dominant-baseline="middle"
          class="workspace-shell-loading-overlay__text workspace-shell-loading-overlay__text--base"
        >
          {{ props.brand }}
        </text>
        <text
          x="50%"
          y="56%"
          text-anchor="middle"
          dominant-baseline="middle"
          clip-path="url(#workspace-shell-loading-wordmark-fill)"
          class="workspace-shell-loading-overlay__text workspace-shell-loading-overlay__text--fill"
        >
          {{ props.brand }}
        </text>
      </svg>
      <span class="workspace-shell-loading-overlay__percent">{{ progressLabel }}</span>
    </div>
    <span class="workspace-shell-loading-overlay__sr-only">{{ statusLabel }}</span>
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

.workspace-shell-loading-overlay__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--wl-space-3);
}

.workspace-shell-loading-overlay__wordmark {
  display: block;
  width: min(92vw, 1400px);
  height: auto;
  overflow: visible;
}

.workspace-shell-loading-overlay__text {
  font-family: var(--wl-font-sans);
  font-size: 92px;
  font-weight: 800;
  letter-spacing: 0.08em;
  user-select: none;
}

.workspace-shell-loading-overlay__text--base {
  fill: var(--wl-text-faint);
  opacity: 0.42;
}

.workspace-shell-loading-overlay__text--fill {
  fill: var(--wl-primary-600);
}

.workspace-shell-loading-overlay__percent {
  min-width: 5ch;
  color: var(--wl-text-tertiary);
  font-size: var(--wl-text-body-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.18em;
  text-align: center;
  user-select: none;
}

.workspace-shell-loading-overlay__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .workspace-shell-loading-overlay__text {
    letter-spacing: 0.05em;
  }
}
</style>
