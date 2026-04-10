<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  description?: string
  meta?: string | string[]
  kicker?: string
}>(), {
  description: '',
  meta: '',
  kicker: '',
})

const metaItems = computed(() => {
  if (Array.isArray(props.meta))
    return props.meta.filter(Boolean)
  return props.meta ? [props.meta] : []
})
</script>

<template>
  <section class="wl-page-header">
    <div class="wl-page-header__content">
      <p v-if="kicker" class="wl-page-header__kicker">
        {{ kicker }}
      </p>
      <h1 class="wl-page-header__title">
        {{ title }}
      </h1>
      <p v-if="description" class="wl-page-header__description">
        {{ description }}
      </p>
      <div v-if="metaItems.length > 0" class="wl-page-header__meta">
        <span v-for="item in metaItems" :key="item">{{ item }}</span>
      </div>
    </div>

    <div v-if="$slots.actions" class="wl-page-header__actions">
      <slot name="actions" />
    </div>
  </section>
</template>
