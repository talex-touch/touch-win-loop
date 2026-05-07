import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  DeviceScopedRestoreResolution,
  ProjectWorkspaceAiTabsPreference,
  ProjectWorkspaceAiTabsState,
  ProjectWorkspaceViewDeviceStatePayload,
  ProjectWorkspaceViewPreference,
  ProjectWorkspaceViewState,
  TeamLastProjectPreference,
  WorkspaceFixedTabId,
  WorkspaceOpenTabState,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import {
  normalizeWorkspaceLeftSidebarWidth,
  normalizeWorkspaceRightSidebarWidth,
} from '~~/shared/utils/workspace-layout'

interface ProjectWorkspaceViewStateRow {
  project_id: string
  payload: ProjectWorkspaceViewState | Record<string, unknown> | null
  revision: number
  device_id: string
  last_opened_at: string
  updated_at: string
}

interface ProjectWorkspaceAiTabsRow {
  project_id: string
  payload: ProjectWorkspaceAiTabsState | Record<string, unknown> | null
  updated_at: string
}

interface TeamLastProjectPreferenceRow {
  workspace_id: string
  project_id: string
  updated_at: string
}

type WorkspaceOpenTabStateLike = WorkspaceOpenTabState | 'design'

const WORKSPACE_FIXED_TAB_IDS: WorkspaceFixedTabId[] = ['dashboard', 'meeting', 'members', 'flow', 'settings', 'loopy_data']
const WORKSPACE_FIXED_TAB_ID_SET = new Set<string>(WORKSPACE_FIXED_TAB_IDS)
const DEVICE_STALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isWorkspaceOpenTabState(
  value: string,
  options: { preserveLegacyDesignTab?: boolean } = {},
): value is WorkspaceOpenTabStateLike {
  if (options.preserveLegacyDesignTab && value === 'design')
    return true
  if (WORKSPACE_FIXED_TAB_ID_SET.has(value))
    return true
  if (value.startsWith('meeting:') && value.length > 'meeting:'.length)
    return true
  if (value === 'meeting-create:audio' || value === 'meeting-create:video')
    return true
  return value.startsWith('resource:') && value.length > 'resource:'.length
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'number')
    return value !== 0
  const normalized = normalizeString(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeProjectWorkspaceAssistantMode(value: unknown): 'contextual' | 'dialog_ask' {
  return normalizeString(value) === 'dialog_ask' ? 'dialog_ask' : 'contextual'
}

function normalizeProjectWorkspaceRightSidebarView(value: unknown): 'ai' | 'comments' {
  return normalizeString(value) === 'comments' ? 'comments' : 'ai'
}

function normalizeWorkspaceOpenTabs(
  value: unknown,
  options: { preserveLegacyDesignTab?: boolean } = {},
): WorkspaceOpenTabStateLike[] {
  if (!Array.isArray(value))
    return ['dashboard']

  const normalized: WorkspaceOpenTabStateLike[] = []
  const used = new Set<string>()
  for (const item of value) {
    const tabId = normalizeString(item)
    if (!isWorkspaceOpenTabState(tabId, options) || used.has(tabId))
      continue
    normalized.push(tabId)
    used.add(tabId)
    if (normalized.length >= 8)
      break
  }

  return normalized.length > 0 ? normalized : ['dashboard']
}

function normalizeOpenChatSessionIds(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  const normalized: string[] = []
  const used = new Set<string>()
  for (const item of value) {
    const sessionId = normalizeString(item)
    if (!sessionId || used.has(sessionId))
      continue
    normalized.push(sessionId)
    used.add(sessionId)
  }

  return normalized.slice(-8)
}

function parseTimestamp(value: string): number {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp))
    return 0
  return timestamp
}

function serializeProjectWorkspaceViewState(value: unknown): string {
  return JSON.stringify(normalizeProjectWorkspaceViewStatePayload(value))
}

function serializeProjectWorkspaceAiTabsState(value: unknown): string {
  return JSON.stringify(normalizeProjectWorkspaceAiTabsStatePayload(value))
}

export function normalizeProjectWorkspaceViewStatePayload(value: unknown): ProjectWorkspaceViewState {
  return normalizeProjectWorkspaceViewStatePayloadWithOptions(value)
}

export function normalizeProjectWorkspaceAiTabsStatePayload(value: unknown): ProjectWorkspaceAiTabsState {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const openChatSessionIds = normalizeOpenChatSessionIds(source.openChatSessionIds)
  const activeChatSessionId = normalizeString(source.activeChatSessionId)

  if (activeChatSessionId && !openChatSessionIds.includes(activeChatSessionId))
    openChatSessionIds.push(activeChatSessionId)

  return {
    openChatSessionIds: normalizeOpenChatSessionIds(openChatSessionIds),
    activeChatSessionId,
  }
}

