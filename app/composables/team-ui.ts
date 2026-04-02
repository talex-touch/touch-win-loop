import type { AuthMeResult, Contest, Project, ProjectSource, WorkspaceWithQuota } from '~~/shared/types/domain'

export interface TeamProjectCardItem {
  id: string
  teamId: string
  title: string
  status: string
  summary: string
  updatedAt: string
  contestNames: string[]
  teamName?: string
  teamType?: string
  source?: ProjectSource
}

export function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

export function normalizeRouteParam(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

export function shouldOpenCreateDialog(value: unknown): boolean {
  const text = normalizeQueryValue(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes'
}

export function teamDetailPath(teamId: string): string {
  return `/team/${teamId}`
}

export function teamProjectPath(teamId: string, projectId: string): string {
  return `/team/${teamId}/project/${projectId}`
}

export function resolveWorkspaceOptions(auth: Pick<AuthMeResult, 'teams' | 'workspaces'> | null): WorkspaceWithQuota[] {
  if (!auth)
    return []

  if (Array.isArray(auth.teams) && auth.teams.length > 0) {
    return auth.teams.map(item => ({
      workspace: item.team,
      quota: item.quota,
    }))
  }

  return Array.isArray(auth.workspaces) ? auth.workspaces : []
}

export function resolveDefaultTeamId(auth: AuthMeResult | null, preferredTeamId: string): string {
  if (!auth)
    return ''

  const options = resolveWorkspaceOptions(auth)
  const preferred = normalizeQueryValue(preferredTeamId)
  if (preferred && options.some(item => item.workspace.id === preferred))
    return preferred

  const firstTeam = options.find(item => item.workspace.type === 'team')
  if (firstTeam)
    return firstTeam.workspace.id

  const personal = options.find(item => item.workspace.type === 'personal' && item.workspace.ownerUserId === auth.user.id)
  return personal?.workspace.id || options[0]?.workspace.id || ''
}

export function resolveProjectTeamId(project: Pick<Project, 'teamId' | 'workspaceId'>): string {
  return String(project.teamId || project.workspaceId || '').trim()
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value || '-'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function buildContestNameMap(contests: Contest[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of contests)
    map.set(item.id, item.name)
  return map
}

function resolveProjectContestIds(project: Pick<Project, 'contestIds' | 'contestId'>): string[] {
  if (Array.isArray(project.contestIds) && project.contestIds.length > 0)
    return project.contestIds
  return project.contestId ? [project.contestId] : []
}

export function buildTeamProjectCard(
  project: Project,
  contestNameMap: Map<string, string>,
  workspace?: WorkspaceWithQuota,
): TeamProjectCardItem {
  const teamId = resolveProjectTeamId(project)
  const contestNames = resolveProjectContestIds(project)
    .map(contestId => contestNameMap.get(contestId) || contestId)

  return {
    id: project.id,
    teamId,
    title: project.title,
    status: project.status,
    summary: project.summary || project.problemStatement || '待补充',
    updatedAt: project.updatedAt,
    contestNames,
    teamName: workspace?.workspace.name || teamId || undefined,
    teamType: workspace?.workspace.type || undefined,
    source: project.source,
  }
}
