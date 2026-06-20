<script setup lang="ts">
const props = withDefaults(defineProps<{
  compact?: boolean
  lineshadow?: boolean
}>(), {
  compact: false,
  lineshadow: false,
})
</script>

<template>
  <div class="winloop-text-icon" :class="{ 'winloop-text-icon--compact': props.compact }" aria-label="WinLoop">
    <div class="winloop-text-icon__token" aria-hidden="true">
      WL
    </div>
    <div class="winloop-text-icon__copy">
      <p v-if="!props.compact" class="winloop-text-icon__eyebrow">
        Touch WinLoop
      </p>
      <div class="winloop-text-icon__wordmark">
        <span class="winloop-text-icon__word winloop-text-icon__word--win">Win</span>
        <span
          class="winloop-text-icon__word winloop-text-icon__word--loop"
          :class="{ 'winloop-text-icon__word--loop-lineshadow': props.lineshadow }"
          :data-text="props.lineshadow ? 'Loop' : undefined"
        >
          Loop
        </span>
      </div>
      <p v-if="!props.compact" class="winloop-text-icon__caption">
        竞赛协作工作台
      </p>
    </div>
  </div>
</template>

<style scoped>
.winloop-text-icon {
  --winloop-loop-shadow-color: rgba(15, 23, 42, 0.92);
  display: inline-flex;
  align-items: center;
  gap: 18px;
  color: #0f172a;
}

.winloop-text-icon__token {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 70px;
  height: 70px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 24px;
  background: linear-gradient(160deg, rgba(15, 23, 42, 0.92), rgba(51, 65, 85, 0.78)), rgba(255, 255, 255, 0.2);
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
  color: #ffffff;
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.18em;
  backdrop-filter: blur(18px);
}

.winloop-text-icon__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.winloop-text-icon__eyebrow {
  margin: 0;
  color: rgba(51, 65, 85, 0.82);
  font-family: 'IBM Plex Mono', ui-monospace, monospace;
  font-size: 11px;
  letter-spacing: 0.26em;
  text-transform: uppercase;
}

.winloop-text-icon__wordmark {
  display: inline-flex;
  align-items: baseline;
  line-height: 1;
}

.winloop-text-icon__word {
  font-family: 'DM Sans', 'IBM Plex Sans', 'PingFang SC', sans-serif;
  font-size: clamp(46px, 8vw, 76px);
  letter-spacing: -0.08em;
}

.winloop-text-icon__word--win {
  font-weight: 620;
}

.winloop-text-icon__word--loop {
  margin-left: -0.04em;
  font-style: italic;
  font-weight: 760;
}

.winloop-text-icon__word--loop-lineshadow {
  position: relative;
  z-index: 0;
  display: inline-block;
}

.winloop-text-icon__word--loop-lineshadow::after {
  content: attr(data-text);
  position: absolute;
  top: 0.04em;
  left: 0.04em;
  z-index: -1;
  background-image: linear-gradient(
    45deg,
    transparent 45%,
    var(--winloop-loop-shadow-color) 45%,
    var(--winloop-loop-shadow-color) 55%,
    transparent 0
  );
  background-size: 0.06em 0.06em;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  pointer-events: none;
  animation: winloop-line-shadow 15s linear infinite;
}

.winloop-text-icon__caption {
  margin: 0;
  color: rgba(71, 85, 105, 0.92);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.08em;
}

.winloop-text-icon--compact {
  gap: 14px;
}

.winloop-text-icon--compact .winloop-text-icon__token {
  width: 58px;
  height: 58px;
  border-radius: 20px;
  font-size: 16px;
}

.winloop-text-icon--compact .winloop-text-icon__word {
  font-size: clamp(34px, 8vw, 56px);
}

@media (max-width: 640px) {
  .winloop-text-icon {
    gap: 14px;
  }

  .winloop-text-icon__token {
    width: 60px;
    height: 60px;
    border-radius: 20px;
    font-size: 16px;
  }

  .winloop-text-icon__eyebrow {
    font-size: 10px;
  }

  .winloop-text-icon__caption {
    font-size: 12px;
  }
}

@keyframes winloop-line-shadow {
  0% {
    background-position: 0 0;
  }

  100% {
    background-position: 100% -100%;
  }
}
</style>
