<script setup lang="ts">
const props = withDefaults(defineProps<{
  visible?: boolean
  position?: { x: number, y: number }
  canCloseSelf?: boolean
  canCloseLeft?: boolean
  canCloseRight?: boolean
  canCloseOthers?: boolean
  canCloseAll?: boolean
}>(), {
  visible: false,
  position: () => ({ x: 0, y: 0 }),
  canCloseSelf: false,
  canCloseLeft: false,
  canCloseRight: false,
  canCloseOthers: false,
  canCloseAll: false,
})

const emit = defineEmits<{
  closeSelf: []
  closeLeft: []
  closeRight: []
  closeOthers: []
  closeAll: []
}>()
</script>

<template>
  <div
    v-if="props.visible"
    class="workspace-tab-context-menu"
    :style="{
      left: `${props.position.x}px`,
      top: `${props.position.y}px`,
    }"
  >
    <button
      class="workspace-tab-context-menu__item"
      :disabled="!props.canCloseSelf"
      @click="emit('closeSelf')"
    >
      关闭标签页
    </button>
    <button
      class="workspace-tab-context-menu__item"
      :disabled="!props.canCloseLeft"
      @click="emit('closeLeft')"
    >
      关闭左侧标签页
    </button>
    <button
      class="workspace-tab-context-menu__item"
      :disabled="!props.canCloseRight"
      @click="emit('closeRight')"
    >
      关闭右侧标签页
    </button>
    <button
      class="workspace-tab-context-menu__item"
      :disabled="!props.canCloseOthers"
      @click="emit('closeOthers')"
    >
      关闭其他标签页
    </button>
    <button
      class="workspace-tab-context-menu__item workspace-tab-context-menu__item--danger"
      :disabled="!props.canCloseAll"
      @click="emit('closeAll')"
    >
      关闭全部标签页
    </button>
  </div>
</template>

<style scoped>
.workspace-tab-context-menu {
  position: fixed;
  z-index: 40;
  min-width: 168px;
  overflow: hidden;
  border: 1px solid var(--wl-border);
  border-radius: 10px;
  background: var(--wl-surface);
  box-shadow: var(--wl-shadow-card);
}

.workspace-tab-context-menu__item {
  width: 100%;
  padding: 9px 12px;
  border: 0;
  background: transparent;
  color: var(--wl-text-secondary);
  font-size: var(--wl-text-caption);
  text-align: left;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.workspace-tab-context-menu__item:hover:enabled {
  background: var(--wl-surface-muted);
  color: var(--wl-text-primary);
}

.workspace-tab-context-menu__item:disabled {
  color: var(--wl-text-faint);
  cursor: not-allowed;
}

.workspace-tab-context-menu__item--danger {
  color: var(--wl-danger-700);
}

.workspace-tab-context-menu__item--danger:hover:enabled {
  background: var(--wl-danger-050);
  color: var(--wl-danger-700);
}
</style>
