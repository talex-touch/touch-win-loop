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
            name="workspace-main-tab-list"
          >
            <div
              v-for="tab in props.openTabs"
              :key="tab.id"
              class="workspace-main-tab border-r border-slate-200 flex h-full shrink-0 items-center"
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
                class="workspace-main-tab__trigger flex flex-1 h-full min-w-0 items-center"
                type="button"
                @click.stop="emit('activateTab', tab.id)"
              >
                <span class="workspace-main-tab__icon material-symbols-outlined" :class="tab.id === props.activeTabId ? 'text-blue-500' : 'text-slate-400'">{{ tab.icon }}</span>
                <span class="workspace-main-tab__label truncate" :class="tab.id === props.activeTabId ? 'text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'">
                  {{ tab.title }}
                </span>
              </button>

              <button
                v-if="tab.closeable"
                class="workspace-main-tab__close text-slate-400 rounded flex h-6 w-6 items-center justify-center hover:text-slate-600 hover:bg-slate-100"
                type="button"
                @click.stop="emit('closeTab', tab.id)"
              >
                <span class="workspace-main-tab__close-icon material-symbols-outlined">close</span>
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
  min-width: var(--workspace-main-tab-min-width, 156px);
  height: 100%;
  padding-right: var(--workspace-main-tab-padding-x, 7px);
  padding-left: var(--workspace-main-tab-padding-x, 7px);
  gap: var(--workspace-main-tab-gap, 4px);
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.workspace-main-tab::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: 0;
  left: 10px;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: var(--wl-primary-500);
  opacity: 0;
  transform: scaleX(0.55);
  transform-origin: center;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-main-tab--active::after {
  opacity: 1;
  transform: scaleX(1);
}

.workspace-main-tab__trigger {
  gap: var(--workspace-main-tab-trigger-gap, 7px);
  font-size: var(--workspace-main-tab-label-size, 12px);
  line-height: 1;
  transition: color 0.18s ease;
}

.workspace-main-tab__icon {
  font-size: var(--workspace-main-tab-icon-size, 17px);
  transition: color 0.18s ease;
}

.workspace-main-tab__label {
  transition: color 0.18s ease;
}

.workspace-main-tab__close {
  padding: var(--workspace-main-tab-close-padding, 3px);
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.workspace-main-tab__close-icon {
  font-size: var(--workspace-main-tab-close-icon-size, 14px);
}

.workspace-main-tab-list-enter-active,
.workspace-main-tab-list-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-main-tab-list-move {
  transition: transform 0.22s ease;
}

.workspace-main-tab-list-enter-from,
.workspace-main-tab-list-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
