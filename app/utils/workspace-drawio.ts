import type {
  AiWorkspaceWorkflowDraft,
  SceneDocument,
  SceneEdge,
  SceneNode,
  WorkflowLayoutPreset,
  WorkflowSnapshot,
  WorkflowSnapshotEdge,
  WorkflowSnapshotGroup,
  WorkflowSnapshotNode,
  WorkflowSnapshotPage,
  WorkflowStylePreset,
} from '~~/shared/types/domain'
import {
  createEmptySceneDocument,
  exportArchitectureModelToMermaid,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  parseSceneDocumentString,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'

const DRAWIO_HOST = 'https://embed.diagrams.net'
const DEFAULT_PAGE_NAME = 'Page-1'
const DEFAULT_NODE_WIDTH = 220
const DEFAULT_NODE_HEIGHT = 72
const DEFAULT_DIAGRAM_WIDTH = 1440
const DEFAULT_DIAGRAM_HEIGHT = 900
const WORKFLOW_SAMPLE_LABEL_LIMIT = 6
const LEGACY_WORKFLOW_UNAVAILABLE_TITLE = '检测到旧版流程画布'
const LEGACY_WORKFLOW_UNAVAILABLE_MESSAGE = '当前流程画布存在旧版运行时快照，draw.io 无法无损自动迁移该自由绘制数据。建议基于当前业务流程重新梳理关键节点、责任角色和分支条件。'

interface DrawioRuntimeSnapshot {
  drawioXml?: string
  drawioUpdatedAt?: string
  migratedFromScene?: boolean
}

export type DrawioCollabResolveStatus = 'ready' | 'legacy_unavailable'

export interface DrawioCollabResolveResult {
  status: DrawioCollabResolveStatus
  xml: string
  title: string
  message: string
}

interface GraphFallbackNode {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  shape?: SceneNode['shape']
}

interface GraphFallbackEdge {
  id: string
  source: string
  target: string
  label?: string
  style?: SceneEdge['style']
}

interface WorkflowThemePreset {
  nodeFill: string
  nodeStroke: string
  nodeText: string
  edgeStroke: string
  groupFill: string
  groupStroke: string
  background: string
}

const WORKFLOW_THEME_PRESETS: Record<WorkflowStylePreset, WorkflowThemePreset> = {
  default: {
    nodeFill: '#ffffff',
    nodeStroke: '#cbd5e1',
    nodeText: '#0f172a',
    edgeStroke: '#64748b',
    groupFill: '#f8fafc',
    groupStroke: '#cbd5e1',
    background: '#ffffff',
  },
  minimal: {
    nodeFill: '#ffffff',
    nodeStroke: '#94a3b8',
    nodeText: '#0f172a',
    edgeStroke: '#94a3b8',
    groupFill: '#ffffff',
    groupStroke: '#cbd5e1',
    background: '#ffffff',
  },
  architecture: {
    nodeFill: '#f8fafc',
    nodeStroke: '#4f46e5',
    nodeText: '#111827',
    edgeStroke: '#334155',
    groupFill: '#eef2ff',
    groupStroke: '#818cf8',
    background: '#f8fafc',
  },
  workflow: {
    nodeFill: '#ecfeff',
    nodeStroke: '#14b8a6',
    nodeText: '#134e4a',
    edgeStroke: '#0f766e',
    groupFill: '#f0fdfa',
    groupStroke: '#2dd4bf',
    background: '#f8fffe',
  },
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function escapeXml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeXml(value: unknown): string {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeCellLabel(value: unknown): string {
  return stripHtml(decodeXml(value))
}

function normalizeMxCellId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/[^\w:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function computeStableHash(value: string): string {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function uniqueSorted(values: string[], limit = WORKFLOW_SAMPLE_LABEL_LIMIT): string[] {
  return [...new Set(values.map(item => normalizeString(item)).filter(Boolean))].slice(0, limit)
}

function parseXmlAttributes(fragment: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const matcher = /([:\w-]+)="([^"]*)"/g
  let matched = matcher.exec(fragment)
  while (matched) {
    attributes[matched[1]] = decodeXml(matched[2] || '')
    matched = matcher.exec(fragment)
  }
  return attributes
}

function parseStyleMap(style: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const token of String(style || '').split(';')) {
    const normalizedToken = token.trim()
    if (!normalizedToken)
      continue
    const equalIndex = normalizedToken.indexOf('=')
    if (equalIndex < 0) {
      map[normalizedToken] = '1'
      continue
    }
    const key = normalizedToken.slice(0, equalIndex).trim()
    const value = normalizedToken.slice(equalIndex + 1).trim()
    if (!key)
      continue
    map[key] = value
  }
  return map
}

function buildStyleSummary(style: string): string[] {
  const styleMap = parseStyleMap(style)
  const summary: string[] = []
  const shape = normalizeString(styleMap.shape || '')
  if (shape)
    summary.push(`shape:${shape}`)
  else if (String(style || '').includes('ellipse'))
    summary.push('shape:ellipse')
  else if (String(style || '').includes('rhombus'))
    summary.push('shape:rhombus')
  else if (String(style || '').includes('swimlane'))
    summary.push('shape:swimlane')
  const fillColor = normalizeString(styleMap.fillColor)
  if (fillColor)
    summary.push(`fill:${fillColor}`)
  const strokeColor = normalizeString(styleMap.strokeColor)
  if (strokeColor)
    summary.push(`stroke:${strokeColor}`)
  const edgeStyle = normalizeString(styleMap.edgeStyle)
  if (edgeStyle)
    summary.push(`edge:${edgeStyle}`)
  if (styleMap.dashed === '1')
    summary.push('dashed')
  return summary
}

function summarizePageStyles(input: {
  nodes: WorkflowSnapshotNode[]
  edges: WorkflowSnapshotEdge[]
  groups: WorkflowSnapshotGroup[]
}): WorkflowSnapshotPage['styleSummary'] {
  const shapes: string[] = []
  const fillColors: string[] = []
  const strokeColors: string[] = []
  const edgeStyles: string[] = []

  const collect = (summary: string[]) => {
    summary.forEach((token) => {
      if (token.startsWith('shape:'))
        shapes.push(token.slice('shape:'.length))
      else if (token.startsWith('fill:'))
        fillColors.push(token.slice('fill:'.length))
      else if (token.startsWith('stroke:'))
        strokeColors.push(token.slice('stroke:'.length))
      else if (token.startsWith('edge:'))
        edgeStyles.push(token.slice('edge:'.length))
      else if (token === 'dashed')
        edgeStyles.push('dashed')
    })
  }

  input.nodes.forEach(node => collect(node.styleSummary))
  input.edges.forEach(edge => collect(edge.styleSummary))
  input.groups.forEach(group => collect(group.styleSummary))

  return {
    shapes: uniqueSorted(shapes, 8),
    fillColors: uniqueSorted(fillColors, 8),
    strokeColors: uniqueSorted(strokeColors, 8),
    edgeStyles: uniqueSorted(edgeStyles, 8),
  }
}

function resolveNodeShapeStyle(node: Pick<SceneNode, 'shape'> | GraphFallbackNode | WorkflowSnapshotNode): string {
  if (node.shape === 'ellipse')
    return 'ellipse'
  if (node.shape === 'diamond')
    return 'rhombus'
  if (node.shape === 'pill')
    return 'shape=mxgraph.flowchart.terminator'
  if (node.shape === 'table')
    return 'shape=table'
  if (node.shape === 'note')
    return 'shape=note'
  return 'rounded=1'
}

function resolveNodeStyle(node: Pick<SceneNode, 'shape'> | GraphFallbackNode | WorkflowSnapshotNode, preset: WorkflowStylePreset): string {
  const theme = WORKFLOW_THEME_PRESETS[preset]
  return [
    resolveNodeShapeStyle(node),
    'whiteSpace=wrap',
    'html=1',
    'fontSize=14',
    `fontColor=${theme.nodeText}`,
    `fillColor=${theme.nodeFill}`,
    `strokeColor=${theme.nodeStroke}`,
    'strokeWidth=1.5',
    'shadow=0',
  ].join(';')
}

function resolveGroupStyle(group: WorkflowSnapshotGroup, preset: WorkflowStylePreset): string {
  const theme = WORKFLOW_THEME_PRESETS[preset]
  if (group.layoutKind === 'swimlane') {
    return [
      'swimlane',
      'rounded=1',
      'html=1',
      'whiteSpace=wrap',
      'startSize=44',
      `fillColor=${theme.groupFill}`,
      `strokeColor=${theme.groupStroke}`,
      `fontColor=${theme.nodeText}`,
      'strokeWidth=1.5',
      'shadow=0',
    ].join(';')
  }

  return [
    'rounded=1',
    'whiteSpace=wrap',
    'html=1',
    'dashed=1',
    'arcSize=12',
    `fillColor=${theme.groupFill}`,
    `strokeColor=${theme.groupStroke}`,
    `fontColor=${theme.nodeText}`,
    'strokeWidth=1.25',
    'shadow=0',
  ].join(';')
}

function resolveEdgeStyle(edge: Pick<SceneEdge, 'style'> | GraphFallbackEdge | WorkflowSnapshotEdge, preset: WorkflowStylePreset): string {
  const theme = WORKFLOW_THEME_PRESETS[preset]
  return [
    'edgeStyle=orthogonalEdgeStyle',
    'rounded=0',
    'orthogonalLoop=1',
    'jettySize=auto',
    'html=1',
    String((edge as GraphFallbackEdge).style || '').trim() === 'dashed' || edge.styleSummary?.includes('dashed')
      ? 'dashed=1'
      : 'dashed=0',
    `strokeColor=${theme.edgeStroke}`,
    'strokeWidth=1.5',
    'endArrow=block',
    'endFill=1',
  ].join(';')
}

function buildMxGraphModelXml(cells: string[], width = DEFAULT_DIAGRAM_WIDTH, height = DEFAULT_DIAGRAM_HEIGHT): string {
  return [
    `<mxGraphModel dx="1440" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">`,
    '<root>',
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
    ...cells,
    '</root>',
    '</mxGraphModel>',
  ].join('')
}

function wrapDrawioFile(innerXml: string, pageName = DEFAULT_PAGE_NAME): string {
  return [
    `<mxfile host="${DRAWIO_HOST}" modified="${new Date().toISOString()}" agent="WinLoop" version="26.0.11" type="embed" compressed="false">`,
    `<diagram id="workflow-page-1" name="${escapeXml(pageName)}">`,
    innerXml,
    '</diagram>',
    '</mxfile>',
  ].join('')
}

function buildCellsFromSceneNodes(nodes: SceneNode[], edges: SceneEdge[], preset: WorkflowStylePreset = 'default'): string[] {
  const cells: string[] = []
  const nodeIdMap = new Map<string, string>()

  nodes.forEach((node, index) => {
    const cellId = normalizeMxCellId(node.id, `node-${index + 1}`)
    nodeIdMap.set(node.id, cellId)
    cells.push([
      `<mxCell id="${escapeXml(cellId)}" value="${escapeXml(node.label || cellId)}" style="${escapeXml(resolveNodeStyle(node, preset))}" vertex="1" parent="1">`,
      `<mxGeometry x="${Number(node.x || 0)}" y="${Number(node.y || 0)}" width="${Math.max(120, Number(node.width || DEFAULT_NODE_WIDTH))}" height="${Math.max(56, Number(node.height || DEFAULT_NODE_HEIGHT))}" as="geometry" />`,
      '</mxCell>',
    ].join(''))
  })

  edges.forEach((edge, index) => {
    const sourceId = nodeIdMap.get(edge.source)
    const targetId = nodeIdMap.get(edge.target)
    if (!sourceId || !targetId)
      return

    const edgeId = normalizeMxCellId(edge.id, `edge-${index + 1}`)
    cells.push([
      `<mxCell id="${escapeXml(edgeId)}" value="${escapeXml(edge.label || '')}" style="${escapeXml(resolveEdgeStyle({ ...edge, styleSummary: [] }, preset))}" edge="1" parent="1" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">`,
      '<mxGeometry relative="1" as="geometry" />',
      '</mxCell>',
    ].join(''))
  })

  return cells
}

function buildFallbackGraphScene(document: SceneDocument): {
  nodes: GraphFallbackNode[]
  edges: GraphFallbackEdge[]
} {
  if (document.sourceModel.kind !== 'graph')
    return { nodes: [], edges: [] }

  const nodes = document.sourceModel.nodes.map((node, index) => {
    const column = index % 3
    const row = Math.floor(index / 3)
    return {
      id: normalizeMxCellId(node.id, `graph-node-${index + 1}`),
      label: normalizeString(node.label) || `节点 ${index + 1}`,
      x: 120 + column * 320,
      y: 120 + row * 180,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      shape: 'rounded',
    } satisfies GraphFallbackNode
  })

  const edges = document.sourceModel.edges.map((edge, index) => ({
    id: normalizeMxCellId(edge.id, `graph-edge-${index + 1}`),
    source: normalizeMxCellId(edge.source, `graph-source-${index + 1}`),
    target: normalizeMxCellId(edge.target, `graph-target-${index + 1}`),
    label: normalizeString(edge.label) || '',
    style: edge.style,
  }))

  return { nodes, edges }
}

function buildCellsFromFallbackGraph(nodes: GraphFallbackNode[], edges: GraphFallbackEdge[], preset: WorkflowStylePreset = 'default'): string[] {
  const cells: string[] = []
  const nodeIdSet = new Set<string>()

  nodes.forEach((node, index) => {
    const cellId = normalizeMxCellId(node.id, `node-${index + 1}`)
    nodeIdSet.add(cellId)
    cells.push([
      `<mxCell id="${escapeXml(cellId)}" value="${escapeXml(node.label || cellId)}" style="${escapeXml(resolveNodeStyle(node, preset))}" vertex="1" parent="1">`,
      `<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry" />`,
      '</mxCell>',
    ].join(''))
  })

  edges.forEach((edge, index) => {
    const sourceId = normalizeMxCellId(edge.source, `graph-source-${index + 1}`)
    const targetId = normalizeMxCellId(edge.target, `graph-target-${index + 1}`)
    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId))
      return

    const edgeId = normalizeMxCellId(edge.id, `edge-${index + 1}`)
    cells.push([
      `<mxCell id="${escapeXml(edgeId)}" value="${escapeXml(edge.label || '')}" style="${escapeXml(resolveEdgeStyle({ ...edge, styleSummary: [] }, preset))}" edge="1" parent="1" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">`,
      '<mxGeometry relative="1" as="geometry" />',
      '</mxCell>',
    ].join(''))
  })

  return cells
}

