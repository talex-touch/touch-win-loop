import type { Queryable } from '~~/server/utils/db'
import type { Resource } from '~~/shared/types/domain'
import type { DeviceArrangementDocumentV1, DeviceArrangementPersistedPayload } from '~~/shared/utils/device-arrangement-document'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { getProjectCollabSnapshot } from '~~/server/utils/project-resource-store'
import {
  DEVICE_ARRANGEMENT_MIME_TYPE,
  migrateSceneDocumentToDeviceArrangementDocument,
  normalizeDeviceArrangementDocument,
  renderDeviceArrangementDocumentToSvg,
} from '~~/shared/utils/device-arrangement-document'

interface ProjectWorkspaceRow {
  id: string
  workspace_id: string
}

interface DeviceArrangementResourceRow {
  id: string
  project_id: string
  parent_resource_id: string | null
  sort_order: number | string
  source: string
  resource_kind: string
  title: string
  mime_type: string
  category: string
  year: number | string
  source_link: string
  availability: string
  summary: string
  content: string
  metadata: Record<string, unknown> | string | null
  status: string
  created_by_user_id: string | null
  updated_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface DeviceArrangementRow extends DeviceArrangementResourceRow {
  document_json: Record<string, unknown> | string | null
  preview_svg: string
  revision: number | string
  arrangement_updated_at: string
}

export interface DeviceArrangementEditLockPayload {
  userId: string
  username: string
  sessionId: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
}

interface DeviceArrangementLockResourceRow {
  metadata: Record<string, unknown> | string | null
}

const DEVICE_ARRANGEMENT_LOCK_METADATA_KEY = 'deviceArrangementLock'
const DEVICE_ARRANGEMENT_LOCK_TTL_MS = 90_000

export class DeviceArrangementLockConflictError extends Error {
  lock: DeviceArrangementEditLockPayload

