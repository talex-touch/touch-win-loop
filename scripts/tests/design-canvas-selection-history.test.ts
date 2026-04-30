import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import {
  createEmptyDesignCanvasSelectionState,
  useDesignCanvasSelection,
} from '../../app/composables/useDesignCanvasSelection'
import { useDesignHistory } from '../../app/composables/useDesignHistory'

const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  'app/components/workspace/WorkspaceDesignPanel.vue',
)
const DESIGN_CANVASKIT_HOST_FILE = resolve(
  process.cwd(),
  'app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue',
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

  it('元素脱离 editing frame 后会保留选择并回退到 page-root 上下文', async () => {
    const frames = ref([makeFrame('frame-1')])
    const elements = ref([makeElement('element-1', 'frame-1')])
    const selection = useDesignCanvasSelection({
      frames: computed(() => frames.value as any[]),
      elements: computed(() => elements.value as any[]),
    })

    selection.enterFrameEditing('frame-1')
    selection.setElementSelection(['element-1'], {
      editingFrameId: 'frame-1',
      displayFrameId: 'frame-1',
      primaryElementId: 'element-1',
    })

    elements.value = [makeElement('element-1')]
    await nextTick()

    expect(selection.state.value).toEqual({
      scope: 'element',
      editingFrameId: '',
      displayFrameId: '',
      frameIds: [],
      primaryFrameId: '',
      elementIds: ['element-1'],
      primaryElementId: 'element-1',
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

describe('workspaceDesignPanel', () => {
  it('默认空设计文档不会再创建 device mockup 封面 frame', async () => {
    const source = await readFile(DESIGN_PANEL_FILE, 'utf8')

    expect(source).toMatch(/function createDefaultDesignSceneDocument\(\s*editorEngine: SceneEditorEngine = "canvaskit_wasm",\s*\): SceneDocument/)
    expect(source).toMatch(/return createEmptySceneDocument\(\{/)
    expect(source).toMatch(/drawMode: "composition"/)
    expect(source).toMatch(/sourceType: "manual"/)
    expect(source).toMatch(/editorEngine,/)
    expect(source).not.toMatch(/return buildDeviceMockupSceneDocument\(\{/)
  })

  it('设计画布固定使用独立 CanvasKit bridge，不再保留 legacy tldraw stage 分支', async () => {
    const source = await readFile(DESIGN_PANEL_FILE, 'utf8')

    expect(source).toMatch(/import WorkspaceDesignCanvasKitBridge from "\.\/design\/WorkspaceDesignCanvasKitBridge\.client\.vue";/)
    expect(source).toMatch(/<WorkspaceDesignCanvasKitBridge/)
    expect(source).not.toMatch(/import WorkspaceDesignStage/)
    expect(source).not.toMatch(/resolvedDesignStageComponent/)
    expect(source).not.toMatch(/persistedDesignEditorEngine\.value === "tldraw_legacy"/)
    expect(source).not.toMatch(/:is="resolvedDesignStageComponent"/)
  })

  it('主壳层会将上下文 HUD、快捷操作、侧栏动作和 Diagram AI 面板拆成独立组件', async () => {
    const source = await readFile(DESIGN_PANEL_FILE, 'utf8')

    expect(source).toMatch(/import WorkspaceDesignCanvasContextHud from '\.\/design\/WorkspaceDesignCanvasContextHud\.vue'/)
    expect(source).toMatch(/import WorkspaceDesignSelectionQuickActions from '\.\/design\/WorkspaceDesignSelectionQuickActions\.vue'/)
    expect(source).toMatch(/import WorkspaceDesignSidebarActionMenus from '\.\/design\/WorkspaceDesignSidebarActionMenus\.vue'/)
    expect(source).toMatch(/import WorkspaceDesignDiagramCanvasAiPanel from '\.\/design\/WorkspaceDesignDiagramCanvasAiPanel\.vue'/)
    expect(source).toMatch(/<WorkspaceDesignCanvasContextHud/)
    expect(source).toMatch(/<WorkspaceDesignSelectionQuickActions/)
    expect(source).toMatch(/<WorkspaceDesignSidebarActionMenus/)
    expect(source).toMatch(/<WorkspaceDesignDiagramCanvasAiPanel/)
    expect(source).not.toMatch(/actionMenuOpen/)
    expect(source).not.toMatch(/handleActionMenuPointerDown/)
  })

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
    expect(source).toMatch(/if \(designToolController\.isDrawingTool\.value\) setActiveDesignTool\("select"\);/)
  })

  it('新 host 会补文本编辑、框选与旋转会话，并复用现有更新链路', async () => {
    const source = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')

    expect(source).toMatch(/type TextEditSession = \{/)
    expect(source).toMatch(/type CreateSessionFrameContext = \{/)
    expect(source).toMatch(/type SelectionDraft = \{/)
    expect(source).toMatch(/type ElementRotationSession = \{/)
    expect(source).toMatch(/function openTextEditSession\(/)
    expect(source).toMatch(/function closeTextEditSession\(/)
    expect(source).toMatch(/historyMergeKey: 'element-text-edit'/)
    expect(source).toMatch(/function resolveSelectionDraftMatches\(/)
    expect(source).toMatch(/const nextIds = draft\.additive[\s\S]*new Set\(/)
    expect(source).toMatch(/function handleElementRotatePointerDown\(/)
    expect(source).toMatch(/element-rotate:/)
  })

  it('新 host 会补 mockup screen 拖拽与文本双击编辑入口', async () => {
    const source = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')

    expect(source).toMatch(/type MockupScreenDragSession = \{/)
    expect(source).toMatch(/resolveDesignFrameProjectionLayoutForFrames/)
    expect(source).toMatch(/function resolveMockupScreenTransform\(/)
    expect(source).toMatch(/historyMergeKey: 'mockup-screen-transform'/)
    expect(source).toMatch(/function handleElementDoubleClick\(/)
    expect(source).toMatch(/item\.element\.type !== 'text' && item\.element\.type !== 'caption' && item\.element\.type !== 'badge'/)
  })

  it('新 host 会在连续手势中只维护 transient preview，并在 pointerup 时统一提交', async () => {
    const source = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')
    const pointerMoveStart = source.indexOf('function handlePointerMove(event: PointerEvent): void {')
    const pointerUpStart = source.indexOf('function handlePointerUp(event: PointerEvent): void {')
    const pointerLeaveStart = source.indexOf('function handlePointerLeave(')

    expect(pointerMoveStart).toBeGreaterThanOrEqual(0)
    expect(pointerUpStart).toBeGreaterThan(pointerMoveStart)
    expect(pointerLeaveStart).toBeGreaterThan(pointerUpStart)

    const pointerMoveSection = source.slice(pointerMoveStart, pointerUpStart)
    const pointerUpSection = source.slice(pointerUpStart, pointerLeaveStart)

    expect(source).toMatch(/const transientElementPatches = ref<Record<string, Partial<DesignElementModel>>>\(\{\}\)/)
    expect(source).toMatch(/const transientFramePatches = ref<Record<string, Partial<DesignFrameModel>>>\(\{\}\)/)
    expect(source).toMatch(/function scheduleTransientElementPatches\(/)
    expect(source).toMatch(/function scheduleTransientFramePatches\(/)
    expect(source).toMatch(/function clearTransientElementPatches\(\): void/)
    expect(source).toMatch(/function clearTransientFramePatches\(\): void/)

    expect(pointerMoveSection).toMatch(/mockupDragSession\.previewOffsetX =/)
    expect(pointerMoveSection).toMatch(/scheduleTransientFramePatches\(\{/)
    expect(pointerMoveSection).toMatch(/rotationSession\.previewRotation =/)
    expect(pointerMoveSection).toMatch(/resizeSession\.previewPatch = applyElementResizeDelta/)
    expect(pointerMoveSection).toMatch(/dragSession\.previewPatches = Object\.fromEntries/)
    expect(pointerMoveSection).toMatch(/scheduleTransientElementPatches\(/)
    expect(pointerMoveSection).not.toMatch(/emit\('update-element'/)
    expect(pointerMoveSection).not.toMatch(/emit\('update-mockup-screen-transform'/)

    expect(pointerUpSection).toMatch(/flushTransientFramePatches\(\)/)
    expect(pointerUpSection).toMatch(/stopMockupScreenDragSession\(event\.pointerId, \{\s*preservePreview: true,/)
    expect(pointerUpSection).toMatch(/emit\('update-mockup-screen-transform', \{/)
    expect(pointerUpSection).toMatch(/flushTransientElementPatches\(\)/)
    expect(pointerUpSection).toMatch(/stopElementRotation\(event\.pointerId, \{\s*preservePreview: true,/)
    expect(pointerUpSection).toMatch(/stopElementResize\(event\.pointerId, \{\s*preservePreview: true,/)
    expect(pointerUpSection).toMatch(/stopElementDrag\(event\.pointerId, \{\s*preservePreview: true,/)
    expect(pointerUpSection).toMatch(/clearTransientElementPatches\(\)/)
    expect(pointerUpSection).toMatch(/emit\('update-element', \{/)
    expect(pointerUpSection).toMatch(/emit\('update-elements', \{/)
  })

  it('绘制工具首击 frame 会直接进入 editing frame 并启动创建会话', async () => {
    const source = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')

    expect(source).toMatch(/function resolveCreateSessionFrameContextForFrame\(/)
    expect(source).toMatch(/function emitFrameEditingSelection\(context: CreateSessionFrameContext\): void/)
    expect(source).toMatch(/function beginCreateElementSession\(/)
    expect(source).toMatch(/function handleFramePointerDown\(frame: DesignFrameModel, event: PointerEvent\): void/)
    expect(source).toMatch(/emitFrameEditingSelection\(frameContext\)/)
    expect(source).toMatch(/scope: 'none',\s*editingFrameId: context\.ownerFrameId,\s*displayFrameId: context\.displayFrameId/)
    expect(source).toMatch(/@pointerdown\.stop="handleFramePointerDown\(frame, \$event\)"/)
    expect(source).toMatch(/const cursor = activeCreateElementTool\.value \|\| pendingImagePlacementState\.value\s*\?\s*'crosshair'/)
  })

  it('新 host 会补 frame 拖拽、resize、吸附反馈与 grid guides 路径', async () => {
    const source = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')

    expect(source).toMatch(/type FrameDragSession = \{/)
    expect(source).toMatch(/type FrameResizeSession = \{/)
    expect(source).toMatch(/type FrameDragFeedback = \{/)
    expect(source).toMatch(/resolveDesignFrameGridMetadata/)
    expect(source).toMatch(/const visibleFrameGrids = computed\(\(\) => \{/)
    expect(source).toMatch(/function resolveFrameDragAssist\(/)
    expect(source).toMatch(/function setFrameDragFeedback\(/)
    expect(source).toMatch(/function clearFrameDragFeedback\(\): void/)
    expect(source).toMatch(/function handleFrameResizePointerDown\(/)
    expect(source).toMatch(/historyMergeKey: 'frame-resize'/)
    expect(source).toMatch(/emit\('update-frame-position', \{/)
    expect(source).toMatch(/emit\('update-frame-positions', \{/)
    expect(source).toMatch(/emit\('update-frame-size', \{/)
    expect(source).toMatch(/filter\(\(item\): item is DesignFrameModel => Boolean\(item\) && !item\.locked\)/)
    expect(source).toMatch(/if \(frame\.locked\)\s*return/)
    expect(source).toMatch(/data-testid="workspace-design-canvaskit-frame-resize"/)
    expect(source).toMatch(/data-testid="workspace-design-canvaskit-frame-feedback"/)
    expect(source).toMatch(/data-testid="workspace-design-canvaskit-frame-guides"/)
    expect(source).toMatch(/X \{\{ frameDragFeedback\.x \}\} \/ Y \{\{ frameDragFeedback\.y \}\}/)
  })

  it('新 host 与面板会补图片放置、分组、多元素吸附和 auto layout 重排路径', async () => {
    const hostSource = await readFile(DESIGN_CANVASKIT_HOST_FILE, 'utf8')
    const panelSource = await readFile(DESIGN_PANEL_FILE, 'utf8')

    expect(hostSource).toMatch(/type PendingImagePlacement = \{/)
    expect(hostSource).toMatch(/type GroupEditSession = \{/)
    expect(hostSource).toMatch(/type ElementGuideOverlay = \{/)
    expect(hostSource).toMatch(/type AutoLayoutReorderSession = \{/)
    expect(hostSource).toMatch(/const pendingImagePlacementState = computed/)
    expect(hostSource).toMatch(/function beginGroupEditSession\(/)
    expect(hostSource).toMatch(/function resolveElementGuideAdjustment\(/)
    expect(hostSource).toMatch(/ELEMENT_SNAP_GRID_SIZE = 8/)
    expect(hostSource).toMatch(/ELEMENT_SNAP_THRESHOLD = 8/)
    expect(hostSource).toMatch(/historyMergeKey: 'element-reorder'/)
    expect(hostSource).toMatch(/data-testid="workspace-design-canvaskit-element-guide-overlay"/)
    expect(hostSource).toMatch(/data-testid="workspace-design-canvaskit-autolayout-indicator"/)
    expect(hostSource).toMatch(/emit\('clear-pending-image-placement'\)/)

    expect(panelSource).toMatch(/const pendingImagePlacement = ref<PendingImagePlacement \| null>\(null\)/)
    expect(panelSource).toMatch(/function queuePendingImagePlacement\(/)
    expect(panelSource).toMatch(/function placeAssetOnCanvas\(/)
    expect(panelSource).toMatch(/function handleToolbarInsertImage\(/)
    expect(panelSource).toMatch(/groupDesignElementsInSceneDocument/)
    expect(panelSource).toMatch(/ungroupDesignElementInSceneDocument/)
    expect(panelSource).toMatch(/"bring-forward"/)
    expect(panelSource).toMatch(/"send-backward"/)
    expect(panelSource).toMatch(/"bring-to-front"/)
    expect(panelSource).toMatch(/"send-to-back"/)
  })
})
