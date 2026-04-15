import type {
  ArchitectureElementModel,
  ArchitectureImportResult,
  ArchitectureModel,
  ArchitectureRelationModel,
  CanvasLibraryBinaryAssetPayload,
  CanvasLibraryCompositionSnapshot,
  CanvasLibraryDeviceShellAssetPayload,
  CanvasLibraryFrameTemplatePayload,
  CanvasLibraryOriginMetadata,
  CanvasLibraryPageTemplatePayload,
  CompositionModel,
  DesignAssetDeviceShellMetadata,
  DesignAssetMetadata,
  DesignAssetModel,
  DesignConstraintHorizontal,
  DesignConstraintVertical,
  DesignElementModel,
  DesignElementStyle,
  DesignFrameKind,
  DesignFrameLayoutPadding,
  DesignFrameModel,
  DesignPageModel,
  DesignTemplateManifest,
  DeviceFramePreset,
  DeviceScaleMode,
  DeviceShellMode,
  DrawMode,
  DrawRuntimeSnapshot,
  GraphSourceEdge,
  GraphSourceGroup,
  GraphSourceModel,
  GraphSourceNode,
  SceneArtboard,
  SceneDocument,
  SceneEdge,
  SceneEditorEngine,
  SceneLayoutDirection,
  SceneModel,
  SceneNode,
  SceneSourceModel,
  SceneSourceType,
  SceneTemplateSummary,
  SchemaColumnModel,
  SchemaForeignKeyModel,
  SchemaImportResult,
  SchemaIndexModel,
  SchemaModel,
  SchemaTableModel,
} from '../types/domain-legacy'
import YAML from 'yaml'

const DEFAULT_ARTBOARD_WIDTH = 1600
const DEFAULT_ARTBOARD_HEIGHT = 900
const DEFAULT_COMPOSITION_PAGE_ID = 'page-1'
const DEFAULT_COMPOSITION_FRAME_ID = 'frame-1'
const MERMAID_EDGE_OPERATORS = ['-.->', '==>', '-->', '---'] as const
const ARCHITECTURE_EDGE_OPERATORS = ['-->', '->', '=>'] as const
const DESIGN_ELEMENT_SUPPORTED_STYLE_KEYS = new Set([
  'fill',
  'stroke',
  'strokeWidth',
  'opacity',
  'borderRadius',
  'shadow',
  'fontSize',
  'fontWeight',
  'color',
  'textAlign',
  'strokeLineCap',
  'strokeLineJoin',
])
type ArchitectureMermaidView = 'system_context' | 'container' | 'dependency_map'
export interface DesignRect { x: number, y: number, width: number, height: number }
interface ResolvedDesignFrameLayout {
  mode: 'absolute' | 'auto'
  direction: 'horizontal' | 'vertical'
  gap: number
  padding: DesignFrameLayoutPadding
  alignPrimary: 'start' | 'center' | 'end' | 'space-between'
  alignCross: 'start' | 'center' | 'end' | 'stretch'
}
interface ResolvedDesignFrameGrid {
  columns: number
  rows: number
  margin: number
  gutter: number
  visible: boolean
}
interface ResolvedDesignFrameExport {
  includePageOverlays: boolean
  scale: number
  format: 'svg' | 'png' | 'pdf'
}
interface ResolvedDesignFrameDevice {
  shellMode: DeviceShellMode
  shellAssetId: string
  mockupSourceFrameId: string
  screenScaleMode: DeviceScaleMode
  showSafeArea: boolean
}
interface ResolvedDeviceShellViewportRect {
  x: number
  y: number
  width: number
  height: number
}
interface ResolvedDesignAssetDeviceShell {
  presetKeys: string[]
  viewportRect: ResolvedDeviceShellViewportRect
  cornerRadius: number
  maskPath: string
  source: 'builtin' | 'uploaded'
}
export interface DesignFrameDeviceSurfaceLayout {
  shellKind: 'none' | 'builtin' | 'external'
  outerRect: DesignRect
  screenRect: DesignRect
  clipRadius: number
  preset: DeviceFramePreset
  shellAsset: DesignAssetModel | null
}
export type DesignFrameContentLayout = DesignFrameDeviceSurfaceLayout & {
  contentRect: DesignRect
  contentScale: number
}
export interface DesignFrameEditingBinding {
  displayFrame: DesignFrameModel
  ownerFrame: DesignFrameModel
  projected: boolean
}
export interface DesignFrameProjectionLayout {
  displayFrame: DesignFrameModel
  ownerFrame: DesignFrameModel
  projected: boolean
  contentRect: DesignRect
  contentScale: number
  surfaceLayout: DesignFrameDeviceSurfaceLayout | null
}
type ResolvedDesignElementConstraints = {
  horizontal: DesignConstraintHorizontal
  vertical: DesignConstraintVertical
  referenceWidth: number
  referenceHeight: number
} | null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeDesignFrameKind(
  value: unknown,
  options: {
    canonicalizeDeviceMockup?: boolean
  } = {},
): DesignFrameKind {
  const normalized = normalizeString(value) as DesignFrameKind
  if (normalized === 'device_mockup')
    return options.canonicalizeDeviceMockup ? 'device_artboard' : 'device_mockup'
  if (
    normalized === 'freeform'
    || normalized === 'template'
    || normalized === 'device_artboard'
    || normalized === 'diagram'
  ) {
    return normalized
  }
  return 'freeform'
}

export function isDeviceDesignFrameKind(value: unknown): boolean {
  const normalized = normalizeString(value)
  return normalized === 'device_mockup' || normalized === 'device_artboard'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function ensureArray<T>(value: T[] | readonly T[] | null | undefined): T[]
function ensureArray<T = unknown>(value: unknown): T[]
function ensureArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return parsed
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value, fallback)
  return parsed > 0 ? parsed : fallback
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value, fallback)
  return parsed >= 0 ? parsed : fallback
}

function sanitizeIdentifier(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function escapeXml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeSceneEditorEngine(value: unknown, fallback: SceneEditorEngine): SceneEditorEngine {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'vueflow' || normalized === 'tldraw_legacy')
    return normalized
  return fallback
}

function normalizeThemeTokens(value: unknown, fallback: Record<string, string> = {}): Record<string, string> {
  if (!isRecord(value))
    return { ...fallback }

  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = normalizeString(key)
    const normalizedValue = normalizeString(entry)
    if (!normalizedKey || !normalizedValue)
      continue
    result[normalizedKey] = normalizedValue
  }
  return Object.keys(result).length > 0 ? result : { ...fallback }
}

function createDefaultArtboard(width = DEFAULT_ARTBOARD_WIDTH, height = DEFAULT_ARTBOARD_HEIGHT, background = '#f8fafc'): SceneArtboard {
  return {
    id: 'artboard:default',
    name: 'Default',
    width,
    height,
    background,
    padding: 48,
  }
}

function normalizeSceneNode(value: unknown, index: number): SceneNode {
  const source = normalizeRecord(value)
  const id = sanitizeIdentifier(source.id, `node-${index + 1}`)
  return {
    id,
    type: normalizeString(source.type) || 'node',
    label: normalizeString(source.label) || id,
    x: toFiniteNumber(source.x, 0),
    y: toFiniteNumber(source.y, 0),
    width: toPositiveNumber(source.width, 180),
    height: toPositiveNumber(source.height, 64),
    shape: normalizeString(source.shape) as SceneNode['shape'] || 'rounded',
    parentId: normalizeString(source.parentId) || undefined,
    content: normalizeString(source.content) || undefined,
    metadata: normalizeRecord(source.metadata),
    style: normalizeRecord(source.style) as SceneNode['style'],
  }
}

function normalizeSceneEdge(value: unknown, index: number): SceneEdge {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `edge-${index + 1}`),
    source: sanitizeIdentifier(source.source, `source-${index + 1}`),
    target: sanitizeIdentifier(source.target, `target-${index + 1}`),
    label: normalizeString(source.label) || undefined,
    style: normalizeString(source.style) as SceneEdge['style'] || 'solid',
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeSceneArtboard(value: unknown, index: number): SceneArtboard {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `artboard-${index + 1}`),
    name: normalizeString(source.name) || `Artboard ${index + 1}`,
    width: toPositiveNumber(source.width, DEFAULT_ARTBOARD_WIDTH),
    height: toPositiveNumber(source.height, DEFAULT_ARTBOARD_HEIGHT),
    background: normalizeString(source.background) || '#f8fafc',
    padding: toPositiveNumber(source.padding, 48),
    metadata: normalizeRecord(source.metadata),
  }
}

function defaultGraphSourceModel(diagramType: GraphSourceModel['diagramType'] = 'flowchart'): GraphSourceModel {
  return {
    kind: 'graph',
    diagramType,
    nodes: [],
    edges: [],
    groups: [],
    metadata: {},
  }
}

function defaultSchemaModel(): SchemaModel {
  return {
    kind: 'schema',
    dialect: 'generic',
    tables: [],
    types: [],
    comments: [],
    metadata: {},
  }
}

function defaultArchitectureModel(): ArchitectureModel {
  return {
    kind: 'architecture',
    systems: [],
    services: [],
    components: [],
    databases: [],
    queues: [],
    externalDependencies: [],
    interfaces: [],
    relations: [],
    metadata: {},
  }
}

function defaultCompositionThemeTokens(): Record<string, string> {
  return {
    background: '#0f172a',
    surface: '#ffffff',
    accent: '#38bdf8',
    text: '#e2e8f0',
    muted: '#94a3b8',
  }
}

function createDefaultDesignPage(input: Partial<DesignPageModel> = {}): DesignPageModel {
  return {
    id: sanitizeIdentifier(input.id, DEFAULT_COMPOSITION_PAGE_ID),
    name: normalizeString(input.name) || 'Page 1',
    background: normalizeString(input.background) || '#0b1220',
    frameIds: ensureArray(input.frameIds).map(item => normalizeString(item)).filter(Boolean),
    viewport: {
      x: toFiniteNumber(input.viewport?.x, 0),
      y: toFiniteNumber(input.viewport?.y, 0),
      zoom: toFiniteNumber(input.viewport?.zoom, 1) || 1,
    },
    metadata: normalizeDesignPageMetadata(input.metadata),
  }
}

function normalizeDesignElementContainerRole(value: unknown): 'page_root' | 'frame_child' | undefined {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'page_root' || normalized === 'frame_child')
    return normalized
  return undefined
}

function normalizeDesignElementTextAutoSize(value: unknown): 'fixed' | 'auto_width' | 'auto_height' | undefined {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'fixed' || normalized === 'auto_width' || normalized === 'auto_height')
    return normalized
  return undefined
}

function normalizeDesignElementLayoutSizing(value: unknown): 'fixed' | 'hug' | 'fill' | undefined {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'fixed' || normalized === 'hug' || normalized === 'fill')
    return normalized
  return undefined
}

function normalizeDesignPageMetadata(value: unknown): DesignPageModel['metadata'] {
  const source = normalizeRecord(value)
  const metadata: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (key === 'clipToPage')
      continue
    metadata[key] = entry
  }
  if (typeof source.clipToPage === 'boolean')
    metadata.clipToPage = source.clipToPage
  return Object.keys(metadata).length > 0 ? metadata as DesignPageModel['metadata'] : undefined
}

function normalizeDesignElementConstraints(value: unknown): ResolvedDesignElementConstraints {
  const source = normalizeRecord(value)
  const horizontal = normalizeString(source.horizontal).toLowerCase()
  const vertical = normalizeString(source.vertical).toLowerCase()
  const normalizedHorizontal: DesignConstraintHorizontal = horizontal === 'center' || horizontal === 'right' || horizontal === 'scale'
    ? horizontal
    : 'left'
  const normalizedVertical: DesignConstraintVertical = vertical === 'center' || vertical === 'bottom' || vertical === 'scale'
    ? vertical
    : 'top'
  const referenceWidth = toPositiveNumber(source.referenceWidth, 0)
  const referenceHeight = toPositiveNumber(source.referenceHeight, 0)
  if (!referenceWidth && !referenceHeight && horizontal === '' && vertical === '')
    return null
  return {
    horizontal: normalizedHorizontal,
    vertical: normalizedVertical,
    referenceWidth,
    referenceHeight,
  }
}

function normalizeDesignFrameLayoutPadding(value: unknown): DesignFrameLayoutPadding {
  const source = normalizeRecord(value)
  const uniform = toNonNegativeNumber(source.all, Number.NaN)
  const fallback = Number.isFinite(uniform) ? uniform : 24
  return {
    top: toNonNegativeNumber(source.top, fallback),
    right: toNonNegativeNumber(source.right, fallback),
    bottom: toNonNegativeNumber(source.bottom, fallback),
    left: toNonNegativeNumber(source.left, fallback),
  }
}

export function resolveDesignFrameLayoutMetadata(value: unknown): ResolvedDesignFrameLayout {
  const source = normalizeRecord(value)
  const mode = normalizeString(source.mode).toLowerCase() === 'auto' ? 'auto' : 'absolute'
  const direction = normalizeString(source.direction).toLowerCase() === 'vertical' ? 'vertical' : 'horizontal'
  const alignPrimary = normalizeString(source.alignPrimary).toLowerCase()
  const alignCross = normalizeString(source.alignCross).toLowerCase()
  return {
    mode,
    direction,
    gap: toNonNegativeNumber(source.gap, 24),
    padding: normalizeDesignFrameLayoutPadding(source.padding),
    alignPrimary: alignPrimary === 'center' || alignPrimary === 'end' || alignPrimary === 'space-between'
      ? alignPrimary
      : 'start',
    alignCross: alignCross === 'center' || alignCross === 'end' || alignCross === 'stretch'
      ? alignCross
      : 'start',
  }
}

export function resolveDesignFrameGridMetadata(value: unknown): ResolvedDesignFrameGrid {
  const source = normalizeRecord(value)
  return {
    columns: Math.max(1, Math.round(toPositiveNumber(source.columns, 12))),
    rows: Math.max(1, Math.round(toPositiveNumber(source.rows, 8))),
    margin: toNonNegativeNumber(source.margin, 24),
    gutter: toNonNegativeNumber(source.gutter, 16),
    visible: Boolean(source.visible),
  }
}

export function resolveDesignFrameExportMetadata(value: unknown, fallbackIncludePageOverlays = true): ResolvedDesignFrameExport {
  const source = normalizeRecord(value)
  const format = normalizeString(source.format).toLowerCase()
  return {
    includePageOverlays: typeof source.includePageOverlays === 'boolean'
      ? source.includePageOverlays
      : fallbackIncludePageOverlays,
    scale: Math.max(1, toFiniteNumber(source.scale, 1)),
    format: format === 'svg' || format === 'pdf' ? format : 'png',
  }
}

function normalizeDesignAssetDeviceShellMetadata(value: unknown): DesignAssetDeviceShellMetadata | undefined {
  const source = normalizeRecord(value)
  const viewportRect = normalizeRecord(source.viewportRect)
  const presetKeys = ensureArray(source.presetKeys).map(item => normalizeString(item)).filter(Boolean)
  const result: DesignAssetDeviceShellMetadata = {}
  if (presetKeys.length > 0)
    result.presetKeys = presetKeys
  if (Object.keys(viewportRect).length > 0) {
    result.viewportRect = {
      x: toNonNegativeNumber(viewportRect.x, 0),
      y: toNonNegativeNumber(viewportRect.y, 0),
      width: toPositiveNumber(viewportRect.width, 0),
      height: toPositiveNumber(viewportRect.height, 0),
    }
  }
  const cornerRadius = toNonNegativeNumber(source.cornerRadius, Number.NaN)
  if (Number.isFinite(cornerRadius))
    result.cornerRadius = cornerRadius
  const maskPath = normalizeString(source.maskPath)
  if (maskPath)
    result.maskPath = maskPath
  const assetSource = normalizeString(source.source).toLowerCase()
  if (assetSource === 'builtin' || assetSource === 'uploaded')
    result.source = assetSource
  return Object.keys(result).length > 0 ? result : undefined
}

function normalizeDesignAssetMetadata(value: unknown): DesignAssetMetadata | undefined {
  const source = normalizeRecord(value)
  const metadata: DesignAssetMetadata = {}
  for (const [key, entry] of Object.entries(source)) {
    if (key === 'role' || key === 'deviceShell')
      continue
    metadata[key] = entry
  }
  const role = normalizeString(source.role).toLowerCase()
  if (role === 'image' || role === 'device_shell')
    metadata.role = role
  const deviceShell = normalizeDesignAssetDeviceShellMetadata(source.deviceShell)
  if (deviceShell)
    metadata.deviceShell = deviceShell
  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function resolveDesignAssetDeviceShellMetadata(value: unknown): ResolvedDesignAssetDeviceShell | null {
  const metadata = normalizeDesignAssetDeviceShellMetadata(value)
  const viewportRect = normalizeRecord(metadata?.viewportRect)
  const width = toPositiveNumber(viewportRect.width, 0)
  const height = toPositiveNumber(viewportRect.height, 0)
  if (!width || !height)
    return null
  return {
    presetKeys: ensureArray(metadata?.presetKeys).map(item => normalizeString(item)).filter(Boolean),
    viewportRect: {
      x: toNonNegativeNumber(viewportRect.x, 0),
      y: toNonNegativeNumber(viewportRect.y, 0),
      width,
      height,
    },
    cornerRadius: Math.max(0, toNonNegativeNumber(metadata?.cornerRadius, 0)),
    maskPath: normalizeString(metadata?.maskPath),
    source: metadata?.source === 'builtin' ? 'builtin' : 'uploaded',
  }
}

function resolveDesignFrameDeviceMetadata(value: unknown, kind: DesignFrameKind): ResolvedDesignFrameDevice {
  const source = normalizeRecord(value)
  const shellMode = normalizeString(source.shellMode).toLowerCase()
  const screenScaleMode = normalizeString(source.screenScaleMode).toLowerCase()
  const defaultShellMode: DeviceShellMode = kind === 'device_mockup' ? 'builtin' : 'none'
  return {
    shellMode: shellMode === 'builtin' || shellMode === 'external' || shellMode === 'none'
      ? shellMode
      : defaultShellMode,
    shellAssetId: normalizeString(source.shellAssetId),
    mockupSourceFrameId: normalizeString(source.mockupSourceFrameId),
    screenScaleMode: screenScaleMode === 'fill' ? 'fill' : 'fit',
    showSafeArea: typeof source.showSafeArea === 'boolean'
      ? source.showSafeArea
      : kind === 'device_artboard',
  }
}

function normalizeDesignElementMetadata(
  value: unknown,
  frameId?: string,
): DesignElementModel['metadata'] {
  const source = normalizeRecord(value)
  const metadata: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (key === 'containerRole' || key === 'textAutoSize' || key === 'isEditingDraft' || key === 'constraints' || key === 'layoutSizing')
      continue
    metadata[key] = entry
  }

  metadata.containerRole = normalizeDesignElementContainerRole(source.containerRole) || (normalizeString(frameId) ? 'frame_child' : 'page_root')
  const textAutoSize = normalizeDesignElementTextAutoSize(source.textAutoSize)
  if (textAutoSize)
    metadata.textAutoSize = textAutoSize
  const constraints = normalizeDesignElementConstraints(source.constraints)
  if (constraints)
    metadata.constraints = constraints
  const layoutSizing = normalizeDesignElementLayoutSizing(source.layoutSizing)
  if (layoutSizing)
    metadata.layoutSizing = layoutSizing

  return Object.keys(metadata).length > 0 ? metadata as DesignElementModel['metadata'] : undefined
}

function normalizeDesignElementStyle(value: unknown): DesignElementModel['style'] {
  const source = normalizeRecord(value)
  const style: Record<string, string | number | boolean | null> = {}
  for (const [key, entry] of Object.entries(source)) {
    const normalizedKey = normalizeString(key)
    if (!normalizedKey || !DESIGN_ELEMENT_SUPPORTED_STYLE_KEYS.has(normalizedKey))
      continue
    if (
      entry === null
      || typeof entry === 'string'
      || typeof entry === 'number'
      || typeof entry === 'boolean'
    ) {
      style[normalizedKey] = entry
    }
  }
  return Object.keys(style).length > 0 ? style as DesignElementModel['style'] : undefined
}

function normalizeDesignFrameMetadata(
  value: unknown,
  kind: DesignFrameKind,
): DesignFrameModel['metadata'] {
  const source = normalizeRecord(value)
  const metadata: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (key === 'clipContent' || key === 'exportWithVisiblePageOverlays' || key === 'layout' || key === 'grid' || key === 'export' || key === 'device')
      continue
    metadata[key] = entry
  }

  const clipFallback = kind === 'freeform' || kind === 'template' || kind === 'device_mockup' || kind === 'device_artboard'
  const includePageOverlays = typeof source.exportWithVisiblePageOverlays === 'boolean'
    ? source.exportWithVisiblePageOverlays
    : true
  metadata.clipContent = typeof source.clipContent === 'boolean'
    ? source.clipContent
    : clipFallback
  metadata.exportWithVisiblePageOverlays = includePageOverlays
  metadata.layout = resolveDesignFrameLayoutMetadata(source.layout)
  metadata.grid = resolveDesignFrameGridMetadata(source.grid)
  metadata.export = resolveDesignFrameExportMetadata(source.export, includePageOverlays)
  metadata.device = resolveDesignFrameDeviceMetadata(source.device, kind)
  return metadata as DesignFrameModel['metadata']
}

export function canDesignFrameContainElements(frame: DesignFrameModel | null | undefined): boolean {
  return Boolean(frame && (frame.kind === 'freeform' || frame.kind === 'template' || frame.kind === 'device_mockup' || frame.kind === 'device_artboard'))
}

export function canDesignFrameCreateElements(frame: DesignFrameModel | null | undefined): boolean {
  return canDesignFrameContainElements(frame)
}

export function isDesignFrameClipContentEnabled(frame: DesignFrameModel | null | undefined): boolean {
  if (!frame || !canDesignFrameContainElements(frame))
    return false
  return normalizeDesignFrameMetadata(frame.metadata, frame.kind)?.clipContent !== false
}

export function isDesignPageClipContentEnabled(page: DesignPageModel | null | undefined): boolean {
  return Boolean(page && normalizeDesignPageMetadata(page.metadata)?.clipToPage)
}

function resolveFrameExportsVisiblePageOverlays(frame: DesignFrameModel | null | undefined): boolean {
  if (!frame)
    return false
  const metadata = normalizeDesignFrameMetadata(frame.metadata, frame.kind)
  return resolveDesignFrameExportMetadata(metadata?.export, metadata?.exportWithVisiblePageOverlays !== false).includePageOverlays
}

function createDesignElement(input: Partial<DesignElementModel> = {}, fallbackId = 'element-1'): DesignElementModel {
  const points = ensureArray(input.points).map((point) => {
    const source = normalizeRecord(point)
    return {
      x: toFiniteNumber(source.x, 0),
      y: toFiniteNumber(source.y, 0),
    }
  })
  return {
    id: sanitizeIdentifier(input.id, fallbackId),
    type: (normalizeString(input.type) as DesignElementModel['type']) || 'text',
    pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
    frameId: normalizeString(input.frameId) || undefined,
    parentId: normalizeString(input.parentId) || undefined,
    x: toFiniteNumber(input.x, 0),
    y: toFiniteNumber(input.y, 0),
    width: toPositiveNumber(input.width, 120),
    height: toPositiveNumber(input.height, 40),
    rotation: toFiniteNumber(input.rotation, 0),
    zIndex: Math.max(0, Math.trunc(toFiniteNumber(input.zIndex, 0))),
    locked: Boolean(input.locked),
    hidden: Boolean(input.hidden),
    text: normalizeString(input.text) || undefined,
    imageSrc: normalizeString(input.imageSrc) || undefined,
    shapeKind: normalizeString(input.shapeKind) as DesignElementModel['shapeKind'] || undefined,
    points: points.length > 0 ? points : undefined,
    style: normalizeDesignElementStyle(input.style),
    metadata: normalizeDesignElementMetadata(input.metadata, normalizeString(input.frameId) || undefined),
  }
}

function createLegacyCompositionElements(input: {
  pageId?: string
  frameId?: string
  title?: string
  subtitle?: string
  badge?: string
  imageSrc?: string
} = {}): DesignElementModel[] {
  const elements: DesignElementModel[] = []
  const badge = normalizeString(input.badge)
  if (badge) {
    elements.push(createDesignElement({
      id: 'badge',
      type: 'badge',
      pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
      frameId: normalizeString(input.frameId) || undefined,
      x: 104,
      y: 80,
      width: Math.max(112, badge.length * 16 + 28),
      height: 38,
      text: badge,
      style: {
        fill: 'accent',
      },
    }, 'badge'))
  }

  elements.push(createDesignElement({
    id: 'title',
    type: 'text',
    pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
    frameId: normalizeString(input.frameId) || undefined,
    x: 104,
    y: 140,
    width: 760,
    height: 132,
    text: normalizeString(input.title) || '设计标题',
    style: {
      fontSize: 56,
      fontWeight: 700,
      color: 'text',
    },
  }, 'title'))
  elements.push(createDesignElement({
    id: 'subtitle',
    type: 'caption',
    pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
    frameId: normalizeString(input.frameId) || undefined,
    x: 108,
    y: 308,
    width: 640,
    height: 96,
    text: normalizeString(input.subtitle) || '补充一段简洁说明，后续可由 AI 自动填充。',
    style: {
      fontSize: 24,
      fontWeight: 500,
      color: 'muted',
    },
  }, 'subtitle'))
  elements.push(createDesignElement({
    id: 'hero-image',
    type: 'image',
    pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
    frameId: normalizeString(input.frameId) || undefined,
    x: 960,
    y: 128,
    width: 520,
    height: 640,
    imageSrc: normalizeString(input.imageSrc),
  }, 'hero-image'))
  return elements
}

function createLegacyCompositionFrame(input: {
  id?: string
  pageId?: string
  name?: string
  kind?: DesignFrameKind
  templateKey?: string
  deviceFramePresetKey?: string
  aspectRatio?: string
  slots?: Record<string, unknown>
  themeTokens?: Record<string, string>
  metadata?: Record<string, unknown>
} = {}): DesignFrameModel {
  const aspectRatio = normalizeString(input.aspectRatio) || '16:9'
  const size = resolveAspectRatioSize(aspectRatio)
  const slots = normalizeRecord(input.slots)
  const themeTokens = normalizeThemeTokens(input.themeTokens, defaultCompositionThemeTokens())
  const pageId = sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID)
  const frameId = sanitizeIdentifier(input.id, DEFAULT_COMPOSITION_FRAME_ID)
  return {
    id: frameId,
    pageId,
    name: normalizeString(input.name) || '封面 Frame',
    kind: normalizeDesignFrameKind(input.kind || 'device_mockup'),
    x: 120,
    y: 120,
    width: size.width,
    height: size.height,
    locked: false,
    templateKey: normalizeString(input.templateKey) || 'device-showcase',
    deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || 'iphone-16-pro',
    elements: createLegacyCompositionElements({
      pageId,
      frameId,
      title: normalizeString(slots.title) || undefined,
      subtitle: normalizeString(slots.subtitle) || undefined,
      badge: normalizeString(slots.badge) || undefined,
      imageSrc: normalizeString(slots.imageSrc) || undefined,
    }),
    themeTokens,
    metadata: normalizeDesignFrameMetadata(input.metadata, normalizeDesignFrameKind(input.kind || 'device_mockup')),
  }
}

function defaultCompositionModel(templateKey = 'device-showcase'): CompositionModel {
  const page = createDefaultDesignPage({
    id: DEFAULT_COMPOSITION_PAGE_ID,
  })
  return {
    kind: 'composition',
    templateKey,
    pages: [page],
    currentPageId: page.id,
    frames: [],
    elements: [],
    assets: [],
    slots: {},
    themeTokens: defaultCompositionThemeTokens(),
    layoutRules: {},
    allowedBlocks: ['headline', 'subheadline', 'image', 'badge', 'caption'],
    exportPresets: ['svg', 'png', 'pdf'],
    aspectRatio: '16:9',
    deviceFramePresetKey: 'iphone-16-pro',
    blocks: [],
    metadata: {},
  }
}

function defaultSourceModelFor(drawMode: DrawMode, templateKey = ''): SceneSourceModel {
  if (drawMode === 'schema')
    return defaultSchemaModel()
  if (drawMode === 'architecture')
    return defaultArchitectureModel()
  if (drawMode === 'composition')
    return defaultCompositionModel(templateKey || 'device-showcase')
  return defaultGraphSourceModel(drawMode === 'freeform' ? 'relationship' : 'flowchart')
}

export function normalizeDrawMode(value: unknown, fallback: DrawMode = 'freeform'): DrawMode {
  const normalized = normalizeString(value).toLowerCase()
  if (
    normalized === 'freeform'
    || normalized === 'diagram'
    || normalized === 'schema'
    || normalized === 'architecture'
    || normalized === 'composition'
  ) {
    return normalized
  }
  return fallback
}

export function normalizeSceneSourceType(value: unknown, fallback: SceneSourceType = 'manual'): SceneSourceType {
  const normalized = normalizeString(value).toLowerCase()
  if (
    normalized === 'manual'
    || normalized === 'mermaid'
    || normalized === 'markdown_outline'
    || normalized === 'ddl'
    || normalized === 'db_introspection'
    || normalized === 'repo_arch'
    || normalized === 'image_mockup'
  ) {
    return normalized
  }
  return fallback
}

