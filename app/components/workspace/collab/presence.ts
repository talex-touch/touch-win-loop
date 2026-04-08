import type { ProjectMemberRole } from '~~/shared/types/domain'
import { resolveAvatarFallbackValue } from '../../../../shared/utils/user-avatar-fallback'

export type WorkspaceCollabPresenceActivityState = 'active' | 'background'

export interface WorkspaceCollabPresenceMember {
  peerId: string
  userId: string
  username: string
  cursorX?: number
  cursorY?: number
  awarenessClientId?: number
  awarenessUpdateBase64?: string
  updatedAt?: string
  activityState?: WorkspaceCollabPresenceActivityState
}

export interface WorkspaceCollabSelectionSummary {
  anchorLine: number
  anchorColumn: number
  headLine: number
  headColumn: number
  isCollapsed: boolean
  selectionLength: number
  selectedTextPreview: string
}

export interface WorkspaceCollabPresenceUser {
  userId: string
  username: string
  avatarUrl?: string | null
  role?: ProjectMemberRole | ''
  colorToken: string
  activityState: WorkspaceCollabPresenceActivityState
  updatedAt?: string
  peerCount: number
  isCurrentUser: boolean
  selection?: WorkspaceCollabSelectionSummary | null
}

export interface WorkspaceCollabCursorUser {
  userId: string
  username: string
  colorToken: string
  cursorX: number
  cursorY: number
}

export interface WorkspaceCollabAwarenessSelectionState {
  awarenessClientId: number
  userId: string
  selection: WorkspaceCollabSelectionSummary | null
}

const PRESENCE_COLOR_PALETTE = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0284c7',
  '#a16207',
  '#0891b2',
  '#7c2d12',
] as const

export function normalizeWorkspaceCollabPresenceActivityState(value: unknown): WorkspaceCollabPresenceActivityState {
  return String(value || '').trim().toLowerCase() === 'background' ? 'background' : 'active'
}

export function resolveWorkspaceCollabPresenceColor(userId: string): string {
  const normalized = String(userId || '').trim()
  if (!normalized)
    return PRESENCE_COLOR_PALETTE[0]

  let hash = 0
  for (let index = 0; index < normalized.length; index += 1)
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) >>> 0
  return PRESENCE_COLOR_PALETTE[hash % PRESENCE_COLOR_PALETTE.length] || PRESENCE_COLOR_PALETTE[0]
}

export function resolveWorkspaceCollabPresenceInitial(username: string): string {
  return resolveAvatarFallbackValue(username)
}
