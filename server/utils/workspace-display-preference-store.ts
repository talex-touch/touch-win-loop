import type { Queryable } from '~~/server/utils/db'
import type {
  AuthUser,
  WorkspaceDisplayPreferences,
  WorkspaceDisplayPreferenceSnapshot,
  WorkspaceDisplayPreferenceSource,
  WorkspaceDisplayPreferenceSources,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
  WorkspaceType,
} from '~~/shared/types/domain'
import { teamGetWorkspaceAccess, teamHasWorkspaceRole } from '~~/server/utils/team-membership-store'

interface WorkspaceDisplayPreferenceRow {
  preferences: Record<string, unknown> | null
  updated_at: string
}

interface WorkspaceDisplayPreferenceWorkspaceRow {
  id: string
  type: WorkspaceType
}

export interface WorkspaceDisplayPreferencesPatchInput {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
}

const WORKSPACE_FONT_SIZE_PRESETS: WorkspaceFontSizePreset[] = ['xs', 'sm', 'md', 'lg', 'xl']
const WORKSPACE_TAB_SPACING_PRESETS: WorkspaceTabSpacingPreset[] = ['compact', 'default', 'relaxed']
const MANAGE_TEAM_DEFAULT_ROLES = ['owner', 'admin'] as const

export function getSystemWorkspaceDisplayPreferences(): WorkspaceDisplayPreferences {
  return {
    fontSizePreset: 'md',
    tabSpacingPreset: 'default',
  }
}

export function isWorkspaceFontSizePreset(value: unknown): value is WorkspaceFontSizePreset {
  return WORKSPACE_FONT_SIZE_PRESETS.includes(String(value || '').trim() as WorkspaceFontSizePreset)
}

export function isWorkspaceTabSpacingPreset(value: unknown): value is WorkspaceTabSpacingPreset {
  return WORKSPACE_TAB_SPACING_PRESETS.includes(String(value || '').trim() as WorkspaceTabSpacingPreset)
}

function normalizeWorkspaceFontSizePreset(value: unknown): WorkspaceFontSizePreset | null {
  const normalized = String(value || '').trim()
  if (!normalized)
    return null
  return isWorkspaceFontSizePreset(normalized) ? normalized : null
}

function normalizeWorkspaceTabSpacingPreset(value: unknown): WorkspaceTabSpacingPreset | null {
  const normalized = String(value || '').trim()
  if (!normalized)
    return null
  return isWorkspaceTabSpacingPreset(normalized) ? normalized : null
}

function normalizeWorkspaceDisplayPreferences(value: unknown): WorkspaceDisplayPreferences | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const fontSizePreset = normalizeWorkspaceFontSizePreset(source.fontSizePreset)
  const tabSpacingPreset = normalizeWorkspaceTabSpacingPreset(source.tabSpacingPreset)

  if (!fontSizePreset && !tabSpacingPreset)
    return null

  const normalized: WorkspaceDisplayPreferences = {}
  if (fontSizePreset)
    normalized.fontSizePreset = fontSizePreset
  if (tabSpacingPreset)
    normalized.tabSpacingPreset = tabSpacingPreset

  return {
    ...normalized,
  }
}

function mapWorkspaceDisplayPreferenceRow(row: WorkspaceDisplayPreferenceRow | undefined): WorkspaceDisplayPreferences | null {
  if (!row)
    return null

  const normalized = normalizeWorkspaceDisplayPreferences(row.preferences)
  if (!normalized)
    return null

  return {
    ...normalized,
    updatedAt: row.updated_at,
  }
}

function mergeWorkspaceDisplayPreferences(
  current: WorkspaceDisplayPreferences | null,
  patch: WorkspaceDisplayPreferencesPatchInput,
): WorkspaceDisplayPreferences | null {
  const nextFontSizePreset = patch.fontSizePreset !== undefined
    ? patch.fontSizePreset
    : (current?.fontSizePreset ?? null)
  const nextTabSpacingPreset = patch.tabSpacingPreset !== undefined
    ? patch.tabSpacingPreset
    : (current?.tabSpacingPreset ?? null)

  if (!nextFontSizePreset && !nextTabSpacingPreset)
    return null

  const next: WorkspaceDisplayPreferences = {}
  if (nextFontSizePreset)
    next.fontSizePreset = nextFontSizePreset
  if (nextTabSpacingPreset)
    next.tabSpacingPreset = nextTabSpacingPreset

  return {
    ...next,
  }
}

function resolveWorkspaceDisplayPreferenceValue<T extends WorkspaceFontSizePreset | WorkspaceTabSpacingPreset>(
  input: {
    workspaceType: WorkspaceType
    userDefault: T | null | undefined
    teamDefault: T | null | undefined
    workspaceOverride: T | null | undefined
    systemValue: T
  },
): { value: T, source: WorkspaceDisplayPreferenceSource } {
  if (input.workspaceOverride) {
    return {
      value: input.workspaceOverride,
      source: 'workspace_override',
    }
  }

  if (input.userDefault) {
    return {
      value: input.userDefault,
      source: 'user_default',
    }
  }

  if (input.workspaceType === 'team' && input.teamDefault) {
    return {
      value: input.teamDefault,
      source: 'team_default',
    }
  }

  return {
    value: input.systemValue,
    source: 'system_default',
  }
}

