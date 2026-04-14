<script setup lang="ts">
import type { ComputePositionReturn, VirtualElement } from '@floating-ui/dom'
import type { WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import type { ContextMenuAnchorPoint, ContextMenuItem } from './context-menu'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'

const props = withDefaults(defineProps<{
  visible?: boolean
  items?: ContextMenuItem[]
  anchorPoint?: ContextMenuAnchorPoint | null
  anchorEl?: HTMLElement | null
  fontSizePreset?: WorkspaceFontSizePreset | ''
  spacingPreset?: WorkspaceTabSpacingPreset | ''
  testId?: string
}>(), {
  visible: false,
  items: () => [],
  anchorPoint: null,
  anchorEl: null,
  fontSizePreset: '',
  spacingPreset: '',
  testId: '',
})

const emit = defineEmits<{
  select: [key: string]
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const itemRefs = ref<HTMLButtonElement[]>([])
const floatingStyle = reactive({
  left: '0px',
  top: '0px',
})

let cleanupAutoUpdate: (() => void) | null = null

const menuMetricsStyle = computed<Record<string, string>>(() => {
  const spacingPreset = props.spacingPreset || 'default'
  const fontSizePreset = props.fontSizePreset || 'md'
  const style: Record<string, string> = {}

  if (spacingPreset === 'compact') {
    Object.assign(style, {
      '--wl-context-menu-min-width': '192px',
      '--wl-context-menu-padding': '4px',
      '--wl-context-menu-item-min-height': '36px',
      '--wl-context-menu-item-gap': '10px',
      '--wl-context-menu-item-padding-x': '10px',
      '--wl-context-menu-item-main-gap': '8px',
      '--wl-context-menu-icon-size': '17px',
      '--wl-context-menu-divider-margin-y': '4px',
      '--wl-context-menu-divider-margin-x': '6px',
    })
  }
  else if (spacingPreset === 'relaxed') {
    Object.assign(style, {
      '--wl-context-menu-min-width': '220px',
      '--wl-context-menu-padding': '8px',
      '--wl-context-menu-item-min-height': '42px',
      '--wl-context-menu-item-gap': '14px',
      '--wl-context-menu-item-padding-x': '13px',
      '--wl-context-menu-item-main-gap': '11px',
      '--wl-context-menu-icon-size': '19px',
      '--wl-context-menu-divider-margin-y': '6px',
      '--wl-context-menu-divider-margin-x': '9px',
    })
  }
  else {
    Object.assign(style, {
      '--wl-context-menu-min-width': '206px',
      '--wl-context-menu-padding': '6px',
      '--wl-context-menu-item-min-height': '39px',
      '--wl-context-menu-item-gap': '12px',
      '--wl-context-menu-item-padding-x': '11px',
      '--wl-context-menu-item-main-gap': '9px',
      '--wl-context-menu-icon-size': '18px',
      '--wl-context-menu-divider-margin-y': '5px',
      '--wl-context-menu-divider-margin-x': '8px',
    })
  }

  if (fontSizePreset === 'xs') {
    Object.assign(style, {
      '--wl-context-menu-label-size': '11px',
      '--wl-context-menu-shortcut-size': '10px',
    })
  }
  else if (fontSizePreset === 'sm') {
    Object.assign(style, {
      '--wl-context-menu-label-size': '12px',
      '--wl-context-menu-shortcut-size': '11px',
    })
  }
  else if (fontSizePreset === 'lg') {
    Object.assign(style, {
      '--wl-context-menu-label-size': '14px',
      '--wl-context-menu-shortcut-size': '12px',
    })
  }
  else if (fontSizePreset === 'xl') {
    Object.assign(style, {
      '--wl-context-menu-label-size': '15px',
      '--wl-context-menu-shortcut-size': '13px',
    })
  }
  else {
    Object.assign(style, {
      '--wl-context-menu-label-size': '13px',
      '--wl-context-menu-shortcut-size': '11px',
    })
  }

  return style
})

const menuStyle = computed<Record<string, string>>(() => {
  return {
    left: floatingStyle.left,
    top: floatingStyle.top,
    ...menuMetricsStyle.value,
  }
})

const enabledItemIndexes = computed(() => {
  return props.items
    .map((item, index) => ({ item, index }))
    .filter(entry => !entry.item.disabled)
    .map(entry => entry.index)
})

function resetItemRefs(): void {
  itemRefs.value = []
}

function setItemRef(element: HTMLButtonElement | null, index: number): void {
  if (!element)
    return
  itemRefs.value[index] = element
}

function virtualElementFromPoint(point: ContextMenuAnchorPoint): VirtualElement {
  return {
    getBoundingClientRect() {
      return DOMRect.fromRect({
        x: point.x,
        y: point.y,
        width: 0,
        height: 0,
      })
    },
  }
}

async function updatePosition(): Promise<void> {
  if (!props.visible || !menuRef.value)
    return

  const anchor = props.anchorEl || (props.anchorPoint ? virtualElementFromPoint(props.anchorPoint) : null)
  if (!anchor)
    return

  const result: ComputePositionReturn = await computePosition(anchor, menuRef.value, {
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ['top-start', 'bottom-end', 'top-end'],
        padding: 12,
      }),
      shift({ padding: 12 }),
    ],
  })

  floatingStyle.left = `${Math.round(result.x)}px`
  floatingStyle.top = `${Math.round(result.y)}px`
}

