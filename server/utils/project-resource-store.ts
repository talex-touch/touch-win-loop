import type { Queryable } from '~~/server/utils/db'
import type {
  CollabPurpose,
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceKind,
  ResourceStatus,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { buildServerApiEndpoint, resolveServerApiUrl } from '~~/server/utils/api-url'
import { markProjectKnowledgeSourceStale, scheduleProjectKnowledgeSourceUpsert } from '~~/server/utils/project-knowledge-store'
import { buildProjectResourceSignedUrls } from '~~/server/utils/project-resource-access-url'
import {
  collectImageReferencesFromMarkdown,
  ensureMarkdownCollabDocShape,
  extractPrimaryHeadingFromCollabDoc,
  parseMarkdownToRichTextDocument,
  syncMarkdownMirrorFromRichText,
  writeRichTextDocumentToFragment,
} from '~~/shared/utils/collab-markdown-rich-text'
import { COLLAB_NOTES_RESOURCE_LABEL, resolveCollabResourceDisplayLabel } from '~~/shared/utils/collab-resource'
import { normalizeDrawMode, normalizeSceneSourceType } from '~~/shared/utils/scene-document'

interface ProjectResourceRow {
  id: string
  project_id: string
  parent_resource_id?: string | null
  sort_order?: number | string | null
  source: 'upload' | 'library' | 'collab' | 'external'
  resource_kind?: ResourceKind | string | null
  linked_contest_resource_id: string | null
  title: string
  mime_type: string
  category: ResourceCategory
  year: number
  source_link: string
  availability: ResourceAvailability
  summary: string
  content: string
  metadata: Record<string, unknown>
  status: ResourceStatus
  created_by_user_id: string | null
  updated_by_user_id: string | null
  uploader_username?: string | null
  uploader_avatar_url?: string | null
  created_at: string
  updated_at: string
  document_id?: string | null
  preview_status?: string | null
  preview_progress_percent?: number | null
  preview_eta_seconds?: number | null
  preview_error?: string | null
  collab_revision?: number | string | null
}

interface ProjectCollabDocRow {
  resource_id: string
  project_id: string
  kind: ResourceKind | string
  ydoc_update: Buffer | Uint8Array | string | null
  revision: number | string
  updated_by_user_id?: string | null
  updated_at: string
  workspace_id?: string
  source?: string
  status?: string
  resource_kind?: ResourceKind | string | null
}

interface ContestResourceRow {
  id: string
  contest_id: string
  category: ResourceCategory
  title: string
  year: number
  url: string
  access_level: ResourceAvailability
  source_type: string
  summary: string
  content: string
  metadata: Record<string, unknown>
  copyright_note: string
  status: ResourceStatus
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
  is_favorite?: boolean | null
}

interface ProjectResourceDownloadRow {
  id: string
  source: ProjectResourceRow['source']
  title: string
  mime_type: string
  source_link: string
  linked_contest_resource_id: string | null
}

interface ProjectUploadStorageUsageRow {
  used_bytes: string
}

interface ProjectResourceDocumentIdRow {
  id: string
}

interface ProjectExistsRow {
  id: string
}

interface ProjectWorkspaceRow {
  id: string
  workspace_id: string
}

interface ObjectKeyRow {
  object_key: string
}

interface ProjectResourceTreeStateRow {
  id: string
  parent_resource_id: string | null
  sort_order: number | string | null
  status: ResourceStatus
  created_at: string
}

export interface ProjectUploadedFileRef {
  objectKey: string
  fileName: string
  mimeType: string
}

export interface ProjectResourceTreePatchItem {
  resourceId: string
  parentResourceId: string | null
  sortOrder: number
}

export interface PurgedProjectResourceRef {
  resourceId: string
  source: 'upload' | 'library' | 'collab' | 'external'
  objectKey: string
}

export interface ProjectCollabSnapshot {
  projectId: string
  resourceId: string
  workspaceId: string
  kind: Extract<ResourceKind, 'markdown' | 'draw'>
  revision: number
  update: Uint8Array
  updatedAt: string
}

export const PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS = 30
export const PROJECT_MEETING_MEMORY_RESOURCE_TITLE = '会议纪要总览'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function parseResourceMetadata(value: unknown): Record<string, unknown> {
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

function parseCollabKind(value: unknown): Extract<ResourceKind, 'markdown' | 'draw'> | null {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'markdown' || normalized === 'draw')
    return normalized
  return null
}

function normalizeSceneEditorEngine(value: unknown, fallback: 'vueflow' | 'tldraw_legacy'): 'vueflow' | 'tldraw_legacy' {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'vueflow' || normalized === 'tldraw_legacy')
    return normalized
  return fallback
}

function parseCollabPurpose(value: unknown): CollabPurpose | null {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'workflow' || normalized === 'freeform' || normalized === 'design' || normalized === 'notes')
    return normalized
  return null
}

function resolveDefaultCollabPurpose(kind: Extract<ResourceKind, 'markdown' | 'draw'>): CollabPurpose {
  return kind === 'markdown' ? 'notes' : 'freeform'
}

function normalizeCollabPurpose(
  kind: Extract<ResourceKind, 'markdown' | 'draw'>,
  value?: unknown,
): CollabPurpose | null {
  const parsed = parseCollabPurpose(value)
  if (!parsed)
    return resolveDefaultCollabPurpose(kind)
  if (kind === 'markdown')
    return parsed === 'notes' ? parsed : null
  return parsed === 'workflow' || parsed === 'freeform' || parsed === 'design' ? parsed : null
}

function hasLegacyDesignCanvasMetadata(metadata: Record<string, unknown>): boolean {
  return normalizeString(metadata.fixedTab).toLowerCase() === 'design'
    || normalizeString(metadata.drawMode).toLowerCase() === 'composition'
}

function resolveStoredCollabPurpose(
  kind: Extract<ResourceKind, 'markdown' | 'draw'>,
  metadata: Record<string, unknown>,
): CollabPurpose {
  const parsed = parseCollabPurpose(metadata.collabPurpose)
  if (parsed)
    return parsed
  if (kind === 'draw' && hasLegacyDesignCanvasMetadata(metadata))
    return 'design'
  return resolveDefaultCollabPurpose(kind)
}

function parseResourceKind(value: unknown): ResourceKind | null {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'binary' || normalized === 'markdown' || normalized === 'draw')
    return normalized
  return null
}

function parseRevision(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.trunc(parsed))
}

function normalizeParentResourceId(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized || null
}

function parseSortOrder(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.trunc(parsed))
}

function compareProjectResourceTreeRows(
  left: Pick<ProjectResourceTreeStateRow, 'sort_order' | 'created_at' | 'id'>,
  right: Pick<ProjectResourceTreeStateRow, 'sort_order' | 'created_at' | 'id'>,
): number {
  const leftSort = parseSortOrder(left.sort_order)
  const rightSort = parseSortOrder(right.sort_order)
  if (leftSort !== rightSort)
    return leftSort - rightSort

  const leftCreatedAt = new Date(normalizeString(left.created_at) || 0).getTime()
  const rightCreatedAt = new Date(normalizeString(right.created_at) || 0).getTime()
  if (leftCreatedAt !== rightCreatedAt)
    return leftCreatedAt - rightCreatedAt

  return normalizeString(left.id).localeCompare(normalizeString(right.id))
}

async function listProjectResourceTreeStateRows(
  db: Queryable,
  input: {
    projectId: string
    statuses?: ResourceStatus[]
    forUpdate?: boolean
  },
): Promise<ProjectResourceTreeStateRow[]> {
  const normalizedStatuses = Array.isArray(input.statuses)
    ? input.statuses.filter(Boolean)
    : []
  const values: unknown[] = [input.projectId]
  const filters = ['project_id = $1']

  if (normalizedStatuses.length > 0) {
    values.push(normalizedStatuses)
    filters.push(`status = ANY($${values.length}::TEXT[])`)
  }

  const result = await db.query<ProjectResourceTreeStateRow>(
    `SELECT
      id,
      parent_resource_id,
      sort_order,
      status,
      created_at::TEXT
     FROM project_resources
     WHERE ${filters.join('\n       AND ')}
     ORDER BY created_at ASC, id ASC
     ${input.forUpdate ? 'FOR UPDATE' : ''}`,
    values,
  )

  return result.rows
}

async function assertProjectResourceParentAvailable(
  db: Queryable,
  input: {
    projectId: string
    parentResourceId?: string | null
  },
): Promise<string | null> {
  const parentResourceId = normalizeParentResourceId(input.parentResourceId)
  if (!parentResourceId)
    return null

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     LIMIT 1`,
    [input.projectId, parentResourceId],
  )

  if (!result.rows[0]?.id)
    throw new Error('RESOURCE_PARENT_NOT_FOUND')

  return parentResourceId
}

async function resolveNextProjectResourceSortOrder(
  db: Queryable,
  input: {
    projectId: string
    parentResourceId?: string | null
    status?: ResourceStatus
  },
): Promise<number> {
  const result = await db.query<{ next_sort_order: number | string | null }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
     FROM project_resources
     WHERE project_id = $1
       AND status = $2
       AND parent_resource_id IS NOT DISTINCT FROM $3`,
    [
      input.projectId,
      input.status || 'active',
      normalizeParentResourceId(input.parentResourceId),
    ],
  )

  return parseSortOrder(result.rows[0]?.next_sort_order)
}

function collectProjectResourceSubtreeIds(
  rows: Array<Pick<ProjectResourceTreeStateRow, 'id' | 'parent_resource_id' | 'status'>>,
  rootId: string,
  status?: ResourceStatus,
): string[] {
  const normalizedRootId = normalizeString(rootId)
  if (!normalizedRootId)
    return []

  const childrenByParent = new Map<string, string[]>()
  for (const row of rows) {
    if (status && row.status !== status)
      continue
    const parentId = normalizeParentResourceId(row.parent_resource_id)
    if (!parentId)
      continue
    const existing = childrenByParent.get(parentId)
    if (existing)
      existing.push(row.id)
    else
      childrenByParent.set(parentId, [row.id])
  }

  const visited = new Set<string>()
  const queue = [normalizedRootId]
  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId || visited.has(currentId))
      continue
    visited.add(currentId)
    for (const childId of childrenByParent.get(currentId) || [])
      queue.push(childId)
  }

  return [...visited]
}

