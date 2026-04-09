import type { RecordBillingUsageEventInput } from '~~/server/utils/billing-usage-store'
import type { Queryable } from '~~/server/utils/db'
import { recordBillingUsageEvent } from '~~/server/utils/billing-usage-store'

interface ProjectBillingScopeRow {
  id: string
  workspace_id: string
  contest_id: string | null
  track_id: string | null
}

export interface ProjectBillingScope {
  projectId: string
  workspaceId: string
  contestId: string | null
  trackId: string | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message || 'UNKNOWN_ERROR'
  return String(error || 'UNKNOWN_ERROR')
}

export function resolveBillingSourceRoute(value: unknown, fallback = ''): string {
  return normalizeString(value) || normalizeString(fallback)
}

export async function getProjectBillingScopeById(
  db: Queryable,
  projectId: string,
): Promise<ProjectBillingScope | null> {
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedProjectId)
    return null

  const result = await db.query<ProjectBillingScopeRow>(
    `SELECT
      id,
      workspace_id,
      contest_id,
      track_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [normalizedProjectId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  return {
    projectId: row.id,
    workspaceId: normalizeString(row.workspace_id),
    contestId: normalizeString(row.contest_id) || null,
    trackId: normalizeString(row.track_id) || null,
  }
}

export async function recordBillingUsageEventSafely(
  db: Queryable,
  input: RecordBillingUsageEventInput,
): Promise<void> {
  const workspaceId = normalizeString(input.workspaceId)
  if (!workspaceId)
    return

  try {
    await recordBillingUsageEvent(db, {
      ...input,
      workspaceId,
    })
  }
  catch (error) {
    console.error('[billing-usage] record failed:', {
      workspaceId,
      projectId: normalizeString(input.projectId) || null,
      eventCode: input.eventCode,
      result: input.result,
      error: toErrorMessage(error),
    })
  }
}