function resolveWorkflowLayoutPresetFromDirection(value: unknown): WorkflowLayoutPreset | 'unknown' {
  const normalized = normalizeString(value).toUpperCase()
  if (normalized === 'TB' || normalized === 'BT')
    return 'top_to_bottom'
  if (normalized === 'LR' || normalized === 'RL')
    return 'left_to_right'
  return 'unknown'
}

function inferPageDirection(nodes: WorkflowSnapshotNode[], edges: WorkflowSnapshotEdge[]): WorkflowLayoutPreset | 'unknown' {
  const nodeMap = new Map(nodes.map(node => [node.id, node]))
  let horizontal = 0
  let vertical = 0

  for (const edge of edges) {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (!source || !target)
      continue
    const dx = (target.x + target.width / 2) - (source.x + source.width / 2)
    const dy = (target.y + target.height / 2) - (source.y + source.height / 2)
    if (Math.abs(dx) >= Math.abs(dy))
      horizontal += 1
    else
      vertical += 1
  }

  if (horizontal === 0 && vertical === 0) {
    const spreadX = nodes.length > 1 ? Math.max(...nodes.map(node => node.x)) - Math.min(...nodes.map(node => node.x)) : 0
    const spreadY = nodes.length > 1 ? Math.max(...nodes.map(node => node.y)) - Math.min(...nodes.map(node => node.y)) : 0
    if (spreadX === 0 && spreadY === 0)
      return 'unknown'
    return spreadX >= spreadY ? 'left_to_right' : 'top_to_bottom'
  }

  return horizontal >= vertical ? 'left_to_right' : 'top_to_bottom'
}

