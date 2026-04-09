import type {
  ApiResponse,
  WorkspaceDisplayPreferences,
  WorkspaceDisplayPreferenceSnapshot,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'

export const WORKSPACE_FONT_SIZE_PRESET_OPTIONS: Array<{ value: WorkspaceFontSizePreset, label: string }> = [
  { value: 'xs', label: '更小' },
  { value: 'sm', label: '偏小' },
  { value: 'md', label: '默认' },
  { value: 'lg', label: '偏大' },
  { value: 'xl', label: '更大' },
]

export const WORKSPACE_TAB_SPACING_PRESET_OPTIONS: Array<{ value: WorkspaceTabSpacingPreset, label: string }> = [
  { value: 'compact', label: '紧凑' },
  { value: 'default', label: '默认' },
  { value: 'relaxed', label: '舒展' },
]

export type NullableWorkspaceFontSizePreset = WorkspaceFontSizePreset | ''
export type NullableWorkspaceTabSpacingPreset = WorkspaceTabSpacingPreset | ''

export interface WorkspaceDisplayPreferencePatchPayload {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
}

function findWorkspaceFontSizePreset(value: unknown): WorkspaceFontSizePreset | null {
  const normalized = String(value || '').trim()
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

export function normalizeWorkspaceDisplayPreferences(
  input: WorkspaceDisplayPreferences | null | undefined,
): WorkspaceDisplayPreferences | null {
  if (!input)
    return null

  const fontSizePreset = findWorkspaceFontSizePreset(input.fontSizePreset)
  const tabSpacingPreset = findWorkspaceTabSpacingPreset(input.tabSpacingPreset)
  if (!fontSizePreset && !tabSpacingPreset)
    return null

  const normalized: WorkspaceDisplayPreferences = {}
  if (fontSizePreset)
    normalized.fontSizePreset = fontSizePreset
  if (tabSpacingPreset)
    normalized.tabSpacingPreset = tabSpacingPreset

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
  source: WorkspaceDisplayPreferenceSnapshot['sources']['fontSizePreset'] | WorkspaceDisplayPreferenceSnapshot['sources']['tabSpacingPreset'] | '' | null | undefined,
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
      fontSizePreset: 'md',
      tabSpacingPreset: 'default',
    },
    sources: {
      fontSizePreset: 'system_default',
      tabSpacingPreset: 'system_default',
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

  return {
    userDefault: normalizeWorkspaceDisplayPreferences(input.userDefault),
    teamDefault: normalizeWorkspaceDisplayPreferences(input.teamDefault),
    workspaceOverride: normalizeWorkspaceDisplayPreferences(input.workspaceOverride),
    effective: effective || fallback.effective,
    sources: {
      fontSizePreset: validFontSizeSource,
      tabSpacingPreset: validTabSpacingSource,
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
