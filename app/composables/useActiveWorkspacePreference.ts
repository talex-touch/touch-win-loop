const ACTIVE_WORKSPACE_STORAGE_KEY = 'wl.activeWorkspaceId'

export function readActiveWorkspacePreference(): string {
  if (!import.meta.client)
    return ''

  try {
    return String(window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || '').trim()
  }
  catch {
    return ''
  }
}

export function writeActiveWorkspacePreference(workspaceId: string): void {
  if (!import.meta.client)
    return

  const normalizedWorkspaceId = String(workspaceId || '').trim()
  try {
    if (!normalizedWorkspaceId) {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, normalizedWorkspaceId)
  }
  catch {
    // ignore storage failures
  }
}
