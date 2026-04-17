<script setup lang="ts">
import type { DesignEditorTool } from '~~/app/composables/useDesignToolController'
import { ref } from 'vue'
import { DESIGN_TOOL_PRESETS } from '~~/app/composables/useDesignToolController'

const props = withDefaults(defineProps<{
  activeTool?: DesignEditorTool
}>(), {
  activeTool: 'select',
})

const emit = defineEmits<{
  'update:activeTool': [tool: DesignEditorTool]
  'insert-image-file': [file: File]
}>()

const hoveredToolIndex = ref<number | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)

function handleToolHover(index: number | null): void {
  hoveredToolIndex.value = index
}

function resolveDockStyle(index: number) {
  const hoveredIndex = hoveredToolIndex.value
  if (hoveredIndex === null) {
    return {
      transform: 'translateY(0) scale(1)',
      zIndex: 1,
    }
  }

  const distance = Math.abs(index - hoveredIndex)
  const scale = distance === 0 ? 1.06 : distance === 1 ? 1.02 : 1
  const translateY = distance === 0 ? -3 : distance === 1 ? -1 : 0

  return {
    transform: `translateY(${translateY}px) scale(${scale})`,
    zIndex: Math.max(1, 20 - distance),
  }
}

function openImagePicker(): void {
  imageInputRef.value?.click()
}

function handleImageInputChange(event: Event): void {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file)
    return
  emit('insert-image-file', file)
  if (input)
    input.value = ''
}
</script>

<template>
  <div
    class="workspace-design-toolbar no-scrollbar flex flex-nowrap items-end justify-center gap-2 overflow-x-auto px-2 py-2"
    data-testid="workspace-design-toolbar"
    @mouseleave="handleToolHover(null)"
  >
    <div
      v-for="(tool, index) in DESIGN_TOOL_PRESETS"
      :key="tool.id"
      class="workspace-design-toolbar__item shrink-0"
      :data-expanded="hoveredToolIndex === index ? 'true' : 'false'"
    >
      <button
        class="workspace-design-toolbar__tool text-[11px] font-semibold"
        :data-active="tool.id === props.activeTool ? 'true' : 'false'"
        :style="resolveDockStyle(index)"
        type="button"
        :title="`${tool.label} (${tool.shortcutLabel})`"
        :aria-label="`${tool.label} 工具，快捷键 ${tool.shortcutLabel}`"
        @mouseenter="handleToolHover(index)"
        @focus="handleToolHover(index)"
        @blur="handleToolHover(null)"
        @click="emit('update:activeTool', tool.id)"
      >
        <span class="material-symbols-outlined workspace-design-toolbar__tool-icon">{{ tool.icon }}</span>
      </button>
      <span class="workspace-design-toolbar__tooltip">
        {{ tool.label }} · {{ tool.shortcutLabel }}
      </span>
    </div>

    <div
      class="workspace-design-toolbar__item shrink-0"
      :data-expanded="hoveredToolIndex === DESIGN_TOOL_PRESETS.length ? 'true' : 'false'"
    >
      <button
        class="workspace-design-toolbar__tool text-[11px] font-semibold"
        type="button"
        title="插入图片"
        aria-label="插入图片"
        data-testid="workspace-design-toolbar-image-action"
        :style="resolveDockStyle(DESIGN_TOOL_PRESETS.length)"
        @mouseenter="handleToolHover(DESIGN_TOOL_PRESETS.length)"
        @focus="handleToolHover(DESIGN_TOOL_PRESETS.length)"
        @blur="handleToolHover(null)"
        @click="openImagePicker"
      >
        <span class="material-symbols-outlined workspace-design-toolbar__tool-icon">imagesmode</span>
      </button>
      <span class="workspace-design-toolbar__tooltip">
        插入图片
      </span>
    </div>

    <input
      ref="imageInputRef"
      class="hidden"
      type="file"
      accept="image/*"
      data-testid="workspace-design-toolbar-image-input"
      @change="handleImageInputChange"
    >
  </div>
</template>

<style scoped>
.workspace-design-toolbar {
  padding-top: 6px;
  padding-bottom: 4px;
  overflow-x: visible !important;
  overflow-y: visible !important;
}

.workspace-design-toolbar__item {
  position: relative;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
}

.workspace-design-toolbar__tool {
  position: relative;
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #64748b;
  transform-origin: center bottom;
  will-change: transform;
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    color 160ms ease,
    opacity 160ms ease;
}

.workspace-design-toolbar__tool-icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

.workspace-design-toolbar__tool[data-active='true'] {
  color: #2563eb;
}

.workspace-design-toolbar__tool[data-active='true']::after {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 12px;
  height: 3px;
  border-radius: 999px;
  background: #2563eb;
  transform: translateX(-50%);
}

.workspace-design-toolbar__tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  white-space: nowrap;
  opacity: 0;
  font-size: 11px;
  line-height: 1.1;
  font-weight: 700;
  color: #f8fafc;
  padding: 5px 8px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
  pointer-events: none;
  transform: translateX(-50%) translateY(4px);
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.workspace-design-toolbar__item[data-expanded='true'] .workspace-design-toolbar__tooltip,
.workspace-design-toolbar__tool:focus-visible + .workspace-design-toolbar__tooltip,
.workspace-design-toolbar__tool:focus-within + .workspace-design-toolbar__tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.workspace-design-toolbar__item[data-expanded='true'] .workspace-design-toolbar__tool,
.workspace-design-toolbar__tool:focus-visible,
.workspace-design-toolbar__tool:focus-within {
  color: #334155;
}

.workspace-design-toolbar__tool[data-active='true']:focus-visible,
.workspace-design-toolbar__tool[data-active='true']:focus-within,
.workspace-design-toolbar__item[data-expanded='true'] .workspace-design-toolbar__tool[data-active='true'] {
  color: #2563eb;
}
</style>
