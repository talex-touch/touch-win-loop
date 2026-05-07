import type {
  ApiResponse,
  WorkspaceDisplayPreferences,
  WorkspaceDisplayPreferenceSnapshot,
  WorkspaceDisplayPreferenceSource,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'
import {
  DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH,
  DEFAULT_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
  normalizeWorkspaceLeftSidebarWidth,
  normalizeWorkspaceRightSidebarWidth,
} from '~~/shared/utils/workspace-layout'

export const WORKSPACE_FONT_SIZE_PRESET_OPTIONS: Array<{ value: WorkspaceFontSizePreset, label: string }> = [
  { value: 'xs', label: '极效' },
  { value: 'sm', label: '紧凑' },
  { value: 'md', label: '优雅' },
  { value: 'lg', label: '放开' },
  { value: 'xl', label: '舒展' },
]

export const WORKSPACE_TAB_SPACING_PRESET_OPTIONS: Array<{ value: WorkspaceTabSpacingPreset, label: string }> = [
  { value: 'ultra_compact', label: '极效' },
  { value: 'compact', label: '紧凑' },
  { value: 'default', label: '优雅' },
  { value: 'relaxed', label: '放开' },
  { value: 'spacious', label: '舒展' },
]

export type NullableWorkspaceFontSizePreset = WorkspaceFontSizePreset | ''
export type NullableWorkspaceTabSpacingPreset = WorkspaceTabSpacingPreset | ''

export interface WorkspaceDisplayPreferencePatchPayload {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
  leftSidebarWidth?: number | null
  rightSidebarWidth?: number | null
}

function findWorkspaceFontSizePreset(value: unknown): WorkspaceFontSizePreset | null {
  const normalized = String(value || '').trim()
  if (normalized === 'xxs')
    return 'xs'
  const matched = WORKSPACE_FONT_SIZE_PRESET_OPTIONS.find(item => item.value === normalized)
  return matched?.value || null
}

function findWorkspaceTabSpacingPreset(value: unknown): WorkspaceTabSpacingPreset | null {
  const normalized = String(value || '').trim()
  const matched = WORKSPACE_TAB_SPACING_PRESET_OPTIONS.find(item => item.value === normalized)
  return matched?.value || null
}

export function normalizeWorkspaceFontSizeDraft(value: unknown): NullableWorkspaceFontSizePreset {
  return findWorkspaceFontSizePreset(value) || ''
}

export function normalizeWorkspaceTabSpacingDraft(value: unknown): NullableWorkspaceTabSpacingPreset {
  return findWorkspaceTabSpacingPreset(value) || ''
}

function normalizeWorkspaceSidebarWidth(
  value: unknown,
  normalizer: (value: unknown) => number,
): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return null
  return normalizer(normalized)
}

export function normalizeWorkspaceDisplayPreferences(
  input: WorkspaceDisplayPreferences | null | undefined,
): WorkspaceDisplayPreferences | null {
  if (!input)
    return null

  const fontSizePreset = findWorkspaceFontSizePreset(input.fontSizePreset)
  const tabSpacingPreset = findWorkspaceTabSpacingPreset(input.tabSpacingPreset)
  const leftSidebarWidth = normalizeWorkspaceSidebarWidth(input.leftSidebarWidth, normalizeWorkspaceLeftSidebarWidth)
  const rightSidebarWidth = normalizeWorkspaceSidebarWidth(input.rightSidebarWidth, normalizeWorkspaceRightSidebarWidth)
  if (!fontSizePreset && !tabSpacingPreset && leftSidebarWidth === null && rightSidebarWidth === null)
    return null

  const normalized: WorkspaceDisplayPreferences = {}
  if (fontSizePreset)
    normalized.fontSizePreset = fontSizePreset
  if (tabSpacingPreset)
    normalized.tabSpacingPreset = tabSpacingPreset
  if (leftSidebarWidth !== null)
    normalized.leftSidebarWidth = leftSidebarWidth
  if (rightSidebarWidth !== null)
    normalized.rightSidebarWidth = rightSidebarWidth

  return {
    ...normalized,
    updatedAt: input.updatedAt,
  }
}

export function resolveWorkspaceFontSizePresetLabel(value: WorkspaceFontSizePreset | null | undefined): string {
  const matched = WORKSPACE_FONT_SIZE_PRESET_OPTIONS.find(item => item.value === value)
  return matched?.label || '未设置'
}

export function resolveWorkspaceTabSpacingPresetLabel(value: WorkspaceTabSpacingPreset | null | undefined): string {
  const matched = WORKSPACE_TAB_SPACING_PRESET_OPTIONS.find(item => item.value === value)
  return matched?.label || '未设置'
}

export function resolveWorkspaceDisplayPreferenceSourceLabel(
  source: WorkspaceDisplayPreferenceSource | '' | null | undefined,
): string {
  if (source === 'workspace_override')
    return '当前工作区个人覆盖'
  if (source === 'user_default')
    return '个人全局默认'
  if (source === 'team_default')
    return '团队默认'
  return '系统默认'
}

export function defaultWorkspaceDisplayPreferenceSnapshot(): WorkspaceDisplayPreferenceSnapshot {
  return {
    userDefault: null,
    teamDefault: null,
    workspaceOverride: null,
    effective: {
      fontSizePreset: 'lg',
      tabSpacingPreset: 'relaxed',
      leftSidebarWidth: DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH,
      rightSidebarWidth: DEFAULT_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
    },
    sources: {
      fontSizePreset: 'system_default',
      tabSpacingPreset: 'system_default',
      leftSidebarWidth: 'system_default',
      rightSidebarWidth: 'system_default',
    },
    canManageTeamDefault: false,
  }
}

