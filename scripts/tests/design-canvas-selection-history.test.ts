import { computed, nextTick, ref } from 'vue'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createEmptyDesignCanvasSelectionState,
  useDesignCanvasSelection,
} from '../../app/composables/useDesignCanvasSelection'
import { useDesignHistory } from '../../app/composables/useDesignHistory'

const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDesignPanel.vue',
)

function makeFrame(id: string) {
  return {
    id,
    pageId: 'page-1',
    kind: 'freeform',
    name: id,
    x: 0,
    y: 0,
    width: 320,
    height: 220,
  } as const
}

function makeElement(id: string, frameId = '') {
  return {
    id,
    type: 'shape',
    pageId: 'page-1',
    frameId: frameId || undefined,
    x: 24,
    y: 24,
    width: 120,
    height: 80,
  } as const
}

describe('useDesignCanvasSelection', () => {
  it('不会在数据回流后自动补选其他对象', async () => {
    const frames = ref([makeFrame('frame-1'), makeFrame('frame-2')])
    const elements = ref([makeElement('element-1', 'frame-1')])
    const selection = useDesignCanvasSelection({
      frames: computed(() => frames.value as any[]),
      elements: computed(() => elements.value as any[]),
    })

    expect(selection.state.value).toEqual(createEmptyDesignCanvasSelectionState())

    selection.setFrameSelection(['frame-1'], {
      primaryFrameId: 'frame-1',
    })
    expect(selection.state.value.scope).toBe('frame')
    expect(selection.state.value.frameIds).toEqual(['frame-1'])

    frames.value = [makeFrame('frame-2')]
    elements.value = []
    await nextTick()

    expect(selection.state.value).toEqual(createEmptyDesignCanvasSelectionState())
  })

  it('内部编辑态会约束元素选择并允许保留 editingFrameId 清空', () => {
    const frames = ref([makeFrame('frame-1'), makeFrame('frame-2')])
    const elements = ref([
      makeElement('element-1', 'frame-1'),
      makeElement('element-2', 'frame-2'),
    ])
    const selection = useDesignCanvasSelection({
      frames: computed(() => frames.value as any[]),
      elements: computed(() => elements.value as any[]),
    })

    selection.enterFrameEditing('frame-1')
    expect(selection.state.value).toEqual({
      scope: 'none',
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-1',
      frameIds: [],
      primaryFrameId: '',
      elementIds: [],
      primaryElementId: '',
    })

    selection.setElementSelection(['element-1', 'element-2'], {
      editingFrameId: 'frame-1',
      primaryElementId: 'element-2',
    })
    expect(selection.state.value).toEqual({
      scope: 'element',
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-1',
      frameIds: [],
      primaryFrameId: '',
      elementIds: ['element-1'],
      primaryElementId: 'element-1',
    })

    selection.setElementSelection(['element-1'], {
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-2',
      primaryElementId: 'element-1',
    })
    expect(selection.state.value).toEqual({
      scope: 'element',
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-2',
      frameIds: [],
      primaryFrameId: '',
      elementIds: ['element-1'],
      primaryElementId: 'element-1',
    })

    selection.clearSelection({ preserveEditingFrameId: true })
    expect(selection.state.value).toEqual({
      scope: 'none',
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-2',
      frameIds: [],
      primaryFrameId: '',
      elementIds: [],
      primaryElementId: '',
    })

    selection.exitFrameEditing()
    expect(selection.state.value).toEqual({
      scope: 'frame',
      editingFrameId: '',
      displayFrameId: '',
      frameIds: ['frame-1'],
      primaryFrameId: 'frame-1',
      elementIds: [],
      primaryElementId: '',
    })
  })
})

describe('useDesignHistory', () => {
  it('按一次手势合并历史并支持撤销重做', () => {
    const history = useDesignHistory('scene-a')

    history.record('scene-b', {
      mergeKey: 'frame-drag',
      timestamp: 100,
    })
    history.record('scene-c', {
      mergeKey: 'frame-drag',
      timestamp: 320,
    })
    history.record('scene-d', {
      mergeKey: 'frame-drag',
      timestamp: 900,
    })

    expect(history.past.value).toEqual(['scene-a', 'scene-c'])
    expect(history.present.value).toBe('scene-d')

    expect(history.undo()).toBe('scene-c')
    expect(history.undo()).toBe('scene-a')
    expect(history.redo()).toBe('scene-c')

    history.record('scene-e')
    expect(history.present.value).toBe('scene-e')
    expect(history.future.value).toEqual([])
  })
})

describe('WorkspaceDesignPanel', () => {
  it('新建元素后会立即选中新元素并保留当前 editingFrameId', async () => {
    const source = await readFile(DESIGN_PANEL_FILE, 'utf8')

    expect(source).toMatch(/function createDesignElementFromStage\(\s*payload: Partial<DesignElementModel>,\s*\): void/)
    expect(source).toMatch(/const previousElementIds = new Set\(/)
    expect(source).toMatch(/const nextDocument = appendDesignElementToSceneDocument\(/)
    expect(source).toMatch(/const createdElement =/)
    expect(source).toMatch(/commitDocument\(nextDocument\);/)
    expect(source).toMatch(/const editingFrameId =\s*selectionState\.value\.editingFrameId \|\| normalizeString\(createdElement\.frameId\)/)
    expect(source).toMatch(/setSelectedElements\(\[createdElement\.id\], \{/)
    expect(source).toMatch(/primaryElementId:\s*createdElement\.id/)
    expect(source).toMatch(/editingFrameId,\s*displayFrameId:\s*resolveDisplayFrameIdForOwnerSelection\(editingFrameId\)/)
  })
})
