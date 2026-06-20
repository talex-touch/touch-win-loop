import type { Queryable } from '~~/server/utils/db'
import type { AuthUser } from '~~/shared/types/domain'

interface ProjectRealtimeAccessRow {
  workspace_id: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export async function resolveProjectRealtimeAccess(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<{ projectId: string, workspaceId: string } | null> {
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedProjectId)
    return null

  const projectResult = await db.query<ProjectRealtimeAccessRow>(
    `SELECT workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [normalizedProjectId],
  )

  const workspaceId = normalizeString(projectResult.rows[0]?.workspace_id)
  if (!workspaceId)
    return null

  if (user.isPlatformAdmin) {
    return {
      projectId: normalizedProjectId,
      workspaceId,
    }
  }

  const membershipResult = await db.query<{ allowed: boolean }>(
    `SELECT (
      EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE wm.workspace_id = $1
          AND wm.user_id = $2
          AND wm.is_enabled = TRUE
          AND wm.role = ANY($4::TEXT[])
      )
      OR EXISTS (
        SELECT 1
        FROM workspace_members wm
        JOIN project_members pm ON pm.project_id = $3 AND pm.user_id = wm.user_id
        WHERE wm.workspace_id = $1
          AND wm.user_id = $2
          AND wm.is_enabled = TRUE
          AND wm.role = ANY($5::TEXT[])
      )
    ) AS allowed`,
    [workspaceId, user.id, normalizedProjectId, ['owner', 'admin'], ['manager', 'member']],
  )

  if (!membershipResult.rows[0]?.allowed)
    return null

  return {
    projectId: normalizedProjectId,
    workspaceId,
  }
}
