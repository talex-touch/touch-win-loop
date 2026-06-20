<script setup lang="ts">
import type { WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import type { ContextMenuAnchorPoint } from '~/types/ui-context-menu'
import CollabPresenceAvatarStack from '~/components/workspace/collab/CollabPresenceAvatarStack.vue'

interface WorkspaceMainPanelTabItem {
  id: string
  title: string
  icon: string
  closeable: boolean
}

interface BreadcrumbSaveState {
  label: string
  tone: 'blocked' | 'dirty' | 'saved' | 'saving'
}

const props = withDefaults(defineProps<{
  openTabs?: WorkspaceMainPanelTabItem[]
  activeTabId?: string
  dragOverTabId?: string
  tabContextMenuVisible?: boolean
  tabContextMenuPosition?: { x: number, y: number }
  contextTabId?: string
  canCloseContextTab?: boolean
  canCloseTabsToLeft?: boolean
  canCloseTabsToRight?: boolean
  canCloseOtherTabs?: boolean
  canCloseAllTabs?: boolean
  breadcrumbItems?: string[]
  breadcrumbSaveState?: BreadcrumbSaveState | null
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
}>(), {
  openTabs: () => [],
  activeTabId: '',
  dragOverTabId: '',
  tabContextMenuVisible: false,
  tabContextMenuPosition: () => ({ x: 0, y: 0 }),
  contextTabId: '',
  canCloseContextTab: false,
  canCloseTabsToLeft: false,
  canCloseTabsToRight: false,
  canCloseOtherTabs: false,
  canCloseAllTabs: false,
  breadcrumbItems: () => [],
  breadcrumbSaveState: null,
  collabPresenceUsers: () => [],
})

const emit = defineEmits<{
  activateTab: [tabId: string]
  closeTab: [tabId: string]
  openTabContextMenu: [payload: {
    tabId: string
    anchorPoint?: ContextMenuAnchorPoint
    anchorEl?: HTMLElement | null
    restoreFocusEl?: HTMLElement | null
  }]
  closeTabContextMenu: []
  closeTabsToLeft: []
  closeTabsToRight: []
  closeOtherTabs: []
  closeAllTabs: []
  dragStart: [tabId: string]
  dragOver: [payload: { tabId: string, event: DragEvent }]
  drop: [payload: { tabId: string, event: DragEvent }]
  dragEnd: []
  openDashboard: []
}>()
</script>

<template>
  <div class="flex flex-col min-w-0 w-full">
    <WorkspaceTabStrip
      :open-tabs="props.openTabs"
      :active-tab-id="props.activeTabId"
      :drag-over-tab-id="props.dragOverTabId"
      :tab-context-menu-visible="props.tabContextMenuVisible"
      :tab-context-menu-position="props.tabContextMenuPosition"
      :context-tab-id="props.contextTabId"
      :can-close-context-tab="props.canCloseContextTab"
      :can-close-tabs-to-left="props.canCloseTabsToLeft"
      :can-close-tabs-to-right="props.canCloseTabsToRight"
      :can-close-other-tabs="props.canCloseOtherTabs"
      :can-close-all-tabs="props.canCloseAllTabs"
      @activate-tab="emit('activateTab', $event)"
      @close-tab="emit('closeTab', $event)"
      @open-tab-context-menu="emit('openTabContextMenu', $event)"
      @close-tab-context-menu="emit('closeTabContextMenu')"
      @close-tabs-to-left="emit('closeTabsToLeft')"
      @close-tabs-to-right="emit('closeTabsToRight')"
      @close-other-tabs="emit('closeOtherTabs')"
      @close-all-tabs="emit('closeAllTabs')"
      @drag-start="emit('dragStart', $event)"
      @drag-over="emit('dragOver', $event)"
      @drop="emit('drop', $event)"
      @drag-end="emit('dragEnd')"
    />

    <div class="workspace-main-breadcrumb text-slate-400 border-b border-slate-200 bg-white flex gap-2 min-w-0 w-full items-center justify-between">
      <div class="workspace-main-breadcrumb__scroll flex flex-1 gap-1.5 min-w-0 items-center overflow-x-auto overflow-y-hidden">
        <template v-for="(item, index) in props.breadcrumbItems" :key="`breadcrumb-${index}-${item}`">
          <span class="workspace-main-breadcrumb__item-wrap">
            <span class="truncate" :class="index === props.breadcrumbItems.length - 1 ? 'text-slate-600 font-medium' : ''">
              {{ item }}
            </span>
            <span
              v-if="index === props.breadcrumbItems.length - 1 && props.breadcrumbSaveState"
              class="workspace-main-breadcrumb__save-state"
              :class="`workspace-main-breadcrumb__save-state--${props.breadcrumbSaveState.tone}`"
              data-testid="workspace-main-breadcrumb-save-state"
            >
              {{ props.breadcrumbSaveState.label }}
            </span>
          </span>
          <span v-if="index < props.breadcrumbItems.length - 1" class="material-symbols-outlined text-[12px]">chevron_right</span>
        </template>
      </div>

      <div class="flex shrink-0 gap-2 items-center">
        <CollabPresenceAvatarStack
          v-if="props.collabPresenceUsers.length > 0"
          :users="props.collabPresenceUsers"
          appearance="flat"
          size="sm"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace-main-breadcrumb__scroll {
  scrollbar-width: none;
}

.workspace-main-breadcrumb__scroll::-webkit-scrollbar {
  display: none;
}

.workspace-main-breadcrumb__item-wrap {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.workspace-main-breadcrumb__save-state {
  flex: 0 0 auto;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 750;
  line-height: 1.2;
}

.workspace-main-breadcrumb__save-state--dirty {
  border-color: #f59e0b;
  color: #b45309;
  background: #fffbeb;
}

.workspace-main-breadcrumb__save-state--blocked {
  border-color: #fbbf24;
  color: #a16207;
  background: #fefce8;
}

.workspace-main-breadcrumb__save-state--saving {
  border-color: #93c5fd;
  color: #1d4ed8;
  background: #eff6ff;
}

.workspace-main-breadcrumb__save-state--saved {
  border-color: #bbf7d0;
  color: #15803d;
  background: #f0fdf4;
}

.workspace-main-breadcrumb {
  padding-right: var(--workspace-main-breadcrumb-padding-x, 12px);
  padding-left: var(--workspace-main-breadcrumb-padding-x, 12px);
  padding-top: var(--workspace-main-breadcrumb-padding-y, 6px);
  padding-bottom: var(--workspace-main-breadcrumb-padding-y, 6px);
  font-size: var(--wl-text-caption);
}
</style>