function inferDrawModeFromSourceModel(value: unknown): DrawMode | '' {
  const kind = normalizeString(isRecord(value) ? value.kind : '')
  if (kind === 'schema')
    return 'schema'
  if (kind === 'architecture')
    return 'architecture'
  if (kind === 'composition')
    return 'composition'
  if (kind === 'graph')
    return 'diagram'
  return ''
}

function normalizeGraphSourceNode(value: unknown, index: number): GraphSourceNode {
  const source = normalizeRecord(value)
  const id = sanitizeIdentifier(source.id, `graph-node-${index + 1}`)
  return {
    id,
    label: normalizeString(source.label) || id,
    type: normalizeString(source.type) || 'node',
    parentId: normalizeString(source.parentId) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeGraphSourceEdge(value: unknown, index: number): GraphSourceEdge {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `graph-edge-${index + 1}`),
    source: sanitizeIdentifier(source.source, `graph-source-${index + 1}`),
    target: sanitizeIdentifier(source.target, `graph-target-${index + 1}`),
    label: normalizeString(source.label) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeGraphSourceGroup(value: unknown, index: number): GraphSourceGroup {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `group-${index + 1}`),
    label: normalizeString(source.label) || `Group ${index + 1}`,
    childNodeIds: ensureArray(source.childNodeIds).map(id => sanitizeIdentifier(id, '')).filter(Boolean),
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeGraphSourceModel(value: unknown): GraphSourceModel {
  const source = normalizeRecord(value)
  return {
    kind: 'graph',
    diagramType: normalizeString(source.diagramType) as GraphSourceModel['diagramType'] || 'flowchart',
    nodes: ensureArray(source.nodes).map(normalizeGraphSourceNode),
    edges: ensureArray(source.edges).map(normalizeGraphSourceEdge),
    groups: ensureArray(source.groups).map(normalizeGraphSourceGroup),
    sourceText: normalizeString(source.sourceText) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function resolveGraphNodeManualPosition(node: GraphSourceNode): { x: number, y: number } | null {
  const metadata = normalizeRecord(node.metadata)
  const manualPosition = normalizeRecord(metadata.manualPosition)
  const x = toFiniteNumber(manualPosition.x, Number.NaN)
  const y = toFiniteNumber(manualPosition.y, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return null
  return {
    x: Math.round(x),
    y: Math.round(y),
  }
}

function resolveGraphGroupLayoutKind(group: GraphSourceGroup): 'container' | 'swimlane' {
  const metadata = normalizeRecord(group.metadata)
  return normalizeString(metadata.layoutKind).toLowerCase() === 'swimlane' ? 'swimlane' : 'container'
}

function resolveGraphGroupManualFrame(group: GraphSourceGroup): { x: number, y: number, width: number, height: number } | null {
  const metadata = normalizeRecord(group.metadata)
  const manualPosition = normalizeRecord(metadata.manualPosition)
  const size = normalizeRecord(metadata.size)
  const x = toFiniteNumber(manualPosition.x, Number.NaN)
  const y = toFiniteNumber(manualPosition.y, Number.NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y))
    return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(260, Math.round(toFiniteNumber(size.width, 320))),
    height: Math.max(180, Math.round(toFiniteNumber(size.height, 220))),
  }
}

function normalizeSchemaColumnModel(value: unknown, index: number): SchemaColumnModel {
  const source = normalizeRecord(value)
  return {
    name: normalizeString(source.name) || `column_${index + 1}`,
    type: normalizeString(source.type) || 'text',
    nullable: Boolean(source.nullable),
    defaultValue: normalizeString(source.defaultValue) || undefined,
    comment: normalizeString(source.comment) || undefined,
    isPrimaryKey: Boolean(source.isPrimaryKey),
    referencesTable: normalizeString(source.referencesTable) || undefined,
    referencesColumn: normalizeString(source.referencesColumn) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeSchemaForeignKeyModel(value: unknown): SchemaForeignKeyModel {
  const source = normalizeRecord(value)
  return {
    name: normalizeString(source.name) || undefined,
    columns: ensureArray(source.columns).map(column => normalizeString(column)).filter(Boolean),
    referencedTable: normalizeString(source.referencedTable),
    referencedColumns: ensureArray(source.referencedColumns).map(column => normalizeString(column)).filter(Boolean),
    onDelete: normalizeString(source.onDelete) || undefined,
    onUpdate: normalizeString(source.onUpdate) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeSchemaIndexModel(value: unknown, index: number): SchemaIndexModel {
  const source = normalizeRecord(value)
  return {
    name: normalizeString(source.name) || `idx_${index + 1}`,
    columns: ensureArray(source.columns).map(column => normalizeString(column)).filter(Boolean),
    unique: Boolean(source.unique),
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeSchemaTableModel(value: unknown, index: number): SchemaTableModel {
  const source = normalizeRecord(value)
  return {
    name: normalizeString(source.name) || `table_${index + 1}`,
    schemaName: normalizeString(source.schemaName) || undefined,
    columns: ensureArray(source.columns).map(normalizeSchemaColumnModel),
    primaryKeys: ensureArray(source.primaryKeys).map(key => normalizeString(key)).filter(Boolean),
    foreignKeys: ensureArray(source.foreignKeys).map(normalizeSchemaForeignKeyModel),
    indexes: ensureArray(source.indexes).map(normalizeSchemaIndexModel),
    comment: normalizeString(source.comment) || undefined,
    domain: normalizeString(source.domain) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeSchemaModel(value: unknown): SchemaModel {
  const source = normalizeRecord(value)
  return {
    kind: 'schema',
    dialect: normalizeString(source.dialect) as SchemaModel['dialect'] || 'generic',
    tables: ensureArray(source.tables).map(normalizeSchemaTableModel),
    types: ensureArray(source.types).map((entry, index) => {
      const item = normalizeRecord(entry)
      return {
        name: normalizeString(item.name) || `type_${index + 1}`,
        kind: normalizeString(item.kind) as NonNullable<SchemaModel['types']>[number]['kind'] || 'custom',
        values: ensureArray(item.values).map(value => normalizeString(value)).filter(Boolean),
        comment: normalizeString(item.comment) || undefined,
        metadata: normalizeRecord(item.metadata),
      }
    }),
    comments: ensureArray(source.comments).map(entry => normalizeString(entry)).filter(Boolean),
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeArchitectureElementModel(value: unknown, index: number, prefix: string): ArchitectureElementModel {
  const source = normalizeRecord(value)
  const id = sanitizeIdentifier(source.id, `${prefix}-${index + 1}`)
  return {
    id,
    label: normalizeString(source.label) || id,
    type: normalizeString(source.type) || prefix,
    description: normalizeString(source.description) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeArchitectureRelationModel(value: unknown, index: number): ArchitectureRelationModel {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `relation-${index + 1}`),
    source: sanitizeIdentifier(source.source, `relation-source-${index + 1}`),
    target: sanitizeIdentifier(source.target, `relation-target-${index + 1}`),
    label: normalizeString(source.label) || undefined,
    protocol: normalizeString(source.protocol) || undefined,
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeArchitectureModel(value: unknown): ArchitectureModel {
  const source = normalizeRecord(value)
  return {
    kind: 'architecture',
    systems: ensureArray(source.systems).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'system')),
    services: ensureArray(source.services).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'service')),
    components: ensureArray(source.components).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'component')),
    databases: ensureArray(source.databases).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'database')),
    queues: ensureArray(source.queues).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'queue')),
    externalDependencies: ensureArray(source.externalDependencies).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'external')),
    interfaces: ensureArray(source.interfaces).map((entry, index) => {
      const item = normalizeArchitectureElementModel(entry, index, 'interface')
      return {
        ...item,
        protocol: normalizeString(normalizeRecord(entry).protocol) || undefined,
      }
    }),
    relations: ensureArray(source.relations).map(normalizeArchitectureRelationModel),
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeDesignPageModel(value: unknown, index: number): DesignPageModel {
  const source = normalizeRecord(value)
  return createDefaultDesignPage({
    id: sanitizeIdentifier(source.id, `page-${index + 1}`),
    name: normalizeString(source.name) || `Page ${index + 1}`,
    background: normalizeString(source.background) || '#0b1220',
    frameIds: ensureArray(source.frameIds).map(item => normalizeString(item)).filter(Boolean),
    viewport: {
      x: toFiniteNumber(normalizeRecord(source.viewport).x, 0),
      y: toFiniteNumber(normalizeRecord(source.viewport).y, 0),
      zoom: toFiniteNumber(normalizeRecord(source.viewport).zoom, 1) || 1,
    },
    metadata: normalizeRecord(source.metadata),
  })
}

function normalizeDesignAssetModel(value: unknown, index: number): DesignAssetModel {
  const source = normalizeRecord(value)
  return {
    id: sanitizeIdentifier(source.id, `asset-${index + 1}`),
    type: 'image',
    name: normalizeString(source.name) || `asset-${index + 1}`,
    src: normalizeString(source.src || source.url || source.imageSrc),
    mimeType: normalizeString(source.mimeType) || undefined,
    width: toPositiveNumber(source.width, 0) || undefined,
    height: toPositiveNumber(source.height, 0) || undefined,
    metadata: normalizeDesignAssetMetadata(source.metadata),
  }
}

function normalizeDesignFrameModel(value: unknown, index: number, fallbackPageId: string): DesignFrameModel {
  const source = normalizeRecord(value)
  const pageId = sanitizeIdentifier(source.pageId, fallbackPageId)
  const frameId = sanitizeIdentifier(source.id, `frame-${index + 1}`)
  const kind = normalizeDesignFrameKind(source.kind)
  return {
    id: frameId,
    pageId,
    name: normalizeString(source.name) || `Frame ${index + 1}`,
    kind,
    x: toFiniteNumber(source.x, 120),
    y: toFiniteNumber(source.y, 120),
    width: toPositiveNumber(source.width, DEFAULT_ARTBOARD_WIDTH),
    height: toPositiveNumber(source.height, DEFAULT_ARTBOARD_HEIGHT),
    locked: Boolean(source.locked),
    templateKey: normalizeString(source.templateKey) || undefined,
    deviceFramePresetKey: normalizeString(source.deviceFramePresetKey) || undefined,
    elements: ensureArray(source.elements).map((entry, elementIndex) => {
      const element = normalizeRecord(entry)
      return createDesignElement({
        ...element,
        pageId: pageId || normalizeString(element.pageId) || DEFAULT_COMPOSITION_PAGE_ID,
        frameId: frameId || normalizeString(element.frameId) || undefined,
        zIndex: toFiniteNumber(element.zIndex, elementIndex),
      }, `frame-${index + 1}-element-${elementIndex + 1}`)
    }),
    embeddedScene: source.embeddedScene
      ? sceneDocumentFromUnknown(source.embeddedScene, {
          fallbackDrawMode: 'diagram',
          fallbackSourceType: 'manual',
        })
      : undefined,
    themeTokens: normalizeThemeTokens(source.themeTokens),
    metadata: normalizeDesignFrameMetadata(source.metadata, kind),
  }
}

function normalizeCompositionElementModel(
  value: unknown,
  index: number,
  options: {
    fallbackPageId: string
    fallbackFrameId?: string
  },
): DesignElementModel {
  const source = normalizeRecord(value)
  const fallbackFrameId = normalizeString(options.fallbackFrameId)
  return createDesignElement({
    ...source,
    pageId: sanitizeIdentifier(source.pageId, options.fallbackPageId),
    frameId: fallbackFrameId || normalizeString(source.frameId) || undefined,
    zIndex: toFiniteNumber(source.zIndex, index),
  }, `element-${index + 1}`)
}

function syncCompositionFrameLegacyElements(composition: CompositionModel): CompositionModel {
  const elementBucketByFrameId = new Map<string, DesignElementModel[]>()
  ensureArray(composition.elements).forEach((element) => {
    const frameId = normalizeString(element.frameId)
    if (!frameId)
      return
    const bucket = elementBucketByFrameId.get(frameId) || []
    bucket.push(createDesignElement(element, element.id))
    elementBucketByFrameId.set(frameId, bucket)
  })

  return {
    ...composition,
    frames: ensureArray(composition.frames).map((frame) => {
      return {
        ...frame,
        elements: (elementBucketByFrameId.get(frame.id) || [])
          .sort((left, right) => left.zIndex - right.zIndex)
          .map(element => createDesignElement(element, element.id)),
      }
    }),
  }
}

function normalizeCompositionModel(value: unknown, templateKey = ''): CompositionModel {
  const source = normalizeRecord(value)
  const normalizedTemplateKey = normalizeString(source.templateKey) || templateKey || 'device-showcase'
  const defaultModel = defaultCompositionModel(normalizedTemplateKey)
  const legacySlots = normalizeRecord(source.slots)
  const pages = ensureArray(source.pages).map(normalizeDesignPageModel)
  const frames = ensureArray(source.frames).map((entry, index) => normalizeDesignFrameModel(entry, index, pages[0]?.id || DEFAULT_COMPOSITION_PAGE_ID))
  const assets = ensureArray(source.assets).map(normalizeDesignAssetModel)
  const migratedFrame = pages.length === 0 || frames.length === 0
    ? createLegacyCompositionFrame({
        id: DEFAULT_COMPOSITION_FRAME_ID,
        pageId: DEFAULT_COMPOSITION_PAGE_ID,
        name: '封面 Frame',
        kind: normalizeString(source.deviceFramePresetKey || source.templateKey) ? 'device_mockup' : 'template',
        templateKey: normalizedTemplateKey,
        deviceFramePresetKey: normalizeString(source.deviceFramePresetKey) || defaultModel.deviceFramePresetKey,
        aspectRatio: normalizeString(source.aspectRatio) || defaultModel.aspectRatio,
        slots: legacySlots,
        themeTokens: normalizeThemeTokens(source.themeTokens, defaultModel.themeTokens),
        metadata: {
          migratedFromLegacyComposition: true,
        },
      })
    : null
  const normalizedPages = pages.length > 0
    ? pages
    : [createDefaultDesignPage({
        id: DEFAULT_COMPOSITION_PAGE_ID,
        frameIds: migratedFrame ? [migratedFrame.id] : [],
        background: normalizeString(source.themeTokens && normalizeRecord(source.themeTokens).background) || defaultModel.themeTokens?.background || '#0b1220',
      })]
  const normalizedFrames = frames.length > 0 ? frames : migratedFrame ? [migratedFrame] : defaultModel.frames || []
  const pageFrameIds = new Map<string, string[]>()
  for (const frame of normalizedFrames) {
    const existing = pageFrameIds.get(frame.pageId) || []
    existing.push(frame.id)
    pageFrameIds.set(frame.pageId, existing)
  }
  const normalizedPageModels = normalizedPages.map((page) => {
    const computedFrameIds = pageFrameIds.get(page.id) || []
    return {
      ...page,
      frameIds: page.frameIds && page.frameIds.length > 0 ? page.frameIds : computedFrameIds,
    }
  })
  const currentPageId = normalizeString(source.currentPageId) || normalizedPageModels[0]?.id || DEFAULT_COMPOSITION_PAGE_ID
  const normalizedElements = ensureArray(source.elements).map((entry, index) => {
    return normalizeCompositionElementModel(entry, index, {
      fallbackPageId: normalizedPageModels[0]?.id || DEFAULT_COMPOSITION_PAGE_ID,
    })
  })
  const migratedLegacyFrameElements = normalizedFrames.flatMap((frame) => {
    return ensureArray(frame.elements).map((element, index) => {
      return createDesignElement({
        ...element,
        pageId: normalizeString(element.pageId) || frame.pageId,
        frameId: frame.id,
        zIndex: toFiniteNumber(element.zIndex, index),
      }, `${frame.id}-element-${index + 1}`)
    })
  })
  const composition: CompositionModel = {
    kind: 'composition',
    templateKey: normalizedTemplateKey,
    pages: normalizedPageModels,
    currentPageId,
    frames: normalizedFrames,
    elements: normalizedElements.length > 0 ? normalizedElements : migratedLegacyFrameElements,
    assets,
    slots: legacySlots,
    themeTokens: normalizeThemeTokens(source.themeTokens, defaultCompositionModel(templateKey).themeTokens),
    layoutRules: normalizeRecord(source.layoutRules),
    allowedBlocks: ensureArray(source.allowedBlocks).map(entry => normalizeString(entry)).filter(Boolean),
    exportPresets: ensureArray(source.exportPresets).map(entry => normalizeString(entry)).filter(Boolean),
    aspectRatio: normalizeString(source.aspectRatio) || '16:9',
    deviceFramePresetKey: normalizeString(source.deviceFramePresetKey) || 'iphone-16-pro',
    blocks: ensureArray(source.blocks).map((entry, index) => {
      const item = normalizeRecord(entry)
      return {
        id: sanitizeIdentifier(item.id, `block-${index + 1}`),
        type: normalizeString(item.type) as NonNullable<CompositionModel['blocks']>[number]['type'] || 'headline',
        title: normalizeString(item.title) || undefined,
        body: normalizeString(item.body) || undefined,
        imageSrc: normalizeString(item.imageSrc) || undefined,
        metadata: normalizeRecord(item.metadata),
      }
    }),
    metadata: normalizeRecord(source.metadata),
  }

  return syncCompositionFrameLegacyElements(composition)
}

function normalizeSourceModel(value: unknown, drawMode: DrawMode, templateKey = ''): SceneSourceModel {
  const kind = normalizeString(isRecord(value) ? value.kind : '')
  if (kind === 'schema')
    return normalizeSchemaModel(value)
  if (kind === 'architecture')
    return normalizeArchitectureModel(value)
  if (kind === 'composition')
    return normalizeCompositionModel(value, templateKey)
  if (kind === 'graph')
    return normalizeGraphSourceModel(value)
  return defaultSourceModelFor(drawMode, templateKey)
}

function normalizeSceneModel(value: unknown): SceneModel {
  const source = normalizeRecord(value)
  return {
    nodes: ensureArray(source.nodes).map(normalizeSceneNode),
    edges: ensureArray(source.edges).map(normalizeSceneEdge),
    artboards: ensureArray(source.artboards).map(normalizeSceneArtboard),
    layout: {
      engine: normalizeString(normalizeRecord(source.layout).engine) || undefined,
      direction: normalizeString(normalizeRecord(source.layout).direction) as SceneLayoutDirection || undefined,
      compact: Boolean(normalizeRecord(source.layout).compact),
    },
    themeTokens: normalizeThemeTokens(source.themeTokens),
    metadata: normalizeRecord(source.metadata),
  }
}

function looksLikeSceneDocument(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (
    'drawMode' in value
    || 'sourceType' in value
    || 'sourceModel' in value
    || 'sceneModel' in value
    || 'runtimeSnapshot' in value
  )
}

function normalizeRuntimeSnapshot(value: unknown): DrawRuntimeSnapshot | null {
  if (Array.isArray(value))
    return value
  if (isRecord(value))
    return value
  return null
}

export function createEmptySceneDocument(input: {
  drawMode?: DrawMode
  sourceType?: SceneSourceType
  templateKey?: string
  editorEngine?: SceneEditorEngine
  runtimeSnapshot?: DrawRuntimeSnapshot | null
  metadata?: Record<string, unknown>
} = {}): SceneDocument {
  const drawMode = normalizeDrawMode(input.drawMode, 'freeform')
  const templateKey = normalizeString(input.templateKey)
  const runtimeSnapshot = normalizeRuntimeSnapshot(input.runtimeSnapshot)
  const defaultEditorEngine: SceneEditorEngine = drawMode === 'freeform' || runtimeSnapshot ? 'tldraw_legacy' : 'vueflow'
  return {
    version: 1,
    drawMode,
    sourceType: normalizeSceneSourceType(input.sourceType, 'manual'),
    templateKey: templateKey || undefined,
    editorEngine: normalizeSceneEditorEngine(input.editorEngine, defaultEditorEngine),
    sourceModel: defaultSourceModelFor(drawMode, templateKey),
    sceneModel: {
      nodes: [],
      edges: [],
      artboards: [createDefaultArtboard()],
      layout: {
        engine: drawMode === 'composition' ? 'template' : 'fallback',
        direction: drawMode === 'composition' ? 'none' : 'LR',
        compact: false,
      },
      themeTokens: drawMode === 'composition'
        ? defaultCompositionModel(templateKey).themeTokens
        : {
            background: '#f8fafc',
            surface: '#ffffff',
            accent: '#2563eb',
            text: '#0f172a',
            muted: '#64748b',
          },
      metadata: {},
    },
    runtimeSnapshot,
    metadata: normalizeRecord(input.metadata),
  }
}

export function sceneDocumentFromUnknown(
  value: unknown,
  options: {
    fallbackDrawMode?: DrawMode
    fallbackSourceType?: SceneSourceType
  } = {},
): SceneDocument {
  if (!looksLikeSceneDocument(value)) {
    const legacy = createEmptySceneDocument({
      drawMode: options.fallbackDrawMode || 'freeform',
      sourceType: options.fallbackSourceType || 'manual',
      editorEngine: 'tldraw_legacy',
    })
    const runtimeSnapshot = normalizeRuntimeSnapshot(value)
    return runtimeSnapshot
      ? {
          ...legacy,
          runtimeSnapshot,
          metadata: {
            ...legacy.metadata,
            migratedFromLegacyDraw: true,
          },
        }
      : legacy
  }

  const drawMode = normalizeDrawMode(
    value.drawMode,
    inferDrawModeFromSourceModel(value.sourceModel) || options.fallbackDrawMode || 'freeform',
  )
  const templateKey = normalizeString(value.templateKey)
  const sourceModel = normalizeSourceModel(value.sourceModel, drawMode, templateKey)
  const sceneModel = normalizeSceneModel(value.sceneModel)
  const runtimeSnapshot = normalizeRuntimeSnapshot(value.runtimeSnapshot)
  const defaultEditorEngine: SceneEditorEngine = runtimeSnapshot || drawMode === 'freeform' ? 'tldraw_legacy' : 'vueflow'

  return {
    version: Math.max(1, Math.trunc(toFiniteNumber(value.version, 1))),
    drawMode,
    sourceType: normalizeSceneSourceType(value.sourceType || value.sceneSourceType, options.fallbackSourceType || 'manual'),
    templateKey: templateKey || (sourceModel.kind === 'composition' ? sourceModel.templateKey : undefined),
    editorEngine: normalizeSceneEditorEngine(value.editorEngine, defaultEditorEngine),
    sourceModel,
    sceneModel: {
      ...sceneModel,
      artboards: sceneModel.artboards && sceneModel.artboards.length > 0
        ? sceneModel.artboards
        : [createDefaultArtboard()],
    },
    runtimeSnapshot,
    metadata: normalizeRecord(value.metadata),
    createdAt: normalizeString(value.createdAt) || undefined,
    updatedAt: normalizeString(value.updatedAt) || undefined,
  }
}

export function parseSceneDocumentString(
  rawValue: string,
  options: {
    fallbackDrawMode?: DrawMode
    fallbackSourceType?: SceneSourceType
  } = {},
): SceneDocument {
  const normalized = String(rawValue || '').trim()
  if (!normalized) {
    return createEmptySceneDocument({
      drawMode: options.fallbackDrawMode || 'freeform',
      sourceType: options.fallbackSourceType || 'manual',
    })
  }

  try {
    return sceneDocumentFromUnknown(JSON.parse(normalized), options)
  }
  catch {
    return createEmptySceneDocument({
      drawMode: options.fallbackDrawMode || 'freeform',
      sourceType: options.fallbackSourceType || 'manual',
    })
  }
}

export function canonicalizeSceneDocumentForPersistence(document: SceneDocument | unknown): SceneDocument {
  const normalized = sceneDocumentFromUnknown(document)
  if (normalized.sourceModel.kind !== 'composition')
    return normalized

  return relayoutSceneDocument({
    ...normalized,
    sourceModel: {
      ...normalized.sourceModel,
      frames: ensureArray(normalized.sourceModel.frames).map((frame) => {
        if (frame.kind !== 'device_mockup')
          return frame
        return {
          ...frame,
          kind: 'device_artboard',
        }
      }),
    },
  })
}

export function serializeSceneDocument(document: SceneDocument | unknown): string {
  return JSON.stringify(canonicalizeSceneDocumentForPersistence(document), null, 2)
}

export function withRuntimeSnapshot(
  document: SceneDocument | unknown,
  runtimeSnapshot: DrawRuntimeSnapshot | null | undefined,
): SceneDocument {
  return {
    ...sceneDocumentFromUnknown(document),
    runtimeSnapshot: normalizeRuntimeSnapshot(runtimeSnapshot),
  }
}

export function extractRuntimeSnapshot(value: SceneDocument | unknown): DrawRuntimeSnapshot | null {
  return sceneDocumentFromUnknown(value).runtimeSnapshot || null
}

export const DEVICE_FRAME_PRESETS: DeviceFramePreset[] = [
  {
    key: 'iphone-17-pro',
    title: 'iPhone 17 & 17 Pro',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 402,
    screenHeight: 874,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-17-pro-max',
    title: 'iPhone 17 Pro Max',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 440,
    screenHeight: 956,
    framePadding: 18,
    bezelRadius: 58,
    screenRadius: 44,
    background: '#020617',
    shadow: '0 38px 98px rgba(2, 6, 23, 0.34)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-16',
    title: 'iPhone 16',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 393,
    screenHeight: 852,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-16-pro',
    title: 'iPhone 16 Pro',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 390,
    screenHeight: 844,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
    builtinShellKey: 'iphone-16-pro-shell',
  },
  {
    key: 'iphone-16-pro-max',
    title: 'iPhone 16 Pro Max',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 440,
    screenHeight: 956,
    framePadding: 18,
    bezelRadius: 58,
    screenRadius: 44,
    background: '#020617',
    shadow: '0 38px 98px rgba(2, 6, 23, 0.34)',
    builtinShellKey: 'iphone-16-pro-max-shell',
  },
  {
    key: 'iphone-16-plus',
    title: 'iPhone 16 Plus',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 430,
    screenHeight: 932,
    framePadding: 18,
    bezelRadius: 58,
    screenRadius: 44,
    background: '#020617',
    shadow: '0 38px 98px rgba(2, 6, 23, 0.34)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-14-15-pro-max',
    title: 'iPhone 14 & 15 Pro Max',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 430,
    screenHeight: 932,
    framePadding: 18,
    bezelRadius: 58,
    screenRadius: 44,
    background: '#020617',
    shadow: '0 38px 98px rgba(2, 6, 23, 0.34)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-14-15-pro',
    title: 'iPhone 14 & 15 Pro',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 393,
    screenHeight: 852,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
    builtinShellKey: 'iphone-14-15-pro-shell',
  },
  {
    key: 'iphone-13-14',
    title: 'iPhone 13 & 14',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 390,
    screenHeight: 844,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-14-plus',
    title: 'iPhone 14 Plus',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 428,
    screenHeight: 926,
    framePadding: 18,
    bezelRadius: 58,
    screenRadius: 44,
    background: '#020617',
    shadow: '0 38px 98px rgba(2, 6, 23, 0.34)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-13-mini',
    title: 'iPhone 13 mini',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 375,
    screenHeight: 812,
    framePadding: 18,
    bezelRadius: 48,
    screenRadius: 38,
    background: '#020617',
    shadow: '0 34px 92px rgba(2, 6, 23, 0.3)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'iphone-se',
    title: 'iPhone SE',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 320,
    screenHeight: 568,
    framePadding: 16,
    bezelRadius: 38,
    screenRadius: 22,
    background: '#020617',
    shadow: '0 28px 74px rgba(2, 6, 23, 0.28)',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'android-phone',
    title: '安卓手机',
    group: 'Android Phone',
    platform: 'android',
    deviceFamily: 'phone',
    screenWidth: 360,
    screenHeight: 780,
    framePadding: 16,
    bezelRadius: 42,
    screenRadius: 30,
    background: '#111827',
    shadow: '0 32px 84px rgba(15, 23, 42, 0.3)',
    builtinShellKey: 'android-phone-shell',
  },
  {
    key: 'ipad-mini-7-9',
    title: 'iPad Mini 7.9',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 768,
    screenHeight: 1024,
    framePadding: 24,
    bezelRadius: 42,
    screenRadius: 24,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-generic-shell',
  },
  {
    key: 'ipad-pro-10-5',
    title: 'iPad Pro 10.5',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 834,
    screenHeight: 1112,
    framePadding: 24,
    bezelRadius: 44,
    screenRadius: 26,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-generic-shell',
  },
  {
    key: 'ipad-pro-11',
    title: 'iPad Pro 11',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 834,
    screenHeight: 1194,
    framePadding: 26,
    bezelRadius: 46,
    screenRadius: 28,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-pro-11-shell',
  },
  {
    key: 'ipad-pro-12-9',
    title: 'iPad Pro 12.9',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 1024,
    screenHeight: 1366,
    framePadding: 28,
    bezelRadius: 48,
    screenRadius: 30,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-generic-shell',
  },
  {
    key: 'ipad-air',
    title: 'iPad Air',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 820,
    screenHeight: 1180,
    framePadding: 28,
    bezelRadius: 48,
    screenRadius: 30,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-generic-shell',
  },
  {
    key: 'surface-pro-3',
    title: 'Surface Pro 3',
    group: 'Surface/Desktop',
    platform: 'windows',
    deviceFamily: 'desktop',
    screenWidth: 1440,
    screenHeight: 960,
    framePadding: 0,
    bezelRadius: 24,
    screenRadius: 16,
    background: '#e2e8f0',
    shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
    builtinShellKey: 'desktop-generic-shell',
  },
  {
    key: 'surface-pro-4',
    title: 'Surface Pro 4',
    group: 'Surface/Desktop',
    platform: 'windows',
    deviceFamily: 'desktop',
    screenWidth: 1368,
    screenHeight: 912,
    framePadding: 0,
    bezelRadius: 24,
    screenRadius: 16,
    background: '#e2e8f0',
    shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
    builtinShellKey: 'desktop-generic-shell',
  },
  {
    key: 'browser-window',
    title: 'Browser Window',
    group: 'Surface/Desktop',
    platform: 'web',
    deviceFamily: 'browser',
    screenWidth: 1440,
    screenHeight: 960,
    framePadding: 0,
    bezelRadius: 28,
    screenRadius: 28,
    background: '#e2e8f0',
    shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
    builtinShellKey: 'browser-window-shell',
  },
]

export const SYSTEM_SCENE_TEMPLATES: DesignTemplateManifest[] = [
  {
    templateKey: 'device-showcase',
    category: 'composition',
    title: '设备展示',
    summary: '用于截图加设备边框、标题、副标题和角标的导出稿。',
    drawMode: 'composition',
    sourceTypes: ['image_mockup'],
    tags: ['mockup', 'device', 'cover'],
    slotSchema: {
      title: 'string',
      subtitle: 'string',
      badge: 'string',
      imageSrc: 'string',
    },
    themeTokens: defaultCompositionModel('device-showcase').themeTokens || {},
    layoutRules: {
      aspectRatio: ['16:9', '4:5', '9:16'],
      align: 'split',
    },
    allowedBlocks: ['headline', 'subheadline', 'image', 'badge', 'caption'],
    exportPresets: ['svg', 'png', 'pdf'],
  },
  {
    templateKey: 'cover-hero',
    category: 'composition',
    title: '封面主视觉',
    summary: '用于封面图、产品海报和视觉主 KV。',
    drawMode: 'composition',
    sourceTypes: ['image_mockup', 'manual'],
    tags: ['cover', 'poster', 'hero'],
    slotSchema: {
      title: 'string',
      subtitle: 'string',
      badge: 'string',
      imageSrc: 'string',
    },
    themeTokens: {
      background: '#111827',
      surface: '#ffffff',
      accent: '#f97316',
      text: '#f8fafc',
      muted: '#cbd5e1',
    },
    layoutRules: {
      aspectRatio: ['16:9', '1:1', '4:5'],
      align: 'hero',
    },
    allowedBlocks: ['headline', 'subheadline', 'image', 'badge'],
    exportPresets: ['svg', 'png', 'pdf'],
  },
  {
    templateKey: 'info-card',
    category: 'composition',
    title: '信息卡',
    summary: '用于指标卡、能力卡和功能卖点摘要。',
    drawMode: 'composition',
    sourceTypes: ['manual', 'image_mockup'],
    tags: ['card', 'summary', 'info'],
    slotSchema: {
      title: 'string',
      subtitle: 'string',
      badge: 'string',
      imageSrc: 'string',
    },
    themeTokens: {
      background: '#f8fafc',
      surface: '#ffffff',
      accent: '#2563eb',
      text: '#0f172a',
      muted: '#64748b',
    },
    layoutRules: {
      aspectRatio: ['4:5', '1:1', '16:9'],
      align: 'card',
    },
    allowedBlocks: ['headline', 'subheadline', 'image', 'badge', 'caption'],
    exportPresets: ['svg', 'png', 'pdf'],
  },
]

export const SYSTEM_SCENE_TEMPLATE_SUMMARIES: SceneTemplateSummary[] = SYSTEM_SCENE_TEMPLATES.map(template => ({
  templateKey: template.templateKey,
  category: template.category,
  title: template.title,
  summary: template.summary,
  drawMode: template.drawMode,
  sourceTypes: template.sourceTypes,
  tags: template.tags,
}))

export function resolveDeviceFramePreset(key: string): DeviceFramePreset {
  const normalizedKey = normalizeString(key)
  return DEVICE_FRAME_PRESETS.find(preset => preset.key === normalizedKey)
    || DEVICE_FRAME_PRESETS.find(preset => preset.key === 'iphone-16-pro')
    || DEVICE_FRAME_PRESETS[0]!
}

export function resolveSceneTemplateManifest(templateKey: string): DesignTemplateManifest | null {
  const normalizedKey = normalizeString(templateKey)
  return SYSTEM_SCENE_TEMPLATES.find(template => template.templateKey === normalizedKey) || null
}

function resolveAspectRatioSize(aspectRatio = '16:9'): { width: number, height: number } {
  const matched = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/)
  if (!matched)
    return { width: DEFAULT_ARTBOARD_WIDTH, height: DEFAULT_ARTBOARD_HEIGHT }

  const left = Math.max(1, Number(matched[1] || 16))
  const right = Math.max(1, Number(matched[2] || 9))
  const width = DEFAULT_ARTBOARD_WIDTH
  const height = Math.max(640, Math.round(width * (right / left)))
  return { width, height }
}

function buildGraphSceneModel(sourceModel: GraphSourceModel): SceneModel {
  const nodes = sourceModel.nodes.length > 0 ? sourceModel.nodes : []
  const nodeIds = nodes.map(node => node.id)
  const indegree = new Map<string, number>()
  const depthMap = new Map<string, number>()

  for (const id of nodeIds) {
    indegree.set(id, 0)
    depthMap.set(id, 0)
  }

  for (const edge of sourceModel.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
  }

  const queue = nodeIds.filter(id => (indegree.get(id) || 0) === 0)
  const nextQueue = [...queue]
  while (nextQueue.length > 0) {
    const current = nextQueue.shift()!
    const currentDepth = depthMap.get(current) || 0
    for (const edge of sourceModel.edges.filter(entry => entry.source === current)) {
      const nextDepth = Math.max(depthMap.get(edge.target) || 0, currentDepth + 1)
      depthMap.set(edge.target, nextDepth)
      indegree.set(edge.target, Math.max(0, (indegree.get(edge.target) || 0) - 1))
      if ((indegree.get(edge.target) || 0) === 0)
        nextQueue.push(edge.target)
    }
  }

  const layerOrder = new Map<number, string[]>()
  for (const node of nodes) {
    const depth = depthMap.get(node.id) || 0
    const bucket = layerOrder.get(depth) || []
    bucket.push(node.id)
    layerOrder.set(depth, bucket)
  }

  const positionedNodes: SceneNode[] = nodes.map((node) => {
    const depth = depthMap.get(node.id) || 0
    const siblings = layerOrder.get(depth) || []
    const rowIndex = Math.max(0, siblings.indexOf(node.id))
    const width = sourceModel.diagramType === 'mindmap' ? 200 : 180
    const height = sourceModel.diagramType === 'mindmap' ? 72 : 64
    const manualPosition = resolveGraphNodeManualPosition(node)
    return {
      id: node.id,
      type: node.type || 'node',
      label: node.label,
      x: manualPosition?.x ?? (96 + depth * 260),
      y: manualPosition?.y ?? (96 + rowIndex * (height + 56)),
      width,
      height,
      shape: sourceModel.diagramType === 'mindmap' ? 'pill' : 'rounded',
      parentId: node.parentId,
      metadata: node.metadata,
    }
  })

  const positionedNodeMap = new Map(positionedNodes.map(node => [node.id, node]))
  const groupNodes: SceneNode[] = (sourceModel.groups || []).map((group, groupIndex) => {
    const memberIds = new Set<string>([
      ...(group.childNodeIds || []),
      ...nodes.filter(node => node.parentId === group.id).map(node => node.id),
    ])
    const memberNodes = [...memberIds]
      .map(nodeId => positionedNodeMap.get(nodeId))
      .filter((node): node is SceneNode => Boolean(node))
    const layoutKind = resolveGraphGroupLayoutKind(group)
    const manualFrame = resolveGraphGroupManualFrame(group)
    const paddingX = 28
    const headerHeight = layoutKind === 'swimlane' ? 52 : 44
    const paddingBottom = 28
    const defaultX = 56 + groupIndex * 40
    const defaultY = 56 + groupIndex * 24

    const minX = memberNodes.length > 0 ? Math.min(...memberNodes.map(node => node.x)) : (manualFrame?.x ?? defaultX)
    const minY = memberNodes.length > 0 ? Math.min(...memberNodes.map(node => node.y)) : (manualFrame?.y ?? defaultY)
    const maxX = memberNodes.length > 0
      ? Math.max(...memberNodes.map(node => node.x + node.width))
      : (manualFrame?.x ?? defaultX) + (manualFrame?.width ?? 320)
    const maxY = memberNodes.length > 0
      ? Math.max(...memberNodes.map(node => node.y + node.height))
      : (manualFrame?.y ?? defaultY) + (manualFrame?.height ?? 220)

    return {
      id: group.id,
      type: 'group',
      label: group.label,
      x: manualFrame?.x ?? Math.max(24, minX - paddingX),
      y: manualFrame?.y ?? Math.max(24, minY - headerHeight - 16),
      width: Math.max(manualFrame?.width ?? 0, 260, maxX - minX + paddingX * 2),
      height: Math.max(manualFrame?.height ?? 0, 180, maxY - minY + headerHeight + paddingBottom),
      shape: layoutKind === 'swimlane' ? 'rect' : 'rounded',
      metadata: {
        ...group.metadata,
        layoutKind,
        childNodeIds: [...memberIds],
      },
    }
  })

  const maxDepth = Math.max(0, ...[...layerOrder.keys()])
  const maxRows = Math.max(1, ...[...layerOrder.values()].map(bucket => bucket.length))
  const allNodes = [...groupNodes, ...positionedNodes]
  const maxNodeRight = Math.max(0, ...allNodes.map(node => node.x + node.width))
  const maxNodeBottom = Math.max(0, ...allNodes.map(node => node.y + node.height))
  return {
    nodes: allNodes,
    edges: sourceModel.edges.map((edge, index) => ({
      id: edge.id || `edge-${index + 1}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      style: 'solid',
      metadata: edge.metadata,
    })),
    artboards: [createDefaultArtboard(
      Math.max(DEFAULT_ARTBOARD_WIDTH, 320 + (maxDepth + 1) * 260, maxNodeRight + 160),
      Math.max(DEFAULT_ARTBOARD_HEIGHT, 280 + maxRows * 140, maxNodeBottom + 160),
    )],
    layout: {
      engine: 'fallback-graph-layout',
      direction: sourceModel.diagramType === 'mindmap' ? 'LR' : 'LR',
      compact: false,
    },
    themeTokens: {
      background: '#f8fafc',
      surface: '#ffffff',
      accent: '#2563eb',
      text: '#0f172a',
      muted: '#64748b',
    },
    metadata: {
      diagramType: sourceModel.diagramType,
    },
  }
}

function buildSchemaSceneModel(sourceModel: SchemaModel): SceneModel {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, sourceModel.tables.length))))
  const nodes: SceneNode[] = sourceModel.tables.map((table, index) => {
    const col = index % columnCount
    const row = Math.floor(index / columnCount)
    const height = 88 + table.columns.length * 22
    return {
      id: sanitizeIdentifier(`${table.schemaName || 'public'}-${table.name}`, table.name),
      type: 'table',
      label: table.name,
      x: 72 + col * 340,
      y: 72 + row * 280,
      width: 280,
      height,
      shape: 'table',
      content: table.columns.map(column => `${column.name}: ${column.type}`).join('\n'),
      metadata: {
        schemaName: table.schemaName,
        primaryKeys: table.primaryKeys,
      },
    }
  })

  const edges: SceneEdge[] = []
  for (const table of sourceModel.tables) {
    const sourceId = sanitizeIdentifier(`${table.schemaName || 'public'}-${table.name}`, table.name)
    for (const foreignKey of table.foreignKeys || []) {
      edges.push({
        id: sanitizeIdentifier(`${sourceId}-${foreignKey.referencedTable}-${foreignKey.columns.join('-')}`, `fk-${edges.length + 1}`),
        source: sourceId,
        target: sanitizeIdentifier(foreignKey.referencedTable, foreignKey.referencedTable),
        label: foreignKey.columns.join(', '),
        style: 'dashed',
        metadata: foreignKey.metadata,
      })
    }
  }

  return {
    nodes,
    edges,
    artboards: [createDefaultArtboard(
      Math.max(DEFAULT_ARTBOARD_WIDTH, 360 + columnCount * 340),
      Math.max(DEFAULT_ARTBOARD_HEIGHT, 360 + Math.ceil(Math.max(1, sourceModel.tables.length) / columnCount) * 280),
    )],
    layout: {
      engine: 'fallback-schema-layout',
      direction: 'LR',
      compact: false,
    },
    themeTokens: {
      background: '#f8fafc',
      surface: '#ffffff',
      accent: '#0f766e',
      text: '#0f172a',
      muted: '#64748b',
    },
    metadata: {
      dialect: sourceModel.dialect,
    },
  }
}

function buildArchitectureSceneModel(sourceModel: ArchitectureModel): SceneModel {
  const columns: Array<{ x: number, items: ArchitectureElementModel[], type: string }> = [
    { x: 72, items: sourceModel.systems, type: 'system' },
    { x: 352, items: sourceModel.services, type: 'service' },
    { x: 632, items: sourceModel.components, type: 'component' },
    { x: 912, items: sourceModel.databases, type: 'database' },
    { x: 1192, items: sourceModel.queues, type: 'queue' },
    { x: 1472, items: sourceModel.externalDependencies, type: 'external' },
  ]

  const nodes: SceneNode[] = []
  for (const column of columns) {
    column.items.forEach((item, index) => {
      nodes.push({
        id: item.id,
        type: item.type || column.type,
        label: item.label,
        x: column.x,
        y: 96 + index * 136,
        width: 220,
        height: 76,
        shape: column.type === 'database' ? 'note' : 'rounded',
        content: item.description,
        metadata: item.metadata,
      })
    })
  }

  return {
    nodes,
    edges: sourceModel.relations.map(relation => ({
      id: relation.id,
      source: relation.source,
      target: relation.target,
      label: relation.label || relation.protocol,
      style: relation.protocol ? 'dashed' : 'solid',
      metadata: relation.metadata,
    })),
    artboards: [createDefaultArtboard(1840, Math.max(DEFAULT_ARTBOARD_HEIGHT, 240 + nodes.length * 36))],
    layout: {
      engine: 'fallback-architecture-layout',
      direction: 'LR',
      compact: false,
    },
    themeTokens: {
      background: '#f8fafc',
      surface: '#ffffff',
      accent: '#7c3aed',
      text: '#111827',
      muted: '#64748b',
    },
    metadata: {},
  }
}

function buildCompositionSceneModel(sourceModel: CompositionModel): SceneModel {
  const pages = ensureArray(sourceModel.pages)
  const frames = ensureArray(sourceModel.frames)
  const currentPageId = normalizeString(sourceModel.currentPageId) || normalizeString(pages[0]?.id) || DEFAULT_COMPOSITION_PAGE_ID
  const currentPage = pages.find(page => normalizeString(page.id) === currentPageId) || pages[0] || createDefaultDesignPage({
    id: currentPageId,
  })
  const currentFrames = frames.filter(frame => normalizeString(frame.pageId) === normalizeString(currentPage.id))
  const fallbackFrame = createLegacyCompositionFrame({
    id: DEFAULT_COMPOSITION_FRAME_ID,
    pageId: currentPage.id,
    templateKey: sourceModel.templateKey,
    deviceFramePresetKey: sourceModel.deviceFramePresetKey,
    aspectRatio: sourceModel.aspectRatio,
    slots: sourceModel.slots,
    themeTokens: sourceModel.themeTokens,
  })
  const pageFrames = currentFrames.length > 0 ? currentFrames : [fallbackFrame]
  const minX = Math.min(...pageFrames.map(frame => frame.x))
  const minY = Math.min(...pageFrames.map(frame => frame.y))
  const maxX = Math.max(...pageFrames.map(frame => frame.x + frame.width))
  const maxY = Math.max(...pageFrames.map(frame => frame.y + frame.height))
  return {
    nodes: pageFrames.map((frame) => {
      return {
        id: frame.id,
        type: 'frame',
        label: frame.name,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        shape: 'rect',
        metadata: {
          kind: frame.kind,
          pageId: frame.pageId,
          templateKey: frame.templateKey,
          deviceFramePresetKey: frame.deviceFramePresetKey,
          locked: frame.locked,
        },
      }
    }),
    edges: [],
    artboards: [createDefaultArtboard(
      Math.max(DEFAULT_ARTBOARD_WIDTH, Math.round(maxX - minX + 320)),
      Math.max(DEFAULT_ARTBOARD_HEIGHT, Math.round(maxY - minY + 320)),
      normalizeString(currentPage.background) || normalizeThemeTokens(sourceModel.themeTokens, {}).background || '#0f172a',
    )],
    layout: {
      engine: 'vueflow-design',
      direction: 'none',
      compact: false,
    },
    themeTokens: normalizeThemeTokens(sourceModel.themeTokens, defaultCompositionModel(sourceModel.templateKey).themeTokens),
    metadata: {
      templateKey: sourceModel.templateKey,
      currentPageId: currentPage.id,
      frameCount: pageFrames.length,
    },
  }
}

export function relayoutSceneDocument(document: SceneDocument | unknown): SceneDocument {
  const normalized = sceneDocumentFromUnknown(document)
  if (normalized.sourceModel.kind === 'schema') {
    return {
      ...normalized,
      drawMode: 'schema',
      sceneModel: buildSchemaSceneModel(normalized.sourceModel),
    }
  }

  if (normalized.sourceModel.kind === 'architecture') {
    return {
      ...normalized,
      drawMode: 'architecture',
      sceneModel: buildArchitectureSceneModel(normalized.sourceModel),
    }
  }

  if (normalized.sourceModel.kind === 'composition') {
    return {
      ...normalized,
      drawMode: 'composition',
      sceneModel: buildCompositionSceneModel(normalized.sourceModel),
    }
  }

  return {
    ...normalized,
    drawMode: normalized.drawMode === 'freeform' ? 'diagram' : normalized.drawMode,
    sceneModel: buildGraphSceneModel(normalized.sourceModel),
  }
}

export function sceneDocumentHasStructuredPreview(document: SceneDocument | unknown): boolean {
  const normalized = sceneDocumentFromUnknown(document)
  if (normalized.drawMode === 'composition')
    return true
  return normalized.sceneModel.nodes.length > 0 || normalized.sceneModel.edges.length > 0
}

export function applySceneTemplate(input: {
  sceneDocument: SceneDocument | unknown
  templateKey: string
  title?: string
  subtitle?: string
  badge?: string
  imageSrc?: string
  themeTokens?: Record<string, string>
  deviceFramePresetKey?: string
}): SceneDocument {
  const base = sceneDocumentFromUnknown(input.sceneDocument)
  const template = resolveSceneTemplateManifest(input.templateKey)

  if (base.drawMode === 'composition' || template?.category === 'composition') {
    const composition = base.sourceModel.kind === 'composition'
      ? normalizeCompositionModel(base.sourceModel, input.templateKey)
      : defaultCompositionModel(input.templateKey)
    const targetPage = resolveCompositionCurrentPage(composition)
    const targetFrame = resolveCompositionFramesForPage(composition, targetPage.id)[0] || null
    const nextSlots = {
      ...normalizeRecord(composition.slots),
      ...(normalizeString(input.title) ? { title: normalizeString(input.title) } : {}),
      ...(normalizeString(input.subtitle) ? { subtitle: normalizeString(input.subtitle) } : {}),
      ...(normalizeString(input.badge) ? { badge: normalizeString(input.badge) } : {}),
      ...(normalizeString(input.imageSrc) ? { imageSrc: normalizeString(input.imageSrc) } : {}),
    }
    const nextThemeTokens = {
      ...normalizeThemeTokens(template?.themeTokens, defaultCompositionModel(input.templateKey).themeTokens),
      ...normalizeThemeTokens(composition.themeTokens),
      ...normalizeThemeTokens(input.themeTokens),
    }
    const rebuiltFrame = createLegacyCompositionFrame({
      id: targetFrame?.id || `frame-${Date.now()}`,
      pageId: targetPage.id,
      name: targetFrame?.name || '模板 Frame',
      kind: (targetFrame?.kind === 'device_mockup' ? 'device_mockup' : 'template'),
      templateKey: normalizeString(input.templateKey) || composition.templateKey,
      deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || targetFrame?.deviceFramePresetKey || composition.deviceFramePresetKey,
      aspectRatio: composition.aspectRatio,
      slots: nextSlots,
      themeTokens: nextThemeTokens,
      metadata: {
        ...normalizeRecord(targetFrame?.metadata),
        appliedTemplate: true,
      },
    })
    const frames = ensureArray(composition.frames).filter((frame) => {
      return targetFrame ? frame.id !== targetFrame.id : true
    })
    frames.push(rebuiltFrame)
    const nextComposition: CompositionModel = {
      ...composition,
      templateKey: normalizeString(input.templateKey) || composition.templateKey,
      deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || composition.deviceFramePresetKey,
      slots: nextSlots,
      frames,
      themeTokens: nextThemeTokens,
    }
    return finalizeCompositionSceneDocument(base, nextComposition)
  }

  return {
    ...base,
    templateKey: normalizeString(input.templateKey) || base.templateKey,
    sceneModel: {
      ...base.sceneModel,
      themeTokens: {
        ...normalizeThemeTokens(base.sceneModel.themeTokens),
        ...normalizeThemeTokens(input.themeTokens),
      },
      metadata: {
        ...normalizeRecord(base.sceneModel.metadata),
        appliedTemplateKey: normalizeString(input.templateKey) || base.templateKey,
      },
    },
  }
}

function splitTextLines(value: string, maxLineLength = 24, maxLines = 3): string[] {
  const normalized = normalizeString(value)
  if (!normalized)
    return []

  const words = normalized.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) {
      current = word
      continue
    }
    if (`${current} ${word}`.length <= maxLineLength) {
      current = `${current} ${word}`
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines - 1)
      break
  }
  if (current && lines.length < maxLines)
    lines.push(current)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length)
    lines[maxLines - 1] = `${lines[maxLines - 1]}…`
  return lines
}

function resolveCompositionCurrentPage(composition: CompositionModel): DesignPageModel {
  const pages = ensureArray(composition.pages)
  const currentPageId = normalizeString(composition.currentPageId)
  return pages.find(page => normalizeString(page.id) === currentPageId) || pages[0] || createDefaultDesignPage({
    id: DEFAULT_COMPOSITION_PAGE_ID,
  })
}

function resolveCompositionFramesForPage(composition: CompositionModel, pageId: string): DesignFrameModel[] {
  const frames = ensureArray(composition.frames).filter(frame => normalizeString(frame.pageId) === normalizeString(pageId))
  if (frames.length > 0)
    return frames
  return [createLegacyCompositionFrame({
    id: DEFAULT_COMPOSITION_FRAME_ID,
    pageId,
    templateKey: composition.templateKey,
    deviceFramePresetKey: composition.deviceFramePresetKey,
    aspectRatio: composition.aspectRatio,
    slots: composition.slots,
    themeTokens: composition.themeTokens,
  })]
}

function sortDesignElements(elements: DesignElementModel[]): DesignElementModel[] {
  return [...elements].sort((left, right) => {
    const zIndexDelta = left.zIndex - right.zIndex
    if (zIndexDelta !== 0)
      return zIndexDelta
    return normalizeString(left.id).localeCompare(normalizeString(right.id))
  })
}

function cloneSortedDesignElements(elements: DesignElementModel[]): DesignElementModel[] {
  return sortDesignElements(elements).map(element => createDesignElement(element, element.id))
}

export function resolveCompositionElementsForPage(composition: CompositionModel, pageId: string): DesignElementModel[] {
  return cloneSortedDesignElements(ensureArray(composition.elements)
    .filter(element => normalizeString(element.pageId) === normalizeString(pageId) && !normalizeString(element.frameId)),
  )
}

export function resolveCompositionElementsForFrame(composition: CompositionModel, frameId: string): DesignElementModel[] {
  return cloneSortedDesignElements(ensureArray(composition.elements)
    .filter(element => normalizeString(element.frameId) === normalizeString(frameId)),
  )
}

function resolveDesignElementStyleRecord(element: DesignElementModel): DesignElementStyle {
  return (normalizeDesignElementStyle(element.style) || {}) as DesignElementStyle
}

function resolveDesignElementLayoutSizing(element: DesignElementModel): 'fixed' | 'hug' | 'fill' {
  return normalizeDesignElementLayoutSizing(normalizeRecord(element.metadata).layoutSizing) || 'fixed'
}

function resolveDesignElementIntrinsicSize(element: DesignElementModel): { width: number, height: number } {
  if (element.type === 'text' || element.type === 'caption' || element.type === 'badge') {
    const style = resolveDesignElementStyleRecord(element)
    const fontSize = Math.max(12, toFiniteNumber(style.fontSize, element.type === 'caption' ? 24 : element.type === 'badge' ? 18 : 52))
    const lineHeight = Math.round(fontSize * 1.18)
    const text = normalizeString(element.text) || '文本'
    const badgePaddingX = element.type === 'badge' ? 28 : 0
    const badgePaddingY = element.type === 'badge' ? 12 : 0
    return {
      width: Math.max(48, Math.round(text.length * fontSize * 0.62) + badgePaddingX),
      height: Math.max(fontSize + 8, lineHeight + badgePaddingY),
    }
  }

  return {
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
  }
}

function resolveDesignElementConstraintsForFrame(
  element: DesignElementModel,
  frame: DesignFrameModel,
): ResolvedDesignElementConstraints {
  const constraints = normalizeDesignElementConstraints(normalizeRecord(element.metadata).constraints)
  if (!constraints)
    return null
  return {
    horizontal: constraints.horizontal,
    vertical: constraints.vertical,
    referenceWidth: constraints.referenceWidth > 0 ? constraints.referenceWidth : frame.width,
    referenceHeight: constraints.referenceHeight > 0 ? constraints.referenceHeight : frame.height,
  }
}

function applyDesignElementConstraints(
  element: DesignElementModel,
  frame: DesignFrameModel,
): DesignElementModel {
  const constraints = resolveDesignElementConstraintsForFrame(element, frame)
  if (!constraints)
    return createDesignElement(element, element.id)

  let nextX = element.x
  let nextY = element.y
  let nextWidth = element.width
  let nextHeight = element.height

  if (constraints.referenceWidth > 0) {
    if (constraints.horizontal === 'scale') {
      const ratio = frame.width / constraints.referenceWidth
      nextX = element.x * ratio
      nextWidth = element.width * ratio
    }
    else if (constraints.horizontal === 'right') {
      const rightInset = constraints.referenceWidth - (element.x + element.width)
      nextX = frame.width - element.width - rightInset
    }
    else if (constraints.horizontal === 'center') {
      const centerOffset = element.x + element.width / 2 - constraints.referenceWidth / 2
      nextX = frame.width / 2 + centerOffset - element.width / 2
    }
  }

  if (constraints.referenceHeight > 0) {
    if (constraints.vertical === 'scale') {
      const ratio = frame.height / constraints.referenceHeight
      nextY = element.y * ratio
      nextHeight = element.height * ratio
    }
    else if (constraints.vertical === 'bottom') {
      const bottomInset = constraints.referenceHeight - (element.y + element.height)
      nextY = frame.height - element.height - bottomInset
    }
    else if (constraints.vertical === 'center') {
      const centerOffset = element.y + element.height / 2 - constraints.referenceHeight / 2
      nextY = frame.height / 2 + centerOffset - element.height / 2
    }
  }

  return createDesignElement({
    ...element,
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.max(1, Math.round(nextWidth)),
    height: Math.max(1, Math.round(nextHeight)),
  }, element.id)
}

function resolveAutoLayoutFrameElements(
  frame: DesignFrameModel,
  elements: DesignElementModel[],
): DesignElementModel[] {
  const layout = resolveDesignFrameLayoutMetadata(normalizeRecord(frame.metadata).layout)
  if (layout.mode !== 'auto' || elements.length === 0)
    return elements.map(element => applyDesignElementConstraints(element, frame))

  const contentWidth = Math.max(1, frame.width - layout.padding.left - layout.padding.right)
  const contentHeight = Math.max(1, frame.height - layout.padding.top - layout.padding.bottom)
  const items = sortDesignElements(elements).map((element) => {
    const sizing = resolveDesignElementLayoutSizing(element)
    const intrinsic = resolveDesignElementIntrinsicSize(element)
    return {
      element,
      sizing,
      baseWidth: sizing === 'hug' ? intrinsic.width : Math.max(1, element.width),
      baseHeight: sizing === 'hug' ? intrinsic.height : Math.max(1, element.height),
    }
  })

  const mainAxis = layout.direction === 'horizontal' ? 'width' : 'height'
  const crossAxis = layout.direction === 'horizontal' ? 'height' : 'width'
  const availableMain = layout.direction === 'horizontal' ? contentWidth : contentHeight
  const availableCross = layout.direction === 'horizontal' ? contentHeight : contentWidth
  const fillCount = items.filter(item => item.sizing === 'fill').length
  const gap = items.length > 1 ? layout.gap : 0
  const fixedMainSize = items.reduce((total, item) => {
    if (item.sizing === 'fill')
      return total
    return total + (mainAxis === 'width' ? item.baseWidth : item.baseHeight)
  }, 0)
  const remainingMain = Math.max(0, availableMain - fixedMainSize - gap * Math.max(0, items.length - 1))
  const fillMainSize = fillCount > 0 ? Math.max(1, remainingMain / fillCount) : 0
  const resolvedMainSizes = items.map((item) => {
    const nextSize = item.sizing === 'fill'
      ? fillMainSize
      : mainAxis === 'width'
        ? item.baseWidth
        : item.baseHeight
    return Math.max(1, Math.round(nextSize))
  })
  const totalMain = resolvedMainSizes.reduce((total, size) => total + size, 0)
  const dynamicGap = layout.alignPrimary === 'space-between' && items.length > 1
    ? Math.max(gap, Math.round((availableMain - totalMain) / (items.length - 1)))
    : gap
  const occupiedMain = totalMain + dynamicGap * Math.max(0, items.length - 1)
  const startMain = layout.alignPrimary === 'center'
    ? Math.round((availableMain - occupiedMain) / 2)
    : layout.alignPrimary === 'end'
      ? Math.round(availableMain - occupiedMain)
      : 0

  let cursor = startMain
  return items.map((item, index) => {
    const mainSize = resolvedMainSizes[index] || 1
    const nextWidth = layout.direction === 'horizontal'
      ? mainSize
      : layout.alignCross === 'stretch'
        ? availableCross
        : item.sizing === 'fill'
          ? availableCross
          : item.baseWidth
    const nextHeight = layout.direction === 'vertical'
      ? mainSize
      : layout.alignCross === 'stretch'
        ? availableCross
        : item.sizing === 'fill'
          ? availableCross
          : item.baseHeight
    const crossSize = crossAxis === 'width' ? nextWidth : nextHeight
    const crossOffset = layout.alignCross === 'center'
      ? Math.round((availableCross - crossSize) / 2)
      : layout.alignCross === 'end'
        ? Math.round(availableCross - crossSize)
        : 0
    const nextElement = createDesignElement({
      ...item.element,
      x: layout.direction === 'horizontal'
        ? Math.round(layout.padding.left + cursor)
        : Math.round(layout.padding.left + crossOffset),
      y: layout.direction === 'vertical'
        ? Math.round(layout.padding.top + cursor)
        : Math.round(layout.padding.top + crossOffset),
      width: Math.max(1, Math.round(nextWidth)),
      height: Math.max(1, Math.round(nextHeight)),
    }, item.element.id)
    cursor += mainSize + dynamicGap
    return nextElement
  })
}

export function resolveDisplayCompositionElementsForPage(
  composition: CompositionModel,
  pageId: string,
): DesignElementModel[] {
  return resolveCompositionElementsForPage(composition, pageId)
}

export function resolveDisplayCompositionElementsForFrame(
  composition: CompositionModel,
  frame: DesignFrameModel,
): DesignElementModel[] {
  return resolveAutoLayoutFrameElements(frame, resolveCompositionElementsForFrame(composition, frame.id))
}

export function resolveDesignFrameEditingBinding(
  composition: CompositionModel,
  frame: DesignFrameModel | null | undefined,
): DesignFrameEditingBinding | null {
  if (!frame)
    return null

  const deviceConfig = resolveFrameDeviceConfig(frame)
  const linkedFrame = resolveCompositionFrameById(composition, deviceConfig.mockupSourceFrameId)
  if (linkedFrame?.kind === 'device_artboard') {
    return {
      displayFrame: frame,
      ownerFrame: linkedFrame,
      projected: linkedFrame.id !== frame.id,
    }
  }

  return {
    displayFrame: frame,
    ownerFrame: frame,
    projected: false,
  }
}

export function resolveDesignFrameEditableElements(
  composition: CompositionModel,
  frame: DesignFrameModel | null | undefined,
): DesignElementModel[] {
  const binding = resolveDesignFrameEditingBinding(composition, frame)
  if (!binding)
    return []
  return resolveDisplayCompositionElementsForFrame(composition, binding.ownerFrame)
}

export function resolveDesignElementAbsoluteRect(element: DesignElementModel, frame?: DesignFrameModel | null): DesignRect {
  const offsetX = frame ? frame.x : 0
  const offsetY = frame ? frame.y : 0
  if (element.type === 'path' && Array.isArray(element.points) && element.points.length > 0) {
    const xs = element.points.map(point => toFiniteNumber(point.x, 0))
    const ys = element.points.map(point => toFiniteNumber(point.y, 0))
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    const strokeWidth = Math.max(1, toFiniteNumber(normalizeRecord(element.style).strokeWidth, 3))
    const padding = strokeWidth / 2
    return {
      x: offsetX + minX - padding,
      y: offsetY + minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2),
    }
  }
  return {
    x: offsetX + element.x,
    y: offsetY + element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
  }
}

function resolveRectIntersection(source: DesignRect, target: DesignRect): DesignRect | null {
  const x = Math.max(source.x, target.x)
  const y = Math.max(source.y, target.y)
  const right = Math.min(source.x + source.width, target.x + target.width)
  const bottom = Math.min(source.y + source.height, target.y + target.height)
  if (right <= x || bottom <= y)
    return null
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  }
}

function rectIntersects(source: DesignRect, target: DesignRect): boolean {
  return Boolean(resolveRectIntersection(source, target))
}

function resolveRectUnion(source: DesignRect, target: DesignRect): DesignRect {
  const minX = Math.min(source.x, target.x)
  const minY = Math.min(source.y, target.y)
  const maxX = Math.max(source.x + source.width, target.x + target.width)
  const maxY = Math.max(source.y + source.height, target.y + target.height)
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function resolveFrameRect(frame: DesignFrameModel): DesignRect {
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  }
}

function resolveFrameExportRect(composition: CompositionModel, frame: DesignFrameModel): DesignRect {
  return resolveFrameRect(frame)
}

export function rewriteDesignElementZIndices(elements: DesignElementModel[]): DesignElementModel[] {
  return cloneSortedDesignElements(elements).map((element, index) => createDesignElement({
    ...element,
    zIndex: index,
  }, element.id))
}

export function moveDesignElementBetweenContainers(
  document: SceneDocument | CompositionModel | unknown,
  elementId: string,
  target: {
    pageId: string
    frameId?: string | null
    x?: number
    y?: number
    zIndex?: number
    parentId?: string | null
  },
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const pageId = normalizeString(target.pageId)
  const rawFrameId = normalizeString(target.frameId)
  const nextFrameId = rawFrameId || undefined
  const targetFrame = nextFrameId
    ? ensureArray(composition.frames).find(frame => normalizeString(frame.id) === nextFrameId) || null
    : null
  if (nextFrameId && !canDesignFrameContainElements(targetFrame))
    return finalizeCompositionSceneDocument(base, composition)
  if (!ensureArray(composition.pages).some(page => normalizeString(page.id) === pageId))
    return finalizeCompositionSceneDocument(base, composition)

  const elements = ensureArray(composition.elements)
  const currentElement = elements.find(element => normalizeString(element.id) === normalizeString(elementId))
  if (!currentElement)
    return finalizeCompositionSceneDocument(base, composition)

  const currentFrame = normalizeString(currentElement.frameId)
    ? ensureArray(composition.frames).find(frame => normalizeString(frame.id) === normalizeString(currentElement.frameId)) || null
    : null
  const absoluteRect = resolveDesignElementAbsoluteRect(currentElement, currentFrame)
  const nextX = target.x !== undefined
    ? toFiniteNumber(target.x, currentElement.x)
    : absoluteRect.x - (targetFrame ? targetFrame.x : 0)
  const nextY = target.y !== undefined
    ? toFiniteNumber(target.y, currentElement.y)
    : absoluteRect.y - (targetFrame ? targetFrame.y : 0)
  const siblingElements = elements.filter((element) => {
    if (normalizeString(element.id) === normalizeString(elementId))
      return false
    return normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(nextFrameId)
      && normalizeString(element.parentId) === normalizeString(target.parentId)
  })
  const normalizedSiblings = rewriteDesignElementZIndices(siblingElements)
  const desiredZIndex = Math.max(0, Math.trunc(toFiniteNumber(target.zIndex, normalizedSiblings.length)))
  const nextElement = createDesignElement({
    ...currentElement,
    pageId,
    frameId: nextFrameId,
    parentId: normalizeString(target.parentId) || undefined,
    x: nextX,
    y: nextY,
    zIndex: desiredZIndex,
    metadata: {
      ...normalizeRecord(currentElement.metadata),
      containerRole: nextFrameId ? 'frame_child' : 'page_root',
    },
  }, currentElement.id)
  const before = normalizedSiblings.slice(0, desiredZIndex)
  const after = normalizedSiblings.slice(desiredZIndex)
  const nextContainerElements = rewriteDesignElementZIndices([...before, nextElement, ...after])
  const sameContainer = normalizeString(currentElement.pageId) === pageId
    && normalizeString(currentElement.frameId) === normalizeString(nextFrameId)
    && normalizeString(currentElement.parentId) === normalizeString(target.parentId)
  const unaffectedElements = elements.filter((element) => {
    const normalizedElementId = normalizeString(element.id)
    if (normalizedElementId === normalizeString(elementId))
      return false
    const isSourceSibling = normalizeString(element.pageId) === normalizeString(currentElement.pageId)
      && normalizeString(element.frameId) === normalizeString(currentElement.frameId)
      && normalizeString(element.parentId) === normalizeString(currentElement.parentId)
    const isTargetSibling = normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(nextFrameId)
      && normalizeString(element.parentId) === normalizeString(target.parentId)
    return !isSourceSibling && !isTargetSibling
  })
  const nextElements = [
    ...unaffectedElements,
    ...(!sameContainer
      ? rewriteDesignElementZIndices(elements.filter((element) => {
          const normalizedElementId = normalizeString(element.id)
          if (normalizedElementId === normalizeString(elementId))
            return false
          return normalizeString(element.pageId) === normalizeString(currentElement.pageId)
            && normalizeString(element.frameId) === normalizeString(currentElement.frameId)
            && normalizeString(element.parentId) === normalizeString(currentElement.parentId)
        }))
      : []),
    ...nextContainerElements,
  ]
  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    elements: nextElements,
  })
}

function resolveFrameVisiblePageOverlayElements(composition: CompositionModel, frame: DesignFrameModel): DesignElementModel[] {
  if (!resolveFrameExportsVisiblePageOverlays(frame))
    return []
  const frameRect = resolveFrameExportRect(composition, frame)
  return resolveCompositionElementsForPage(composition, frame.pageId).filter((element) => {
    const rect = resolveDesignElementAbsoluteRect(element)
    return rectIntersects(rect, frameRect)
  })
}

function resolveSingleFrameExportBounds(composition: CompositionModel, frame: DesignFrameModel): DesignRect {
  const frameRect = resolveFrameExportRect(composition, frame)
  if (!canDesignFrameContainElements(frame) || isDesignFrameClipContentEnabled(frame))
    return frameRect

  return resolveDisplayCompositionElementsForFrame(composition, frame)
    .filter(element => !element.hidden)
    .map(element => resolveDesignElementAbsoluteRect(element, frame))
    .reduce((bounds, elementRect) => resolveRectUnion(bounds, elementRect), frameRect)
}

function resolveFrameThemeTokens(composition: CompositionModel, frame: DesignFrameModel): Record<string, string> {
  return {
    ...defaultCompositionThemeTokens(),
    ...normalizeThemeTokens(composition.themeTokens, defaultCompositionThemeTokens()),
    ...normalizeThemeTokens(frame.themeTokens),
  }
}

function resolveThemeColorToken(value: unknown, themeTokens: Record<string, string>, fallback: string): string {
  const normalized = normalizeString(value)
  if (!normalized)
    return fallback
  if (themeTokens[normalized])
    return themeTokens[normalized]!
  return normalized
}

export function resolveDesignElementPresentation(
  element: DesignElementModel,
  themeTokens: Record<string, string>,
  offsetX = 0,
  offsetY = 0,
) {
  const style = resolveDesignElementStyleRecord(element)
  const x = element.x + offsetX
  const y = element.y + offsetY
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const opacity = Math.min(1, Math.max(0, toFiniteNumber(style.opacity, 1)))
  const rotation = toFiniteNumber(element.rotation, 0)
  const borderRadius = Math.max(0, Math.round(toNonNegativeNumber(
    style.borderRadius,
    element.type === 'badge' ? 20 : element.type === 'image' ? 24 : 28,
  )))
  const fill = resolveThemeColorToken(
    style.fill,
    themeTokens,
    element.type === 'badge'
      ? themeTokens.accent || '#38bdf8'
      : element.type === 'shape'
        ? 'rgba(148, 163, 184, 0.24)'
        : 'transparent',
  )
  const stroke = resolveThemeColorToken(
    style.stroke || style.color,
    themeTokens,
    element.type === 'shape' || element.type === 'path'
      ? fill
      : themeTokens.text || '#0f172a',
  )
  const strokeWidth = Math.max(0, toFiniteNumber(style.strokeWidth, element.type === 'path' ? 3 : 2))
  const shadow = normalizeString(style.shadow)
  const fontSize = Math.max(12, toFiniteNumber(style.fontSize, element.type === 'caption' ? 24 : element.type === 'badge' ? 18 : 52))
  const fontWeight = Math.max(400, toFiniteNumber(style.fontWeight, element.type === 'caption' ? 500 : element.type === 'badge' ? 700 : 700))
  const color = resolveThemeColorToken(
    style.color,
    themeTokens,
    element.type === 'caption'
      ? themeTokens.muted || '#94a3b8'
      : element.type === 'badge'
        ? fill
        : themeTokens.text || '#e2e8f0',
  )
  const textAlign = normalizeString(style.textAlign).toLowerCase() === 'center'
    ? 'center'
    : normalizeString(style.textAlign).toLowerCase() === 'right'
      ? 'right'
      : 'left'
  const lineHeight = Math.round(fontSize * 1.18)
  const textLines = element.type === 'text' || element.type === 'caption'
    ? splitTextLines(element.text || '', Math.max(8, Math.round(width / Math.max(1, fontSize * 0.72))), 4)
    : element.type === 'badge'
      ? [normalizeString(element.text) || '']
      : []
  return {
    x,
    y,
    width,
    height,
    opacity,
    rotation,
    borderRadius,
    fill,
    stroke,
    strokeWidth,
    shadow,
    fontSize,
    fontWeight,
    color,
    textAlign,
    lineHeight,
    textLines,
    shapeKind: normalizeString(element.shapeKind || normalizeRecord(element.metadata).shapeKind).toLowerCase() || 'rectangle',
    strokeLineCap: normalizeString(style.strokeLineCap) || 'round',
    strokeLineJoin: normalizeString(style.strokeLineJoin) || 'round',
  }
}

function renderEmbeddedSceneMarkup(sceneDocument: SceneDocument | undefined, width: number, height: number): string {
  if (!sceneDocument)
    return ''

  const nodes = sceneDocument.sceneModel.nodes || []
  if (nodes.length === 0)
    return ''

  const minX = Math.min(...nodes.map(node => node.x))
  const minY = Math.min(...nodes.map(node => node.y))
  const maxX = Math.max(...nodes.map(node => node.x + node.width))
  const maxY = Math.max(...nodes.map(node => node.y + node.height))
  const graphWidth = Math.max(1, maxX - minX)
  const graphHeight = Math.max(1, maxY - minY)
  const scale = Math.min((width - 48) / graphWidth, (height - 48) / graphHeight)
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  const offsetX = 24 - minX * safeScale
  const offsetY = 24 - minY * safeScale
  const nodeMap = new Map(nodes.map(node => [node.id, node]))

  const edgeMarkup = (sceneDocument.sceneModel.edges || []).map((edge) => {
    const source = nodeMap.get(edge.source)
    const target = nodeMap.get(edge.target)
    if (!source || !target)
      return ''
    const x1 = offsetX + (source.x + source.width / 2) * safeScale
    const y1 = offsetY + (source.y + source.height / 2) * safeScale
    const x2 = offsetX + (target.x + target.width / 2) * safeScale
    const y2 = offsetY + (target.y + target.height / 2) * safeScale
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="2" />`
  }).join('')

  const backgroundNodeMarkup = nodes
    .filter(node => node.type === 'group')
    .map((node) => {
      const x = offsetX + node.x * safeScale
      const y = offsetY + node.y * safeScale
      const nodeWidth = node.width * safeScale
      const nodeHeight = node.height * safeScale
      const layoutKind = normalizeString(normalizeRecord(node.metadata).layoutKind).toLowerCase()
      return `<g>
        <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${layoutKind === 'swimlane' ? 18 : 24}" ry="${layoutKind === 'swimlane' ? 18 : 24}" fill="#e0f2fe" fill-opacity="0.22" stroke="#38bdf8" stroke-dasharray="${layoutKind === 'swimlane' ? '10 6' : '0'}" />
        <text x="${x + 18}" y="${y + Math.min(nodeHeight - 16, 28)}" fill="#0f172a" font-size="${Math.max(12, Math.round(16 * safeScale))}" font-weight="700">${escapeXml(node.label)}</text>
      </g>`
    })
    .join('')

  const nodeMarkup = nodes.filter(node => node.type !== 'group').map((node) => {
    const x = offsetX + node.x * safeScale
    const y = offsetY + node.y * safeScale
    const nodeWidth = node.width * safeScale
    const nodeHeight = node.height * safeScale
    return `<g>
      <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="18" ry="18" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1" />
      <text x="${x + 18}" y="${y + Math.min(nodeHeight - 16, 32)}" fill="#0f172a" font-size="${Math.max(14, Math.round(18 * safeScale))}" font-weight="600">${escapeXml(node.label)}</text>
    </g>`
  }).join('')

  return `<g>${backgroundNodeMarkup}${edgeMarkup}${nodeMarkup}</g>`
}

function renderDesignElementMarkup(
  element: DesignElementModel,
  themeTokens: Record<string, string>,
  offsetX = 0,
  offsetY = 0,
): string {
  if (element.hidden)
    return ''

  const presentation = resolveDesignElementPresentation(element, themeTokens, offsetX, offsetY)
  const transform = presentation.rotation
    ? ` transform="rotate(${presentation.rotation} ${presentation.x + presentation.width / 2} ${presentation.y + presentation.height / 2})"`
    : ''
  const opacityAttr = presentation.opacity < 1 ? ` opacity="${presentation.opacity}"` : ''
  const shadowStyleAttr = presentation.shadow
    ? ` style="filter: drop-shadow(${escapeXml(presentation.shadow)})"`
    : ''

  if (element.type === 'badge') {
    return `<g>
      <rect x="${presentation.x}" y="${presentation.y}" width="${presentation.width}" height="${presentation.height}" rx="${presentation.borderRadius}" ry="${presentation.borderRadius}" fill="${escapeXml(presentation.fill)}" fill-opacity="0.16" stroke="${escapeXml(presentation.fill)}"${opacityAttr}${transform}${shadowStyleAttr} />
      <text x="${presentation.x + 18}" y="${presentation.y + Math.min(presentation.height - 10, 25)}" fill="${escapeXml(presentation.color)}" font-size="${presentation.fontSize}" font-weight="${presentation.fontWeight}"${opacityAttr}>${escapeXml(element.text || '')}</text>
    </g>`
  }

  if (element.type === 'shape') {
    if (presentation.shapeKind === 'ellipse' || presentation.shapeKind === 'circle') {
      return `<ellipse cx="${presentation.x + presentation.width / 2}" cy="${presentation.y + presentation.height / 2}" rx="${presentation.width / 2}" ry="${presentation.height / 2}" fill="${escapeXml(presentation.fill)}" stroke="${escapeXml(presentation.stroke)}" stroke-width="${presentation.strokeWidth}"${opacityAttr}${transform}${shadowStyleAttr} />`
    }
    if (presentation.shapeKind === 'arrow') {
      const x1 = presentation.x
      const y1 = presentation.y + presentation.height / 2
      const x2 = presentation.x + presentation.width
      const y2 = presentation.y + presentation.height / 2
      const arrowSize = Math.max(12, Math.min(32, presentation.height * 0.35))
      return `<g>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(presentation.stroke)}" stroke-width="${presentation.strokeWidth}" stroke-linecap="round"${opacityAttr}${transform}${shadowStyleAttr} />
        <path d="M ${x2 - arrowSize} ${y2 - arrowSize * 0.7} L ${x2} ${y2} L ${x2 - arrowSize} ${y2 + arrowSize * 0.7}" fill="none" stroke="${escapeXml(presentation.stroke)}" stroke-width="${presentation.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr}${transform}${shadowStyleAttr} />
      </g>`
    }
    return `<rect x="${presentation.x}" y="${presentation.y}" width="${presentation.width}" height="${presentation.height}" rx="${presentation.borderRadius}" ry="${presentation.borderRadius}" fill="${escapeXml(presentation.fill)}" stroke="${escapeXml(presentation.stroke)}" stroke-width="${presentation.strokeWidth}"${opacityAttr}${transform}${shadowStyleAttr} />`
  }

  if (element.type === 'image') {
    if (normalizeString(element.imageSrc)) {
      return `<image href="${escapeXml(element.imageSrc)}" x="${presentation.x}" y="${presentation.y}" width="${presentation.width}" height="${presentation.height}" preserveAspectRatio="xMidYMid slice"${opacityAttr}${transform}${shadowStyleAttr} />`
    }
    return `<rect x="${presentation.x}" y="${presentation.y}" width="${presentation.width}" height="${presentation.height}" rx="${presentation.borderRadius}" ry="${presentation.borderRadius}" fill="#cbd5e1"${opacityAttr}${transform}${shadowStyleAttr} />
      <text x="${presentation.x + 20}" y="${presentation.y + 42}" fill="#475569" font-size="18" font-weight="600"${opacityAttr}>待上传图片</text>`
  }

  if (element.type === 'text' || element.type === 'caption') {
    const textAnchor = presentation.textAlign === 'center'
      ? 'middle'
      : presentation.textAlign === 'right'
        ? 'end'
        : 'start'
    const anchorX = textAnchor === 'middle'
      ? presentation.x + presentation.width / 2
      : textAnchor === 'end'
        ? presentation.x + presentation.width
        : presentation.x
    return presentation.textLines.map((line, index) => {
      return `<text x="${anchorX}" y="${presentation.y + presentation.fontSize + index * presentation.lineHeight}" text-anchor="${textAnchor}" fill="${escapeXml(presentation.color)}" font-size="${presentation.fontSize}" font-weight="${presentation.fontWeight}"${opacityAttr}${transform}${shadowStyleAttr}>${escapeXml(line)}</text>`
    }).join('')
  }

  if (element.type === 'path') {
    const points = ensureArray(element.points)
    if (points.length < 2)
      return ''
    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x + offsetX} ${point.y + offsetY}`)
      .join(' ')
    return `<path d="${path}" fill="none" stroke="${escapeXml(presentation.stroke)}" stroke-width="${presentation.strokeWidth}" stroke-linecap="${escapeXml(presentation.strokeLineCap)}" stroke-linejoin="${escapeXml(presentation.strokeLineJoin)}"${opacityAttr}${shadowStyleAttr} />`
  }

  return ''
}

interface DeviceShellMetrics {
  width: number
  height: number
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  cornerRadius: number
}

interface ParsedEdgeOperatorMatch {
  index: number
  operator: string
}

interface ParsedMermaidEdgeLine {
  label: string
  operator: string
  sourceToken: string
  targetToken: string
}

interface ParsedRelationLine {
  operator: string
  sourceToken: string
  targetToken: string
}

export function resolveFrameDeviceConfig(frame: DesignFrameModel): ResolvedDesignFrameDevice {
  return resolveDesignFrameDeviceMetadata(frame.metadata?.device, frame.kind)
}

function resolveCompositionFrameById(composition: CompositionModel, frameId: string): DesignFrameModel | null {
  const normalizedFrameId = normalizeString(frameId)
  if (!normalizedFrameId)
    return null
  return ensureArray(composition.frames).find(frame => normalizeString(frame.id) === normalizedFrameId) || null
}

function resolveCompositionAssetById(composition: CompositionModel, assetId: string): DesignAssetModel | null {
  const normalizedAssetId = normalizeString(assetId)
  if (!normalizedAssetId)
    return null
  return ensureArray(composition.assets).find(asset => normalizeString(asset.id) === normalizedAssetId) || null
}

function resolveBuiltinShellKey(preset: DeviceFramePreset): string {
  const explicitKey = normalizeString(preset.builtinShellKey)
  if (explicitKey)
    return explicitKey
  if (preset.deviceFamily === 'browser')
    return 'browser-window-shell'
  if (preset.deviceFamily === 'desktop')
    return 'desktop-generic-shell'
  if (preset.platform === 'android')
    return 'android-phone-shell'
  if (preset.deviceFamily === 'tablet')
    return 'ipad-generic-shell'
  return 'iphone-generic-shell'
}

function measureBuiltinDeviceShellMetrics(preset: DeviceFramePreset): DeviceShellMetrics {
  if (preset.deviceFamily === 'browser') {
    return {
      width: preset.screenWidth,
      height: preset.screenHeight + 74,
      screenX: 0,
      screenY: 54,
      screenWidth: preset.screenWidth,
      screenHeight: preset.screenHeight,
      cornerRadius: preset.screenRadius,
    }
  }

  if (preset.deviceFamily === 'desktop') {
    return {
      width: preset.screenWidth + 70,
      height: preset.screenHeight + 110,
      screenX: 35,
      screenY: 24,
      screenWidth: preset.screenWidth,
      screenHeight: preset.screenHeight,
      cornerRadius: preset.screenRadius,
    }
  }

  return {
    width: preset.screenWidth + preset.framePadding * 2,
    height: preset.screenHeight + preset.framePadding * 2,
    screenX: preset.framePadding,
    screenY: preset.framePadding,
    screenWidth: preset.screenWidth,
    screenHeight: preset.screenHeight,
    cornerRadius: preset.screenRadius,
  }
}

function resolveAssetShellMetrics(asset: DesignAssetModel | null | undefined): DeviceShellMetrics | null {
  if (!asset)
    return null
  const metadata = resolveDesignAssetDeviceShellMetadata(asset.metadata?.deviceShell)
  if (!metadata)
    return null
  const width = Math.max(
    toPositiveNumber(asset.width, 0),
    metadata.viewportRect.x + metadata.viewportRect.width,
  )
  const height = Math.max(
    toPositiveNumber(asset.height, 0),
    metadata.viewportRect.y + metadata.viewportRect.height,
  )
  if (!width || !height)
    return null
  return {
    width,
    height,
    screenX: metadata.viewportRect.x,
    screenY: metadata.viewportRect.y,
    screenWidth: metadata.viewportRect.width,
    screenHeight: metadata.viewportRect.height,
    cornerRadius: metadata.cornerRadius,
  }
}

export function resolveDesignFrameDeviceSurfaceLayout(
  frame: DesignFrameModel,
  options: {
    assets?: DesignAssetModel[] | null | undefined
    outerRect?: DesignRect
  } = {},
): DesignFrameDeviceSurfaceLayout | null {
  if (!isDeviceDesignFrameKind(frame.kind))
    return null

  const preset = resolveDeviceFramePreset(frame.deviceFramePresetKey || 'iphone-16-pro')
  const deviceConfig = resolveFrameDeviceConfig(frame)
  const outerRect = options.outerRect || {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  }
  if (deviceConfig.shellMode === 'none') {
    return {
      shellKind: 'none',
      outerRect,
      screenRect: outerRect,
      clipRadius: Math.max(12, Math.round(Math.min(outerRect.width, outerRect.height) * 0.04)),
      preset,
      shellAsset: null,
    }
  }

  let shellKind: 'builtin' | 'external' = 'builtin'
  let shellMetrics = measureBuiltinDeviceShellMetrics(preset)
  let shellAsset: DesignAssetModel | null = null
  if (deviceConfig.shellMode === 'external') {
    const asset = ensureArray(options.assets).find(entry => normalizeString(entry.id) === deviceConfig.shellAssetId) || null
    const assetMetrics = resolveAssetShellMetrics(asset)
    const shellMetadata = resolveDesignAssetDeviceShellMetadata(asset?.metadata?.deviceShell)
    const presetKeys = shellMetadata?.presetKeys || []
    const matchesPreset = presetKeys.length === 0 || presetKeys.includes(preset.key)
    if (asset && assetMetrics && matchesPreset) {
      shellKind = 'external'
      shellAsset = asset
      shellMetrics = assetMetrics
    }
  }

  const scaleX = outerRect.width / Math.max(1, shellMetrics.width)
  const scaleY = outerRect.height / Math.max(1, shellMetrics.height)
  return {
    shellKind,
    outerRect,
    screenRect: {
      x: outerRect.x + shellMetrics.screenX * scaleX,
      y: outerRect.y + shellMetrics.screenY * scaleY,
      width: shellMetrics.screenWidth * scaleX,
      height: shellMetrics.screenHeight * scaleY,
    },
    clipRadius: shellKind === 'external'
      ? Math.max(0, Math.round(shellMetrics.cornerRadius * Math.min(scaleX, scaleY)))
      : Math.max(12, Math.round(preset.screenRadius * Math.min(scaleX, scaleY))),
    preset,
    shellAsset,
  }
}

export function resolveDesignFrameContentLayout(
  frame: DesignFrameModel,
  options: {
    assets?: DesignAssetModel[] | null | undefined
    outerRect?: DesignRect
  } = {},
): DesignFrameContentLayout | null {
  const surfaceLayout = resolveDesignFrameDeviceSurfaceLayout(frame, options)
  if (!surfaceLayout)
    return null

  const deviceConfig = resolveFrameDeviceConfig(frame)
  const scaleX = surfaceLayout.screenRect.width / Math.max(1, frame.width)
  const scaleY = surfaceLayout.screenRect.height / Math.max(1, frame.height)
  const contentScale = deviceConfig.screenScaleMode === 'fill'
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY)
  const contentWidth = frame.width * contentScale
  const contentHeight = frame.height * contentScale
  return {
    ...surfaceLayout,
    contentScale,
    contentRect: {
      x: surfaceLayout.screenRect.x + (surfaceLayout.screenRect.width - contentWidth) / 2,
      y: surfaceLayout.screenRect.y + (surfaceLayout.screenRect.height - contentHeight) / 2,
      width: contentWidth,
      height: contentHeight,
    },
  }
}

export function resolveDesignFrameProjectionLayout(
  composition: CompositionModel,
  frame: DesignFrameModel | null | undefined,
  options: {
    assets?: DesignAssetModel[] | null | undefined
    outerRect?: DesignRect
  } = {},
): DesignFrameProjectionLayout | null {
  const binding = resolveDesignFrameEditingBinding(composition, frame)
  if (!binding)
    return null

  return resolveDesignFrameProjectionLayoutForFrames(
    binding.displayFrame,
    binding.ownerFrame,
    {
      assets: options.assets,
      outerRect: options.outerRect,
    },
  )
}

export function resolveDesignFrameProjectionLayoutForFrames(
  displayFrame: DesignFrameModel | null | undefined,
  ownerFrame: DesignFrameModel | null | undefined,
  options: {
    assets?: DesignAssetModel[] | null | undefined
    outerRect?: DesignRect
  } = {},
): DesignFrameProjectionLayout | null {
  if (!displayFrame || !ownerFrame)
    return null

  const projected = normalizeString(displayFrame.id) !== normalizeString(ownerFrame.id)
  const outerRect = options.outerRect || {
    x: displayFrame.x,
    y: displayFrame.y,
    width: displayFrame.width,
    height: displayFrame.height,
  }

  if (!projected) {
    const directContentLayout = resolveDesignFrameContentLayout(displayFrame, {
      assets: options.assets,
      outerRect,
    })
    return {
      displayFrame,
      ownerFrame,
      projected: false,
      contentRect: directContentLayout?.contentRect || outerRect,
      contentScale: directContentLayout?.contentScale || 1,
      surfaceLayout: directContentLayout || null,
    }
  }

  const surfaceLayout = resolveDesignFrameDeviceSurfaceLayout(displayFrame, {
    assets: options.assets,
    outerRect,
  })
  if (!surfaceLayout) {
    const scaleX = outerRect.width / Math.max(1, ownerFrame.width)
    const scaleY = outerRect.height / Math.max(1, ownerFrame.height)
    const contentScale = Math.min(scaleX, scaleY)
    const contentWidth = ownerFrame.width * contentScale
    const contentHeight = ownerFrame.height * contentScale
    return {
      displayFrame,
      ownerFrame,
      projected: true,
      contentRect: {
        x: outerRect.x + (outerRect.width - contentWidth) / 2,
        y: outerRect.y + (outerRect.height - contentHeight) / 2,
        width: contentWidth,
        height: contentHeight,
      },
      contentScale,
      surfaceLayout: null,
    }
  }

  const deviceConfig = resolveFrameDeviceConfig(displayFrame)
  const scaleX = surfaceLayout.screenRect.width / Math.max(1, ownerFrame.width)
  const scaleY = surfaceLayout.screenRect.height / Math.max(1, ownerFrame.height)
  const contentScale = deviceConfig.screenScaleMode === 'fill'
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY)
  const contentWidth = ownerFrame.width * contentScale
  const contentHeight = ownerFrame.height * contentScale
  return {
    displayFrame,
    ownerFrame,
    projected: true,
    contentRect: {
      x: surfaceLayout.screenRect.x + (surfaceLayout.screenRect.width - contentWidth) / 2,
      y: surfaceLayout.screenRect.y + (surfaceLayout.screenRect.height - contentHeight) / 2,
      width: contentWidth,
      height: contentHeight,
    },
    contentScale,
    surfaceLayout,
  }
}

function _resolveDeviceShellTarget(
  composition: CompositionModel,
  frame: DesignFrameModel,
  preset: DeviceFramePreset,
): {
  kind: 'none' | 'builtin' | 'external'
  metrics: DeviceShellMetrics
  asset?: DesignAssetModel | null
  shellKey?: string
} {
  const deviceConfig = resolveFrameDeviceConfig(frame)
  const fallbackMetrics = measureBuiltinDeviceShellMetrics(preset)

  if (deviceConfig.shellMode === 'none') {
    return {
      kind: 'none',
      metrics: fallbackMetrics,
    }
  }

  if (deviceConfig.shellMode === 'external') {
    const asset = resolveCompositionAssetById(composition, deviceConfig.shellAssetId)
    const assetMetrics = resolveAssetShellMetrics(asset)
    const shellMetadata = resolveDesignAssetDeviceShellMetadata(asset?.metadata?.deviceShell)
    const presetKeys = shellMetadata?.presetKeys || []
    const matchesPreset = presetKeys.length === 0 || presetKeys.includes(preset.key)
    if (asset && assetMetrics && matchesPreset) {
      return {
        kind: 'external',
        metrics: assetMetrics,
        asset,
      }
    }
  }

  return {
    kind: 'builtin',
    metrics: fallbackMetrics,
    shellKey: resolveBuiltinShellKey(preset),
  }
}

function renderDeviceSafeAreaMarkup(screenRect: DesignRect): string {
  const insetX = Math.max(8, Math.round(screenRect.width * 0.045))
  const insetTop = Math.max(14, Math.round(screenRect.height * 0.06))
  const insetBottom = Math.max(14, Math.round(screenRect.height * 0.04))
  const width = Math.max(1, screenRect.width - insetX * 2)
  const height = Math.max(1, screenRect.height - insetTop - insetBottom)
  return `<rect x="${screenRect.x + insetX}" y="${screenRect.y + insetTop}" width="${width}" height="${height}" rx="${Math.max(12, Math.round(Math.min(width, height) * 0.04))}" ry="${Math.max(12, Math.round(Math.min(width, height) * 0.04))}" fill="none" stroke="rgba(56,189,248,0.55)" stroke-width="2" stroke-dasharray="10 8" />`
}

function renderImageIntoScreenMarkup(imageSrc: string, screenRect: DesignRect, clipId: string, screenScaleMode: DeviceScaleMode): string {
  return `<image href="${escapeXml(imageSrc)}" x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" preserveAspectRatio="${screenScaleMode === 'fill' ? 'xMidYMid slice' : 'xMidYMid meet'}" clip-path="url(#${clipId})" />`
}

function renderFrameContentIntoScreenMarkup(
  composition: CompositionModel,
  sourceFrame: DesignFrameModel,
  screenRect: DesignRect,
  clipId: string,
  screenScaleMode: DeviceScaleMode,
  showSafeArea: boolean,
): string {
  const themeTokens = resolveFrameThemeTokens(composition, sourceFrame)
  const elements = resolveDisplayCompositionElementsForFrame(composition, sourceFrame)
    .filter(element => !element.hidden)
  const scaleX = screenRect.width / Math.max(1, sourceFrame.width)
  const scaleY = screenRect.height / Math.max(1, sourceFrame.height)
  const contentScale = screenScaleMode === 'fill'
    ? Math.max(scaleX, scaleY)
    : Math.min(scaleX, scaleY)
  const contentWidth = sourceFrame.width * contentScale
  const contentHeight = sourceFrame.height * contentScale
  const translateX = screenRect.x + (screenRect.width - contentWidth) / 2
  const translateY = screenRect.y + (screenRect.height - contentHeight) / 2
  const elementMarkup = elements
    .map(element => renderDesignElementMarkup(element, themeTokens))
    .join('')
  const safeAreaMarkup = showSafeArea ? renderDeviceSafeAreaMarkup(screenRect) : ''
  return `<g clip-path="url(#${clipId})">
    <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" fill="${escapeXml(themeTokens.background || '#ffffff')}" />
    <g transform="translate(${translateX} ${translateY}) scale(${contentScale})">${elementMarkup}</g>
  </g>${safeAreaMarkup}`
}

function renderDevicePlaceholderMarkup(screenRect: DesignRect, clipId: string): string {
  return `<g clip-path="url(#${clipId})">
    <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" fill="#e2e8f0" />
    <text x="${screenRect.x + 18}" y="${screenRect.y + 38}" fill="#475569" font-size="16" font-weight="600">上传截图或绑定设备画板</text>
  </g>`
}

function renderScreenContentMarkup(
  composition: CompositionModel,
  targetFrame: DesignFrameModel,
  screenRect: DesignRect,
  clipId: string,
): string {
  const deviceConfig = resolveFrameDeviceConfig(targetFrame)
  const linkedFrame = resolveCompositionFrameById(composition, deviceConfig.mockupSourceFrameId)
  if (linkedFrame?.kind === 'device_artboard') {
    return renderFrameContentIntoScreenMarkup(
      composition,
      linkedFrame,
      screenRect,
      clipId,
      deviceConfig.screenScaleMode,
      deviceConfig.showSafeArea,
    )
  }

  if (targetFrame.kind === 'device_artboard') {
    return renderFrameContentIntoScreenMarkup(
      composition,
      targetFrame,
      screenRect,
      clipId,
      deviceConfig.screenScaleMode,
      deviceConfig.showSafeArea,
    )
  }

  const frameElements = resolveDisplayCompositionElementsForFrame(composition, targetFrame)
  const imageElement = frameElements.find(element => element.id === 'hero-image' || element.type === 'image')
  const imageSrc = normalizeString(imageElement?.imageSrc)
  if (imageSrc)
    return renderImageIntoScreenMarkup(imageSrc, screenRect, clipId, deviceConfig.screenScaleMode)

  return renderDevicePlaceholderMarkup(screenRect, clipId)
}

function renderBuiltinShellMarkup(
  preset: DeviceFramePreset,
  shellKey: string,
  outerRect: DesignRect,
  screenRect: DesignRect,
): string {
  const outerRadius = Math.max(16, Math.round(Math.min(outerRect.width, outerRect.height) * 0.06))
  const screenRadius = Math.max(12, Math.round(Math.min(screenRect.width, screenRect.height) * 0.04))
  const cameraDotX = outerRect.x + outerRect.width / 2
  const cameraDotY = outerRect.y + Math.max(14, Math.round(outerRect.height * 0.025))

  if (preset.deviceFamily === 'browser') {
    const chromeHeight = Math.max(48, Math.round(screenRect.y - outerRect.y))
    return `<g filter="drop-shadow(${escapeXml(preset.shadow)})">
      <rect x="${outerRect.x}" y="${outerRect.y}" width="${outerRect.width}" height="${outerRect.height}" rx="${outerRadius}" ry="${outerRadius}" fill="${escapeXml(preset.background)}" />
      <rect x="${outerRect.x}" y="${outerRect.y}" width="${outerRect.width}" height="${chromeHeight}" rx="${outerRadius}" ry="${outerRadius}" fill="#e2e8f0" />
      <circle cx="${outerRect.x + 28}" cy="${outerRect.y + chromeHeight / 2}" r="6" fill="#fb7185" />
      <circle cx="${outerRect.x + 48}" cy="${outerRect.y + chromeHeight / 2}" r="6" fill="#f59e0b" />
      <circle cx="${outerRect.x + 68}" cy="${outerRect.y + chromeHeight / 2}" r="6" fill="#10b981" />
      <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" rx="${screenRadius}" ry="${screenRadius}" fill="#ffffff" />
    </g>`
  }

  if (preset.deviceFamily === 'desktop') {
    const standWidth = Math.max(64, Math.round(outerRect.width * 0.22))
    const standHeight = Math.max(24, Math.round(outerRect.height * 0.08))
    const baseWidth = Math.max(120, Math.round(outerRect.width * 0.32))
    const baseHeight = Math.max(12, Math.round(outerRect.height * 0.03))
    const standX = outerRect.x + (outerRect.width - standWidth) / 2
    const standY = outerRect.y + outerRect.height + 8
    const baseX = outerRect.x + (outerRect.width - baseWidth) / 2
    const baseY = standY + standHeight
    return `<g filter="drop-shadow(${escapeXml(preset.shadow)})">
      <rect x="${outerRect.x}" y="${outerRect.y}" width="${outerRect.width}" height="${outerRect.height}" rx="${outerRadius}" ry="${outerRadius}" fill="${escapeXml(preset.background)}" />
      <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" rx="${screenRadius}" ry="${screenRadius}" fill="#ffffff" />
      <rect x="${standX}" y="${standY}" width="${standWidth}" height="${standHeight}" rx="${Math.round(standHeight / 2)}" ry="${Math.round(standHeight / 2)}" fill="#94a3b8" />
      <rect x="${baseX}" y="${baseY}" width="${baseWidth}" height="${baseHeight}" rx="${Math.round(baseHeight / 2)}" ry="${Math.round(baseHeight / 2)}" fill="#cbd5e1" />
    </g>`
  }

  const islandWidth = Math.max(64, Math.round(screenRect.width * (shellKey === 'iphone-16-pro-shell' || shellKey === 'iphone-16-pro-max-shell' ? 0.28 : 0.34)))
  const islandHeight = Math.max(18, Math.round(screenRect.height * 0.035))
  const islandX = screenRect.x + (screenRect.width - islandWidth) / 2
  const islandY = outerRect.y + Math.max(10, Math.round((screenRect.y - outerRect.y) * 0.5))
  const speakerWidth = Math.max(44, Math.round(screenRect.width * 0.18))
  const speakerHeight = Math.max(6, Math.round(screenRect.height * 0.008))
  const speakerX = screenRect.x + (screenRect.width - speakerWidth) / 2
  const speakerY = outerRect.y + Math.max(12, Math.round((screenRect.y - outerRect.y) * 0.58))

  return `<g filter="drop-shadow(${escapeXml(preset.shadow)})">
    <rect x="${outerRect.x}" y="${outerRect.y}" width="${outerRect.width}" height="${outerRect.height}" rx="${outerRadius}" ry="${outerRadius}" fill="${escapeXml(preset.background)}" />
    <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" rx="${screenRadius}" ry="${screenRadius}" fill="#ffffff" />
    ${shellKey === 'android-phone-shell'
        ? `<rect x="${speakerX}" y="${speakerY}" width="${speakerWidth}" height="${speakerHeight}" rx="${Math.round(speakerHeight / 2)}" ry="${Math.round(speakerHeight / 2)}" fill="#475569" opacity="0.72" />`
        : `<rect x="${islandX}" y="${islandY}" width="${islandWidth}" height="${islandHeight}" rx="${Math.round(islandHeight / 2)}" ry="${Math.round(islandHeight / 2)}" fill="#020617" />`
    }
    ${(shellKey === 'ipad-pro-11-shell' || shellKey === 'ipad-generic-shell')
        ? `<circle cx="${cameraDotX}" cy="${cameraDotY}" r="${Math.max(5, Math.round(Math.min(outerRect.width, outerRect.height) * 0.008))}" fill="#334155" opacity="0.74" />`
        : ''
    }
  </g>`
}

function renderDeviceSurfaceMarkup(
  composition: CompositionModel,
  frame: DesignFrameModel,
  preset: DeviceFramePreset,
  outerRect: DesignRect,
): string {
  const surfaceLayout = resolveDesignFrameDeviceSurfaceLayout(frame, {
    assets: composition.assets,
    outerRect,
  })
  if (!surfaceLayout)
    return ''

  const screenRect = surfaceLayout.screenRect
  const clipId = `device-screen-${sanitizeIdentifier(frame.id, 'frame')}-${Math.round(outerRect.x)}-${Math.round(outerRect.y)}`
  const shellMarkup = surfaceLayout.shellKind === 'external' && surfaceLayout.shellAsset
    ? `<image href="${escapeXml(surfaceLayout.shellAsset.src)}" x="${outerRect.x}" y="${outerRect.y}" width="${outerRect.width}" height="${outerRect.height}" preserveAspectRatio="none" />`
    : surfaceLayout.shellKind === 'builtin'
      ? renderBuiltinShellMarkup(preset, resolveBuiltinShellKey(preset), outerRect, screenRect)
      : ''
  const screenContentMarkup = renderScreenContentMarkup(composition, frame, screenRect, clipId)

  return `<defs>
    <clipPath id="${clipId}">
      <rect x="${screenRect.x}" y="${screenRect.y}" width="${screenRect.width}" height="${screenRect.height}" rx="${surfaceLayout.clipRadius}" ry="${surfaceLayout.clipRadius}" />
    </clipPath>
  </defs>
  ${shellMarkup}
  ${screenContentMarkup}`
}

function renderDesignFrameMarkup(frame: DesignFrameModel, composition: CompositionModel, offsetX: number, offsetY: number): string {
  const themeTokens = resolveFrameThemeTokens(composition, frame)
  const frameX = frame.x + offsetX
  const frameY = frame.y + offsetY
  const frameWidth = frame.width
  const frameHeight = frame.height
  const frameLabel = `<text x="${frameX + 20}" y="${frameY + 28}" fill="#94a3b8" font-size="14" font-weight="600">${escapeXml(frame.name)}</text>`
  const backgroundFill = escapeXml(themeTokens.background || '#0f172a')
  const frameElements = resolveDisplayCompositionElementsForFrame(composition, frame)
  const preset = resolveDeviceFramePreset(frame.deviceFramePresetKey || composition.deviceFramePresetKey || 'iphone-16-pro')
  const frameDeviceConfig = resolveFrameDeviceConfig(frame)

  if (frame.kind === 'diagram') {
    return `<g>
      <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="#f8fafc" stroke="#cbd5e1" />
      ${frameLabel}
      <g transform="translate(${frameX}, ${frameY + 32})">
        ${renderEmbeddedSceneMarkup(frame.embeddedScene, frameWidth, frameHeight - 40)}
      </g>
    </g>`
  }

  if (frame.kind === 'device_artboard') {
    const shellMarkup = frameDeviceConfig.shellMode === 'none'
      ? `<defs>
          <clipPath id="device-artboard-${sanitizeIdentifier(frame.id, 'frame')}">
            <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="${Math.max(12, Math.round(Math.min(frameWidth, frameHeight) * 0.04))}" ry="${Math.max(12, Math.round(Math.min(frameWidth, frameHeight) * 0.04))}" />
          </clipPath>
        </defs>
        ${renderFrameContentIntoScreenMarkup(
          composition,
          frame,
          {
            x: frameX,
            y: frameY,
            width: frameWidth,
            height: frameHeight,
          },
          `device-artboard-${sanitizeIdentifier(frame.id, 'frame')}`,
          frameDeviceConfig.screenScaleMode,
          frameDeviceConfig.showSafeArea,
        )}`
      : renderDeviceSurfaceMarkup(composition, frame, preset, {
          x: frameX,
          y: frameY,
          width: frameWidth,
          height: frameHeight,
        })
    return `<g>
      ${frameLabel}
      ${shellMarkup}
    </g>`
  }

  if (frame.kind === 'device_mockup') {
    return `<g>
      <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="${backgroundFill}" />
      ${frameLabel}
      ${renderDeviceSurfaceMarkup(composition, frame, preset, {
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
      })}
    </g>`
  }

  if (frame.kind === 'freeform' || frame.kind === 'template') {
    const clipId = `frame-freeform-clip-${sanitizeIdentifier(frame.id, 'frame')}`
    const overlayMarkup = frameElements
      .map(element => renderDesignElementMarkup(element, themeTokens, frameX, frameY))
      .join('')
    const overlayGroup = isDesignFrameClipContentEnabled(frame)
      ? `<defs>
          <clipPath id="${clipId}">
            <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" />
          </clipPath>
        </defs>
        <g clip-path="url(#${clipId})">${overlayMarkup}</g>`
      : overlayMarkup
    return `<g>
      <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="${backgroundFill}" stroke="${frame.kind === 'freeform' ? '#334155' : '#cbd5e1'}" />
      ${frameLabel}
      ${overlayGroup}
    </g>`
  }

  const elementMarkup = frameElements
    .map(element => renderDesignElementMarkup(element, themeTokens, frameX, frameY))
    .join('')
  return `<g>
    <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="${backgroundFill}" />
    ${frameLabel}
    ${elementMarkup}
  </g>`
}

function stripQuotedWrappers(value: string): string {
  return value
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\[+|\]+$/g, '')
    .replace(/^\(+|\)+$/g, '')
    .replace(/^\{+|\}+$/g, '')
    .trim()
}

function parseMermaidNodeToken(token: string, fallbackIndex: number): GraphSourceNode {
  const normalizedToken = normalizeString(token)
    .replace(/:::.*$/g, '')
    .replace(/,\s*$/g, '')
  const explicitMatch = normalizedToken.match(/^([\w.:-]+)\s*([[({].*[\])}])$/)
  if (explicitMatch) {
    const explicitId = explicitMatch[1] || `node-${fallbackIndex}`
    const explicitLabel = explicitMatch[2] || ''
    return {
      id: sanitizeIdentifier(explicitId, `node-${fallbackIndex}`),
      label: stripQuotedWrappers(explicitLabel) || explicitId,
      type: 'node',
      metadata: {},
    }
  }

  const plainMatch = normalizedToken.match(/^([\w.:-]+)$/)
  if (plainMatch) {
    const plainId = plainMatch[1] || `node-${fallbackIndex}`
    return {
      id: sanitizeIdentifier(plainId, `node-${fallbackIndex}`),
      label: plainId,
      type: 'node',
      metadata: {},
    }
  }

  const label = stripQuotedWrappers(normalizedToken)
  return {
    id: sanitizeIdentifier(label, `node-${fallbackIndex}`),
    label: label || `Node ${fallbackIndex}`,
    type: 'node',
    metadata: {},
  }
}

function upsertGraphNode(map: Map<string, GraphSourceNode>, token: string, fallbackIndex: number): GraphSourceNode {
  const parsed = parseMermaidNodeToken(token, fallbackIndex)
  const existing = map.get(parsed.id)
  if (existing)
    return existing
  map.set(parsed.id, parsed)
  return parsed
}

function parseMermaidDiagramTypeHint(line: string): GraphSourceModel['diagramType'] | null {
  const match = normalizeString(line).match(/^%%\s*diagramType\s*:\s*(flowchart|mindmap|relationship|architecture)\s*$/i)
  if (!match?.[1])
    return null
  return match[1].toLowerCase() as GraphSourceModel['diagramType']
}

function parseMermaidGroupHint(line: string): GraphSourceGroup | null {
  const match = normalizeString(line).match(/^%%\s*group\s*:\s*(\{.+\})\s*$/i)
  if (!match?.[1])
    return null

  try {
    return normalizeGraphSourceGroup(JSON.parse(match[1]), 0)
  }
  catch {
    return null
  }
}

function findEdgeOperator(line: string, operators: readonly string[]): ParsedEdgeOperatorMatch | null {
  let matched: ParsedEdgeOperatorMatch | null = null
  for (const operator of operators) {
    const index = line.indexOf(operator)
    if (index < 0)
      continue
    if (!matched || index < matched.index || (index === matched.index && operator.length > matched.operator.length))
      matched = { index, operator }
  }
  return matched
}

function parseMermaidEdgeLine(line: string): ParsedMermaidEdgeLine | null {
  const operatorMatch = findEdgeOperator(line, MERMAID_EDGE_OPERATORS)
  if (!operatorMatch)
    return null

  const sourceToken = normalizeString(line.slice(0, operatorMatch.index))
  if (!sourceToken)
    return null

  const remainder = line.slice(operatorMatch.index + operatorMatch.operator.length).trim()
  if (!remainder)
    return null

  let label = ''
  let targetToken = remainder
  if (remainder.startsWith('|')) {
    const labelEndIndex = remainder.indexOf('|', 1)
    if (labelEndIndex < 0)
      return null
    label = remainder.slice(1, labelEndIndex).trim()
    targetToken = remainder.slice(labelEndIndex + 1).trim()
  }

  if (!targetToken)
    return null

  return {
    sourceToken,
    label,
    targetToken,
    operator: operatorMatch.operator,
  }
}

function parseArchitectureRelationLine(line: string): ParsedRelationLine | null {
  const operatorMatch = findEdgeOperator(line, ARCHITECTURE_EDGE_OPERATORS)
  if (!operatorMatch)
    return null

  const sourceToken = normalizeString(line.slice(0, operatorMatch.index))
  const targetToken = normalizeString(line.slice(operatorMatch.index + operatorMatch.operator.length))
  if (!sourceToken || !targetToken)
    return null

  return {
    sourceToken,
    targetToken,
    operator: operatorMatch.operator,
  }
}

export function importFromMermaid(sourceText: string): SceneDocument {
  const graphNodes = new Map<string, GraphSourceNode>()
  const graphGroups = new Map<string, GraphSourceGroup>()
  const graphEdges: GraphSourceEdge[] = []
  let diagramType: GraphSourceModel['diagramType'] = 'flowchart'
  let hasDiagramTypeHint = false
  const lines: string[] = []

  for (const rawLine of String(sourceText || '')
    .replace(/\r/g, '')
    .split('\n')
    .flatMap(line => line.split(';'))) {
    const hintedDiagramType = parseMermaidDiagramTypeHint(rawLine)
    if (hintedDiagramType) {
      diagramType = hintedDiagramType
      hasDiagramTypeHint = true
      continue
    }

    const hintedGroup = parseMermaidGroupHint(rawLine)
    if (hintedGroup) {
      graphGroups.set(hintedGroup.id, hintedGroup)
      continue
    }

    const normalizedLine = rawLine.replace(/%%.*$/g, '').trim()
    if (normalizedLine)
      lines.push(normalizedLine)
  }

  for (const [index, line] of lines.entries()) {
    if (/^(?:graph|flowchart)\b/i.test(line)) {
      if (!hasDiagramTypeHint)
        diagramType = 'flowchart'
      continue
    }
    if (/^mindmap\b/i.test(line)) {
      if (!hasDiagramTypeHint)
        diagramType = 'mindmap'
      continue
    }
    if (/^(?:subgraph|end|classDef|class|style|linkStyle)\b/i.test(line))
      continue

    const parsedEdge = parseMermaidEdgeLine(line)
    if (parsedEdge) {
      const sourceNode = upsertGraphNode(graphNodes, parsedEdge.sourceToken, index * 2 + 1)
      const targetNode = upsertGraphNode(graphNodes, parsedEdge.targetToken, index * 2 + 2)
      graphEdges.push({
        id: sanitizeIdentifier(`${sourceNode.id}-${targetNode.id}-${graphEdges.length + 1}`, `edge-${graphEdges.length + 1}`),
        source: sourceNode.id,
        target: targetNode.id,
        label: normalizeString(parsedEdge.label) || undefined,
        metadata: {
          mermaidOperator: parsedEdge.operator,
        },
      })
      continue
    }

    const node = parseMermaidNodeToken(line, index + 1)
    graphNodes.set(node.id, node)
  }

  const parentGroupByNodeId = new Map<string, string>()
  for (const group of graphGroups.values()) {
    for (const childNodeId of group.childNodeIds || []) {
      if (!parentGroupByNodeId.has(childNodeId))
        parentGroupByNodeId.set(childNodeId, group.id)
    }
  }

  const normalizedGraphNodes = [...graphNodes.values()].map((node) => {
    const parentGroupId = parentGroupByNodeId.get(node.id)
    if (!parentGroupId)
      return node
    return {
      ...node,
      parentId: node.parentId || parentGroupId,
    }
  })

  const sourceModel: GraphSourceModel = {
    kind: 'graph',
    diagramType,
    nodes: normalizedGraphNodes,
    edges: graphEdges,
    groups: [...graphGroups.values()],
    sourceText: normalizeString(sourceText),
    metadata: {},
  }

  return relayoutSceneDocument({
    ...createEmptySceneDocument({
      drawMode: 'diagram',
      sourceType: 'mermaid',
    }),
    drawMode: 'diagram',
    sourceType: 'mermaid',
    sourceModel,
  })
}

function parseOutlineDepth(line: string): { depth: number, label: string } | null {
  const normalized = line.replace(/\t/g, '  ')
  const headingPrefix = normalized.match(/^#{1,6}\s+/)
  if (headingPrefix?.[0]) {
    const label = normalizeString(normalized.slice(headingPrefix[0].length))
    if (label)
      return { depth: headingPrefix[0].trim().length, label }
  }

  const indent = normalized.match(/^\s*/)?.[0].length || 0
  const trimmed = normalized.trim()
  const bulletPrefix = trimmed.match(/^(?:[-*+]|\d+\.)\s+/)
  if (!bulletPrefix?.[0])
    return null
  return {
    depth: Math.floor(indent / 2) + 1,
    label: normalizeString(trimmed.slice(bulletPrefix[0].length)),
  }
}

export function importFromMarkdownOutline(sourceText: string): SceneDocument {
  const nodes: GraphSourceNode[] = []
  const edges: GraphSourceEdge[] = []
  const stack: Array<{ depth: number, id: string }> = []
  const lines = String(sourceText || '').replace(/\r/g, '').split('\n')

  lines.forEach((line, index) => {
    const parsed = parseOutlineDepth(line)
    if (!parsed?.label)
      return

    const id = `outline-${index + 1}`
    nodes.push({
      id,
      label: parsed.label,
      type: parsed.depth === 1 ? 'root' : 'topic',
      metadata: {
        depth: parsed.depth,
      },
    })

    while (stack.length > 0 && stack[stack.length - 1]!.depth >= parsed.depth)
      stack.pop()

    const parent = stack[stack.length - 1]
    if (parent) {
      edges.push({
        id: `outline-edge-${edges.length + 1}`,
        source: parent.id,
        target: id,
        metadata: {},
      })
    }

    stack.push({ depth: parsed.depth, id })
  })

  return relayoutSceneDocument({
    ...createEmptySceneDocument({
      drawMode: 'diagram',
      sourceType: 'markdown_outline',
    }),
    drawMode: 'diagram',
    sourceType: 'markdown_outline',
    sourceModel: {
      kind: 'graph',
      diagramType: 'mindmap',
      nodes,
      edges,
      groups: [],
      sourceText: normalizeString(sourceText),
      metadata: {},
    },
  })
}

function inferSqlDialect(sourceText: string): SchemaModel['dialect'] {
  const normalized = sourceText.toLowerCase()
  if (normalized.includes('jsonb') || normalized.includes('serial'))
    return 'postgres'
  if (normalized.includes('engine=') || normalized.includes('auto_increment'))
    return 'mysql'
  return 'generic'
}

function cleanSqlIdentifier(value: string): string {
  return normalizeString(value)
    .replace(/^["`[]+|["`\]]+$/g, '')
    .replace(/\s+/g, '')
}

function quoteSqlIdentifier(value: string): string {
  const normalized = cleanSqlIdentifier(value)
  if (!normalized)
    return '""'
  return `"${normalized.replace(/"/g, '""')}"`
}

function formatQualifiedTableName(table: Pick<SchemaTableModel, 'name' | 'schemaName'>): string {
  const tableName = quoteSqlIdentifier(table.name)
  const schemaName = normalizeString(table.schemaName)
  return schemaName ? `${quoteSqlIdentifier(schemaName)}.${tableName}` : tableName
}

function formatSqlDefaultValue(value: string | undefined): string {
  const normalized = normalizeString(value)
  return normalized || ''
}

function splitSqlDefinitions(sourceText: string): string[] {
  const items: string[] = []
  let current = ''
  let depth = 0
  for (const char of sourceText) {
    if (char === '(')
      depth += 1
    else if (char === ')')
      depth = Math.max(0, depth - 1)

    if (char === ',' && depth === 0) {
      if (normalizeString(current))
        items.push(normalizeString(current))
      current = ''
      continue
    }
    current += char
  }

  if (normalizeString(current))
    items.push(normalizeString(current))
  return items
}

function parseQualifiedTableName(rawValue: string): { schemaName?: string, tableName: string } {
  const normalized = cleanSqlIdentifier(rawValue)
  const [left, right] = normalized.split('.')
  if (right)
    return { schemaName: left, tableName: right }
  return { tableName: left || normalized || 'unnamed_table' }
}

function extractSqlDefaultValue(remainder: string): string | undefined {
  const defaultKeyword = /\bdefault\b/i.exec(remainder)
  if (!defaultKeyword)
    return undefined

  const defaultTail = remainder.slice((defaultKeyword.index || 0) + defaultKeyword[0].length).trim()
  if (!defaultTail)
    return undefined

  let endIndex = defaultTail.length
  const boundaryPatterns = [
    /\s+not null\b/i,
    /\s+null\b/i,
    /\s+primary key\b/i,
    /\s+references\b/i,
    /\s+unique\b/i,
    /\s+constraint\b/i,
    /\s+check\b/i,
    /\s+comment\b/i,
  ]
  for (const pattern of boundaryPatterns) {
    const match = pattern.exec(defaultTail)
    if (match && match.index < endIndex)
      endIndex = match.index
  }

  const defaultValue = normalizeString(defaultTail.slice(0, endIndex))
  return defaultValue || undefined
}

function parseColumnDefinition(rawValue: string): SchemaColumnModel | null {
  const normalized = normalizeString(rawValue)
  if (!normalized)
    return null

  const namePrefix = normalized.match(/^[\w"`[\].-]+\s+/)
  if (!namePrefix?.[0])
    return null

  const name = cleanSqlIdentifier(namePrefix[0].trim())
  const remainder = normalizeString(normalized.slice(namePrefix[0].length))
  if (!name || !remainder)
    return null

  const constraintIndex = remainder.search(/\b(not null|null|default|primary key|references|unique|constraint|check|comment)\b/i)
  const type = constraintIndex >= 0 ? remainder.slice(0, constraintIndex).trim() : remainder
  const referencesMatch = remainder.match(/\breferences\s+([\w"`.[\]-]+)\s*\(([^)]+)\)/i)

  return {
    name,
    type: type || 'text',
    nullable: !/\bnot null\b/i.test(remainder),
    defaultValue: extractSqlDefaultValue(remainder),
    isPrimaryKey: /\bprimary key\b/i.test(remainder),
    referencesTable: normalizeString(referencesMatch?.[1] ? parseQualifiedTableName(referencesMatch[1]).tableName : ''),
    referencesColumn: normalizeString(referencesMatch?.[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean)[0],
    metadata: {},
  }
}

export function importFromDDL(sourceText: string): SchemaImportResult {
  const tables: SchemaTableModel[] = []
  const warnings: string[] = []
  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w"`.[\]-]+)\s*\(([\s\S]*?)\)\s*;/gi
  let matched = createTableRegex.exec(sourceText)

  while (matched) {
    const tableRef = parseQualifiedTableName(matched[1] || '')
    const definitions = splitSqlDefinitions(matched[2] || '')
    const columns: SchemaColumnModel[] = []
    const foreignKeys: SchemaForeignKeyModel[] = []
    const primaryKeys: string[] = []
    const indexes: SchemaIndexModel[] = []

    for (const definition of definitions) {
      const normalized = normalizeString(definition)
      if (!normalized)
        continue

      const fkMatch = normalized.match(/^(?:constraint\s+([\w"`-]+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([\w"`.[\]-]+)\s*\(([^)]+)\)/i)
      if (fkMatch) {
        foreignKeys.push({
          name: cleanSqlIdentifier(fkMatch[1] || ''),
          columns: normalizeString(fkMatch[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean),
          referencedTable: parseQualifiedTableName(fkMatch[3] || '').tableName,
          referencedColumns: normalizeString(fkMatch[4]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean),
          metadata: {},
        })
        continue
      }

      const pkMatch = normalized.match(/^(?:constraint\s+([\w"`-]+)\s+)?primary\s+key\s*\(([^)]+)\)/i)
      if (pkMatch) {
        primaryKeys.push(...normalizeString(pkMatch[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean))
        continue
      }

      const uniqueMatch = normalized.match(/^(?:constraint\s+([\w"`-]+)\s+)?unique\s*\(([^)]+)\)/i)
      if (uniqueMatch) {
        indexes.push({
          name: cleanSqlIdentifier(uniqueMatch[1] || `uniq_${indexes.length + 1}`),
          columns: normalizeString(uniqueMatch[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean),
          unique: true,
          metadata: {},
        })
        continue
      }

      const column = parseColumnDefinition(normalized)
      if (!column)
        continue
      columns.push(column)
      if (column.isPrimaryKey)
        primaryKeys.push(column.name)
      if (column.referencesTable && column.referencesColumn) {
        foreignKeys.push({
          columns: [column.name],
          referencedTable: column.referencesTable,
          referencedColumns: [column.referencesColumn],
          metadata: {},
        })
      }
    }

    tables.push({
      name: tableRef.tableName,
      schemaName: tableRef.schemaName,
      columns,
      primaryKeys: [...new Set(primaryKeys)],
      foreignKeys,
      indexes,
      metadata: {},
    })

    matched = createTableRegex.exec(sourceText)
  }

  if (tables.length === 0)
    warnings.push('未在输入中识别到 CREATE TABLE 语句。')

  const schemaModel: SchemaModel = {
    kind: 'schema',
    dialect: inferSqlDialect(sourceText),
    tables,
    types: [],
    comments: [],
    metadata: {},
  }
  const sceneDocument = relayoutSceneDocument({
    ...createEmptySceneDocument({
      drawMode: 'schema',
      sourceType: 'ddl',
    }),
    drawMode: 'schema',
    sourceType: 'ddl',
    sourceModel: schemaModel,
  })

  return {
    schemaModel,
    sceneDocument,
    warnings,
  }
}

export function exportSchemaModelToDDL(schemaInput: SchemaModel | SceneDocument | unknown): string {
  const normalizedDocument = sceneDocumentFromUnknown(schemaInput)
  const schemaModel = normalizedDocument.sourceModel.kind === 'schema'
    ? normalizedDocument.sourceModel
    : normalizeSchemaModel(schemaInput)

  if (!schemaModel.tables.length)
    return ''

  const statements = schemaModel.tables.map((table) => {
    const definitions: string[] = []
    const primaryKeySet = new Set((table.primaryKeys || []).map(key => cleanSqlIdentifier(key)))

    for (const column of table.columns || []) {
      const columnSegments = [
        quoteSqlIdentifier(column.name),
        normalizeString(column.type) || 'text',
      ]

      if (!column.nullable)
        columnSegments.push('NOT NULL')

      const defaultValue = formatSqlDefaultValue(column.defaultValue)
      if (defaultValue)
        columnSegments.push(`DEFAULT ${defaultValue}`)

      if (primaryKeySet.size <= 1 && primaryKeySet.has(cleanSqlIdentifier(column.name)))
        columnSegments.push('PRIMARY KEY')

      definitions.push(`  ${columnSegments.join(' ')}`)
    }

    if (primaryKeySet.size > 1) {
      definitions.push(`  PRIMARY KEY (${[...primaryKeySet].map(column => quoteSqlIdentifier(column)).join(', ')})`)
    }

    for (const foreignKey of table.foreignKeys || []) {
      if (!foreignKey.columns?.length || !foreignKey.referencedTable || !foreignKey.referencedColumns?.length)
        continue
      const constraintName = normalizeString(foreignKey.name)
      const prefix = constraintName ? `CONSTRAINT ${quoteSqlIdentifier(constraintName)} ` : ''
      definitions.push(
        `  ${prefix}FOREIGN KEY (${foreignKey.columns.map(column => quoteSqlIdentifier(column)).join(', ')}) REFERENCES ${quoteSqlIdentifier(foreignKey.referencedTable)} (${foreignKey.referencedColumns.map(column => quoteSqlIdentifier(column)).join(', ')})`,
      )
    }

    const createTableSql = `CREATE TABLE ${formatQualifiedTableName(table)} (\n${definitions.join(',\n')}\n);`

    const indexStatements = (table.indexes || [])
      .filter(index => index.columns?.length)
      .map((index) => {
        const indexName = normalizeString(index.name) || `idx_${table.name}_${index.columns.join('_')}`
        const uniquePrefix = index.unique ? 'UNIQUE ' : ''
        return `CREATE ${uniquePrefix}INDEX ${quoteSqlIdentifier(indexName)} ON ${formatQualifiedTableName(table)} (${index.columns.map(column => quoteSqlIdentifier(column)).join(', ')});`
      })

    return [createTableSql, ...indexStatements].join('\n')
  })

  return `${statements.join('\n\n')}\n`
}

export function exportArchitectureModelToMermaid(
  architectureInput: ArchitectureModel | SceneDocument | unknown,
  viewInput: ArchitectureMermaidView | unknown = 'dependency_map',
): string {
  const normalizedDocument = sceneDocumentFromUnknown(architectureInput)
  const architectureModel = normalizedDocument.sourceModel.kind === 'architecture'
    ? normalizedDocument.sourceModel
    : normalizeArchitectureModel(architectureInput)
  const view = normalizeArchitectureMermaidView(viewInput)
  const viewNodes = resolveArchitectureMermaidNodes(architectureModel, view)

  if (viewNodes.length === 0)
    return `flowchart TD\n  empty["No architecture nodes for ${view}"]`

  const lines: string[] = ['flowchart TD']
  const renderedNodeIds = new Set<string>()
  const allowedNodeIds = new Set<string>()
  const relationPairs = new Set<string>()

  function mermaidNodeShape(node: ArchitectureElementModel): string {
    const label = String(node.label || node.id || 'Unnamed')
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
    if (node.type === 'database')
      return `${node.id}[("${label}")]`
    if (node.type === 'queue')
      return `${node.id}{{"${label}"}}`
    if (node.type === 'external')
      return `${node.id}[/"${label}"/]`
    if (node.type === 'system')
      return `${node.id}(("${label}"))`
    if (node.type === 'interface')
      return `${node.id}["${label}"]`
    return `${node.id}["${label}"]`
  }

  for (const node of viewNodes) {
    const nodeId = sanitizeIdentifier(node.id, 'node')
    if (renderedNodeIds.has(nodeId))
      continue
    renderedNodeIds.add(nodeId)
    allowedNodeIds.add(nodeId)
    lines.push(`  ${mermaidNodeShape({ ...node, id: nodeId })}`)
  }

  for (const relation of architectureModel.relations || []) {
    const source = sanitizeIdentifier(relation.source, '')
    const target = sanitizeIdentifier(relation.target, '')
    if (!source || !target || !allowedNodeIds.has(source) || !allowedNodeIds.has(target))
      continue
    const relationLabel = normalizeString(relation.label || relation.protocol)
      .replace(/"/g, '\\"')
    const relationKey = `${source}->${target}:${relationLabel}`
    if (relationPairs.has(relationKey))
      continue
    relationPairs.add(relationKey)
    lines.push(`  ${source} -->${relationLabel ? `|"${relationLabel}"|` : ''} ${target}`)
  }

  return `${lines.join('\n')}\n`
}

function normalizeArchitectureMermaidView(value: unknown, fallback: ArchitectureMermaidView = 'dependency_map'): ArchitectureMermaidView {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'system_context' || normalized === 'container' || normalized === 'dependency_map')
    return normalized
  return fallback
}

function resolveArchitectureMermaidNodes(architectureModel: ArchitectureModel, view: ArchitectureMermaidView): ArchitectureElementModel[] {
  if (view === 'system_context') {
    return [
      ...(architectureModel.systems || []),
      ...(architectureModel.services || []),
      ...(architectureModel.databases || []),
      ...(architectureModel.externalDependencies || []),
    ]
  }

  if (view === 'container') {
    return [
      ...(architectureModel.services || []),
      ...(architectureModel.databases || []),
      ...(architectureModel.queues || []),
      ...((architectureModel.interfaces || []) as ArchitectureElementModel[]),
    ]
  }

  return [
    ...(architectureModel.systems || []),
    ...(architectureModel.services || []),
    ...(architectureModel.components || []),
    ...(architectureModel.databases || []),
    ...(architectureModel.queues || []),
    ...(architectureModel.externalDependencies || []),
    ...((architectureModel.interfaces || []) as ArchitectureElementModel[]),
  ]
}

function inferArchitectureElementType(label: string): string {
  const normalized = label.toLowerCase()
  if (/db|database|postgres|mysql|redis|mongo/.test(normalized))
    return 'database'
  if (/queue|topic|kafka|mq|stream/.test(normalized))
    return 'queue'
  if (/client|web|app|mobile|mini/.test(normalized))
    return 'component'
  if (/external|third|partner|stripe|slack|openai/.test(normalized))
    return 'external'
  return 'service'
}

function parseArchitecturePayload(source: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof source !== 'string')
    return normalizeRecord(source)

  const normalized = normalizeString(source)
  if (!normalized)
    return {}

  try {
    return normalizeRecord(JSON.parse(normalized))
  }
  catch {
    try {
      return normalizeRecord(YAML.parse(normalized))
    }
    catch {
      return { text: source }
    }
  }
}

function inferProtocolFromValue(value: unknown): string | undefined {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized)
    return undefined
  if (normalized.includes('http'))
    return 'http'
  if (normalized.includes('https'))
    return 'https'
  if (normalized.includes('grpc'))
    return 'grpc'
  if (normalized.includes('tcp'))
    return 'tcp'
  if (normalized.includes('amqp'))
    return 'amqp'
  return normalized
}

function normalizePackageDependencyMap(payload: Record<string, unknown>): Record<string, string> {
  const dependencyMaps = [
    normalizeRecord(payload.dependencies),
    normalizeRecord(payload.devDependencies),
    normalizeRecord(payload.peerDependencies),
    normalizeRecord(payload.optionalDependencies),
  ]

  const result: Record<string, string> = {}
  for (const entry of dependencyMaps) {
    for (const [name, versionRange] of Object.entries(entry)) {
      const normalizedName = normalizeString(name)
      if (!normalizedName)
        continue
      result[normalizedName] = normalizeString(versionRange)
    }
  }
  return result
}

function normalizeWorkspacePackagePayloads(payload: Record<string, unknown>): Record<string, unknown>[] {
  const packageManifests = ensureArray(payload.packageManifests)
    .map(entry => normalizeRecord(entry))
    .filter(entry => Object.keys(entry).length > 0)
  if (packageManifests.length > 0)
    return packageManifests

  return ensureArray(payload.packages)
    .map(entry => normalizeRecord(entry))
    .filter(entry => Object.keys(entry).length > 0)
}

function inferWorkspacePackageType(packageName: string, packagePath: string): 'service' | 'component' {
  const normalizedPath = normalizeString(packagePath).toLowerCase()
  if (
    normalizedPath.startsWith('apps/')
    || normalizedPath.startsWith('app/')
    || normalizedPath.startsWith('services/')
    || normalizedPath.startsWith('service/')
  ) {
    return 'service'
  }

  const normalizedName = normalizeString(packageName).toLowerCase()
  if (/web|api|server|worker|gateway|service|app/.test(normalizedName))
    return 'service'

  return 'component'
}

function buildArchitectureFromDockerCompose(payload: Record<string, unknown>): ArchitectureImportResult | null {
  const servicesPayload = normalizeRecord(payload.services)
  const serviceEntries = Object.entries(servicesPayload)
  if (serviceEntries.length === 0)
    return null

  const warnings: string[] = []
  const services: ArchitectureElementModel[] = []
  const databases: ArchitectureElementModel[] = []
  const queues: ArchitectureElementModel[] = []
  const externalDependencies: ArchitectureElementModel[] = []
  const relations: ArchitectureRelationModel[] = []
  const seen = new Map<string, ArchitectureElementModel>()

  function ensureElement(rawLabel: string, preferredType?: string): ArchitectureElementModel {
    const label = normalizeString(rawLabel) || 'unnamed'
    const id = sanitizeIdentifier(label, `compose-${seen.size + 1}`)
    const existing = seen.get(id)
    if (existing)
      return existing

    const type = preferredType || inferArchitectureElementType(label)
    const element: ArchitectureElementModel = {
      id,
      label,
      type,
      metadata: {},
    }
    seen.set(id, element)

    if (type === 'database')
      databases.push(element)
    else if (type === 'queue')
      queues.push(element)
    else if (type === 'external')
      externalDependencies.push(element)
    else
      services.push(element)

    return element
  }

  for (const [serviceName, rawServiceConfig] of serviceEntries) {
    const serviceConfig = normalizeRecord(rawServiceConfig)
    const image = normalizeString(serviceConfig.image)
    const serviceType = inferArchitectureElementType(image || serviceName)
    const service = ensureElement(serviceName, serviceType === 'service' ? 'service' : serviceType)

    const dependsOnValue = serviceConfig.depends_on
    const dependencyNames = Array.isArray(dependsOnValue)
      ? dependsOnValue.map(item => normalizeString(item)).filter(Boolean)
      : Object.keys(normalizeRecord(dependsOnValue)).map(item => normalizeString(item)).filter(Boolean)

    dependencyNames.forEach((dependencyName) => {
      const target = ensureElement(dependencyName)
      relations.push({
        id: `compose-relation-${relations.length + 1}`,
        source: service.id,
        target: target.id,
        label: 'depends_on',
        metadata: {},
      })
    })

    const ports = ensureArray(serviceConfig.ports).map(item => normalizeString(item)).filter(Boolean)
    const environmentKeys = Object.keys(normalizeRecord(serviceConfig.environment))
    if (ports.length > 0 || environmentKeys.length > 0) {
      service.metadata = {
        ...service.metadata,
        image,
        ports,
        environmentKeys,
      }
    }
  }

  if (services.length + databases.length + queues.length + externalDependencies.length === 0)
    warnings.push('docker-compose 中未识别到可用于架构图的服务。')

  const architectureModel: ArchitectureModel = {
    kind: 'architecture',
    systems: [],
    services,
    components: [],
    databases,
    queues,
    externalDependencies,
    interfaces: [],
    relations,
    metadata: {
      sourceKind: 'docker-compose',
    },
  }

  return {
    architectureModel,
    sceneDocument: relayoutSceneDocument({
      ...createEmptySceneDocument({
        drawMode: 'architecture',
        sourceType: 'repo_arch',
      }),
      drawMode: 'architecture',
      sourceType: 'repo_arch',
      sourceModel: architectureModel,
    }),
    warnings,
  }
}

function resolveCompositionDocumentState(
  document: SceneDocument | CompositionModel | unknown,
): { base: SceneDocument, composition: CompositionModel } {
  if (isRecord(document) && normalizeString(document.kind) === 'composition') {
    const templateKey = normalizeString(document.templateKey) || 'device-showcase'
    return {
      base: createEmptySceneDocument({
        drawMode: 'composition',
        sourceType: 'image_mockup',
        templateKey,
        editorEngine: 'vueflow',
      }),
      composition: normalizeCompositionModel(document, templateKey),
    }
  }

  const base = sceneDocumentFromUnknown(document, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })

  if (base.sourceModel.kind === 'composition') {
    return {
      base: {
        ...base,
        drawMode: 'composition',
        sourceType: normalizeSceneSourceType(base.sourceType, 'image_mockup'),
        editorEngine: 'vueflow',
      },
      composition: normalizeCompositionModel(base.sourceModel, base.templateKey || 'device-showcase'),
    }
  }

  const templateKey = normalizeString(base.templateKey) || 'device-showcase'
  return {
    base: {
      ...createEmptySceneDocument({
        drawMode: 'composition',
        sourceType: 'image_mockup',
        templateKey,
        editorEngine: 'vueflow',
      }),
      metadata: normalizeRecord(base.metadata),
    },
    composition: defaultCompositionModel(templateKey),
  }
}

function deriveLegacySlotsFromFrame(composition: CompositionModel, frame: DesignFrameModel | undefined): Record<string, unknown> {
  if (!frame)
    return {}

  const elements = resolveCompositionElementsForFrame(composition, frame.id)
  const title = elements.find(element => element.id === 'title') || elements.find(element => element.type === 'text')
  const subtitle = elements.find(element => element.id === 'subtitle') || elements.find(element => element.type === 'caption')
  const badge = elements.find(element => element.id === 'badge') || elements.find(element => element.type === 'badge')
  const image = elements.find(element => element.id === 'hero-image') || elements.find(element => element.type === 'image')

  return {
    ...(normalizeString(title?.text) ? { title: normalizeString(title?.text) } : {}),
    ...(normalizeString(subtitle?.text) ? { subtitle: normalizeString(subtitle?.text) } : {}),
    ...(normalizeString(badge?.text) ? { badge: normalizeString(badge?.text) } : {}),
    ...(normalizeString(image?.imageSrc) ? { imageSrc: normalizeString(image?.imageSrc) } : {}),
  }
}

function syncCompositionFrameIds(composition: CompositionModel): CompositionModel {
  const rawPages = ensureArray(composition.pages)
  const pages = (rawPages.length > 0
    ? rawPages
    : [createDefaultDesignPage({
        id: DEFAULT_COMPOSITION_PAGE_ID,
      })]).map((page, index) => {
    return createDefaultDesignPage({
      ...page,
      id: sanitizeIdentifier(page.id, `page-${index + 1}`),
      name: normalizeString(page.name) || `Page ${index + 1}`,
      background: normalizeString(page.background) || '#0b1220',
      frameIds: [],
      viewport: {
        x: toFiniteNumber(page.viewport?.x, 0),
        y: toFiniteNumber(page.viewport?.y, 0),
        zoom: toFiniteNumber(page.viewport?.zoom, 1) || 1,
      },
      metadata: normalizeRecord(page.metadata),
    })
  })
  const fallbackPageId = pages[0]?.id || DEFAULT_COMPOSITION_PAGE_ID
  const pageIds = new Set(pages.map(page => page.id))
  const frames = ensureArray(composition.frames).map((frame, index) => {
    const pageId = pageIds.has(normalizeString(frame.pageId)) ? normalizeString(frame.pageId) : fallbackPageId
    return normalizeDesignFrameModel({
      ...frame,
      pageId,
    }, index, fallbackPageId)
  })
  const frameIdsByPage = new Map<string, string[]>()
  pages.forEach((page) => {
    frameIdsByPage.set(page.id, [])
  })
  frames.forEach((frame) => {
    const bucket = frameIdsByPage.get(frame.pageId) || []
    if (!bucket.includes(frame.id))
      bucket.push(frame.id)
    frameIdsByPage.set(frame.pageId, bucket)
  })
  const normalizedPages = pages.map(page => ({
    ...page,
    frameIds: frameIdsByPage.get(page.id) || [],
  }))
  const currentPageId = normalizedPages.some(page => page.id === normalizeString(composition.currentPageId))
    ? normalizeString(composition.currentPageId)
    : normalizedPages[0]?.id || DEFAULT_COMPOSITION_PAGE_ID
  const frameIdSet = new Set(frames.map(frame => frame.id))
  const elements = ensureArray(composition.elements).map((element, index) => {
    const normalizedFrameId = normalizeString(element.frameId)
    const frame = normalizedFrameId ? frames.find(item => item.id === normalizedFrameId) : null
    const pageId = frame?.pageId || (pageIds.has(normalizeString(element.pageId)) ? normalizeString(element.pageId) : fallbackPageId)
    return createDesignElement({
      ...element,
      pageId,
      frameId: normalizedFrameId && frameIdSet.has(normalizedFrameId) ? normalizedFrameId : undefined,
      zIndex: toFiniteNumber(element.zIndex, index),
    }, element.id || `element-${index + 1}`)
  })

  return syncCompositionFrameLegacyElements({
    ...composition,
    pages: normalizedPages,
    currentPageId,
    frames,
    elements,
  })
}

function finalizeCompositionSceneDocument(base: SceneDocument, composition: CompositionModel): SceneDocument {
  const syncedComposition = syncCompositionFrameIds(composition)
  const currentPageId = normalizeString(syncedComposition.currentPageId) || syncedComposition.pages?.[0]?.id || DEFAULT_COMPOSITION_PAGE_ID
  const currentPageFrames = ensureArray(syncedComposition.frames).filter(frame => normalizeString(frame.pageId) === currentPageId)
  const preferredFrame = currentPageFrames.find(frame => frame.kind === 'device_mockup' || frame.kind === 'template') || currentPageFrames[0]
  const nextComposition: CompositionModel = {
    ...syncedComposition,
    templateKey: normalizeString(preferredFrame?.templateKey) || syncedComposition.templateKey,
    deviceFramePresetKey: normalizeString(preferredFrame?.deviceFramePresetKey) || syncedComposition.deviceFramePresetKey,
    slots: preferredFrame
      ? {
          ...normalizeRecord(syncedComposition.slots),
          ...deriveLegacySlotsFromFrame(syncedComposition, preferredFrame),
        }
      : normalizeRecord(syncedComposition.slots),
    themeTokens: normalizeThemeTokens(
      syncedComposition.themeTokens,
      defaultCompositionModel(normalizeString(syncedComposition.templateKey) || 'device-showcase').themeTokens,
    ),
  }

  return relayoutSceneDocument({
    ...base,
    drawMode: 'composition',
    sourceType: normalizeSceneSourceType(base.sourceType, 'image_mockup'),
    templateKey: nextComposition.templateKey,
    editorEngine: 'vueflow',
    sourceModel: nextComposition,
  })
}

function resolveDesignFrameDefaultName(kind: DesignFrameKind, index: number): string {
  if (kind === 'diagram')
    return `图表 Frame ${index}`
  if (kind === 'device_artboard')
    return `设备画板 ${index}`
  if (kind === 'device_mockup')
    return `设备 Frame ${index}`
  if (kind === 'template')
    return `模板 Frame ${index}`
  return `自由 Frame ${index}`
}

function resolveDefaultFrameSize(
  kind: DesignFrameKind,
  aspectRatio = '16:9',
  deviceFramePresetKey = '',
): { width: number, height: number } {
  if (kind === 'diagram')
    return { width: 1080, height: 720 }
  if (kind === 'freeform')
    return { width: 960, height: 640 }
  if (kind === 'device_artboard') {
    const preset = resolveDeviceFramePreset(deviceFramePresetKey)
    return {
      width: preset.screenWidth,
      height: preset.screenHeight,
    }
  }

  const size = resolveAspectRatioSize(aspectRatio)
  return {
    width: Math.round(size.width * 0.78),
    height: Math.round(size.height * 0.78),
  }
}

function createDesignFrameFromInput(
  input: Partial<DesignFrameModel> & {
    aspectRatio?: string
    slots?: Record<string, unknown>
    title?: string
    subtitle?: string
    badge?: string
    imageSrc?: string
  },
  composition: CompositionModel,
  fallbackPageId: string,
): DesignFrameModel {
  const pageId = sanitizeIdentifier(input.pageId, fallbackPageId)
  const kind = normalizeDesignFrameKind(input.kind || 'freeform')
  const frameId = normalizeString(input.id) || `frame-${Date.now()}`
  const pageFrameCount = ensureArray(composition.frames).filter(frame => normalizeString(frame.pageId) === pageId).length
  const frameIndex = pageFrameCount + 1
  const aspectRatio = normalizeString(input.aspectRatio) || composition.aspectRatio || '16:9'
  const deviceFramePresetKey = normalizeString(input.deviceFramePresetKey) || composition.deviceFramePresetKey || 'iphone-16-pro'
  const defaultSize = resolveDefaultFrameSize(kind, aspectRatio, deviceFramePresetKey)
  const themeTokensBase = {
    ...normalizeThemeTokens(composition.themeTokens, defaultCompositionThemeTokens()),
    ...normalizeThemeTokens(input.themeTokens),
  }
  const themeTokens = kind === 'device_artboard'
    ? {
        ...themeTokensBase,
        background: normalizeString(themeTokensBase.background) || '#ffffff',
        surface: normalizeString(themeTokensBase.surface) || '#ffffff',
        text: normalizeString(themeTokensBase.text) || '#0f172a',
        muted: normalizeString(themeTokensBase.muted) || '#64748b',
      }
    : themeTokensBase
  const x = toFiniteNumber(input.x, 120 + pageFrameCount * 56)
  const y = toFiniteNumber(input.y, 120 + pageFrameCount * 48)
  const slots = {
    ...normalizeRecord(input.slots),
    ...(normalizeString(input.title) ? { title: normalizeString(input.title) } : {}),
    ...(normalizeString(input.subtitle) ? { subtitle: normalizeString(input.subtitle) } : {}),
    ...(normalizeString(input.badge) ? { badge: normalizeString(input.badge) } : {}),
    ...(normalizeString(input.imageSrc) ? { imageSrc: normalizeString(input.imageSrc) } : {}),
  }

  if (kind === 'template' || kind === 'device_mockup') {
    const legacyFrame = createLegacyCompositionFrame({
      id: frameId,
      pageId,
      name: normalizeString(input.name) || resolveDesignFrameDefaultName(kind, frameIndex),
      kind,
      templateKey: normalizeString(input.templateKey) || composition.templateKey,
      deviceFramePresetKey,
      aspectRatio,
      slots,
      themeTokens,
      metadata: normalizeRecord(input.metadata),
    })

    return normalizeDesignFrameModel({
      ...legacyFrame,
      x,
      y,
      width: toPositiveNumber(input.width, legacyFrame.width),
      height: toPositiveNumber(input.height, legacyFrame.height),
      locked: typeof input.locked === 'boolean' ? input.locked : legacyFrame.locked,
      elements: ensureArray(input.elements).length > 0 ? ensureArray(input.elements) : legacyFrame.elements,
      metadata: {
        ...normalizeRecord(legacyFrame.metadata),
        ...normalizeRecord(input.metadata),
      },
    }, frameIndex - 1, pageId)
  }

  if (kind === 'device_artboard') {
    const hasExplicitElements = input.elements !== undefined
    const defaultElements = hasExplicitElements
      ? ensureArray(input.elements).map((element, index) => createDesignElement({
          ...element,
          pageId: normalizeString(element.pageId) || pageId,
          frameId,
          zIndex: toFiniteNumber(element.zIndex, index),
        }, `${frameId}-element-${index + 1}`))
      : []

    return normalizeDesignFrameModel({
      id: frameId,
      pageId,
      name: normalizeString(input.name) || resolveDesignFrameDefaultName(kind, frameIndex),
      kind,
      x,
      y,
      width: toPositiveNumber(input.width, defaultSize.width),
      height: toPositiveNumber(input.height, defaultSize.height),
      locked: Boolean(input.locked),
      deviceFramePresetKey,
      elements: defaultElements,
      themeTokens,
      metadata: normalizeRecord(input.metadata),
    }, frameIndex - 1, pageId)
  }

  if (kind === 'diagram') {
    const embeddedScene = input.embeddedScene
      ? relayoutSceneDocument(sceneDocumentFromUnknown(input.embeddedScene, {
          fallbackDrawMode: 'diagram',
          fallbackSourceType: 'manual',
        }))
      : relayoutSceneDocument(createEmptySceneDocument({
          drawMode: 'diagram',
          sourceType: 'manual',
          editorEngine: 'vueflow',
        }))

    return normalizeDesignFrameModel({
      id: frameId,
      pageId,
      name: normalizeString(input.name) || resolveDesignFrameDefaultName(kind, frameIndex),
      kind,
      x,
      y,
      width: toPositiveNumber(input.width, defaultSize.width),
      height: toPositiveNumber(input.height, defaultSize.height),
      locked: Boolean(input.locked),
      elements: ensureArray(input.elements),
      embeddedScene,
      themeTokens,
      metadata: normalizeRecord(input.metadata),
    }, frameIndex - 1, pageId)
  }

  const hasExplicitElements = input.elements !== undefined
  const defaultElements = hasExplicitElements
    ? ensureArray(input.elements).map((element, index) => createDesignElement({
        ...element,
        pageId: normalizeString(element.pageId) || pageId,
        frameId,
        zIndex: toFiniteNumber(element.zIndex, index),
      }, `${frameId}-element-${index + 1}`))
    : []

  return normalizeDesignFrameModel({
    id: frameId,
    pageId,
    name: normalizeString(input.name) || resolveDesignFrameDefaultName(kind, frameIndex),
    kind: 'freeform',
    x,
    y,
    width: toPositiveNumber(input.width, defaultSize.width),
    height: toPositiveNumber(input.height, defaultSize.height),
    locked: Boolean(input.locked),
    templateKey: normalizeString(input.templateKey) || undefined,
    deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || undefined,
    elements: defaultElements,
    themeTokens,
    metadata: normalizeRecord(input.metadata),
  }, frameIndex - 1, pageId)
}

function buildArchitectureFromPackageManifest(payload: Record<string, unknown>): ArchitectureImportResult | null {
  const packageName = normalizeString(payload.name)
  const dependencies = normalizePackageDependencyMap(payload)
  const dependencyNames = Object.keys(dependencies).map(item => normalizeString(item)).filter(Boolean)
  if (!packageName || dependencyNames.length === 0)
    return null

  const rootService: ArchitectureElementModel = {
    id: sanitizeIdentifier(packageName, 'package-root'),
    label: packageName,
    type: 'service',
    metadata: {
      version: normalizeString(payload.version),
    },
  }
  const externalDependencies = dependencyNames.map((dependencyName, index) => ({
    id: sanitizeIdentifier(dependencyName, `package-dependency-${index + 1}`),
    label: dependencyName,
    type: 'external',
    metadata: {
      versionRange: normalizeString(dependencies[dependencyName]),
    },
  }))

  const architectureModel: ArchitectureModel = {
    kind: 'architecture',
    systems: [],
    services: [rootService],
    components: [],
    databases: [],
    queues: [],
    externalDependencies,
    interfaces: [],
    relations: externalDependencies.map((dependency, index) => ({
      id: `package-relation-${index + 1}`,
      source: rootService.id,
      target: dependency.id,
      label: 'depends_on',
      metadata: {},
    })),
    metadata: {
      sourceKind: 'package.json',
    },
  }

  return {
    architectureModel,
    sceneDocument: relayoutSceneDocument({
      ...createEmptySceneDocument({
        drawMode: 'architecture',
        sourceType: 'repo_arch',
      }),
      drawMode: 'architecture',
      sourceType: 'repo_arch',
      sourceModel: architectureModel,
    }),
    warnings: [],
  }
}

function buildArchitectureFromWorkspaceManifest(payload: Record<string, unknown>): ArchitectureImportResult | null {
  const packagePayloads = normalizeWorkspacePackagePayloads(payload)
  const workspacePatterns = ensureArray(payload.packages)
    .map(item => normalizeString(item))
    .filter(Boolean)
  const workspaceMeta = normalizeRecord(payload.workspace)
  const workspaceName = normalizeString(payload.workspaceName || workspaceMeta.name || payload.name) || 'Workspace'

  if (packagePayloads.length === 0 && workspacePatterns.length === 0)
    return null

  const warnings: string[] = []
  const systems: ArchitectureElementModel[] = [
    {
      id: sanitizeIdentifier(workspaceName, 'workspace-system'),
      label: workspaceName,
      type: 'system',
      metadata: {
        workspacePatterns,
        tool: normalizeString(payload.tool || workspaceMeta.tool || payload.packageManager) || undefined,
      },
    },
  ]
  const services: ArchitectureElementModel[] = []
  const components: ArchitectureElementModel[] = []
  const externalDependencies: ArchitectureElementModel[] = []
  const relations: ArchitectureRelationModel[] = []
  const internalPackages = new Map<string, ArchitectureElementModel>()
  const externalMap = new Map<string, ArchitectureElementModel>()

  function ensureExternalDependency(label: string, versionRange = ''): ArchitectureElementModel {
    const normalizedLabel = normalizeString(label) || 'external'
    const id = sanitizeIdentifier(normalizedLabel, `workspace-external-${externalMap.size + 1}`)
    const existing = externalMap.get(id)
    if (existing)
      return existing

    const dependency: ArchitectureElementModel = {
      id,
      label: normalizedLabel,
      type: 'external',
      metadata: {
        versionRange: normalizeString(versionRange) || undefined,
      },
    }
    externalMap.set(id, dependency)
    externalDependencies.push(dependency)
    return dependency
  }

  if (packagePayloads.length > 0) {
    for (const [index, packagePayload] of packagePayloads.entries()) {
      const packageName = normalizeString(packagePayload.name || packagePayload.packageName || packagePayload.id)
      const packagePath = normalizeString(packagePayload.path || packagePayload.location || packagePayload.dir)
      const label = packageName || packagePath || `package-${index + 1}`
      const type = inferWorkspacePackageType(label, packagePath)
      const element: ArchitectureElementModel = {
        id: sanitizeIdentifier(label, `workspace-package-${index + 1}`),
        label,
        type,
        metadata: {
          path: packagePath || undefined,
          private: Boolean(packagePayload.private),
        },
      }

      internalPackages.set(label, element)
      if (type === 'service')
        services.push(element)
      else
        components.push(element)

      relations.push({
        id: `workspace-contains-${relations.length + 1}`,
        source: systems[0]!.id,
        target: element.id,
        label: 'contains',
        metadata: {},
      })
    }

    for (const [index, packagePayload] of packagePayloads.entries()) {
      const packageName = normalizeString(packagePayload.name || packagePayload.packageName || packagePayload.id)
      const packagePath = normalizeString(packagePayload.path || packagePayload.location || packagePayload.dir)
      const label = packageName || packagePath || `package-${index + 1}`
      const source = internalPackages.get(label)
      if (!source)
        continue

      const dependencies = normalizePackageDependencyMap(packagePayload)
      for (const [dependencyName, versionRange] of Object.entries(dependencies)) {
        const internalTarget = internalPackages.get(dependencyName)
        if (internalTarget) {
          relations.push({
            id: `workspace-relation-${relations.length + 1}`,
            source: source.id,
            target: internalTarget.id,
            label: 'depends_on',
            metadata: {
              versionRange: versionRange || undefined,
            },
          })
          continue
        }

        const target = ensureExternalDependency(dependencyName, versionRange)
        relations.push({
          id: `workspace-relation-${relations.length + 1}`,
          source: source.id,
          target: target.id,
          label: 'depends_on',
          metadata: {
            versionRange: versionRange || undefined,
          },
        })
      }
    }
  }
  else {
    workspacePatterns.forEach((pattern, index) => {
      const node: ArchitectureElementModel = {
        id: sanitizeIdentifier(pattern, `workspace-pattern-${index + 1}`),
        label: pattern,
        type: 'component',
        metadata: {
          kind: 'workspace-pattern',
        },
      }
      components.push(node)
      relations.push({
        id: `workspace-pattern-relation-${index + 1}`,
        source: systems[0]!.id,
        target: node.id,
        label: 'contains',
        metadata: {},
      })
    })
    warnings.push('仅识别到 workspace globs，尚未提供 packageManifests，当前生成的是目录级结构草图。')
  }

  const architectureModel: ArchitectureModel = {
    kind: 'architecture',
    systems,
    services,
    components,
    databases: [],
    queues: [],
    externalDependencies,
    interfaces: [],
    relations,
    metadata: {
      sourceKind: 'workspace-manifest',
      workspacePatterns,
      packageCount: packagePayloads.length,
    },
  }

  return {
    architectureModel,
    sceneDocument: relayoutSceneDocument({
      ...createEmptySceneDocument({
        drawMode: 'architecture',
        sourceType: 'repo_arch',
      }),
      drawMode: 'architecture',
      sourceType: 'repo_arch',
      sourceModel: architectureModel,
    }),
    warnings,
  }
}

function buildArchitectureFromOpenAPI(payload: Record<string, unknown>): ArchitectureImportResult | null {
  const paths = normalizeRecord(payload.paths)
  const pathEntries = Object.entries(paths)
  if (pathEntries.length === 0)
    return null

  const info = normalizeRecord(payload.info)
  const title = normalizeString(info.title) || 'OpenAPI Service'
  const rootService: ArchitectureElementModel = {
    id: sanitizeIdentifier(title, 'openapi-service'),
    label: title,
    type: 'service',
    metadata: {
      version: normalizeString(payload.openapi || info.version),
    },
  }

  const interfaces: Array<ArchitectureElementModel & { protocol?: string }> = []
  const relations: ArchitectureRelationModel[] = []
  const methodKeys = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']

  pathEntries.forEach(([pathName, pathConfig], index) => {
    const config = normalizeRecord(pathConfig)
    const methods = methodKeys.filter(method => normalizeRecord(config[method]).summary || normalizeRecord(config[method]).operationId || isRecord(config[method]))
    const interfaceId = sanitizeIdentifier(`${pathName}-${methods.join('-')}`, `openapi-interface-${index + 1}`)
    interfaces.push({
      id: interfaceId,
      label: `${methods.map(item => item.toUpperCase()).join('/')} ${pathName}`,
      type: 'interface',
      protocol: 'http',
      metadata: {},
    })
    relations.push({
      id: `openapi-relation-${index + 1}`,
      source: rootService.id,
      target: interfaceId,
      label: 'exposes',
      protocol: 'http',
      metadata: {},
    })
  })

  const architectureModel: ArchitectureModel = {
    kind: 'architecture',
    systems: [],
    services: [rootService],
    components: [],
    databases: [],
    queues: [],
    externalDependencies: [],
    interfaces,
    relations,
    metadata: {
      sourceKind: 'openapi',
    },
  }

  return {
    architectureModel,
    sceneDocument: relayoutSceneDocument({
      ...createEmptySceneDocument({
        drawMode: 'architecture',
        sourceType: 'repo_arch',
      }),
      drawMode: 'architecture',
      sourceType: 'repo_arch',
      sourceModel: architectureModel,
    }),
    warnings: [],
  }
}

export function importArchitectureFromMetadata(source: string | Record<string, unknown>): ArchitectureImportResult {
  const warnings: string[] = []
  const payload = parseArchitecturePayload(source)

  const dockerComposeResult = buildArchitectureFromDockerCompose(payload)
  if (dockerComposeResult)
    return dockerComposeResult

  const workspaceManifestResult = buildArchitectureFromWorkspaceManifest(payload)
  if (workspaceManifestResult)
    return workspaceManifestResult

  const packageManifestResult = buildArchitectureFromPackageManifest(payload)
  if (packageManifestResult)
    return packageManifestResult

  const openApiResult = buildArchitectureFromOpenAPI(payload)
  if (openApiResult)
    return openApiResult

  const services: ArchitectureElementModel[] = []
  const components: ArchitectureElementModel[] = []
  const databases: ArchitectureElementModel[] = []
  const queues: ArchitectureElementModel[] = []
  const externalDependencies: ArchitectureElementModel[] = []
  const relations: ArchitectureRelationModel[] = []
  const seen = new Map<string, ArchitectureElementModel>()

  function ensureElement(label: string): ArchitectureElementModel {
    const normalizedLabel = normalizeString(label) || 'Unnamed'
    const id = sanitizeIdentifier(normalizedLabel, `arch-${seen.size + 1}`)
    const existing = seen.get(id)
    if (existing)
      return existing

    const type = inferArchitectureElementType(normalizedLabel)
    const element: ArchitectureElementModel = {
      id,
      label: normalizedLabel,
      type,
      metadata: {},
    }
    seen.set(id, element)
    if (type === 'database')
      databases.push(element)
    else if (type === 'queue')
      queues.push(element)
    else if (type === 'component')
      components.push(element)
    else if (type === 'external')
      externalDependencies.push(element)
    else
      services.push(element)
    return element
  }

  const text = normalizeString(payload.text)
  if (text) {
    const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean)
    for (const line of lines) {
      const relationLine = parseArchitectureRelationLine(line)
      if (!relationLine)
        continue
      const sourceElement = ensureElement(relationLine.sourceToken)
      const targetElement = ensureElement(relationLine.targetToken)
      relations.push({
        id: `relation-${relations.length + 1}`,
        source: sourceElement.id,
        target: targetElement.id,
        protocol: inferProtocolFromValue(relationLine.operator),
        metadata: {},
      })
    }
  }

  for (const key of ['services', 'components', 'databases', 'queues', 'externalDependencies'] as const) {
    ensureArray(payload[key]).forEach((entry, index) => {
      const item = normalizeArchitectureElementModel(entry, index, key)
      if (!seen.has(item.id))
        seen.set(item.id, item)
      if (key === 'services')
        services.push(item)
      else if (key === 'components')
        components.push(item)
      else if (key === 'databases')
        databases.push(item)
      else if (key === 'queues')
        queues.push(item)
      else
        externalDependencies.push(item)
    })
  }

  ensureArray(payload.relations || payload.edges).forEach((entry, index) => {
    const relation = normalizeArchitectureRelationModel(entry, index)
    if (!relation.source || !relation.target)
      return
    relations.push(relation)
  })

  if (services.length + components.length + databases.length + queues.length + externalDependencies.length === 0)
    warnings.push('未识别到可用于架构图的节点。')

  const architectureModel: ArchitectureModel = {
    kind: 'architecture',
    systems: ensureArray(payload.systems).map((entry, index) => normalizeArchitectureElementModel(entry, index, 'system')),
    services,
    components,
    databases,
    queues,
    externalDependencies,
    interfaces: ensureArray(payload.interfaces).map((entry, index) => {
      const item = normalizeArchitectureElementModel(entry, index, 'interface')
      return {
        ...item,
        protocol: normalizeString(normalizeRecord(entry).protocol) || undefined,
      }
    }),
    relations,
    metadata: {},
  }

  return {
    architectureModel,
    sceneDocument: relayoutSceneDocument({
      ...createEmptySceneDocument({
        drawMode: 'architecture',
        sourceType: 'repo_arch',
      }),
      drawMode: 'architecture',
      sourceType: 'repo_arch',
      sourceModel: architectureModel,
    }),
    warnings,
  }
}

export function buildDeviceMockupSceneDocument(input: {
  title?: string
  subtitle?: string
  badge?: string
  imageSrc?: string
  templateKey?: string
  deviceFramePresetKey?: string
  aspectRatio?: string
  themeTokens?: Record<string, string>
} = {}): SceneDocument {
  const templateKey = normalizeString(input.templateKey) || 'device-showcase'
  const template = resolveSceneTemplateManifest(templateKey)
  const themeTokens = {
    ...normalizeThemeTokens(template?.themeTokens, defaultCompositionModel(templateKey).themeTokens),
    ...normalizeThemeTokens(input.themeTokens),
  }
  const slots = {
    title: normalizeString(input.title) || '设计标题',
    subtitle: normalizeString(input.subtitle) || '补充一段简洁说明，后续可由 AI 自动填充。',
    badge: normalizeString(input.badge) || '设备展示',
    imageSrc: normalizeString(input.imageSrc) || '',
  }
  const base = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'image_mockup',
    templateKey,
    editorEngine: 'vueflow',
  })
  const composition = defaultCompositionModel(templateKey)
  const page = createDefaultDesignPage({
    id: DEFAULT_COMPOSITION_PAGE_ID,
    name: 'Page 1',
    background: normalizeString(themeTokens.background) || '#0b1220',
  })
  const frame = createDesignFrameFromInput({
    id: DEFAULT_COMPOSITION_FRAME_ID,
    pageId: page.id,
    name: '设备展示',
    kind: 'device_mockup',
    templateKey,
    deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || composition.deviceFramePresetKey,
    aspectRatio: normalizeString(input.aspectRatio) || composition.aspectRatio,
    slots,
    themeTokens,
  }, {
    ...composition,
    pages: [page],
    frames: [],
  }, page.id)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    templateKey,
    currentPageId: page.id,
    pages: [{
      ...page,
      frameIds: [frame.id],
    }],
    frames: [frame],
    elements: ensureArray(frame.elements),
    slots,
    themeTokens,
    aspectRatio: normalizeString(input.aspectRatio) || composition.aspectRatio,
    deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || composition.deviceFramePresetKey,
    assets: normalizeString(input.imageSrc)
      ? [{
          id: 'asset-1',
          type: 'image',
          name: 'mockup-image',
          src: normalizeString(input.imageSrc),
          metadata: {
            source: 'device_mockup',
          },
        }]
      : [],
  })
}

export function appendDesignPageToSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  input: Partial<DesignPageModel> & { makeCurrent?: boolean } = {},
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const pageIndex = ensureArray(composition.pages).length + 1
  const currentPage = resolveCompositionCurrentPage(composition)
  const page = createDefaultDesignPage({
    id: sanitizeIdentifier(input.id, `page-${pageIndex}`),
    name: normalizeString(input.name) || `Page ${pageIndex}`,
    background: normalizeString(input.background) || normalizeString(currentPage.background) || '#0b1220',
    viewport: {
      x: toFiniteNumber(input.viewport?.x, 0),
      y: toFiniteNumber(input.viewport?.y, 0),
      zoom: toFiniteNumber(input.viewport?.zoom, 1) || 1,
    },
    metadata: normalizeRecord(input.metadata),
  })

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    pages: [...ensureArray(composition.pages), page],
    currentPageId: input.makeCurrent === false ? composition.currentPageId : page.id,
  })
}

export function updateDesignPageInSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  pageId: string,
  patch: Partial<DesignPageModel> = {},
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  if (!ensureArray(composition.pages).some(page => normalizeString(page.id) === normalizeString(pageId)))
    return finalizeCompositionSceneDocument(base, composition)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    pages: ensureArray(composition.pages).map((page) => {
      if (normalizeString(page.id) !== normalizeString(pageId))
        return page
      return createDefaultDesignPage({
        ...page,
        name: normalizeString(patch.name) || page.name,
        background: normalizeString(patch.background) || page.background,
        viewport: {
          x: toFiniteNumber(patch.viewport?.x, page.viewport?.x || 0),
          y: toFiniteNumber(patch.viewport?.y, page.viewport?.y || 0),
          zoom: toFiniteNumber(patch.viewport?.zoom, page.viewport?.zoom || 1) || 1,
        },
        metadata: {
          ...normalizeRecord(page.metadata),
          ...normalizeRecord(patch.metadata),
        },
      })
    }),
  })
}

export function removeDesignPageFromSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  pageId: string,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const pages = ensureArray(composition.pages)
  if (pages.length <= 1)
    return finalizeCompositionSceneDocument(base, composition)

  const nextPages = pages.filter(page => normalizeString(page.id) !== normalizeString(pageId))
  const nextFrames = ensureArray(composition.frames).filter(frame => normalizeString(frame.pageId) !== normalizeString(pageId))
  const nextCurrentPageId = normalizeString(composition.currentPageId) === normalizeString(pageId)
    ? nextPages[0]?.id || DEFAULT_COMPOSITION_PAGE_ID
    : composition.currentPageId

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    pages: nextPages,
    frames: nextFrames,
    elements: ensureArray(composition.elements).filter(element => normalizeString(element.pageId) !== normalizeString(pageId)),
    currentPageId: nextCurrentPageId,
  })
}

export function setCurrentDesignPageInSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  pageId: string,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  if (!ensureArray(composition.pages).some(page => normalizeString(page.id) === normalizeString(pageId)))
    return finalizeCompositionSceneDocument(base, composition)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: normalizeString(pageId),
  })
}