export function normalizeWorkspaceDisplayPreferenceSnapshot(
  input: WorkspaceDisplayPreferenceSnapshot | null | undefined,
): WorkspaceDisplayPreferenceSnapshot {
  const fallback = defaultWorkspaceDisplayPreferenceSnapshot()
  if (!input)
    return fallback

  const effective = normalizeWorkspaceDisplayPreferences(input.effective)
  const fontSizeSource = input.sources?.fontSizePreset
  const validFontSizeSource = fontSizeSource === 'workspace_override'
    || fontSizeSource === 'user_default'
    || fontSizeSource === 'team_default'
    || fontSizeSource === 'system_default'
    ? fontSizeSource
    : 'system_default'
  const tabSpacingSource = input.sources?.tabSpacingPreset
  const validTabSpacingSource = tabSpacingSource === 'workspace_override'
    || tabSpacingSource === 'user_default'
    || tabSpacingSource === 'team_default'
    || tabSpacingSource === 'system_default'
    ? tabSpacingSource
    : 'system_default'
  const leftSidebarWidthSource = input.sources?.leftSidebarWidth
  const validLeftSidebarWidthSource = leftSidebarWidthSource === 'workspace_override'
    || leftSidebarWidthSource === 'user_default'
    || leftSidebarWidthSource === 'team_default'
    || leftSidebarWidthSource === 'system_default'
    ? leftSidebarWidthSource
    : 'system_default'
  const rightSidebarWidthSource = input.sources?.rightSidebarWidth
  const validRightSidebarWidthSource = rightSidebarWidthSource === 'workspace_override'
    || rightSidebarWidthSource === 'user_default'
    || rightSidebarWidthSource === 'team_default'
    || rightSidebarWidthSource === 'system_default'
    ? rightSidebarWidthSource
    : 'system_default'

  return {
    userDefault: normalizeWorkspaceDisplayPreferences(input.userDefault),
    teamDefault: normalizeWorkspaceDisplayPreferences(input.teamDefault),
    workspaceOverride: normalizeWorkspaceDisplayPreferences(input.workspaceOverride),
    effective: {
      ...fallback.effective,
      ...(effective || {}),
    },
    sources: {
      fontSizePreset: validFontSizeSource,
      tabSpacingPreset: validTabSpacingSource,
      leftSidebarWidth: validLeftSidebarWidthSource,
      rightSidebarWidth: validRightSidebarWidthSource,
    },
    canManageTeamDefault: Boolean(input.canManageTeamDefault),
  }
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<ApiResponse<T>> {
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw new Error(String(payload?.message || fallbackMessage))
  return payload
}

export function useWorkspaceDisplayPreferenceApi() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  async function loadUserDefaults(): Promise<WorkspaceDisplayPreferences | null> {
    const response = await fetch(String(endpoint('/user/workspace-display-preferences')), {
      credentials: 'include',
    })
    const payload = await parseApiResponse<WorkspaceDisplayPreferences | null>(response, '个人显示偏好加载失败。')
    return normalizeWorkspaceDisplayPreferences(payload.data)
  }

  async function patchUserDefaults(payload: WorkspaceDisplayPreferencePatchPayload): Promise<WorkspaceDisplayPreferences | null> {
    const response = await fetch(String(endpoint('/user/workspace-display-preferences')), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await parseApiResponse<WorkspaceDisplayPreferences | null>(response, '个人显示偏好保存失败。')
    return normalizeWorkspaceDisplayPreferences(result.data)
  }

  async function loadWorkspaceSnapshot(workspaceId: string): Promise<WorkspaceDisplayPreferenceSnapshot> {
    const response = await fetch(String(endpoint(`/teams/${workspaceId}/workspace-display-preferences`)), {
      credentials: 'include',
    })
    const payload = await parseApiResponse<WorkspaceDisplayPreferenceSnapshot>(response, '工作区显示偏好加载失败。')
    return normalizeWorkspaceDisplayPreferenceSnapshot(payload.data)
  }

  async function patchWorkspaceUserOverride(
    workspaceId: string,
    payload: WorkspaceDisplayPreferencePatchPayload,
  ): Promise<WorkspaceDisplayPreferenceSnapshot> {
    const response = await fetch(String(endpoint(`/teams/${workspaceId}/workspace-display-preferences/user`)), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await parseApiResponse<WorkspaceDisplayPreferenceSnapshot>(response, '工作区个人显示偏好保存失败。')
    return normalizeWorkspaceDisplayPreferenceSnapshot(result.data)
  }

  async function patchWorkspaceTeamDefault(
    workspaceId: string,
    payload: WorkspaceDisplayPreferencePatchPayload,
  ): Promise<WorkspaceDisplayPreferenceSnapshot> {
    const response = await fetch(String(endpoint(`/teams/${workspaceId}/workspace-display-preferences/default`)), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await parseApiResponse<WorkspaceDisplayPreferenceSnapshot>(response, '工作区默认显示偏好保存失败。')
    return normalizeWorkspaceDisplayPreferenceSnapshot(result.data)
  }

  return {
    loadUserDefaults,
    patchUserDefaults,
    loadWorkspaceSnapshot,
    patchWorkspaceUserOverride,
    patchWorkspaceTeamDefault,
  }
}
