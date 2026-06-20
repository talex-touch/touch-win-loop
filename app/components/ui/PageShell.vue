<script setup lang="ts">
const props = withDefaults(defineProps<{
  tag?: string
  size?: 'default' | 'compact' | 'wide' | 'auth'
  gap?: 'md' | 'lg' | 'xl'
}>(), {
  tag: 'div',
  size: 'default',
  gap: 'md',
})

const shellClass = computed(() => [
  'wl-page-shell',
  props.size !== 'default' ? `wl-page-shell--${props.size}` : '',
  props.gap !== 'md' ? `wl-page-shell--gap-${props.gap}` : '',
])
</script>

<template>
  <component :is="tag" :class="shellClass">
    <slot />
  </component>
</template>
