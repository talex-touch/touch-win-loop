<script setup lang="ts">
type SelectOptionValue = string | number

interface SelectOption {
  label: string
  value: SelectOptionValue
  disabled?: boolean
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  modelValue?: SelectOptionValue
  options: readonly SelectOption[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  size?: 'md' | 'sm' | 'xs'
  placement?: 'bottom' | 'top'
}>(), {
  modelValue: '',
  placeholder: '请选择',
  disabled: false,
  ariaLabel: '',
  size: 'md',
  placement: 'bottom',
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectOptionValue]
  'change': [value: SelectOptionValue]
}>()

const selectRoot = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const open = ref(false)
const activeIndex = ref(-1)
const popoverStyle = ref<Record<string, string>>({})

const enabledOptions = computed(() => props.options.filter(option => !option.disabled))
const selectedOption = computed(() => {
  return props.options.find(option => option.value === props.modelValue) || null
})

const displayLabel = computed(() => selectedOption.value?.label || props.placeholder)

function findOptionIndex(value: SelectOptionValue | undefined) {
  return props.options.findIndex(option => option.value === value && !option.disabled)
}

function openMenu() {
  if (props.disabled)
    return
  open.value = true
  const selectedIndex = findOptionIndex(props.modelValue)
  activeIndex.value = selectedIndex >= 0
    ? selectedIndex
    : Math.max(0, props.options.findIndex(option => !option.disabled))
  void nextTick(updatePopoverPosition)
}

function closeMenu() {
  open.value = false
}

function toggleMenu() {
  if (open.value)
    closeMenu()
  else
    openMenu()
}

function chooseOption(option: SelectOption) {
  if (option.disabled)
    return
  emit('update:modelValue', option.value)
  emit('change', option.value)
  closeMenu()
}

function moveActive(delta: number) {
  if (!open.value)
    openMenu()
  if (enabledOptions.value.length === 0)
    return

  const enabledIndexes = props.options
    .map((option, index) => ({ option, index }))
    .filter(item => !item.option.disabled)
    .map(item => item.index)
  const currentPosition = enabledIndexes.indexOf(activeIndex.value)
  const nextPosition = currentPosition >= 0
    ? (currentPosition + delta + enabledIndexes.length) % enabledIndexes.length
    : 0
  activeIndex.value = enabledIndexes[nextPosition] ?? -1
}

function handleButtonKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
  }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) {
      openMenu()
      return
    }
    const option = props.options[activeIndex.value]
    if (option)
      chooseOption(option)
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  }
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node))
    return
  if (!selectRoot.value?.contains(target) && !popoverRef.value?.contains(target))
    closeMenu()
}

function updatePopoverPosition() {
  const trigger = triggerRef.value
  if (!trigger || !open.value)
    return

  const rect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth
  const minWidth = Math.max(rect.width, 220)
  const maxWidth = Math.min(360, Math.max(0, viewportWidth - 32))
  const width = Math.min(minWidth, maxWidth)
  const left = Math.min(Math.max(16, rect.left), Math.max(16, viewportWidth - width - 16))
  const popoverHeight = popoverRef.value?.getBoundingClientRect().height || 0
  const top = props.placement === 'top'
    ? Math.max(16, rect.top - popoverHeight - 8)
    : rect.bottom + 8

  popoverStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
  }
}

function handleViewportChange() {
  if (open.value)
    updatePopoverPosition()
}

watch(() => props.modelValue, (value) => {
  if (!open.value)
    return
  const selectedIndex = findOptionIndex(value)
  if (selectedIndex >= 0)
    activeIndex.value = selectedIndex
})

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('resize', handleViewportChange)
  window.removeEventListener('scroll', handleViewportChange, true)
})
</script>