async function loadWorkspaceDisplayPreferenceWorkspace(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceDisplayPreferenceWorkspaceRow | null> {
  const result = await db.query<WorkspaceDisplayPreferenceWorkspaceRow>(
    `SELECT id, type
     FROM workspaces
     WHERE id = $1
     LIMIT 1`,
    [workspaceId],
  )

  return result.rows[0] || null
}

async function loadUserWorkspaceDisplayDefaultsRow(db: Queryable, userId: string): Promise<WorkspaceDisplayPreferences | null> {
  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `SELECT preferences, updated_at::TEXT
     FROM user_workspace_display_defaults
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function loadWorkspaceDisplayDefaultsRow(db: Queryable, workspaceId: string): Promise<WorkspaceDisplayPreferences | null> {
  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `SELECT preferences, updated_at::TEXT
     FROM workspace_display_defaults
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function loadUserWorkspaceDisplayOverrideRow(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceDisplayPreferences | null> {
  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `SELECT preferences, updated_at::TEXT
     FROM user_workspace_display_overrides
     WHERE user_id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [userId, workspaceId],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function upsertUserWorkspaceDisplayDefaultsRow(
  db: Queryable,
  userId: string,
  preferences: WorkspaceDisplayPreferences | null,
): Promise<WorkspaceDisplayPreferences | null> {
  if (!preferences) {
    await db.query(
      `DELETE FROM user_workspace_display_defaults
       WHERE user_id = $1`,
      [userId],
    )
    return null
  }

  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `INSERT INTO user_workspace_display_defaults (
      user_id,
      preferences,
      created_at,
      updated_at
    ) VALUES ($1, $2::JSONB, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      preferences = EXCLUDED.preferences,
      updated_at = NOW()
    RETURNING preferences, updated_at::TEXT`,
    [userId, JSON.stringify(preferences)],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function upsertWorkspaceDisplayDefaultsRow(
  db: Queryable,
  workspaceId: string,
  preferences: WorkspaceDisplayPreferences | null,
): Promise<WorkspaceDisplayPreferences | null> {
  if (!preferences) {
    await db.query(
      `DELETE FROM workspace_display_defaults
       WHERE workspace_id = $1`,
      [workspaceId],
    )
    return null
  }

  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `INSERT INTO workspace_display_defaults (
      workspace_id,
      preferences,
      created_at,
      updated_at
    ) VALUES ($1, $2::JSONB, NOW(), NOW())
    ON CONFLICT (workspace_id)
    DO UPDATE SET
      preferences = EXCLUDED.preferences,
      updated_at = NOW()
    RETURNING preferences, updated_at::TEXT`,
    [workspaceId, JSON.stringify(preferences)],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function upsertUserWorkspaceDisplayOverridesRow(
  db: Queryable,
  userId: string,
  workspaceId: string,
  preferences: WorkspaceDisplayPreferences | null,
): Promise<WorkspaceDisplayPreferences | null> {
  if (!preferences) {
    await db.query(
      `DELETE FROM user_workspace_display_overrides
       WHERE user_id = $1
         AND workspace_id = $2`,
      [userId, workspaceId],
    )
    return null
  }

  const result = await db.query<WorkspaceDisplayPreferenceRow>(
    `INSERT INTO user_workspace_display_overrides (
      user_id,
      workspace_id,
      preferences,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3::JSONB, NOW(), NOW())
    ON CONFLICT (user_id, workspace_id)
    DO UPDATE SET
      preferences = EXCLUDED.preferences,
      updated_at = NOW()
    RETURNING preferences, updated_at::TEXT`,
    [userId, workspaceId, JSON.stringify(preferences)],
  )

  return mapWorkspaceDisplayPreferenceRow(result.rows[0])
}

async function resolveWorkspaceDisplayPreferenceContext(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<{
  workspace: WorkspaceDisplayPreferenceWorkspaceRow
  canManageTeamDefault: boolean
}> {
  const workspace = await loadWorkspaceDisplayPreferenceWorkspace(db, workspaceId)
  if (!workspace)
    throw new Error('WORKSPACE_NOT_FOUND')

  if (user.isPlatformAdmin) {
    return {
      workspace,
      canManageTeamDefault: workspace.type === 'team',
    }
  }

  const access = await teamGetWorkspaceAccess(db, user.id, workspaceId)
  if (!access.isMember)
    throw new Error('FORBIDDEN')

  return {
    workspace,
    canManageTeamDefault: workspace.type === 'team'
      && teamHasWorkspaceRole(access, [...MANAGE_TEAM_DEFAULT_ROLES]),
  }
}

function resolveEffectiveWorkspaceDisplayPreferences(
  input: {
    workspaceType: WorkspaceType
    userDefault: WorkspaceDisplayPreferences | null
    teamDefault: WorkspaceDisplayPreferences | null
    workspaceOverride: WorkspaceDisplayPreferences | null
  },
): {
  effective: WorkspaceDisplayPreferences
  sources: WorkspaceDisplayPreferenceSources
} {
  const systemPreferences = getSystemWorkspaceDisplayPreferences()
  const fontSizePreset = resolveWorkspaceDisplayPreferenceValue({
    workspaceType: input.workspaceType,
    userDefault: input.userDefault?.fontSizePreset,
    teamDefault: input.teamDefault?.fontSizePreset,
    workspaceOverride: input.workspaceOverride?.fontSizePreset,
    systemValue: systemPreferences.fontSizePreset || 'md',
  })
  const tabSpacingPreset = resolveWorkspaceDisplayPreferenceValue({
    workspaceType: input.workspaceType,
    userDefault: input.userDefault?.tabSpacingPreset,
    teamDefault: input.teamDefault?.tabSpacingPreset,
    workspaceOverride: input.workspaceOverride?.tabSpacingPreset,
    systemValue: systemPreferences.tabSpacingPreset || 'default',
  })

  return {
    effective: {
      fontSizePreset: fontSizePreset.value,
      tabSpacingPreset: tabSpacingPreset.value,
    },
    sources: {
      fontSizePreset: fontSizePreset.source,
      tabSpacingPreset: tabSpacingPreset.source,
    },
  }
}

export async function getUserWorkspaceDisplayDefaults(
  db: Queryable,
  userId: string,
): Promise<WorkspaceDisplayPreferences | null> {
  return loadUserWorkspaceDisplayDefaultsRow(db, userId)
}

export async function patchUserWorkspaceDisplayDefaults(
  db: Queryable,
  userId: string,
  patch: WorkspaceDisplayPreferencesPatchInput,
): Promise<WorkspaceDisplayPreferences | null> {
  const current = await loadUserWorkspaceDisplayDefaultsRow(db, userId)
  const next = mergeWorkspaceDisplayPreferences(current, patch)
  return upsertUserWorkspaceDisplayDefaultsRow(db, userId, next)
}

export async function getWorkspaceDisplayPreferenceSnapshot(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
): Promise<WorkspaceDisplayPreferenceSnapshot> {
  const context = await resolveWorkspaceDisplayPreferenceContext(db, user, workspaceId)
  const userDefault = await loadUserWorkspaceDisplayDefaultsRow(db, user.id)
  const rawTeamDefault = await loadWorkspaceDisplayDefaultsRow(db, workspaceId)
  const workspaceOverride = await loadUserWorkspaceDisplayOverrideRow(db, user.id, workspaceId)

  const teamDefault = context.workspace.type === 'team' ? rawTeamDefault : null
  const resolved = resolveEffectiveWorkspaceDisplayPreferences({
    workspaceType: context.workspace.type,
    userDefault,
    teamDefault,
    workspaceOverride,
  })

  return {
    userDefault,
    teamDefault,
    workspaceOverride,
    effective: resolved.effective,
    sources: resolved.sources,
    canManageTeamDefault: context.canManageTeamDefault,
  }
}

export async function patchUserWorkspaceDisplayOverride(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  patch: WorkspaceDisplayPreferencesPatchInput,
): Promise<WorkspaceDisplayPreferenceSnapshot> {
  await resolveWorkspaceDisplayPreferenceContext(db, user, workspaceId)
  const current = await loadUserWorkspaceDisplayOverrideRow(db, user.id, workspaceId)
  const next = mergeWorkspaceDisplayPreferences(current, patch)
  await upsertUserWorkspaceDisplayOverridesRow(db, user.id, workspaceId, next)
  return getWorkspaceDisplayPreferenceSnapshot(db, user, workspaceId)
}

export async function patchWorkspaceDisplayDefault(
  db: Queryable,
  user: AuthUser,
  workspaceId: string,
  patch: WorkspaceDisplayPreferencesPatchInput,
): Promise<WorkspaceDisplayPreferenceSnapshot> {
  const context = await resolveWorkspaceDisplayPreferenceContext(db, user, workspaceId)
  if (context.workspace.type !== 'team')
    throw new Error('TEAM_WORKSPACE_DISPLAY_DEFAULT_UNSUPPORTED')
  if (!context.canManageTeamDefault)
    throw new Error('FORBIDDEN')

  const current = await loadWorkspaceDisplayDefaultsRow(db, workspaceId)
  const next = mergeWorkspaceDisplayPreferences(current, patch)
  await upsertWorkspaceDisplayDefaultsRow(db, workspaceId, next)
  return getWorkspaceDisplayPreferenceSnapshot(db, user, workspaceId)
}