function buildNormalizedProjectResourceTreeAssignments(
  rows: ProjectResourceTreeStateRow[],
  overrides?: Map<string, { parentResourceId: string | null, sortOrder: number }>,
): Array<{ id: string, parentResourceId: string | null, sortOrder: number }> {
  const nextParentById = new Map<string, string | null>()
  const nextSortById = new Map<string, number>()

  for (const row of rows) {
    const override = overrides?.get(row.id)
    nextParentById.set(row.id, override ? normalizeParentResourceId(override.parentResourceId) : normalizeParentResourceId(row.parent_resource_id))
    nextSortById.set(row.id, override ? parseSortOrder(override.sortOrder) : parseSortOrder(row.sort_order))
  }

  for (const row of rows) {
    const startId = row.id
    let cursor = nextParentById.get(startId) || null
    const visited = new Set<string>([startId])

    while (cursor) {
      if (visited.has(cursor))
        throw new Error('RESOURCE_TREE_CYCLE')
      visited.add(cursor)
      cursor = nextParentById.get(cursor) || null
    }
  }

  const groups = new Map<string, ProjectResourceTreeStateRow[]>()
  for (const row of rows) {
    const parentId = nextParentById.get(row.id) || null
    const groupKey = parentId || '__root__'
    const clonedRow: ProjectResourceTreeStateRow = {
      ...row,
      parent_resource_id: parentId,
      sort_order: nextSortById.get(row.id) || 0,
    }
    const existing = groups.get(groupKey)
    if (existing)
      existing.push(clonedRow)
    else
      groups.set(groupKey, [clonedRow])
  }

  const assignments: Array<{ id: string, parentResourceId: string | null, sortOrder: number }> = []
  for (const groupRows of groups.values()) {
    groupRows
      .sort(compareProjectResourceTreeRows)
      .forEach((row, index) => {
        assignments.push({
          id: row.id,
          parentResourceId: normalizeParentResourceId(row.parent_resource_id),
          sortOrder: index,
        })
      })
  }

  return assignments
}

async function persistProjectResourceTreeAssignments(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    assignments: Array<{ id: string, parentResourceId: string | null, sortOrder: number }>
  },
): Promise<void> {
  if (input.assignments.length === 0)
    return

  await db.query(
    `WITH payload AS (
      SELECT
        id,
        parent_resource_id,
        sort_order
      FROM jsonb_to_recordset($3::JSONB) AS item(
        id TEXT,
        parent_resource_id TEXT,
        sort_order INTEGER
      )
    )
    UPDATE project_resources AS pr
    SET parent_resource_id = payload.parent_resource_id,
        sort_order = payload.sort_order,
        updated_by_user_id = $2,
        updated_at = NOW()
    FROM payload
    WHERE pr.project_id = $1
      AND pr.id = payload.id
      AND pr.status = 'active'
      AND (
        pr.parent_resource_id IS DISTINCT FROM payload.parent_resource_id
        OR pr.sort_order IS DISTINCT FROM payload.sort_order
      )`,
    [
      input.projectId,
      input.actorUserId,
      JSON.stringify(input.assignments.map(item => ({
        id: item.id,
        parent_resource_id: item.parentResourceId,
        sort_order: parseSortOrder(item.sortOrder),
      }))),
    ],
  )
}

async function normalizeProjectResourceTreeAssignments(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
  },
): Promise<void> {
  const rows = await listProjectResourceTreeStateRows(db, {
    projectId: input.projectId,
    statuses: ['active'],
    forUpdate: true,
  })
  const assignments = buildNormalizedProjectResourceTreeAssignments(rows)
  await persistProjectResourceTreeAssignments(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    assignments,
  })
}

async function syncMarkdownResourceProjection(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    updatedAt: string
    doc: Y.Doc
  },
): Promise<{ markdown: string, derivedTitle: string }> {
  const mirrorResult = syncMarkdownMirrorFromRichText(input.doc)
  const derivedTitle = normalizeString(extractPrimaryHeadingFromCollabDoc(input.doc))
  const values: unknown[] = [
    input.projectId,
    input.resourceId,
    mirrorResult.markdown,
    input.actorUserId,
    input.updatedAt,
  ]
  const sets = [
    'content = $3',
    'updated_by_user_id = $4',
    'updated_at = $5',
  ]

  if (derivedTitle) {
    values.push(derivedTitle)
    sets.unshift(`title = $${values.length}`)
  }

  await db.query(
    `UPDATE project_resources
     SET ${sets.join(', ')}
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'`,
    values,
  )

  await markProjectKnowledgeSourceStale(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    autoEnqueue: true,
  })

  return {
    markdown: mirrorResult.markdown,
    derivedTitle,
  }
}

function toUint8Array(value: unknown): Uint8Array {
  if (!value)
    return new Uint8Array()

  if (value instanceof Uint8Array)
    return value

  if (Buffer.isBuffer(value))
    return new Uint8Array(value)

  if (typeof value === 'string') {
    try {
      const decoded = Buffer.from(value, 'base64')
      return new Uint8Array(decoded)
    }
    catch {
      return new Uint8Array()
    }
  }

  return new Uint8Array()
}

function ensureCollabDocShape(kind: Extract<ResourceKind, 'markdown' | 'draw'>, doc: Y.Doc): void {
  if (kind === 'markdown') {
    ensureMarkdownCollabDocShape(doc)
    return
  }

  const drawMap = doc.getMap('draw')
  const existingNodes = drawMap.get('nodes')
  if (existingNodes instanceof Y.Array)
    return
  const nodes = new Y.Array<unknown>()
  drawMap.set('nodes', nodes)
}

const GENERIC_EMBEDDED_IMAGE_TITLE_KEYS = new Set([
  'image',
  'img',
  'screenshot',
  'screen-shot',
  'clipboard',
  'paste',
  'snipaste',
  'mmexport',
  'wechat-image',
])

const IMAGE_UPLOAD_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'webp',
  'svg',
  'avif',
  'heic',
  'heif',
])

function normalizeUploadTitleBase(fileName: string): string {
  return normalizeString(fileName)
    .replace(/\.[^/.]+$/, '')
    .replace(/[（(]\d+[)）]\s*$/g, '')
    .replace(/[-_ ]?副本(?:\s*\d+)?$/g, '')
    .trim()
}

function normalizeUploadTitle(fileName: string, inputTitle?: string): string {
  const trimmedInput = normalizeString(inputTitle)
  if (trimmedInput)
    return trimmedInput

  const base = normalizeUploadTitleBase(fileName)
  if (base)
    return base

  return '上传资料'
}

function normalizeEmbeddedImageTitleKey(value: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[-_ ]*\d+$/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isImageUploadInput(fileName: string, mimeType?: string): boolean {
  const normalizedMimeType = normalizeString(mimeType).toLowerCase()
  if (normalizedMimeType.startsWith('image/'))
    return true

  const extension = normalizeString(fileName)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1] || ''
  return IMAGE_UPLOAD_EXTENSIONS.has(extension)
}

export function isGenericEmbeddedImageTitleCandidate(value: string): boolean {
  const normalized = normalizeEmbeddedImageTitleKey(value)
  if (!normalized)
    return true
  return GENERIC_EMBEDDED_IMAGE_TITLE_KEYS.has(normalized)
}

export function resolveEmbeddedMarkdownImageUploadTitle(input: {
  fileName: string
  inputTitle?: string
  hostResourceTitle?: string
  existingTitles?: string[]
}): string {
  const explicitTitle = normalizeString(input.inputTitle)
  if (explicitTitle)
    return explicitTitle

  const baseTitle = normalizeUploadTitleBase(input.fileName)
  const existingTitles = Array.isArray(input.existingTitles)
    ? input.existingTitles.map(title => normalizeString(title)).filter(Boolean)
    : []

  if (!baseTitle || isGenericEmbeddedImageTitleCandidate(baseTitle)) {
    const hostResourceTitle = normalizeString(input.hostResourceTitle) || COLLAB_NOTES_RESOURCE_LABEL
    const prefix = `${hostResourceTitle} - 图片`
    const pattern = new RegExp(`^${escapeRegExp(prefix)}\\s+(\\d{3})$`)
    let maxIndex = 0

    for (const title of existingTitles) {
      const matched = title.match(pattern)
      if (!matched)
        continue
      const currentIndex = Number(matched[1] || 0)
      if (Number.isFinite(currentIndex))
        maxIndex = Math.max(maxIndex, Math.max(0, Math.trunc(currentIndex)))
    }

    return `${prefix} ${String(maxIndex + 1).padStart(3, '0')}`
  }

  const pattern = new RegExp(`^${escapeRegExp(baseTitle)}(?:\\s+(\\d+))?$`)
  let maxIndex = 0

  for (const title of existingTitles) {
    const matched = title.match(pattern)
    if (!matched)
      continue
    const currentIndex = Number(matched[1] || 1)
    if (Number.isFinite(currentIndex))
      maxIndex = Math.max(maxIndex, Math.max(1, Math.trunc(currentIndex)))
  }

  return maxIndex > 0 ? `${baseTitle} ${maxIndex + 1}` : baseTitle
}