  constructor(lock: DeviceArrangementEditLockPayload) {
    super('DEVICE_ARRANGEMENT_LOCKED')
    this.name = 'DeviceArrangementLockConflictError'
    this.lock = lock
  }
}

export class DeviceArrangementLockRequiredError extends Error {
  constructor() {
    super('DEVICE_ARRANGEMENT_LOCK_REQUIRED')
    this.name = 'DeviceArrangementLockRequiredError'
  }
}

export function isDeviceArrangementLockConflictError(error: unknown): error is DeviceArrangementLockConflictError {
  return error instanceof DeviceArrangementLockConflictError
}

export function isDeviceArrangementLockRequiredError(error: unknown): error is DeviceArrangementLockRequiredError {
  return error instanceof DeviceArrangementLockRequiredError
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
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
  if (typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function parseRevision(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1
}

function normalizeLockPayload(value: unknown): DeviceArrangementEditLockPayload | null {
  const record = normalizeRecord(value)
  const userId = normalizeString(record.userId)
  const username = normalizeString(record.username)
  const sessionId = normalizeString(record.sessionId)
  const acquiredAt = normalizeString(record.acquiredAt)
  const heartbeatAt = normalizeString(record.heartbeatAt)
  const expiresAt = normalizeString(record.expiresAt)
  if (!userId || !sessionId || !expiresAt)
    return null
  return {
    userId,
    username,
    sessionId,
    acquiredAt: acquiredAt || heartbeatAt || new Date(0).toISOString(),
    heartbeatAt: heartbeatAt || acquiredAt || new Date(0).toISOString(),
    expiresAt,
  }
}

function readDeviceArrangementLock(metadata: Record<string, unknown>): DeviceArrangementEditLockPayload | null {
  return normalizeLockPayload(metadata[DEVICE_ARRANGEMENT_LOCK_METADATA_KEY])
}

function isLockActive(lock: DeviceArrangementEditLockPayload | null, nowMs = Date.now()): lock is DeviceArrangementEditLockPayload {
  if (!lock)
    return false
  const expiresAtMs = Date.parse(lock.expiresAt)
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
}

function createDeviceArrangementLock(input: {
  actorUserId: string
  actorUsername: string
  sessionId: string
  previousLock?: DeviceArrangementEditLockPayload | null
  now?: Date
}): DeviceArrangementEditLockPayload {
  const now = input.now || new Date()
  const nowIso = now.toISOString()
  return {
    userId: input.actorUserId,
    username: normalizeString(input.actorUsername) || input.actorUserId,
    sessionId: input.sessionId,
    acquiredAt: input.previousLock?.userId === input.actorUserId && input.previousLock.acquiredAt
      ? input.previousLock.acquiredAt
      : nowIso,
    heartbeatAt: nowIso,
    expiresAt: new Date(now.getTime() + DEVICE_ARRANGEMENT_LOCK_TTL_MS).toISOString(),
  }
}

function mapResource(row: DeviceArrangementResourceRow): Resource {
  const metadata = normalizeRecord(row.metadata)
  return {
    id: row.id,
    projectId: row.project_id,
    parentResourceId: row.parent_resource_id,
    sortOrder: Number(row.sort_order || 0),
    resourceKind: 'binary',
    documentId: undefined,
    contestId: '',
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: row.source_link,
    availability: row.availability as Resource['availability'],
    summary: row.summary,
    copyrightNote: '',
    content: row.content,
    metadata,
    category: row.category as Resource['category'],
    source: 'collab',
    status: row.status as Resource['status'],
    createdBy: row.created_by_user_id || undefined,
    updatedBy: row.updated_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapArrangement(row: DeviceArrangementRow): { resource: Resource, arrangement: DeviceArrangementPersistedPayload } {
  const document = normalizeDeviceArrangementDocument(row.document_json, { title: row.title, relayout: false })
  return {
    resource: mapResource(row),
    arrangement: {
      resourceId: row.id,
      projectId: row.project_id,
      revision: parseRevision(row.revision),
      document,
      previewSvg: normalizeString(row.preview_svg) || renderDeviceArrangementDocumentToSvg(document),
      updatedAt: row.arrangement_updated_at || row.updated_at,
    },
  }
}

async function ensureProjectWorkspace(db: Queryable, projectId: string): Promise<string> {
  const result = await db.query<ProjectWorkspaceRow>(
    `SELECT id, workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )
  const workspaceId = normalizeString(result.rows[0]?.workspace_id)
  if (!workspaceId)
    throw new Error('PROJECT_NOT_FOUND')
  return workspaceId
}

async function resolveNextSortOrder(db: Queryable, projectId: string): Promise<number> {
  const result = await db.query<{ max_sort_order: number | string | null }>(
    `SELECT MAX(sort_order) AS max_sort_order
     FROM project_resources
     WHERE project_id = $1
       AND parent_resource_id IS NULL`,
    [projectId],
  )
  const current = Number(result.rows[0]?.max_sort_order || 0)
  return (Number.isFinite(current) ? current : 0) + 1000
}

async function getResourceMetadata(db: Queryable, input: { projectId: string, resourceId: string }): Promise<{
  title: string
  metadata: Record<string, unknown>
  resourceKind: string
  source: string
} | null> {
  const result = await db.query<{
    title: string
    metadata: Record<string, unknown> | string | null
    resource_kind: string
    source: string
  }>(
    `SELECT title, metadata, resource_kind, source
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )
  const row = result.rows[0]
  return row
    ? {
        title: normalizeString(row.title),
        metadata: normalizeRecord(row.metadata),
        resourceKind: normalizeString(row.resource_kind),
        source: normalizeString(row.source),
      }
    : null
}

async function selectDeviceArrangement(db: Queryable, input: { projectId: string, resourceId: string }) {
  const result = await db.query<DeviceArrangementRow>(
    `SELECT
      pr.id,
      pr.project_id,
      pr.parent_resource_id,
      pr.sort_order,
      pr.source,
      pr.resource_kind,
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
      pda.document_json,
      pda.preview_svg,
      pda.revision,
      pda.updated_at::TEXT AS arrangement_updated_at
     FROM project_resource_device_arrangements pda
     JOIN project_resources pr
       ON pr.id = pda.resource_id
      AND pr.project_id = pda.project_id
     WHERE pda.project_id = $1
       AND pda.resource_id = $2
       AND pr.status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )
  return result.rows[0] ? mapArrangement(result.rows[0]) : null
}

async function selectDeviceArrangementLockResource(
  db: Queryable,
  input: { projectId: string, resourceId: string },
): Promise<DeviceArrangementLockResourceRow | null> {
  const result = await db.query<DeviceArrangementLockResourceRow>(
    `SELECT pr.metadata
     FROM project_resources pr
     JOIN project_resource_device_arrangements pda
       ON pda.resource_id = pr.id
      AND pda.project_id = pr.project_id
     WHERE pr.project_id = $1
       AND pr.id = $2
       AND pr.status = 'active'
     LIMIT 1
     FOR UPDATE OF pr`,
    [input.projectId, input.resourceId],
  )
  return result.rows[0] || null
}

async function writeDeviceArrangementLockMetadata(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    metadata: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE project_resources
     SET metadata = $3::JSONB
     WHERE project_id = $1
       AND id = $2`,
    [input.projectId, input.resourceId, JSON.stringify(input.metadata)],
  )
}

async function lockDeviceArrangementForEditing(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    actorUsername: string
    sessionId: string
    requireExistingLock?: boolean
  },
): Promise<DeviceArrangementEditLockPayload> {
  const row = await selectDeviceArrangementLockResource(db, input)
  if (!row)
    throw new Error('DEVICE_ARRANGEMENT_NOT_FOUND')

  const metadata = normalizeRecord(row.metadata)
  const existingLock = readDeviceArrangementLock(metadata)
  if (isLockActive(existingLock) && existingLock.userId !== input.actorUserId)
    throw new DeviceArrangementLockConflictError(existingLock)

  if (
    input.requireExistingLock
    && (
      !isLockActive(existingLock)
      || existingLock.userId !== input.actorUserId
      || existingLock.sessionId !== input.sessionId
    )
  ) {
    throw new DeviceArrangementLockRequiredError()
  }

  const nextLock = createDeviceArrangementLock({
    actorUserId: input.actorUserId,
    actorUsername: input.actorUsername,
    sessionId: input.sessionId,
    previousLock: existingLock,
  })
  metadata[DEVICE_ARRANGEMENT_LOCK_METADATA_KEY] = nextLock
  await writeDeviceArrangementLockMetadata(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    metadata,
  })
  return nextLock
}

export async function getProjectDeviceArrangement(
  db: Queryable,
  input: { projectId: string, resourceId: string },
): Promise<{ resource: Resource, arrangement: DeviceArrangementPersistedPayload } | null> {
  return selectDeviceArrangement(db, input)
}

export async function acquireProjectDeviceArrangementEditLock(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    actorUsername: string
    sessionId: string
  },
): Promise<{ resource: Resource, arrangement: DeviceArrangementPersistedPayload, editLock: DeviceArrangementEditLockPayload }> {
  const editLock = await lockDeviceArrangementForEditing(db, input)
  const arrangement = await selectDeviceArrangement(db, input)
  if (!arrangement)
    throw new Error('DEVICE_ARRANGEMENT_NOT_FOUND')
  return { ...arrangement, editLock }
}

export async function refreshProjectDeviceArrangementEditLock(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    actorUsername: string
    sessionId: string
  },
): Promise<DeviceArrangementEditLockPayload> {
  return lockDeviceArrangementForEditing(db, input)
}

export async function ensureProjectDeviceArrangementEditLock(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    actorUsername: string
    sessionId: string
  },
): Promise<DeviceArrangementEditLockPayload> {
  return lockDeviceArrangementForEditing(db, {
    ...input,
    requireExistingLock: true,
  })
}