function buildWorkflowSnapshotPage(page: Omit<WorkflowSnapshotPage, 'nodeCount' | 'edgeCount' | 'groupCount' | 'sampleLabels' | 'styleSummary' | 'direction'> & {
  direction?: WorkflowSnapshotPage['direction']
}): WorkflowSnapshotPage {
  const groups = page.groups.map((group) => {
    const childIds = group.childNodeIds.length > 0
      ? group.childNodeIds
      : page.nodes
          .filter(node => isNodeInsideGroup(node, group))
          .map(node => node.id)
    return {
      ...group,
      childNodeIds: uniqueSorted(childIds, 999),
    }
  })

  const styleSummary = summarizePageStyles({
    nodes: page.nodes,
    edges: page.edges,
    groups,
  })

  return {
    id: page.id,
    name: page.name,
    direction: page.direction && page.direction !== 'unknown'
      ? page.direction
      : inferPageDirection(page.nodes, page.edges),
    nodeCount: page.nodes.length,
    edgeCount: page.edges.length,
    groupCount: groups.length,
    sampleLabels: uniqueSorted([
      ...page.nodes.map(node => node.label),
      ...groups.map(group => group.label),
    ]),
    nodes: page.nodes,
    edges: page.edges,
    groups,
    styleSummary,
  }
}

