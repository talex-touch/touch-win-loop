import type {
  ArchitectureElementModel,
  ArchitectureImportResult,
  ArchitectureModel,
  ArchitectureRelationModel,
  CompositionModel,
  DesignAssetModel,
  DesignElementModel,
  DesignFrameKind,
  DesignFrameModel,
  DesignPageModel,
  DesignTemplateManifest,
  DeviceFramePreset,
  DrawMode,
  DrawRuntimeSnapshot,
  GraphSourceEdge,
  GraphSourceModel,
  GraphSourceNode,
  SceneArtboard,
  SceneDocument,
  SceneEditorEngine,
  SceneEdge,
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
} from '../types/domain'
import YAML from 'yaml'

const DEFAULT_ARTBOARD_WIDTH = 1600
const DEFAULT_ARTBOARD_HEIGHT = 900
const DEFAULT_COMPOSITION_PAGE_ID = 'page-1'
const DEFAULT_COMPOSITION_FRAME_ID = 'frame-1'
type ArchitectureMermaidView = 'system_context' | 'container' | 'dependency_map'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

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

function sanitizeIdentifier(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
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
    metadata: normalizeRecord(input.metadata),
  }
}

function createDesignElement(input: Partial<DesignElementModel> = {}, fallbackId = 'element-1'): DesignElementModel {
  return {
    id: sanitizeIdentifier(input.id, fallbackId),
    type: (normalizeString(input.type) as DesignElementModel['type']) || 'text',
    x: toFiniteNumber(input.x, 0),
    y: toFiniteNumber(input.y, 0),
    width: toPositiveNumber(input.width, 120),
    height: toPositiveNumber(input.height, 40),
    rotation: toFiniteNumber(input.rotation, 0),
    text: normalizeString(input.text) || undefined,
    imageSrc: normalizeString(input.imageSrc) || undefined,
    style: normalizeRecord(input.style) as DesignElementModel['style'],
    metadata: normalizeRecord(input.metadata),
  }
}

