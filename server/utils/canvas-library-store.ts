import type { Queryable } from '~~/server/utils/db'
import type {
  CanvasLibraryAssetKind,
  CanvasLibraryBinaryAssetPayload,
  CanvasLibraryItem,
  CanvasLibraryItemKind,
  CanvasLibraryItemPayload,
  CanvasLibraryItemPayloadType,
  CanvasLibraryItemSource,
  CanvasLibraryItemStatus,
  CanvasLibraryItemVersion,
  CanvasLibraryOriginMetadata,
  CanvasLibraryTemplateTarget,
  Resource,
  SceneDocument,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import {
  applyCanvasLibraryOriginToSceneDocument,
  extractCanvasLibraryFrameTemplate,
  extractCanvasLibraryPageTemplate,
  extractCanvasLibrarySceneTemplate,
  sceneDocumentFromUnknown,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'
import {
  applyProjectCollabUpdate,
  createProjectCollabResource,
  getProjectCollabSnapshot,
  getProjectResourceById,
} from '~~/server/utils/project-resource-store'

interface CanvasLibraryItemRow {
  id: string
  slug: string
  title: string
  summary: string
  kind: CanvasLibraryItemKind
  template_target: CanvasLibraryTemplateTarget | null
  asset_kind: CanvasLibraryAssetKind | null
  status: CanvasLibraryItemStatus
  tags: string[] | null
  cover: Record<string, unknown> | string | null
  source: CanvasLibraryItemSource
  draft_version_id: string | null
  published_version_id: string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface CanvasLibraryItemVersionRow {
  id: string
  item_id: string
  version: number | string
  payload_schema_version: number | string
  payload_type: CanvasLibraryItemPayloadType
  payload: Record<string, unknown> | string | null
  preview_payload: Record<string, unknown> | string | null
  notes: string | null
  created_by_user_id: string | null
  created_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function ensureArray<T>(value: T[] | readonly T[] | null | undefined): T[]
function ensureArray<T = unknown>(value: unknown): T[]
function ensureArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      return normalizeRecord(JSON.parse(value))
    }
    catch {
      return {}
    }
  }
  return normalizeRecord(value)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function toInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.trunc(parsed)
}

function normalizeTags(value: unknown): string[] {
  return ensureArray(value)
    .map(item => normalizeString(item))
    .filter(Boolean)
}

function sanitizeSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function resolveUniqueCanvasLibrarySlug(
  db: Queryable,
  preferredSlug: string,
  itemId?: string,
): Promise<string> {
  const base = sanitizeSlugPart(preferredSlug) || `canvas-library-${randomUUID().slice(0, 8)}`
  let slug = base
  let suffix = 1

  while (true) {
    const result = await db.query<{ id: string }>(
      `SELECT id
       FROM canvas_library_items
       WHERE slug = $1
         AND ($2::TEXT = '' OR id <> $2)
       LIMIT 1`,
      [slug, normalizeString(itemId)],
    )

    if (!result.rows[0]?.id)
      return slug

    suffix += 1
    slug = `${base}-${suffix}`
  }
}

function toCanvasLibraryItem(row: CanvasLibraryItemRow): CanvasLibraryItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: normalizeString(row.summary),
    kind: row.kind,
    templateTarget: row.template_target || undefined,
    assetKind: row.asset_kind || undefined,
    status: row.status,
    tags: normalizeTags(row.tags),
    cover: Object.keys(parseJsonRecord(row.cover)).length > 0 ? parseJsonRecord(row.cover) : null,
    source: row.source,
    draftVersionId: normalizeString(row.draft_version_id) || null,
    publishedVersionId: normalizeString(row.published_version_id) || null,
    createdBy: normalizeString(row.created_by_user_id),
    updatedBy: normalizeString(row.updated_by_user_id),
    createdAt: normalizeString(row.created_at) || undefined,
    updatedAt: normalizeString(row.updated_at) || undefined,
  }
}