function buildWorkflowSnapshot(input: {
  pages: WorkflowSnapshotPage[]
}): WorkflowSnapshot {
  const pages = input.pages.map(page => buildWorkflowSnapshotPage(page))
  const currentPage = pages[0] || null
  const hashPayload = pages.map(page => ({
    id: page.id,
    name: page.name,
    direction: page.direction,
    nodes: [...page.nodes]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(node => ({
        id: node.id,
        label: node.label,
        parentId: node.parentId || '',
        shape: node.shape || '',
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: Math.round(node.width),
        height: Math.round(node.height),
      })),
    edges: [...page.edges]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(edge => ({
        id: edge.id,
        label: edge.label,
        source: edge.source,
        target: edge.target,
        styleSummary: edge.styleSummary,
      })),
    groups: [...page.groups]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(group => ({
        id: group.id,
        label: group.label,
        x: Math.round(group.x),
        y: Math.round(group.y),
        width: Math.round(group.width),
        height: Math.round(group.height),
        layoutKind: group.layoutKind,
        childNodeIds: [...group.childNodeIds].sort(),
      })),
  }))

  return {
    format: 'drawio',
    hash: computeStableHash(JSON.stringify(hashPayload)),
    pageCount: pages.length,
    isSinglePage: pages.length <= 1,
    currentPageId: currentPage?.id || '',
    currentPageName: currentPage?.name || '',
    nodeCount: currentPage?.nodeCount || 0,
    edgeCount: currentPage?.edgeCount || 0,
    groupCount: currentPage?.groupCount || 0,
    sampleLabels: currentPage?.sampleLabels || [],
    styleSummary: currentPage?.styleSummary || {
      shapes: [],
      fillColors: [],
      strokeColors: [],
      edgeStyles: [],
    },
    pages,
  }
}

function isNodeInsideGroup(node: WorkflowSnapshotNode, group: WorkflowSnapshotGroup): boolean {
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  return centerX >= group.x
    && centerX <= group.x + group.width
    && centerY >= group.y
    && centerY <= group.y + group.height
}

function parseDiagramPage(diagramTag: string, diagramInnerXml: string, index: number): WorkflowSnapshotPage | null {
  const diagramAttrs = parseXmlAttributes(diagramTag)
  const rawGraphModelMatch = diagramInnerXml.match(/<mxGraphModel\b([^>]*)>([\s\S]*?)<\/mxGraphModel>/i)
  if (!rawGraphModelMatch)
    return null

  const graphModelAttrs = parseXmlAttributes(rawGraphModelMatch[1] || '')
  const rootXml = rawGraphModelMatch[2] || ''
  const cellMatcher = /<mxCell\b([^>]*?)(?:>([\s\S]*?)<\/mxCell>|\/>)/gi

  const nodes: WorkflowSnapshotNode[] = []
  const edges: WorkflowSnapshotEdge[] = []
  const groups: WorkflowSnapshotGroup[] = []
  const groupMap = new Map<string, WorkflowSnapshotGroup>()

  let matched = cellMatcher.exec(rootXml)
  while (matched) {
    const cellAttrs = parseXmlAttributes(matched[1] || '')
    const cellBody = matched[2] || ''
    const cellId = normalizeString(cellAttrs.id)
    if (!cellId || cellId === '0' || cellId === '1') {
      matched = cellMatcher.exec(rootXml)
      continue
    }

    const geometryMatch = cellBody.match(/<mxGeometry\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxGeometry>)/i)
    const geometryAttrs = geometryMatch ? parseXmlAttributes(geometryMatch[1] || '') : {}
    const style = normalizeString(cellAttrs.style)
    const styleMap = parseStyleMap(style)

    if (cellAttrs.edge === '1') {
      edges.push({
        id: cellId,
        label: normalizeCellLabel(cellAttrs.value),
        source: normalizeString(cellAttrs.source),
        target: normalizeString(cellAttrs.target),
        styleSummary: buildStyleSummary(style),
      })
      matched = cellMatcher.exec(rootXml)
      continue
    }

    if (cellAttrs.vertex === '1') {
      const shape = normalizeString(styleMap.shape || '')
      const groupLike = style.includes('swimlane')
        || style.includes('group')
        || shape === 'swimlane'
        || shape.includes('swimlane')

      if (groupLike) {
        const group: WorkflowSnapshotGroup = {
          id: cellId,
          label: normalizeCellLabel(cellAttrs.value),
          x: toFiniteNumber(geometryAttrs.x),
          y: toFiniteNumber(geometryAttrs.y),
          width: Math.max(160, toFiniteNumber(geometryAttrs.width, 280)),
          height: Math.max(120, toFiniteNumber(geometryAttrs.height, 200)),
          layoutKind: style.includes('swimlane') || shape.includes('swimlane') ? 'swimlane' : 'container',
          styleSummary: buildStyleSummary(style),
          childNodeIds: [],
        }
        groups.push(group)
        groupMap.set(group.id, group)
        matched = cellMatcher.exec(rootXml)
        continue
      }

      nodes.push({
        id: cellId,
        label: normalizeCellLabel(cellAttrs.value),
        parentId: normalizeString(cellAttrs.parent || '') || null,
        shape: shape || (style.includes('ellipse') ? 'ellipse' : (style.includes('rhombus') ? 'rhombus' : 'rounded')),
        x: toFiniteNumber(geometryAttrs.x),
        y: toFiniteNumber(geometryAttrs.y),
        width: Math.max(80, toFiniteNumber(geometryAttrs.width, DEFAULT_NODE_WIDTH)),
        height: Math.max(48, toFiniteNumber(geometryAttrs.height, DEFAULT_NODE_HEIGHT)),
        styleSummary: buildStyleSummary(style),
      })
    }

    matched = cellMatcher.exec(rootXml)
  }

  nodes.forEach((node) => {
    if (node.parentId && groupMap.has(node.parentId))
      groupMap.get(node.parentId)!.childNodeIds.push(node.id)
  })

  return buildWorkflowSnapshotPage({
    id: normalizeString(diagramAttrs.id) || `page-${index + 1}`,
    name: normalizeString(diagramAttrs.name) || `Page ${index + 1}`,
    direction: resolveWorkflowLayoutPresetFromDirection(graphModelAttrs.pageDirection || graphModelAttrs.direction),
    nodes,
    edges,
    groups,
  })
}

