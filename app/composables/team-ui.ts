import type {
  AuthMeResult,
  Contest,
  Project,
  ProjectMemberPreviewSummary,
  ProjectMemberRole,
  ProjectSource,
  WorkspaceWithQuota,
} from '../../shared/types/domain'
import {
  buildProjectMonogram,
  getProjectDisplayAccent,
  resolveProjectDisplayConfig,
} from '../../shared/constants/project-display'

export interface TeamProjectCardMemberItem extends ProjectMemberPreviewSummary {
  avatarFallback: string
  roleLabel: string
}

export interface TeamProjectCardItem {
  id: string
  teamId: string
  title: string
  status: string
  summary: string
  updatedAt: string
  contestNames: string[]
  contestSummary: string
  memberPreview: TeamProjectCardMemberItem[]
  memberCount: number
  seatSummaryText: string
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

export function formatPreciseDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value || '-'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

export function formatRelativeUpdatedAt(value: string, nowInput: number | Date = Date.now()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value || '-'

  const now = nowInput instanceof Date ? nowInput.getTime() : nowInput
  const diffSeconds = Math.max(0, Math.floor((now - date.getTime()) / 1000))
  if (diffSeconds < 60)
    return `${diffSeconds} 秒前更新`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60)
    return `${diffMinutes} 分钟前更新`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24)
    return `${diffHours} 小时前更新`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7)
    return `${diffDays} 天前更新`

  if (diffDays < 30)
    return `${Math.max(1, Math.floor(diffDays / 7))} 周前更新`

  if (diffDays < 60)
    return '1 个月前更新'

  const nowDate = new Date(now)
  if (date.getFullYear() === nowDate.getFullYear())
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日更新`

  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月更新`
}

export function formatProjectMemberRoleLabel(role: ProjectMemberRole): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  return '查看者'
}

export function resolveUserAvatarFallback(username: string): string {
  const normalized = String(username || '').trim()
  if (!normalized)
    return '??'

  const chineseChars = Array.from(normalized).filter(char => /[\u4E00-\u9FFF]/.test(char))
  if (chineseChars.length >= 2)
    return chineseChars.slice(0, 2).join('')
  if (chineseChars.length === 1)
    return chineseChars[0]

  const segments = normalized
    .split(/[\s_.-]+/)
    .map(item => item.trim())
    .filter(Boolean)
  if (segments.length >= 2)
    return `${segments[0][0] || ''}${segments[1][0] || ''}`.toUpperCase()

  const ascii = normalized.replace(/[^a-z0-9]/gi, '')
  if (ascii.length >= 2)
    return ascii.slice(0, 2).toUpperCase()
  if (ascii.length === 1)
    return ascii.toUpperCase()

  return Array.from(normalized).slice(0, 2).join('').toUpperCase()
}

export function formatProjectContestSummary(contestNames: string[]): string {
  if (contestNames.length === 0)
    return '暂未绑定比赛'
  if (contestNames.length === 1)
    return contestNames[0]
  return `${contestNames[0]} +${contestNames.length - 1} 个比赛`
}

export function formatProjectSeatSummary(
  seatUsed?: number,
  seatLimit?: number,
  fallbackCount = 0,
): string {
  const normalizedSeatUsed = Math.max(0, Number(seatUsed || 0))
  const normalizedSeatLimit = Math.max(0, Number(seatLimit || 0))
  if (normalizedSeatLimit > 0)
    return `${normalizedSeatUsed}/${normalizedSeatLimit} 席位`
  return `${Math.max(0, fallbackCount)} 个席位`
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
  const memberPreview = Array.isArray(project.memberPreview)
    ? project.memberPreview.map(member => ({
        ...member,
        avatarFallback: resolveUserAvatarFallback(member.username),
        roleLabel: formatProjectMemberRoleLabel(member.role),
      }))
    : []

  return {
    id: project.id,
    teamId,
    title: project.title,
    status: project.status,
    summary: project.summary || project.problemStatement || '待补充',
    updatedAt: project.updatedAt,
    contestNames,
    contestSummary: formatProjectContestSummary(contestNames),
    memberPreview,
    memberCount: memberPreview.length,
    seatSummaryText: formatProjectSeatSummary(seatUsed, seatLimit, memberPreview.length),
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