async function resolveProjectUploadTitle(
  db: Queryable,
  input: {
    projectId: string
    fileName: string
    mimeType?: string
    title?: string
    hostMarkdownResourceId?: string
  },
): Promise<string> {
  const explicitTitle = normalizeString(input.title)
  if (explicitTitle)
    return explicitTitle

  const hostMarkdownResourceId = normalizeString(input.hostMarkdownResourceId)
  if (!hostMarkdownResourceId || !isImageUploadInput(input.fileName, input.mimeType))
    return normalizeUploadTitle(input.fileName, input.title)

  const hostResourceResult = await db.query<{ title: string, resource_kind: string }>(
    `SELECT title, resource_kind
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, hostMarkdownResourceId],
  )
  const hostResource = hostResourceResult.rows[0]
  if (!hostResource || parseResourceKind(hostResource.resource_kind) !== 'markdown')
    return normalizeUploadTitle(input.fileName, input.title)

  const siblingResult = await db.query<{ title: string }>(
    `SELECT title
     FROM project_resources
     WHERE project_id = $1
       AND source = 'upload'
       AND COALESCE(metadata->'embeddedIn'->>'kind', '') = 'markdown'
       AND COALESCE(metadata->'embeddedIn'->>'resourceId', '') = $2`,
    [input.projectId, hostMarkdownResourceId],
  )

  return resolveEmbeddedMarkdownImageUploadTitle({
    fileName: input.fileName,
    inputTitle: input.title,
    hostResourceTitle: hostResource.title,
    existingTitles: siblingResult.rows.map(row => row.title),
  })
}

function normalizeDuplicateTitle(title: string): string {
  const normalized = normalizeString(title)
  if (!normalized)
    return '未命名文档（副本）'
  if (/（副本(?:\s*\d+)?）$/.test(normalized)) {
    return normalized.replace(/（副本(?:\s*(\d+))?）$/, (_, countText: string | undefined) => {
      const next = Math.max(2, Number(countText || 1) + 1)
      return `（副本 ${next}）`
    })
  }
  return `${normalized}（副本）`
}

function resolveCollabResourceTitlePrefix(
  kind: Extract<ResourceKind, 'markdown' | 'draw'>,
  purpose: CollabPurpose,
): string {
  return resolveCollabResourceDisplayLabel(purpose, kind)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function resolveCollabResourceTitle(
  db: Queryable,
  projectId: string,
  kind: Extract<ResourceKind, 'markdown' | 'draw'>,
  purpose: CollabPurpose,
  inputTitle?: string,
): Promise<string> {
  const normalized = normalizeString(inputTitle)
  if (normalized)
    return normalized

  const prefix = resolveCollabResourceTitlePrefix(kind, purpose)

  const result = await db.query<{ title: string }>(
    `SELECT title
     FROM project_resources
     WHERE project_id = $1
       AND source = 'collab'
       AND resource_kind = $2`,
    [projectId, kind],
  )

  const pattern = new RegExp(`^${escapeRegExp(prefix)}(?:\\s+(\\d+))?$`)
  let maxIndex = 0

  for (const row of result.rows) {
    const title = normalizeString(row.title)
    const matched = title.match(pattern)
    if (!matched)
      continue

    const currentIndex = Number(matched[1] || 1)
    if (Number.isFinite(currentIndex))
      maxIndex = Math.max(maxIndex, Math.max(1, Math.trunc(currentIndex)))
  }

  return `${prefix} ${maxIndex + 1}`
}

function toResource(row: ProjectResourceRow): Resource {
  const metadata = parseResourceMetadata(row.metadata)
  const originContestId = normalizeString(metadata.originContestId)
  const sourceType = normalizeString(row.source).toLowerCase() as ProjectResourceRow['source']
  const persistedKind = parseResourceKind(row.resource_kind)
  const metadataKind = parseResourceKind(metadata.resourceKind)
  const collabKind = parseCollabKind(row.resource_kind) || parseCollabKind(metadata.resourceKind) || 'markdown'
  const collabPurpose = sourceType === 'collab'
    ? resolveStoredCollabPurpose(collabKind, metadata)
    : undefined
  const resourceKind: ResourceKind = persistedKind
    || metadataKind
    || (sourceType === 'collab' ? collabKind : 'binary')
  const collabRevision = parseRevision(row.collab_revision)
  const documentId = normalizeString(row.document_id)
  const signedUrls = sourceType === 'upload'
    ? buildProjectResourceSignedUrls({
        projectId: row.project_id,
        resourceId: row.id,
      })
    : null
  const resolvedMimeType = normalizeString(row.mime_type) || normalizeString(metadata.mimeType) || 'application/octet-stream'
  const resolvedFileName = normalizeString(metadata.fileName) || normalizeString(row.title)
  const collabSourceLink = sourceType === 'collab'
    ? buildServerApiEndpoint(`/projects/${row.project_id}/resources/${row.id}/collab`)
    : ''
  const sourceDownloadUrl = sourceType === 'upload'
    ? signedUrls?.sourceDownloadUrl
    : undefined
  const previewStatus = normalizeString(row.preview_status) as Resource['previewStatus']
  const isDirectPreviewImage = sourceType === 'upload'
    && Boolean(documentId)
    && isImageUploadInput(resolvedFileName, resolvedMimeType)
  const normalizedPreviewStatus = isDirectPreviewImage
    ? 'succeeded'
    : previewStatus
  const previewUrl = sourceType === 'upload' && documentId
    ? signedUrls?.previewUrl
    : undefined
  const drawMode = resourceKind === 'draw'
    ? normalizeDrawMode(
        metadata.drawMode,
        collabPurpose === 'workflow'
          ? 'diagram'
          : collabPurpose === 'design'
            ? 'composition'
            : 'freeform',
      )
    : undefined
  const sceneSourceType = resourceKind === 'draw'
    ? normalizeSceneSourceType(metadata.sceneSourceType, 'manual')
    : undefined
  const templateKey = normalizeString(metadata.templateKey) || undefined
  const editorEngine = resourceKind === 'draw'
    ? normalizeSceneEditorEngine(
        metadata.editorEngine,
        drawMode === 'freeform' ? 'tldraw_legacy' : 'vueflow',
      )
    : undefined

  return {
    id: row.id,
    projectId: row.project_id,
    parentResourceId: normalizeParentResourceId(row.parent_resource_id),
    sortOrder: parseSortOrder(row.sort_order),
    resourceKind,
    collabPurpose,
    drawMode,
    sceneSourceType,
    templateKey,
    editorEngine,
    documentId: documentId || undefined,
    contestId: originContestId,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: sourceType === 'upload'
      ? (sourceDownloadUrl || resolveServerApiUrl(row.source_link))
      : sourceType === 'collab'
        ? collabSourceLink
        : resolveServerApiUrl(row.source_link),
    sourceDownloadUrl,
    sourceDownloadUrlExpiresAt: signedUrls?.sourceDownloadUrlExpiresAt,
    previewUrl,
    previewUrlExpiresAt: previewUrl ? signedUrls?.previewUrlExpiresAt : undefined,
    previewStatus: normalizedPreviewStatus || undefined,
    previewProgressPercent: isDirectPreviewImage
      ? 100
      : (Number.isFinite(Number(row.preview_progress_percent)) ? Number(row.preview_progress_percent) : undefined),
    previewEtaSeconds: isDirectPreviewImage
      ? 0
      : (Number.isFinite(Number(row.preview_eta_seconds)) ? Number(row.preview_eta_seconds) : undefined),
    previewError: isDirectPreviewImage ? undefined : (normalizeString(row.preview_error) || undefined),
    availability: row.availability,
    sourceType,
    source: sourceType,
    linkedContestResourceId: row.linked_contest_resource_id,
    summary: row.summary,
    content: row.content,
    metadata,
    category: row.category,
    copyrightNote: '',
    status: row.status,
    createdBy: row.created_by_user_id || undefined,
    updatedBy: row.updated_by_user_id || undefined,
    uploaderUserId: sourceType === 'upload' ? (row.created_by_user_id || undefined) : undefined,
    uploaderUsername: sourceType === 'upload' ? (normalizeString(row.uploader_username) || undefined) : undefined,
    uploaderAvatarUrl: sourceType === 'upload' ? (normalizeString(row.uploader_avatar_url) || null) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: collabRevision > 0 ? collabRevision : undefined,
  }
}

function toLibraryResource(row: ContestResourceRow): Resource {
  const metadata = parseResourceMetadata(row.metadata)

  return {
    id: row.id,
    contestId: row.contest_id,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: resolveServerApiUrl(row.url),
    availability: row.access_level,
    sourceType: row.source_type,
    source: 'library',
    linkedContestResourceId: row.id,
    isFavorite: Boolean(row.is_favorite),
    summary: row.summary,
    content: row.content,
    metadata,
    category: row.category,
    copyrightNote: row.copyright_note,
    status: row.status,
    createdBy: row.created_by_user_id || undefined,
    updatedBy: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ensureProjectExists(db: Queryable, projectId: string): Promise<void> {
  const result = await db.query<ProjectExistsRow>(
    `SELECT id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  if (!result.rows[0]?.id)
    throw new Error('PROJECT_NOT_FOUND')
}

export async function listProjectResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ProjectResourceRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
      pr.linked_contest_resource_id,
      pr.title,
      pr.mime_type,
      pr.category,
      pr.year,
      pr.source_link,
      pr.availability,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.status,
      pr.created_by_user_id,
      pr.updated_by_user_id,
      uploader.username AS uploader_username,
      uploader.avatar_url AS uploader_avatar_url,
      pr.created_at::TEXT,
      pr.updated_at::TEXT,
      prd.id AS document_id,
      prd.preview_status,
      prd.preview_progress_percent,
      prd.preview_eta_seconds,
      prd.preview_error,
      prc.revision AS collab_revision
     FROM project_resources pr
     LEFT JOIN users uploader
       ON uploader.id = pr.created_by_user_id
     LEFT JOIN project_resource_documents prd
       ON prd.project_resource_id = pr.id
     LEFT JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
     WHERE pr.project_id = $1
       AND pr.status = 'active'
     ORDER BY pr.parent_resource_id NULLS FIRST, pr.sort_order ASC, pr.created_at ASC, pr.id ASC`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function listProjectRecycleResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ProjectResourceRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
      pr.linked_contest_resource_id,
      pr.title,
      pr.mime_type,
      pr.category,
      pr.year,
      pr.source_link,
      pr.availability,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.status,
      pr.created_by_user_id,
      pr.updated_by_user_id,
      uploader.username AS uploader_username,
      uploader.avatar_url AS uploader_avatar_url,
      pr.created_at::TEXT,
      pr.updated_at::TEXT,
      prd.id AS document_id,
      prd.preview_status,
      prd.preview_progress_percent,
      prd.preview_eta_seconds,
      prd.preview_error,
      prc.revision AS collab_revision
     FROM project_resources pr
     LEFT JOIN users uploader
       ON uploader.id = pr.created_by_user_id
     LEFT JOIN project_resource_documents prd
       ON prd.project_resource_id = pr.id
     LEFT JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
     LEFT JOIN project_resources parent
       ON parent.id = pr.parent_resource_id
      AND parent.project_id = pr.project_id
     WHERE pr.project_id = $1
       AND pr.status = 'archived'
       AND (parent.id IS NULL OR parent.status <> 'archived')
     ORDER BY pr.updated_at DESC, pr.created_at DESC`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function getProjectResourceById(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<Resource | null> {
  const result = await db.query<ProjectResourceRow>(
    `SELECT
        pr.id,
        pr.project_id,
        pr.parent_resource_id,
        pr.sort_order,
        pr.source,
        pr.resource_kind,
        pr.linked_contest_resource_id,
        pr.title,
        pr.mime_type,
        pr.category,
        pr.year,
        pr.source_link,
        pr.availability,
        pr.summary,
        pr.content,
        pr.metadata,
        pr.status,
        pr.created_by_user_id,
        pr.updated_by_user_id,
        uploader.username AS uploader_username,
        uploader.avatar_url AS uploader_avatar_url,
        pr.created_at::TEXT,
        pr.updated_at::TEXT,
        prd.id AS document_id,
        prd.preview_status,
        prd.preview_progress_percent,
        prd.preview_eta_seconds,
        prd.preview_error,
        prc.revision AS collab_revision
       FROM project_resources pr
       LEFT JOIN users uploader
         ON uploader.id = pr.created_by_user_id
       LEFT JOIN project_resource_documents prd
         ON prd.project_resource_id = pr.id
       LEFT JOIN project_resource_collab_docs prc
         ON prc.resource_id = pr.id
      WHERE pr.project_id = $1
        AND pr.id = $2
      LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  return result.rows[0] ? toResource(result.rows[0]!) : null
}

export async function listProjectLibraryResources(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    query?: string
    limit?: number
  },
): Promise<Resource[]> {
  const normalizedQuery = normalizeString(input.query)
  const normalizedLimit = Number.isFinite(Number(input.limit))
    ? Math.max(1, Math.min(20, Math.trunc(Number(input.limit))))
    : null
  const values: Array<string | number> = [input.projectId, input.actorUserId]
  const filters = [
    `r.status = 'active'`,
    `COALESCE(r.source_type, '') <> 'project_upload'`,
    `NOT EXISTS (
      SELECT 1
      FROM project_resources pr
      WHERE pr.project_id = $1
        AND pr.linked_contest_resource_id = r.id
        AND pr.status = 'active'
    )`,
  ]

  if (normalizedQuery) {
    const queryIndex = values.push(`%${normalizedQuery}%`)
    filters.push(`(
      r.title ILIKE $${queryIndex}
      OR COALESCE(r.summary, '') ILIKE $${queryIndex}
      OR COALESCE(r.content, '') ILIKE $${queryIndex}
      OR COALESCE(r.source_type, '') ILIKE $${queryIndex}
      OR COALESCE(r.category::TEXT, '') ILIKE $${queryIndex}
      OR COALESCE(r.year::TEXT, '') ILIKE $${queryIndex}
    )`)
  }

  const limitSql = normalizedQuery
    ? `LIMIT $${values.push(normalizedLimit || 8)}`
    : 'LIMIT 80'
  const result = await db.query<ContestResourceRow>(
    `SELECT
      r.id,
      r.contest_id,
      r.category,
      r.title,
      r.year,
      r.url,
      r.access_level,
      r.source_type,
      r.summary,
      r.content,
      r.metadata,
      r.copyright_note,
      r.status,
      r.created_by_user_id,
      r.updated_by_user_id,
      r.created_at::TEXT,
      r.updated_at::TEXT,
      EXISTS (
        SELECT 1
        FROM contest_resource_favorites f
        WHERE f.actor_user_id = $2
          AND f.contest_resource_id = r.id
      ) AS is_favorite
     FROM contest_resources r
     WHERE ${filters.join('\n       AND ')}
     ORDER BY r.year DESC, r.created_at DESC
     ${limitSql}`,
    values,
  )

  return result.rows.map(toLibraryResource)
}

export async function createContestResourceFavorite(
  db: Queryable,
  input: {
    resourceId: string
    actorUserId: string
  },
): Promise<{ resource: Resource, alreadyFavorited: boolean }> {
  const resourceResult = await db.query<ContestResourceRow>(
    `SELECT
      r.id,
      r.contest_id,
      r.category,
      r.title,
      r.year,
      r.url,
      r.access_level,
      r.source_type,
      r.summary,
      r.content,
      r.metadata,
      r.copyright_note,
      r.status,
      r.created_by_user_id,
      r.updated_by_user_id,
      r.created_at::TEXT,
      r.updated_at::TEXT,
      TRUE AS is_favorite
     FROM contest_resources r
     WHERE r.id = $1
       AND r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
     LIMIT 1`,
    [input.resourceId],
  )

  const resourceRow = resourceResult.rows[0]
  if (!resourceRow)
    throw new Error('RESOURCE_NOT_FOUND')

  const inserted = await db.query<{ id: string }>(
    `INSERT INTO contest_resource_favorites (
      id,
      contest_resource_id,
      actor_user_id,
      created_at
    ) VALUES (
      $1, $2, $3, NOW()
    )
    ON CONFLICT (actor_user_id, contest_resource_id) DO NOTHING
    RETURNING id`,
    [randomUUID(), input.resourceId, input.actorUserId],
  )

  return {
    resource: toLibraryResource(resourceRow),
    alreadyFavorited: !inserted.rows[0]?.id,
  }
}

export async function getProjectResourceDownloadDescriptor(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<{
  id: string
  source: ProjectResourceRow['source']
  title: string
  mimeType: string
  sourceLink: string
  linkedContestResourceId: string | null
} | null> {
  const result = await db.query<ProjectResourceDownloadRow>(
    `SELECT
      id,
      source,
      title,
      mime_type,
      source_link,
      linked_contest_resource_id
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  return {
    id: row.id,
    source: row.source,
    title: normalizeString(row.title),
    mimeType: normalizeString(row.mime_type),
    sourceLink: normalizeString(row.source_link),
    linkedContestResourceId: row.linked_contest_resource_id,
  }
}

export async function bindLibraryResourceToProject(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    parentResourceId?: string | null
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)
  const parentResourceId = await assertProjectResourceParentAvailable(db, {
    projectId: input.projectId,
    parentResourceId: input.parentResourceId,
  })

  const existing = await db.query<ProjectResourceRow>(
    `SELECT
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_resources
     WHERE project_id = $1
       AND linked_contest_resource_id = $2
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const existingRow = existing.rows[0]
  if (existingRow) {
    if (existingRow.status === 'active')
      return toResource(existingRow)
    return restoreProjectResourceFromRecycleBin(db, {
      projectId: input.projectId,
      resourceId: existingRow.id,
      actorUserId: input.actorUserId,
      preferredParentResourceId: parentResourceId,
    })
  }

  const resourceResult = await db.query<ContestResourceRow>(
    `SELECT
      r.id,
      r.contest_id,
      r.category,
      r.title,
      r.year,
      r.url,
      r.access_level,
      r.source_type,
      r.summary,
      r.content,
      r.metadata,
      r.copyright_note,
      r.status,
      r.created_by_user_id,
      r.updated_by_user_id,
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM contest_resources r
     WHERE r.id = $1
       AND r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
     LIMIT 1`,
    [input.resourceId],
  )

  const resourceRow = resourceResult.rows[0]
  if (!resourceRow)
    throw new Error('RESOURCE_NOT_FOUND')

  const now = new Date().toISOString()
  const projectResourceId = randomUUID()
  const sortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId,
  })
  const metadata = {
    ...parseResourceMetadata(resourceRow.metadata),
    originContestId: normalizeString(resourceRow.contest_id),
    originResourceId: normalizeString(resourceRow.id),
    importedAt: now,
  }

  const inserted = await db.query<ProjectResourceRow>(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'library', 'binary', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::JSONB, 'active', $15, $15, $16, $16
    )
    RETURNING
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      projectResourceId,
      input.projectId,
      parentResourceId,
      sortOrder,
      resourceRow.id,
      resourceRow.title,
      normalizeString((resourceRow.metadata || {}).mimeType) || 'application/octet-stream',
      resourceRow.category,
      resourceRow.year,
      resourceRow.url,
      resourceRow.access_level,
      resourceRow.summary,
      resourceRow.content,
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  const resource = toResource(inserted.rows[0]!)
  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId: resource.id,
  })
  return resource
}

export async function createProjectUploadedResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    fileName: string
    mimeType: string
    fileSize: number
    objectKey: string
    storageProvider?: string
    title?: string
    summary?: string
    accessLevel?: ResourceAvailability
    category?: ResourceCategory
    hostMarkdownResourceId?: string
    parentResourceId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)
  const parentResourceId = await assertProjectResourceParentAvailable(db, {
    projectId: input.projectId,
    parentResourceId: input.parentResourceId,
  })

  const resourceId = randomUUID()
  const now = new Date().toISOString()
  const sortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId,
  })
  const title = await resolveProjectUploadTitle(db, {
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    title: input.title,
    hostMarkdownResourceId: input.hostMarkdownResourceId,
  })
  const sourceLink = buildServerApiEndpoint(`/projects/${input.projectId}/resources/${resourceId}/source`)
  const metadata = {
    resourceKind: 'binary',
    objectKey: normalizeString(input.objectKey),
    fileName: normalizeString(input.fileName),
    mimeType: normalizeString(input.mimeType) || 'application/octet-stream',
    fileSize: Number.isFinite(Number(input.fileSize)) ? Number(input.fileSize) : 0,
    storageProvider: normalizeString(input.storageProvider) || 'runtime',
    uploadedAt: now,
    ...parseResourceMetadata(input.metadata),
  }

  await db.query(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'upload', 'binary', NULL, $5, $6, $7, $8, $9, $10, $11, '', $12::JSONB, 'active', $13, $13, $14, $14
    )`,
    [
      resourceId,
      input.projectId,
      parentResourceId,
      sortOrder,
      title,
      normalizeString(input.mimeType) || 'application/octet-stream',
      input.category || 'templates',
      new Date().getFullYear(),
      sourceLink,
      input.accessLevel || 'public',
      normalizeString(input.summary),
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_CREATE_FAILED')
  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId: resource.id,
  })
  return resource
}

export async function createProjectExternalMarkdownResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    title: string
    content: string
    sourceLink?: string
    summary?: string
    accessLevel?: ResourceAvailability
    category?: ResourceCategory
    parentResourceId?: string | null
    metadata?: Record<string, unknown>
    existingResourceId?: string | null
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)
  const parentResourceId = await assertProjectResourceParentAvailable(db, {
    projectId: input.projectId,
    parentResourceId: input.parentResourceId,
  })

  const now = new Date().toISOString()
  const metadata = {
    resourceKind: 'markdown',
    external: true,
    importedAt: now,
    ...parseResourceMetadata(input.metadata),
  }
  const title = normalizeString(input.title) || '飞书导入资源'
  const content = normalizeString(input.content)
  const sourceLink = normalizeString(input.sourceLink)
  const existingResourceId = normalizeString(input.existingResourceId)

  if (existingResourceId) {
    await db.query(
      `UPDATE project_resources
       SET title = $3,
           mime_type = 'text/markdown',
           category = $4,
           source_link = $5,
           availability = $6,
           summary = $7,
           content = $8,
           metadata = $9::JSONB,
           status = 'active',
           updated_by_user_id = $10,
           updated_at = $11
       WHERE project_id = $1
         AND id = $2
         AND source = 'external'`,
      [
        input.projectId,
        existingResourceId,
        title,
        input.category || 'templates',
        sourceLink,
        input.accessLevel || 'login_required',
        normalizeString(input.summary),
        content,
        JSON.stringify(metadata),
        input.actorUserId,
        now,
      ],
    )

    const existing = await getProjectResourceById(db, {
      projectId: input.projectId,
      resourceId: existingResourceId,
    })
    if (existing) {
      await scheduleProjectKnowledgeSourceUpsert(db, {
        projectId: input.projectId,
        resourceId: existing.id,
      })
      return existing
    }
  }

  const resourceId = randomUUID()
  const sortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId,
  })

  await db.query(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'external', 'markdown', NULL, $5, 'text/markdown', $6, $7, $8, $9, $10, $11, $12::JSONB, 'active', $13, $13, $14, $14
    )`,
    [
      resourceId,
      input.projectId,
      parentResourceId,
      sortOrder,
      title,
      input.category || 'templates',
      new Date().getFullYear(),
      sourceLink,
      input.accessLevel || 'login_required',
      normalizeString(input.summary),
      content,
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_CREATE_FAILED')
  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId: resource.id,
  })
  return resource
}

export async function createProjectExternalBinaryResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    fileName: string
    mimeType: string
    fileSize: number
    objectKey: string
    storageProvider?: string
    title?: string
    summary?: string
    accessLevel?: ResourceAvailability
    category?: ResourceCategory
    parentResourceId?: string | null
    metadata?: Record<string, unknown>
    existingResourceId?: string | null
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)
  const parentResourceId = await assertProjectResourceParentAvailable(db, {
    projectId: input.projectId,
    parentResourceId: input.parentResourceId,
  })

  const now = new Date().toISOString()
  const title = normalizeString(input.title) || normalizeUploadTitle(input.fileName)
  const mimeType = normalizeString(input.mimeType) || 'application/octet-stream'
  const sourceLink = normalizeString(input.objectKey)
    ? buildServerApiEndpoint(`/projects/${input.projectId}/resources/${normalizeString(input.existingResourceId) || '__pending__'}/source`)
    : ''
  const metadata = {
    resourceKind: 'binary',
    external: true,
    objectKey: normalizeString(input.objectKey),
    fileName: normalizeString(input.fileName),
    mimeType,
    fileSize: Number.isFinite(Number(input.fileSize)) ? Number(input.fileSize) : 0,
    storageProvider: normalizeString(input.storageProvider) || 'runtime',
    importedAt: now,
    ...parseResourceMetadata(input.metadata),
  }
  const existingResourceId = normalizeString(input.existingResourceId)

  if (existingResourceId) {
    await db.query(
      `UPDATE project_resources
       SET title = $3,
           resource_kind = 'binary',
           mime_type = $4,
           category = $5,
           source_link = $6,
           availability = $7,
           summary = $8,
           content = '',
           metadata = $9::JSONB,
           status = 'active',
           updated_by_user_id = $10,
           updated_at = $11
       WHERE project_id = $1
         AND id = $2
         AND source = 'external'`,
      [
        input.projectId,
        existingResourceId,
        title,
        mimeType,
        input.category || 'templates',
        buildServerApiEndpoint(`/projects/${input.projectId}/resources/${existingResourceId}/source`),
        input.accessLevel || 'login_required',
        normalizeString(input.summary),
        JSON.stringify(metadata),
        input.actorUserId,
        now,
      ],
    )

    const existing = await getProjectResourceById(db, {
      projectId: input.projectId,
      resourceId: existingResourceId,
    })
    if (existing) {
      await scheduleProjectKnowledgeSourceUpsert(db, {
        projectId: input.projectId,
        resourceId: existing.id,
      })
      return existing
    }
  }

  const resourceId = randomUUID()
  const sortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId,
  })

  await db.query(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'external', 'binary', NULL, $5, $6, $7, $8, $9, $10, $11, '', $12::JSONB, 'active', $13, $13, $14, $14
    )`,
    [
      resourceId,
      input.projectId,
      parentResourceId,
      sortOrder,
      title,
      mimeType,
      input.category || 'templates',
      new Date().getFullYear(),
      sourceLink.replace('__pending__', resourceId),
      input.accessLevel || 'login_required',
      normalizeString(input.summary),
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_CREATE_FAILED')
  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId: resource.id,
  })
  return resource
}

