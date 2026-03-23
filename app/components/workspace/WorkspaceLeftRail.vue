<script setup lang="ts">
interface WorkspaceLeftRailItem {
  id: string
  title: string
  icon: string
}

withDefaults(defineProps<{
  items?: WorkspaceLeftRailItem[]
  activeId?: string
  recycleActive?: boolean
}>(), {
  items: () => [],
  activeId: '',
  recycleActive: false,
})

const emit = defineEmits<{
  select: [id: string]
  openRecycleBin: []
  openSettings: []
}>()
</script>

<template>
  <div class="workspace-left-rail">
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

    <div class="workspace-left-rail__footer">
      <button
        class="workspace-left-rail__shortcut"
        :class="{ 'workspace-left-rail__shortcut--active': recycleActive }"
        title="打开项目回收站"
        aria-label="打开项目回收站"
        data-tooltip="打开项目回收站"
        type="button"
        @click="emit('openRecycleBin')"
      >
        <span class="material-symbols-outlined">delete</span>
      </button>

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

.workspace-left-rail__menu {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 7px 0;
}

.workspace-left-rail__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 7px 12px;
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
  width: 32px;
  height: 32px;
  font-size: 32px;
  line-height: 32px;
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

.workspace-left-rail__shortcut,
.workspace-left-rail__setting {
  position: relative;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-left-rail__shortcut .material-symbols-outlined,
.workspace-left-rail__setting .material-symbols-outlined {
  width: 32px;
  height: 32px;
  font-size: 32px;
  line-height: 32px;
}

.workspace-left-rail__shortcut {
  color: #d04a4a;
}

.workspace-left-rail__setting {
  color: #7c8ca6;
}

.workspace-left-rail__shortcut:hover {
  color: #b52f2f;
  background: #fff0f0;
}

.workspace-left-rail__setting:hover {
  color: #3d516f;
  background: #f5f8fd;
}

.workspace-left-rail__shortcut--active {
  color: #a92323;
  background: #ffe4e4;
}

.workspace-left-rail__item[data-tooltip]::after,
.workspace-left-rail__shortcut[data-tooltip]::after,
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
.workspace-left-rail__shortcut[data-tooltip]:hover::after,
.workspace-left-rail__setting[data-tooltip]:hover::after {
  opacity: 1;
}
</style>