<template>
  <div
    ref="selectRoot"
    class="ui-select"
    v-bind="$attrs"
    :class="[
      `ui-select--${size}`,
      { 'ui-select--open': open, 'ui-select--disabled': disabled },
    ]"
  >
    <button
      ref="triggerRef"
      class="ui-select__trigger"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel || placeholder"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleMenu"
      @keydown="handleButtonKeydown"
    >
      <span class="ui-select__value">{{ displayLabel }}</span>
      <span class="ui-select__chevron i-heroicons-outline-chevron-down" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition name="ui-select-popover">
        <div
          v-if="open"
          ref="popoverRef"
          class="ui-select__popover"
          :class="`ui-select__popover--${placement}`"
          :style="popoverStyle"
        >
          <div class="ui-select__list" role="listbox" :aria-label="ariaLabel || placeholder">
            <button
              v-for="(option, index) in options"
              :key="`${option.value}-${option.label}`"
              class="ui-select__option"
              type="button"
              role="option"
              :class="{
                'is-selected': option.value === modelValue,
                'is-active': index === activeIndex,
              }"
              :disabled="option.disabled"
              :aria-selected="option.value === modelValue"
              @click="chooseOption(option)"
              @mouseenter="activeIndex = index"
            >
              <span class="ui-select__check i-heroicons-solid-check" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  display: block;
  min-width: 0;
}

.ui-select__trigger {
  display: grid;
  width: 100%;
  height: 40px;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 2px solid #edf1f8;
  border-radius: 9px;
  padding: 0 14px 0 16px;
  color: #263653;
  background: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  outline: none;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.ui-select--sm .ui-select__trigger {
  height: 34px;
  border-radius: 8px;
  padding-right: 12px;
  padding-left: 12px;
  font-size: 12px;
}

.ui-select--xs .ui-select__trigger {
  height: 30px;
  border-width: 1px;
  border-radius: 7px;
  padding-right: 10px;
  padding-left: 10px;
  font-size: 12px;
}

.ui-select__trigger:hover:not(:disabled) {
  border-color: #dce6f6;
  background: #fbfdff;
}

.ui-select__trigger:focus-visible,
.ui-select--open .ui-select__trigger {
  border-color: #9cb8fb;
  box-shadow: 0 0 0 4px rgba(74, 119, 232, 0.12);
}

.ui-select__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.ui-select__value {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-select__chevron {
  width: 16px;
  height: 16px;
  color: #9ba9bf;
  transition: transform 0.18s ease;
}

.ui-select--open .ui-select__chevron {
  transform: rotate(180deg);
}

.ui-select__popover {
  position: fixed;
  z-index: 3000;
  overflow: hidden;
  border: 1px solid #dbe5f5;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 44px rgba(28, 50, 90, 0.18);
  transform-origin: top center;
}

.ui-select__popover--top {
  transform-origin: bottom center;
}

.ui-select__list {
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
}

.ui-select__option {
  display: grid;
  width: 100%;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: 0;
  border-radius: 8px;
  padding: 7px 9px;
  text-align: left;
  color: #33445f;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.ui-select--sm .ui-select__option,
.ui-select--xs .ui-select__option {
  min-height: 30px;
  font-size: 12px;
}

.ui-select__option span:last-child {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-select__option:hover:not(:disabled),
.ui-select__option.is-active {
  color: #1d4ed8;
  background: #eef4ff;
}

.ui-select__option.is-selected {
  color: #235edb;
  background: #eaf2ff;
}

.ui-select__option:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.ui-select__check {
  width: 15px;
  height: 15px;
  color: currentColor;
  opacity: 0;
}

.ui-select__option.is-selected .ui-select__check {
  opacity: 1;
}

.ui-select-popover-enter-active,
.ui-select-popover-leave-active {
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.ui-select-popover-enter-from,
.ui-select-popover-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.ui-select__popover--top.ui-select-popover-enter-from,
.ui-select__popover--top.ui-select-popover-leave-to {
  transform: translateY(4px) scale(0.98);
}
</style>
