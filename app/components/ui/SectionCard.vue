<script setup lang="ts">
const props = withDefaults(defineProps<{
  tone?: 'default' | 'muted' | 'danger' | 'success'
  compact?: boolean
  title?: string
  description?: string
}>(), {
  tone: 'default',
  compact: false,
  title: '',
  description: '',
})

const cardClass = computed(() => [
  'wl-section-card',
  props.compact ? 'wl-section-card--compact' : '',
  props.tone !== 'default' ? `wl-section-card--${props.tone}` : '',
])
</script>

<template>
  <section :class="cardClass">
    <div v-if="title || description || $slots.actions" class="wl-section-card__head">
      <div>
        <h2 v-if="title" class="wl-section-card__title">
          {{ title }}
        </h2>
        <p v-if="description" class="wl-section-card__description">
          {{ description }}
        </p>
      </div>

      <div v-if="$slots.actions" class="wl-action-bar">
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </section>
</template>
