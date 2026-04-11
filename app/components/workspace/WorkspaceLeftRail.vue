<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'
import type { ProjectUploadActivityItem, ProjectUploadSummary } from '~/types/project-upload'
import NotificationBellButton from '~/components/notifications/NotificationBellButton.vue'
import WorkspaceUploadAside from '~/components/workspace/WorkspaceUploadAside.vue'
import WorkspaceUserRailMenu from '~/components/workspace/WorkspaceUserRailMenu.vue'

interface WorkspaceLeftRailItem {
  id: string
  title: string
  icon: string
}

const props = withDefaults(defineProps<{
  items?: WorkspaceLeftRailItem[]
  activeId?: string
  workspaceId?: string
  collapsed?: boolean
  recycleActive?: boolean
  memberManagementActive?: boolean
  userName?: string
  userEmail?: string
  userAvatarUrl?: string
  workspaceOptions?: WorkspaceWithQuota[]
  workspaceCanManageMembers?: boolean
  hasActiveProject?: boolean
  uploadSummary?: ProjectUploadSummary | null
  uploadDrawerOpen?: boolean
  uploadActivityItems?: ProjectUploadActivityItem[]
  uploadHistoryLoaded?: boolean
}>(), {
  items: () => [],
  activeId: '',
  workspaceId: '',
  collapsed: false,
  recycleActive: false,
  memberManagementActive: false,
  userName: '',
  userEmail: '',
  userAvatarUrl: '',
  workspaceOptions: () => [],
  workspaceCanManageMembers: false,
  hasActiveProject: false,
  uploadSummary: null,
  uploadDrawerOpen: false,
  uploadActivityItems: () => [],
  uploadHistoryLoaded: false,
})

const emit = defineEmits<{
  select: [id: string]
  toggleUploadDrawer: []
  openRecycleBin: []
  openMemberManagement: []
  openSettings: []
  openNotifications: []
  switchWorkspace: [workspaceId: string]
  openWorkspaceHome: []
  openDisplayPreferences: []
  openAccountCenter: []
  pauseUploadTask: [sessionId: string]
  resumeUploadTask: [sessionId: string]
  retryUploadTask: [sessionId: string]
  cancelUploadTask: [sessionId: string]
  rebindUploadTask: [sessionId: string]
  pauseAllUploadTasks: []
  resumeAllUploadTasks: []
  clearCompletedUploadTasks: []
}>()
</script>

<template>
  <div class="workspace-left-rail">
    <nav class="workspace-left-rail__menu" aria-label="工作区左侧导航">
      <button
        v-for="item in props.items"
        :key="item.id"
        :aria-label="item.title"
        class="workspace-left-rail__item"
        :class="{ 'workspace-left-rail__item--active': !props.collapsed && item.id === props.activeId }"
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
      <WorkspaceUploadAside
        :has-active-project="props.hasActiveProject"
        :upload-summary="props.uploadSummary"
        :upload-drawer-open="props.uploadDrawerOpen"
        :upload-activity-items="props.uploadActivityItems"
        :upload-history-loaded="props.uploadHistoryLoaded"
        @toggle-upload-drawer="emit('toggleUploadDrawer')"
        @pause-upload-task="emit('pauseUploadTask', $event)"
        @resume-upload-task="emit('resumeUploadTask', $event)"
        @retry-upload-task="emit('retryUploadTask', $event)"
        @cancel-upload-task="emit('cancelUploadTask', $event)"
        @rebind-upload-task="emit('rebindUploadTask', $event)"
        @pause-all-upload-tasks="emit('pauseAllUploadTasks')"
        @resume-all-upload-tasks="emit('resumeAllUploadTasks')"
        @clear-completed-upload-tasks="emit('clearCompletedUploadTasks')"
      />

      <button
        class="workspace-left-rail__shortcut"
        :class="{ 'workspace-left-rail__shortcut--active': props.recycleActive }"
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
        :class="{ 'workspace-left-rail__members--active': props.memberManagementActive }"
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
        :workspace-id="props.workspaceId"
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

      <div class="workspace-left-rail__footer-divider" aria-hidden="true" />

      <WorkspaceUserRailMenu
        :workspace-id="props.workspaceId"
        :user-name="props.userName"
        :user-email="props.userEmail"
        :user-avatar-url="props.userAvatarUrl"
        :workspace-options="props.workspaceOptions"
        :workspace-can-manage-members="props.workspaceCanManageMembers"
        @switch-workspace="emit('switchWorkspace', $event)"
        @open-workspace-home="emit('openWorkspaceHome')"
        @open-workspace-settings="emit('openSettings')"
        @open-display-preferences="emit('openDisplayPreferences')"
        @open-member-management="emit('openMemberManagement')"
        @open-account-center="emit('openAccountCenter')"
      />
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

.workspace-left-rail__footer-divider {
  width: 26px;
  height: 1px;
  background: #dce4ef;
  margin: 4px 0 2px;
  border-radius: 999px;
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
