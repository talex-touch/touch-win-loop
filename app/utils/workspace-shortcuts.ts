export type WorkspaceShortcutModifier = 'mod' | 'shift' | 'alt'

export interface WorkspaceShortcutDefinition {
  key: string
  modifiers?: WorkspaceShortcutModifier[]
}

const MAC_SHORTCUT_LABELS: Record<WorkspaceShortcutModifier, string> = {
  mod: '⌘',
  shift: '⇧',
  alt: '⌥',
}

const DEFAULT_SHORTCUT_LABELS: Record<WorkspaceShortcutModifier, string> = {
  mod: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
}

const SHORTCUT_KEY_LABELS: Record<string, string> = {
  contextmenu: 'Menu',
  escape: 'Esc',
  esc: 'Esc',
  ' ': 'Space',
  space: 'Space',
}

export function isWorkspaceMacLikePlatform(platform?: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(String(platform || '').trim())
}

function normalizeShortcutKeyLabel(value: string): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized)
    return ''

  const mapped = SHORTCUT_KEY_LABELS[normalized]
  if (mapped)
    return mapped

  if (normalized.length === 1)
    return normalized.toUpperCase()

  return normalized.slice(0, 1).toUpperCase() + normalized.slice(1)
}

export function formatWorkspaceShortcutLabel(
  shortcut: WorkspaceShortcutDefinition,
  platform?: string,
): string {
  const modifiers = Array.isArray(shortcut.modifiers) ? shortcut.modifiers : []
  const keyLabel = normalizeShortcutKeyLabel(shortcut.key)
  if (!keyLabel)
    return ''

  const macLike = isWorkspaceMacLikePlatform(platform)
  const modifierLabels = modifiers.map(modifier => (macLike ? MAC_SHORTCUT_LABELS : DEFAULT_SHORTCUT_LABELS)[modifier]).filter(Boolean)
  if (macLike)
    return `${modifierLabels.join('')}${keyLabel}`
  return [...modifierLabels, keyLabel].join('+')
}
