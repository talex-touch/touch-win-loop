<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'surface' | 'rail' | 'stage' | 'toolbar'
  scrollable?: boolean
  padded?: boolean
  fill?: boolean
}>(), {
  variant: 'surface',
  scrollable: false,
  padded: true,
  fill: true,
})

const variantClass = computed(() => {
  if (props.variant === 'rail') {
    return 'rounded-[12px] border border-slate-200/88 bg-white/96 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
  }
  if (props.variant === 'stage')
    return 'rounded-none border-0 bg-transparent text-white shadow-none'
  if (props.variant === 'toolbar') {
    return 'rounded-[12px] border border-slate-200/90 bg-white/96 text-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
  }
  return 'rounded-[12px] border border-slate-200/90 bg-white/96 text-slate-900 shadow-[0_12px_26px_rgba(15,23,42,0.08)]'
})
</script>

<template>
  <section
    class="relative min-h-0 min-w-0 transition-[background-color,border-color,box-shadow] duration-200"
    :class="[
      props.fill ? 'h-full w-full' : '',
      props.scrollable ? 'overflow-auto' : 'overflow-hidden',
      props.padded ? 'p-4' : '',
      variantClass,
    ]"
    :data-testid="`wl-design-layer-${props.variant}`"
  >
    <slot />
  </section>
</template>