export async function releaseProjectDeviceArrangementEditLock(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    sessionId: string
  },
): Promise<void> {
  const row = await selectDeviceArrangementLockResource(db, input)
  if (!row)
    return

  const metadata = normalizeRecord(row.metadata)
  const existingLock = readDeviceArrangementLock(metadata)
  if (!existingLock || existingLock.userId !== input.actorUserId || existingLock.sessionId !== input.sessionId)
    return

  delete metadata[DEVICE_ARRANGEMENT_LOCK_METADATA_KEY]
  await writeDeviceArrangementLockMetadata(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    metadata,
  })
}

export async function createProjectDeviceArrangement(
  db: Queryable,
  input: {
    projectId: string
    actorUserId: string
    title?: string
    document?: Partial<DeviceArrangementDocumentV1> | Record<string, unknown>
  },
): Promise<{ resource: Resource, arrangement: DeviceArrangementPersistedPayload, workspaceId: string }> {
  const workspaceId = await ensureProjectWorkspace(db, input.projectId)
  const now = new Date().toISOString()
  const resourceId = randomUUID()
  const sortOrder = await resolveNextSortOrder(db, input.projectId)
  const title = normalizeString(input.title) || normalizeString(input.document?.title) || '设备排布'
  const document = normalizeDeviceArrangementDocument({
    ...normalizeRecord(input.document),
    title,
    createdAt: now,
    updatedAt: now,
  })
  const previewSvg = renderDeviceArrangementDocumentToSvg(document)
  const metadata = {
    resourceKind: 'binary',
    mimeType: DEVICE_ARRANGEMENT_MIME_TYPE,
    deviceArrangement: true,
    deviceArrangementVersion: 1,
    collab: true,
    createdAt: now,
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
      $1, $2, NULL, $3, 'collab', 'binary', NULL, $4, $5, 'templates', $6, $7, 'login_required', '', '', $8::JSONB, 'active', $9, $9, $10, $10
    )`,
    [
      resourceId,
      input.projectId,
      sortOrder,
      title,
      DEVICE_ARRANGEMENT_MIME_TYPE,
      new Date().getFullYear(),
      `/api/projects/${input.projectId}/device-arrangements/${resourceId}`,
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )
  await db.query(
    `INSERT INTO project_resource_device_arrangements (
      resource_id,
      project_id,
      document_json,
      preview_svg,
      revision,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3::JSONB, $4, 1, $5, $6, $6)`,
    [resourceId, input.projectId, JSON.stringify(document), previewSvg, input.actorUserId, now],
  )

  const created = await selectDeviceArrangement(db, { projectId: input.projectId, resourceId })
  if (!created)
    throw new Error('DEVICE_ARRANGEMENT_CREATE_FAILED')
  return { ...created, workspaceId }
}

export async function updateProjectDeviceArrangement(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    document: unknown
    title?: string
  },
): Promise<{ resource: Resource, arrangement: DeviceArrangementPersistedPayload }> {
  const existing = await selectDeviceArrangement(db, input)
  if (!existing)
    throw new Error('DEVICE_ARRANGEMENT_NOT_FOUND')

  const now = new Date().toISOString()
  const title = normalizeString(input.title) || normalizeString(normalizeRecord(input.document).title) || existing.resource.title
  const document = normalizeDeviceArrangementDocument({
    ...normalizeRecord(input.document),
    title,
    updatedAt: now,
  }, { relayout: false })
  const previewSvg = renderDeviceArrangementDocumentToSvg(document)
  await db.query(
    `UPDATE project_resource_device_arrangements
     SET document_json = $3::JSONB,
         preview_svg = $4,
         revision = revision + 1,
         updated_by_user_id = $5,
         updated_at = $6
     WHERE project_id = $1
       AND resource_id = $2`,
    [input.projectId, input.resourceId, JSON.stringify(document), previewSvg, input.actorUserId, now],
  )
  await db.query(
    `UPDATE project_resources
     SET title = $3,
         updated_by_user_id = $4,
         updated_at = $5
     WHERE project_id = $1
       AND id = $2`,
    [input.projectId, input.resourceId, title, input.actorUserId, now],
  )
  const updated = await selectDeviceArrangement(db, input)
  if (!updated)
    throw new Error('DEVICE_ARRANGEMENT_NOT_FOUND')
  return updated
}

function extractSceneDocumentFromCollabUpdate(update: Uint8Array): unknown {
  const doc = new Y.Doc()
  if (update.length > 0)
    Y.applyUpdate(doc, update)
  const nodes = doc.getMap('draw').get('nodes')
  if (!(nodes instanceof Y.Array))
    return {}
  const raw = nodes.toArray()
  if (raw.length === 1)
    return raw[0]
  return raw
}

export async function migrateProjectDeviceArrangementFromScene(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<{ resource: Resource, arrangement: DeviceArrangementPersistedPayload, workspaceId: string, migratedFromResourceId: string }> {
  const workspaceId = await ensureProjectWorkspace(db, input.projectId)
  const legacy = await getResourceMetadata(db, input)
  if (!legacy)
    throw new Error('RESOURCE_NOT_FOUND')

  const existingMigratedResourceId = normalizeString(legacy.metadata.migratedDeviceArrangementResourceId)
  if (existingMigratedResourceId) {
    const existing = await selectDeviceArrangement(db, {
      projectId: input.projectId,
      resourceId: existingMigratedResourceId,
    })
    if (existing)
      return { ...existing, workspaceId, migratedFromResourceId: input.resourceId }
  }

  const snapshot = await getProjectCollabSnapshot(db, input)
  if (!snapshot || snapshot.kind !== 'draw')
    throw new Error('LEGACY_DEVICE_ARRANGEMENT_NOT_FOUND')

  const sceneDocument = extractSceneDocumentFromCollabUpdate(snapshot.update)
  const document = migrateSceneDocumentToDeviceArrangementDocument(sceneDocument, legacy.title || '设备排布')
  if (document.items.length === 0)
    throw new Error('LEGACY_DEVICE_ARRANGEMENT_NOT_FOUND')

  const created = await createProjectDeviceArrangement(db, {
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    title: legacy.title || '设备排布',
    document,
  })
  const nextMetadata = {
    ...legacy.metadata,
    migratedDeviceArrangementResourceId: created.resource.id,
    migratedDeviceArrangementAt: new Date().toISOString(),
  }
  await db.query(
    `UPDATE project_resources
     SET metadata = $3::JSONB,
         updated_by_user_id = $4,
         updated_at = NOW()
     WHERE project_id = $1
       AND id = $2`,
    [input.projectId, input.resourceId, JSON.stringify(nextMetadata), input.actorUserId],
  )
  return { ...created, migratedFromResourceId: input.resourceId }
}
