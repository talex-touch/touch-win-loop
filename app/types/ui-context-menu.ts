export interface ContextMenuAnchorPoint {
  x: number
  y: number
}

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  checked?: boolean
  shortcutLabel?: string
  disabled?: boolean
  tone?: 'default' | 'danger'
  separatorBefore?: boolean
}

export interface ContextMenuRequest {
  items: ContextMenuItem[]
  anchorPoint?: ContextMenuAnchorPoint | null
  anchorEl?: HTMLElement | null
  restoreFocusEl?: HTMLElement | null
  source?: string
  onSelect?: (key: string) => void | Promise<void>
  onClose?: () => void
}
