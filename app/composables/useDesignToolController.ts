import type { Ref } from 'vue'
import { computed } from 'vue'

export type DesignEditorTool = 'select' | 'hand' | 'pencil' | 'rectangle' | 'ellipse' | 'arrow' | 'text'
export interface DesignToolPreset {
  id: DesignEditorTool
  label: string
  icon: string
  shortcut: string
  shortcutLabel: string
}

export const DESIGN_TOOL_PRESETS: DesignToolPreset[] = [
  { id: 'select', label: '选择', icon: 'arrow_selector_tool', shortcut: 'v', shortcutLabel: 'V' },
  { id: 'hand', label: '手型', icon: 'pan_tool', shortcut: 'h', shortcutLabel: 'H' },
  { id: 'pencil', label: '铅笔', icon: 'draw', shortcut: 'p', shortcutLabel: 'P' },
  { id: 'rectangle', label: '矩形', icon: 'rectangle', shortcut: 'r', shortcutLabel: 'R' },
  { id: 'ellipse', label: '椭圆', icon: 'circle', shortcut: 'o', shortcutLabel: 'O' },
  { id: 'arrow', label: '箭头', icon: 'arrow_right_alt', shortcut: 'l', shortcutLabel: 'L' },
  { id: 'text', label: '文本', icon: 'title', shortcut: 't', shortcutLabel: 'T' },
]

const designToolPresetMap = new Map(
  DESIGN_TOOL_PRESETS.map(tool => [tool.id, tool]),
)
const designToolShortcutMap = new Map(
  DESIGN_TOOL_PRESETS.map(tool => [tool.shortcut, tool.id]),
)

export function resolveDesignToolPreset(tool: DesignEditorTool | string | null | undefined): DesignToolPreset | null {
  return designToolPresetMap.get(String(tool || '').trim() as DesignEditorTool) || null
}

export function resolveDesignToolByShortcut(key: string | null | undefined): DesignEditorTool | null {
  return designToolShortcutMap.get(String(key || '').trim().toLowerCase()) || null
}

export function useDesignToolController(input: {
  activeTool: Ref<DesignEditorTool>
}) {
  const isDrawingTool = computed(() => {
    return input.activeTool.value === 'pencil'
      || input.activeTool.value === 'rectangle'
      || input.activeTool.value === 'ellipse'
      || input.activeTool.value === 'arrow'
      || input.activeTool.value === 'text'
  })

  function setActiveTool(tool: DesignEditorTool): void {
    input.activeTool.value = tool
  }

  return {
    isDrawingTool,
    setActiveTool,
  }
}
