<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  mode?: 'orb'
  glowFrom?: string
  glowTo?: string
}>(), {
  mode: 'orb',
  glowFrom: '#ee4f27',
  glowTo: '#6b21ef',
})

const pointerX = ref('50%')
const pointerY = ref('50%')
const pointerOpacity = ref(0)

const cardStyle = computed(() => ({
  '--magic-card-glow-from': props.glowFrom,
  '--magic-card-glow-to': props.glowTo,
  '--magic-card-pointer-x': pointerX.value,
  '--magic-card-pointer-y': pointerY.value,
  '--magic-card-pointer-opacity': String(pointerOpacity.value),
}))

function handlePointerMove(event: PointerEvent) {
  const currentTarget = event.currentTarget
  if (!(currentTarget instanceof HTMLElement))
    return

  const rect = currentTarget.getBoundingClientRect()
  if (!rect.width || !rect.height)
    return

  const relativeX = (event.clientX - rect.left) / rect.width
  const relativeY = (event.clientY - rect.top) / rect.height
  const clampedX = Math.min(Math.max(relativeX, 0), 1)
  const clampedY = Math.min(Math.max(relativeY, 0), 1)

  pointerX.value = `${(clampedX * 100).toFixed(2)}%`
  pointerY.value = `${(clampedY * 100).toFixed(2)}%`
  pointerOpacity.value = 1
}

function handlePointerLeave() {
  pointerX.value = '50%'
  pointerY.value = '50%'
  pointerOpacity.value = 0
}
</script>

<template>
  <section
    class="magic-card"
    :class="props.mode === 'orb' ? 'magic-card--orb' : ''"
    :style="cardStyle"
    v-bind="$attrs"
    @pointermove="handlePointerMove"
    @pointerleave="handlePointerLeave"
  >
    <div class="magic-card__backdrop" />
    <div class="magic-card__border-glow" />
    <div class="magic-card__spotlight" />
    <div class="magic-card__glow magic-card__glow--primary" />
    <div class="magic-card__glow magic-card__glow--secondary" />
    <div class="magic-card__noise" />

    <div class="magic-card__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.magic-card {
  --magic-card-glow-from: #ee4f27;
  --magic-card-glow-to: #6b21ef;
  --magic-card-hover-glow-size: 380px;
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 470px;
  min-height: 0;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.58)), rgba(255, 255, 255, 0.5);
  box-shadow:
    0 30px 100px rgba(15, 23, 42, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(24px);
  isolation: isolate;
  transition: box-shadow 220ms ease;
}

.magic-card__backdrop,
.magic-card__border-glow,
.magic-card__spotlight,
.magic-card__glow,
.magic-card__noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.magic-card__backdrop {
  background:
    radial-gradient(
      circle at top right,
      color-mix(in srgb, var(--magic-card-glow-from) 18%, transparent) 0,
      transparent 42%
    ),
    radial-gradient(
      circle at bottom left,
      color-mix(in srgb, var(--magic-card-glow-to) 18%, transparent) 0,
      transparent 46%
    );
  opacity: 0.95;
}

.magic-card__border-glow {
  padding: 1px;
  border-radius: inherit;
  background: radial-gradient(
    circle var(--magic-card-hover-glow-size) at var(--magic-card-pointer-x) var(--magic-card-pointer-y),
    color-mix(in srgb, var(--magic-card-glow-from) 86%, white) 0,
    color-mix(in srgb, var(--magic-card-glow-to) 74%, white) 18%,
    color-mix(in srgb, var(--magic-card-glow-to) 32%, transparent) 34%,
    transparent 56%
  );
  opacity: calc(var(--magic-card-pointer-opacity) * 0.95);
  transition: opacity 180ms ease;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

.magic-card__spotlight {
  background: radial-gradient(
    circle calc(var(--magic-card-hover-glow-size) * 0.5) at var(--magic-card-pointer-x) var(--magic-card-pointer-y),
    color-mix(in srgb, var(--magic-card-glow-from) 24%, rgba(255, 255, 255, 0.96)) 0,
    color-mix(in srgb, var(--magic-card-glow-to) 18%, rgba(255, 255, 255, 0.2)) 22%,
    transparent 60%
  );
  opacity: calc(var(--magic-card-pointer-opacity) * 0.72);
  mix-blend-mode: screen;
  transition:
    opacity 180ms ease,
    background-position 160ms ease;
}

.magic-card__glow {
  filter: blur(44px);
  opacity: 0.68;
  mix-blend-mode: screen;
  animation: magic-card-float 8s ease-in-out infinite;
}

.magic-card__glow--primary {
  top: -34%;
  left: 54%;
  width: 56%;
  height: 56%;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--magic-card-glow-from) 74%, white) 0, transparent 72%);
}

.magic-card__glow--secondary {
  top: 58%;
  left: -8%;
  width: 48%;
  height: 48%;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--magic-card-glow-to) 68%, white) 0, transparent 74%);
  animation-delay: -4.5s;
}

.magic-card__noise {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.2), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.44), rgba(255, 255, 255, 0) 30%);
  opacity: 0.65;
}

.magic-card__content {
  position: relative;
  z-index: 1;
}

.magic-card:hover {
  box-shadow:
    0 34px 120px rgba(15, 23, 42, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
}

@keyframes magic-card-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }

  50% {
    transform: translate3d(-14px, 16px, 0) scale(1.08);
  }
}

@media (max-width: 640px) {
  .magic-card {
    padding: 22px;
    border-radius: 28px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .magic-card {
    transition: none;
  }

  .magic-card__glow {
    animation: none;
  }
}
</style>
