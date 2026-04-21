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

const displayProgress = ref(clampProgress(props.progress))

const progressLabel = computed(() => `${Math.round(displayProgress.value)}%`)
const statusLabel = computed(() => `${props.label} ${progressLabel.value}`)
const progressFillHeight = computed(() => `${displayProgress.value}%`)

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
      <div class="workspace-shell-loading-overlay__wordmark">
        <BrandLogo variant="lockup" class="workspace-shell-loading-overlay__brand workspace-shell-loading-overlay__brand--base" />
        <div class="workspace-shell-loading-overlay__fill" :style="{ height: progressFillHeight }">
          <BrandLogo variant="lockup" class="workspace-shell-loading-overlay__brand workspace-shell-loading-overlay__brand--fill" />
        </div>
      </div>
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
  position: relative;
  width: min(56vw, 280px);
  line-height: 0;
}

.workspace-shell-loading-overlay__brand {
  --winloop-brand-lockup-width: 100%;
  display: block;
  width: 100%;
  user-select: none;
}

.workspace-shell-loading-overlay__brand--base {
  opacity: 0.18;
  filter: grayscale(1);
}

.workspace-shell-loading-overlay__brand--fill {
  opacity: 1;
}

.workspace-shell-loading-overlay__fill {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  transition: height 0.22s ease;
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
  .workspace-shell-loading-overlay__wordmark {
    width: min(68vw, 220px);
  }
}
</style>