function normalizeProjectWorkspaceViewStatePayloadWithOptions(
  value: unknown,
  options: { preserveLegacyDesignTab?: boolean } = {},
): ProjectWorkspaceViewState {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  const mainTabs = normalizeWorkspaceOpenTabs(source.mainTabs, options)
  const requestedActiveTabId = normalizeString(source.activeMainTabId)

  const requestedWorkbenchMode = normalizeString(source.workbenchMode)
  const workbenchMode = requestedWorkbenchMode === 'defense' || requestedWorkbenchMode === 'final_review'
    ? requestedWorkbenchMode
    : 'project'

  const previewResourceId = normalizeString(source.previewResourceId)
  const openChatSessionIds = normalizeOpenChatSessionIds(source.openChatSessionIds)
  const activeChatSessionId = normalizeString(source.activeChatSessionId)
  const activeMeetingId = normalizeString(source.activeMeetingId)
  const selectedContestId = normalizeString(source.selectedContestId)
  const selectedTrackId = normalizeString(source.selectedTrackId)

  if (activeChatSessionId && !openChatSessionIds.includes(activeChatSessionId))
    openChatSessionIds.push(activeChatSessionId)

  if (previewResourceId) {
    const previewTabId = `resource:${previewResourceId}` as WorkspaceOpenTabStateLike
    if (!mainTabs.includes(previewTabId))
      mainTabs.push(previewTabId)
  }

  if (isWorkspaceOpenTabState(requestedActiveTabId, options) && !mainTabs.includes(requestedActiveTabId))
    mainTabs.push(requestedActiveTabId)

  const activeMainTabId = (isWorkspaceOpenTabState(requestedActiveTabId, options) && mainTabs.includes(requestedActiveTabId)
    ? requestedActiveTabId as WorkspaceOpenTabState
    : mainTabs[0] || 'dashboard') as WorkspaceOpenTabState

  return {
    workbenchMode,
    mainTabs: mainTabs as WorkspaceOpenTabState[],
    activeMainTabId,
    previewResourceId,
    selectedContestId,
    selectedTrackId,
    openChatSessionIds: normalizeOpenChatSessionIds(openChatSessionIds),
    activeChatSessionId,
    activeMeetingId,
    projectAssistantMode: normalizeProjectWorkspaceAssistantMode(source.projectAssistantMode),
    rightSidebarView: normalizeProjectWorkspaceRightSidebarView(source.rightSidebarView),
    leftSidebarWidth: normalizeWorkspaceLeftSidebarWidth(source.leftSidebarWidth),
    rightSidebarWidth: normalizeWorkspaceRightSidebarWidth(source.rightSidebarWidth),
    leftSidebarCollapsed: normalizeBoolean(source.leftSidebarCollapsed),
    rightSidebarCollapsed: normalizeBoolean(source.rightSidebarCollapsed),
  }
}

function mapProjectWorkspaceViewState(row: ProjectWorkspaceViewStateRow): ProjectWorkspaceViewPreference {
  return {
    projectId: row.project_id,
    payload: normalizeProjectWorkspaceViewStatePayloadWithOptions(row.payload, {
      preserveLegacyDesignTab: true,
    }),
    revision: Math.max(1, Number(row.revision || 1)),
    deviceId: normalizeString(row.device_id),
    updatedAt: normalizeString(row.updated_at),
    lastOpenedAt: normalizeString(row.last_opened_at),
  }
}

function mapProjectWorkspaceAiTabs(row: ProjectWorkspaceAiTabsRow): ProjectWorkspaceAiTabsPreference | null {
  const payload = normalizeProjectWorkspaceAiTabsStatePayload(row.payload)
  if (payload.openChatSessionIds.length === 0 && !payload.activeChatSessionId)
    return null

  return {
    projectId: row.project_id,
    payload,
    updatedAt: normalizeString(row.updated_at),
  }
}

