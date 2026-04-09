<script setup lang="ts">
import NotificationBellButton from '~/components/notifications/NotificationBellButton.vue'

interface WorkspaceLeftRailItem {
  id: string
  title: string
  icon: string
}

withDefaults(defineProps<{
  items?: WorkspaceLeftRailItem[]
  activeId?: string
  workspaceId?: string
  collapsed?: boolean
  recycleActive?: boolean
  memberManagementActive?: boolean
}>(), {
  items: () => [],
  activeId: '',
  workspaceId: '',
  collapsed: false,
  recycleActive: false,
  memberManagementActive: false,
})

const emit = defineEmits<{
  select: [id: string]
  openRecycleBin: []
  openMemberManagement: []
  openSettings: []
  openNotifications: []
}>()
</script>

<template>
  <div class="workspace-left-rail">
    <nav class="workspace-left-rail__menu" aria-label="工作区左侧导航">
      <button
        v-for="item in items"
        :key="item.id"
        :aria-label="item.title"
        class="workspace-left-rail__item"
        :class="{ 'workspace-left-rail__item--active': !collapsed && item.id === activeId }"
        type="button"
        @click="emit('select', item.id)"
      >
        <span class="material-symbols-outlined workspace-left-rail__icon">
          {{ item.icon }}
        </span>
        <span class="workspace-left-rail__popover" aria-hidden="true">{{ item.title }}</span>
      </button>
    </nav>

    <div class="workspace-left-rail__footer">
      <button
        class="workspace-left-rail__shortcut"
        :class="{ 'workspace-left-rail__shortcut--active': recycleActive }"
        aria-label="打开项目回收站"
        type="button"
        @click="emit('openRecycleBin')"
      >
        <span class="material-symbols-outlined workspace-left-rail__icon">delete</span>
        <span class="workspace-left-rail__popover" aria-hidden="true">打开项目回收站</span>
      </button>

      <button
        data-testid="workspace-left-rail-member-management-button"
        class="workspace-left-rail__members"
        :class="{ 'workspace-left-rail__members--active': memberManagementActive }"
        aria-label="项目协作"
        type="button"
        @click="emit('openMemberManagement')"
      >
        <span class="material-symbols-outlined workspace-left-rail__icon">group</span>
        <span class="workspace-left-rail__popover" aria-hidden="true">项目协作</span>
      </button>

      <NotificationBellButton
        data-testid="workspace-left-rail-notification-button"
        variant="rail"
        :workspace-id="workspaceId"
        @open="emit('openNotifications')"
      />

      <button
        class="workspace-left-rail__setting"
        aria-label="打开设置面板"
        type="button"
        @click="emit('openSettings')"
      >
        <span class="material-symbols-outlined workspace-left-rail__icon">settings</span>
        <span class="workspace-left-rail__popover" aria-hidden="true">打开设置面板</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-left-rail {
  width: 56px;
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
  align-items: center;
  gap: 10px;
  padding: 10px 0 0;
}

.workspace-left-rail__footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
}

.workspace-left-rail__item {
  position: relative;
  border: none;
  border-radius: 12px;
  width: 36px;
  height: 36px;
  color: #6e7e99;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition: all 0.2s ease;
  cursor: pointer;
}

.workspace-left-rail__icon {
  width: 24px;
  height: 24px;
  font-size: 24px;
  line-height: 24px;
  font-variation-settings:
    'FILL' 0,
    'wght' 320,
    'opsz' 24;
}

.workspace-left-rail__item:hover {
  color: #415474;
  background: #f5f8fd;
}

.workspace-left-rail__item--active {
  color: #35537f;
  background: #f3f7ff;
  box-shadow: inset 0 0 0 1px #d7e3f8;
}

.workspace-left-rail__shortcut,
.workspace-left-rail__members,
.workspace-left-rail__setting {
  position: relative;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.workspace-left-rail__shortcut {
  color: #d04a4a;
}

.workspace-left-rail__members {
  color: #2e5b99;
}

.workspace-left-rail__setting {
  color: #7c8ca6;
}

.workspace-left-rail__shortcut:hover {
  color: #b52f2f;
  background: #fff0f0;
}

.workspace-left-rail__members:hover {
  color: #1e3a74;
  background: #eef4ff;
}

.workspace-left-rail__setting:hover {
  color: #3d516f;
  background: #f5f8fd;
}

.workspace-left-rail__shortcut--active {
  color: #a92323;
  background: #fff2f2;
  box-shadow: inset 0 0 0 1px #f3d8d8;
}

.workspace-left-rail__members--active {
  color: #1e3a74;
  background: #eef4ff;
  box-shadow: inset 0 0 0 1px #d7e3f8;
}

.workspace-left-rail__popover {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid rgba(214, 222, 236, 0.96);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  padding: 6px 9px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.12);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    visibility 0.16s ease;
  z-index: 40;
}

.workspace-left-rail__item:hover .workspace-left-rail__popover,
.workspace-left-rail__item:focus-visible .workspace-left-rail__popover,
.workspace-left-rail__shortcut:hover .workspace-left-rail__popover,
.workspace-left-rail__shortcut:focus-visible .workspace-left-rail__popover,
.workspace-left-rail__members:hover .workspace-left-rail__popover,
.workspace-left-rail__members:focus-visible .workspace-left-rail__popover,
.workspace-left-rail__setting:hover .workspace-left-rail__popover,
.workspace-left-rail__setting:focus-visible .workspace-left-rail__popover {
  opacity: 1;
  visibility: visible;
}

.workspace-left-rail__item:focus-visible,
.workspace-left-rail__shortcut:focus-visible,
.workspace-left-rail__members:focus-visible,
.workspace-left-rail__setting:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 1px;
}
</style>
