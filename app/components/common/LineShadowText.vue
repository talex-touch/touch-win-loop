<script setup lang="ts">
import type { VNode } from 'vue'
import { computed, useAttrs, useSlots } from 'vue'

interface LineShadowTextProps {
  as?: string
  shadowColor?: string
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<LineShadowTextProps>(), {
  as: 'span',
  shadowColor: 'black',
})

const attrs = useAttrs()
const slots = useSlots() as Record<string, (() => VNode[]) | undefined>
const children = slots.default ? slots.default()[0]?.children : null
const content = typeof children === 'string' ? children : null

if (!content) {
  throw new Error('LineShadowText only accepts string content')
}

const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

const mergedStyle = computed(() => {
  return [
    attrs.style,
    {
      '--line-shadow-color': props.shadowColor,
    },
  ]
})
</script>

<template>
  <component
    :is="props.as"
    v-bind="forwardedAttrs"
    class="line-shadow-text"
    :style="mergedStyle"
    :class="attrs.class"
  >
    <span class="line-shadow-text-layer line-shadow-text-copy">
      <slot />
    </span>
    <span class="line-shadow-text-layer line-shadow-text-shadow line-shadow-text-shadow--solid" aria-hidden="true">
      {{ content }}
    </span>
    <span class="line-shadow-text-layer line-shadow-text-shadow line-shadow-text-shadow--stripe" aria-hidden="true">
      {{ content }}
    </span>
  </component>
</template>

<style scoped>
.line-shadow-text {
  position: relative;
  display: inline-grid;
  white-space: nowrap;
}

.line-shadow-text-layer {
  grid-area: 1 / 1;
}

.line-shadow-text-copy {
  position: relative;
  z-index: 2;
}

.line-shadow-text-shadow {
  position: relative;
  z-index: 1;
  transform: translate(0.048em, 0.048em);
  white-space: nowrap;
  pointer-events: none;
}

.line-shadow-text-shadow--solid {
  color: var(--line-shadow-color);
  opacity: 0.2;
}

.line-shadow-text-shadow--stripe {
  background-image: linear-gradient(
    45deg,
    transparent 45%,
    var(--line-shadow-color) 45%,
    var(--line-shadow-color) 55%,
    transparent 0
  );
  background-size: 0.075em 0.075em;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: line-shadow-text-motion 15s linear infinite;
}

@keyframes line-shadow-text-motion {
  0% {
    background-position: 0 0;
  }

  100% {
    background-position: 100% -100%;
  }
}
</style>
