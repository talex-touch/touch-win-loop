<script setup lang="ts">
import type {
  CompositionModel,
  DesignAssetModel,
  DesignElementModel,
  DesignFrameKind,
  DesignFrameModel,
  GraphSourceEdge,
  GraphSourceModel,
  GraphSourceNode,
  SceneDocument,
} from '~~/shared/types/domain'
import { computed, ref, watch } from 'vue'
import {
  appendDesignFrameToSceneDocument,
  appendDesignPageToSceneDocument,
  buildDeviceMockupSceneDocument,
  DEVICE_FRAME_PRESETS,
  exportArchitectureModelToMermaid,
  exportSchemaModelToDDL,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  parseSceneDocumentString,
  relayoutSceneDocument,
  removeDesignFrameFromSceneDocument,
  removeDesignPageFromSceneDocument,
  renderCompositionAssetToSvg,
  sceneDocumentFromUnknown,
  serializeSceneDocument,
  setCurrentDesignPageInSceneDocument,
  SYSTEM_SCENE_TEMPLATES,
  updateDesignFrameInSceneDocument,
  updateDesignPageInSceneDocument,
} from '~~/shared/utils/scene-document'

const props = withDefaults(defineProps<{
  modelValue?: string
  hasDesignResource?: boolean
  designResourceId?: string
  boundResourceId?: string
  designPanelTitle?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabDrawError?: string
}>(), {
  modelValue: '',
  hasDesignResource: false,
  designResourceId: '',
  boundResourceId: '',
  designPanelTitle: '设计稿',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabDrawError: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const templateOptions = SYSTEM_SCENE_TEMPLATES.filter(template => template.category === 'composition')
const DEFAULT_TEMPLATE_KEY = templateOptions[0]?.templateKey || 'device-showcase'
const DEFAULT_DEVICE_FRAME_KEY = DEVICE_FRAME_PRESETS[0]?.key || 'iphone-16-pro'

const draftDocument = ref<SceneDocument>(buildDeviceMockupSceneDocument({
  title: '统一设计文档',
  subtitle: '一个文档多 Page，一个 Page 多 Frame，图表与设计稿统一协作。',
  badge: 'Design',
  templateKey: DEFAULT_TEMPLATE_KEY,
  deviceFramePresetKey: DEFAULT_DEVICE_FRAME_KEY,
}))
const selectedFrameId = ref('')
const syncingFromModel = ref(false)
const lastAppliedSceneJson = ref('')
const diagramEditorFrameId = ref('')
const diagramSourceFormat = ref<'mermaid' | 'markdown_outline' | 'ddl' | 'architecture'>('mermaid')
const diagramSourceText = ref('')
const diagramSelectedNodeId = ref('')
const diagramSelectedEdgeId = ref('')

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function cloneDesignElement(element: DesignElementModel): DesignElementModel {
  return {
    ...element,
    style: element.style ? { ...element.style } : undefined,
    metadata: element.metadata ? { ...element.metadata } : undefined,
  }
}

function cloneCompositionModel(composition: CompositionModel): CompositionModel {
  return {
    ...composition,
    pages: (composition.pages || []).map(page => ({
      ...page,
      frameIds: [...(page.frameIds || [])],
      viewport: {
        x: page.viewport?.x || 0,
        y: page.viewport?.y || 0,
        zoom: page.viewport?.zoom || 1,
      },
      metadata: page.metadata ? { ...page.metadata } : undefined,
    })),
    frames: (composition.frames || []).map(frame => ({
      ...frame,
      elements: (frame.elements || []).map(cloneDesignElement),
      embeddedScene: frame.embeddedScene
        ? sceneDocumentFromUnknown(frame.embeddedScene, {
            fallbackDrawMode: 'diagram',
            fallbackSourceType: 'manual',
          })
        : undefined,
      themeTokens: frame.themeTokens ? { ...frame.themeTokens } : undefined,
      metadata: frame.metadata ? { ...frame.metadata } : undefined,
    })),
    assets: (composition.assets || []).map(asset => ({
      ...asset,
      metadata: asset.metadata ? { ...asset.metadata } : undefined,
    })),
    slots: { ...(composition.slots || {}) },
    themeTokens: { ...(composition.themeTokens || {}) },
    layoutRules: { ...(composition.layoutRules || {}) },
    allowedBlocks: [...(composition.allowedBlocks || [])],
    exportPresets: [...(composition.exportPresets || [])],
    blocks: (composition.blocks || []).map(block => ({
      ...block,
      metadata: block.metadata ? { ...block.metadata } : undefined,
    })),
    metadata: { ...(composition.metadata || {}) },
  }
}

function sanitizeGraphId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function cloneGraphSourceNode(node: GraphSourceNode): GraphSourceNode {
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
  }
}

function cloneGraphSourceEdge(edge: GraphSourceEdge): GraphSourceEdge {
  return {
    ...edge,
    metadata: edge.metadata ? { ...edge.metadata } : undefined,
  }
}

function escapeMermaidText(value: string): string {
  return normalizeString(value)
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '/')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

function cloneGraphSourceModel(model: GraphSourceModel): GraphSourceModel {
  return {
    ...model,
    nodes: (model.nodes || []).map(cloneGraphSourceNode),
    edges: (model.edges || []).map(cloneGraphSourceEdge),
    groups: (model.groups || []).map(group => ({
      ...group,
      childNodeIds: [...(group.childNodeIds || [])],
      metadata: group.metadata ? { ...group.metadata } : undefined,
    })),
    sourceText: normalizeString(model.sourceText) || undefined,
    metadata: model.metadata ? { ...model.metadata } : undefined,
  }
}

function exportGraphSourceToMermaid(model: GraphSourceModel): string {
  const graph = cloneGraphSourceModel(model)
  const header = graph.diagramType === 'flowchart'
    ? 'flowchart TD'
    : `%% diagramType: ${graph.diagramType}\nflowchart TD`
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const renderedStandaloneNodes = new Set<string>()
  const lines: string[] = [header]

  function renderNodeToken(nodeId: string): string {
    const node = nodeById.get(nodeId)
    const safeId = sanitizeGraphId(node?.id || nodeId, `node-${renderedStandaloneNodes.size + 1}`)
    const label = escapeMermaidText(node?.label || safeId)
    return `${safeId}["${label}"]`
  }

  for (const edge of graph.edges || []) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target))
      continue
    renderedStandaloneNodes.add(edge.source)
    renderedStandaloneNodes.add(edge.target)
    const label = escapeMermaidText(edge.label || '')
    lines.push(label
      ? `  ${renderNodeToken(edge.source)} -->|"${label}"| ${renderNodeToken(edge.target)}`
      : `  ${renderNodeToken(edge.source)} --> ${renderNodeToken(edge.target)}`)
  }

  for (const node of graph.nodes || []) {
    if (renderedStandaloneNodes.has(node.id))
      continue
    lines.push(`  ${renderNodeToken(node.id)}`)
  }

  if (lines.length === 1)
    lines.push('  empty["Untitled diagram"]')

  return lines.join('\n')
}

function ensureUniqueGraphNodeId(
  model: GraphSourceModel,
  rawId: string,
  fallback: string,
  excludeId = '',
): string {
  const baseId = sanitizeGraphId(rawId, fallback)
  const takenIds = new Set(
    (model.nodes || [])
      .map(node => node.id)
      .filter(id => id && id !== excludeId),
  )
  if (!takenIds.has(baseId))
    return baseId

  let cursor = 2
  let nextId = `${baseId}-${cursor}`
  while (takenIds.has(nextId)) {
    cursor += 1
    nextId = `${baseId}-${cursor}`
  }
  return nextId
}

function ensureUniqueGraphEdgeId(
  model: GraphSourceModel,
  rawId: string,
  fallback: string,
  excludeId = '',
): string {
  const baseId = sanitizeGraphId(rawId, fallback)
  const takenIds = new Set(
    (model.edges || [])
      .map(edge => edge.id)
      .filter(id => id && id !== excludeId),
  )
  if (!takenIds.has(baseId))
    return baseId

  let cursor = 2
  let nextId = `${baseId}-${cursor}`
  while (takenIds.has(nextId)) {
    cursor += 1
    nextId = `${baseId}-${cursor}`
  }
  return nextId
}

function createDefaultDesignSceneDocument(): SceneDocument {
  return buildDeviceMockupSceneDocument({
    title: '统一设计文档',
    subtitle: '一个文档多 Page，一个 Page 多 Frame，图表与设计稿统一协作。',
    badge: 'Design',
    templateKey: DEFAULT_TEMPLATE_KEY,
    deviceFramePresetKey: DEFAULT_DEVICE_FRAME_KEY,
  })
}

