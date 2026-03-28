import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, ProjectMemberRole, WorkspaceMemberRole, WorkspaceType } from '~~/shared/types/domain'

const FULL_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin']
const MANAGER_PROJECT_ROLES: ProjectMemberRole[] = ['owner', 'manager']

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
  const includedProjects = Number.isFinite(Number(workspace.included_projects))
    ? Math.max(0, Number(workspace.included_projects || 0))
    : (workspace.type === 'personal' ? 2 : 0)
  const projectsUnlimited = workspace.projects_unlimited === true
    ? true
    : workspace.type !== 'personal'
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
        AND wm.is_active = TRUE
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
        AND wm.is_active = TRUE
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
      FROM project_members pm
      WHERE pm.project_id = $1
        AND pm.user_id = $2
        AND pm.role = ANY($3::TEXT[])
    ) AS can_manage`,
    [projectId, user.id, MANAGER_PROJECT_ROLES],
  )

  return Boolean(memberRoleResult.rows[0]?.can_manage)
}