function normalizeCanvasLibraryPayload(
  payloadType: CanvasLibraryItemPayloadType,
  value: unknown,
): CanvasLibraryItemPayload {
  const parsed = parseJsonValue(value)
  if (payloadType === 'scene_document')
    return sceneDocumentFromUnknown(parsed, {
      fallbackDrawMode: 'composition',
      fallbackSourceType: 'image_mockup',
    })
  return parsed as CanvasLibraryItemPayload
}

function toCanvasLibraryItemVersion(row: CanvasLibraryItemVersionRow): CanvasLibraryItemVersion {
  return {
    id: row.id,
    itemId: row.item_id,
    version: Math.max(1, toInteger(row.version, 1)),
    payloadSchemaVersion: Math.max(1, toInteger(row.payload_schema_version, 1)),
    payloadType: row.payload_type,
    payload: normalizeCanvasLibraryPayload(row.payload_type, row.payload),
    previewPayload: parseJsonValue(row.preview_payload) as CanvasLibraryItemVersion['previewPayload'],
    notes: normalizeString(row.notes) || undefined,
    createdAt: normalizeString(row.created_at) || undefined,
  }
}

function ensureDrawNodesArray(doc: Y.Doc): Y.Array<unknown> {
  const drawMap = doc.getMap('draw')
  const existingNodes = drawMap.get('nodes')
  if (existingNodes instanceof Y.Array)
    return existingNodes
  const nodes = new Y.Array<unknown>()
  drawMap.set('nodes', nodes)
  return nodes
}

