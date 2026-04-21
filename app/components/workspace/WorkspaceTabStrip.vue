<script setup lang="ts">
import type { ContextMenuAnchorPoint } from '~/types/ui-context-menu'

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
}>()

function requestTabContextMenuFromPointer(tabId: string, event: MouseEvent): void {
  event.preventDefault()
  emit('openTabContextMenu', {
    tabId,
    anchorPoint: {
      x: event.clientX,
      y: event.clientY,
    },
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}

function isKeyboardContextMenuEvent(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

function requestTabContextMenuFromKeyboard(tabId: string, event: KeyboardEvent): void {
  if (!isKeyboardContextMenuEvent(event))
    return

  event.preventDefault()
  emit('openTabContextMenu', {
    tabId,
    anchorEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    restoreFocusEl: event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
  })
}
</script>

<template>
  <div class="workspace-main-tab-strip border-b border-slate-200 bg-white flex shrink-0 min-w-0 w-full items-center relative">
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
              class="workspace-main-tab border-r border-slate-200 flex shrink-0 h-full items-center"
              :data-context-tab-id="tab.id"
              :class="[
                tab.id === props.activeTabId ? 'workspace-main-tab--active bg-slate-50' : 'bg-white',
                props.dragOverTabId === tab.id ? 'ring-1 ring-inset ring-blue-300' : '',
              ]"
              draggable="true"
              @click="emit('activateTab', tab.id)"
              @contextmenu="requestTabContextMenuFromPointer(tab.id, $event)"
              @dragstart="emit('dragStart', tab.id)"
              @dragover="emit('dragOver', { tabId: tab.id, event: $event })"
              @drop="emit('drop', { tabId: tab.id, event: $event })"
              @dragend="emit('dragEnd')"
            >
              <button
                class="workspace-main-tab__trigger flex flex-1 h-full min-w-0 items-center"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="props.tabContextMenuVisible && props.contextTabId === tab.id ? 'true' : 'false'"
                data-context-menu-scope="tab"
                @click.stop="emit('activateTab', tab.id)"
                @keydown="requestTabContextMenuFromKeyboard(tab.id, $event)"
              >
                <span class="workspace-main-tab__icon material-symbols-outlined" :class="tab.id === props.activeTabId ? 'text-blue-500' : 'text-slate-400'">{{ tab.icon }}</span>
                <span class="workspace-main-tab__label truncate" :class="tab.id === props.activeTabId ? 'text-slate-800 font-medium' : 'text-slate-500 hover:text-slate-700'">
                  {{ tab.title }}
                </span>
              </button>

              <button
                v-if="tab.closeable"
                class="workspace-main-tab__close text-slate-400 rounded flex items-center justify-center hover:text-slate-600 hover:bg-slate-100"
                type="button"
                @click.stop="emit('closeTab', tab.id)"
              >
                <span class="workspace-main-tab__close-icon material-symbols-outlined">close</span>
              </button>
            </div>
          </TransitionGroup>
        </div>
      </div>
    </template>
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
  right: var(--workspace-main-tab-active-indicator-inset, 10px);
  bottom: 0;
  left: var(--workspace-main-tab-active-indicator-inset, 10px);
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
  width: var(--workspace-main-tab-close-button-size, 24px);
  height: var(--workspace-main-tab-close-button-size, 24px);
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
