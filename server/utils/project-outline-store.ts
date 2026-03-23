import type { Queryable } from '~~/server/utils/db'
import type { ProjectOutlineNode, ProjectOutlineSnapshot } from '~~/shared/types/domain'

interface ProjectOutlineRow {
  project_id: string
  context_json: Record<string, unknown>
  payload_json: Record<string, unknown>
  reason: string
  updated_at: string
}

interface ProjectOutlineContext {
  contestId: string
  trackId: string
  major: string
  discipline: string
  level: string
  trackType: string
}

interface ProjectOutlinePayload {
  items: ProjectOutlineNode[]
  generatedAt: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toOutlineContext(value: unknown): ProjectOutlineContext {
  const source = normalizeRecord(value)
  return {
    contestId: normalizeString(source.contestId),
    trackId: normalizeString(source.trackId),
    major: normalizeString(source.major),
    discipline: normalizeString(source.discipline),
    level: normalizeString(source.level),
    trackType: normalizeString(source.trackType),
  }
}

function normalizeNode(value: unknown): ProjectOutlineNode | null {
  const source = normalizeRecord(value)
  const id = normalizeString(source.id)
  const title = normalizeString(source.title)
  if (!id || !title)
    return null

  const childrenInput = Array.isArray(source.children) ? source.children : []
  const children = childrenInput.map(normalizeNode).filter(Boolean) as ProjectOutlineNode[]

  const sourceResourceIds = Array.isArray(source.sourceResourceIds)
    ? source.sourceResourceIds.map(item => normalizeString(item)).filter(Boolean)
    : []

  return {
    id,
    title,
    level: Number.isFinite(Number(source.level)) ? Number(source.level) : 0,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    sourceResourceIds,
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : 0,
    children,
  }
}

function toOutlinePayload(value: unknown): ProjectOutlinePayload {
  const source = normalizeRecord(value)
  const itemsInput = Array.isArray(source.items) ? source.items : []
  const items = itemsInput.map(normalizeNode).filter(Boolean) as ProjectOutlineNode[]
  const generatedAt = normalizeString(source.generatedAt)

  return {
    items,
    generatedAt: generatedAt || new Date(0).toISOString(),
  }
}

function mapSnapshot(row: ProjectOutlineRow): ProjectOutlineSnapshot {
  const context = toOutlineContext(row.context_json)
  const payload = toOutlinePayload(row.payload_json)

  return {
    projectId: row.project_id,
    context,
    items: payload.items,
    generatedAt: payload.generatedAt === new Date(0).toISOString() ? row.updated_at : payload.generatedAt,
    reason: normalizeString(row.reason),
  }
}

export async function getProjectOutlineSnapshot(
  db: Queryable,
  projectId: string,
): Promise<ProjectOutlineSnapshot | null> {
  const result = await db.query<ProjectOutlineRow>(
    `SELECT
      project_id,
      context_json,
      payload_json,
      reason,
      updated_at::TEXT
     FROM project_outline_snapshots
     WHERE project_id = $1
     LIMIT 1`,
    [projectId],
  )

  const row = result.rows[0]
  return row ? mapSnapshot(row) : null
}

export async function upsertProjectOutlineSnapshot(
  db: Queryable,
  input: {
    projectId: string
    context: ProjectOutlineSnapshot['context']
    items: ProjectOutlineNode[]
    generatedAt: string
    reason: string
  },
): Promise<ProjectOutlineSnapshot> {
  const payload = {
    items: input.items,
    generatedAt: normalizeString(input.generatedAt) || new Date().toISOString(),
  }

  const result = await db.query<ProjectOutlineRow>(
    `INSERT INTO project_outline_snapshots (
      project_id,
      context_json,
      payload_json,
      reason,
      updated_at
    ) VALUES (
      $1,
      $2::JSONB,
      $3::JSONB,
      $4,
      NOW()
    )
    ON CONFLICT (project_id)
    DO UPDATE SET
      context_json = EXCLUDED.context_json,
      payload_json = EXCLUDED.payload_json,
      reason = EXCLUDED.reason,
      updated_at = NOW()
    RETURNING
      project_id,
      context_json,
      payload_json,
      reason,
      updated_at::TEXT`,
    [
      input.projectId,
      JSON.stringify(input.context),
      JSON.stringify(payload),
      normalizeString(input.reason),
    ],
  )

  return mapSnapshot(result.rows[0]!)
}
