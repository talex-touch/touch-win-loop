<script setup lang="ts">
interface WorkspaceLeftRailItem {
  id: string
  title: string
  icon: string
}

withDefaults(defineProps<{
  items?: WorkspaceLeftRailItem[]
  activeId?: string
}>(), {
  items: () => [],
  activeId: '',
})

const emit = defineEmits<{
  select: [id: string]
  openSettings: []
}>()
</script>

<template>
  <div class="workspace-left-rail">
    <div class="workspace-left-rail__decor" aria-hidden="true" />

    <nav class="workspace-left-rail__menu" aria-label="工作区左侧导航">
      <button
        v-for="item in items"
        :key="item.id"
        :title="item.title"
        :aria-label="item.title"
        :data-tooltip="item.title"
        class="workspace-left-rail__item"
        :class="{ 'workspace-left-rail__item--active': item.id === activeId }"
        type="button"
        @click="emit('select', item.id)"
      >
        <span class="material-symbols-outlined">
          {{ item.icon }}
        </span>
      </button>
    </nav>

    <button
      class="workspace-left-rail__setting"
      title="打开设置面板"
      aria-label="打开设置面板"
      data-tooltip="打开设置面板"
      type="button"
      @click="emit('openSettings')"
    >
      <span class="material-symbols-outlined">settings</span>
    </button>
  </div>
</template>

<style scoped>
.workspace-left-rail {
  width: 62px;
  background: #ffffff;
  border-right: 1px solid #d9e0ec;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex-shrink: 0;
  position: relative;
}

.workspace-left-rail__decor {
  height: 12px;
  margin: 12px auto 8px;
  width: 20px;
  border-top: 1px solid #ced7e8;
  border-bottom: 1px solid #e2e7f1;
  opacity: 1;
}

.workspace-left-rail__menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 7px 0;
}

.workspace-left-rail__item {
  position: relative;
  border: none;
  border-radius: 12px;
  width: 48px;
  height: 48px;
  color: #6e7e99;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: all 0.2s ease;
  cursor: pointer;
}

.workspace-left-rail__item .material-symbols-outlined {
  font-size: 26px;
}

.workspace-left-rail__item:hover {
  color: #415474;
  background: #f5f8fd;
}

.workspace-left-rail__item--active {
  color: #2e415f;
  background: #eef2f8;
}

.workspace-left-rail__item--active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 9px;
  width: 3px;
  height: 30px;
  border-radius: 3px;
  background: #8fa1be;
}

.workspace-left-rail__setting {
  margin-top: auto;
  margin-bottom: 12px;
  margin-inline: 7px;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 12px;
  color: #7c8ca6;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-left-rail__setting .material-symbols-outlined {
  font-size: 26px;
}

.workspace-left-rail__setting:hover {
  color: #3d516f;
  background: #f5f8fd;
}

.workspace-left-rail__item[data-tooltip]::after,
.workspace-left-rail__setting[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  border-radius: 6px;
  background: rgba(16, 23, 40, 0.92);
  color: #f4f7ff;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  padding: 6px 8px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 30;
}

.workspace-left-rail__item[data-tooltip]:hover::after,
.workspace-left-rail__setting[data-tooltip]:hover::after {
  opacity: 1;
}
</style>
