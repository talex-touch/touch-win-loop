<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface PillTabItem {
  key: string
  label: string
  to?: RouteLocationRaw
  disabled?: boolean
}

const props = defineProps<{
  items: PillTabItem[]
  activeKey: string
}>()

const emit = defineEmits<{
  (event: 'select', key: string): void
}>()

function isActive(key: string): boolean {
  return props.activeKey === key
}
</script>

<template>
  <nav class="wl-pill-tabs">
    <template v-for="item in items" :key="item.key">
      <NuxtLink
        v-if="item.to"
        :to="item.to"
        class="wl-pill-tab"
        :class="{ 'wl-pill-tab--active': isActive(item.key) }"
      >
        {{ item.label }}
      </NuxtLink>
      <button
        v-else
        type="button"
        class="wl-pill-tab"
        :class="{ 'wl-pill-tab--active': isActive(item.key) }"
        :disabled="item.disabled"
        @click="emit('select', item.key)"
      >
        {{ item.label }}
      </button>
    </template>
  </nav>
</template>