export function appendDesignFrameToSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  input: Partial<DesignFrameModel> & {
    aspectRatio?: string
    slots?: Record<string, unknown>
    title?: string
    subtitle?: string
    badge?: string
    imageSrc?: string
  } = {},
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const pageId = ensureArray(composition.pages).some(page => page.id === normalizeString(input.pageId))
    ? normalizeString(input.pageId)
    : resolveCompositionCurrentPage(composition).id
  const frame = createDesignFrameFromInput({
    ...input,
    pageId,
  }, composition, pageId)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    frames: [...ensureArray(composition.frames), frame],
    elements: [...ensureArray(composition.elements), ...ensureArray(frame.elements)],
  })
}

export function updateDesignFrameInSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  frameId: string,
  patch: Partial<DesignFrameModel> & {
    aspectRatio?: string
    slots?: Record<string, unknown>
    title?: string
    subtitle?: string
    badge?: string
    imageSrc?: string
  } = {},
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const target = ensureArray(composition.frames).find(frame => normalizeString(frame.id) === normalizeString(frameId))
  if (!target)
    return finalizeCompositionSceneDocument(base, composition)

  const pageId = ensureArray(composition.pages).some(page => page.id === normalizeString(patch.pageId))
    ? normalizeString(patch.pageId)
    : target.pageId
  const framesWithoutTarget = ensureArray(composition.frames).filter(frame => normalizeString(frame.id) !== normalizeString(frameId))
  const nextFrame = createDesignFrameFromInput({
    ...target,
    ...patch,
    id: target.id,
    pageId,
    elements: patch.elements !== undefined ? patch.elements : target.elements,
    embeddedScene: patch.embeddedScene !== undefined ? patch.embeddedScene : target.embeddedScene,
    themeTokens: patch.themeTokens
      ? {
          ...normalizeThemeTokens(target.themeTokens),
          ...normalizeThemeTokens(patch.themeTokens),
        }
      : target.themeTokens,
    metadata: patch.metadata
      ? {
          ...normalizeRecord(target.metadata),
          ...normalizeRecord(patch.metadata),
        }
      : target.metadata,
  }, {
    ...composition,
    frames: framesWithoutTarget,
  }, pageId)
  const nextElements = [
    ...ensureArray(composition.elements).filter(element => normalizeString(element.frameId) !== normalizeString(frameId)),
    ...ensureArray(patch.elements !== undefined ? nextFrame.elements : resolveCompositionElementsForFrame(composition, frameId))
      .map((element, index) => createDesignElement({
        ...element,
        pageId,
        frameId: nextFrame.id,
        zIndex: toFiniteNumber(element.zIndex, index),
      }, element.id || `${nextFrame.id}-element-${index + 1}`)),
  ]

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    frames: [...framesWithoutTarget, nextFrame],
    elements: nextElements,
  })
}