function resolveIncomingDesignDocument(rawValue: string): {
  document: SceneDocument
  shouldPersistNormalized: boolean
} {
  const normalizedRawValue = normalizeString(rawValue)
  if (!normalizedRawValue) {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    }
  }

  const parsed = parseSceneDocumentString(normalizedRawValue, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  const migratedFromLegacyDraw = Boolean(parsed.metadata?.migratedFromLegacyDraw)

  if (migratedFromLegacyDraw || parsed.drawMode !== 'composition' || parsed.sourceModel.kind !== 'composition') {
    return {
      document: createDefaultDesignSceneDocument(),
      shouldPersistNormalized: true,
    }
  }

  return {
    document: relayoutSceneDocument({
      ...parsed,
      drawMode: 'composition',
      editorEngine: 'vueflow',
    }),
    shouldPersistNormalized: false,
  }
}

const isBoundToDesignResource = computed(() => {
  const designResourceId = normalizeString(props.designResourceId)
  const boundResourceId = normalizeString(props.boundResourceId)
  return Boolean(designResourceId) && designResourceId === boundResourceId
})

const panelStatusLabel = computed(() => {
  if (!props.hasDesignResource)
    return '正在初始化设计文档...'
  if (!isBoundToDesignResource.value)
    return '正在连接设计文档...'
  return props.collabConnectionText || '设计文档已连接'
})

const panelStatusToneClass = computed(() => {
  if (!props.hasDesignResource || !isBoundToDesignResource.value)
    return 'text-amber-700 border-amber-200 bg-amber-50'
  return props.collabConnected
    ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
    : 'text-amber-700 border-amber-200 bg-amber-50'
})

const compositionModel = computed<CompositionModel>(() => {
  return draftDocument.value.sourceModel.kind === 'composition'
    ? draftDocument.value.sourceModel
    : createDefaultDesignSceneDocument().sourceModel as CompositionModel
})

const pages = computed(() => compositionModel.value.pages || [])
const currentPage = computed(() => {
  return pages.value.find(page => page.id === normalizeString(compositionModel.value.currentPageId)) || pages.value[0] || null
})
const currentPageFrames = computed(() => {
  return (compositionModel.value.frames || []).filter(frame => frame.pageId === currentPage.value?.id)
})
const selectedFrame = computed(() => {
  return currentPageFrames.value.find(frame => frame.id === selectedFrameId.value) || currentPageFrames.value[0] || null
})
const diagramEditorFrame = computed(() => {
  return currentPageFrames.value.find(frame => frame.id === diagramEditorFrameId.value) || null
})
const diagramEditorScene = computed<SceneDocument | null>(() => {
  const embeddedScene = diagramEditorFrame.value?.embeddedScene
  return embeddedScene
    ? sceneDocumentFromUnknown(embeddedScene, {
        fallbackDrawMode: 'diagram',
        fallbackSourceType: 'manual',
      })
    : null
})
const diagramEditorGraph = computed<GraphSourceModel | null>(() => {
  return diagramEditorScene.value?.sourceModel.kind === 'graph'
    ? diagramEditorScene.value.sourceModel
    : null
})
const diagramSelectedNode = computed<GraphSourceNode | null>(() => {
  return diagramEditorGraph.value?.nodes.find(node => node.id === diagramSelectedNodeId.value) || null
})
const diagramSelectedEdge = computed<GraphSourceEdge | null>(() => {
  return diagramEditorGraph.value?.edges.find(edge => edge.id === diagramSelectedEdgeId.value) || null
})
const currentPageSvgMarkup = computed(() => {
  if (!currentPage.value)
    return ''
  return renderCompositionAssetToSvg(draftDocument.value, {
    pageId: currentPage.value.id,
  })
})
const selectedFrameSvgMarkup = computed(() => {
  if (!selectedFrame.value)
    return ''
  return renderCompositionAssetToSvg(draftDocument.value, {
    frameId: selectedFrame.value.id,
  })
})
const sceneJson = computed(() => serializeSceneDocument(draftDocument.value))

watch(
  [currentPageFrames, currentPage],
  () => {
    if (!currentPageFrames.value.some(frame => frame.id === selectedFrameId.value))
      selectedFrameId.value = currentPageFrames.value[0]?.id || ''
    if (!currentPageFrames.value.some(frame => frame.id === diagramEditorFrameId.value))
      diagramEditorFrameId.value = ''
  },
  { immediate: true },
)

watch(
  () => selectedFrameId.value,
  (nextFrameId) => {
    if (diagramEditorFrameId.value && diagramEditorFrameId.value !== nextFrameId)
      diagramEditorFrameId.value = ''
  },
)

watch(
  diagramEditorFrame,
  (frame) => {
    if (frame && frame.kind !== 'diagram')
      diagramEditorFrameId.value = ''
  },
)

watch(
  selectedFrame,
  (frame) => {
    if (!diagramEditorFrameId.value && frame?.kind === 'diagram')
      syncDiagramEditorFromFrame(frame)
  },
  { immediate: true },
)

watch(
  diagramEditorGraph,
  (graph) => {
    if (!graph?.nodes.some(node => node.id === diagramSelectedNodeId.value))
      diagramSelectedNodeId.value = ''
    if (!graph?.edges.some(edge => edge.id === diagramSelectedEdgeId.value))
      diagramSelectedEdgeId.value = ''
  },
  { immediate: true },
)

function setDraftDocument(document: SceneDocument): void {
  draftDocument.value = document
  if (!currentPageFrames.value.some(frame => frame.id === selectedFrameId.value))
    selectedFrameId.value = currentPageFrames.value[0]?.id || ''
}

function resolveFrameFromDocument(document: SceneDocument, frameId: string): DesignFrameModel | null {
  if (document.sourceModel.kind !== 'composition')
    return null
  return document.sourceModel.frames?.find(frame => frame.id === frameId) || null
}

function commitDocument(document: SceneDocument): void {
  const normalizedDocument = relayoutSceneDocument({
    ...document,
    drawMode: 'composition',
    editorEngine: 'vueflow',
  })
  setDraftDocument(normalizedDocument)

  if (syncingFromModel.value || !isBoundToDesignResource.value)
    return

  const serialized = serializeSceneDocument(normalizedDocument)
  if (serialized === lastAppliedSceneJson.value)
    return
  lastAppliedSceneJson.value = serialized
  emit('update:modelValue', serialized)
}

function mutateCompositionDocument(mutator: (composition: CompositionModel) => CompositionModel): void {
  const normalized = sceneDocumentFromUnknown(draftDocument.value, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  if (normalized.sourceModel.kind !== 'composition')
    return
  const nextComposition = mutator(cloneCompositionModel(normalized.sourceModel))
  commitDocument({
    ...normalized,
    drawMode: 'composition',
    editorEngine: 'vueflow',
    sourceModel: nextComposition,
  })
}

watch(
  [() => props.modelValue, isBoundToDesignResource],
  ([nextModelValue, nextIsBound]) => {
    const resolved = resolveIncomingDesignDocument(nextIsBound ? nextModelValue : '')
    syncingFromModel.value = true
    setDraftDocument(resolved.document)
    lastAppliedSceneJson.value = serializeSceneDocument(resolved.document)
    syncingFromModel.value = false

    if (nextIsBound && resolved.shouldPersistNormalized) {
      lastAppliedSceneJson.value = serializeSceneDocument(resolved.document)
      emit('update:modelValue', lastAppliedSceneJson.value)
    }
  },
  { immediate: true },
)

function selectPage(pageId: string): void {
  commitDocument(setCurrentDesignPageInSceneDocument(draftDocument.value, pageId))
}

function createPage(): void {
  commitDocument(appendDesignPageToSceneDocument(draftDocument.value, {
    name: `Page ${pages.value.length + 1}`,
    background: currentPage.value?.background || '#0b1220',
    makeCurrent: true,
  }))
}

function removePage(pageId: string): void {
  commitDocument(removeDesignPageFromSceneDocument(draftDocument.value, pageId))
}

function movePage(pageId: string, direction: -1 | 1): void {
  mutateCompositionDocument((composition) => {
    const pageList = [...(composition.pages || [])]
    const index = pageList.findIndex(page => page.id === pageId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= pageList.length)
      return composition
    const [page] = pageList.splice(index, 1)
    pageList.splice(nextIndex, 0, page!)
    return {
      ...composition,
      pages: pageList,
    }
  })
}

function moveFrame(frameId: string, direction: -1 | 1): void {
  mutateCompositionDocument((composition) => {
    const frames = [...(composition.frames || [])]
    const current = frames.find(frame => frame.id === frameId)
    if (!current)
      return composition
    const pageFrames = frames.filter(frame => frame.pageId === current.pageId)
    const currentIndex = pageFrames.findIndex(frame => frame.id === frameId)
    const nextIndex = currentIndex + direction
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= pageFrames.length)
      return composition
    const reorderedPageFrames = [...pageFrames]
    const [movedFrame] = reorderedPageFrames.splice(currentIndex, 1)
    reorderedPageFrames.splice(nextIndex, 0, movedFrame!)
    let pointer = 0
    return {
      ...composition,
      frames: frames.map((frame) => {
        if (frame.pageId !== current.pageId)
          return frame
        const nextFrame = reorderedPageFrames[pointer]
        pointer += 1
        return nextFrame || frame
      }),
    }
  })
}

