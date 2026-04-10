<script setup lang="ts">
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
})

const emit = defineEmits<{
  activateTab: [tabId: string]
  closeTab: [tabId: string]
  openTabContextMenu: [payload: { tabId: string, event: MouseEvent }]
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
  <div>
    <WorkspaceTabStrip
      v-if="props.openTabs.length > 0"
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
    <div v-else class="border-b border-slate-200 bg-white flex shrink-0 h-10 items-center relative">
      <div class="px-3 flex w-full items-center justify-between">
        <span class="text-[11px] text-slate-500 font-medium">WinLoop</span>
        <button
          class="text-[11px] font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50"
          type="button"
          @click="emit('openDashboard')"
        >
          打开仪表盘
        </button>
      </div>
    </div>

    <div class="text-[11px] text-slate-400 px-4 py-2 border-b border-slate-200 bg-white flex gap-2 items-center">
      <template v-for="(item, index) in props.breadcrumbItems" :key="`breadcrumb-${index}-${item}`">
        <span :class="index === props.breadcrumbItems.length - 1 ? 'text-slate-600 font-medium' : ''">
          {{ item }}
        </span>
        <span v-if="index < props.breadcrumbItems.length - 1" class="material-symbols-outlined text-[12px]">chevron_right</span>
      </template>
    </div>
  </div>
</template>
