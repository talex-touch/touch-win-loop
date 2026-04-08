import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  PlatformPermission,
  ProjectMemberRole,
  UserNotification,
  UserNotificationCategory,
  UserNotificationListResult,
  UserNotificationType,
  WorkspaceMemberRole,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { getContestDetail, resolvePlatformAccess } from '~~/server/utils/contest-store'
import { listVisibleProjects } from '~~/server/utils/platform-store'

const FULL_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin']
const MANAGE_WORKSPACE_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']
const MANAGE_PROJECT_ROLES: ProjectMemberRole[] = ['owner', 'manager']
const CONTEST_REMINDER_DAYS = new Set([1, 3, 7])

interface UserNotificationRow {
  id: string
  user_id: string
  workspace_id: string | null
  project_id: string | null
  category: UserNotificationCategory
  type: UserNotificationType
  title: string
  body: string
  action_url: string | null
  action_label: string | null
  actor_user_id: string | null
  payload: Record<string, unknown> | null
  dedupe_key: string
  read_at: string | null
  created_at: string
  expires_at: string | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function dedupeStrings(items: Array<string | null | undefined>): string[] {
  return Array.from(new Set(items.map(item => normalizeString(item)).filter(Boolean)))
}

function parseDateOnly(value: string): Date | null {
  const normalized = normalizeString(value)
  if (!normalized)
    return null
  const parsed = new Date(`${normalized}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime()))
    return null
  return parsed
}

function formatDateOnlyInShanghai(value: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(value)
}

function startOfTodayInShanghai(): Date {
  return parseDateOnly(formatDateOnlyInShanghai(new Date())) || new Date()
}

function diffDaysFromToday(date: Date): number {
  const today = startOfTodayInShanghai()
  return Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

function roleLabel(role: ProjectMemberRole | WorkspaceMemberRole | '' | null | undefined): string {
  if (role === 'owner')
    return 'owner'
  if (role === 'admin')
    return 'admin'
  if (role === 'manager')
    return 'manager'
  if (role === 'editor')
    return 'editor'
  if (role === 'viewer')
    return 'viewer'
  if (role === 'member')
    return 'member'
  return '-'
}

function teamDetailPath(workspaceId: string): string {
  return `/team/${encodeURIComponent(workspaceId)}`
}

function projectWorkspacePath(workspaceId: string, projectId: string): string {
  return `/team/${encodeURIComponent(workspaceId)}/project/${encodeURIComponent(projectId)}`
}

function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`
}

function mapUserNotification(row: UserNotificationRow): UserNotification {
  return {
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    category: row.category,
    type: row.type,
    title: row.title,
    body: row.body,
    actionUrl: row.action_url,
    actionLabel: row.action_label,
    actorUserId: row.actor_user_id,
    payload: normalizeObject(row.payload),
    dedupeKey: row.dedupe_key,
    readAt: row.read_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

function encodeNotificationCursor(item: Pick<UserNotification, 'id' | 'createdAt'>): string {
  return Buffer.from(JSON.stringify({
    id: item.id,
    createdAt: item.createdAt,
  }), 'utf8').toString('base64url')
}

function decodeNotificationCursor(cursor: string): { id: string, createdAt: string } | null {
  const normalized = normalizeString(cursor)
  if (!normalized)
    return null

  try {
    const parsed = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf8')) as Record<string, unknown>
    const id = normalizeString(parsed.id)
    const createdAt = normalizeString(parsed.createdAt)
    if (!id || !createdAt)
      return null
    return { id, createdAt }
  }
  catch {
    return null
  }
}

function buildWorkspaceScopeClause(workspaceId: string, params: unknown[]): string {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  if (!normalizedWorkspaceId)
    return ''

  params.push(normalizedWorkspaceId)
  const placeholder = `$${params.length}`
  return `AND (n.workspace_id = ${placeholder} OR (n.workspace_id IS NULL AND n.category = 'platform'))`
}

async function resolveUserIdByUsername(db: Queryable, username: string): Promise<string> {
  const normalizedUsername = normalizeString(username)
  if (!normalizedUsername)
    return ''

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE username = $1
       AND is_disabled = FALSE
     LIMIT 1`,
    [normalizedUsername],
  )

  return normalizeString(result.rows[0]?.id)
}

async function resolveWorkspaceInfo(db: Queryable, workspaceId: string): Promise<{ workspaceId: string, workspaceName: string }> {
  const result = await db.query<{ id: string, name: string }>(
    `SELECT id, name
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId],
  )

  return {
    workspaceId: normalizeString(result.rows[0]?.id),
    workspaceName: normalizeString(result.rows[0]?.name) || '项目台',
  }
}

async function resolveProjectInfo(
  db: Queryable,
  projectId: string,
): Promise<{ projectId: string, workspaceId: string, projectTitle: string, workspaceName: string }> {
  const result = await db.query<{ id: string, workspace_id: string, title: string, workspace_name: string }>(
    `SELECT p.id, p.workspace_id, p.title, w.name AS workspace_name
     FROM projects p
     JOIN workspaces w ON w.id = p.workspace_id
     WHERE p.id = $1
     LIMIT 1`,
    [projectId],
  )

  return {
    projectId: normalizeString(result.rows[0]?.id),
    workspaceId: normalizeString(result.rows[0]?.workspace_id),
    projectTitle: normalizeString(result.rows[0]?.title) || '未命名项目',
    workspaceName: normalizeString(result.rows[0]?.workspace_name) || '项目台',
  }
}

async function resolveUsernameByUserId(db: Queryable, userId: string): Promise<string> {
  const normalizedUserId = normalizeString(userId)
  if (!normalizedUserId)
    return ''

  const result = await db.query<{ username: string }>(
    `SELECT username
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [normalizedUserId],
  )

  return normalizeString(result.rows[0]?.username)
}

async function listWorkspaceManagerUserIds(db: Queryable, workspaceId: string): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(
    `SELECT DISTINCT user_id
     FROM workspace_members
     WHERE workspace_id = $1
       AND is_enabled = TRUE
       AND role = ANY($2::TEXT[])`,
    [workspaceId, MANAGE_WORKSPACE_ROLES],
  )

  return dedupeStrings(result.rows.map(row => row.user_id))
}

async function listProjectManagerUserIds(db: Queryable, projectId: string): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(
    `SELECT DISTINCT wm.user_id
     FROM projects p
     JOIN workspace_members wm ON wm.workspace_id = p.workspace_id AND wm.is_enabled = TRUE
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = wm.user_id
     WHERE p.id = $1
       AND (
         wm.role = ANY($2::TEXT[])
         OR (wm.role = 'manager' AND pm.user_id IS NOT NULL)
         OR pm.role = ANY($3::TEXT[])
       )`,
    [projectId, FULL_WORKSPACE_ROLES, MANAGE_PROJECT_ROLES],
  )

  return dedupeStrings(result.rows.map(row => row.user_id))
}

export async function createUserNotification(
  db: Queryable,
  input: {
    userId: string
    workspaceId?: string | null
    projectId?: string | null
    category: UserNotificationCategory
    type: UserNotificationType
    title: string
    body?: string
    actionUrl?: string | null
    actionLabel?: string | null
    actorUserId?: string | null
    payload?: Record<string, unknown>
    dedupeKey: string
    createdAt?: string | null
    expiresAt?: string | null
  },
): Promise<boolean> {
  const notificationId = randomUUID()
  const createdAt = normalizeString(input.createdAt) || new Date().toISOString()

  const result = await db.query(
    `INSERT INTO user_notifications (
      id,
      user_id,
      workspace_id,
      project_id,
      category,
      type,
      title,
      body,
      action_url,
      action_label,
      actor_user_id,
      payload,
      dedupe_key,
      expires_at,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB, $13, $14, $15
    )
    ON CONFLICT (user_id, dedupe_key) DO NOTHING`,
    [
      notificationId,
      input.userId,
      normalizeString(input.workspaceId) || null,
      normalizeString(input.projectId) || null,
      input.category,
      input.type,
      normalizeString(input.title),
      normalizeString(input.body),
      normalizeString(input.actionUrl) || null,
      normalizeString(input.actionLabel) || null,
      normalizeString(input.actorUserId) || null,
      JSON.stringify(normalizeObject(input.payload)),
      normalizeString(input.dedupeKey),
      normalizeString(input.expiresAt) || null,
      createdAt,
    ],
  )

  return (result.rowCount || 0) > 0
}

export async function ensureContestDeadlineNotifications(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  if (!normalizedWorkspaceId)
    return

  const visibleProjects = await listVisibleProjects(db, user, normalizedWorkspaceId)
  if (visibleProjects.length === 0)
    return

  const platformAccess = await resolvePlatformAccess(db, user)
  const includeInternal = user.isPlatformAdmin || platformAccess.permissions.includes('contest.read_internal' as PlatformPermission)
  const projectTitlesByContestId = new Map<string, Set<string>>()

  for (const project of visibleProjects) {
    const contestIds = Array.isArray(project.contestIds) && project.contestIds.length > 0
      ? project.contestIds
      : [project.contestId]
    for (const contestId of contestIds.map(item => normalizeString(item)).filter(Boolean)) {
      const bucket = projectTitlesByContestId.get(contestId) || new Set<string>()
      bucket.add(normalizeString(project.title) || '未命名项目')
      projectTitlesByContestId.set(contestId, bucket)
    }
  }

  for (const [contestId, projectTitleSet] of projectTitlesByContestId.entries()) {
    const detail = await getContestDetail(db, {
      contestId,
      includeInternal,
    })
    const contest = detail?.contest
    if (!contest?.submissionDeadline)
      continue

    const deadlineDate = parseDateOnly(contest.submissionDeadline)
    if (!deadlineDate)
      continue

    const daysLeft = diffDaysFromToday(deadlineDate)
    if (!CONTEST_REMINDER_DAYS.has(daysLeft))
      continue

    const projectTitles = Array.from(projectTitleSet).slice(0, 3)
    const extraCount = Math.max(0, projectTitleSet.size - projectTitles.length)
    const projectText = projectTitles.length > 0
      ? `${projectTitles.join('、')}${extraCount > 0 ? ` 等 ${projectTitleSet.size} 个项目` : ''}`
      : '当前项目'

    await createUserNotification(db, {
      userId: user.id,
      workspaceId: normalizedWorkspaceId,
      category: 'contest',
      type: 'contest.deadline_reminder',
      title: `${contest.name} 将在 ${daysLeft} 天后截止`,
      body: `关联项目：${projectText} · 提交截止：${contest.submissionDeadline}`,
      actionUrl: `/contests/${encodeURIComponent(contest.id)}`,
      actionLabel: '查看赛事',
      payload: {
        contestId: contest.id,
        contestName: contest.name,
        submissionDeadline: contest.submissionDeadline,
        daysLeft,
        projectTitles: Array.from(projectTitleSet),
      },
      dedupeKey: `contest-deadline:${normalizedWorkspaceId}:${contest.id}:${daysLeft}`,
      expiresAt: new Date(deadlineDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
  }
}

export async function listUserNotifications(
  db: Queryable,
  input: {
    userId: string
    workspaceId?: string
    limit?: number
    cursor?: string
  },
): Promise<UserNotificationListResult> {
  const normalizedUserId = normalizeString(input.userId)
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20)))
  const params: unknown[] = [normalizedUserId]
  const workspaceClause = buildWorkspaceScopeClause(input.workspaceId || '', params)
  const parsedCursor = decodeNotificationCursor(input.cursor || '')
  let cursorClause = ''

  if (parsedCursor) {
    params.push(parsedCursor.createdAt)
    params.push(parsedCursor.id)
    const createdAtIndex = params.length - 1
    const idIndex = params.length
    cursorClause = `AND (
      n.created_at < $${createdAtIndex}::TIMESTAMPTZ
      OR (n.created_at = $${createdAtIndex}::TIMESTAMPTZ AND n.id < $${idIndex})
    )`
  }

  params.push(limit + 1)
  const result = await db.query<UserNotificationRow>(
    `SELECT
      n.id,
      n.user_id,
      n.workspace_id,
      n.project_id,
      n.category,
      n.type,
      n.title,
      n.body,
      n.action_url,
      n.action_label,
      n.actor_user_id,
      n.payload,
      n.dedupe_key,
      n.read_at::TEXT,
      n.created_at::TEXT,
      n.expires_at::TEXT
     FROM user_notifications n
     WHERE n.user_id = $1
       AND n.created_at <= NOW()
       AND (n.expires_at IS NULL OR n.expires_at > NOW())
       ${workspaceClause}
       ${cursorClause}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $${params.length}`,
    params,
  )

  const items = result.rows.slice(0, limit).map(mapUserNotification)
  const nextCursor = result.rows.length > limit
    ? encodeNotificationCursor(items[items.length - 1]!)
    : ''

  const unreadParams: unknown[] = [normalizedUserId]
  const unreadWorkspaceClause = buildWorkspaceScopeClause(input.workspaceId || '', unreadParams)
  const unreadResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM user_notifications n
     WHERE n.user_id = $1
       AND n.read_at IS NULL
       AND n.created_at <= NOW()
       AND (n.expires_at IS NULL OR n.expires_at > NOW())
       ${unreadWorkspaceClause}`,
    unreadParams,
  )

  return {
    items,
    unreadCount: Math.max(0, Number(unreadResult.rows[0]?.count || '0')),
    nextCursor,
  }
}

export async function markUserNotificationRead(
  db: Queryable,
  input: {
    userId: string
    notificationId: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE user_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1
       AND user_id = $2`,
    [input.notificationId, input.userId],
  )

  return (result.rowCount || 0) > 0
}

export async function markAllUserNotificationsRead(
  db: Queryable,
  input: {
    userId: string
    workspaceId?: string
  },
): Promise<number> {
  const params: unknown[] = [normalizeString(input.userId)]
  const workspaceClause = buildWorkspaceScopeClause(input.workspaceId || '', params)
  const result = await db.query(
    `UPDATE user_notifications n
     SET read_at = COALESCE(n.read_at, NOW())
     WHERE n.user_id = $1
       AND n.read_at IS NULL
       AND n.created_at <= NOW()
       AND (n.expires_at IS NULL OR n.expires_at > NOW())
       ${workspaceClause}`,
    params,
  )

  return result.rowCount || 0
}

export async function publishPlatformAnnouncement(
  db: Queryable,
  input: {
    actorUser: AuthUser
    scope: 'global' | 'workspace'
    workspaceId?: string | null
    title: string
    summary?: string
    body: string
    actionUrl?: string | null
    effectiveAt?: string | null
    expiresAt?: string | null
  },
): Promise<number> {
  const announcementId = randomUUID()
  const effectiveAt = normalizeString(input.effectiveAt) || new Date().toISOString()
  const normalizedWorkspaceId = input.scope === 'workspace' ? normalizeString(input.workspaceId) : ''
  if (input.scope === 'workspace' && !normalizedWorkspaceId)
    throw new Error('WORKSPACE_ID_REQUIRED')
  if (normalizedWorkspaceId) {
    const workspaceInfo = await resolveWorkspaceInfo(db, normalizedWorkspaceId)
    if (!workspaceInfo.workspaceId)
      throw new Error('WORKSPACE_NOT_FOUND')
  }

  const recipientResult = input.scope === 'workspace' && normalizedWorkspaceId
    ? await db.query<{ user_id: string }>(
        `SELECT DISTINCT user_id
         FROM workspace_members
         WHERE workspace_id = $1
           AND is_enabled = TRUE`,
        [normalizedWorkspaceId],
      )
    : await db.query<{ id: string }>(
        `SELECT id
         FROM users
         WHERE is_disabled = FALSE`,
      )

  const recipientUserIds = input.scope === 'workspace' && normalizedWorkspaceId
    ? dedupeStrings(recipientResult.rows.map(row => ('user_id' in row ? row.user_id : '')))
    : dedupeStrings(recipientResult.rows.map(row => ('id' in row ? row.id : '')))

  let deliveredCount = 0
  for (const recipientUserId of recipientUserIds) {
    const inserted = await createUserNotification(db, {
      userId: recipientUserId,
      workspaceId: normalizedWorkspaceId || null,
      category: 'platform',
      type: 'platform.announcement',
      title: normalizeString(input.title),
      body: normalizeString(input.summary) || normalizeString(input.body),
      actionUrl: normalizeString(input.actionUrl) || null,
      actionLabel: normalizeString(input.actionUrl) ? '查看详情' : null,
      actorUserId: input.actorUser.id,
      payload: {
        scope: input.scope,
        workspaceId: normalizedWorkspaceId || null,
        summary: normalizeString(input.summary),
        fullBody: normalizeString(input.body),
      },
      dedupeKey: `platform-announcement:${announcementId}`,
      createdAt: effectiveAt,
      expiresAt: normalizeString(input.expiresAt) || null,
    })
    if (inserted)
      deliveredCount += 1
  }

  return deliveredCount
}

export async function emitInvitationCreatedNotifications(
  db: Queryable,
  input: {
    actorUser: AuthUser
    workspaceId: string
    projectId?: string | null
    inviteeUsername?: string | null
    workspaceRole?: WorkspaceMemberRole | null
    projectRole?: ProjectMemberRole | null
    expiresAt: string
    token: string
  },
): Promise<void> {
  const normalizedProjectId = normalizeString(input.projectId)
  const workspaceInfo = await resolveWorkspaceInfo(db, input.workspaceId)
  const projectInfo = normalizedProjectId ? await resolveProjectInfo(db, normalizedProjectId) : null
  const managerUserIds = projectInfo
    ? await listProjectManagerUserIds(db, projectInfo.projectId)
    : await listWorkspaceManagerUserIds(db, workspaceInfo.workspaceId)
  const targetUserId = await resolveUserIdByUsername(db, input.inviteeUsername || '')
  const targetActionUrl = invitePath(input.token)

  if (targetUserId && targetUserId !== input.actorUser.id) {
    await createUserNotification(db, {
      userId: targetUserId,
      workspaceId: workspaceInfo.workspaceId,
      projectId: projectInfo?.projectId || null,
      category: 'collab',
      type: projectInfo ? 'project.invitation.created' : 'workspace.invitation.created',
      title: projectInfo
        ? `你被邀请加入项目「${projectInfo.projectTitle}」`
        : `你被邀请加入「${workspaceInfo.workspaceName}」`,
      body: projectInfo
        ? `发起人：${input.actorUser.username} · 项目角色：${roleLabel(input.projectRole)} · 有效期至：${input.expiresAt}`
        : `发起人：${input.actorUser.username} · 空间角色：${roleLabel(input.workspaceRole)} · 有效期至：${input.expiresAt}`,
      actionUrl: targetActionUrl,
      actionLabel: '查看邀请',
      actorUserId: input.actorUser.id,
      payload: {
        inviteeUsername: normalizeString(input.inviteeUsername),
        expiresAt: input.expiresAt,
        workspaceRole: normalizeString(input.workspaceRole),
        projectRole: normalizeString(input.projectRole),
      },
      dedupeKey: `${projectInfo ? 'project' : 'workspace'}-invitation-created:target:${input.token}`,
      expiresAt: input.expiresAt,
    })
  }

  for (const managerUserId of managerUserIds) {
    if (!managerUserId || managerUserId === input.actorUser.id)
      continue

    await createUserNotification(db, {
      userId: managerUserId,
      workspaceId: workspaceInfo.workspaceId,
      projectId: projectInfo?.projectId || null,
      category: 'collab',
      type: projectInfo ? 'project.invitation.created' : 'workspace.invitation.created',
      title: projectInfo
        ? `${input.actorUser.username} 发起了项目邀请`
        : `${input.actorUser.username} 发起了空间邀请`,
      body: projectInfo
        ? `项目：${projectInfo.projectTitle} · 目标用户：${normalizeString(input.inviteeUsername) || '未指定'} · 项目角色：${roleLabel(input.projectRole)}`
        : `空间：${workspaceInfo.workspaceName} · 目标用户：${normalizeString(input.inviteeUsername) || '未指定'} · 空间角色：${roleLabel(input.workspaceRole)}`,
      actionUrl: projectInfo
        ? projectWorkspacePath(projectInfo.workspaceId, projectInfo.projectId)
        : teamDetailPath(workspaceInfo.workspaceId),
      actionLabel: projectInfo ? '查看项目' : '查看项目台',
      actorUserId: input.actorUser.id,
      payload: {
        inviteeUsername: normalizeString(input.inviteeUsername),
        expiresAt: input.expiresAt,
        workspaceRole: normalizeString(input.workspaceRole),
        projectRole: normalizeString(input.projectRole),
      },
      dedupeKey: `${projectInfo ? 'project' : 'workspace'}-invitation-created:manager:${input.token}:${managerUserId}`,
      expiresAt: input.expiresAt,
    })
  }
}

export async function emitInvitationAcceptedNotifications(
  db: Queryable,
  input: {
    actorUser: AuthUser
    workspaceId: string
    projectId?: string | null
    invitationId?: string | null
  },
): Promise<void> {
  const normalizedProjectId = normalizeString(input.projectId)
  const workspaceInfo = await resolveWorkspaceInfo(db, input.workspaceId)
  const projectInfo = normalizedProjectId ? await resolveProjectInfo(db, normalizedProjectId) : null
  const managerUserIds = projectInfo
    ? await listProjectManagerUserIds(db, projectInfo.projectId)
    : await listWorkspaceManagerUserIds(db, workspaceInfo.workspaceId)

  for (const managerUserId of managerUserIds) {
    if (!managerUserId || managerUserId === input.actorUser.id)
      continue

    await createUserNotification(db, {
      userId: managerUserId,
      workspaceId: workspaceInfo.workspaceId,
      projectId: projectInfo?.projectId || null,
      category: 'collab',
      type: projectInfo ? 'project.invitation.accepted' : 'workspace.invitation.accepted',
      title: projectInfo
        ? `${input.actorUser.username} 已加入项目「${projectInfo.projectTitle}」`
        : `${input.actorUser.username} 已加入「${workspaceInfo.workspaceName}」`,
      body: projectInfo
        ? `成员已通过邀请进入项目，可继续在项目协作区管理角色与席位。`
        : `成员已通过邀请加入当前项目台。`,
      actionUrl: projectInfo
        ? projectWorkspacePath(projectInfo.workspaceId, projectInfo.projectId)
        : teamDetailPath(workspaceInfo.workspaceId),
      actionLabel: projectInfo ? '查看项目' : '查看项目台',
      actorUserId: input.actorUser.id,
      payload: {
        invitationId: normalizeString(input.invitationId),
        acceptedUserId: input.actorUser.id,
        acceptedUsername: input.actorUser.username,
      },
      dedupeKey: `${projectInfo ? 'project' : 'workspace'}-invitation-accepted:${normalizeString(input.invitationId) || input.actorUser.id}`,
    })
  }
}

export async function emitProjectMemberMutationNotifications(
  db: Queryable,
  input: {
    actorUser: AuthUser
    projectId: string
    targetUserId: string
    previousRole?: ProjectMemberRole | null
    nextRole?: ProjectMemberRole | null
    source?: 'manual' | 'invitation'
  },
): Promise<void> {
  if (input.source === 'invitation')
    return

  const projectInfo = await resolveProjectInfo(db, input.projectId)
  if (!projectInfo.projectId)
    return

  const previousRole = input.previousRole || null
  const nextRole = input.nextRole || null
  const eventKey = randomUUID()
  let notificationType: UserNotificationType | null = null

  if (!previousRole && nextRole)
    notificationType = 'project.member.added'
  else if (previousRole && !nextRole)
    notificationType = 'project.member.removed'
  else if (previousRole && nextRole && previousRole !== nextRole)
    notificationType = 'project.member.role_changed'

  if (!notificationType)
    return

  const targetUsername = await resolveUsernameByUserId(db, input.targetUserId)
  const managerUserIds = await listProjectManagerUserIds(db, projectInfo.projectId)
  const recipientUserIds = dedupeStrings([...managerUserIds, input.targetUserId])

  for (const recipientUserId of recipientUserIds) {
    if (!recipientUserId || recipientUserId === input.actorUser.id)
      continue

    const isTarget = recipientUserId === input.targetUserId
    const targetActionUrl = notificationType === 'project.member.removed'
      ? teamDetailPath(projectInfo.workspaceId)
      : projectWorkspacePath(projectInfo.workspaceId, projectInfo.projectId)

    let title = ''
    let body = ''
    if (notificationType === 'project.member.added') {
      title = isTarget
        ? `你已加入项目「${projectInfo.projectTitle}」`
        : `${targetUsername || '成员'} 已加入项目「${projectInfo.projectTitle}」`
      body = `操作者：${input.actorUser.username} · 当前项目角色：${roleLabel(nextRole)}`
    }
    else if (notificationType === 'project.member.removed') {
      title = isTarget
        ? `你已被移出项目「${projectInfo.projectTitle}」`
        : `${targetUsername || '成员'} 已被移出项目「${projectInfo.projectTitle}」`
      body = `操作者：${input.actorUser.username}`
    }
    else {
      title = isTarget
        ? `你在项目「${projectInfo.projectTitle}」中的角色已变更`
        : `${targetUsername || '成员'} 的项目角色已变更`
      body = `操作者：${input.actorUser.username} · ${roleLabel(previousRole)} -> ${roleLabel(nextRole)}`
    }

    await createUserNotification(db, {
      userId: recipientUserId,
      workspaceId: projectInfo.workspaceId,
      projectId: projectInfo.projectId,
      category: 'collab',
      type: notificationType,
      title,
      body,
      actionUrl: isTarget ? targetActionUrl : projectWorkspacePath(projectInfo.workspaceId, projectInfo.projectId),
      actionLabel: isTarget && notificationType === 'project.member.removed' ? '返回项目台' : '查看项目',
      actorUserId: input.actorUser.id,
      payload: {
        targetUserId: input.targetUserId,
        targetUsername,
        previousRole,
        nextRole,
      },
      dedupeKey: `project-member:${notificationType}:${projectInfo.projectId}:${input.targetUserId}:${eventKey}`,
    })
  }
}

export async function emitWorkspaceMemberRemovedNotifications(
  db: Queryable,
  input: {
    actorUser: AuthUser
    workspaceId: string
    targetUserId: string
  },
): Promise<void> {
  const workspaceInfo = await resolveWorkspaceInfo(db, input.workspaceId)
  if (!workspaceInfo.workspaceId)
    return

  const eventKey = randomUUID()
  const targetUsername = await resolveUsernameByUserId(db, input.targetUserId)
  const managerUserIds = await listWorkspaceManagerUserIds(db, workspaceInfo.workspaceId)
  const recipientUserIds = dedupeStrings([...managerUserIds, input.targetUserId])

  for (const recipientUserId of recipientUserIds) {
    if (!recipientUserId || recipientUserId === input.actorUser.id)
      continue

    const isTarget = recipientUserId === input.targetUserId
    await createUserNotification(db, {
      userId: recipientUserId,
      workspaceId: workspaceInfo.workspaceId,
      category: 'collab',
      type: 'workspace.member.removed',
      title: isTarget
        ? `你已被移出「${workspaceInfo.workspaceName}」`
        : `${targetUsername || '成员'} 已被移出「${workspaceInfo.workspaceName}」`,
      body: `操作者：${input.actorUser.username}`,
      actionUrl: isTarget ? '/team' : teamDetailPath(workspaceInfo.workspaceId),
      actionLabel: isTarget ? '返回项目台' : '查看项目台',
      actorUserId: input.actorUser.id,
      payload: {
        targetUserId: input.targetUserId,
        targetUsername,
      },
      dedupeKey: `workspace-member-removed:${workspaceInfo.workspaceId}:${input.targetUserId}:${eventKey}`,
    })
  }
}
