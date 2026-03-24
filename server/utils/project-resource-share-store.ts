import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectResourceShare,
  ProjectResourceShareDurationPreset,
  ProjectResourceShareVisibility,
} from '~~/shared/types/domain'
import { randomBytes, randomUUID } from 'node:crypto'
import { buildServerApiEndpoint } from '~~/server/utils/api-url'

interface ProjectResourceShareRow {
  id: string
  project_id: string
  resource_id: string
  resource_title: string
  share_key: string
  visibility: ProjectResourceShareVisibility
  duration: ProjectResourceShareDurationPreset
  expires_at: string
  revoked_at: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

interface ShareAccessRow {
  id: string
  project_id: string
  resource_id: string
  visibility: ProjectResourceShareVisibility
  workspace_id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeVisibility(value: unknown): ProjectResourceShareVisibility {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'workspace')
    return 'workspace'
  return 'public'
}

function normalizeDurationPreset(value: unknown): ProjectResourceShareDurationPreset {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === '1h' || normalized === '1d' || normalized === '3d' || normalized === '7d' || normalized === '1mon')
    return normalized
  return '7d'
}

function resolveExpiresAt(duration: ProjectResourceShareDurationPreset, now = new Date()): string {
  const next = new Date(now)
  if (duration === '1h') {
    next.setHours(next.getHours() + 1)
    return next.toISOString()
  }
  if (duration === '1d') {
    next.setDate(next.getDate() + 1)
    return next.toISOString()
  }
  if (duration === '3d') {
    next.setDate(next.getDate() + 3)
    return next.toISOString()
  }
  if (duration === '7d') {
    next.setDate(next.getDate() + 7)
    return next.toISOString()
  }

  next.setMonth(next.getMonth() + 1)
  return next.toISOString()
}

function createShareKey(): string {
  return randomBytes(20).toString('hex')
}

