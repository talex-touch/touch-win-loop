import type {
  CompositionBlock,
  CompositionModel,
  DesignAssetModel,
  DesignDocumentV1,
  DesignElementModel,
  DesignFrameModel,
  DesignPageModel,
  SceneDocument,
} from '../types/domain'
import {
  createEmptySceneDocument,
  sceneDocumentFromUnknown,
} from './scene-document'

const DEFAULT_TEMPLATE_KEY = 'device-showcase'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function ensureArray<T>(value: T[] | readonly T[] | null | undefined): T[]
function ensureArray<T = unknown>(value: unknown): T[]
function ensureArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function cloneDesignElement(element: DesignElementModel): DesignElementModel {
  return {
    ...element,
    points: element.points
      ? element.points.map(point => ({ ...point }))
      : undefined,
    style: element.style ? { ...element.style } : undefined,
    metadata: element.metadata ? { ...element.metadata } : undefined,
  }
}

function cloneDesignPage(page: DesignPageModel): DesignPageModel {
  return {
    ...page,
    frameIds: page.frameIds ? [...page.frameIds] : undefined,
    viewport: page.viewport
      ? {
          x: Number(page.viewport.x || 0),
          y: Number(page.viewport.y || 0),
          zoom: Number(page.viewport.zoom || 1),
        }
      : undefined,
    metadata: page.metadata ? { ...page.metadata } : undefined,
  }
}

function cloneDesignFrame(frame: DesignFrameModel): DesignFrameModel {
  return {
    ...frame,
    elements: frame.elements?.map(cloneDesignElement),
    embeddedScene: frame.embeddedScene
      ? sceneDocumentFromUnknown(frame.embeddedScene, {
          fallbackDrawMode: 'diagram',
          fallbackSourceType: 'manual',
        })
      : undefined,
    themeTokens: frame.themeTokens ? { ...frame.themeTokens } : undefined,
    metadata: frame.metadata ? { ...frame.metadata } : undefined,
  }
}

function cloneDesignAsset(asset: DesignAssetModel): DesignAssetModel {
  return {
    ...asset,
    metadata: asset.metadata ? { ...asset.metadata } : undefined,
  }
}

function cloneCompositionBlock(block: CompositionBlock): CompositionBlock {
  return {
    ...block,
    items: block.items
      ? block.items.map(item => ({ ...item }))
      : undefined,
    metadata: block.metadata ? { ...block.metadata } : undefined,
  }
}

function cloneCompositionModel(composition: CompositionModel): CompositionModel {
  return {
    ...composition,
    pages: ensureArray(composition.pages).map(cloneDesignPage),
    frames: ensureArray(composition.frames).map(cloneDesignFrame),
    elements: ensureArray(composition.elements).map(cloneDesignElement),
    assets: ensureArray(composition.assets).map(cloneDesignAsset),
    slots: composition.slots ? { ...composition.slots } : undefined,
    themeTokens: composition.themeTokens ? { ...composition.themeTokens } : undefined,
    layoutRules: composition.layoutRules ? { ...composition.layoutRules } : undefined,
    allowedBlocks: composition.allowedBlocks ? [...composition.allowedBlocks] : undefined,
    exportPresets: composition.exportPresets ? [...composition.exportPresets] : undefined,
    blocks: composition.blocks?.map(cloneCompositionBlock),
    metadata: composition.metadata ? { ...composition.metadata } : undefined,
  }
}

export function isDesignDocumentV1(value: unknown): value is DesignDocumentV1 {
  return isRecord(value) && normalizeString(value.schema) === 'design_document_v1'
}

export function sceneDocumentToDesignDocument(value: SceneDocument | unknown): DesignDocumentV1 {
  const normalized = sceneDocumentFromUnknown(value, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })

  if (normalized.sourceModel.kind !== 'composition') {
    return createEmptyDesignDocument({
      templateKey: normalizeString(normalized.templateKey) || DEFAULT_TEMPLATE_KEY,
    })
  }

  const composition = cloneCompositionModel(normalized.sourceModel)
  return {
    version: 1,
    schema: 'design_document_v1',
    drawMode: 'composition',
    editorEngine: 'canvaskit_wasm',
    templateKey: normalizeString(normalized.templateKey || composition.templateKey) || DEFAULT_TEMPLATE_KEY,
    pages: composition.pages || [],
    currentPageId: normalizeString(composition.currentPageId) || composition.pages?.[0]?.id,
    frames: composition.frames || [],
    elements: composition.elements || [],
    assets: composition.assets || [],
    slots: composition.slots ? { ...composition.slots } : undefined,
    themeTokens: composition.themeTokens ? { ...composition.themeTokens } : undefined,
    layoutRules: composition.layoutRules ? { ...composition.layoutRules } : undefined,
    allowedBlocks: composition.allowedBlocks ? [...composition.allowedBlocks] : undefined,
    exportPresets: composition.exportPresets ? [...composition.exportPresets] : undefined,
    aspectRatio: normalizeString(composition.aspectRatio) || undefined,
    deviceFramePresetKey: normalizeString(composition.deviceFramePresetKey) || undefined,
    blocks: composition.blocks?.map(cloneCompositionBlock),
    metadata: normalized.metadata ? { ...normalized.metadata } : undefined,
    createdAt: normalizeString(normalized.createdAt) || undefined,
    updatedAt: normalizeString(normalized.updatedAt) || undefined,
  }
}