function buildWorkflowSnapshotFromSceneDocument(document: SceneDocument, pageName = DEFAULT_PAGE_NAME): WorkflowSnapshot {
  const groupNodes = document.sceneModel.nodes.filter(node => node.type === 'group' || normalizeString((node.metadata as Record<string, unknown>)?.layoutKind))
  const normalNodes = document.sceneModel.nodes.filter(node => !groupNodes.includes(node))

  return buildWorkflowSnapshot({
    pages: [
      {
        id: pageName ? normalizeMxCellId(pageName, 'page-1') : 'page-1',
        name: pageName || DEFAULT_PAGE_NAME,
        direction: resolveWorkflowLayoutPresetFromDirection(document.sceneModel.layout?.direction),
        nodes: normalNodes.map(node => ({
          id: normalizeMxCellId(node.id, `node-${Math.random()}`),
          label: normalizeString(node.label),
          parentId: normalizeString(node.parentId) || null,
          shape: normalizeString(node.shape),
          x: toFiniteNumber(node.x),
          y: toFiniteNumber(node.y),
          width: Math.max(80, toFiniteNumber(node.width, DEFAULT_NODE_WIDTH)),
          height: Math.max(48, toFiniteNumber(node.height, DEFAULT_NODE_HEIGHT)),
          styleSummary: buildStyleSummary(resolveNodeStyle(node, 'default')),
        })),
        edges: document.sceneModel.edges.map((edge, index) => ({
          id: normalizeMxCellId(edge.id, `edge-${index + 1}`),
          label: normalizeString(edge.label),
          source: normalizeMxCellId(edge.source, `edge-source-${index + 1}`),
          target: normalizeMxCellId(edge.target, `edge-target-${index + 1}`),
          styleSummary: buildStyleSummary(resolveEdgeStyle({ ...edge, styleSummary: [] }, 'default')),
        })),
        groups: groupNodes.map((node, index) => ({
          id: normalizeMxCellId(node.id, `group-${index + 1}`),
          label: normalizeString(node.label),
          x: toFiniteNumber(node.x),
          y: toFiniteNumber(node.y),
          width: Math.max(160, toFiniteNumber(node.width, 280)),
          height: Math.max(120, toFiniteNumber(node.height, 200)),
          layoutKind: normalizeString((node.metadata as Record<string, unknown>)?.layoutKind).toLowerCase() === 'swimlane' ? 'swimlane' : 'container',
          styleSummary: buildStyleSummary(resolveGroupStyle({
            id: node.id,
            label: normalizeString(node.label),
            x: toFiniteNumber(node.x),
            y: toFiniteNumber(node.y),
            width: Math.max(160, toFiniteNumber(node.width, 280)),
            height: Math.max(120, toFiniteNumber(node.height, 200)),
            layoutKind: normalizeString((node.metadata as Record<string, unknown>)?.layoutKind).toLowerCase() === 'swimlane' ? 'swimlane' : 'container',
            childNodeIds: Array.isArray((node.metadata as Record<string, unknown>)?.childNodeIds)
              ? ((node.metadata as Record<string, unknown>).childNodeIds as unknown[]).map(item => normalizeString(item)).filter(Boolean)
              : [],
            styleSummary: [],
          }, 'default')),
          childNodeIds: Array.isArray((node.metadata as Record<string, unknown>)?.childNodeIds)
            ? ((node.metadata as Record<string, unknown>).childNodeIds as unknown[]).map(item => normalizeString(item)).filter(Boolean)
            : [],
        })),
      },
    ],
  })
}

function buildLayeredDepthMap(nodes: WorkflowSnapshotNode[], edges: WorkflowSnapshotEdge[]): Map<string, number> {
  const indegree = new Map<string, number>()
  const depthMap = new Map<string, number>()
  const nodeIds = nodes.map(node => node.id)

  nodeIds.forEach((id) => {
    indegree.set(id, 0)
    depthMap.set(id, 0)
  })

  edges.forEach((edge) => {
    if (indegree.has(edge.target))
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
  })

  const queue = nodeIds.filter(id => (indegree.get(id) || 0) === 0)
  const fallbackQueue = queue.length > 0 ? [...queue] : [...nodeIds]

  while (fallbackQueue.length > 0) {
    const current = fallbackQueue.shift()!
    const currentDepth = depthMap.get(current) || 0
    edges
      .filter(edge => edge.source === current)
      .forEach((edge) => {
        const nextDepth = Math.max(depthMap.get(edge.target) || 0, currentDepth + 1)
        depthMap.set(edge.target, nextDepth)
        indegree.set(edge.target, Math.max(0, (indegree.get(edge.target) || 0) - 1))
        if ((indegree.get(edge.target) || 0) === 0)
          fallbackQueue.push(edge.target)
      })
  }

  return depthMap
}

function relayoutWorkflowNodes(
  nodes: WorkflowSnapshotNode[],
  edges: WorkflowSnapshotEdge[],
  layoutPreset: WorkflowLayoutPreset,
): WorkflowSnapshotNode[] {
  const depthMap = buildLayeredDepthMap(nodes, edges)
  const layers = new Map<number, WorkflowSnapshotNode[]>()

  nodes
    .slice()
    .sort((left, right) => {
      const depthDiff = (depthMap.get(left.id) || 0) - (depthMap.get(right.id) || 0)
      if (depthDiff !== 0)
        return depthDiff
      const yDiff = left.y - right.y
      if (yDiff !== 0)
        return yDiff
      return left.id.localeCompare(right.id)
    })
    .forEach((node) => {
      const depth = depthMap.get(node.id) || 0
      const bucket = layers.get(depth) || []
      bucket.push(node)
      layers.set(depth, bucket)
    })

  return nodes.map((node) => {
    const depth = depthMap.get(node.id) || 0
    const siblings = layers.get(depth) || [node]
    const index = Math.max(0, siblings.findIndex(item => item.id === node.id))

    if (layoutPreset === 'top_to_bottom') {
      return {
        ...node,
        x: 96 + index * 280,
        y: 96 + depth * 180,
      }
    }

    return {
      ...node,
      x: 96 + depth * 320,
      y: 96 + index * 180,
    }
  })
}