export async function createProjectCollabResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    kind: Extract<ResourceKind, 'markdown' | 'draw'>
    purpose?: CollabPurpose
    title?: string
    summary?: string
    category?: ResourceCategory
    availability?: ResourceAvailability
    parentResourceId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<{ resource: Resource, snapshot: ProjectCollabSnapshot }> {
  const projectResult = await db.query<ProjectWorkspaceRow>(
    `SELECT id, workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [input.projectId],
  )

  const workspaceId = normalizeString(projectResult.rows[0]?.workspace_id)
  if (!workspaceId)
    throw new Error('PROJECT_NOT_FOUND')

  const kind = parseCollabKind(input.kind)
  if (!kind)
    throw new Error('INVALID_COLLAB_KIND')
  const purpose = normalizeCollabPurpose(kind, input.purpose)
  if (!purpose)
    throw new Error('INVALID_COLLAB_PURPOSE')
  const parentResourceId = await assertProjectResourceParentAvailable(db, {
    projectId: input.projectId,
    parentResourceId: input.parentResourceId,
  })

  const now = new Date().toISOString()
  const resourceId = randomUUID()
  const sortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId,
  })
  const title = await resolveCollabResourceTitle(db, input.projectId, kind, purpose, input.title)
  const sourceLink = buildServerApiEndpoint(`/projects/${input.projectId}/resources/${resourceId}/collab`)
  const mimeType = kind === 'markdown'
    ? 'text/markdown'
    : 'application/vnd.winloop.draw+json'
  const inputMetadata = parseResourceMetadata(input.metadata)
  const defaultDrawMode = kind === 'draw'
    ? normalizeDrawMode(
        inputMetadata.drawMode,
        purpose === 'workflow'
          ? 'diagram'
          : purpose === 'design'
            ? 'composition'
            : 'freeform',
      )
    : undefined
  const metadata = {
    resourceKind: kind,
    collabPurpose: purpose,
    collab: true,
    createdAt: now,
    ...inputMetadata,
    ...(kind === 'draw'
      ? {
          drawMode: defaultDrawMode,
          sceneSourceType: normalizeSceneSourceType(
            inputMetadata.sceneSourceType,
            purpose === 'design' ? 'image_mockup' : 'manual',
          ),
          templateKey: normalizeString(inputMetadata.templateKey) || undefined,
          editorEngine: normalizeSceneEditorEngine(
            inputMetadata.editorEngine,
            defaultDrawMode === 'freeform'
              ? 'tldraw_legacy'
              : 'vueflow',
          ),
        }
      : {}),
  }

  const doc = new Y.Doc()
  ensureCollabDocShape(kind, doc)
  const initialUpdate = Y.encodeStateAsUpdate(doc)

  await db.query(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'collab', $5, NULL, $6, $7, $8, $9, $10, $11, $12, '', $13::JSONB, 'active', $14, $14, $15, $15
    )`,
    [
      resourceId,
      input.projectId,
      parentResourceId,
      sortOrder,
      kind,
      title,
      mimeType,
      input.category || 'templates',
      new Date().getFullYear(),
      sourceLink,
      input.availability || 'login_required',
      normalizeString(input.summary),
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_collab_docs (
      resource_id,
      project_id,
      kind,
      ydoc_update,
      revision,
      updated_by_user_id,
      updated_at
    ) VALUES (
      $1, $2, $3, $4::BYTEA, 1, $5, $6
    )`,
    [
      resourceId,
      input.projectId,
      kind,
      Buffer.from(initialUpdate),
      input.actorUserId,
      now,
    ],
  )

  const resourceResult = await db.query<ProjectResourceRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
      pr.linked_contest_resource_id,
      pr.title,
      pr.mime_type,
      pr.category,
      pr.year,
      pr.source_link,
      pr.availability,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.status,
      pr.created_by_user_id,
      pr.updated_by_user_id,
      pr.created_at::TEXT,
      pr.updated_at::TEXT,
      prc.revision AS collab_revision
     FROM project_resources pr
     LEFT JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
     WHERE pr.project_id = $1
       AND pr.id = $2
     LIMIT 1`,
    [input.projectId, resourceId],
  )

  const row = resourceResult.rows[0]
  if (!row)
    throw new Error('RESOURCE_CREATE_FAILED')

  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId,
  })

  return {
    resource: toResource(row),
    snapshot: {
      projectId: input.projectId,
      resourceId,
      workspaceId,
      kind,
      revision: 1,
      update: initialUpdate,
      updatedAt: now,
    },
  }
}

