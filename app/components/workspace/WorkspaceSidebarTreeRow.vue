<script setup lang="ts">
const props = withDefaults(defineProps<{
  active?: boolean
  batchSelected?: boolean
  menuOpen?: boolean
  dropInside?: boolean
  fresh?: boolean
  paddingLeft?: string
}>(), {
  active: false,
  batchSelected: false,
  menuOpen: false,
  dropInside: false,
  fresh: false,
  paddingLeft: '',
})

const slots = useSlots()

const hasActions = computed(() => (slots.actions?.() || []).length > 0)
const mainStyle = computed<Record<string, string> | undefined>(() => {
  const paddingLeft = String(props.paddingLeft || '').trim()
  if (!paddingLeft)
    return undefined
  return {
    paddingLeft,
  }
})
</script>

<template>
  <div
    class="workspace-tree-item-row"
    :class="{
      'workspace-tree-item-row--active': props.active,
      'workspace-tree-item-row--batch-selected': props.batchSelected,
      'workspace-tree-item-row--menu-open': props.menuOpen,
      'workspace-tree-item-row--drop-inside': props.dropInside,
      'workspace-tree-item-row--fresh': props.fresh,
    }"
  >
    <div
      class="workspace-resource-tree-row__main"
      :class="{ 'workspace-resource-tree-row__main--with-actions': hasActions }"
      :style="mainStyle"
    >
      <slot />
    </div>

    <div v-if="hasActions" class="workspace-resource-actions workspace-resource-actions--cluster">
      <slot name="actions" />
    </div>
  </div>
</template>