function mapProjectResourceShare(row: ProjectResourceShareRow): ProjectResourceShare {
  return {
    id: row.id,
    projectId: row.project_id,
    resourceId: row.resource_id,
    resourceTitle: normalizeString(row.resource_title) || '未命名文件',
    shareKey: row.share_key,
    shareUrl: buildServerApiEndpoint(`/share/resources/${row.share_key}`),
    visibility: normalizeVisibility(row.visibility),
    duration: normalizeDurationPreset(row.duration),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdBy: row.created_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createProjectResourceShare(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    visibility: ProjectResourceShareVisibility
    duration: ProjectResourceShareDurationPreset
  },
): Promise<ProjectResourceShare> {
  const normalizedProjectId = normalizeString(input.projectId)
  const normalizedResourceId = normalizeString(input.resourceId)
  const actorUserId = normalizeString(input.actorUserId)
  const visibility = normalizeVisibility(input.visibility)
  const duration = normalizeDurationPreset(input.duration)

  const targetResult = await db.query<{ id: string, title: string }>(
    `SELECT id, title
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
     LIMIT 1`,
    [normalizedProjectId, normalizedResourceId],
  )

  const targetRow = targetResult.rows[0]
  if (!targetRow?.id)
    throw new Error('RESOURCE_NOT_FOUND')
  const resourceTitle = normalizeString(targetRow.title) || '未命名文件'

  const id = randomUUID()
  const shareKey = createShareKey()
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = resolveExpiresAt(duration, now)

  const inserted = await db.query<ProjectResourceShareRow>(
    `INSERT INTO project_resource_shares (
      id,
      project_id,
      resource_id,
      share_key,
      visibility,
      duration,
      expires_at,
      revoked_at,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::TIMESTAMPTZ, NULL, $8, $9::TIMESTAMPTZ, $9::TIMESTAMPTZ
    )
    RETURNING
      id,
      project_id,
      resource_id,
      $10::TEXT AS resource_title,
      share_key,
      visibility,
      duration,
      expires_at::TEXT,
      revoked_at::TEXT,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      id,
      normalizedProjectId,
      normalizedResourceId,
      shareKey,
      visibility,
      duration,
      expiresAt,
      actorUserId || null,
      nowIso,
      resourceTitle,
    ],
  )

  const row = inserted.rows[0]
  if (!row)
    throw new Error('SHARE_CREATE_FAILED')

  return mapProjectResourceShare(row)
}

export async function listProjectResourceShares(
  db: Queryable,
  input: {
    projectId: string
  },
): Promise<ProjectResourceShare[]> {
  const projectId = normalizeString(input.projectId)
  if (!projectId)
    return []

  const result = await db.query<ProjectResourceShareRow>(
    `SELECT
      prs.id,
      prs.project_id,
      prs.resource_id,
      pr.title AS resource_title,
      prs.share_key,
      prs.visibility,
      prs.duration,
      prs.expires_at::TEXT,
      prs.revoked_at::TEXT,
      prs.created_by_user_id,
      prs.created_at::TEXT,
      prs.updated_at::TEXT
     FROM project_resource_shares prs
     JOIN project_resources pr ON pr.id = prs.resource_id
     WHERE prs.project_id = $1
     ORDER BY prs.created_at DESC`,
    [projectId],
  )

  return result.rows.map(mapProjectResourceShare)
}

export async function revokeProjectResourceShare(
  db: Queryable,
  input: {
    projectId: string
    shareId: string
    actorUserId: string
  },
): Promise<ProjectResourceShare> {
  const now = new Date().toISOString()
  const result = await db.query<ProjectResourceShareRow>(
    `UPDATE project_resource_shares prs
     SET revoked_at = COALESCE(prs.revoked_at, $4::TIMESTAMPTZ),
         updated_at = $4::TIMESTAMPTZ,
         created_by_user_id = COALESCE(prs.created_by_user_id, $3)
     FROM project_resources pr
     WHERE prs.id = $1
       AND prs.project_id = $2
       AND pr.id = prs.resource_id
     RETURNING
       prs.id,
       prs.project_id,
       prs.resource_id,
       pr.title AS resource_title,
       prs.share_key,
       prs.visibility,
       prs.duration,
       prs.expires_at::TEXT,
       prs.revoked_at::TEXT,
       prs.created_by_user_id,
       prs.created_at::TEXT,
       prs.updated_at::TEXT`,
    [
      normalizeString(input.shareId),
      normalizeString(input.projectId),
      normalizeString(input.actorUserId) || null,
      now,
    ],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('SHARE_NOT_FOUND')

  return mapProjectResourceShare(row)
}

export async function getActiveProjectResourceShareByKey(
  db: Queryable,
  input: { shareKey: string },
): Promise<ShareAccessRow | null> {
  const shareKey = normalizeString(input.shareKey)
  if (!shareKey)
    return null

  const result = await db.query<ShareAccessRow>(
    `SELECT
      prs.id,
      prs.project_id,
      prs.resource_id,
      prs.visibility,
      p.workspace_id
     FROM project_resource_shares prs
     JOIN project_resources pr
       ON pr.id = prs.resource_id
      AND pr.project_id = prs.project_id
     JOIN projects p
       ON p.id = prs.project_id
     WHERE prs.share_key = $1
       AND prs.revoked_at IS NULL
       AND prs.expires_at > NOW()
       AND pr.status = 'active'
     LIMIT 1`,
    [shareKey],
  )

  return result.rows[0] || null
}

export async function isActiveWorkspaceMember(
  db: Queryable,
  input: {
    workspaceId: string
    userId: string
  },
): Promise<boolean> {
  const workspaceId = normalizeString(input.workspaceId)
  const userId = normalizeString(input.userId)
  if (!workspaceId || !userId)
    return false

  const result = await db.query<{ has_member: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM workspace_members
      WHERE workspace_id = $1
        AND user_id = $2
        AND is_active = TRUE
    ) AS has_member`,
    [workspaceId, userId],
  )

  return Boolean(result.rows[0]?.has_member)
}