export function removeDesignFrameFromSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  frameId: string,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  return finalizeCompositionSceneDocument(base, {
    ...composition,
    frames: ensureArray(composition.frames).filter(frame => normalizeString(frame.id) !== normalizeString(frameId)),
    elements: ensureArray(composition.elements).filter(element => normalizeString(element.frameId) !== normalizeString(frameId)),
  })
}

export function appendDesignElementToSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  input: Partial<DesignElementModel>,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const pageId = ensureArray(composition.pages).some(page => page.id === normalizeString(input.pageId))
    ? normalizeString(input.pageId)
    : resolveCompositionCurrentPage(composition).id
  const requestedFrameId = normalizeString(input.frameId)
  const targetFrame = requestedFrameId
    ? ensureArray(composition.frames).find(frame => normalizeString(frame.id) === requestedFrameId) || null
    : null
  const frameId = canDesignFrameContainElements(targetFrame) ? requestedFrameId : undefined
  const siblingElements = ensureArray(composition.elements).filter((element) => {
    return normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(frameId)
      && normalizeString(element.parentId) === normalizeString(input.parentId)
  })
  const nextElement = createDesignElement({
    ...input,
    pageId,
    frameId,
    zIndex: toFiniteNumber(input.zIndex, siblingElements.length),
    metadata: {
      ...normalizeRecord(input.metadata),
      containerRole: frameId ? 'frame_child' : 'page_root',
    },
  }, normalizeString(input.id) || `element-${Date.now()}`)
  const unaffected = ensureArray(composition.elements).filter((element) => {
    return !(normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(frameId)
      && normalizeString(element.parentId) === normalizeString(input.parentId))
  })
  const normalizedContainerElements = rewriteDesignElementZIndices([...siblingElements, nextElement])
  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    elements: [...unaffected, ...normalizedContainerElements],
  })
}

