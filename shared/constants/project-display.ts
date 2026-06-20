import type {
  ProjectDisplayAccentColor,
  ProjectDisplayConfig,
  ProjectDisplayIcon,
  ProjectDisplayPresetAccentColor,
  ProjectDisplaySymbolIcon,
} from '~~/shared/types/domain'

export type ProjectDisplayIconKind = 'symbol' | 'text' | 'solid'

export interface ProjectDisplayIconOption {
  value: ProjectDisplayIcon
  label: string
  kind: ProjectDisplayIconKind
}

export const PROJECT_DISPLAY_SYMBOL_ICON_OPTIONS: Array<{ value: ProjectDisplaySymbolIcon, label: string, kind: 'symbol' }> = ([
  { value: 'rocket_launch', label: '火箭' },
  { value: 'shield', label: '盾牌' },
  { value: 'lightbulb', label: '灵感' },
  { value: 'architecture', label: '结构' },
  { value: 'hub', label: '网络' },
  { value: 'science', label: '实验' },
  { value: 'public', label: '全球' },
  { value: 'school', label: '校园' },
  { value: 'auto_awesome', label: '闪耀' },
  { value: 'bolt', label: '闪电' },
  { value: 'code', label: '代码' },
  { value: 'terminal', label: '终端' },
  { value: 'data_object', label: '数据' },
  { value: 'database', label: '数据库' },
  { value: 'memory', label: '芯片' },
  { value: 'psychology', label: '认知' },
  { value: 'smart_toy', label: '智能' },
  { value: 'draw', label: '绘制' },
  { value: 'brush', label: '画笔' },
  { value: 'design_services', label: '设计' },
  { value: 'dashboard_customize', label: '看板' },
  { value: 'analytics', label: '分析' },
  { value: 'monitoring', label: '监控' },
  { value: 'account_tree', label: '树状' },
  { value: 'schema', label: '模型' },
  { value: 'deployed_code', label: '部署' },
  { value: 'extension', label: '插件' },
  { value: 'stacks', label: '堆栈' },
  { value: 'token', label: '令牌' },
  { value: 'biotech', label: '生物' },
  { value: 'travel_explore', label: '探索' },
  { value: 'workspace_premium', label: '奖项' },
] satisfies Array<{ value: ProjectDisplaySymbolIcon, label: string }>)
  .map(item => ({ ...item, kind: 'symbol' as const }))

export const PROJECT_DISPLAY_ICON_OPTIONS: ProjectDisplayIconOption[] = [
  ...PROJECT_DISPLAY_SYMBOL_ICON_OPTIONS,
  { value: 'text', label: '文字', kind: 'text' },
  { value: 'solid', label: '纯色', kind: 'solid' },
]

export const PROJECT_DISPLAY_ACCENT_OPTIONS: Array<{
  value: ProjectDisplayPresetAccentColor
  label: string
  solid: string
  soft: string
  border: string
  text: string
}> = [
  { value: 'blue', label: '深蓝', solid: '#5b82f6', soft: '#f5f9ff', border: '#dce8ff', text: '#365fd6' },
  { value: 'indigo', label: '靛蓝', solid: '#6366f1', soft: '#f5f7ff', border: '#dfe3ff', text: '#4f46e5' },
  { value: 'cyan', label: '青蓝', solid: '#2ca6bf', soft: '#f2fcff', border: '#d4f2f8', text: '#1f7f93' },
  { value: 'violet', label: '紫罗兰', solid: '#9170ea', soft: '#f8f4ff', border: '#e6dcff', text: '#6f4ec7' },
  { value: 'emerald', label: '翠绿', solid: '#34a981', soft: '#f2fcf7', border: '#d7f3e7', text: '#1d8661' },
  { value: 'lime', label: '青柠', solid: '#84cc16', soft: '#f8fde8', border: '#e7f5c8', text: '#5d8c0a' },
  { value: 'amber', label: '琥珀', solid: '#d59a3f', soft: '#fffbf2', border: '#f7e7c4', text: '#a56d17' },
  { value: 'orange', label: '橙色', solid: '#f58b3a', soft: '#fff7f1', border: '#ffe2cc', text: '#d46b08' },
  { value: 'pink', label: '粉色', solid: '#ec4899', soft: '#fff2f8', border: '#ffd7ea', text: '#be185d' },
  { value: 'rose', label: '玫瑰', solid: '#e06a8a', soft: '#fff5f8', border: '#f8dae2', text: '#bf4768' },
  { value: 'slate', label: '石墨', solid: '#7a879a', soft: '#f8fafc', border: '#e3e8ef', text: '#556274' },
  { value: 'teal', label: '湖绿', solid: '#2d9d93', soft: '#f1fcfa', border: '#d2f1ed', text: '#1f776f' },
]