export async function ensureProjectWorkflowCanvas(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    title?: string
  },
): Promise<{ resource: Resource, snapshot: ProjectCollabSnapshot }> {
  const existingResult = await db.query<ProjectResourceRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
      pr.linked_contest_resource_id,
      pr.title,
      pr.mime_type,
      pr.category,
      pr.year,
      pr.source_link,
      pr.availability,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.status,
      pr.created_by_user_id,
      pr.updated_by_user_id,
      pr.created_at::TEXT,
      pr.updated_at::TEXT,
      prc.revision AS collab_revision
     FROM project_resources pr
     JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
      AND prc.project_id = pr.project_id
     WHERE pr.project_id = $1
       AND pr.status = 'active'
       AND pr.source = 'collab'
       AND pr.resource_kind = 'draw'
       AND COALESCE(pr.metadata->>'collabPurpose', '') = 'workflow'
     ORDER BY pr.created_at ASC
     LIMIT 1`,
    [input.projectId],
  )

  const existing = existingResult.rows[0]
  if (existing) {
    const snapshot = await getProjectCollabSnapshot(db, {
      projectId: input.projectId,
      resourceId: existing.id,
    })
    if (!snapshot)
      throw new Error('WORKFLOW_CANVAS_SNAPSHOT_NOT_FOUND')
    return {
      resource: toResource(existing),
      snapshot,
    }
  }

  return createProjectCollabResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    kind: 'draw',
    purpose: 'workflow',
    title: input.title,
  })
}

export async function ensureProjectDesignCanvas(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    title?: string
    templateKey?: string
  },
): Promise<{ resource: Resource, snapshot: ProjectCollabSnapshot }> {
  return createProjectCollabResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    kind: 'draw',
    purpose: 'design',
    title: input.title,
    metadata: {
      drawMode: 'composition',
      sceneSourceType: 'image_mockup',
      templateKey: normalizeString(input.templateKey) || 'device-showcase',
      editorEngine: 'canvaskit_wasm',
    },
  })
}

function buildProjectMeetingMemoryInitialMarkdown(title: string): string {
  return [
    `# ${normalizeString(title) || PROJECT_MEETING_MEMORY_RESOURCE_TITLE}`,
    '',
    '自动汇总项目内所有会议的纪要、录制链接与阶段进展，作为持续沉淀的会议 memory。',
    '',
    '## 总体概述',
    '- 已汇总会议数：0',
    '- 最近会议：待生成',
    '- 最近更新：待生成',
    '- 当前进展：待生成',
    '',
    '## 自动汇总',
    '- 暂无会议纪要。',
    '',
    '## 手动补充',
    '- 可在这里补充跨会议结论、长期任务与阶段性复盘。',
  ].join('\n')
}