export function updateDesignElementInSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  elementId: string,
  patch: Partial<DesignElementModel>,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const elements = ensureArray(composition.elements)
  const target = elements.find(element => normalizeString(element.id) === normalizeString(elementId))
  if (!target)
    return finalizeCompositionSceneDocument(base, composition)
  const pageId = ensureArray(composition.pages).some(page => page.id === normalizeString(patch.pageId))
    ? normalizeString(patch.pageId)
    : target.pageId
  const requestedFrameId = patch.frameId !== undefined ? normalizeString(patch.frameId) : normalizeString(target.frameId)
  const targetFrame = requestedFrameId
    ? ensureArray(composition.frames).find(frame => normalizeString(frame.id) === requestedFrameId) || null
    : null
  const frameId = canDesignFrameContainElements(targetFrame) ? requestedFrameId : undefined
  const parentId = patch.parentId !== undefined ? normalizeString(patch.parentId) || undefined : target.parentId
  const sameContainer = normalizeString(target.pageId) === pageId
    && normalizeString(target.frameId) === normalizeString(frameId)
    && normalizeString(target.parentId) === normalizeString(parentId)
  const updatedElement = createDesignElement({
    ...target,
    ...patch,
    id: target.id,
    pageId,
    frameId,
    parentId,
    metadata: {
      ...normalizeRecord(target.metadata),
      ...normalizeRecord(patch.metadata),
      containerRole: frameId ? 'frame_child' : 'page_root',
    },
  }, target.id)
  const desiredZIndex = Math.max(0, Math.trunc(toFiniteNumber(
    patch.zIndex,
    sameContainer ? target.zIndex : ensureArray(composition.elements).length,
  )))
  const unaffectedElements = elements.filter((element) => {
    if (normalizeString(element.id) === normalizeString(elementId))
      return false
    const isSourceSibling = normalizeString(element.pageId) === normalizeString(target.pageId)
      && normalizeString(element.frameId) === normalizeString(target.frameId)
      && normalizeString(element.parentId) === normalizeString(target.parentId)
    const isTargetSibling = normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(frameId)
      && normalizeString(element.parentId) === normalizeString(parentId)
    return !isSourceSibling && !isTargetSibling
  })
  const targetSiblings = elements.filter((element) => {
    if (normalizeString(element.id) === normalizeString(elementId))
      return false
    return normalizeString(element.pageId) === pageId
      && normalizeString(element.frameId) === normalizeString(frameId)
      && normalizeString(element.parentId) === normalizeString(parentId)
  })
  const normalizedTargetSiblings = rewriteDesignElementZIndices(targetSiblings)
  const insertIndex = Math.min(desiredZIndex, normalizedTargetSiblings.length)
  const nextTargetContainerElements = rewriteDesignElementZIndices([
    ...normalizedTargetSiblings.slice(0, insertIndex),
    {
      ...updatedElement,
      zIndex: insertIndex,
    },
    ...normalizedTargetSiblings.slice(insertIndex),
  ])
  const sourceContainerElements = sameContainer
    ? []
    : rewriteDesignElementZIndices(elements.filter((element) => {
        if (normalizeString(element.id) === normalizeString(elementId))
          return false
        return normalizeString(element.pageId) === normalizeString(target.pageId)
          && normalizeString(element.frameId) === normalizeString(target.frameId)
          && normalizeString(element.parentId) === normalizeString(target.parentId)
      }))
  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    elements: [
      ...unaffectedElements,
      ...sourceContainerElements,
      ...nextTargetContainerElements,
    ],
  })
}