function createLegacyCompositionElements(input: {
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
  return {
    id: sanitizeIdentifier(input.id, DEFAULT_COMPOSITION_FRAME_ID),
    pageId: sanitizeIdentifier(input.pageId, DEFAULT_COMPOSITION_PAGE_ID),
    name: normalizeString(input.name) || '封面 Frame',
    kind: (normalizeString(input.kind) as DesignFrameKind) || 'device_mockup',
    x: 120,
    y: 120,
    width: size.width,
    height: size.height,
    locked: false,
    templateKey: normalizeString(input.templateKey) || 'device-showcase',
    deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || 'iphone-16-pro',
    elements: createLegacyCompositionElements({
      title: slots.title,
      subtitle: slots.subtitle,
      badge: slots.badge,
      imageSrc: slots.imageSrc,
    }),
    themeTokens,
    metadata: normalizeRecord(input.metadata),
  }
}

function defaultCompositionModel(templateKey = 'device-showcase'): CompositionModel {
  const page = createDefaultDesignPage({
    id: DEFAULT_COMPOSITION_PAGE_ID,
  })
  const frame = createLegacyCompositionFrame({
    id: DEFAULT_COMPOSITION_FRAME_ID,
    pageId: page.id,
    templateKey,
    deviceFramePresetKey: 'iphone-16-pro',
    slots: {},
    themeTokens: defaultCompositionThemeTokens(),
  })
  page.frameIds = [frame.id]
  return {
    kind: 'composition',
    templateKey,
    pages: [page],
    currentPageId: page.id,
    frames: [frame],
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

function normalizeGraphSourceModel(value: unknown): GraphSourceModel {
  const source = normalizeRecord(value)
  return {
    kind: 'graph',
    diagramType: normalizeString(source.diagramType) as GraphSourceModel['diagramType'] || 'flowchart',
    nodes: ensureArray(source.nodes).map(normalizeGraphSourceNode),
    edges: ensureArray(source.edges).map(normalizeGraphSourceEdge),
    groups: ensureArray(source.groups).map((entry, index) => {
      const item = normalizeRecord(entry)
      return {
        id: sanitizeIdentifier(item.id, `group-${index + 1}`),
        label: normalizeString(item.label) || `Group ${index + 1}`,
        childNodeIds: ensureArray(item.childNodeIds).map(id => sanitizeIdentifier(id, '')),
        metadata: normalizeRecord(item.metadata),
      }
    }),
    sourceText: normalizeString(source.sourceText) || undefined,
    metadata: normalizeRecord(source.metadata),
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
    metadata: normalizeRecord(source.metadata),
  }
}

function normalizeDesignFrameModel(value: unknown, index: number, fallbackPageId: string): DesignFrameModel {
  const source = normalizeRecord(value)
  const pageId = sanitizeIdentifier(source.pageId, fallbackPageId)
  return {
    id: sanitizeIdentifier(source.id, `frame-${index + 1}`),
    pageId,
    name: normalizeString(source.name) || `Frame ${index + 1}`,
    kind: (normalizeString(source.kind) as DesignFrameKind) || 'freeform',
    x: toFiniteNumber(source.x, 120),
    y: toFiniteNumber(source.y, 120),
    width: toPositiveNumber(source.width, DEFAULT_ARTBOARD_WIDTH),
    height: toPositiveNumber(source.height, DEFAULT_ARTBOARD_HEIGHT),
    locked: Boolean(source.locked),
    templateKey: normalizeString(source.templateKey) || undefined,
    deviceFramePresetKey: normalizeString(source.deviceFramePresetKey) || undefined,
    elements: ensureArray(source.elements).map((entry, elementIndex) => createDesignElement(normalizeRecord(entry), `frame-${index + 1}-element-${elementIndex + 1}`)),
    embeddedScene: source.embeddedScene
      ? sceneDocumentFromUnknown(source.embeddedScene, {
          fallbackDrawMode: 'diagram',
          fallbackSourceType: 'manual',
        })
      : undefined,
    themeTokens: normalizeThemeTokens(source.themeTokens),
    metadata: normalizeRecord(source.metadata),
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
  return {
    kind: 'composition',
    templateKey: normalizedTemplateKey,
    pages: normalizedPageModels,
    currentPageId,
    frames: normalizedFrames,
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
  if (!normalized)
    return createEmptySceneDocument({
      drawMode: options.fallbackDrawMode || 'freeform',
      sourceType: options.fallbackSourceType || 'manual',
    })

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

export function serializeSceneDocument(document: SceneDocument | unknown): string {
  return JSON.stringify(sceneDocumentFromUnknown(document), null, 2)
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
    key: 'iphone-16-pro',
    title: 'iPhone 16 Pro',
    deviceFamily: 'phone',
    width: 390,
    height: 844,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
  },
  {
    key: 'ipad-air',
    title: 'iPad Air',
    deviceFamily: 'tablet',
    width: 820,
    height: 1180,
    framePadding: 28,
    bezelRadius: 48,
    screenRadius: 30,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
  },
  {
    key: 'browser-window',
    title: 'Browser Window',
    deviceFamily: 'browser',
    width: 1440,
    height: 960,
    framePadding: 0,
    bezelRadius: 28,
    screenRadius: 28,
    background: '#e2e8f0',
    shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
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
  return DEVICE_FRAME_PRESETS.find(preset => preset.key === normalizedKey) || DEVICE_FRAME_PRESETS[0]!
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
    return {
      id: node.id,
      type: node.type || 'node',
      label: node.label,
      x: 96 + depth * 260,
      y: 96 + rowIndex * (height + 56),
      width,
      height,
      shape: sourceModel.diagramType === 'mindmap' ? 'pill' : 'rounded',
      parentId: node.parentId,
      metadata: node.metadata,
    }
  })

  const maxDepth = Math.max(0, ...[...layerOrder.keys()])
  const maxRows = Math.max(1, ...[...layerOrder.values()].map(bucket => bucket.length))
  return {
    nodes: positionedNodes,
    edges: sourceModel.edges.map((edge, index) => ({
      id: edge.id || `edge-${index + 1}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      style: 'solid',
      metadata: edge.metadata,
    })),
    artboards: [createDefaultArtboard(
      Math.max(DEFAULT_ARTBOARD_WIDTH, 320 + (maxDepth + 1) * 260),
      Math.max(DEFAULT_ARTBOARD_HEIGHT, 280 + maxRows * 140),
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

  const nodeMarkup = nodes.map((node) => {
    const x = offsetX + node.x * safeScale
    const y = offsetY + node.y * safeScale
    const nodeWidth = node.width * safeScale
    const nodeHeight = node.height * safeScale
    return `<g>
      <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="18" ry="18" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1" />
      <text x="${x + 18}" y="${y + Math.min(nodeHeight - 16, 32)}" fill="#0f172a" font-size="${Math.max(14, Math.round(18 * safeScale))}" font-weight="600">${escapeXml(node.label)}</text>
    </g>`
  }).join('')

  return `<g>${edgeMarkup}${nodeMarkup}</g>`
}

function renderDesignElementMarkup(element: DesignElementModel, themeTokens: Record<string, string>): string {
  const x = element.x
  const y = element.y
  const width = element.width
  const height = element.height
  const style = normalizeRecord(element.style)

  if (element.type === 'badge') {
    const fill = resolveThemeColorToken(style.fill, themeTokens, themeTokens.accent || '#38bdf8')
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" ry="20" fill="${escapeXml(fill)}" fill-opacity="0.16" stroke="${escapeXml(fill)}" />
      <text x="${x + 18}" y="${y + Math.min(height - 10, 25)}" fill="${escapeXml(fill)}" font-size="18" font-weight="700">${escapeXml(element.text || '')}</text>
    </g>`
  }

  if (element.type === 'shape') {
    const fill = resolveThemeColorToken(style.fill, themeTokens, 'rgba(148, 163, 184, 0.24)')
    const shapeKind = normalizeString(normalizeRecord(element.metadata).shapeKind).toLowerCase()
    if (shapeKind === 'circle' || shapeKind === 'ellipse') {
      return `<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${escapeXml(fill)}" />`
    }
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="28" ry="28" fill="${escapeXml(fill)}" />`
  }

  if (element.type === 'image') {
    if (normalizeString(element.imageSrc)) {
      return `<image href="${escapeXml(element.imageSrc)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`
    }
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" ry="24" fill="#cbd5e1" />
      <text x="${x + 20}" y="${y + 42}" fill="#475569" font-size="18" font-weight="600">待上传图片</text>`
  }

  if (element.type === 'text' || element.type === 'caption') {
    const fontSize = Math.max(12, toFiniteNumber(style.fontSize, element.type === 'caption' ? 24 : 52))
    const fontWeight = Math.max(400, toFiniteNumber(style.fontWeight, element.type === 'caption' ? 500 : 700))
    const lineHeight = Math.round(fontSize * 1.18)
    const lines = splitTextLines(element.text || '', Math.max(8, Math.round(width / Math.max(1, fontSize * 0.72))), 4)
    const color = resolveThemeColorToken(style.color, themeTokens, element.type === 'caption' ? themeTokens.muted || '#94a3b8' : themeTokens.text || '#e2e8f0')
    return lines.map((line, index) => {
      return `<text x="${x}" y="${y + fontSize + index * lineHeight}" fill="${escapeXml(color)}" font-size="${fontSize}" font-weight="${fontWeight}">${escapeXml(line)}</text>`
    }).join('')
  }

  return ''
}

function renderDesignFrameMarkup(frame: DesignFrameModel, composition: CompositionModel, offsetX: number, offsetY: number): string {
  const themeTokens = resolveFrameThemeTokens(composition, frame)
  const frameX = frame.x + offsetX
  const frameY = frame.y + offsetY
  const frameWidth = frame.width
  const frameHeight = frame.height
  const frameLabel = `<text x="${frameX + 20}" y="${frameY + 28}" fill="#94a3b8" font-size="14" font-weight="600">${escapeXml(frame.name)}</text>`
  const backgroundFill = escapeXml(themeTokens.background || '#0f172a')

  if (frame.kind === 'diagram') {
    return `<g>
      <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="#f8fafc" stroke="#cbd5e1" />
      ${frameLabel}
      <g transform="translate(${frameX}, ${frameY + 32})">
        ${renderEmbeddedSceneMarkup(frame.embeddedScene, frameWidth, frameHeight - 40)}
      </g>
    </g>`
  }

  if (frame.kind === 'device_mockup') {
    const preset = resolveDeviceFramePreset(frame.deviceFramePresetKey || composition.deviceFramePresetKey || 'iphone-16-pro')
    const imageElement = ensureArray(frame.elements).find(element => element.type === 'image')
    const textMarkup = ensureArray(frame.elements)
      .filter(element => element.type !== 'image')
      .map(element => renderDesignElementMarkup(element, themeTokens))
      .join('')
    const frameScale = Math.min((frameWidth * 0.34) / preset.width, (frameHeight * 0.72) / preset.height)
    const mockupWidth = Math.round(preset.width * frameScale)
    const mockupHeight = Math.round(preset.height * frameScale)
    const mockupX = frameX + frameWidth - mockupWidth - 72
    const mockupY = frameY + Math.round((frameHeight - mockupHeight) / 2)
    const screenX = mockupX + Math.round(preset.framePadding * frameScale)
    const screenY = mockupY + Math.round((preset.deviceFamily === 'browser' ? 54 : preset.framePadding) * frameScale)
    const screenWidth = mockupWidth - Math.round(preset.framePadding * frameScale * 2)
    const screenHeight = preset.deviceFamily === 'browser'
      ? mockupHeight - Math.round(74 * frameScale)
      : mockupHeight - Math.round(preset.framePadding * frameScale * 2)
    const clipId = `frame-clip-${sanitizeIdentifier(frame.id, 'frame')}`
    const browserChrome = preset.deviceFamily === 'browser'
      ? `<rect x="${mockupX}" y="${mockupY}" width="${mockupWidth}" height="54" rx="28" ry="28" fill="#e2e8f0" />
         <circle cx="${mockupX + 28}" cy="${mockupY + 27}" r="6" fill="#fb7185" />
         <circle cx="${mockupX + 48}" cy="${mockupY + 27}" r="6" fill="#f59e0b" />
         <circle cx="${mockupX + 68}" cy="${mockupY + 27}" r="6" fill="#10b981" />`
      : ''
    const imageMarkup = imageElement?.imageSrc
      ? `<image href="${escapeXml(imageElement.imageSrc)}" x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`
      : `<rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="${Math.max(18, Math.round(preset.screenRadius * frameScale))}" ry="${Math.max(18, Math.round(preset.screenRadius * frameScale))}" fill="#cbd5e1" />
         <text x="${screenX + 18}" y="${screenY + 36}" fill="#475569" font-size="16" font-weight="600">上传截图</text>`

    return `<g>
      <defs>
        <clipPath id="${clipId}">
          <rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="${Math.max(18, Math.round(preset.screenRadius * frameScale))}" ry="${Math.max(18, Math.round(preset.screenRadius * frameScale))}" />
        </clipPath>
      </defs>
      <rect x="${frameX}" y="${frameY}" width="${frameWidth}" height="${frameHeight}" rx="32" ry="32" fill="${backgroundFill}" />
      ${frameLabel}
      ${textMarkup}
      <g filter="drop-shadow(0 24px 64px rgba(2, 6, 23, 0.28))">
        <rect x="${mockupX}" y="${mockupY}" width="${mockupWidth}" height="${mockupHeight}" rx="${Math.max(24, Math.round(preset.bezelRadius * frameScale))}" ry="${Math.max(24, Math.round(preset.bezelRadius * frameScale))}" fill="${escapeXml(preset.background)}" />
        ${browserChrome}
        ${imageMarkup}
      </g>
    </g>`
  }

  const elementMarkup = ensureArray(frame.elements).map(element => renderDesignElementMarkup(element, themeTokens)).join('')
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
  const explicitMatch = normalizedToken.match(/^([A-Za-z0-9_.:-]+)\s*([\[\(\{].*[\]\)\}])$/)
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

  const plainMatch = normalizedToken.match(/^([A-Za-z0-9_.:-]+)$/)
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

export function importFromMermaid(sourceText: string): SceneDocument {
  const graphNodes = new Map<string, GraphSourceNode>()
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

    const normalizedLine = rawLine.replace(/%%.*$/g, '').trim()
    if (normalizedLine)
      lines.push(normalizedLine)
  }

  for (const [index, line] of lines.entries()) {
    if (/^(graph|flowchart)\b/i.test(line)) {
      if (!hasDiagramTypeHint)
        diagramType = 'flowchart'
      continue
    }
    if (/^mindmap\b/i.test(line)) {
      if (!hasDiagramTypeHint)
        diagramType = 'mindmap'
      continue
    }
    if (/^(subgraph|end|classDef|class|style|linkStyle)\b/i.test(line))
      continue

    const labeledEdge = line.match(/^(.+?)\s*(-->|---|==>|-.->)\s*\|([^|]+)\|\s*(.+)$/)
    const simpleEdge = line.match(/^(.+?)\s*(-->|---|==>|-.->)\s*(.+)$/)

    if (labeledEdge || simpleEdge) {
      const parts = labeledEdge || simpleEdge
      const sourceToken = parts?.[1] || ''
      const label = labeledEdge?.[3] || ''
      const targetToken = labeledEdge?.[4] || simpleEdge?.[3] || ''
      const sourceNode = upsertGraphNode(graphNodes, sourceToken, index * 2 + 1)
      const targetNode = upsertGraphNode(graphNodes, targetToken, index * 2 + 2)
      graphEdges.push({
        id: sanitizeIdentifier(`${sourceNode.id}-${targetNode.id}-${graphEdges.length + 1}`, `edge-${graphEdges.length + 1}`),
        source: sourceNode.id,
        target: targetNode.id,
        label: normalizeString(label) || undefined,
        metadata: {
          mermaidOperator: parts?.[2],
        },
      })
      continue
    }

    const node = parseMermaidNodeToken(line, index + 1)
    graphNodes.set(node.id, node)
  }

  const sourceModel: GraphSourceModel = {
    kind: 'graph',
    diagramType,
    nodes: [...graphNodes.values()],
    edges: graphEdges,
    groups: [],
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
  const headingMatch = normalized.match(/^(#{1,6})\s+(.+)$/)
  if (headingMatch && headingMatch[1] && headingMatch[2])
    return { depth: headingMatch[1].length, label: normalizeString(headingMatch[2]) }

  const indent = normalized.match(/^\s*/)?.[0].length || 0
  const bullet = normalized.trim().match(/^([-*+]|\d+\.)\s+(.+)$/)
  if (!bullet)
    return null
  return {
    depth: Math.floor(indent / 2) + 1,
    label: normalizeString(bullet[2]),
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

function parseColumnDefinition(rawValue: string): SchemaColumnModel | null {
  const normalized = normalizeString(rawValue)
  if (!normalized)
    return null

  const nameMatch = normalized.match(/^([A-Za-z0-9_"`[\].-]+)\s+(.+)$/)
  if (!nameMatch)
    return null

  const name = cleanSqlIdentifier(nameMatch[1] || '')
  const remainder = normalizeString(nameMatch[2] || '')
  if (!name || !remainder)
    return null

  const constraintIndex = remainder.search(/\b(not null|null|default|primary key|references|unique|constraint|check|comment)\b/i)
  const type = constraintIndex >= 0 ? remainder.slice(0, constraintIndex).trim() : remainder
  const defaultMatch = remainder.match(/\bdefault\s+(.+?)(?=\s+(?:not null|null|primary key|references|unique|constraint|check|comment)\b|$)/i)
  const referencesMatch = remainder.match(/\breferences\s+([A-Za-z0-9_"`.[\]-]+)\s*\(([^)]+)\)/i)

  return {
    name,
    type: type || 'text',
    nullable: !/\bnot null\b/i.test(remainder),
    defaultValue: normalizeString(defaultMatch?.[1]) || undefined,
    isPrimaryKey: /\bprimary key\b/i.test(remainder),
    referencesTable: normalizeString(referencesMatch?.[1] ? parseQualifiedTableName(referencesMatch[1]).tableName : ''),
    referencesColumn: normalizeString(referencesMatch?.[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean)[0],
    metadata: {},
  }
}

export function importFromDDL(sourceText: string): SchemaImportResult {
  const tables: SchemaTableModel[] = []
  const warnings: string[] = []
  const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_"`.[\]-]+)\s*\(([\s\S]*?)\)\s*;/gi
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

      const fkMatch = normalized.match(/^(?:constraint\s+([A-Za-z0-9_"`-]+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+([A-Za-z0-9_"`.[\]-]+)\s*\(([^)]+)\)/i)
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

      const pkMatch = normalized.match(/^(?:constraint\s+([A-Za-z0-9_"`-]+)\s+)?primary\s+key\s*\(([^)]+)\)/i)
      if (pkMatch) {
        primaryKeys.push(...normalizeString(pkMatch[2]).split(',').map(item => cleanSqlIdentifier(item)).filter(Boolean))
        continue
      }

      const uniqueMatch = normalized.match(/^(?:constraint\s+([A-Za-z0-9_"`-]+)\s+)?unique\s*\(([^)]+)\)/i)
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
  if (/(db|database|postgres|mysql|redis|mongo)/.test(normalized))
    return 'database'
  if (/(queue|topic|kafka|mq|stream)/.test(normalized))
    return 'queue'
  if (/(client|web|app|mobile|mini)/.test(normalized))
    return 'component'
  if (/(external|third|partner|stripe|slack|openai)/.test(normalized))
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
  if (/(web|api|server|worker|gateway|service|app)/.test(normalizedName))
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

function deriveLegacySlotsFromFrame(frame: DesignFrameModel | undefined): Record<string, unknown> {
  if (!frame)
    return {}

  const elements = ensureArray(frame.elements)
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
  const pages = (rawPages.length > 0 ? rawPages : [createDefaultDesignPage({
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

  return {
    ...composition,
    pages: normalizedPages,
    currentPageId,
    frames,
  }
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
          ...deriveLegacySlotsFromFrame(preferredFrame),
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
  if (kind === 'device_mockup')
    return `设备 Frame ${index}`
  if (kind === 'template')
    return `模板 Frame ${index}`
  return `自由 Frame ${index}`
}

function resolveDefaultFrameSize(kind: DesignFrameKind, aspectRatio = '16:9'): { width: number, height: number } {
  if (kind === 'diagram')
    return { width: 1080, height: 720 }
  if (kind === 'freeform')
    return { width: 960, height: 640 }

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
  const kind = (normalizeString(input.kind) as DesignFrameKind) || 'freeform'
  const pageFrameCount = ensureArray(composition.frames).filter(frame => normalizeString(frame.pageId) === pageId).length
  const frameIndex = pageFrameCount + 1
  const aspectRatio = normalizeString(input.aspectRatio) || composition.aspectRatio || '16:9'
  const defaultSize = resolveDefaultFrameSize(kind, aspectRatio)
  const themeTokens = {
    ...normalizeThemeTokens(composition.themeTokens, defaultCompositionThemeTokens()),
    ...normalizeThemeTokens(input.themeTokens),
  }
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
      id: normalizeString(input.id) || `frame-${Date.now()}`,
      pageId,
      name: normalizeString(input.name) || resolveDesignFrameDefaultName(kind, frameIndex),
      kind,
      templateKey: normalizeString(input.templateKey) || composition.templateKey,
      deviceFramePresetKey: normalizeString(input.deviceFramePresetKey) || composition.deviceFramePresetKey,
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
      id: normalizeString(input.id) || `frame-${Date.now()}`,
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

  const defaultElements = ensureArray(input.elements).length > 0
    ? ensureArray(input.elements)
    : [
        createDesignElement({
          id: 'title',
          type: 'text',
          x: 56,
          y: 64,
          width: 520,
          height: 80,
          text: normalizeString(input.title) || '新建设计 Frame',
          style: {
            fontSize: 38,
            fontWeight: 700,
            color: 'text',
          },
        }, 'title'),
        createDesignElement({
          id: 'subtitle',
          type: 'caption',
          x: 56,
          y: 132,
          width: 520,
          height: 64,
          text: normalizeString(input.subtitle) || '在右侧属性面板继续编辑文字、图片和形状。',
          style: {
            fontSize: 20,
            fontWeight: 500,
            color: 'muted',
          },
        }, 'subtitle'),
        createDesignElement({
          id: 'panel',
          type: 'shape',
          x: 560,
          y: 92,
          width: 280,
          height: 280,
          style: {
            fill: 'rgba(148, 163, 184, 0.18)',
          },
          metadata: {
            shapeKind: 'rect',
          },
        }, 'panel'),
      ]

  return normalizeDesignFrameModel({
    id: normalizeString(input.id) || `frame-${Date.now()}`,
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
      const edgeMatch = line.match(/^(.+?)\s*(?:-->|->|=>)\s*(.+)$/)
      if (!edgeMatch)
        continue
      const sourceElement = ensureElement(edgeMatch[1] || '')
      const targetElement = ensureElement(edgeMatch[2] || '')
      relations.push({
        id: `relation-${relations.length + 1}`,
        source: sourceElement.id,
        target: targetElement.id,
        protocol: inferProtocolFromValue(edgeMatch[0]),
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

  return finalizeCompositionSceneDocument(base, {
    ...composition,
    currentPageId: pageId,
    frames: [...framesWithoutTarget, nextFrame],
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
  const minX = Math.min(...exportFrames.map(frame => frame.x))
  const minY = Math.min(...exportFrames.map(frame => frame.y))
  const maxX = Math.max(...exportFrames.map(frame => frame.x + frame.width))
  const maxY = Math.max(...exportFrames.map(frame => frame.y + frame.height))
  const width = singleFrame
    ? Math.round(singleFrame.width)
    : Math.max(DEFAULT_ARTBOARD_WIDTH, Math.round(maxX - minX + padding * 2))
  const height = singleFrame
    ? Math.round(singleFrame.height)
    : Math.max(DEFAULT_ARTBOARD_HEIGHT, Math.round(maxY - minY + padding * 2))
  const offsetX = singleFrame ? -singleFrame.x : padding - minX
  const offsetY = singleFrame ? -singleFrame.y : padding - minY
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
  const label = singleFrame ? singleFrame.name : `${page.name} · ${exportFrames.length} Frame`
  const frameMarkup = exportFrames.map(frame => renderDesignFrameMarkup(frame, composition, offsetX, offsetY)).join('')

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" data-template-key="${escapeXml(composition.templateKey)}" data-device-frame="${escapeXml(deviceFrameKey)}" data-page-id="${escapeXml(page.id)}"${singleFrame ? ` data-frame-id="${escapeXml(singleFrame.id)}"` : ''}>
  ${renderCompositionBackdrop(width, height, background, accent, gradientId)}
  ${frameMarkup}
  <text x="${singleFrame ? 24 : 40}" y="${height - 28}" fill="${escapeXml(themeTokens.muted || '#94a3b8')}" font-size="${singleFrame ? 14 : 18}" font-weight="500">${escapeXml(label)}</text>
</svg>`.trim()
}