function buildDrawSceneDocumentUpdate(document: SceneDocument | unknown): Uint8Array {
  const doc = new Y.Doc()
  const nodes = ensureDrawNodesArray(doc)
  const sceneDocument = sceneDocumentFromUnknown(document, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  nodes.insert(0, [JSON.parse(serializeSceneDocument(sceneDocument))])
  return Y.encodeStateAsUpdate(doc)
}

function readSceneDocumentFromCollabUpdate(update: Uint8Array): SceneDocument {
  const doc = new Y.Doc()
  if (update.length > 0)
    Y.applyUpdate(doc, update)
  const nodes = ensureDrawNodesArray(doc).toArray()
  const payload = nodes.length === 1 ? nodes[0] : nodes
  return sceneDocumentFromUnknown(payload, {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
}

async function getNextCanvasLibraryVersion(db: Queryable, itemId: string): Promise<number> {
  const result = await db.query<{ version: number | string }>(
    `SELECT COALESCE(MAX(version), 0) AS version
     FROM canvas_library_item_versions
     WHERE item_id = $1`,
    [itemId],
  )
  return Math.max(0, toInteger(result.rows[0]?.version, 0)) + 1
}

async function createCanvasLibraryVersion(
  db: Queryable,
  input: {
    itemId: string
    actorUserId: string
    payloadType: CanvasLibraryItemPayloadType
    payload: CanvasLibraryItemPayload
    previewPayload?: unknown
    notes?: string
    payloadSchemaVersion?: number
  },
): Promise<CanvasLibraryItemVersion> {
  const versionId = randomUUID()
  const version = await getNextCanvasLibraryVersion(db, input.itemId)
  const createdAt = new Date().toISOString()
  await db.query(
    `INSERT INTO canvas_library_item_versions (
      id,
      item_id,
      version,
      payload_schema_version,
      payload_type,
      payload,
      preview_payload,
      notes,
      created_by_user_id,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8, $9, $10
    )`,
    [
      versionId,
      input.itemId,
      version,
      Math.max(1, toInteger(input.payloadSchemaVersion, 1)),
      input.payloadType,
      JSON.stringify(input.payload),
      input.previewPayload === undefined ? null : JSON.stringify(input.previewPayload),
      normalizeString(input.notes),
      input.actorUserId,
      createdAt,
    ],
  )

  return {
    id: versionId,
    itemId: input.itemId,
    version,
    payloadSchemaVersion: Math.max(1, toInteger(input.payloadSchemaVersion, 1)),
    payloadType: input.payloadType,
    payload: input.payload,
    previewPayload: input.previewPayload as CanvasLibraryItemVersion['previewPayload'],
    notes: normalizeString(input.notes) || undefined,
    createdAt,
  }
}

export async function listCanvasLibraryItems(
  db: Queryable,
  input: {
    status?: CanvasLibraryItemStatus | ''
    kind?: CanvasLibraryItemKind | ''
    source?: CanvasLibraryItemSource | ''
    search?: string
    tag?: string
    publishedOnly?: boolean
  } = {},
): Promise<CanvasLibraryItem[]> {
  const values: unknown[] = []
  const conditions: string[] = []

  if (input.publishedOnly) {
    values.push('published')
    conditions.push(`status = $${values.length}`)
  }
  else if (normalizeString(input.status)) {
    values.push(normalizeString(input.status))
    conditions.push(`status = $${values.length}`)
  }

  if (normalizeString(input.kind)) {
    values.push(normalizeString(input.kind))
    conditions.push(`kind = $${values.length}`)
  }

  if (normalizeString(input.source)) {
    values.push(normalizeString(input.source))
    conditions.push(`source = $${values.length}`)
  }

  if (normalizeString(input.search)) {
    values.push(`%${normalizeString(input.search)}%`)
    conditions.push(`(
      title ILIKE $${values.length}
      OR summary ILIKE $${values.length}
      OR slug ILIKE $${values.length}
    )`)
  }

  if (normalizeString(input.tag)) {
    values.push(normalizeString(input.tag))
    conditions.push(`$${values.length} = ANY(tags)`)
  }

  const result = await db.query<CanvasLibraryItemRow>(
    `SELECT
      id,
      slug,
      title,
      summary,
      kind,
      template_target,
      asset_kind,
      status,
      tags,
      cover,
      source,
      draft_version_id,
      published_version_id,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM canvas_library_items
     ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY updated_at DESC, created_at DESC`,
    values,
  )

  return result.rows.map(toCanvasLibraryItem)
}

export async function getCanvasLibraryItemDetail(
  db: Queryable,
  input: {
    itemId: string
    publishedOnly?: boolean
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    } | null> {
  const itemResult = await db.query<CanvasLibraryItemRow>(
    `SELECT
      id,
      slug,
      title,
      summary,
      kind,
      template_target,
      asset_kind,
      status,
      tags,
      cover,
      source,
      draft_version_id,
      published_version_id,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM canvas_library_items
     WHERE id = $1
       ${input.publishedOnly ? `AND status = 'published'` : ''}
     LIMIT 1`,
    [normalizeString(input.itemId)],
  )

  const row = itemResult.rows[0]
  if (!row)
    return null

  const item = toCanvasLibraryItem(row)
  const versionIds = [
    normalizeString(row.draft_version_id),
    normalizeString(row.published_version_id),
  ].filter(Boolean)

  const versions = versionIds.length > 0
    ? await db.query<CanvasLibraryItemVersionRow>(
        `SELECT
          id,
          item_id,
          version,
          payload_schema_version,
          payload_type,
          payload,
          preview_payload,
          notes,
          created_by_user_id,
          created_at::TEXT
         FROM canvas_library_item_versions
         WHERE id = ANY($1::TEXT[])`,
        [versionIds],
      )
    : { rows: [] as CanvasLibraryItemVersionRow[] }

  const versionMap = new Map(versions.rows.map(row => [row.id, toCanvasLibraryItemVersion(row)] as const))

  return {
    item,
    draftVersion: versionMap.get(normalizeString(row.draft_version_id)) || null,
    publishedVersion: versionMap.get(normalizeString(row.published_version_id)) || null,
  }
}

export async function createCanvasLibraryItem(
  db: Queryable,
  input: {
    actorUserId: string
    slug?: string
    title: string
    summary?: string
    kind: CanvasLibraryItemKind
    templateTarget?: CanvasLibraryTemplateTarget
    assetKind?: CanvasLibraryAssetKind
    tags?: string[]
    cover?: Record<string, unknown> | null
    source?: CanvasLibraryItemSource
    payloadType: CanvasLibraryItemPayloadType
    payload: CanvasLibraryItemPayload
    previewPayload?: unknown
    notes?: string
    publishNow?: boolean
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    }> {
  const itemId = randomUUID()
  const now = new Date().toISOString()
  const slug = await resolveUniqueCanvasLibrarySlug(
    db,
    normalizeString(input.slug) || normalizeString(input.title) || `canvas-library-${itemId.slice(0, 8)}`,
  )

  await db.query(
    `INSERT INTO canvas_library_items (
      id,
      slug,
      title,
      summary,
      kind,
      template_target,
      asset_kind,
      status,
      tags,
      cover,
      source,
      draft_version_id,
      published_version_id,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'draft', $8::TEXT[], $9::JSONB, $10, NULL, NULL, $11, $11, $12, $12
    )`,
    [
      itemId,
      slug,
      normalizeString(input.title) || '未命名资源',
      normalizeString(input.summary),
      input.kind,
      input.templateTarget || null,
      input.assetKind || null,
      normalizeTags(input.tags),
      JSON.stringify(input.cover || {}),
      input.source || 'admin_upload',
      input.actorUserId,
      now,
    ],
  )

  const draftVersion = await createCanvasLibraryVersion(db, {
    itemId,
    actorUserId: input.actorUserId,
    payloadType: input.payloadType,
    payload: input.payload,
    previewPayload: input.previewPayload,
    notes: input.notes,
  })

  await db.query(
    `UPDATE canvas_library_items
     SET draft_version_id = $2,
         updated_by_user_id = $3,
         updated_at = $4
     WHERE id = $1`,
    [itemId, draftVersion.id, input.actorUserId, now],
  )

  if (input.publishNow)
    await publishCanvasLibraryItem(db, { itemId, actorUserId: input.actorUserId })

  const detail = await getCanvasLibraryItemDetail(db, { itemId })
  if (!detail)
    throw new Error('CANVAS_LIBRARY_ITEM_CREATE_FAILED')
  return detail
}

export async function updateCanvasLibraryItem(
  db: Queryable,
  input: {
    itemId: string
    actorUserId: string
    slug?: string
    title?: string
    summary?: string
    kind?: CanvasLibraryItemKind
    templateTarget?: CanvasLibraryTemplateTarget | null
    assetKind?: CanvasLibraryAssetKind | null
    tags?: string[]
    cover?: Record<string, unknown> | null
    payloadType?: CanvasLibraryItemPayloadType
    payload?: CanvasLibraryItemPayload
    previewPayload?: unknown
    notes?: string
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    }> {
  const current = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!current)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')

  const nextSlug = input.slug !== undefined
    ? await resolveUniqueCanvasLibrarySlug(db, normalizeString(input.slug) || current.item.slug, input.itemId)
    : current.item.slug
  const nextTitle = input.title !== undefined ? normalizeString(input.title) || current.item.title : current.item.title
  const nextSummary = input.summary !== undefined ? normalizeString(input.summary) : current.item.summary
  const nextKind = input.kind || current.item.kind
  const nextTemplateTarget = input.templateTarget === undefined
    ? current.item.templateTarget || null
    : input.templateTarget
  const nextAssetKind = input.assetKind === undefined
    ? current.item.assetKind || null
    : input.assetKind
  const nextTags = input.tags ? normalizeTags(input.tags) : current.item.tags
  const nextCover = input.cover !== undefined ? input.cover : current.item.cover
  const now = new Date().toISOString()

  let nextDraftVersionId = current.item.draftVersionId || null
  if (input.payloadType && input.payload !== undefined) {
    const draftVersion = await createCanvasLibraryVersion(db, {
      itemId: input.itemId,
      actorUserId: input.actorUserId,
      payloadType: input.payloadType,
      payload: input.payload,
      previewPayload: input.previewPayload,
      notes: input.notes,
    })
    nextDraftVersionId = draftVersion.id
  }

  await db.query(
    `UPDATE canvas_library_items
     SET slug = $2,
         title = $3,
         summary = $4,
         kind = $5,
         template_target = $6,
         asset_kind = $7,
         tags = $8::TEXT[],
         cover = $9::JSONB,
         draft_version_id = $10,
         updated_by_user_id = $11,
         updated_at = $12
     WHERE id = $1`,
    [
      input.itemId,
      nextSlug,
      nextTitle,
      nextSummary,
      nextKind,
      nextTemplateTarget,
      nextAssetKind,
      nextTags,
      JSON.stringify(nextCover || {}),
      nextDraftVersionId,
      input.actorUserId,
      now,
    ],
  )

  const detail = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!detail)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')
  return detail
}

export async function publishCanvasLibraryItem(
  db: Queryable,
  input: {
    itemId: string
    actorUserId: string
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    }> {
  const current = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!current)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')
  const targetVersionId = current.item.draftVersionId || current.item.publishedVersionId
  if (!targetVersionId)
    throw new Error('CANVAS_LIBRARY_VERSION_NOT_FOUND')

  await db.query(
    `UPDATE canvas_library_items
     SET status = 'published',
         published_version_id = $2,
         draft_version_id = NULL,
         updated_by_user_id = $3,
         updated_at = $4
     WHERE id = $1`,
    [input.itemId, targetVersionId, input.actorUserId, new Date().toISOString()],
  )

  const detail = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!detail)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')
  return detail
}

export async function archiveCanvasLibraryItem(
  db: Queryable,
  input: {
    itemId: string
    actorUserId: string
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    }> {
  const current = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!current)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')

  await db.query(
    `UPDATE canvas_library_items
     SET status = 'archived',
         updated_by_user_id = $2,
         updated_at = $3
     WHERE id = $1`,
    [input.itemId, input.actorUserId, new Date().toISOString()],
  )

  const detail = await getCanvasLibraryItemDetail(db, { itemId: input.itemId })
  if (!detail)
    throw new Error('CANVAS_LIBRARY_ITEM_NOT_FOUND')
  return detail
}

export async function publishCanvasLibraryItemFromDesign(
  db: Queryable,
  input: {
    projectId: string
    designResourceId: string
    actorUserId: string
    scope: CanvasLibraryTemplateTarget
    pageId?: string
    frameId?: string
    slug?: string
    title?: string
    summary?: string
    tags?: string[]
    publishNow?: boolean
  },
): Promise<{
      item: CanvasLibraryItem
      draftVersion: CanvasLibraryItemVersion | null
      publishedVersion: CanvasLibraryItemVersion | null
    }> {
  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: input.designResourceId,
  })
  if (!resource || resource.resourceKind !== 'draw' || resource.collabPurpose !== 'design')
    throw new Error('DESIGN_RESOURCE_NOT_FOUND')

  const snapshot = await getProjectCollabSnapshot(db, {
    projectId: input.projectId,
    resourceId: input.designResourceId,
  })
  if (!snapshot)
    throw new Error('DESIGN_RESOURCE_SNAPSHOT_NOT_FOUND')

  const sceneDocument = readSceneDocumentFromCollabUpdate(snapshot.update)
  const titleFallback = normalizeString(input.title)
    || (input.scope === 'frame'
      ? normalizeString(extractCanvasLibraryFrameTemplate(sceneDocument, normalizeString(input.frameId))?.frame.name)
      : input.scope === 'page'
        ? normalizeString(extractCanvasLibraryPageTemplate(sceneDocument, normalizeString(input.pageId))?.page.name)
        : normalizeString(resource.title))
    || '未命名模板'

  if (input.scope === 'scene') {
    const payload = extractCanvasLibrarySceneTemplate(sceneDocument)
    return createCanvasLibraryItem(db, {
      actorUserId: input.actorUserId,
      slug: input.slug,
      title: titleFallback,
      summary: input.summary,
      kind: 'template',
      templateTarget: 'scene',
      tags: input.tags,
      source: 'design_publish',
      payloadType: 'scene_document',
      payload,
      previewPayload: payload,
      publishNow: input.publishNow,
    })
  }

  if (input.scope === 'page') {
    const payload = extractCanvasLibraryPageTemplate(sceneDocument, normalizeString(input.pageId))
    if (!payload)
      throw new Error('DESIGN_TEMPLATE_SCOPE_NOT_FOUND')
    return createCanvasLibraryItem(db, {
      actorUserId: input.actorUserId,
      slug: input.slug,
      title: titleFallback,
      summary: input.summary,
      kind: 'template',
      templateTarget: 'page',
      tags: input.tags,
      source: 'design_publish',
      payloadType: 'design_fragment',
      payload,
      previewPayload: payload,
      publishNow: input.publishNow,
    })
  }

  const payload = extractCanvasLibraryFrameTemplate(sceneDocument, normalizeString(input.frameId))
  if (!payload)
    throw new Error('DESIGN_TEMPLATE_SCOPE_NOT_FOUND')
  return createCanvasLibraryItem(db, {
    actorUserId: input.actorUserId,
    slug: input.slug,
    title: titleFallback,
    summary: input.summary,
    kind: 'template',
    templateTarget: 'frame',
    tags: input.tags,
    source: 'design_publish',
    payloadType: 'design_fragment',
    payload,
    previewPayload: payload,
    publishNow: input.publishNow,
  })
}

export async function createProjectDesignResourceFromCanvasLibrarySceneTemplate(
  db: Queryable,
  input: {
    projectId: string
    itemId: string
    actorUserId: string
  },
): Promise<Resource> {
  const detail = await getCanvasLibraryItemDetail(db, {
    itemId: input.itemId,
    publishedOnly: true,
  })
  if (!detail || detail.item.kind !== 'template' || detail.item.templateTarget !== 'scene' || !detail.publishedVersion)
    throw new Error('CANVAS_LIBRARY_TEMPLATE_NOT_FOUND')
  if (detail.publishedVersion.payloadType !== 'scene_document')
    throw new Error('CANVAS_LIBRARY_TEMPLATE_INVALID')

  const origin: CanvasLibraryOriginMetadata = {
    itemId: detail.item.id,
    versionId: detail.publishedVersion.id,
    importedAt: new Date().toISOString(),
    importedBy: input.actorUserId,
    source: 'canvas_library',
  }
  const sceneDocument = applyCanvasLibraryOriginToSceneDocument(detail.publishedVersion.payload, origin)
  const created = await createProjectCollabResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    kind: 'draw',
    purpose: 'design',
    title: detail.item.title,
    summary: detail.item.summary,
    metadata: {
      drawMode: 'composition',
      sceneSourceType: 'image_mockup',
      templateKey: normalizeString(sceneDocument.templateKey) || 'device-showcase',
      editorEngine: 'vueflow',
      libraryOrigin: origin,
    },
  })

  await applyProjectCollabUpdate(db, {
    projectId: input.projectId,
    resourceId: created.resource.id,
    actorUserId: input.actorUserId,
    update: buildDrawSceneDocumentUpdate(sceneDocument),
  })

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: created.resource.id,
  })
  if (!resource)
    throw new Error('PROJECT_RESOURCE_NOT_FOUND')
  return resource
}

