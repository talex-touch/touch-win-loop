<script setup lang="ts">
interface WorkspaceTabItem {
  id: string
  title: string
  icon: string
  closeable: boolean
}

const props = withDefaults(defineProps<{
  openTabs?: WorkspaceTabItem[]
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
}>()
</script>

<template>
  <div class="workspace-main-tab-strip border-b border-slate-200 bg-white flex shrink-0 w-full min-w-0 items-center relative">
    <template v-if="props.openTabs.length > 0">
      <div class="flex flex-1 h-full min-w-0 overflow-hidden">
        <div class="workspace-main-tab-scroll flex flex-1 h-full min-w-0 overflow-x-auto overflow-y-hidden">
          <TransitionGroup
            tag="div"
            class="workspace-main-tab-list"
            name="workspace-main-tab-transition"
          >
            <div
              v-for="tab in props.openTabs"
              :key="tab.id"
              class="workspace-main-tab border-r border-slate-200 flex gap-1 items-center"
              :class="[
                tab.id === props.activeTabId ? 'workspace-main-tab--active bg-slate-50' : 'bg-white',
                props.dragOverTabId === tab.id ? 'ring-1 ring-inset ring-blue-300' : '',
              ]"
              draggable="true"
              @click="emit('activateTab', tab.id)"
              @contextmenu="emit('openTabContextMenu', { tabId: tab.id, event: $event })"
              @dragstart="emit('dragStart', tab.id)"
              @dragover="emit('dragOver', { tabId: tab.id, event: $event })"
              @drop="emit('drop', { tabId: tab.id, event: $event })"
              @dragend="emit('dragEnd')"
            >
              <button
                class="flex flex-1 gap-2 h-full min-w-0 items-center"
                type="button"
                @click.stop="emit('activateTab', tab.id)"
              >
                <span class="material-symbols-outlined text-sm" :class="tab.id === props.activeTabId ? 'text-blue-500' : 'text-slate-400'">{{ tab.icon }}</span>
                <span class="text-xs truncate" :class="tab.id === props.activeTabId ? 'text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'">
                  {{ tab.title }}
                </span>
              </button>

              <button
                v-if="tab.closeable"
                class="text-slate-400 rounded flex h-6 w-6 transition items-center justify-center hover:text-slate-600 hover:bg-slate-100"
                type="button"
                @click.stop="emit('closeTab', tab.id)"
              >
                <span class="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </TransitionGroup>
        </div>

        <div class="bg-white flex-1 h-full min-w-0" aria-hidden="true" />
      </div>
    </template>

    <WorkspaceTabContextMenu
      :visible="props.tabContextMenuVisible"
      :position="props.tabContextMenuPosition"
      :can-close-self="props.canCloseContextTab"
      :can-close-left="props.canCloseTabsToLeft"
      :can-close-right="props.canCloseTabsToRight"
      :can-close-others="props.canCloseOtherTabs"
      :can-close-all="props.canCloseAllTabs"
      @close-self="props.contextTabId && emit('closeTab', props.contextTabId)"
      @close-left="emit('closeTabsToLeft')"
      @close-right="emit('closeTabsToRight')"
      @close-others="emit('closeOtherTabs')"
      @close-all="emit('closeAllTabs')"
    />
  </div>
</template>

<style scoped>
.workspace-main-tab-strip {
  --workspace-main-tab-strip-height: 40px;
  height: var(--workspace-main-tab-strip-height);
}

.workspace-main-tab-scroll {
  scrollbar-width: none;
}

.workspace-main-tab-scroll::-webkit-scrollbar {
  display: none;
}

.workspace-main-tab-list {
  display: flex;
  min-width: max-content;
  height: 100%;
}

.workspace-main-tab {
  position: relative;
  min-width: var(--workspace-main-tab-min-width, 170px);
  height: 100%;
  padding: 0 var(--workspace-main-tab-horizontal-padding, 8px);
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-main-tab--active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 2px;
  border-radius: 999px;
  background: #2563eb;
}
</style>
