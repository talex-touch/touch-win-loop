<script setup lang="ts">
import type { WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import type { ContextMenuAnchorPoint } from '~/components/ui/context-menu'
import CollabPresenceAvatarStack from '~/components/workspace/collab/CollabPresenceAvatarStack.vue'

interface WorkspaceMainPanelTabItem {
  id: string
  title: string
  icon: string
  closeable: boolean
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
  <div class="flex w-full min-w-0 flex-col">
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

    <div class="workspace-main-breadcrumb text-slate-400 border-b border-slate-200 bg-white flex w-full min-w-0 items-center justify-between gap-2">
      <div class="workspace-main-breadcrumb__scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overflow-y-hidden">
        <template v-for="(item, index) in props.breadcrumbItems" :key="`breadcrumb-${index}-${item}`">
          <span class="truncate" :class="index === props.breadcrumbItems.length - 1 ? 'text-slate-600 font-medium' : ''">
            {{ item }}
          </span>
          <span v-if="index < props.breadcrumbItems.length - 1" class="material-symbols-outlined text-[12px]">chevron_right</span>
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-2">
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

.workspace-main-breadcrumb {
  padding-right: var(--workspace-main-breadcrumb-padding-x, 12px);
  padding-left: var(--workspace-main-breadcrumb-padding-x, 12px);
  padding-top: var(--workspace-main-breadcrumb-padding-y, 6px);
  padding-bottom: var(--workspace-main-breadcrumb-padding-y, 6px);
  font-size: var(--wl-text-caption);
}
</style>
