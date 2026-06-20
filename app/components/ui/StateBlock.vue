<script setup lang="ts">
const props = withDefaults(defineProps<{
  tone?: 'default' | 'loading' | 'success' | 'warning' | 'error'
  title?: string
  description?: string
  centered?: boolean
}>(), {
  tone: 'default',
  title: '',
  description: '',
  centered: false,
})

const blockClass = computed(() => [
  'wl-state-block',
  props.centered ? 'wl-state-block--center' : '',
  props.tone !== 'default' ? `wl-state-block--${props.tone}` : '',
])
</script>

<template>
  <section :class="blockClass">
    <h2 v-if="title" class="wl-state-block__title">
      {{ title }}
    </h2>
    <p v-if="description" class="wl-state-block__description">
      {{ description }}
    </p>
    <slot />
  </section>
</template>