function buildRestoreResolution(
  deviceId: string,
  current: ProjectWorkspaceViewPreference | null,
  latestOther: ProjectWorkspaceViewPreference | null,
): DeviceScopedRestoreResolution {
  const currentLastOpenedAt = normalizeString(current?.lastOpenedAt)
  const latestOtherLastOpenedAt = normalizeString(latestOther?.lastOpenedAt)
  const isNewDevice = !current
  const isStaleDevice = Boolean(
    currentLastOpenedAt
    && parseTimestamp(currentLastOpenedAt) > 0
    && (Date.now() - parseTimestamp(currentLastOpenedAt)) > DEVICE_STALE_WINDOW_MS,
  )
  const shouldPrompt = Boolean(
    current
    && latestOther
    && isStaleDevice
    && serializeProjectWorkspaceViewState(current.payload) !== serializeProjectWorkspaceViewState(latestOther.payload),
  )

  return {
    deviceId,
    isNewDevice,
    isStaleDevice,
    shouldPrompt,
    latestOtherDeviceId: normalizeString(latestOther?.deviceId),
    currentLastOpenedAt,
    latestOtherLastOpenedAt,
  }
}

function mapTeamLastProjectPreference(row: TeamLastProjectPreferenceRow): TeamLastProjectPreference {
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    updatedAt: normalizeString(row.updated_at),
  }
}