function createFrame(kind: DesignFrameKind, extra: Partial<DesignFrameModel> & {
  templateKey?: string
  slots?: Record<string, unknown>
  themeTokens?: Record<string, string>
} = {}): void {
  if (!currentPage.value)
    return
  const nextDocument = appendDesignFrameToSceneDocument(draftDocument.value, {
    pageId: currentPage.value.id,
    kind,
    ...extra,
  })
  const nextComposition = nextDocument.sourceModel.kind === 'composition' ? nextDocument.sourceModel : null
  const nextFrame = nextComposition?.frames?.[nextComposition.frames.length - 1] || null
  commitDocument(nextDocument)
  selectedFrameId.value = nextFrame?.id || ''
  if (kind === 'diagram' && nextFrame) {
    diagramEditorFrameId.value = nextFrame.id
    syncDiagramEditorFromFrame(nextFrame)
  }
}

function duplicateSelectedFrame(): void {
  if (!selectedFrame.value)
    return
  const nextDocument = appendDesignFrameToSceneDocument(draftDocument.value, {
    ...selectedFrame.value,
    id: '',
    pageId: selectedFrame.value.pageId,
    name: `${selectedFrame.value.name} 副本`,
    x: selectedFrame.value.x + 48,
    y: selectedFrame.value.y + 48,
    elements: (selectedFrame.value.elements || []).map(cloneDesignElement),
    embeddedScene: selectedFrame.value.embeddedScene
      ? sceneDocumentFromUnknown(selectedFrame.value.embeddedScene, {
          fallbackDrawMode: 'diagram',
          fallbackSourceType: 'manual',
        })
      : undefined,
  })
  const nextComposition = nextDocument.sourceModel.kind === 'composition' ? nextDocument.sourceModel : null
  const nextFrame = nextComposition?.frames?.[nextComposition.frames.length - 1] || null
  commitDocument(nextDocument)
  selectedFrameId.value = nextFrame?.id || ''
  if (nextFrame?.kind === 'diagram') {
    diagramEditorFrameId.value = nextFrame.id
    syncDiagramEditorFromFrame(nextFrame)
  }
}

function removeSelectedFrame(): void {
  if (!selectedFrame.value)
    return
  commitDocument(removeDesignFrameFromSceneDocument(draftDocument.value, selectedFrame.value.id))
}

function updateSelectedFramePosition(payload: { frameId: string, x: number, y: number }): void {
  commitDocument(updateDesignFrameInSceneDocument(draftDocument.value, payload.frameId, {
    x: payload.x,
    y: payload.y,
  }))
}

function updateCurrentPageViewport(payload: { x: number, y: number, zoom: number }): void {
  if (!currentPage.value)
    return
  commitDocument(updateDesignPageInSceneDocument(draftDocument.value, currentPage.value.id, {
    viewport: payload,
  }))
}

function updateCurrentPageName(value: string): void {
  if (!currentPage.value)
    return
  commitDocument(updateDesignPageInSceneDocument(draftDocument.value, currentPage.value.id, {
    name: value,
  }))
}

function updateCurrentPageBackground(value: string): void {
  if (!currentPage.value)
    return
  commitDocument(updateDesignPageInSceneDocument(draftDocument.value, currentPage.value.id, {
    background: value,
  }))
}

function updateSelectedFrame(patch: Partial<DesignFrameModel> & {
  slots?: Record<string, unknown>
  title?: string
  subtitle?: string
  badge?: string
  imageSrc?: string
}): void {
  if (!selectedFrame.value)
    return
  commitDocument(updateDesignFrameInSceneDocument(draftDocument.value, selectedFrame.value.id, patch))
}

function upsertFrameElement(
  frame: DesignFrameModel,
  matcher: (element: DesignElementModel) => boolean,
  nextElement: DesignElementModel,
): DesignElementModel[] {
  const elements = (frame.elements || []).map(cloneDesignElement)
  const index = elements.findIndex(matcher)
  if (index === -1) {
    elements.push(nextElement)
    return elements
  }
  elements[index] = {
    ...elements[index],
    ...nextElement,
    style: {
      ...(elements[index]?.style || {}),
      ...(nextElement.style || {}),
    },
    metadata: {
      ...(elements[index]?.metadata || {}),
      ...(nextElement.metadata || {}),
    },
  }
  return elements
}

function updateSelectedFrameText(slot: 'title' | 'subtitle' | 'badge', value: string): void {
  if (!selectedFrame.value)
    return
  const matcher = slot === 'badge'
    ? (element: DesignElementModel) => element.id === 'badge' || element.type === 'badge'
    : slot === 'subtitle'
      ? (element: DesignElementModel) => element.id === 'subtitle' || element.type === 'caption'
      : (element: DesignElementModel) => element.id === 'title' || element.type === 'text'
  const nextElements = upsertFrameElement(
    selectedFrame.value,
    matcher,
    {
      id: slot,
      type: slot === 'badge' ? 'badge' : slot === 'subtitle' ? 'caption' : 'text',
      x: slot === 'title' ? 104 : slot === 'subtitle' ? 108 : 104,
      y: slot === 'title' ? 140 : slot === 'subtitle' ? 308 : 80,
      width: slot === 'title' ? 760 : slot === 'subtitle' ? 640 : Math.max(112, value.length * 16 + 28),
      height: slot === 'title' ? 132 : slot === 'subtitle' ? 96 : 38,
      text: value,
      style: slot === 'badge'
        ? { fill: 'accent' }
        : slot === 'subtitle'
          ? { fontSize: 24, fontWeight: 500, color: 'muted' }
          : { fontSize: 56, fontWeight: 700, color: 'text' },
    },
  )
  updateSelectedFrame({
    elements: nextElements,
  })
}

function applyImageToSelectedFrame(src: string): void {
  if (!selectedFrame.value)
    return
  const nextElements = upsertFrameElement(
    selectedFrame.value,
    element => element.id === 'hero-image' || element.type === 'image',
    {
      id: 'hero-image',
      type: 'image',
      x: selectedFrame.value.kind === 'device_mockup' || selectedFrame.value.kind === 'template' ? 960 : 56,
      y: selectedFrame.value.kind === 'device_mockup' || selectedFrame.value.kind === 'template' ? 128 : 220,
      width: selectedFrame.value.kind === 'device_mockup' || selectedFrame.value.kind === 'template' ? 520 : 320,
      height: selectedFrame.value.kind === 'device_mockup' || selectedFrame.value.kind === 'template' ? 640 : 220,
      imageSrc: src,
    },
  )
  updateSelectedFrame({
    elements: nextElements,
  })
}

async function readImageAsDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'))
    reader.readAsDataURL(file)
  }).catch(() => '')
}

function createAssetId(): string {
  return `asset-${Date.now()}`
}

async function handleAssetUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file)
    return

  const src = await readImageAsDataUrl(file)
  if (!src)
    return

  const asset: DesignAssetModel = {
    id: createAssetId(),
    type: 'image',
    name: file.name,
    src,
    mimeType: file.type || undefined,
    metadata: {
      size: file.size,
    },
  }

  mutateCompositionDocument((composition) => {
    return {
      ...composition,
      assets: [...(composition.assets || []), asset],
    }
  })
  applyImageToSelectedFrame(src)
}

function useAsset(asset: DesignAssetModel): void {
  applyImageToSelectedFrame(asset.src)
}

function applyTemplateFrame(templateKey: string): void {
  const template = templateOptions.find(item => item.templateKey === templateKey)
  createFrame('template', {
    name: template?.title || '模板 Frame',
    templateKey,
    themeTokens: template?.themeTokens || {},
    slots: {
      title: template?.title || '模板标题',
      subtitle: template?.summary || '模板内容已落成普通设计对象，可继续自由编辑。',
      badge: 'Template',
    },
  })
}

function resolveActiveDiagramFrame(): DesignFrameModel | null {
  if (diagramEditorFrame.value?.kind === 'diagram')
    return diagramEditorFrame.value
  return selectedFrame.value?.kind === 'diagram' ? selectedFrame.value : null
}

function commitDiagramFrameUpdate(frameId: string, patch: Partial<DesignFrameModel>): void {
  const nextDocument = updateDesignFrameInSceneDocument(draftDocument.value, frameId, {
    kind: 'diagram',
    ...patch,
  })
  const nextFrame = resolveFrameFromDocument(nextDocument, frameId)
  commitDocument(nextDocument)
  selectedFrameId.value = frameId
  if (nextFrame)
    syncDiagramEditorFromFrame(nextFrame)
}