function buildSwimlaneGroups(nodes: WorkflowSnapshotNode[], edges: WorkflowSnapshotEdge[]): WorkflowSnapshotGroup[] {
  const depthMap = buildLayeredDepthMap(nodes, edges)
  const groups = new Map<number, WorkflowSnapshotNode[]>()

  nodes.forEach((node) => {
    const depth = depthMap.get(node.id) || 0
    const bucket = groups.get(depth) || []
    bucket.push(node)
    groups.set(depth, bucket)
  })

  return [...groups.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([depth, groupNodes]) => {
      const minX = Math.min(...groupNodes.map(node => node.x))
      const minY = Math.min(...groupNodes.map(node => node.y))
      const maxX = Math.max(...groupNodes.map(node => node.x + node.width))
      const maxY = Math.max(...groupNodes.map(node => node.y + node.height))

      return {
        id: `lane-${depth + 1}`,
        label: depth === 0 ? '起始阶段' : `阶段 ${depth + 1}`,
        x: Math.max(32, minX - 28),
        y: Math.max(32, minY - 56),
        width: Math.max(260, maxX - minX + 56),
        height: Math.max(180, maxY - minY + 96),
        layoutKind: 'swimlane',
        styleSummary: [],
        childNodeIds: groupNodes.map(node => node.id),
      } satisfies WorkflowSnapshotGroup
    })
}

function cloneWorkflowSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    ...snapshot,
    pages: snapshot.pages.map(page => ({
      ...page,
      nodes: page.nodes.map(node => ({ ...node, styleSummary: [...node.styleSummary] })),
      edges: page.edges.map(edge => ({ ...edge, styleSummary: [...edge.styleSummary] })),
      groups: page.groups.map(group => ({
        ...group,
        styleSummary: [...group.styleSummary],
        childNodeIds: [...group.childNodeIds],
      })),
      sampleLabels: [...page.sampleLabels],
      styleSummary: {
        shapes: [...page.styleSummary.shapes],
        fillColors: [...page.styleSummary.fillColors],
        strokeColors: [...page.styleSummary.strokeColors],
        edgeStyles: [...page.styleSummary.edgeStyles],
      },
    })),
    sampleLabels: [...snapshot.sampleLabels],
    styleSummary: {
      shapes: [...snapshot.styleSummary.shapes],
      fillColors: [...snapshot.styleSummary.fillColors],
      strokeColors: [...snapshot.styleSummary.strokeColors],
      edgeStyles: [...snapshot.styleSummary.edgeStyles],
    },
  }
}

function buildWorkflowSnapshotCells(
  page: WorkflowSnapshotPage,
  preset: WorkflowStylePreset,
): string[] {
  const cells: string[] = []
  const nodeIdMap = new Map<string, string>()

  page.groups.forEach((group, index) => {
    const groupId = normalizeMxCellId(group.id, `group-${index + 1}`)
    cells.push([
      `<mxCell id="${escapeXml(groupId)}" value="${escapeXml(group.label)}" style="${escapeXml(resolveGroupStyle(group, preset))}" vertex="1" parent="1">`,
      `<mxGeometry x="${Math.round(group.x)}" y="${Math.round(group.y)}" width="${Math.round(group.width)}" height="${Math.round(group.height)}" as="geometry" />`,
      '</mxCell>',
    ].join(''))
  })

  page.nodes.forEach((node, index) => {
    const nodeId = normalizeMxCellId(node.id, `node-${index + 1}`)
    nodeIdMap.set(node.id, nodeId)
    cells.push([
      `<mxCell id="${escapeXml(nodeId)}" value="${escapeXml(node.label || nodeId)}" style="${escapeXml(resolveNodeStyle(node, preset))}" vertex="1" parent="1">`,
      `<mxGeometry x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${Math.round(node.width)}" height="${Math.round(node.height)}" as="geometry" />`,
      '</mxCell>',
    ].join(''))
  })

  page.edges.forEach((edge, index) => {
    const sourceId = nodeIdMap.get(edge.source)
    const targetId = nodeIdMap.get(edge.target)
    if (!sourceId || !targetId)
      return

    const edgeId = normalizeMxCellId(edge.id, `edge-${index + 1}`)
    cells.push([
      `<mxCell id="${escapeXml(edgeId)}" value="${escapeXml(edge.label || '')}" style="${escapeXml(resolveEdgeStyle(edge, preset))}" edge="1" parent="1" source="${escapeXml(sourceId)}" target="${escapeXml(targetId)}">`,
      '<mxGeometry relative="1" as="geometry" />',
      '</mxCell>',
    ].join(''))
  })

  return cells
}