export function removeDesignElementFromSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  elementId: string,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const target = ensureArray(composition.elements).find(element => normalizeString(element.id) === normalizeString(elementId))
  if (!target)
    return finalizeCompositionSceneDocument(base, composition)
  const remainingElements = ensureArray(composition.elements).filter(element => normalizeString(element.id) !== normalizeString(elementId))
  const sourceContainerElements = rewriteDesignElementZIndices(remainingElements.filter((element) => {
    return normalizeString(element.pageId) === normalizeString(target.pageId)
      && normalizeString(element.frameId) === normalizeString(target.frameId)
      && normalizeString(element.parentId) === normalizeString(target.parentId)
  }))
  const unaffected = remainingElements.filter((element) => {
    return !(normalizeString(element.pageId) === normalizeString(target.pageId)
      && normalizeString(element.frameId) === normalizeString(target.frameId)
      && normalizeString(element.parentId) === normalizeString(target.parentId))
  })
  return finalizeCompositionSceneDocument(base, {
    ...composition,
    elements: [...unaffected, ...sourceContainerElements],
  })
}

function normalizeCanvasLibraryOrigin(origin: CanvasLibraryOriginMetadata): CanvasLibraryOriginMetadata {
  return {
    itemId: normalizeString(origin.itemId),
    versionId: normalizeString(origin.versionId),
    importedAt: normalizeString(origin.importedAt) || new Date().toISOString(),
    importedBy: normalizeString(origin.importedBy),
    source: 'canvas_library',
  }
}