function selectDiagramNode(nodeId: string): void {
  diagramSelectedNodeId.value = nodeId
  diagramSelectedEdgeId.value = ''
}

function selectDiagramEdge(edgeId: string): void {
  diagramSelectedEdgeId.value = edgeId
  diagramSelectedNodeId.value = ''
}

function clearDiagramSelection(): void {
  diagramSelectedNodeId.value = ''
  diagramSelectedEdgeId.value = ''
}

function applyDiagramSource(): void {
  const frame = resolveActiveDiagramFrame()
  if (!frame || !diagramSourceText.value.trim())
    return

  const embeddedScene = diagramSourceFormat.value === 'mermaid'
    ? importFromMermaid(diagramSourceText.value)
    : diagramSourceFormat.value === 'markdown_outline'
      ? importFromMarkdownOutline(diagramSourceText.value)
      : diagramSourceFormat.value === 'ddl'
        ? importFromDDL(diagramSourceText.value).sceneDocument
        : importArchitectureFromMetadata(diagramSourceText.value).sceneDocument

  clearDiagramSelection()
  commitDiagramFrameUpdate(frame.id, { embeddedScene })
}

function resolveDiagramSourceFormat(frame: DesignFrameModel | null): 'mermaid' | 'markdown_outline' | 'ddl' | 'architecture' {
  const embeddedScene = frame?.embeddedScene
  if (!embeddedScene)
    return 'mermaid'
  if (embeddedScene.sourceType === 'markdown_outline')
    return 'markdown_outline'
  if (embeddedScene.sourceType === 'ddl' || embeddedScene.sourceModel.kind === 'schema')
    return 'ddl'
  if (embeddedScene.drawMode === 'architecture' || embeddedScene.sourceModel.kind === 'architecture')
    return 'architecture'
  return 'mermaid'
}

function resolveDiagramSourceText(frame: DesignFrameModel | null): string {
  const embeddedScene = frame?.embeddedScene
  if (!embeddedScene)
    return ''
  if (embeddedScene.sourceModel.kind === 'graph')
    return normalizeString(embeddedScene.sourceModel.sourceText) || exportGraphSourceToMermaid(embeddedScene.sourceModel)
  if (embeddedScene.sourceModel.kind === 'schema')
    return exportSchemaModelToDDL(embeddedScene)
  if (embeddedScene.sourceModel.kind === 'architecture')
    return exportArchitectureModelToMermaid(embeddedScene, 'dependency_map')
  return serializeSceneDocument(embeddedScene)
}

function syncDiagramEditorFromFrame(frame: DesignFrameModel | null): void {
  diagramSourceFormat.value = resolveDiagramSourceFormat(frame)
  diagramSourceText.value = resolveDiagramSourceText(frame)
}

function openFrameEditor(frameId: string): void {
  const frame = currentPageFrames.value.find(item => item.id === frameId) || null
  if (!frame)
    return
  selectedFrameId.value = frame.id
  if (frame.kind !== 'diagram') {
    diagramEditorFrameId.value = ''
    return
  }
  diagramEditorFrameId.value = frame.id
  syncDiagramEditorFromFrame(frame)
}

function closeDiagramEditor(): void {
  diagramEditorFrameId.value = ''
}

function updateDiagramEmbeddedScene(mutator: (scene: SceneDocument) => SceneDocument | null): void {
  const frame = resolveActiveDiagramFrame()
  if (!frame?.embeddedScene)
    return

  const currentScene = sceneDocumentFromUnknown(frame.embeddedScene, {
    fallbackDrawMode: 'diagram',
    fallbackSourceType: 'manual',
  })
  const nextScene = mutator(currentScene)
  if (!nextScene)
    return

  commitDiagramFrameUpdate(frame.id, { embeddedScene: nextScene })
}

function updateDiagramGraph(mutator: (graph: GraphSourceModel) => GraphSourceModel | null): void {
  updateDiagramEmbeddedScene((scene) => {
    if (scene.sourceModel.kind !== 'graph')
      return null

    const nextGraph = mutator(cloneGraphSourceModel(scene.sourceModel))
    if (!nextGraph)
      return null

    const nextSourceText = exportGraphSourceToMermaid(nextGraph)
    diagramSourceFormat.value = 'mermaid'
    diagramSourceText.value = nextSourceText

    return relayoutSceneDocument({
      ...scene,
      drawMode: 'diagram',
      sourceType: 'manual',
      sourceModel: {
        ...nextGraph,
        sourceText: nextSourceText,
      },
    })
  })
}

function addDiagramGraphNode(): void {
  const currentGraph = diagramEditorGraph.value
  const nextIndex = (currentGraph?.nodes.length || 0) + 1
  const nextId = currentGraph
    ? ensureUniqueGraphNodeId(currentGraph, `node-${nextIndex}`, `node-${nextIndex}`)
    : `node-${nextIndex}`
  updateDiagramGraph((graph) => {
    graph.nodes.push({
      id: nextId,
      label: `Node ${nextIndex}`,
      type: graph.diagramType === 'mindmap' && graph.nodes.length === 0 ? 'root' : 'node',
      metadata: {},
    })
    return graph
  })
  selectDiagramNode(nextId)
}

function addDiagramChildNode(parentNodeId: string): void {
  const currentGraph = diagramEditorGraph.value
  const parentNode = currentGraph?.nodes.find(node => node.id === parentNodeId) || null
  if (!currentGraph || !parentNode)
    return

  const nextIndex = currentGraph.nodes.length + 1
  const nextId = ensureUniqueGraphNodeId(currentGraph, `${parentNode.id}-child`, `node-${nextIndex}`)
  const edgeId = ensureUniqueGraphEdgeId(currentGraph, `${parentNode.id}-${nextId}`, `edge-${currentGraph.edges.length + 1}`)

  updateDiagramGraph((graph) => {
    graph.nodes.push({
      id: nextId,
      label: `${parentNode.label || parentNode.id} Child`,
      type: graph.diagramType === 'mindmap' ? 'topic' : parentNode.type || 'node',
      metadata: {},
    })
    graph.edges.push({
      id: edgeId,
      source: parentNodeId,
      target: nextId,
      label: undefined,
      metadata: {},
    })
    return graph
  })
  selectDiagramNode(nextId)
}

function duplicateDiagramGraphNode(nodeId: string): void {
  const currentGraph = diagramEditorGraph.value
  const sourceNode = currentGraph?.nodes.find(node => node.id === nodeId) || null
  if (!currentGraph || !sourceNode)
    return

  const nextId = ensureUniqueGraphNodeId(currentGraph, `${sourceNode.id}-copy`, `${sourceNode.id}-copy`)
  updateDiagramGraph((graph) => {
    graph.nodes.push({
      ...cloneGraphSourceNode(sourceNode),
      id: nextId,
      label: `${sourceNode.label} Copy`,
      metadata: sourceNode.metadata ? { ...sourceNode.metadata } : undefined,
    })
    return graph
  })
  selectDiagramNode(nextId)
}

function updateDiagramGraphNode(
  nodeId: string,
  patch: Partial<GraphSourceNode>,
): void {
  const currentGraph = diagramEditorGraph.value
  const currentNode = currentGraph?.nodes.find(node => node.id === nodeId) || null
  const nextSelectionId = currentNode && patch.id !== undefined
    ? ensureUniqueGraphNodeId(currentGraph || cloneGraphSourceModel({
        kind: 'graph',
        diagramType: 'flowchart',
        nodes: [],
        edges: [],
        groups: [],
      }), patch.id || currentNode.id, currentNode.id || 'node', currentNode.id)
    : nodeId
  updateDiagramGraph((graph) => {
    const nodeIndex = graph.nodes.findIndex(node => node.id === nodeId)
    if (nodeIndex < 0)
      return null

    const currentNode = graph.nodes[nodeIndex]
    if (!currentNode)
      return null

    const nextId = patch.id !== undefined
      ? ensureUniqueGraphNodeId(graph, patch.id || currentNode.id, currentNode.id || `node-${nodeIndex + 1}`, currentNode.id)
      : currentNode.id
    const nextNode: GraphSourceNode = {
      ...currentNode,
      ...patch,
      id: nextId,
      label: normalizeString(patch.label !== undefined ? patch.label : currentNode.label) || nextId,
      type: normalizeString(patch.type !== undefined ? patch.type : currentNode.type) || undefined,
      metadata: patch.metadata
        ? {
            ...(currentNode.metadata || {}),
            ...patch.metadata,
          }
        : currentNode.metadata
          ? { ...currentNode.metadata }
          : undefined,
    }
    graph.nodes[nodeIndex] = nextNode

    if (nextId !== currentNode.id) {
      graph.edges = graph.edges.map(edge => ({
        ...cloneGraphSourceEdge(edge),
        source: edge.source === currentNode.id ? nextId : edge.source,
        target: edge.target === currentNode.id ? nextId : edge.target,
      }))
      graph.groups = (graph.groups || []).map(group => ({
        ...group,
        childNodeIds: (group.childNodeIds || []).map(childId => childId === currentNode.id ? nextId : childId),
        metadata: group.metadata ? { ...group.metadata } : undefined,
      }))
    }

    return graph
  })
  if (diagramSelectedNodeId.value === nodeId)
    selectDiagramNode(nextSelectionId)
}