function buildDrawioXmlFromWorkflowSnapshot(
  snapshot: WorkflowSnapshot,
  options: {
    pageName?: string
    stylePreset?: WorkflowStylePreset
  } = {},
): string {
  const page = snapshot.pages[0]
  if (!page)
    return createDefaultDrawioXml(options.pageName || DEFAULT_PAGE_NAME)

  const preset = options.stylePreset || 'default'
  const cells = buildWorkflowSnapshotCells(page, preset)
  const bounds = [
    ...page.nodes.map(node => ({ x: node.x + node.width, y: node.y + node.height })),
    ...page.groups.map(group => ({ x: group.x + group.width, y: group.y + group.height })),
  ]
  const maxX = bounds.length > 0 ? Math.max(...bounds.map(item => item.x)) : DEFAULT_DIAGRAM_WIDTH
  const maxY = bounds.length > 0 ? Math.max(...bounds.map(item => item.y)) : DEFAULT_DIAGRAM_HEIGHT

  return wrapDrawioFile(
    buildMxGraphModelXml(
      cells,
      Math.max(DEFAULT_DIAGRAM_WIDTH, Math.round(maxX + 120)),
      Math.max(DEFAULT_DIAGRAM_HEIGHT, Math.round(maxY + 120)),
    ),
    options.pageName || page.name || DEFAULT_PAGE_NAME,
  )
}

function buildSceneDocumentFromWorkflowDraft(draft: AiWorkspaceWorkflowDraft): SceneDocument | null {
  const sourceText = String(draft.sourceText || '').trim()
  if (!sourceText)
    return null

  if (draft.template === 'mindmap')
    return importFromMarkdownOutline(sourceText)
  if (draft.template === 'er')
    return importFromDDL(sourceText).sceneDocument
  if (draft.template === 'architecture') {
    const imported = importArchitectureFromMetadata(sourceText)
    if (draft.architectureView) {
      const mermaid = exportArchitectureModelToMermaid(imported.architectureModel, draft.architectureView)
      return importFromMermaid(mermaid)
    }
    return imported.sceneDocument
  }
  return importFromMermaid(sourceText)
}

export function resolveDrawioEmbedBaseUrl(value = ''): string {
  const normalizedValue = normalizeString(value)
  if (!normalizedValue)
    return DRAWIO_HOST

  try {
    const url = new URL(normalizedValue)
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  catch {
    return DRAWIO_HOST
  }
}

export function buildDrawioEmbedUrl(baseUrl = ''): string {
  const url = new URL(resolveDrawioEmbedBaseUrl(baseUrl))
  url.searchParams.set('embed', '1')
  url.searchParams.set('proto', 'json')
  url.searchParams.set('spin', '1')
  url.searchParams.set('ui', 'min')
  url.searchParams.set('libraries', '1')
  url.searchParams.set('stealth', '1')
  url.searchParams.set('dark', 'auto')
  return url.toString()
}

export function resolveDrawioOrigin(baseUrl = ''): string {
  return new URL(resolveDrawioEmbedBaseUrl(baseUrl)).origin
}

export function createDefaultDrawioXml(pageName = DEFAULT_PAGE_NAME): string {
  const cells = [
    [
      '<mxCell id="start-node" value="开始梳理流程" style="shape=mxgraph.flowchart.terminator;whiteSpace=wrap;html=1;fontSize=14;fontColor=#0f172a;fillColor=#dcfce7;strokeColor=#86efac;strokeWidth=1.5;" vertex="1" parent="1">',
      '<mxGeometry x="160" y="120" width="220" height="72" as="geometry" />',
      '</mxCell>',
    ].join(''),
  ]

  return wrapDrawioFile(buildMxGraphModelXml(cells), pageName)
}

function parseJsonValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue)
  }
  catch {
    return null
  }
}

function hasMeaningfulLegacyRuntimeSnapshot(value: unknown): boolean {
  if (!isRecord(value))
    return false
  if (normalizeString(value.drawioXml))
    return false

  return Object.entries(value).some(([key, entry]) => {
    if (key === 'drawioXml' || key === 'drawioUpdatedAt' || key === 'migratedFromScene')
      return false
    if (Array.isArray(entry))
      return entry.length > 0
    if (isRecord(entry))
      return Object.keys(entry).length > 0
    return entry !== null && entry !== undefined && normalizeString(entry) !== ''
  })
}

function isBlankDrawioReadyCandidate(value: unknown): boolean {
  if (Array.isArray(value))
    return value.length === 0
  if (!isRecord(value))
    return false
  if (Object.keys(value).length === 0)
    return true
  if (hasMeaningfulLegacyRuntimeSnapshot(value.runtimeSnapshot))
    return false

  return [
    'version',
    'drawMode',
    'sceneModel',
    'sourceModel',
    'runtimeSnapshot',
    'editorEngine',
    'sourceType',
    'sceneSourceType',
    'templateKey',
  ].some(key => key in value)
}

export function resolveDrawioCollabValue(rawValue: string, pageName = DEFAULT_PAGE_NAME): DrawioCollabResolveResult {
  const normalizedRawValue = normalizeString(rawValue)
  if (!normalizedRawValue) {
    return {
      status: 'ready',
      xml: createDefaultDrawioXml(pageName),
      title: '',
      message: '',
    }
  }

  const parsedRawValue = parseJsonValue(normalizedRawValue)
  const document = parseSceneDocumentString(normalizedRawValue, {
    fallbackDrawMode: 'diagram',
    fallbackSourceType: 'manual',
  })
  const runtimeSnapshot = document.runtimeSnapshot

  if (isRecord(runtimeSnapshot)) {
    const drawioXml = normalizeString((runtimeSnapshot as DrawioRuntimeSnapshot).drawioXml)
    if (drawioXml) {
      return {
        status: 'ready',
        xml: drawioXml,
        title: '',
        message: '',
      }
    }
  }

  const sceneCells = buildCellsFromSceneNodes(document.sceneModel.nodes || [], document.sceneModel.edges || [])
  if (sceneCells.length > 0) {
    return {
      status: 'ready',
      xml: wrapDrawioFile(buildMxGraphModelXml(sceneCells), pageName),
      title: '',
      message: '',
    }
  }

  const fallbackGraph = buildFallbackGraphScene(document)
  const graphCells = buildCellsFromFallbackGraph(fallbackGraph.nodes, fallbackGraph.edges)
  if (graphCells.length > 0) {
    return {
      status: 'ready',
      xml: wrapDrawioFile(buildMxGraphModelXml(graphCells), pageName),
      title: '',
      message: '',
    }
  }

  if (isBlankDrawioReadyCandidate(parsedRawValue)) {
    return {
      status: 'ready',
      xml: createDefaultDrawioXml(pageName),
      title: '',
      message: '',
    }
  }

  if (normalizedRawValue) {
    return {
      status: 'legacy_unavailable',
      xml: '',
      title: LEGACY_WORKFLOW_UNAVAILABLE_TITLE,
      message: LEGACY_WORKFLOW_UNAVAILABLE_MESSAGE,
    }
  }

  return {
    status: 'ready',
    xml: createDefaultDrawioXml(pageName),
    title: '',
    message: '',
  }
}