function buildCanvasLibraryCompositionSnapshot(composition: CompositionModel): CanvasLibraryCompositionSnapshot {
  return {
    templateKey: normalizeString(composition.templateKey) || undefined,
    themeTokens: normalizeThemeTokens(composition.themeTokens),
    layoutRules: normalizeRecord(composition.layoutRules),
    allowedBlocks: ensureArray(composition.allowedBlocks).map(item => normalizeString(item)).filter(Boolean),
    exportPresets: ensureArray(composition.exportPresets).map(item => normalizeString(item)).filter(Boolean),
    aspectRatio: normalizeString(composition.aspectRatio) || undefined,
    deviceFramePresetKey: normalizeString(composition.deviceFramePresetKey) || undefined,
    metadata: normalizeRecord(composition.metadata),
  }
}

function resolveCanvasLibraryNextIdentifier(existingIds: Set<string>, prefix: string): string {
  let index = Math.max(1, existingIds.size + 1)
  let candidate = `${prefix}-${index}`
  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${prefix}-${index}`
  }
  existingIds.add(candidate)
  return candidate
}

function resolveCanvasLibraryReferencedAssets(
  composition: CompositionModel,
  frames: DesignFrameModel[],
  elements: DesignElementModel[],
): DesignAssetModel[] {
  const referencedAssetIds = new Set<string>()
  const referencedImageSrcs = new Set<string>()

  elements.forEach((element) => {
    const imageSrc = normalizeString(element.imageSrc)
    if (imageSrc)
      referencedImageSrcs.add(imageSrc)
  })

  frames.forEach((frame) => {
    const shellAssetId = normalizeString(frame.metadata?.device?.shellAssetId)
    if (shellAssetId)
      referencedAssetIds.add(shellAssetId)
  })

  return ensureArray(composition.assets)
    .filter((asset) => {
      return referencedAssetIds.has(normalizeString(asset.id))
        || referencedImageSrcs.has(normalizeString(asset.src))
    })
    .map((asset, index) => normalizeDesignAssetModel(asset, index))
}

function sanitizeCanvasLibraryFrameLinks(
  frame: DesignFrameModel,
  availableFrameIds: Set<string>,
  assetIdMap?: Map<string, string>,
): DesignFrameModel {
  const nextMetadata = normalizeRecord(frame.metadata)
  const deviceMetadata = normalizeRecord(nextMetadata.device)
  const mockupSourceFrameId = normalizeString(deviceMetadata.mockupSourceFrameId)
  const shellAssetId = normalizeString(deviceMetadata.shellAssetId)
  const mappedShellAssetId = shellAssetId && assetIdMap
    ? normalizeString(assetIdMap.get(shellAssetId))
    : shellAssetId

  return normalizeDesignFrameModel({
    ...frame,
    metadata: {
      ...nextMetadata,
      device: {
        ...deviceMetadata,
        ...(shellAssetId
          ? {
              shellAssetId: mappedShellAssetId || undefined,
            }
          : {}),
        ...(mockupSourceFrameId && !availableFrameIds.has(mockupSourceFrameId)
          ? {
              mockupSourceFrameId: '',
            }
          : {}),
      },
    },
  }, 0, frame.pageId)
}

function applyCanvasLibraryOriginToPage(page: DesignPageModel, origin: CanvasLibraryOriginMetadata): DesignPageModel {
  return createDefaultDesignPage({
    ...page,
    metadata: {
      ...normalizeRecord(page.metadata),
      libraryOrigin: origin,
    },
  })
}

function applyCanvasLibraryOriginToFrame(frame: DesignFrameModel, origin: CanvasLibraryOriginMetadata): DesignFrameModel {
  return normalizeDesignFrameModel({
    ...frame,
    metadata: {
      ...normalizeRecord(frame.metadata),
      libraryOrigin: origin,
    },
  }, 0, frame.pageId)
}

function applyCanvasLibraryOriginToAsset(asset: DesignAssetModel, origin: CanvasLibraryOriginMetadata): DesignAssetModel {
  return normalizeDesignAssetModel({
    ...asset,
    metadata: {
      ...normalizeRecord(asset.metadata),
      libraryOrigin: origin,
    },
  }, 0)
}

export function appendDesignAssetToSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  input: Partial<DesignAssetModel>,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const existingIds = new Set(ensureArray(composition.assets).map(asset => normalizeString(asset.id)).filter(Boolean))
  const assetId = normalizeString(input.id) && !existingIds.has(normalizeString(input.id))
    ? normalizeString(input.id)
    : resolveCanvasLibraryNextIdentifier(existingIds, 'asset')
  const nextAsset = normalizeDesignAssetModel({
    ...input,
    id: assetId,
  }, ensureArray(composition.assets).length)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    assets: [...ensureArray(composition.assets), nextAsset],
  })
}

export function buildDesignAssetFromCanvasLibraryPayload(
  payload: CanvasLibraryBinaryAssetPayload | CanvasLibraryDeviceShellAssetPayload,
  options: {
    src: string
    assetKind?: 'image' | 'svg' | 'device_shell'
    name?: string
    id?: string
    origin?: CanvasLibraryOriginMetadata
  },
): DesignAssetModel {
  const metadata = normalizeRecord(payload.metadata)
  const origin = options.origin ? normalizeCanvasLibraryOrigin(options.origin) : null
  const assetKind = options.assetKind || 'image'

  return normalizeDesignAssetModel({
    id: normalizeString(options.id) || undefined,
    type: 'image',
    name: normalizeString(options.name) || normalizeString(payload.fileName) || 'asset',
    src: normalizeString(options.src),
    mimeType: normalizeString(payload.mimeType) || undefined,
    width: toPositiveNumber(payload.width, 0) || undefined,
    height: toPositiveNumber(payload.height, 0) || undefined,
    metadata: {
      ...metadata,
      ...(origin ? { libraryOrigin: origin } : {}),
      ...(assetKind === 'device_shell'
        ? {
            role: 'device_shell',
            deviceShell: {
              ...normalizeRecord(metadata.deviceShell),
              presetKeys: ensureArray((payload as CanvasLibraryDeviceShellAssetPayload).presetKeys)
                .map(item => normalizeString(item))
                .filter(Boolean),
              viewportRect: {
                ...normalizeRecord((payload as CanvasLibraryDeviceShellAssetPayload).viewportRect),
              },
              cornerRadius: toNonNegativeNumber((payload as CanvasLibraryDeviceShellAssetPayload).cornerRadius, 0),
              maskPath: normalizeString((payload as CanvasLibraryDeviceShellAssetPayload).maskPath) || undefined,
              source: normalizeString(normalizeRecord(metadata.deviceShell).source) === 'builtin' ? 'builtin' : 'uploaded',
            },
          }
        : {
            role: (normalizeString(metadata.role) === 'device_shell'
              ? 'image'
              : (normalizeString(metadata.role) || 'image')) as DesignAssetMetadata['role'],
          }),
    },
  }, 0)
}

export function applyCanvasLibraryOriginToSceneDocument(
  document: SceneDocument | CompositionModel | unknown,
  origin: CanvasLibraryOriginMetadata,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const normalizedOrigin = normalizeCanvasLibraryOrigin(origin)
  const frameIds = new Set(ensureArray(composition.frames).map(frame => normalizeString(frame.id)).filter(Boolean))

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    pages: ensureArray(composition.pages).map(page => applyCanvasLibraryOriginToPage(page, normalizedOrigin)),
    frames: ensureArray(composition.frames).map((frame) => {
      const nextFrame = applyCanvasLibraryOriginToFrame(frame, normalizedOrigin)
      return sanitizeCanvasLibraryFrameLinks(nextFrame, frameIds)
    }),
    assets: ensureArray(composition.assets).map(asset => applyCanvasLibraryOriginToAsset(asset, normalizedOrigin)),
  })
}

export function extractCanvasLibrarySceneTemplate(
  document: SceneDocument | CompositionModel | unknown,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  return finalizeCompositionSceneDocument(base, composition)
}

export function extractCanvasLibraryPageTemplate(
  document: SceneDocument | CompositionModel | unknown,
  pageId: string,
): CanvasLibraryPageTemplatePayload | null {
  const { base, composition } = resolveCompositionDocumentState(document)
  const sceneDocument = finalizeCompositionSceneDocument(base, composition)
  const normalizedComposition = sceneDocument.sourceModel.kind === 'composition'
    ? sceneDocument.sourceModel
    : composition
  const page = ensureArray(normalizedComposition.pages).find(entry => normalizeString(entry.id) === normalizeString(pageId))
  if (!page)
    return null

  const frames = resolveCompositionFramesForPage(normalizedComposition, page.id)
    .map((frame, index) => normalizeDesignFrameModel(frame, index, page.id))
  const frameIds = new Set(frames.map(frame => normalizeString(frame.id)).filter(Boolean))
  const elements = ensureArray(normalizedComposition.elements)
    .filter((element) => {
      return normalizeString(element.pageId) === normalizeString(page.id)
        && (!normalizeString(element.frameId) || frameIds.has(normalizeString(element.frameId)))
    })
    .map((element, index) => normalizeCompositionElementModel(element, index, {
      fallbackPageId: page.id,
    }))
  const assets = resolveCanvasLibraryReferencedAssets(normalizedComposition, frames, elements)
  const sanitizedFrames = frames.map(frame => sanitizeCanvasLibraryFrameLinks(frame, frameIds))

  return {
    target: 'page',
    page: createDefaultDesignPage({
      ...page,
      frameIds: sanitizedFrames.map(frame => frame.id),
    }),
    frames: sanitizedFrames,
    elements,
    assets,
    composition: buildCanvasLibraryCompositionSnapshot(normalizedComposition),
  }
}

export function extractCanvasLibraryFrameTemplate(
  document: SceneDocument | CompositionModel | unknown,
  frameId: string,
): CanvasLibraryFrameTemplatePayload | null {
  const { base, composition } = resolveCompositionDocumentState(document)
  const sceneDocument = finalizeCompositionSceneDocument(base, composition)
  const normalizedComposition = sceneDocument.sourceModel.kind === 'composition'
    ? sceneDocument.sourceModel
    : composition
  const frame = ensureArray(normalizedComposition.frames).find(entry => normalizeString(entry.id) === normalizeString(frameId))
  if (!frame)
    return null

  const elements = ensureArray(normalizedComposition.elements)
    .filter(element => normalizeString(element.frameId) === normalizeString(frame.id))
    .map((element, index) => normalizeCompositionElementModel(element, index, {
      fallbackPageId: frame.pageId,
      fallbackFrameId: frame.id,
    }))
  const assets = resolveCanvasLibraryReferencedAssets(normalizedComposition, [frame], elements)
  const sanitizedFrame = sanitizeCanvasLibraryFrameLinks(
    normalizeDesignFrameModel(frame, 0, frame.pageId),
    new Set([normalizeString(frame.id)]),
  )

  return {
    target: 'frame',
    frame: sanitizedFrame,
    elements,
    assets,
    composition: buildCanvasLibraryCompositionSnapshot(normalizedComposition),
  }
}

export function mergeCanvasLibraryPageTemplate(
  document: SceneDocument | CompositionModel | unknown,
  payload: CanvasLibraryPageTemplatePayload,
  origin: CanvasLibraryOriginMetadata,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const normalizedOrigin = normalizeCanvasLibraryOrigin(origin)
  const existingPageIds = new Set(ensureArray(composition.pages).map(page => normalizeString(page.id)).filter(Boolean))
  const existingFrameIds = new Set(ensureArray(composition.frames).map(frame => normalizeString(frame.id)).filter(Boolean))
  const existingAssetIds = new Set(ensureArray(composition.assets).map(asset => normalizeString(asset.id)).filter(Boolean))
  const existingElementIds = new Set(ensureArray(composition.elements).map(element => normalizeString(element.id)).filter(Boolean))
  const assetIdMap = new Map<string, string>()
  const frameIdMap = new Map<string, string>()

  const nextPageId = resolveCanvasLibraryNextIdentifier(existingPageIds, 'page')
  const nextAssets = ensureArray(payload.assets).map((asset) => {
    const nextAssetId = resolveCanvasLibraryNextIdentifier(existingAssetIds, 'asset')
    assetIdMap.set(normalizeString(asset.id), nextAssetId)
    return applyCanvasLibraryOriginToAsset(normalizeDesignAssetModel({
      ...asset,
      id: nextAssetId,
    }, 0), normalizedOrigin)
  })

  const nextFrames = ensureArray(payload.frames).map((frame, index) => {
    const nextFrameId = resolveCanvasLibraryNextIdentifier(existingFrameIds, 'frame')
    frameIdMap.set(normalizeString(frame.id), nextFrameId)
    return normalizeDesignFrameModel({
      ...frame,
      id: nextFrameId,
      pageId: nextPageId,
    }, index, nextPageId)
  })
  const nextFrameIds = new Set(nextFrames.map(frame => normalizeString(frame.id)).filter(Boolean))
  const sanitizedFrames = nextFrames.map((frame) => {
    const sourceMetadata = normalizeRecord(frame.metadata)
    const deviceMetadata = normalizeRecord(sourceMetadata.device)
    const mappedMockupSourceFrameId = normalizeString(frameIdMap.get(normalizeString(deviceMetadata.mockupSourceFrameId)))
    const mappedShellAssetId = normalizeString(assetIdMap.get(normalizeString(deviceMetadata.shellAssetId)))
    return applyCanvasLibraryOriginToFrame(sanitizeCanvasLibraryFrameLinks(normalizeDesignFrameModel({
      ...frame,
      metadata: {
        ...sourceMetadata,
        device: {
          ...deviceMetadata,
          shellAssetId: mappedShellAssetId || undefined,
          mockupSourceFrameId: mappedMockupSourceFrameId || undefined,
        },
      },
    }, 0, nextPageId), nextFrameIds), normalizedOrigin)
  })

  const nextElements = ensureArray(payload.elements).map((element, index) => {
    const nextElementId = resolveCanvasLibraryNextIdentifier(existingElementIds, 'element')
    return normalizeCompositionElementModel({
      ...element,
      id: nextElementId,
      pageId: nextPageId,
      frameId: normalizeString(element.frameId) ? frameIdMap.get(normalizeString(element.frameId)) : undefined,
    }, index, {
      fallbackPageId: nextPageId,
      fallbackFrameId: normalizeString(element.frameId)
        ? frameIdMap.get(normalizeString(element.frameId))
        : undefined,
    })
  })

  const nextPage = applyCanvasLibraryOriginToPage(createDefaultDesignPage({
    ...payload.page,
    id: nextPageId,
    frameIds: sanitizedFrames.map(frame => frame.id),
  }), normalizedOrigin)

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: nextPageId,
    pages: [...ensureArray(composition.pages), nextPage],
    frames: [...ensureArray(composition.frames), ...sanitizedFrames],
    elements: [...ensureArray(composition.elements), ...nextElements],
    assets: [...ensureArray(composition.assets), ...nextAssets],
    ...(payload.composition
      ? {
          themeTokens: {
            ...normalizeThemeTokens(composition.themeTokens),
            ...normalizeThemeTokens(payload.composition.themeTokens),
          },
        }
      : {}),
  })
}

export function mergeCanvasLibraryFrameTemplate(
  document: SceneDocument | CompositionModel | unknown,
  payload: CanvasLibraryFrameTemplatePayload,
  origin: CanvasLibraryOriginMetadata,
  pageId?: string,
): SceneDocument {
  const { base, composition } = resolveCompositionDocumentState(document)
  const normalizedOrigin = normalizeCanvasLibraryOrigin(origin)
  const targetPageId = ensureArray(composition.pages).some(page => normalizeString(page.id) === normalizeString(pageId))
    ? normalizeString(pageId)
    : resolveCompositionCurrentPage(composition).id
  const existingFrameIds = new Set(ensureArray(composition.frames).map(frame => normalizeString(frame.id)).filter(Boolean))
  const existingAssetIds = new Set(ensureArray(composition.assets).map(asset => normalizeString(asset.id)).filter(Boolean))
  const existingElementIds = new Set(ensureArray(composition.elements).map(element => normalizeString(element.id)).filter(Boolean))
  const assetIdMap = new Map<string, string>()

  const nextAssets = ensureArray(payload.assets).map((asset) => {
    const nextAssetId = resolveCanvasLibraryNextIdentifier(existingAssetIds, 'asset')
    assetIdMap.set(normalizeString(asset.id), nextAssetId)
    return applyCanvasLibraryOriginToAsset(normalizeDesignAssetModel({
      ...asset,
      id: nextAssetId,
    }, 0), normalizedOrigin)
  })

  const nextFrameId = resolveCanvasLibraryNextIdentifier(existingFrameIds, 'frame')
  const sourceMetadata = normalizeRecord(payload.frame.metadata)
  const sourceDeviceMetadata = normalizeRecord(sourceMetadata.device)
  const sanitizedFrame = applyCanvasLibraryOriginToFrame(sanitizeCanvasLibraryFrameLinks(normalizeDesignFrameModel({
    ...payload.frame,
    id: nextFrameId,
    pageId: targetPageId,
    metadata: {
      ...sourceMetadata,
      device: {
        ...sourceDeviceMetadata,
        shellAssetId: normalizeString(assetIdMap.get(normalizeString(sourceDeviceMetadata.shellAssetId))) || undefined,
        mockupSourceFrameId: '',
      },
    },
  }, 0, targetPageId), new Set([nextFrameId])), normalizedOrigin)

  const nextElements = ensureArray(payload.elements).map((element, index) => {
    const nextElementId = resolveCanvasLibraryNextIdentifier(existingElementIds, 'element')
    return normalizeCompositionElementModel({
      ...element,
      id: nextElementId,
      pageId: targetPageId,
      frameId: nextFrameId,
    }, index, {
      fallbackPageId: targetPageId,
      fallbackFrameId: nextFrameId,
    })
  })

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: targetPageId,
    frames: [...ensureArray(composition.frames), sanitizedFrame],
    elements: [...ensureArray(composition.elements), ...nextElements],
    assets: [...ensureArray(composition.assets), ...nextAssets],
  })
}

function renderCompositionBackdrop(width: number, height: number, background: string, accent: string, gradientId: string): string {
  return `
  <defs>
    <linearGradient id="${gradientId}" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${escapeXml(background)}" />
      <stop offset="1" stop-color="${escapeXml(accent)}" stop-opacity="0.18" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#${gradientId})" />
  <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.22)}" r="${Math.round(Math.min(width, height) * 0.1)}" fill="${escapeXml(accent)}" fill-opacity="0.1" />
  <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.78)}" r="${Math.round(Math.min(width, height) * 0.08)}" fill="#ffffff" fill-opacity="0.05" />