export async function ensureProjectMeetingMemoryResource(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    title?: string
  },
): Promise<Resource> {
  const existingResult = await db.query<ProjectResourceDocumentIdRow>(
    `SELECT id
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
       AND source = 'collab'
       AND resource_kind = 'markdown'
       AND COALESCE(metadata->>'artifactKind', '') = 'meeting_notes'
       AND COALESCE(metadata->>'meetingMemory', 'false') = 'true'
     ORDER BY created_at ASC
     LIMIT 1`,
    [input.projectId],
  )

  const existingResourceId = normalizeString(existingResult.rows[0]?.id)
  if (existingResourceId) {
    const existing = await getProjectResourceById(db, {
      projectId: input.projectId,
      resourceId: existingResourceId,
    })
    if (existing)
      return existing
  }

  const title = normalizeString(input.title) || PROJECT_MEETING_MEMORY_RESOURCE_TITLE
  const created = await createProjectCollabResource(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    kind: 'markdown',
    purpose: 'notes',
    title,
    summary: '自动汇总项目会议纪要、录制链接与阶段进展。',
    availability: 'login_required',
    category: 'templates',
    metadata: {
      artifactKind: 'meeting_notes',
      meetingMemory: true,
      meetingScope: 'project',
    },
  })

  await overwriteProjectMarkdownCollabResource(db, {
    projectId: input.projectId,
    resourceId: created.resource.id,
    actorUserId: input.actorUserId,
    markdown: buildProjectMeetingMemoryInitialMarkdown(title),
  })

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: created.resource.id,
  })
  if (!resource)
    throw new Error('MEETING_MEMORY_RESOURCE_NOT_FOUND')
  return resource
}