export function extractDrawioXmlFromCollabValue(rawValue: string, pageName = DEFAULT_PAGE_NAME): string {
  const resolved = resolveDrawioCollabValue(rawValue, pageName)
  if (resolved.status === 'ready')
    return resolved.xml
  return createDefaultDrawioXml(pageName)
}

export function parseDrawioXmlToWorkflowSnapshot(xml: string): WorkflowSnapshot {
  const normalizedXml = normalizeString(xml) || createDefaultDrawioXml()
  const diagramMatcher = /<diagram\b([^>]*)>([\s\S]*?)<\/diagram>/gi
  const pages: WorkflowSnapshotPage[] = []

  let matched = diagramMatcher.exec(normalizedXml)
  while (matched) {
    const page = parseDiagramPage(matched[1] || '', matched[2] || '', pages.length)
    if (page)
      pages.push(page)
    matched = diagramMatcher.exec(normalizedXml)
  }

  if (pages.length === 0) {
    return buildWorkflowSnapshot({
      pages: [
        {
          id: 'page-1',
          name: DEFAULT_PAGE_NAME,
          direction: 'unknown',
          nodes: [],
          edges: [],
          groups: [],
        },
      ],
    })
  }

  return buildWorkflowSnapshot({ pages })
}

export function computeWorkflowSnapshotHash(snapshot: WorkflowSnapshot | null | undefined): string {
  if (!snapshot)
    return ''
  return buildWorkflowSnapshot({ pages: snapshot.pages }).hash
}

export function buildWorkflowDraftKey(draft: AiWorkspaceWorkflowDraft): string {
  return [
    normalizeString(draft.resourceId),
    normalizeString(draft.baseWorkflowHash),
    normalizeString(draft.action),
    normalizeString(draft.template),
    normalizeString(draft.architectureView),
    normalizeString(draft.stylePreset),
    normalizeString(draft.layoutPreset),
    computeStableHash(String(draft.sourceText || '')),
  ].join('::')
}

export function applyWorkflowStylePreset(
  snapshot: WorkflowSnapshot,
  preset: WorkflowStylePreset = 'default',
  layoutPreset: WorkflowLayoutPreset = 'left_to_right',
): WorkflowSnapshot {
  const cloned = cloneWorkflowSnapshot(snapshot)
  const page = cloned.pages[0]
  if (!page)
    return cloned

  const relayoutedNodes = relayoutWorkflowNodes(page.nodes, page.edges, layoutPreset)
  const groups = layoutPreset === 'swimlane'
    ? buildSwimlaneGroups(relayoutedNodes, page.edges)
    : page.groups.map(group => ({
        ...group,
        styleSummary: buildStyleSummary(resolveGroupStyle(group, preset)),
      }))

  const nextPage: WorkflowSnapshotPage = buildWorkflowSnapshotPage({
    ...page,
    direction: layoutPreset,
    nodes: relayoutedNodes.map(node => ({
      ...node,
      styleSummary: buildStyleSummary(resolveNodeStyle(node, preset)),
    })),
    edges: page.edges.map(edge => ({
      ...edge,
      styleSummary: buildStyleSummary(resolveEdgeStyle(edge, preset)),
    })),
    groups: groups.map(group => ({
      ...group,
      styleSummary: buildStyleSummary(resolveGroupStyle(group, preset)),
    })),
  })

  return buildWorkflowSnapshot({
    pages: [nextPage],
  })
}

export function buildDrawioXmlFromWorkflowDraft(
  draft: AiWorkspaceWorkflowDraft,
  options: {
    baseSnapshot?: WorkflowSnapshot | null
    pageName?: string
  } = {},
): string {
  const pageName = normalizeString(options.pageName || draft.resourceTitle || draft.title) || DEFAULT_PAGE_NAME

  if (draft.action === 'restyle') {
    const baseSnapshot = options.baseSnapshot
    if (!baseSnapshot)
      return createDefaultDrawioXml(pageName)
    const styledSnapshot = applyWorkflowStylePreset(baseSnapshot, draft.stylePreset, draft.layoutPreset)
    return buildDrawioXmlFromWorkflowSnapshot(styledSnapshot, {
      pageName,
      stylePreset: draft.stylePreset,
    })
  }

  const sceneDocument = buildSceneDocumentFromWorkflowDraft(draft)
  if (!sceneDocument)
    return createDefaultDrawioXml(pageName)

  const workflowSnapshot = buildWorkflowSnapshotFromSceneDocument(sceneDocument, pageName)
  const styledSnapshot = applyWorkflowStylePreset(workflowSnapshot, draft.stylePreset, draft.layoutPreset)
  return buildDrawioXmlFromWorkflowSnapshot(styledSnapshot, {
    pageName,
    stylePreset: draft.stylePreset,
  })
}

export function serializeDrawioCollabValue(xml: string): string {
  const normalizedXml = normalizeString(xml)
  const document = createEmptySceneDocument({
    drawMode: 'diagram',
    sourceType: 'manual',
    runtimeSnapshot: {
      drawioXml: normalizedXml || createDefaultDrawioXml(),
      drawioUpdatedAt: new Date().toISOString(),
      migratedFromScene: false,
    },
    metadata: {
      workflowEditor: 'drawio_embed',
    },
  })

  return serializeSceneDocument(document)
}