const PROJECT_DISPLAY_ICON_SET = new Set(PROJECT_DISPLAY_ICON_OPTIONS.map(item => item.value))
const PROJECT_DISPLAY_ACCENT_SET = new Set(PROJECT_DISPLAY_ACCENT_OPTIONS.map(item => item.value))

export function getProjectDisplayIconKind(value: string): ProjectDisplayIconKind {
  if (value === 'text')
    return 'text'
  if (value === 'solid')
    return 'solid'
  return 'symbol'
}

function hashText(value: string): number {
  let hash = 0
  for (const char of value)
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

export function normalizeProjectDisplayConfig(value: unknown): ProjectDisplayConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const source = value as Record<string, unknown>
  const icon = String(source.icon || '').trim() as ProjectDisplayIcon
  const accentColor = normalizeProjectDisplayAccentColor(source.accentColor)

  if (!PROJECT_DISPLAY_ICON_SET.has(icon) || !accentColor)
    return null

  return {
    icon,
    accentColor,
  }
}

export function buildFallbackProjectDisplay(seed: string): ProjectDisplayConfig {
  const normalizedSeed = String(seed || '').trim() || 'project'
  const hash = hashText(normalizedSeed)
  const icon = PROJECT_DISPLAY_SYMBOL_ICON_OPTIONS[hash % PROJECT_DISPLAY_SYMBOL_ICON_OPTIONS.length]?.value || 'rocket_launch'
  const accentColor = PROJECT_DISPLAY_ACCENT_OPTIONS[hash % PROJECT_DISPLAY_ACCENT_OPTIONS.length]?.value || 'blue'

  return {
    icon,
    accentColor,
  }
}

export function resolveProjectDisplayConfig(value: ProjectDisplayConfig | null | undefined, seed: string): ProjectDisplayConfig {
  return normalizeProjectDisplayConfig(value) || buildFallbackProjectDisplay(seed)
}

export function getProjectDisplayAccent(value: ProjectDisplayAccentColor) {
  const preset = PROJECT_DISPLAY_ACCENT_OPTIONS.find(item => item.value === value)
  if (preset)
    return preset

  const normalized = normalizeProjectDisplayAccentColor(value)
  if (!normalized)
    return PROJECT_DISPLAY_ACCENT_OPTIONS[0]!

  const solid = mixHex(normalized, '#ffffff', 0.22)
  const soft = mixHex(normalized, '#ffffff', 0.92)
  const border = mixHex(normalized, '#ffffff', 0.78)
  const text = mixHex(normalized, '#111827', 0.28)

  return {
    value: normalized,
    label: '自定义',
    solid,
    soft,
    border,
    text,
  }
}

export function isProjectDisplayPresetAccentColor(value: string): value is ProjectDisplayPresetAccentColor {
  return PROJECT_DISPLAY_ACCENT_SET.has(value as ProjectDisplayPresetAccentColor)
}

export function normalizeProjectDisplayAccentColor(value: unknown): ProjectDisplayAccentColor | '' {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized)
    return ''
  if (isProjectDisplayPresetAccentColor(normalized))
    return normalized

  const hex = normalizeHexColor(normalized)
  return hex || ''
}

export function buildProjectMonogram(title: string): string {
  const normalized = String(title || '').trim()
  if (!normalized)
    return 'P'

  const compact = normalized.replace(/\s+/g, ' ').trim()
  if (/[\u4E00-\u9FA5]/.test(compact))
    return compact.slice(0, 2)

  const parts = compact.split(' ').filter(Boolean)
  if (parts.length >= 2)
    return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()

  return compact.slice(0, 2).toUpperCase()
}

function normalizeHexColor(value: string): `#${string}` | '' {
  const normalized = value.trim().toLowerCase()
  if (!/^#(?:[\dA-F]{3}|[\dA-F]{6})$/i.test(normalized))
    return ''
  if (normalized.length === 4) {
    const [, r, g, b] = normalized
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return normalized as `#${string}`
}

function hexToRgb(value: string): [number, number, number] | null {
  const normalized = normalizeHexColor(value)
  if (!normalized)
    return null

  const raw = normalized.slice(1)
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ]
}

function mixHex(base: string, target: string, ratio: number): `#${string}` {
  const baseRgb = hexToRgb(base) || [91, 130, 246]
  const targetRgb = hexToRgb(target) || [255, 255, 255]
  const normalizedRatio = Math.max(0, Math.min(1, ratio))
  const mixed = baseRgb.map((channel, index) => {
    return Math.round(channel * (1 - normalizedRatio) + targetRgb[index]! * normalizedRatio)
  })

  return `#${mixed.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}