export async function getProjectCollabSnapshot(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectCollabSnapshot | null> {
  const result = await db.query<ProjectCollabDocRow>(
    `SELECT
      prcd.resource_id,
      prcd.project_id,
      prcd.kind,
      prcd.ydoc_update,
      prcd.revision,
      prcd.updated_by_user_id,
      prcd.updated_at::TEXT,
      p.workspace_id,
      pr.source,
      pr.status,
      pr.resource_kind
     FROM project_resource_collab_docs prcd
     JOIN project_resources pr
       ON pr.id = prcd.resource_id
      AND pr.project_id = prcd.project_id
     JOIN projects p
       ON p.id = prcd.project_id
     WHERE prcd.project_id = $1
       AND prcd.resource_id = $2
       AND pr.source = 'collab'
       AND pr.status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  const kind = parseCollabKind(row.kind) || parseCollabKind(row.resource_kind)
  if (!kind)
    return null

  const doc = new Y.Doc()
  const encodedState = toUint8Array(row.ydoc_update)
  if (encodedState.length > 0)
    Y.applyUpdate(doc, encodedState)
  ensureCollabDocShape(kind, doc)

  const normalizedUpdate = Y.encodeStateAsUpdate(doc)
  const revision = Math.max(1, parseRevision(row.revision))

  return {
    projectId: row.project_id,
    resourceId: row.resource_id,
    workspaceId: normalizeString(row.workspace_id),
    kind,
    revision,
    update: normalizedUpdate,
    updatedAt: normalizeString(row.updated_at) || new Date().toISOString(),
  }
}

export async function applyProjectCollabUpdate(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    update: Uint8Array
  },
): Promise<ProjectCollabSnapshot> {
  const incomingUpdate = input.update instanceof Uint8Array
    ? input.update
    : toUint8Array(input.update)
  if (incomingUpdate.length === 0)
    throw new Error('INVALID_COLLAB_UPDATE')

  const currentResult = await db.query<ProjectCollabDocRow>(
    `SELECT
      prcd.resource_id,
      prcd.project_id,
      prcd.kind,
      prcd.ydoc_update,
      prcd.revision,
      prcd.updated_by_user_id,
      prcd.updated_at::TEXT,
      p.workspace_id,
      pr.source,
      pr.status,
      pr.resource_kind
     FROM project_resource_collab_docs prcd
     JOIN project_resources pr
       ON pr.id = prcd.resource_id
      AND pr.project_id = prcd.project_id
     JOIN projects p
       ON p.id = prcd.project_id
     WHERE prcd.project_id = $1
       AND prcd.resource_id = $2
     FOR UPDATE`,
    [input.projectId, input.resourceId],
  )

  const current = currentResult.rows[0]
  if (!current || normalizeString(current.source) !== 'collab' || normalizeString(current.status) !== 'active')
    throw new Error('RESOURCE_NOT_FOUND')

  const kind = parseCollabKind(current.kind) || parseCollabKind(current.resource_kind)
  if (!kind)
    throw new Error('COLLAB_KIND_INVALID')

  const doc = new Y.Doc()
  const existingUpdate = toUint8Array(current.ydoc_update)
  if (existingUpdate.length > 0)
    Y.applyUpdate(doc, existingUpdate)
  ensureCollabDocShape(kind, doc)
  Y.applyUpdate(doc, incomingUpdate)

  const mergedUpdate = Y.encodeStateAsUpdate(doc)
  const nextRevision = Math.max(1, parseRevision(current.revision) + 1)
  const now = new Date().toISOString()

  await db.query(
    `UPDATE project_resource_collab_docs
     SET ydoc_update = $3::BYTEA,
         revision = $4,
         updated_by_user_id = $5,
         updated_at = $6
     WHERE project_id = $1
       AND resource_id = $2`,
    [
      input.projectId,
      input.resourceId,
      Buffer.from(mergedUpdate),
      nextRevision,
      input.actorUserId,
      now,
    ],
  )

  if (kind === 'markdown') {
    await syncMarkdownResourceProjection(db, {
      projectId: input.projectId,
      resourceId: input.resourceId,
      actorUserId: input.actorUserId,
      updatedAt: now,
      doc,
    })
  }

  return {
    projectId: input.projectId,
    resourceId: input.resourceId,
    workspaceId: normalizeString(current.workspace_id),
    kind,
    revision: nextRevision,
    update: mergedUpdate,
    updatedAt: now,
  }
}

export async function duplicateProjectResource(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<Resource> {
  await ensureProjectExists(db, input.projectId)

  const sourceResult = await db.query<ProjectResourceRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
      pr.linked_contest_resource_id,
      pr.title,
      pr.mime_type,
      pr.category,
      pr.year,
      pr.source_link,
      pr.availability,
      pr.summary,
      pr.content,
      pr.metadata,
      pr.status,
      pr.created_by_user_id,
      pr.updated_by_user_id,
      pr.created_at::TEXT,
      pr.updated_at::TEXT,
      prd.id AS document_id,
      prd.preview_status,
      prd.preview_progress_percent,
      prd.preview_eta_seconds,
      prd.preview_error,
      prc.revision AS collab_revision
     FROM project_resources pr
     LEFT JOIN project_resource_documents prd
       ON prd.project_resource_id = pr.id
     LEFT JOIN project_resource_collab_docs prc
       ON prc.resource_id = pr.id
     WHERE pr.project_id = $1
       AND pr.id = $2
       AND pr.status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const source = sourceResult.rows[0]
  if (!source)
    throw new Error('RESOURCE_NOT_FOUND')
  if (normalizeString(source.source) === 'collab')
    throw new Error('RESOURCE_DUPLICATE_UNSUPPORTED')

  const now = new Date().toISOString()
  const duplicatedResourceId = randomUUID()
  const parentResourceId = normalizeParentResourceId(source.parent_resource_id)
  const duplicatedSortOrder = parseSortOrder(source.sort_order) + 1
  const normalizedMetadata = parseResourceMetadata(source.metadata)
  const sourceType = normalizeString(source.source).toLowerCase()
  const duplicatedLinkedContestResourceId = sourceType === 'library'
    ? null
    : source.linked_contest_resource_id
  const duplicatedMetadata = {
    ...normalizedMetadata,
    duplicatedFromResourceId: source.id,
    duplicatedAt: now,
  }

  const duplicatedSourceLink = sourceType === 'upload'
    ? buildServerApiEndpoint(`/projects/${input.projectId}/resources/${duplicatedResourceId}/source`)
    : normalizeString(source.source_link)

  await db.query(
    `INSERT INTO project_resources (
      id,
      project_id,
      parent_resource_id,
      sort_order,
      source,
      resource_kind,
      linked_contest_resource_id,
      title,
      mime_type,
      category,
      year,
      source_link,
      availability,
      summary,
      content,
      metadata,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'binary', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::JSONB, 'active', $16, $16, $17, $17
    )`,
    [
      duplicatedResourceId,
      input.projectId,
      parentResourceId,
      duplicatedSortOrder,
      source.source,
      duplicatedLinkedContestResourceId,
      normalizeDuplicateTitle(source.title),
      normalizeString(source.mime_type) || 'application/octet-stream',
      source.category,
      Math.max(0, Number(source.year || 0)),
      duplicatedSourceLink,
      source.availability,
      normalizeString(source.summary),
      normalizeString(source.content),
      JSON.stringify(duplicatedMetadata),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_documents (
      id,
      project_id,
      project_resource_id,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size,
      source_file_size,
      preview_file_size,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at,
      started_at,
      finished_at,
      last_attempt_duration_ms,
      total_attempt_duration_ms,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    )
    SELECT
      $1,
      project_id,
      $2,
      object_key,
      source_object_key,
      preview_object_key,
      storage_provider,
      source_storage_provider,
      preview_storage_provider,
      file_name,
      source_file_name,
      preview_file_name,
      mime_type,
      source_mime_type,
      preview_mime_type,
      file_size,
      source_file_size,
      preview_file_size,
      page_count,
      parse_status,
      parse_error,
      preview_status,
      preview_stage,
      preview_progress_percent,
      preview_eta_seconds,
      preview_error,
      queued_at,
      started_at,
      finished_at,
      last_attempt_duration_ms,
      total_attempt_duration_ms,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      $3,
      $3,
      $4,
      $4
    FROM project_resource_documents
    WHERE project_id = $5
      AND project_resource_id = $6
    LIMIT 1`,
    [
      randomUUID(),
      duplicatedResourceId,
      input.actorUserId,
      now,
      input.projectId,
      input.resourceId,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_collab_docs (
      resource_id,
      project_id,
      kind,
      ydoc_update,
      revision,
      updated_by_user_id,
      updated_at
    )
    SELECT
      $1,
      project_id,
      kind,
      ydoc_update,
      revision,
      $2,
      $3
    FROM project_resource_collab_docs
    WHERE project_id = $4
      AND resource_id = $5
    LIMIT 1`,
    [
      duplicatedResourceId,
      input.actorUserId,
      now,
      input.projectId,
      input.resourceId,
    ],
  )

  await normalizeProjectResourceTreeAssignments(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  })

  const duplicated = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: duplicatedResourceId,
  })
  if (!duplicated)
    throw new Error('RESOURCE_DUPLICATE_FAILED')

  await scheduleProjectKnowledgeSourceUpsert(db, {
    projectId: input.projectId,
    resourceId: duplicated.id,
  })

  return duplicated
}

export async function patchProjectResourceTree(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    items: ProjectResourceTreePatchItem[]
  },
): Promise<Resource[]> {
  await ensureProjectExists(db, input.projectId)

  const normalizedItems = input.items
    .map(item => ({
      resourceId: normalizeString(item.resourceId),
      parentResourceId: normalizeParentResourceId(item.parentResourceId),
      sortOrder: parseSortOrder(item.sortOrder),
    }))
    .filter(item => item.resourceId)

  if (normalizedItems.length === 0)
    return listProjectResources(db, input.projectId)

  const duplicateId = normalizedItems.find((item, index) => normalizedItems.findIndex(candidate => candidate.resourceId === item.resourceId) !== index)
  if (duplicateId)
    throw new Error('RESOURCE_TREE_DUPLICATE_ITEM')

  const rows = await listProjectResourceTreeStateRows(db, {
    projectId: input.projectId,
    statuses: ['active'],
    forUpdate: true,
  })
  const rowMap = new Map(rows.map(row => [row.id, row]))

  for (const item of normalizedItems) {
    if (!rowMap.has(item.resourceId))
      throw new Error('RESOURCE_NOT_FOUND')
    if (item.parentResourceId && !rowMap.has(item.parentResourceId))
      throw new Error('RESOURCE_PARENT_NOT_FOUND')
    if (item.parentResourceId && item.parentResourceId === item.resourceId)
      throw new Error('RESOURCE_TREE_CYCLE')
  }

  const overrides = new Map<string, { parentResourceId: string | null, sortOrder: number }>(
    normalizedItems.map(item => [item.resourceId, {
      parentResourceId: item.parentResourceId,
      sortOrder: item.sortOrder,
    }]),
  )
  const assignments = buildNormalizedProjectResourceTreeAssignments(rows, overrides)

  await persistProjectResourceTreeAssignments(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    assignments,
  })

  return listProjectResources(db, input.projectId)
}

export async function patchProjectResourceMetadata(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    title?: string
    summary?: string
    category?: ResourceCategory
    availability?: ResourceAvailability
  },
): Promise<Resource> {
  const sets: string[] = []
  const values: unknown[] = [input.projectId, input.resourceId]
  let index = values.length + 1

  if (input.title !== undefined) {
    sets.push(`title = $${index}`)
    values.push(normalizeString(input.title))
    index += 1
  }

  if (input.summary !== undefined) {
    sets.push(`summary = $${index}`)
    values.push(normalizeString(input.summary))
    index += 1
  }

  if (input.category !== undefined) {
    sets.push(`category = $${index}`)
    values.push(input.category)
    index += 1
  }

  if (input.availability !== undefined) {
    sets.push(`availability = $${index}`)
    values.push(input.availability)
    index += 1
  }

  sets.push(`updated_by_user_id = $${index}`)
  values.push(input.actorUserId)
  index += 1
  sets.push(`updated_at = $${index}`)
  values.push(new Date().toISOString())

  const result = await db.query<{ id: string }>(
    `UPDATE project_resources
     SET ${sets.join(', ')}
     WHERE project_id = $1
      AND id = $2
      AND status = 'active'
     RETURNING id`,
    values,
  )
  const row = result.rows[0]
  if (!row)
    throw new Error('RESOURCE_NOT_FOUND')
  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: row.id,
  })
  if (!resource)
    throw new Error('RESOURCE_NOT_FOUND')
  await markProjectKnowledgeSourceStale(db, {
    projectId: input.projectId,
    resourceId: row.id,
    autoEnqueue: true,
  })
  return resource
}

export async function mergeProjectResourceMetadata(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    metadata: Record<string, unknown>
  },
): Promise<Resource> {
  const currentResult = await db.query<Pick<ProjectResourceRow, 'metadata'>>(
    `SELECT metadata
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const current = currentResult.rows[0]
  if (!current)
    throw new Error('RESOURCE_NOT_FOUND')

  const now = new Date().toISOString()
  const nextMetadata = {
    ...parseResourceMetadata(current.metadata),
    ...parseResourceMetadata(input.metadata),
  }

  await db.query(
    `UPDATE project_resources
     SET metadata = $3::JSONB,
         updated_by_user_id = $4,
         updated_at = $5
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'`,
    [input.projectId, input.resourceId, JSON.stringify(nextMetadata), input.actorUserId, now],
  )

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_NOT_FOUND')
  await markProjectKnowledgeSourceStale(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    autoEnqueue: true,
  })
  return resource
}

export async function overwriteProjectMarkdownCollabResource(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    markdown: string
  },
): Promise<ProjectCollabSnapshot> {
  const currentResult = await db.query<ProjectCollabDocRow>(
    `SELECT
      prcd.resource_id,
      prcd.project_id,
      prcd.kind,
      prcd.ydoc_update,
      prcd.revision,
      prcd.updated_by_user_id,
      prcd.updated_at::TEXT,
      p.workspace_id,
      pr.source,
      pr.status,
      pr.resource_kind
     FROM project_resource_collab_docs prcd
     JOIN project_resources pr
       ON pr.id = prcd.resource_id
      AND pr.project_id = prcd.project_id
     JOIN projects p
       ON p.id = prcd.project_id
     WHERE prcd.project_id = $1
       AND prcd.resource_id = $2
     FOR UPDATE`,
    [input.projectId, input.resourceId],
  )

  const current = currentResult.rows[0]
  if (!current || normalizeString(current.source) !== 'collab' || normalizeString(current.status) !== 'active')
    throw new Error('RESOURCE_NOT_FOUND')

  const kind = parseCollabKind(current.kind) || parseCollabKind(current.resource_kind)
  if (kind !== 'markdown')
    throw new Error('COLLAB_KIND_INVALID')

  const doc = new Y.Doc()
  ensureMarkdownCollabDocShape(doc)
  writeRichTextDocumentToFragment(doc.getXmlFragment('prosemirror'), parseMarkdownToRichTextDocument(input.markdown))

  const mergedUpdate = Y.encodeStateAsUpdate(doc)
  const nextRevision = Math.max(1, parseRevision(current.revision) + 1)
  const now = new Date().toISOString()

  await db.query(
    `UPDATE project_resource_collab_docs
     SET ydoc_update = $3::BYTEA,
         revision = $4,
         updated_by_user_id = $5,
         updated_at = $6
     WHERE project_id = $1
       AND resource_id = $2`,
    [
      input.projectId,
      input.resourceId,
      Buffer.from(mergedUpdate),
      nextRevision,
      input.actorUserId,
      now,
    ],
  )

  await syncMarkdownResourceProjection(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    actorUserId: input.actorUserId,
    updatedAt: now,
    doc,
  })

  return {
    projectId: input.projectId,
    resourceId: input.resourceId,
    workspaceId: normalizeString(current.workspace_id),
    kind: 'markdown',
    revision: nextRevision,
    update: mergedUpdate,
    updatedAt: now,
  }
}

