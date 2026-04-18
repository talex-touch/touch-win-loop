import type {
  AiCanvasAssistSourceFormat,
  AiCanvasAssistTemplate,
  AiWorkspaceSceneDraft,
  SceneDocument,
  SceneNode,
  WorkflowArchitectureView,
  WorkflowLayoutPreset,
  WorkflowStylePreset,
} from '~~/shared/types/domain'
import {
  exportArchitectureModelToMermaid,
  exportSchemaModelToDDL,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  parseSceneDocumentString,
  relayoutSceneDocument,
  sceneDocumentFromUnknown,
  serializeSceneDocument,
  withRuntimeSnapshot,
} from '~~/shared/utils/scene-document'

interface SceneDraftTheme {
  color: string
  labelColor: string
  fill: string
  dash: string
  noteColor: string
  frameColor: string
}

const DEFAULT_SCENE_PAGE_NAME = 'AgentProto Scene'
const DEFAULT_SCENE_HASH_SEED = 'scene'

const SCENE_THEME_PRESETS: Record<WorkflowStylePreset, SceneDraftTheme> = {
  default: {
    color: 'black',
    labelColor: 'black',
    fill: 'none',
    dash: 'solid',
    noteColor: 'yellow',
    frameColor: 'grey',
  },
  minimal: {
    color: 'grey',
    labelColor: 'black',
    fill: 'none',
    dash: 'solid',
    noteColor: 'yellow',
    frameColor: 'grey',
  },
  architecture: {
    color: 'blue',
    labelColor: 'black',
    fill: 'solid',
    dash: 'solid',
    noteColor: 'light-blue',
    frameColor: 'violet',
  },
  workflow: {
    color: 'green',
    labelColor: 'black',
    fill: 'solid',
    dash: 'solid',
    noteColor: 'yellow',
    frameColor: 'green',
  },
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function computeStableHash(value: string): string {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeSceneDraftSourceFormat(template: AiCanvasAssistTemplate): AiCanvasAssistSourceFormat {
  if (template === 'mindmap')
    return 'markdown_outline'
  if (template === 'er')
    return 'ddl'
  if (template === 'architecture')
    return 'architecture'
  return 'mermaid'
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, '\\"')
}

function toMermaidNodeId(value: string, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/\W+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function buildSceneLabel(node: SceneNode): string {
  const label = normalizeString(node.label)
  const content = normalizeString(node.content)
  if (label && content)
    return `${label}\n${content}`
  return label || content || '未命名节点'
}

function sortSceneNodes(nodes: SceneNode[]): SceneNode[] {
  return [...nodes].sort((left, right) => {
    if (left.y !== right.y)
      return left.y - right.y
    if (left.x !== right.x)
      return left.x - right.x
    return normalizeString(left.label).localeCompare(normalizeString(right.label))
  })
}

function buildMermaidFromSceneDocument(document: SceneDocument): string {
  const orderedNodes = sortSceneNodes(document.sceneModel.nodes.filter(node => node.type !== 'group'))
  const nodeLines = orderedNodes.map((node, index) => {
    const nodeId = toMermaidNodeId(node.id, `node_${index + 1}`)
    const label = buildSceneLabel(node)
    const shape = node.shape === 'diamond'
      ? `{${label}}`
      : node.shape === 'pill'
        ? `([${label}])`
        : node.shape === 'note'
          ? `["${escapeMermaidLabel(label)}"]`
          : `["${escapeMermaidLabel(label)}"]`
    return `${nodeId}${shape}`
  })

  const idMap = new Map<string, string>()
  for (const [index, node] of orderedNodes.entries())
    idMap.set(node.id, toMermaidNodeId(node.id, `node_${index + 1}`))

  const edgeLines = document.sceneModel.edges.map((edge, index) => {
    const source = idMap.get(edge.source) || toMermaidNodeId(edge.source, `edge_source_${index + 1}`)
    const target = idMap.get(edge.target) || toMermaidNodeId(edge.target, `edge_target_${index + 1}`)
    const label = normalizeString(edge.label)
    return label
      ? `${source} -->|${escapeMermaidLabel(label)}| ${target}`
      : `${source} --> ${target}`
  })

  return [
    'flowchart LR',
    ...nodeLines.map(line => `  ${line}`),
    ...edgeLines.map(line => `  ${line}`),
  ].join('\n')
}

function buildMarkdownOutlineFromSceneDocument(document: SceneDocument): string {
  const orderedNodes = sortSceneNodes(document.sceneModel.nodes.filter(node => node.type !== 'group'))
  if (orderedNodes.length === 0)
    return '- 待补充结构'

  const nodeMap = new Map<string, SceneNode>()
  const childrenMap = new Map<string, string[]>()
  for (const node of orderedNodes) {
    nodeMap.set(node.id, node)
    const parentId = normalizeString(node.parentId)
    if (!parentId)
      continue
    const children = childrenMap.get(parentId) || []
    children.push(node.id)
    childrenMap.set(parentId, children)
  }

  for (const edge of document.sceneModel.edges) {
    const children = childrenMap.get(edge.source) || []
    if (!children.includes(edge.target))
      children.push(edge.target)
    childrenMap.set(edge.source, children)
  }

  const visited = new Set<string>()
  const lines: string[] = []
  const roots = orderedNodes.filter((node) => {
    const parentId = normalizeString(node.parentId)
    return !parentId || !nodeMap.has(parentId)
  })

  const visit = (nodeId: string, depth: number): void => {
    if (visited.has(nodeId))
      return
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node)
      return
    const indent = '  '.repeat(depth)
    lines.push(`${indent}- ${buildSceneLabel(node).replace(/\n+/g, ' / ')}`)
    const children = childrenMap.get(nodeId) || []
    for (const childId of children)
      visit(childId, depth + 1)
  }

  for (const root of roots)
    visit(root.id, 0)

  for (const node of orderedNodes) {
    if (!visited.has(node.id))
      visit(node.id, 0)
  }

  return lines.join('\n')
}

function normalizeDdlColumn(line: string, index: number): string {
  const normalized = normalizeString(line).replace(/^[-*]\s*/, '')
  if (!normalized)
    return `  column_${index + 1} TEXT`
  const separatorIndex = normalized.search(/[:：]/)
  if (separatorIndex > 0) {
    const columnName = normalizeString(normalized.slice(0, separatorIndex))
    const columnType = normalizeString(normalized.slice(separatorIndex + 1))
    if (/^[A-Z_][\w-]*$/i.test(columnName) && columnType)
      return `  ${columnName} ${columnType.toUpperCase()}`
  }
  return `  ${normalized.replace(/\W+/g, '_').toLowerCase() || `column_${index + 1}`} TEXT`
}

function buildPseudoDDLFromSceneDocument(document: SceneDocument): string {
  const nodes = sortSceneNodes(document.sceneModel.nodes.filter(node => node.type !== 'group'))
  if (nodes.length === 0)
    return 'CREATE TABLE example (\n  id TEXT PRIMARY KEY\n);'

  const ddlBlocks = nodes.map((node, index) => {
    const tableName = normalizeString(node.label)
      .replace(/\W+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || `table_${index + 1}`
    const contentLines = normalizeString(node.content)
      .split('\n')
      .map(item => normalizeString(item))
      .filter(Boolean)
    const columns = contentLines.length > 0
      ? contentLines.map(normalizeDdlColumn)
      : ['  id TEXT PRIMARY KEY', '  name TEXT']
    return [
      `CREATE TABLE ${tableName} (`,
      columns.join(',\n'),
      ');',
    ].join('\n')
  })

  return ddlBlocks.join('\n\n')
}

function buildSceneDocumentFromSource(input: {
  sourceText: string
  template: AiCanvasAssistTemplate
  architectureView?: WorkflowArchitectureView | null | undefined
}): SceneDocument | null {
  const sourceText = normalizeString(input.sourceText)
  if (!sourceText)
    return null

  if (input.template === 'mindmap')
    return importFromMarkdownOutline(sourceText)
  if (input.template === 'er')
    return importFromDDL(sourceText).sceneDocument
  if (input.template === 'architecture') {
    const imported = importArchitectureFromMetadata(sourceText)
    if (input.architectureView) {
      const mermaid = exportArchitectureModelToMermaid(imported.architectureModel, input.architectureView)
      return importFromMermaid(mermaid)
    }
    return imported.sceneDocument
  }
  return importFromMermaid(sourceText)
}

function buildFrameMembership(document: SceneDocument): Map<string, string> {
  const membership = new Map<string, string>()
  const groups = document.sceneModel.nodes.filter(node => node.type === 'group')
  for (const group of groups) {
    const childNodeIds = Array.isArray((group.metadata as Record<string, unknown> | undefined)?.childNodeIds)
      ? ((group.metadata as Record<string, unknown>).childNodeIds as unknown[]).map(item => normalizeString(item)).filter(Boolean)
      : []
    for (const childNodeId of childNodeIds)
      membership.set(childNodeId, group.id)
  }
  return membership
}

function resolveGeoType(node: SceneNode): string {
  if (node.shape === 'diamond')
    return 'diamond'
  if (node.shape === 'pill')
    return 'oval'
  return 'rectangle'
}

function resolveNodeText(node: SceneNode): string {
  const label = normalizeString(node.label)
  const content = normalizeString(node.content)
  return [label, content].filter(Boolean).join('\n')
}

function relayoutFreeformDocument(
  document: SceneDocument,
  layoutPreset: WorkflowLayoutPreset,
): SceneDocument {
  if (layoutPreset === 'left_to_right')
    return document

  const normalized = sceneDocumentFromUnknown(document, {
    fallbackDrawMode: 'freeform',
    fallbackSourceType: 'manual',
  })
  const sceneModel = {
    ...normalized.sceneModel,
    nodes: normalized.sceneModel.nodes.map((node) => {
      if (layoutPreset === 'top_to_bottom') {
        return {
          ...node,
          x: node.y,
          y: node.x,
        }
      }

      if (node.type === 'group') {
        return {
          ...node,
          metadata: {
            ...(node.metadata || {}),
            layoutKind: 'swimlane',
          },
        }
      }

      return node
    }),
  }

  return {
    ...normalized,
    sceneModel,
  }
}

async function createTldrawRuntimeSnapshot(input: {
  document: SceneDocument
  stylePreset: WorkflowStylePreset
  licenseKey?: string
}): Promise<Record<string, unknown> | null> {
  if (!import.meta.client)
    return null

  const tldraw = await import('tldraw')
  const container = window.document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-99999px'
  container.style.top = '-99999px'
  container.style.width = '1px'
  container.style.height = '1px'
  container.style.pointerEvents = 'none'
  window.document.body.appendChild(container)

  const store = tldraw.createTLStore({
    shapeUtils: tldraw.defaultShapeUtils,
    bindingUtils: tldraw.defaultBindingUtils,
  })
  const editor = new tldraw.Editor({
    store,
    shapeUtils: tldraw.defaultShapeUtils,
    bindingUtils: tldraw.defaultBindingUtils,
    tools: [...tldraw.defaultTools, ...tldraw.defaultShapeTools],
    getContainer: () => container,
    initialState: 'select',
    licenseKey: normalizeString(input.licenseKey) || undefined,
  })

  try {
    const currentPageId = editor.getCurrentPageId()
    const content: {
      shapes: Array<Record<string, unknown>>
      bindings: Array<Record<string, unknown>>
      rootShapeIds: string[]
      assets: Array<Record<string, unknown>>
      schema: Record<string, unknown>
    } = {
      shapes: [],
      bindings: [],
      rootShapeIds: [],
      assets: [],
      schema: editor.store.schema.serialize(),
    }
    const theme = SCENE_THEME_PRESETS[input.stylePreset] || SCENE_THEME_PRESETS.default
    const membership = buildFrameMembership(input.document)
    const frameIdMap = new Map<string, string>()
    const shapeIdMap = new Map<string, string>()
    let index = 'a1'

    const frameDefaultProps = editor.getShapeUtil('frame').getDefaultProps()
    const geoDefaultProps = editor.getShapeUtil('geo').getDefaultProps()
    const noteDefaultProps = editor.getShapeUtil('note').getDefaultProps()
    const arrowDefaultProps = editor.getShapeUtil('arrow').getDefaultProps()

    for (const group of sortSceneNodes(input.document.sceneModel.nodes.filter(node => node.type === 'group'))) {
      const frameId = tldraw.createShapeId(normalizeString(group.id) || `group_${frameIdMap.size + 1}`)
      frameIdMap.set(group.id, frameId)
      content.shapes.push({
        id: frameId,
        typeName: 'shape',
        type: 'frame',
        parentId: currentPageId,
        index,
        x: toFiniteNumber(group.x),
        y: toFiniteNumber(group.y),
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {
          layoutKind: normalizeString((group.metadata as Record<string, unknown> | undefined)?.layoutKind) || 'container',
        },
        props: {
          ...frameDefaultProps,
          name: normalizeString(group.label) || 'AgentProto 分组',
          w: Math.max(180, toFiniteNumber(group.width, 300)),
          h: Math.max(140, toFiniteNumber(group.height, 220)),
          color: theme.frameColor,
        },
      })
      content.rootShapeIds.push(frameId)
      index = tldraw.getIndexAbove(index)
    }

    for (const [nodeIndex, node] of sortSceneNodes(input.document.sceneModel.nodes.filter(node => node.type !== 'group')).entries()) {
      const shapeId = tldraw.createShapeId(normalizeString(node.id) || `shape_${nodeIndex + 1}`)
      shapeIdMap.set(node.id, shapeId)
      const parentFrameId = frameIdMap.get(membership.get(node.id) || '')
      const baseShape = {
        id: shapeId,
        typeName: 'shape',
        parentId: parentFrameId || currentPageId,
        index,
        x: toFiniteNumber(node.x),
        y: toFiniteNumber(node.y),
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
      }
      const richText = tldraw.toRichText(resolveNodeText(node))
      const width = Math.max(120, toFiniteNumber(node.width, 220))
      const height = Math.max(80, toFiniteNumber(node.height, 96))

      if (node.shape === 'note') {
        content.shapes.push({
          ...baseShape,
          type: 'note',
          props: {
            ...noteDefaultProps,
            color: theme.noteColor,
            richText,
          },
        })
      }
      else {
        content.shapes.push({
          ...baseShape,
          type: 'geo',
          props: {
            ...geoDefaultProps,
            geo: resolveGeoType(node),
            w: width,
            h: height,
            color: theme.color,
            labelColor: theme.labelColor,
            fill: theme.fill,
            dash: theme.dash,
            richText,
          },
        })
      }

      if (!parentFrameId)
        content.rootShapeIds.push(shapeId)
      index = tldraw.getIndexAbove(index)
    }

    for (const [edgeIndex, edge] of input.document.sceneModel.edges.entries()) {
      const sourceShapeId = shapeIdMap.get(edge.source)
      const targetShapeId = shapeIdMap.get(edge.target)
      const sourceNode = input.document.sceneModel.nodes.find(node => node.id === edge.source) || null
      const targetNode = input.document.sceneModel.nodes.find(node => node.id === edge.target) || null
      const startX = sourceNode ? toFiniteNumber(sourceNode.x) + Math.max(60, toFiniteNumber(sourceNode.width, 120) / 2) : 0
      const startY = sourceNode ? toFiniteNumber(sourceNode.y) + Math.max(40, toFiniteNumber(sourceNode.height, 80) / 2) : 0
      const endX = targetNode ? toFiniteNumber(targetNode.x) + Math.max(60, toFiniteNumber(targetNode.width, 120) / 2) : startX + 240
      const endY = targetNode ? toFiniteNumber(targetNode.y) + Math.max(40, toFiniteNumber(targetNode.height, 80) / 2) : startY + 120
      const arrowId = tldraw.createShapeId(normalizeString(edge.id) || `arrow_${edgeIndex + 1}`)

      content.shapes.push({
        id: arrowId,
        typeName: 'shape',
        type: 'arrow',
        parentId: currentPageId,
        index,
        x: startX,
        y: startY,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        meta: {},
        props: {
          ...arrowDefaultProps,
          color: theme.color,
          dash: edge.style === 'dashed' ? 'dashed' : theme.dash,
          start: { x: 0, y: 0 },
          end: { x: endX - startX, y: endY - startY },
          arrowheadEnd: 'arrow',
          richText: tldraw.toRichText(normalizeString(edge.label)),
        },
      })
      content.rootShapeIds.push(arrowId)
      index = tldraw.getIndexAbove(index)

      if (sourceShapeId) {
        content.bindings.push({
          id: tldraw.createBindingId(),
          typeName: 'binding',
          type: 'arrow',
          fromId: arrowId,
          toId: sourceShapeId,
          props: {
            terminal: 'start',
            snap: 'none',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isPrecise: false,
            isExact: false,
          },
          meta: {},
        })
      }

      if (targetShapeId) {
        content.bindings.push({
          id: tldraw.createBindingId(),
          typeName: 'binding',
          type: 'arrow',
          fromId: arrowId,
          toId: targetShapeId,
          props: {
            terminal: 'end',
            snap: 'none',
            normalizedAnchor: { x: 0.5, y: 0.5 },
            isPrecise: false,
            isExact: false,
          },
          meta: {},
        })
      }
    }

    editor.putContentOntoCurrentPage(content, {
      preserveIds: true,
      select: false,
    })

    const snapshot = tldraw.getSnapshot(editor.store)
    return isRecord(snapshot) && isRecord(snapshot.document)
      ? snapshot.document as Record<string, unknown>
      : snapshot as Record<string, unknown>
  }
  finally {
    editor.dispose()
    container.remove()
  }
}

export function computeSceneDocumentHash(value: string | SceneDocument | unknown): string {
  if (typeof value === 'string')
    return computeStableHash(normalizeString(value) || DEFAULT_SCENE_HASH_SEED)
  return computeStableHash(serializeSceneDocument(value))
}

export function buildSceneDraftKey(draft: AiWorkspaceSceneDraft): string {
  return [
    normalizeString(draft.resourceId),
    normalizeString(draft.baseSceneHash),
    normalizeString(draft.action),
    normalizeString(draft.template),
    normalizeString(draft.architectureView),
    normalizeString(draft.stylePreset),
    normalizeString(draft.layoutPreset),
    computeStableHash(String(draft.sourceText || '')),
  ].join('::')
}

export function buildSceneDocumentFromSceneDraft(draft: AiWorkspaceSceneDraft): SceneDocument | null {
  return buildSceneDocumentFromSource({
    sourceText: draft.sourceText,
    template: draft.template,
    architectureView: draft.architectureView,
  })
}

export function buildSceneDraftSource(input: {
  rawValue: string
  template: AiCanvasAssistTemplate
  architectureView?: WorkflowArchitectureView | null | undefined
}): {
  sourceFormat: AiCanvasAssistSourceFormat
  sourceText: string
} {
  const sceneDocument = parseSceneDocumentString(normalizeString(input.rawValue), {
    fallbackDrawMode: 'freeform',
    fallbackSourceType: 'manual',
  })
  const sourceFormat = normalizeSceneDraftSourceFormat(input.template)

  if (input.template === 'mindmap') {
    return {
      sourceFormat,
      sourceText: buildMarkdownOutlineFromSceneDocument(sceneDocument),
    }
  }

  if (input.template === 'er') {
    const sourceText = sceneDocument.sourceModel.kind === 'schema'
      ? exportSchemaModelToDDL(sceneDocument)
      : buildPseudoDDLFromSceneDocument(sceneDocument)
    return {
      sourceFormat,
      sourceText,
    }
  }

  if (input.template === 'architecture' && sceneDocument.sourceModel.kind === 'architecture') {
    return {
      sourceFormat,
      sourceText: exportArchitectureModelToMermaid(sceneDocument.sourceModel, input.architectureView || 'system_context'),
    }
  }

  return {
    sourceFormat,
    sourceText: buildMermaidFromSceneDocument(sceneDocument),
  }
}

export async function buildFreeformCollabValueFromSceneDraft(input: {
  draft: AiWorkspaceSceneDraft
  currentRawValue?: string
  licenseKey?: string
}): Promise<string | null> {
  const baseDocument = input.draft.action === 'restyle'
    ? parseSceneDocumentString(normalizeString(input.currentRawValue), {
        fallbackDrawMode: 'freeform',
        fallbackSourceType: 'manual',
      })
    : buildSceneDocumentFromSceneDraft(input.draft)

  if (!baseDocument)
    return null

  const relayoutedDocument = relayoutFreeformDocument(
    relayoutSceneDocument(baseDocument),
    input.draft.layoutPreset || 'left_to_right',
  )
  const document = sceneDocumentFromUnknown({
    ...relayoutedDocument,
    drawMode: 'freeform',
    editorEngine: 'tldraw_legacy',
    metadata: {
      ...(relayoutedDocument.metadata || {}),
      agentProtoTemplate: input.draft.template,
      agentProtoStylePreset: input.draft.stylePreset,
      agentProtoLayoutPreset: input.draft.layoutPreset,
    },
  }, {
    fallbackDrawMode: 'freeform',
    fallbackSourceType: 'manual',
  })

  const runtimeSnapshot = await createTldrawRuntimeSnapshot({
    document,
    stylePreset: input.draft.stylePreset || 'default',
    licenseKey: input.licenseKey,
  })
  if (!runtimeSnapshot)
    return null

  return serializeSceneDocument(withRuntimeSnapshot(document, runtimeSnapshot))
}

export function buildSceneDraftSummaryLabel(draft: AiWorkspaceSceneDraft): string {
  const title = normalizeString(draft.title)
  const template = normalizeString(draft.template)
  if (title)
    return title
  return `${DEFAULT_SCENE_PAGE_NAME} · ${template || 'flowchart'}`
}

export function buildSceneDraftPageName(draft: AiWorkspaceSceneDraft): string {
  return normalizeString(draft.resourceTitle || draft.title) || DEFAULT_SCENE_PAGE_NAME
}

export function ensureSceneDraftSourceFormat(template: AiCanvasAssistTemplate): AiCanvasAssistSourceFormat {
  return normalizeSceneDraftSourceFormat(template)
}
