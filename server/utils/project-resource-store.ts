import type { Queryable } from '~~/server/utils/db'
import type {
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ResourceRow {
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
  created_at: string
  updated_at: string
}

interface ProjectContestRow {
  contest_id: string
}

interface UploadFileRow {
  title: string
  source_type: string
  metadata: Record<string, unknown>
}

export interface ProjectUploadedFileRef {
  objectKey: string
  fileName: string
  mimeType: string
}

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

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    contestId: row.contest_id,
    category: row.category,
    title: row.title,
    type: row.category,
    year: Number(row.year || 0),
    sourceLink: row.url,
    availability: row.access_level,
    sourceType: row.source_type,
    summary: row.summary,
    content: row.content,
    metadata: parseResourceMetadata(row.metadata),
    copyrightNote: row.copyright_note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeUploadTitle(fileName: string, inputTitle?: string): string {
  const trimmedInput = normalizeString(inputTitle)
  if (trimmedInput)
    return trimmedInput

  const base = normalizeString(fileName)
    .replace(/\.[^/.]+$/, '')
    .trim()

  if (base)
    return base

  return '上传资料'
}

async function getProjectContestId(db: Queryable, projectId: string): Promise<string | null> {
  const projectResult = await db.query<ProjectContestRow>(
    `SELECT contest_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [projectId],
  )

  const contestId = normalizeString(projectResult.rows[0]?.contest_id)
  if (!contestId)
    return null

  return contestId
}

export async function listProjectResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ResourceRow>(
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
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM project_resource_bindings b
     JOIN contest_resources r ON r.id = b.resource_id
     WHERE b.project_id = $1
       AND r.status = 'active'
     ORDER BY b.created_at DESC`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function listProjectLibraryResources(
  db: Queryable,
  projectId: string,
): Promise<Resource[]> {
  const result = await db.query<ResourceRow>(
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
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM projects p
     JOIN contest_resources r ON r.contest_id = p.contest_id
     WHERE p.id = $1
       AND r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
       AND NOT EXISTS (
         SELECT 1
         FROM project_resource_bindings b
         WHERE b.project_id = p.id
           AND b.resource_id = r.id
       )
     ORDER BY r.year DESC, r.created_at DESC
     LIMIT 80`,
    [projectId],
  )

  return result.rows.map(toResource)
}

export async function bindLibraryResourceToProject(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
  },
): Promise<Resource> {
  const resourceResult = await db.query<ResourceRow>(
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
      r.created_at::TEXT,
      r.updated_at::TEXT
     FROM projects p
     JOIN contest_resources r ON r.contest_id = p.contest_id
     WHERE p.id = $1
       AND r.id = $2
       AND r.status = 'active'
       AND COALESCE(r.source_type, '') <> 'project_upload'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const resourceRow = resourceResult.rows[0]
  if (!resourceRow)
    throw new Error('RESOURCE_NOT_FOUND')

  await db.query(
    `INSERT INTO project_resource_bindings (
      id,
      project_id,
      resource_id,
      source,
      added_by_user_id,
      created_at
    ) VALUES ($1, $2, $3, 'library', $4, NOW())
    ON CONFLICT (project_id, resource_id) DO NOTHING`,
    [randomUUID(), input.projectId, input.resourceId, input.actorUserId],
  )

  return toResource(resourceRow)
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
  },
): Promise<Resource> {
  const contestId = await getProjectContestId(db, input.projectId)
  if (!contestId)
    throw new Error('PROJECT_NOT_FOUND')

  const resourceId = randomUUID()
  const now = new Date().toISOString()
  const title = normalizeUploadTitle(input.fileName, input.title)
  const sourceLink = `/api/projects/${input.projectId}/resources/${resourceId}/file`
  const metadata = {
    objectKey: normalizeString(input.objectKey),
    fileName: normalizeString(input.fileName),
    mimeType: normalizeString(input.mimeType) || 'application/octet-stream',
    fileSize: Number.isFinite(Number(input.fileSize)) ? Number(input.fileSize) : 0,
    storageProvider: normalizeString(input.storageProvider) || 'runtime',
    uploadedAt: now,
  }

  await db.query(
    `INSERT INTO contest_resources (
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'project_upload', $8, '', $9::JSONB, '', 'active', $10, $10, $11, $11
    )`,
    [
      resourceId,
      contestId,
      input.category || 'templates',
      title,
      new Date().getFullYear(),
      sourceLink,
      input.accessLevel || 'public',
      normalizeString(input.summary),
      JSON.stringify(metadata),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_bindings (
      id,
      project_id,
      resource_id,
      source,
      added_by_user_id,
      created_at
    ) VALUES (
      $1, $2, $3, 'upload', $4, $5
    )`,
    [
      randomUUID(),
      input.projectId,
      resourceId,
      input.actorUserId,
      now,
    ],
  )

  const result = await db.query<ResourceRow>(
    `SELECT
      id,
      contest_id,
      category,
      title,
      year,
      url,
      access_level,
      source_type,
      summary,
      content,
      metadata,
      copyright_note,
      status,
      created_at::TEXT,
      updated_at::TEXT
     FROM contest_resources
     WHERE id = $1
     LIMIT 1`,
    [resourceId],
  )

  return toResource(result.rows[0]!)
}

export async function getProjectUploadedFileRef(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectUploadedFileRef | null> {
  const result = await db.query<UploadFileRow>(
    `SELECT
      r.title,
      r.source_type,
      r.metadata
     FROM project_resource_bindings b
     JOIN contest_resources r ON r.id = b.resource_id
     WHERE b.project_id = $1
       AND b.resource_id = $2
       AND r.status = 'active'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  if (normalizeString(row.source_type) !== 'project_upload')
    return null

  const metadata = parseResourceMetadata(row.metadata)
  const objectKey = normalizeString(metadata.objectKey)
  if (!objectKey)
    return null

  const fileName = normalizeString(metadata.fileName) || `${normalizeString(row.title) || 'resource'}.bin`
  const mimeType = normalizeString(metadata.mimeType) || 'application/octet-stream'

  return {
    objectKey,
    fileName,
    mimeType,
  }
}
