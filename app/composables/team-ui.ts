import type { AuthMeResult, Contest, Project, ProjectSource, WorkspaceWithQuota } from '~~/shared/types/domain'
import {
  buildProjectMonogram,
  getProjectDisplayAccent,
  resolveProjectDisplayConfig,
} from '~~/shared/constants/project-display'

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
  projectSeatUsed?: number
  projectSeatLimit?: number
  projectSeatRemaining?: number
  seatProgressPercent?: number
  displayIcon: string
  displayMonogram: string
  accentSolid: string
  accentSoft: string
  accentBorder: string
  accentText: string
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

export function teamDashboardPath(): string {
  return '/team'
}

export function teamDetailPath(teamId: string): string {
  return `/team/${teamId}`
}

export function projectWorkspacePath(teamId: string, projectId: string): string {
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

export function formatWorkspaceTypeLabel(type: WorkspaceWithQuota['workspace']['type'] | '' | undefined): string {
  if (type === 'personal')
    return '个人项目台'
  if (type === 'team')
    return 'Team 项目台'
  return '项目台'
}

export function formatPlanLabel(planCode: string | null | undefined, planTier: string | null | undefined): string {
  const normalizedCode = String(planCode || '').trim()
  if (normalizedCode)
    return normalizedCode

  if (planTier === 'personal_team')
    return 'personal_team'
  if (planTier === 'business_team')
    return 'business_team'
  return '未配置'
}

export function calculateRemainingProjectSlots(input: {
  projectsUnlimited?: boolean | null
  includedProjects?: number | null
  extraProjectSlots?: number | null
  projectCount?: number | null
}): number | null {
  if (input.projectsUnlimited)
    return null
  if (
    input.includedProjects === undefined
    && input.extraProjectSlots === undefined
    && input.projectCount === undefined
  ) {
    return null
  }

  const includedProjects = Math.max(0, Number(input.includedProjects || 0))
  const extraProjectSlots = Math.max(0, Number(input.extraProjectSlots || 0))
  const projectCount = Math.max(0, Number(input.projectCount || 0))
  return Math.max(0, includedProjects + extraProjectSlots - projectCount)
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

  const seatLimit = Math.max(0, Number(project.projectSeatQuota?.seatLimit || 0))
  const seatUsed = Math.max(0, Number(project.projectSeatQuota?.seatUsed || 0))
  const display = resolveProjectDisplayConfig(project.display, `${project.id}:${project.title}`)
  const accent = getProjectDisplayAccent(display.accentColor)

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
    projectSeatUsed: seatLimit > 0 ? seatUsed : undefined,
    projectSeatLimit: seatLimit > 0 ? seatLimit : undefined,
    projectSeatRemaining: seatLimit > 0 ? Math.max(0, seatLimit - seatUsed) : undefined,
    seatProgressPercent: seatLimit > 0 ? Math.max(0, Math.min(100, Math.round((seatUsed / seatLimit) * 100))) : undefined,
    displayIcon: display.icon,
    displayMonogram: buildProjectMonogram(project.title),
    accentSolid: accent.solid,
    accentSoft: accent.soft,
    accentBorder: accent.border,
    accentText: accent.text,
  }
}