function removeDiagramGraphNode(nodeId: string): void {
  updateDiagramGraph((graph) => {
    graph.nodes = graph.nodes.filter(node => node.id !== nodeId)
    graph.edges = graph.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId)
    graph.groups = (graph.groups || [])
      .map(group => ({
        ...group,
        childNodeIds: (group.childNodeIds || []).filter(childId => childId !== nodeId),
        metadata: group.metadata ? { ...group.metadata } : undefined,
      }))
      .filter(group => group.childNodeIds.length > 0)
    return graph
  })
  if (diagramSelectedNodeId.value === nodeId)
    diagramSelectedNodeId.value = ''
}

function addDiagramGraphEdge(): void {
  const currentGraph = diagramEditorGraph.value
  const edgeId = ensureUniqueGraphEdgeId(
    currentGraph || {
      kind: 'graph',
      diagramType: 'flowchart',
      nodes: [],
      edges: [],
      groups: [],
    },
    `edge-${(currentGraph?.edges.length || 0) + 1}`,
    `edge-${(currentGraph?.edges.length || 0) + 1}`,
  )

  updateDiagramGraph((graph) => {
    if (graph.nodes.length === 0) {
      graph.nodes.push({
        id: 'node-1',
        label: 'Node 1',
        type: graph.diagramType === 'mindmap' ? 'root' : 'node',
        metadata: {},
      })
    }

    if (graph.nodes.length === 1) {
      graph.nodes.push({
        id: ensureUniqueGraphNodeId(graph, 'node-2', 'node-2'),
        label: 'Node 2',
        type: graph.diagramType === 'mindmap' ? 'topic' : 'node',
        metadata: {},
      })
    }

    graph.edges.push({
      id: edgeId,
      source: graph.nodes[0]?.id || '',
      target: graph.nodes[1]?.id || graph.nodes[0]?.id || '',
      label: undefined,
      metadata: {},
    })
    return graph
  })
  selectDiagramEdge(edgeId)
}

function updateDiagramGraphEdge(
  edgeId: string,
  patch: Partial<GraphSourceEdge>,
): void {
  updateDiagramGraph((graph) => {
    const edgeIndex = graph.edges.findIndex(edge => edge.id === edgeId)
    if (edgeIndex < 0)
      return null

    const currentEdge = graph.edges[edgeIndex]
    if (!currentEdge)
      return null

    const availableNodeIds = new Set(graph.nodes.map(node => node.id))
    const fallbackSource = availableNodeIds.has(currentEdge.source) ? currentEdge.source : graph.nodes[0]?.id || ''
    const fallbackTarget = availableNodeIds.has(currentEdge.target) ? currentEdge.target : graph.nodes[0]?.id || ''
    graph.edges[edgeIndex] = {
      ...currentEdge,
      ...patch,
      id: currentEdge.id,
      source: patch.source && availableNodeIds.has(patch.source) ? patch.source : fallbackSource,
      target: patch.target && availableNodeIds.has(patch.target) ? patch.target : fallbackTarget,
      label: normalizeString(patch.label !== undefined ? patch.label : currentEdge.label) || undefined,
      metadata: patch.metadata
        ? {
            ...(currentEdge.metadata || {}),
            ...patch.metadata,
          }
        : currentEdge.metadata
          ? { ...currentEdge.metadata }
          : undefined,
    }
    return graph
  })
}

function removeDiagramGraphEdge(edgeId: string): void {
  updateDiagramGraph((graph) => {
    graph.edges = graph.edges.filter(edge => edge.id !== edgeId)
    return graph
  })
  if (diagramSelectedEdgeId.value === edgeId)
    diagramSelectedEdgeId.value = ''
}

function reverseDiagramGraphEdge(edgeId: string): void {
  updateDiagramGraph((graph) => {
    const edgeIndex = graph.edges.findIndex(edge => edge.id === edgeId)
    if (edgeIndex < 0)
      return null
    const currentEdge = graph.edges[edgeIndex]
    if (!currentEdge)
      return null
    graph.edges[edgeIndex] = {
      ...cloneGraphSourceEdge(currentEdge),
      source: currentEdge.target,
      target: currentEdge.source,
    }
    return graph
  })
  selectDiagramEdge(edgeId)
}

function updateDiagramGraphType(diagramType: GraphSourceModel['diagramType']): void {
  updateDiagramGraph((graph) => {
    graph.diagramType = diagramType
    return graph
  })
}

function connectDiagramGraphEdge(payload: { source?: string, target?: string }): void {
  const source = normalizeString(payload.source)
  const target = normalizeString(payload.target)
  if (!source || !target)
    return

  const existingEdge = diagramEditorGraph.value?.edges.find(edge => edge.source === source && edge.target === target)
  if (existingEdge) {
    selectDiagramEdge(existingEdge.id)
    return
  }

  const edgeId = ensureUniqueGraphEdgeId(
    diagramEditorGraph.value || {
      kind: 'graph',
      diagramType: 'flowchart',
      nodes: [],
      edges: [],
      groups: [],
    },
    `${source}-${target}`,
    `edge-${(diagramEditorGraph.value?.edges.length || 0) + 1}`,
  )

  updateDiagramGraph((graph) => {
    if (!graph.nodes.some(node => node.id === source) || !graph.nodes.some(node => node.id === target))
      return null

    graph.edges.push({
      id: edgeId,
      source,
      target,
      label: undefined,
      metadata: {},
    })
    return graph
  })
  selectDiagramEdge(edgeId)
}

function relayoutSelectedDiagramFrame(): void {
  updateDiagramEmbeddedScene(scene => relayoutSceneDocument(scene))
}

function fileSlug(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'design'
}

function downloadBlob(blob: Blob, fileName: string): void {
  if (!import.meta.client)
    return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function downloadSvg(frameId = ''): void {
  if (!currentPage.value)
    return
  const svgMarkup = renderCompositionAssetToSvg(draftDocument.value, {
    pageId: currentPage.value.id,
    frameId: frameId || undefined,
  })
  const fileName = frameId && selectedFrame.value
    ? `${fileSlug(selectedFrame.value.name)}.svg`
    : `${fileSlug(currentPage.value.name)}.svg`
  downloadBlob(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }), fileName)
}

async function downloadPng(frameId = ''): Promise<void> {
  if (!import.meta.client || !currentPage.value)
    return
  const svgMarkup = renderCompositionAssetToSvg(draftDocument.value, {
    pageId: currentPage.value.id,
    frameId: frameId || undefined,
  })
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  const image = new Image()
  const fileName = frameId && selectedFrame.value
    ? `${fileSlug(selectedFrame.value.name)}.png`
    : `${fileSlug(currentPage.value.name)}.png`

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('SVG_TO_IMAGE_FAILED'))
    image.src = svgUrl
  }).catch(() => {})

  const canvas = document.createElement('canvas')
  canvas.width = image.width || 1600
  canvas.height = image.height || 900
  const context = canvas.getContext('2d')
  if (context)
    context.drawImage(image, 0, 0)
  URL.revokeObjectURL(svgUrl)

  canvas.toBlob((blob) => {
    if (!blob)
      return
    downloadBlob(blob, fileName)
  }, 'image/png')
}