async function resolveProjectWorkspaceId(
  db: Queryable,
  projectId: string,
): Promise<string> {
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedProjectId)
    return ''

  const result = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id
     FROM projects
     WHERE id = $1
     LIMIT 1`,
    [normalizedProjectId],
  )

  return normalizeString(result.rows[0]?.workspace_id)
}

async function assertReadableProjectAccess(
  db: Queryable,
  user: AuthUser,
  projectId: string,
): Promise<string> {
  const workspaceId = await resolveProjectWorkspaceId(db, projectId)
  if (!workspaceId)
    throw new Error('PROJECT_NOT_FOUND')

  if (user.isPlatformAdmin)
    return workspaceId

  const access = await resolveProjectRealtimeAccess(db, user, projectId)
  if (!access)
    throw new Error('FORBIDDEN')

  return normalizeString(access.workspaceId)
}

async function assertWorkspaceAccess(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<void> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  if (!normalizedWorkspaceId)
    throw new Error('WORKSPACE_NOT_FOUND')

  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [normalizedWorkspaceId],
  )

  if (!normalizeString(result.rows[0]?.id))
    throw new Error('WORKSPACE_NOT_FOUND')

  const canAccess = await teamHasWorkspaceMembership(db, user, normalizedWorkspaceId)
  if (!canAccess)
    throw new Error('FORBIDDEN')
}

async function getProjectWorkspaceViewStateRowByUserProjectDevice(
  db: Queryable,
  userId: string,
  projectId: string,
  deviceId: string,
  lock = false,
): Promise<ProjectWorkspaceViewStateRow | null> {
  const lockClause = lock ? 'FOR UPDATE' : ''
  const result = await db.query<ProjectWorkspaceViewStateRow>(
    `SELECT
      project_id,
      payload,
      revision,
      device_id,
      last_opened_at::TEXT,
      updated_at::TEXT
     FROM project_workspace_view_states
     WHERE user_id = $1
       AND project_id = $2
       AND device_id = $3
     LIMIT 1
     ${lockClause}`,
    [userId, projectId, deviceId],
  )

  return result.rows[0] || null
}

async function getLegacyProjectWorkspaceViewStateRowByUserProject(
  db: Queryable,
  userId: string,
  projectId: string,
  lock = false,
): Promise<ProjectWorkspaceViewStateRow | null> {
  return getProjectWorkspaceViewStateRowByUserProjectDevice(db, userId, projectId, '', lock)
}

async function claimLegacyProjectWorkspaceViewStateRow(
  db: Queryable,
  userId: string,
  projectId: string,
  deviceId: string,
): Promise<ProjectWorkspaceViewStateRow | null> {
  const normalizedDeviceId = normalizeString(deviceId)
  if (!normalizedDeviceId)
    return null

  const current = await getProjectWorkspaceViewStateRowByUserProjectDevice(db, userId, projectId, normalizedDeviceId, true)
  if (current)
    return current

  const legacy = await getLegacyProjectWorkspaceViewStateRowByUserProject(db, userId, projectId, true)
  if (!legacy)
    return null

  const claimed = await db.query<ProjectWorkspaceViewStateRow>(
    `UPDATE project_workspace_view_states
     SET device_id = $3
     WHERE user_id = $1
       AND project_id = $2
       AND device_id = ''
     RETURNING
       project_id,
       payload,
       revision,
       device_id,
       last_opened_at::TEXT,
       updated_at::TEXT`,
    [userId, projectId, normalizedDeviceId],
  )

  return claimed.rows[0] || null
}

async function getLatestOtherProjectWorkspaceViewStateRowByUserProjectDevice(
  db: Queryable,
  userId: string,
  projectId: string,
  deviceId: string,
): Promise<ProjectWorkspaceViewStateRow | null> {
  const result = await db.query<ProjectWorkspaceViewStateRow>(
    `SELECT
      project_id,
      payload,
      revision,
      device_id,
      last_opened_at::TEXT,
      updated_at::TEXT
     FROM project_workspace_view_states
     WHERE user_id = $1
       AND project_id = $2
       AND device_id <> $3
     ORDER BY last_opened_at DESC, updated_at DESC
     LIMIT 1`,
    [userId, projectId, deviceId],
  )

  return result.rows[0] || null
}

async function getUserProjectWorkspaceAiTabsRow(
  db: Queryable,
  userId: string,
  projectId: string,
): Promise<ProjectWorkspaceAiTabsRow | null> {
  const result = await db.query<ProjectWorkspaceAiTabsRow>(
    `SELECT
      project_id,
      payload,
      updated_at::TEXT
     FROM user_project_workspace_ai_tabs
     WHERE user_id = $1
       AND project_id = $2
     LIMIT 1`,
    [userId, projectId],
  )

  return result.rows[0] || null
}

async function upsertUserProjectWorkspaceAiTabs(
  db: Queryable,
  userId: string,
  projectId: string,
  payload: ProjectWorkspaceAiTabsState,
): Promise<void> {
  const normalizedPayload = normalizeProjectWorkspaceAiTabsStatePayload(payload)
  if (normalizedPayload.openChatSessionIds.length === 0 && !normalizedPayload.activeChatSessionId) {
    await db.query(
      `DELETE FROM user_project_workspace_ai_tabs
       WHERE user_id = $1
         AND project_id = $2`,
      [userId, projectId],
    )
    return
  }

  const existing = await getUserProjectWorkspaceAiTabsRow(db, userId, projectId)
  if (existing && serializeProjectWorkspaceAiTabsState(existing.payload) === serializeProjectWorkspaceAiTabsState(normalizedPayload))
    return

  await db.query(
    `INSERT INTO user_project_workspace_ai_tabs (
      user_id,
      project_id,
      payload,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3::JSONB, NOW(), NOW())
    ON CONFLICT (user_id, project_id)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = NOW()`,
    [userId, projectId, JSON.stringify(normalizedPayload)],
  )
}

export async function getProjectWorkspaceViewState(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  deviceId: string,
): Promise<ProjectWorkspaceViewDeviceStatePayload> {
  await assertReadableProjectAccess(db, user, projectId)

  const normalizedProjectId = normalizeString(projectId)
  const normalizedDeviceId = normalizeString(deviceId)
  if (!normalizedDeviceId)
    throw new Error('DEVICE_ID_REQUIRED')

  const claimed = await claimLegacyProjectWorkspaceViewStateRow(db, user.id, normalizedProjectId, normalizedDeviceId)
  const currentRow = claimed || await getProjectWorkspaceViewStateRowByUserProjectDevice(db, user.id, normalizedProjectId, normalizedDeviceId)
  const latestOtherRow = await getLatestOtherProjectWorkspaceViewStateRowByUserProjectDevice(db, user.id, normalizedProjectId, normalizedDeviceId)
  const personalAiTabsRow = await getUserProjectWorkspaceAiTabsRow(db, user.id, normalizedProjectId)
  const current = currentRow ? mapProjectWorkspaceViewState(currentRow) : null
  const latestOther = latestOtherRow ? mapProjectWorkspaceViewState(latestOtherRow) : null
  const personalAiTabs = personalAiTabsRow ? mapProjectWorkspaceAiTabs(personalAiTabsRow) : null

  return {
    current,
    latestOther,
    personalAiTabs,
    resolution: buildRestoreResolution(normalizedDeviceId, current, latestOther),
  }
}

export async function upsertProjectWorkspaceViewState(
  db: Queryable,
  user: AuthUser,
  projectId: string,
  deviceId: string,
  payload: ProjectWorkspaceViewState,
): Promise<ProjectWorkspaceViewPreference> {
  await assertReadableProjectAccess(db, user, projectId)

  const normalizedProjectId = normalizeString(projectId)
  const normalizedDeviceId = normalizeString(deviceId)
  if (!normalizedDeviceId)
    throw new Error('DEVICE_ID_REQUIRED')

  const normalizedPayload = normalizeProjectWorkspaceViewStatePayload(payload)
  await upsertUserProjectWorkspaceAiTabs(db, user.id, normalizedProjectId, {
    openChatSessionIds: normalizedPayload.openChatSessionIds,
    activeChatSessionId: normalizedPayload.activeChatSessionId,
  })
  const now = new Date().toISOString()
  const existing = await claimLegacyProjectWorkspaceViewStateRow(db, user.id, normalizedProjectId, normalizedDeviceId)
    || await getProjectWorkspaceViewStateRowByUserProjectDevice(db, user.id, normalizedProjectId, normalizedDeviceId, true)

  if (!existing) {
    const inserted = await db.query<ProjectWorkspaceViewStateRow>(
      `INSERT INTO project_workspace_view_states (
        id,
        user_id,
        project_id,
        payload,
        revision,
        device_id,
        last_opened_at,
        updated_at
      ) VALUES ($1, $2, $3, $4::JSONB, 1, $5, $6, $6)
      RETURNING
        project_id,
        payload,
        revision,
        device_id,
        last_opened_at::TEXT,
        updated_at::TEXT`,
      [randomUUID(), user.id, normalizedProjectId, JSON.stringify(normalizedPayload), normalizedDeviceId, now],
    )

    const row = inserted.rows[0]
    if (!row)
      throw new Error('PROJECT_WORKSPACE_VIEW_STATE_WRITE_FAILED')
    return mapProjectWorkspaceViewState(row)
  }

  const samePayload = serializeProjectWorkspaceViewState(existing.payload) === serializeProjectWorkspaceViewState(normalizedPayload)
  const updated = await db.query<ProjectWorkspaceViewStateRow>(
    `UPDATE project_workspace_view_states
     SET payload = $3::JSONB,
         revision = CASE WHEN $4 THEN revision ELSE revision + 1 END,
         device_id = $5,
         last_opened_at = $6,
         updated_at = $6
     WHERE user_id = $1
       AND project_id = $2
       AND device_id = $5
     RETURNING
       project_id,
       payload,
       revision,
       device_id,
       last_opened_at::TEXT,
       updated_at::TEXT`,
    [user.id, normalizedProjectId, JSON.stringify(normalizedPayload), samePayload, normalizedDeviceId, now],
  )

  const row = updated.rows[0]
  if (!row)
    throw new Error('PROJECT_WORKSPACE_VIEW_STATE_WRITE_FAILED')
  return mapProjectWorkspaceViewState(row)
}

async function getTeamLastProjectPreferenceRow(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<TeamLastProjectPreferenceRow | null> {
  const result = await db.query<TeamLastProjectPreferenceRow>(
    `SELECT
      workspace_id,
      project_id,
      updated_at::TEXT
     FROM user_workspace_last_projects
     WHERE user_id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [userId, workspaceId],
  )

  return result.rows[0] || null
}