`.trim()
}

export function renderCompositionAssetToSvg(
  document: SceneDocument | CompositionModel | unknown,
  options: {
    pageId?: string
    frameId?: string
    padding?: number
  } = {},
): string {
  const state = resolveCompositionDocumentState(document)
  const sceneDocument = finalizeCompositionSceneDocument(state.base, state.composition)
  const composition = sceneDocument.sourceModel.kind === 'composition'
    ? sceneDocument.sourceModel
    : defaultCompositionModel(sceneDocument.templateKey || 'device-showcase')
  const pageIdFromFrame = ensureArray(composition.frames).find(frame => normalizeString(frame.id) === normalizeString(options.frameId))?.pageId
  const currentPage = resolveCompositionCurrentPage(composition)
  const page = ensureArray(composition.pages).find((entry) => {
    return normalizeString(entry.id) === normalizeString(pageIdFromFrame || options.pageId || currentPage.id)
  }) || currentPage
  const pageFrames = resolveCompositionFramesForPage(composition, page.id)
  const singleFrame = ensureArray(pageFrames).find(frame => normalizeString(frame.id) === normalizeString(options.frameId)) || null
  const exportFrames = singleFrame ? [singleFrame] : pageFrames
  const padding = singleFrame ? 0 : Math.max(48, Math.round(toFiniteNumber(options.padding, 80)))
  const exportBounds = singleFrame
    ? resolveSingleFrameExportBounds(composition, singleFrame)
    : exportFrames.map(frame => resolveFrameExportRect(composition, frame)).reduce((bounds, frameRect) => resolveRectUnion(bounds, frameRect))
  const width = singleFrame
    ? Math.round(exportBounds.width)
    : Math.max(DEFAULT_ARTBOARD_WIDTH, Math.round(exportBounds.width + padding * 2))
  const height = singleFrame
    ? Math.round(exportBounds.height)
    : Math.max(DEFAULT_ARTBOARD_HEIGHT, Math.round(exportBounds.height + padding * 2))
  const offsetX = singleFrame ? -exportBounds.x : padding - exportBounds.x
  const offsetY = singleFrame ? -exportBounds.y : padding - exportBounds.y
  const themeTokens = singleFrame
    ? resolveFrameThemeTokens(composition, singleFrame)
    : normalizeThemeTokens(composition.themeTokens, defaultCompositionModel(composition.templateKey).themeTokens)
  const background = resolveThemeColorToken(
    singleFrame ? themeTokens.background : page.background,
    themeTokens,
    themeTokens.background || '#0b1220',
  )
  const accent = resolveThemeColorToken(themeTokens.accent, themeTokens, '#38bdf8')
  const deviceFrameKey = normalizeString(
    singleFrame?.deviceFramePresetKey
    || exportFrames.find(frame => frame.kind === 'device_mockup')?.deviceFramePresetKey
    || composition.deviceFramePresetKey,
  ) || 'iphone-16-pro'
  const gradientId = sanitizeIdentifier(`${page.id}-${singleFrame?.id || 'page'}-bg`, 'composition-bg')
  const pageClipId = sanitizeIdentifier(`${page.id}-page-clip`, 'page-clip')
  const label = singleFrame ? singleFrame.name : `${page.name} · ${exportFrames.length} Frame`
  const pageElements = singleFrame
    ? resolveFrameVisiblePageOverlayElements(composition, singleFrame)
    : resolveDisplayCompositionElementsForPage(composition, page.id)
  const pageElementMarkup = pageElements
    .map(element => renderDesignElementMarkup(element, themeTokens, offsetX, offsetY))
    .join('')
  const frameMarkup = exportFrames.map(frame => renderDesignFrameMarkup(frame, composition, offsetX, offsetY)).join('')
  const shouldClipPage = !singleFrame && isDesignPageClipContentEnabled(page)
  const clippedMarkup = shouldClipPage
    ? `<defs><clipPath id="${pageClipId}"><rect x="0" y="0" width="${width}" height="${height}" rx="24" ry="24" /></clipPath></defs><g clip-path="url(#${pageClipId})">${pageElementMarkup}${frameMarkup}</g>`
    : `${pageElementMarkup}${frameMarkup}`

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" data-template-key="${escapeXml(composition.templateKey)}" data-device-frame="${escapeXml(deviceFrameKey)}" data-page-id="${escapeXml(page.id)}"${singleFrame ? ` data-frame-id="${escapeXml(singleFrame.id)}"` : ''}>
  ${renderCompositionBackdrop(width, height, background, accent, gradientId)}
  ${clippedMarkup}
  <text x="${singleFrame ? 24 : 40}" y="${height - 28}" fill="${escapeXml(themeTokens.muted || '#94a3b8')}" font-size="${singleFrame ? 14 : 18}" font-weight="500">${escapeXml(label)}</text>
</svg>`.trim()
}

export function renderCompositionFramePreviewSvg(
  document: SceneDocument | CompositionModel | unknown,
  frameId: string,
): string {
  const state = resolveCompositionDocumentState(document)
  const sceneDocument = finalizeCompositionSceneDocument(state.base, state.composition)
  const composition = sceneDocument.sourceModel.kind === 'composition'
    ? sceneDocument.sourceModel
    : defaultCompositionModel(sceneDocument.templateKey || 'device-showcase')
  const frame = ensureArray(composition.frames).find(item => normalizeString(item.id) === normalizeString(frameId)) || null
  if (!frame)
    return ''

  const width = Math.max(1, Math.round(frame.width))
  const height = Math.max(1, Math.round(frame.height))
  const offsetX = -frame.x
  const offsetY = -frame.y
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" data-frame-id="${escapeXml(frame.id)}">
  ${renderDesignFrameMarkup(frame, composition, offsetX, offsetY)}
</svg>`.trim()
}
