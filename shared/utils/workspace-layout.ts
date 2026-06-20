export const WORKSPACE_LEFT_SIDEBAR_RAIL_WIDTH = 56
export const DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH = 360
export const MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH = 280
export const MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH = 520

export const DEFAULT_WORKSPACE_RIGHT_SIDEBAR_WIDTH = 352
export const MIN_WORKSPACE_RIGHT_SIDEBAR_WIDTH = 320
export const MAX_WORKSPACE_RIGHT_SIDEBAR_WIDTH = 520

export const MIN_WORKSPACE_MAIN_PANEL_WIDTH = 520

function normalizeFiniteNumber(value: unknown): number | null {
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return null
  return normalized
}

function clampWorkspaceWidth(value: unknown, min: number, max: number, fallback: number): number {
  const normalized = normalizeFiniteNumber(value)
  if (normalized === null)
    return fallback
  return Math.min(max, Math.max(min, Math.round(normalized)))
}

export function normalizeWorkspaceLeftSidebarWidth(value: unknown): number {
  return clampWorkspaceWidth(
    value,
    MIN_WORKSPACE_LEFT_SIDEBAR_WIDTH,
    MAX_WORKSPACE_LEFT_SIDEBAR_WIDTH,
    DEFAULT_WORKSPACE_LEFT_SIDEBAR_WIDTH,
  )
}

export function normalizeWorkspaceRightSidebarWidth(value: unknown): number {
  return clampWorkspaceWidth(
    value,
    MIN_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
    MAX_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
    DEFAULT_WORKSPACE_RIGHT_SIDEBAR_WIDTH,
  )
}