export function createEmptyDesignDocument(input: {
  templateKey?: string
} = {}): DesignDocumentV1 {
  const scene = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'manual',
    templateKey: normalizeString(input.templateKey) || DEFAULT_TEMPLATE_KEY,
    editorEngine: 'canvaskit_wasm',
  })
  return sceneDocumentToDesignDocument(scene)
}

export function designDocumentFromUnknown(value: unknown): DesignDocumentV1 {
  if (!isDesignDocumentV1(value))
    return createEmptyDesignDocument()

  const templateKey = normalizeString(value.templateKey) || DEFAULT_TEMPLATE_KEY
  const pages = ensureArray(value.pages).map(page => cloneDesignPage(page as DesignPageModel))
  const frames = ensureArray(value.frames).map(frame => cloneDesignFrame(frame as DesignFrameModel))
  const elements = ensureArray(value.elements).map(element => cloneDesignElement(element as DesignElementModel))
  const assets = ensureArray(value.assets).map(asset => cloneDesignAsset(asset as DesignAssetModel))

  return {
    version: 1,
    schema: 'design_document_v1',
    drawMode: 'composition',
    editorEngine: 'canvaskit_wasm',
    templateKey,
    pages,
    currentPageId: normalizeString(value.currentPageId) || pages[0]?.id,
    frames,
    elements,
    assets,
    slots: isRecord(value.slots) ? { ...value.slots } : undefined,
    themeTokens: isRecord(value.themeTokens)
      ? Object.fromEntries(
          Object.entries(value.themeTokens)
            .map(([key, entry]) => [normalizeString(key), normalizeString(entry)])
            .filter(([key, entry]) => key && entry),
        )
      : undefined,
    layoutRules: isRecord(value.layoutRules) ? { ...value.layoutRules } : undefined,
    allowedBlocks: ensureArray(value.allowedBlocks).map(item => normalizeString(item)).filter(Boolean),
    exportPresets: ensureArray(value.exportPresets).map(item => normalizeString(item)).filter(Boolean),
    aspectRatio: normalizeString(value.aspectRatio) || undefined,
    deviceFramePresetKey: normalizeString(value.deviceFramePresetKey) || undefined,
    blocks: ensureArray(value.blocks).map(cloneCompositionBlock),
    metadata: isRecord(value.metadata) ? { ...value.metadata } : undefined,
    createdAt: normalizeString(value.createdAt) || undefined,
    updatedAt: normalizeString(value.updatedAt) || undefined,
  }
}

export function designDocumentToSceneDocument(value: DesignDocumentV1 | unknown): SceneDocument {
  const normalized = designDocumentFromUnknown(value)
  const scene = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'image_mockup',
    templateKey: normalized.templateKey,
    editorEngine: 'canvaskit_wasm',
  })

  return sceneDocumentFromUnknown({
    ...scene,
    drawMode: 'composition',
    sourceType: 'image_mockup',
    templateKey: normalized.templateKey,
    editorEngine: 'canvaskit_wasm',
    sourceModel: {
      kind: 'composition',
      templateKey: normalized.templateKey,
      pages: normalized.pages.map(cloneDesignPage),
      currentPageId: normalizeString(normalized.currentPageId) || normalized.pages[0]?.id,
      frames: normalized.frames.map(cloneDesignFrame),
      elements: normalized.elements.map(cloneDesignElement),
      assets: normalized.assets.map(cloneDesignAsset),
      slots: normalized.slots ? { ...normalized.slots } : undefined,
      themeTokens: normalized.themeTokens ? { ...normalized.themeTokens } : undefined,
      layoutRules: normalized.layoutRules ? { ...normalized.layoutRules } : undefined,
      allowedBlocks: normalized.allowedBlocks ? [...normalized.allowedBlocks] : undefined,
      exportPresets: normalized.exportPresets ? [...normalized.exportPresets] : undefined,
      aspectRatio: normalizeString(normalized.aspectRatio) || undefined,
      deviceFramePresetKey: normalizeString(normalized.deviceFramePresetKey) || undefined,
      blocks: normalized.blocks?.map(cloneCompositionBlock),
      metadata: normalized.metadata ? { ...normalized.metadata } : undefined,
    },
    metadata: normalized.metadata ? { ...normalized.metadata } : undefined,
    createdAt: normalizeString(normalized.createdAt) || undefined,
    updatedAt: normalizeString(normalized.updatedAt) || undefined,
  }, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
}

export function parseDesignDocumentString(rawValue: string): DesignDocumentV1 | null {
  const normalized = normalizeString(rawValue)
  if (!normalized)
    return null

  try {
    const parsed = JSON.parse(normalized) as unknown
    return isDesignDocumentV1(parsed) ? designDocumentFromUnknown(parsed) : null
  }
  catch {
    return null
  }
}

export function serializeDesignDocument(value: DesignDocumentV1 | unknown): string {
  return JSON.stringify(designDocumentFromUnknown(value), null, 2)
}
