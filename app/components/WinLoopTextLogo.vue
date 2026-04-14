<script setup lang="ts">
import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'
import LineShadowText from '~/components/common/LineShadowText.vue'

const colorMode = useColorMode()
const loopShadowColor = computed(() => {
  return colorMode.value === 'dark'
    ? 'rgba(255, 255, 255, 0.92)'
    : 'rgba(0, 0, 0, 0.92)'
})
</script>

<template>
  <div class="winloop-text-logo" aria-label="Win Loop">
    <span class="winloop-text-logo__word">Win</span>
    <LineShadowText
      as="span"
      class="winloop-text-logo__word winloop-text-logo__word--loop"
      :shadow-color="loopShadowColor"
    >
      Loop
    </LineShadowText>
  </div>
</template>

<style scoped>
.winloop-text-logo {
  display: inline-flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.22em;
  color: #0f172a;
  font-family: var(--wl-font-sans);
  font-weight: 760;
  letter-spacing: -0.08em;
  line-height: 0.84;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
  text-transform: none;
  white-space: nowrap;
  user-select: none;
}

.winloop-text-logo__word {
  font-size: var(--winloop-text-logo-size, max(56px, min(5.2vw, 5.2vh)));
}

.winloop-text-logo__word--loop {
  font-style: italic;
  font-weight: 820;
  margin-left: 0;
}

@media (max-width: 768px) {
  .winloop-text-logo__word {
    font-size: var(--winloop-text-logo-size, max(48px, min(3.4vw, 2.4vh)));
  }
}
</style>