function cleanupPositionTracking(): void {
  if (!cleanupAutoUpdate)
    return
  cleanupAutoUpdate()
  cleanupAutoUpdate = null
}

function focusFirstEnabledItem(): void {
  const nextIndex = enabledItemIndexes.value[0]
  if (typeof nextIndex !== 'number')
    return
  itemRefs.value[nextIndex]?.focus()
}

function moveFocus(direction: 1 | -1): void {
  const indexes = enabledItemIndexes.value
  if (indexes.length === 0)
    return

  const activeElement = document.activeElement as HTMLButtonElement | null
  const currentIndex = itemRefs.value.findIndex(item => item === activeElement)
  const cursor = currentIndex >= 0 ? indexes.indexOf(currentIndex) : -1
  const fallbackCursor = cursor >= 0 ? cursor : 0
  const nextCursor = (fallbackCursor + direction + indexes.length) % indexes.length
  const nextIndex = indexes[nextCursor]
  if (typeof nextIndex === 'number')
    itemRefs.value[nextIndex]?.focus()
}

function focusBoundaryItem(position: 'first' | 'last'): void {
  const indexes = enabledItemIndexes.value
  if (indexes.length === 0)
    return
  const targetIndex = position === 'first' ? indexes[0] : indexes[indexes.length - 1]
  if (typeof targetIndex === 'number')
    itemRefs.value[targetIndex]?.focus()
}

function closeMenu(): void {
  emit('close')
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocus(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(-1)
    return
  }

  if (event.key === 'Home') {
    event.preventDefault()
    focusBoundaryItem('first')
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    focusBoundaryItem('last')
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    closeMenu()
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!props.visible)
    return

  const target = event.target as Node | null
  if (menuRef.value?.contains(target))
    return

  closeMenu()
}

function onDocumentResizeOrScroll(): void {
  void updatePosition()
}

watch(() => props.visible, async (visible) => {
  cleanupPositionTracking()
  resetItemRefs()

  if (!visible)
    return

  await nextTick()
  await updatePosition()
  focusFirstEnabledItem()

  if (props.anchorEl && menuRef.value) {
    cleanupAutoUpdate = autoUpdate(props.anchorEl, menuRef.value, updatePosition)
    return
  }

  window.addEventListener('resize', onDocumentResizeOrScroll)
  window.addEventListener('scroll', onDocumentResizeOrScroll, true)
  cleanupAutoUpdate = () => {
    window.removeEventListener('resize', onDocumentResizeOrScroll)
    window.removeEventListener('scroll', onDocumentResizeOrScroll, true)
  }
})

watch(() => props.anchorPoint, () => {
  if (!props.visible || props.anchorEl)
    return
  void updatePosition()
}, { deep: true })

watch(() => props.anchorEl, () => {
  if (!props.visible)
    return
  void updatePosition()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
})

onBeforeUnmount(() => {
  cleanupPositionTracking()
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      ref="menuRef"
      class="wl-context-menu"
      :data-testid="props.testId || undefined"
      :style="menuStyle"
      role="menu"
      aria-orientation="vertical"
      @keydown="onMenuKeydown"
    >
      <template v-for="(item, index) in props.items" :key="item.key">
        <div
          v-if="item.separatorBefore"
          class="wl-context-menu__divider"
          aria-hidden="true"
        />
        <button
          :ref="element => setItemRef(element as HTMLButtonElement | null, index)"
          class="wl-context-menu__item"
          :class="{
            'wl-context-menu__item--danger': item.tone === 'danger',
          }"
          type="button"
          role="menuitem"
          :disabled="item.disabled"
          @click="emit('select', item.key)"
        >
          <span class="wl-context-menu__item-main">
            <span v-if="item.icon" class="material-symbols-outlined wl-context-menu__icon">{{ item.icon }}</span>
            <span class="wl-context-menu__label">{{ item.label }}</span>
          </span>
          <span v-if="item.shortcutLabel" class="wl-context-menu__shortcut">{{ item.shortcutLabel }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>
