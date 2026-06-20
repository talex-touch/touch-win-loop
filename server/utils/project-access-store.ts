import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, ProjectMemberRole, WorkspaceMemberRole, WorkspaceType } from '~~/shared/types/domain'

const FULL_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin']
const MANAGER_PROJECT_ROLES: ProjectMemberRole[] = ['owner', 'manager']
const ANY_PROJECT_ROLES: ProjectMemberRole[] = ['owner', 'manager', 'editor', 'viewer']

export async function teamAssertProjectCreationAllowed(
  db: Queryable,
  workspaceId: string,
): Promise<void> {
  const workspaceResult = await db.query<{
    type: WorkspaceType
    included_projects: number | null
    projects_unlimited: boolean | null
    extra_project_slots: number | null
  }>(
    `SELECT
      w.type,
      bp.included_projects,
      bp.projects_unlimited,
      wb.extra_project_slots
     FROM workspaces w
     LEFT JOIN workspace_billing wb ON wb.workspace_id = w.id
     LEFT JOIN billing_plans bp ON bp.id = wb.plan_id
     WHERE w.id = $1
     LIMIT 1`,
    [workspaceId],
  )

  const workspace = workspaceResult.rows[0]
  if (!workspace)
    throw new Error('WORKSPACE_NOT_FOUND')

  const projectCountResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM projects
     WHERE workspace_id = $1`,
    [workspaceId],
  )

  const projectCount = Math.max(0, Number(projectCountResult.rows[0]?.count || '0'))
  const includedProjects = workspace.included_projects === null
    ? 0
    : Math.max(0, Number(workspace.included_projects || 0))
  const projectsUnlimited = workspace.projects_unlimited === null
    ? true
    : workspace.projects_unlimited === true
  const extraProjectSlots = Math.max(0, Number(workspace.extra_project_slots || 0))
  const allowedProjects = includedProjects + extraProjectSlots

  if (!projectsUnlimited && projectCount >= allowedProjects)
    throw new Error('WORKSPACE_PROJECT_LIMIT_REACHED')
}

export async function teamCanManageProject(db: Queryable, user: AuthUser, projectId: string): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const ownerAdminResult = await db.query<{ can_manage: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = $1
        AND wm.user_id = $2
        AND wm.is_enabled = TRUE
        AND wm.role = ANY($3::TEXT[])
    ) AS can_manage`,
    [projectId, user.id, FULL_WORKSPACE_ROLES],
  )

  if (ownerAdminResult.rows[0]?.can_manage)
    return true

  const scopedManagerResult = await db.query<{ can_manage: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1
        AND wm.user_id = $2
        AND wm.is_enabled = TRUE
        AND wm.role = 'manager'
        AND pm.user_id = $2
    ) AS can_manage`,
    [projectId, user.id],
  )

  if (scopedManagerResult.rows[0]?.can_manage)
    return true

  const memberRoleResult = await db.query<{ can_manage: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1
        AND wm.user_id = $2
        AND wm.is_enabled = TRUE
        AND pm.user_id = $2
        AND pm.role = ANY($3::TEXT[])
    ) AS can_manage`,
    [projectId, user.id, MANAGER_PROJECT_ROLES],
  )

  return Boolean(memberRoleResult.rows[0]?.can_manage)
}

export async function teamCanImportCanvasLibraryToProject(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<boolean> {
  if (user.isPlatformAdmin)
    return true

  const result = await db.query<{ can_import: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = $1
        AND EXISTS (
          SELECT 1
          FROM workspace_members wm_visible
          WHERE wm_visible.workspace_id = p.workspace_id
            AND wm_visible.user_id = $2
            AND wm_visible.is_enabled = TRUE
        )
        AND (
          EXISTS (
            SELECT 1
            FROM workspace_members wm
            WHERE wm.workspace_id = p.workspace_id
              AND wm.user_id = $2
              AND wm.is_enabled = TRUE
              AND wm.role = ANY($3::TEXT[])
          )
          OR EXISTS (
            SELECT 1
            FROM workspace_members wm
            JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
            WHERE wm.workspace_id = p.workspace_id
              AND wm.user_id = $2
              AND wm.is_enabled = TRUE
              AND pm.role = ANY($4::TEXT[])
          )
        )
    ) AS can_import`,
    [projectId, user.id, FULL_WORKSPACE_ROLES, ANY_PROJECT_ROLES],
  )

  return Boolean(result.rows[0]?.can_import)
}