export async function createProjectResourceDocumentWithTask(
  db: Queryable,
  input: {
    projectId: string
    projectResourceId: string
    objectKey: string
    storageProvider: string
    fileName: string
    mimeType: string
    fileSize: number
    actorUserId: string
  },
): Promise<{ documentId: string, taskId: string }> {
  const now = new Date().toISOString()
  const documentId = randomUUID()
  const taskId = randomUUID()

  await db.query<ProjectResourceDocumentIdRow>(
    `INSERT INTO project_resource_documents (
      id,
      project_id,
      project_resource_id,
      object_key,
      storage_provider,
      file_name,
      mime_type,
      file_size,
      page_count,
      parse_status,
      parse_error,
      parser_provider,
      parser_model,
      analysis_json,
      annotation_json,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, 0, 'queued', '', '', '', '{}'::JSONB, '{}'::JSONB, $9, $9, $10, $10
    )`,
    [
      documentId,
      input.projectId,
      input.projectResourceId,
      normalizeString(input.objectKey),
      normalizeString(input.storageProvider) || 'runtime',
      normalizeString(input.fileName),
      normalizeString(input.mimeType) || 'application/octet-stream',
      Math.max(0, Number(input.fileSize || 0)),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_document_tasks (
      id,
      document_id,
      status,
      attempt,
      error_message,
      result_payload,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'queued', 0, '', '{}'::JSONB, $3, $3, $4, $4
    )`,
    [taskId, documentId, input.actorUserId, now],
  )

  return {
    documentId,
    taskId,
  }
}

export async function getProjectUploadedStorageUsageBytes(
  db: Queryable,
  projectId: string,
): Promise<number> {
  const result = await db.query<ProjectUploadStorageUsageRow>(
    `SELECT COALESCE(SUM(
      CASE
        WHEN COALESCE(metadata->>'fileSize', '') ~ '^[0-9]+$'
          THEN (metadata->>'fileSize')::BIGINT
        ELSE 0
      END
    ), 0)::TEXT AS used_bytes
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
       AND source = 'upload'`,
    [projectId],
  )

  const usedBytes = Number(result.rows[0]?.used_bytes || 0)
  if (!Number.isFinite(usedBytes) || usedBytes <= 0)
    return 0
  return usedBytes
}

export async function getProjectUploadedFileRef(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectUploadedFileRef | null> {
  const result = await db.query<Pick<ProjectResourceRow, 'title' | 'mime_type' | 'metadata'>>(
    `SELECT
      title,
      mime_type,
      metadata
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
       AND source = 'upload'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  const metadata = parseResourceMetadata(row.metadata)
  const objectKey = normalizeString(metadata.objectKey)
  if (!objectKey)
    return null

  const fileName = normalizeString(metadata.fileName) || `${normalizeString(row.title) || 'resource'}.bin`
  const mimeType = normalizeString(row.mime_type) || normalizeString(metadata.mimeType) || 'application/octet-stream'

  return {
    objectKey,
    fileName,
    mimeType,
  }
}

export async function moveProjectResourceToRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<PurgedProjectResourceRef> {
  const rows = await listProjectResourceTreeStateRows(db, {
    projectId: input.projectId,
    statuses: ['active'],
    forUpdate: true,
  })
  const subtreeIds = collectProjectResourceSubtreeIds(rows, input.resourceId, 'active')
  if (!subtreeIds.includes(input.resourceId))
    throw new Error('RESOURCE_NOT_FOUND')

  const now = new Date().toISOString()
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `UPDATE project_resources
     SET status = 'archived',
         updated_by_user_id = $3,
         updated_at = $4
     WHERE project_id = $1
       AND id = ANY($2::TEXT[])
       AND status = 'active'
     RETURNING id, source, metadata`,
    [input.projectId, subtreeIds, input.actorUserId, now],
  )

  const root = result.rows.find(row => row.id === input.resourceId)
  if (!root)
    throw new Error('RESOURCE_NOT_FOUND')

  await normalizeProjectResourceTreeAssignments(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  })

  const metadata = parseResourceMetadata(root.metadata)

  return {
    resourceId: root.id,
    source: root.source,
    objectKey: root.source === 'upload' ? normalizeString(metadata.objectKey) : '',
  }
}

export async function countProjectMarkdownResourceImageReferences(
  db: Queryable,
  input: {
    projectId: string
    resourceId?: string | null
    src?: string | null
  },
): Promise<number> {
  const normalizedProjectId = normalizeString(input.projectId)
  const normalizedResourceId = normalizeString(input.resourceId)
  const normalizedSrc = normalizeString(input.src)
  if (!normalizedProjectId || (!normalizedResourceId && !normalizedSrc))
    return 0

  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'content'>>(
    `SELECT id, content
     FROM project_resources
     WHERE project_id = $1
       AND status = 'active'
       AND source = 'collab'
       AND resource_kind = 'markdown'`,
    [normalizedProjectId],
  )

  let referenceCount = 0
  for (const row of result.rows) {
    const markdown = normalizeString(row.content)
    if (!markdown)
      continue

    const references = collectImageReferencesFromMarkdown(markdown)
    for (const reference of references) {
      const referenceResourceId = normalizeString(reference.resourceId)
      const referenceSrc = normalizeString(reference.src)
      const matchedByResourceId = Boolean(normalizedResourceId && referenceResourceId === normalizedResourceId)
      const matchedBySrc = Boolean(normalizedSrc && referenceSrc === normalizedSrc)
      if (matchedByResourceId || matchedBySrc)
        referenceCount += 1
    }
  }

  return referenceCount
}

export async function restoreProjectResourceFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    preferredParentResourceId?: string | null
  },
): Promise<Resource> {
  const rows = await listProjectResourceTreeStateRows(db, {
    projectId: input.projectId,
    statuses: ['active', 'archived'],
    forUpdate: true,
  })
  const rowMap = new Map(rows.map(row => [row.id, row]))
  const root = rowMap.get(input.resourceId)
  if (!root || root.status !== 'archived')
    throw new Error('RESOURCE_NOT_FOUND')

  const subtreeIds = collectProjectResourceSubtreeIds(rows, input.resourceId, 'archived')
  const preferredParentResourceId = normalizeParentResourceId(input.preferredParentResourceId)
  let restoreParentResourceId: string | null = null

  if (preferredParentResourceId) {
    const preferredParent = rowMap.get(preferredParentResourceId)
    if (!preferredParent || preferredParent.status !== 'active')
      throw new Error('RESOURCE_PARENT_NOT_FOUND')
    restoreParentResourceId = preferredParentResourceId
  }
  else {
    const originalParentResourceId = normalizeParentResourceId(root.parent_resource_id)
    const originalParent = originalParentResourceId ? rowMap.get(originalParentResourceId) : null
    if (originalParent && originalParent.status === 'active' && !subtreeIds.includes(originalParent.id))
      restoreParentResourceId = originalParent.id
  }

  const nextRootSortOrder = await resolveNextProjectResourceSortOrder(db, {
    projectId: input.projectId,
    parentResourceId: restoreParentResourceId,
  })

  const now = new Date().toISOString()
  await db.query(
    `UPDATE project_resources
     SET status = 'active',
         updated_by_user_id = $3,
         updated_at = $4
     WHERE project_id = $1
       AND id = ANY($2::TEXT[])
       AND status = 'archived'`,
    [input.projectId, subtreeIds, input.actorUserId, now],
  )

  await db.query(
    `UPDATE project_resources
     SET parent_resource_id = $3,
         sort_order = $4,
         updated_by_user_id = $5,
         updated_at = $6
     WHERE project_id = $1
       AND id = $2`,
    [input.projectId, input.resourceId, restoreParentResourceId, nextRootSortOrder, input.actorUserId, now],
  )

  await normalizeProjectResourceTreeAssignments(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
  })

  const resource = await getProjectResourceById(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
  })
  if (!resource)
    throw new Error('RESOURCE_NOT_FOUND')
  return resource
}

export async function purgeProjectResourceFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<PurgedProjectResourceRef[]> {
  const rows = await listProjectResourceTreeStateRows(db, {
    projectId: input.projectId,
    statuses: ['archived'],
    forUpdate: true,
  })
  const subtreeIds = collectProjectResourceSubtreeIds(rows, input.resourceId, 'archived')
  if (!subtreeIds.includes(input.resourceId))
    throw new Error('RESOURCE_NOT_FOUND')

  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `DELETE FROM project_resources
     WHERE project_id = $1
       AND id = ANY($2::TEXT[])
       AND status = 'archived'
     RETURNING id, source, metadata`,
    [input.projectId, subtreeIds],
  )

  return result.rows.map((row) => {
    const metadata = parseResourceMetadata(row.metadata)
    return {
      resourceId: row.id,
      source: row.source,
      objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
    }
  })
}

export async function purgeExpiredProjectResourcesFromRecycleBin(
  db: Queryable,
  input: {
    projectId: string
    retentionDays?: number
  },
): Promise<PurgedProjectResourceRef[]> {
  const retentionDays = Math.max(1, Math.trunc(Number(input.retentionDays || PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS)))
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `DELETE FROM project_resources
     WHERE project_id = $1
       AND status = 'archived'
       AND updated_at <= (NOW() - ($2::TEXT || ' days')::INTERVAL)
     RETURNING id, source, metadata`,
    [input.projectId, retentionDays],
  )

  return result.rows.map((row) => {
    const metadata = parseResourceMetadata(row.metadata)
    return {
      resourceId: row.id,
      source: row.source,
      objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
    }
  })
}

export async function purgeExpiredProjectResourcesFromRecycleBinGlobal(
  db: Queryable,
  input?: {
    retentionDays?: number
    limit?: number
  },
): Promise<PurgedProjectResourceRef[]> {
  const retentionDays = Math.max(1, Math.trunc(Number(input?.retentionDays || PROJECT_RESOURCE_RECYCLE_RETENTION_DAYS)))
  const limit = Math.max(20, Math.min(2000, Math.trunc(Number(input?.limit || 200))))
  const result = await db.query<Pick<ProjectResourceRow, 'id' | 'source' | 'metadata'>>(
    `WITH expired AS (
      SELECT id
      FROM project_resources
      WHERE status = 'archived'
        AND updated_at <= (NOW() - ($1::TEXT || ' days')::INTERVAL)
      ORDER BY updated_at ASC
      LIMIT $2
    )
    DELETE FROM project_resources pr
    USING expired
    WHERE pr.id = expired.id
    RETURNING pr.id, pr.source, pr.metadata`,
    [retentionDays, limit],
  )

  return result.rows.map((row) => {
    const metadata = parseResourceMetadata(row.metadata)
    return {
      resourceId: row.id,
      source: row.source,
      objectKey: row.source === 'upload' ? normalizeString(metadata.objectKey) : '',
    }
  })
}

export async function listUnreferencedUploadObjectKeys(
  db: Queryable,
  objectKeys: string[],
): Promise<string[]> {
  const normalizedKeys = [...new Set(
    objectKeys
      .map(item => normalizeString(item))
      .filter(Boolean),
  )]

  if (normalizedKeys.length === 0)
    return []

  const result = await db.query<ObjectKeyRow>(
    `SELECT t.object_key
     FROM UNNEST($1::TEXT[]) AS t(object_key)
     WHERE NOT EXISTS (
       SELECT 1
       FROM project_resources pr
       WHERE pr.source = 'upload'
         AND COALESCE(pr.metadata->>'objectKey', '') = t.object_key
     )`,
    [normalizedKeys],
  )

  return result.rows.map(item => normalizeString(item.object_key)).filter(Boolean)
}