export function buildCanvasLibraryAssetPayload(input: {
  objectKey: string
  fileName: string
  mimeType: string
  size: number
  assetKind: CanvasLibraryAssetKind
  metadata?: Record<string, unknown>
  width?: number
  height?: number
  viewportRect?: Record<string, unknown>
  cornerRadius?: number
  presetKeys?: string[]
  maskPath?: string
}): CanvasLibraryBinaryAssetPayload {
  const payload: CanvasLibraryBinaryAssetPayload = {
    mimeType: normalizeString(input.mimeType) || 'application/octet-stream',
    objectKey: normalizeString(input.objectKey),
    fileName: normalizeString(input.fileName) || 'asset.bin',
    size: Math.max(0, toInteger(input.size, 0)),
    width: Math.max(0, toInteger(input.width, 0)) || undefined,
    height: Math.max(0, toInteger(input.height, 0)) || undefined,
    metadata: normalizeRecord(input.metadata),
  }

  if (input.assetKind !== 'device_shell')
    return payload

  return {
    ...payload,
    viewportRect: normalizeRecord(input.viewportRect),
    cornerRadius: Math.max(0, toInteger(input.cornerRadius, 0)),
    presetKeys: normalizeTags(input.presetKeys),
    maskPath: normalizeString(input.maskPath) || undefined,
  }
}