async function downloadAllCurrentPageFrames(): Promise<void> {
  for (const frame of currentPageFrames.value) {
    await downloadPng(frame.id)
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 p-4 xl:p-6">
    <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-bold text-slate-900">
              {{ props.designPanelTitle }}
            </h2>
            <span class="rounded-full border px-2.5 py-1 text-[11px] font-semibold" :class="panelStatusToneClass">
              {{ panelStatusLabel }}
            </span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              vueflow / revision {{ props.collabRevision }}
            </span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              AI JSON only
            </span>
          </div>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            设计页现在是一个 `Design Document`：一个文档多个 `Page`，每个 `Page` 都是无限画布，每个 `Page` 可混排 `freeform / template / device_mockup / diagram` Frame。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="createPage"
          >
            新建 Page
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="createFrame('freeform')"
          >
            新建 Freeform
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="createFrame('device_mockup')"
          >
            新建设备 Frame
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="createFrame('diagram')"
          >
            新建 Diagram
          </button>
          <button
            class="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            type="button"
            :disabled="!selectedFrame"
            @click="duplicateSelectedFrame"
          >
            复制 Frame
          </button>
          <button
            class="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-rose-50/60"
            type="button"
            :disabled="!selectedFrame"
            @click="removeSelectedFrame"
          >
            删除 Frame
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="downloadSvg()"
          >
            导出 Page SVG
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPage"
            @click="downloadPng()"
          >
            导出 Page PNG
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!selectedFrame"
            @click="downloadPng(selectedFrame?.id || '')"
          >
            导出 Frame PNG
          </button>
          <button
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            type="button"
            :disabled="!currentPageFrames.length"
            @click="downloadAllCurrentPageFrames"
          >
            批量导出 Frame
          </button>
          <button
            v-if="selectedFrame?.kind === 'diagram'"
            class="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
            type="button"
            @click="openFrameEditor(selectedFrame?.id || '')"
          >
            打开 Diagram 编辑态
          </button>
        </div>
      </div>
    </section>

    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px,minmax(0,1fr),360px]">
      <aside class="min-h-0 space-y-4 overflow-y-auto">
        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">
                Pages
              </h3>
              <p class="mt-1 text-xs text-slate-500">
                Page 是设计文档内的一层，不和项目资源一一映射。
              </p>
            </div>
            <button
              class="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
              type="button"
              @click="createPage"
            >
              新建
            </button>
          </div>

          <div class="mt-4 space-y-2">
            <button
              v-for="(page, index) in pages"
              :key="page.id"
              class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
              :class="page.id === currentPage?.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'"
              type="button"
              @click="selectPage(page.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ page.name }}
                  </p>
                  <p class="mt-1 text-[11px]" :class="page.id === currentPage?.id ? 'text-slate-300' : 'text-slate-500'">
                    {{ (compositionModel.frames || []).filter(frame => frame.pageId === page.id).length }} frame
                  </p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="movePage(page.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="movePage(page.id, 1)"
                  >
                    ↓
                  </button>
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold disabled:opacity-50"
                    type="button"
                    :disabled="pages.length <= 1"
                    @click.stop="removePage(page.id)"
                  >
                    删
                  </button>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">
                Frames
              </h3>
              <p class="mt-1 text-xs text-slate-500">
                当前 Page 内的主工作单元，可排序、锁定、导出和进入 diagram 编辑态。
              </p>
            </div>
            <div class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {{ currentPageFrames.length }}
            </div>
          </div>

          <div class="mt-4 space-y-2">
            <button
              v-for="frame in currentPageFrames"
              :key="frame.id"
              class="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
              :class="frame.id === selectedFrame?.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'"
              type="button"
              @click="selectedFrameId = frame.id"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ frame.name }}
                  </p>
                  <p class="mt-1 text-[11px]" :class="frame.id === selectedFrame?.id ? 'text-slate-300' : 'text-slate-500'">
                    {{ frame.kind }} · {{ Math.round(frame.width) }} × {{ Math.round(frame.height) }}
                  </p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="moveFrame(frame.id, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="moveFrame(frame.id, 1)"
                  >
                    ↓
                  </button>
                  <button
                    v-if="frame.kind === 'diagram'"
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="openFrameEditor(frame.id)"
                  >
                    编
                  </button>
                  <button
                    class="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold"
                    type="button"
                    @click.stop="downloadPng(frame.id)"
                  >
                    出
                  </button>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-sm font-bold text-slate-900">
            模板入口
          </h3>
          <p class="mt-1 text-xs text-slate-500">
            插入时会生成 `template frame` 初稿，之后按普通设计对象继续编辑。
          </p>

          <div class="mt-4 space-y-2">
            <button
              v-for="template in templateOptions"
              :key="template.templateKey"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-100"
              type="button"
              @click="applyTemplateFrame(template.templateKey)"
            >
              <p class="text-sm font-semibold text-slate-800">
                {{ template.title }}
              </p>
              <p class="mt-1 text-[11px] leading-5 text-slate-500">
                {{ template.summary }}
              </p>
            </button>
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">
                Assets
              </h3>
              <p class="mt-1 text-xs text-slate-500">
                上传图片后可直接套设备边框或插到自由 Frame。
              </p>
            </div>
          </div>

          <label class="mt-4 block rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center">
            <span class="text-xs font-semibold text-slate-700">上传图片资源</span>
            <input class="hidden" accept="image/*" type="file" @change="handleAssetUpload">
          </label>

          <div class="mt-4 space-y-2">
            <button
              v-for="asset in compositionModel.assets || []"
              :key="asset.id"
              class="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
              type="button"
              @click="useAsset(asset)"
            >
              <img :src="asset.src" alt="" class="h-12 w-12 rounded-xl object-cover">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-slate-800">
                  {{ asset.name }}
                </p>
                <p class="truncate text-[11px] text-slate-500">
                  {{ asset.mimeType || 'image/*' }}
                </p>
              </div>
            </button>
          </div>
        </section>
      </aside>

      <section class="flex min-h-0 flex-col gap-4">
        <div class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-slate-900">
                当前 Page
              </h3>
              <p class="mt-1 text-xs text-slate-500">
                当前正在编辑 {{ currentPage?.name || '未命名 Page' }}，拖动画布和 Frame 都会写回同一份 `SceneDocument`。
              </p>
            </div>
            <div class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
              {{ props.designResourceId || 'pending-design-resource' }}
            </div>
          </div>
        </div>

        <div class="relative min-h-0 flex-1">
          <ClientOnly>
            <WorkspaceDesignCanvas
              :page="currentPage"
              :frames="currentPageFrames"
              :selected-frame-id="selectedFrameId"
              :disabled="!isBoundToDesignResource"
              @select-frame="selectedFrameId = $event"
              @open-frame="openFrameEditor"
              @update-frame-position="updateSelectedFramePosition"
              @update-page-viewport="updateCurrentPageViewport"
            />

            <template #fallback>
              <div class="overflow-hidden rounded-[32px] border border-slate-200 bg-slate-50 shadow-sm" v-html="currentPageSvgMarkup" />
            </template>
          </ClientOnly>

          <div
            v-if="diagramEditorFrame"
            class="absolute inset-4 z-20 grid min-h-0 grid-cols-1 gap-4 rounded-[28px] border border-slate-700 bg-slate-950/95 p-4 shadow-[0_32px_120px_rgba(2,6,23,0.5)] xl:grid-cols-[minmax(0,1fr),360px]"
          >
            <section class="min-h-0 rounded-[24px] border border-slate-800 bg-slate-900/80 p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-sm font-bold text-white">
                    Diagram 编辑态
                  </h3>
                  <p class="mt-1 text-xs leading-6 text-slate-400">
                    当前正在编辑 {{ diagramEditorFrame.name }}。导入会覆盖该 frame 的 `embeddedScene`，但仍保留结构化语义。
                  </p>
                </div>
                <button
                  class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:bg-slate-800"
                  type="button"
                  @click="closeDiagramEditor"
                >
                  关闭
                </button>
              </div>

              <div class="mt-4 grid gap-3 xl:grid-cols-[220px,minmax(0,1fr),160px,160px]">
                <label class="block space-y-1">
                  <span class="text-xs font-semibold text-slate-300">结构源类型</span>
                  <select
                    v-model="diagramSourceFormat"
                    class="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                  >
                    <option value="mermaid">Mermaid</option>
                    <option value="markdown_outline">Markdown Outline</option>
                    <option value="ddl">DDL</option>
                    <option value="architecture">Architecture Metadata</option>
                  </select>
                </label>
                <div class="hidden xl:block" />
                <button
                  class="rounded-2xl bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400"
                  type="button"
                  @click="applyDiagramSource"
                >
                  覆盖导入
                </button>
                <button
                  class="rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                  type="button"
                  @click="relayoutSelectedDiagramFrame"
                >
                  重新布局
                </button>
              </div>

              <label class="mt-4 block space-y-1">
                <span class="text-xs font-semibold text-slate-300">源文本</span>
                <textarea
                  v-model="diagramSourceText"
                  class="min-h-[360px] w-full rounded-[24px] border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-slate-100 outline-none focus:border-sky-400"
                />
              </label>
            </section>

            <section class="flex min-h-0 flex-col gap-4">
              <div class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4">
                <h4 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Frame Preview
                </h4>
                <div class="mt-3 overflow-hidden rounded-[20px] border border-slate-800 bg-slate-950" v-html="renderCompositionAssetToSvg(draftDocument, { frameId: diagramEditorFrame.id })" />
              </div>
              <div v-if="diagramEditorGraph && diagramEditorScene" class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h4 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Diagram Canvas
                    </h4>
                    <p class="mt-1 text-xs leading-5 text-slate-500">
                      点击节点或边会聚焦 inspector；拖拽连线会直接创建 graph edge。
                    </p>
                  </div>
                  <button
                    class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                    type="button"
                    @click="addDiagramGraphNode"
                  >
                    Add Node
                  </button>
                </div>
                <div class="mt-3 h-[320px] overflow-hidden rounded-[20px] border border-slate-800 bg-slate-950">
                  <ClientOnly>
                    <WorkspaceDesignDiagramEditor
                      :graph="diagramEditorGraph"
                      :scene="diagramEditorScene"
                      :selected-node-id="diagramSelectedNodeId"
                      :selected-edge-id="diagramSelectedEdgeId"
                      @select-node="selectDiagramNode"
                      @select-edge="selectDiagramEdge"
                      @connect-edge="connectDiagramGraphEdge"
                      @create-node="addDiagramGraphNode"
                      @add-child="addDiagramChildNode"
                      @duplicate-node="duplicateDiagramGraphNode"
                      @delete-node="removeDiagramGraphNode"
                      @reverse-edge="reverseDiagramGraphEdge"
                      @delete-edge="removeDiagramGraphEdge"
                      @clear-selection="clearDiagramSelection"
                    />
                  </ClientOnly>
                </div>
              </div>
              <div class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4">
                <h4 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Embedded Scene
                </h4>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <div class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Draw Mode
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramEditorFrame.embeddedScene?.drawMode || 'diagram' }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Source Type
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramEditorFrame.embeddedScene?.sourceType || 'manual' }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Nodes
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramEditorFrame.embeddedScene?.sceneModel?.nodes?.length || 0 }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-3">
                    <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Edges
                    </p>
                    <p class="mt-2 text-sm font-semibold text-slate-100">
                      {{ diagramEditorFrame.embeddedScene?.sceneModel?.edges?.length || 0 }}
                    </p>
                  </div>
                </div>
              </div>

              <div v-if="diagramEditorGraph" class="rounded-[24px] border border-slate-800 bg-slate-900/80 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h4 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Graph Controls
                    </h4>
                    <p class="mt-1 text-xs leading-5 text-slate-500">
                      仅对 `graph` 型 diagram 开放节点与边级编辑，修改后会写回 `embeddedScene.sourceModel` 并重新布局。
                    </p>
                  </div>
                  <button
                    class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                    type="button"
                    @click="addDiagramGraphNode"
                  >
                    Add Node
                  </button>
                </div>

                <label class="mt-4 block space-y-1">
                  <span class="text-xs font-semibold text-slate-300">Diagram Type</span>
                  <select
                    :value="diagramEditorGraph.diagramType"
                    class="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                    @change="updateDiagramGraphType(($event.target as HTMLSelectElement).value as GraphSourceModel['diagramType'])"
                  >
                    <option value="flowchart">flowchart</option>
                    <option value="mindmap">mindmap</option>
                    <option value="relationship">relationship</option>
                    <option value="architecture">architecture</option>
                  </select>
                </label>

                <div class="mt-4 rounded-[20px] border border-slate-800 bg-slate-950 px-4 py-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h5 class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Selection Inspector
                      </h5>
                      <p class="mt-1 text-xs leading-5 text-slate-500">
                        当前聚焦的节点或边会在这里提供快捷操作，配合右上角子画布使用。
                      </p>
                    </div>
                    <button
                      class="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-slate-800"
                      type="button"
                      @click="clearDiagramSelection"
                    >
                      Clear
                    </button>
                  </div>

                  <div v-if="diagramSelectedNode" class="mt-4 space-y-3">
                    <div class="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-3">
                      <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                        Selected Node
                      </p>
                      <p class="mt-2 text-sm font-semibold text-slate-100">
                        {{ diagramSelectedNode.label || diagramSelectedNode.id }}
                      </p>
                      <p class="mt-1 text-[11px] text-slate-500">
                        {{ diagramSelectedNode.id }} · {{ diagramSelectedNode.type || 'node' }}
                      </p>
                    </div>

                    <div class="grid gap-3">
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">id</span>
                        <input
                          :value="diagramSelectedNode.id"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @change="updateDiagramGraphNode(diagramSelectedNode.id, { id: ($event.target as HTMLInputElement).value })"
                        >
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">label</span>
                        <input
                          :value="diagramSelectedNode.label"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="updateDiagramGraphNode(diagramSelectedNode.id, { label: ($event.target as HTMLInputElement).value })"
                        >
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">type</span>
                        <input
                          :value="diagramSelectedNode.type || ''"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="updateDiagramGraphNode(diagramSelectedNode.id, { type: ($event.target as HTMLInputElement).value })"
                        >
                      </label>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        class="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-900/40"
                        type="button"
                        @click="addDiagramChildNode(diagramSelectedNode.id)"
                      >
                        添加下游节点
                      </button>
                      <button
                        class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                        type="button"
                        @click="duplicateDiagramGraphNode(diagramSelectedNode.id)"
                      >
                        复制节点
                      </button>
                      <button
                        class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                        type="button"
                        @click="removeDiagramGraphNode(diagramSelectedNode.id)"
                      >
                        删除节点
                      </button>
                    </div>
                  </div>

                  <div v-else-if="diagramSelectedEdge" class="mt-4 space-y-3">
                    <div class="rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3 py-3">
                      <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                        Selected Edge
                      </p>
                      <p class="mt-2 text-sm font-semibold text-slate-100">
                        {{ diagramSelectedEdge.source }} → {{ diagramSelectedEdge.target }}
                      </p>
                      <p class="mt-1 text-[11px] text-slate-500">
                        {{ diagramSelectedEdge.id }}
                      </p>
                    </div>

                    <div class="grid gap-3">
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">source</span>
                        <select
                          :value="diagramSelectedEdge.source"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          @change="updateDiagramGraphEdge(diagramSelectedEdge.id, { source: ($event.target as HTMLSelectElement).value })"
                        >
                          <option v-for="node in diagramEditorGraph.nodes" :key="`inspector-source-${node.id}`" :value="node.id">
                            {{ node.id }}
                          </option>
                        </select>
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">target</span>
                        <select
                          :value="diagramSelectedEdge.target"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          @change="updateDiagramGraphEdge(diagramSelectedEdge.id, { target: ($event.target as HTMLSelectElement).value })"
                        >
                          <option v-for="node in diagramEditorGraph.nodes" :key="`inspector-target-${node.id}`" :value="node.id">
                            {{ node.id }}
                          </option>
                        </select>
                      </label>
                      <label class="block space-y-1">
                        <span class="text-[11px] font-semibold text-slate-400">label</span>
                        <input
                          :value="diagramSelectedEdge.label || ''"
                          class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                          type="text"
                          @input="updateDiagramGraphEdge(diagramSelectedEdge.id, { label: ($event.target as HTMLInputElement).value })"
                        >
                      </label>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button
                        class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-800"
                        type="button"
                        @click="reverseDiagramGraphEdge(diagramSelectedEdge.id)"
                      >
                        反转方向
                      </button>
                      <button
                        class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                        type="button"
                        @click="removeDiagramGraphEdge(diagramSelectedEdge.id)"
                      >
                        删除边
                      </button>
                    </div>
                  </div>

                  <div v-else class="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500">
                    先在 Diagram Canvas 中选中节点或边，再进行聚焦编辑。
                  </div>
                </div>

                <div class="mt-4">
                  <div class="flex items-center justify-between gap-3">
                    <h5 class="text-xs font-semibold text-slate-200">
                      Nodes
                    </h5>
                    <div class="rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-slate-400">
                      {{ diagramEditorGraph.nodes.length }}
                    </div>
                  </div>

                  <div v-if="diagramEditorGraph.nodes.length" class="mt-3 space-y-3">
                    <div
                      v-for="node in diagramEditorGraph.nodes"
                      :key="node.id"
                      class="rounded-2xl border bg-slate-950 px-3 py-3 transition-colors"
                      :class="node.id === diagramSelectedNodeId ? 'border-sky-500/70 ring-1 ring-sky-400/40' : 'border-slate-800'"
                      @click="selectDiagramNode(node.id)"
                    >
                      <div class="grid gap-3">
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">id</span>
                          <input
                            :value="node.id"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            type="text"
                            @change="updateDiagramGraphNode(node.id, { id: ($event.target as HTMLInputElement).value })"
                          >
                        </label>
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">label</span>
                          <input
                            :value="node.label"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            type="text"
                            @input="updateDiagramGraphNode(node.id, { label: ($event.target as HTMLInputElement).value })"
                          >
                        </label>
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">type</span>
                          <input
                            :value="node.type || ''"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            type="text"
                            @input="updateDiagramGraphNode(node.id, { type: ($event.target as HTMLInputElement).value })"
                          >
                        </label>
                      </div>

                      <div class="mt-3 flex justify-end">
                        <button
                          class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                          type="button"
                          @click="removeDiagramGraphNode(node.id)"
                        >
                          删除节点
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-else class="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500">
                    当前 graph 还没有节点。
                  </div>
                </div>

                <div class="mt-4">
                  <div class="flex items-center justify-between gap-3">
                    <h5 class="text-xs font-semibold text-slate-200">
                      Edges
                    </h5>
                    <button
                      class="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-slate-100 transition-colors hover:bg-slate-900"
                      type="button"
                      @click="addDiagramGraphEdge"
                    >
                      Add Edge
                    </button>
                  </div>

                  <div v-if="diagramEditorGraph.edges.length" class="mt-3 space-y-3">
                    <div
                      v-for="edge in diagramEditorGraph.edges"
                      :key="edge.id"
                      class="rounded-2xl border bg-slate-950 px-3 py-3 transition-colors"
                      :class="edge.id === diagramSelectedEdgeId ? 'border-sky-500/70 ring-1 ring-sky-400/40' : 'border-slate-800'"
                      @click="selectDiagramEdge(edge.id)"
                    >
                      <div class="grid gap-3">
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">source</span>
                          <select
                            :value="edge.source"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            @change="updateDiagramGraphEdge(edge.id, { source: ($event.target as HTMLSelectElement).value })"
                          >
                            <option v-for="node in diagramEditorGraph.nodes" :key="`${edge.id}-source-${node.id}`" :value="node.id">
                              {{ node.id }}
                            </option>
                          </select>
                        </label>
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">target</span>
                          <select
                            :value="edge.target"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            @change="updateDiagramGraphEdge(edge.id, { target: ($event.target as HTMLSelectElement).value })"
                          >
                            <option v-for="node in diagramEditorGraph.nodes" :key="`${edge.id}-target-${node.id}`" :value="node.id">
                              {{ node.id }}
                            </option>
                          </select>
                        </label>
                        <label class="block space-y-1">
                          <span class="text-[11px] font-semibold text-slate-400">label</span>
                          <input
                            :value="edge.label || ''"
                            class="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 outline-none focus:border-sky-400"
                            type="text"
                            @input="updateDiagramGraphEdge(edge.id, { label: ($event.target as HTMLInputElement).value })"
                          >
                        </label>
                      </div>

                      <div class="mt-3 flex justify-end">
                        <button
                          class="rounded-full border border-rose-900/80 bg-rose-950/60 px-3 py-1.5 text-[11px] font-semibold text-rose-300 transition-colors hover:bg-rose-900/60"
                          type="button"
                          @click="removeDiagramGraphEdge(edge.id)"
                        >
                          删除边
                        </button>
                      </div>
                    </div>
                  </div>

                  <div v-else class="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950 px-3 py-4 text-center text-xs text-slate-500">
                    当前 graph 还没有边。
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <aside class="min-h-0 space-y-4 overflow-y-auto">
        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-sm font-bold text-slate-900">
            当前 Frame 预览
          </h3>
          <p class="mt-1 text-xs text-slate-500">
            导出前可先看当前选中 frame 的单独产物。
          </p>
          <div
            v-if="selectedFrameSvgMarkup"
            class="mt-4 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50"
            v-html="selectedFrameSvgMarkup"
          />
          <div
            v-else
            class="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-sm text-slate-500"
          >
            当前没有可预览的 Frame。
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-sm font-bold text-slate-900">
            Page 属性
          </h3>
          <div class="mt-4 space-y-3">
            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">Page 名称</span>
              <input
                :value="currentPage?.name || ''"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                type="text"
                @input="updateCurrentPageName(($event.target as HTMLInputElement).value)"
              >
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">背景色</span>
              <input
                :value="currentPage?.background || '#0b1220'"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-2"
                type="color"
                @input="updateCurrentPageBackground(($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-bold text-slate-900">
              Frame 属性
            </h3>
            <button
              v-if="selectedFrame"
              class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700"
              type="button"
              @click="updateSelectedFrame({ locked: !selectedFrame?.locked })"
            >
              {{ selectedFrame?.locked ? '解锁' : '锁定' }}
            </button>
          </div>

          <div v-if="selectedFrame" class="mt-4 space-y-3">
            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">Frame 名称</span>
              <input
                :value="selectedFrame.name"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                type="text"
                @input="updateSelectedFrame({ name: ($event.target as HTMLInputElement).value })"
              >
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">Frame 类型</span>
              <select
                :value="selectedFrame.kind"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                @change="updateSelectedFrame({ kind: ($event.target as HTMLSelectElement).value as DesignFrameKind })"
              >
                <option value="freeform">freeform</option>
                <option value="template">template</option>
                <option value="device_mockup">device_mockup</option>
                <option value="diagram">diagram</option>
              </select>
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">标题</span>
              <input
                :value="(selectedFrame.elements || []).find(element => element.id === 'title' || element.type === 'text')?.text || ''"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                type="text"
                @input="updateSelectedFrameText('title', ($event.target as HTMLInputElement).value)"
              >
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">副标题</span>
              <textarea
                :value="(selectedFrame.elements || []).find(element => element.id === 'subtitle' || element.type === 'caption')?.text || ''"
                class="min-h-[88px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-900"
                @input="updateSelectedFrameText('subtitle', ($event.target as HTMLTextAreaElement).value)"
              />
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">角标</span>
              <input
                :value="(selectedFrame.elements || []).find(element => element.id === 'badge' || element.type === 'badge')?.text || ''"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                type="text"
                @input="updateSelectedFrameText('badge', ($event.target as HTMLInputElement).value)"
              >
            </label>

            <div class="grid grid-cols-2 gap-3">
              <label class="block space-y-1">
                <span class="text-xs font-semibold text-slate-700">背景色</span>
                <input
                  :value="selectedFrame.themeTokens?.background || '#0f172a'"
                  class="h-10 w-full rounded-xl border border-slate-200 bg-white px-2"
                  type="color"
                  @input="updateSelectedFrame({ themeTokens: { ...(selectedFrame.themeTokens || {}), background: ($event.target as HTMLInputElement).value } })"
                >
              </label>
              <label class="block space-y-1">
                <span class="text-xs font-semibold text-slate-700">强调色</span>
                <input
                  :value="selectedFrame.themeTokens?.accent || '#38bdf8'"
                  class="h-10 w-full rounded-xl border border-slate-200 bg-white px-2"
                  type="color"
                  @input="updateSelectedFrame({ themeTokens: { ...(selectedFrame.themeTokens || {}), accent: ($event.target as HTMLInputElement).value } })"
                >
              </label>
            </div>

            <label v-if="selectedFrame.kind === 'device_mockup'" class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">设备边框</span>
              <select
                :value="selectedFrame.deviceFramePresetKey || DEFAULT_DEVICE_FRAME_KEY"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
                @change="updateSelectedFrame({ deviceFramePresetKey: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="preset in DEVICE_FRAME_PRESETS" :key="preset.key" :value="preset.key">
                  {{ preset.title }}
                </option>
              </select>
            </label>

            <label class="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center">
              <span class="text-xs font-semibold text-slate-700">替换 Frame 图片</span>
              <input class="hidden" accept="image/*" type="file" @change="handleAssetUpload">
            </label>
          </div>

          <div v-else class="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            当前 Page 还没有选中 Frame。
          </div>
        </section>

        <section
          v-if="selectedFrame && selectedFrame.kind === 'diagram'"
          class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h3 class="text-sm font-bold text-slate-900">
            Diagram 导入
          </h3>
          <p class="mt-1 text-xs text-slate-500">
            Diagram Frame 内保留专业图语义，不把边和节点打散成普通自由对象。双击画布里的 frame 可进入图编辑态。
          </p>

          <div class="mt-4 space-y-3">
            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">结构源类型</span>
              <select
                v-model="diagramSourceFormat"
                class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-slate-900"
              >
                <option value="mermaid">Mermaid</option>
                <option value="markdown_outline">Markdown Outline</option>
                <option value="ddl">DDL</option>
                <option value="architecture">Architecture Metadata</option>
              </select>
            </label>

            <label class="block space-y-1">
              <span class="text-xs font-semibold text-slate-700">源文本</span>
              <textarea
                v-model="diagramSourceText"
                class="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs leading-6 text-slate-700 outline-none focus:border-slate-900"
              />
            </label>

            <button
              class="w-full rounded-2xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
              type="button"
              @click="applyDiagramSource"
            >
              导入到当前 Diagram Frame
            </button>

            <div class="grid grid-cols-2 gap-3">
              <button
                class="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                type="button"
                @click="relayoutSelectedDiagramFrame"
              >
                当前图重新布局
              </button>
              <button
                class="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                type="button"
                @click="openFrameEditor(selectedFrame.id)"
              >
                打开编辑态
              </button>
            </div>
          </div>
        </section>

        <section class="rounded-[28px] border border-slate-200 bg-slate-950 p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-white">
                SceneDocument JSON
              </h3>
              <p class="mt-1 text-xs text-slate-400">
                AI 工具固定只读写结构化 JSON，不直接返回 SVG/XML。
              </p>
            </div>
          </div>
          <pre class="mt-3 max-h-[280px] overflow-auto rounded-2xl bg-slate-900 p-3 text-[11px] leading-5 text-slate-200">{{ sceneJson }}</pre>
          <p v-if="props.collabDrawError" class="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
            {{ props.collabDrawError }}
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>
