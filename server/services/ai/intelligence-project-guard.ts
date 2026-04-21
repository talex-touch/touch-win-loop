import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, Project } from '~~/shared/types/domain'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'

export async function getManageableIntelligenceProject(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<Project> {
  const project = await getVisibleProjectById(db, user, projectId)
  if (!project)
    throw new Error('PROJECT_NOT_FOUND')

  const manageable = await teamCanManageProject(db, user, projectId)
  if (!manageable)
    throw new Error('FORBIDDEN')

  return project
}