export async function getTeamLastProjectPreference(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<TeamLastProjectPreference | null> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  await assertWorkspaceAccess(db, user, normalizedWorkspaceId)

  const row = await getTeamLastProjectPreferenceRow(db, user.id, normalizedWorkspaceId)
  if (!row)
    return null

  const accessWorkspaceId = await resolveProjectWorkspaceId(db, row.project_id)
  if (!accessWorkspaceId || accessWorkspaceId !== normalizedWorkspaceId)
    return null

  if (!user.isPlatformAdmin) {
    const access = await resolveProjectRealtimeAccess(db, user, row.project_id)
    if (!access || normalizeString(access.workspaceId) !== normalizedWorkspaceId)
      return null
  }

  return mapTeamLastProjectPreference(row)
}

export async function upsertTeamLastProjectPreference(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  projectId: string,
): Promise<TeamLastProjectPreference> {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  const normalizedProjectId = normalizeString(projectId)
  if (!normalizedProjectId)
    throw new Error('PROJECT_NOT_FOUND')

  await assertWorkspaceAccess(db, user, normalizedWorkspaceId)

  const projectWorkspaceId = await assertReadableProjectAccess(db, user, normalizedProjectId)
  if (projectWorkspaceId !== normalizedWorkspaceId)
    throw new Error('PROJECT_SCOPE_MISMATCH')

  const now = new Date().toISOString()
  const result = await db.query<TeamLastProjectPreferenceRow>(
    `INSERT INTO user_workspace_last_projects (
      user_id,
      workspace_id,
      project_id,
      updated_at
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, workspace_id)
    DO UPDATE SET
      project_id = EXCLUDED.project_id,
      updated_at = EXCLUDED.updated_at
    RETURNING
      workspace_id,
      project_id,
      updated_at::TEXT`,
    [user.id, normalizedWorkspaceId, normalizedProjectId, now],
  )

  const row = result.rows[0]
  if (!row)
    throw new Error('TEAM_LAST_PROJECT_WRITE_FAILED')

  return mapTeamLastProjectPreference(row)
}
