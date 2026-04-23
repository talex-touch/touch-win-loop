import type {
  CanvasLibraryDeviceShellAssetPayload,
  DesignAssetDeviceShellViewportRect,
  DeviceFramePreset,
} from '../types/domain'

export const DEVICE_ARRANGEMENT_MIME_TYPE = 'application/vnd.winloop.device-arrangement+json'
export const DEVICE_ARRANGEMENT_SCHEMA_VERSION = 1

export type DeviceArrangementLayoutPresetKey = 'solo' | 'duo-overlap' | 'trio-fan' | 'desktop-phone' | 'grid'
export type DeviceArrangementExportSizePresetKey = 'square' | 'portrait-4-5' | 'wide-16-9' | 'story-9-16' | 'custom'
export type DeviceArrangementShadowPresetKey = 'none' | 'soft' | 'deep'
export type DeviceArrangementBackgroundMode = 'solid' | 'gradient' | 'transparent'
export type DeviceArrangementTemplateCategoryKey = 'launch' | 'social' | 'store' | 'deck' | 'brand'

export interface DeviceArrangementShellV1 {
  mode: 'builtin' | 'external' | 'none'
  assetId?: string
  imageSrc?: string
  viewportRect?: DesignAssetDeviceShellViewportRect | null
  cornerRadius?: number
  presetKey?: string
}

export interface DeviceArrangementItemV1 {
  id: string
  name: string
  screenshotSrc: string
  screenshotWidth?: number
  screenshotHeight?: number
  devicePresetKey: string
  shell: DeviceArrangementShellV1
  x: number
  y: number
  width: number
  height: number
  rotation: number
  offsetX: number
  offsetY: number
  scale: number
  rotationOffset: number
}

export interface DeviceArrangementCanvasV1 {
  width: number
  height: number
  sizePresetKey: DeviceArrangementExportSizePresetKey
  background: string
  backgroundMode: DeviceArrangementBackgroundMode
}

export interface DeviceArrangementDocumentV1 {
  schemaVersion: 1
  title: string
  canvas: DeviceArrangementCanvasV1
  layoutPresetKey: DeviceArrangementLayoutPresetKey
  shadowPresetKey: DeviceArrangementShadowPresetKey
  watermarkText?: string
  items: DeviceArrangementItemV1[]
  exportSizePresetKeys: DeviceArrangementExportSizePresetKey[]
  createdAt?: string
  updatedAt?: string
}

export interface DeviceArrangementPersistedPayload {
  resourceId: string
  projectId: string
  revision: number
  document: DeviceArrangementDocumentV1
  previewSvg: string
  updatedAt: string
}

export const DEVICE_ARRANGEMENT_LAYOUT_PRESETS: Array<{
  key: DeviceArrangementLayoutPresetKey
  title: string
  description: string
}> = [
  { key: 'solo', title: '单设备居中', description: '一张截图，居中展示。' },
  { key: 'duo-overlap', title: '双设备重叠', description: '两台设备轻微叠放。' },
  { key: 'trio-fan', title: '三设备扇形', description: '三张截图形成扇形阵列。' },
  { key: 'desktop-phone', title: '桌面 + 手机', description: '桌面端主体，手机端叠放。' },
  { key: 'grid', title: '网格排布', description: '多设备均匀排列。' },
]

export const DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS: Array<{
  key: DeviceArrangementExportSizePresetKey
  title: string
  width: number
  height: number
}> = [
  { key: 'square', title: '1:1', width: 1600, height: 1600 },
  { key: 'portrait-4-5', title: '4:5', width: 1600, height: 2000 },
  { key: 'wide-16-9', title: '16:9', width: 1920, height: 1080 },
  { key: 'story-9-16', title: '9:16', width: 1080, height: 1920 },
  { key: 'custom', title: '自定义', width: 1600, height: 1600 },
]

export const DEVICE_ARRANGEMENT_SHADOW_PRESETS: Array<{
  key: DeviceArrangementShadowPresetKey
  title: string
  filter: string
}> = [
  { key: 'none', title: '无阴影', filter: '' },
  { key: 'soft', title: '柔和阴影', filter: '0 22 54 rgba(15, 23, 42, 0.18)' },
  { key: 'deep', title: '强阴影', filter: '0 42 110 rgba(15, 23, 42, 0.28)' },
]

export const DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS: DeviceFramePreset[] = [
  {
    key: 'iphone-16-pro',
    title: 'iPhone 16 Pro',
    group: 'iPhone',
    platform: 'ios',
    deviceFamily: 'phone',
    screenWidth: 393,
    screenHeight: 852,
    framePadding: 18,
    bezelRadius: 54,
    screenRadius: 42,
    background: '#020617',
    shadow: '',
    builtinShellKey: 'iphone-generic-shell',
  },
  {
    key: 'android-phone',
    title: 'Android Phone',
    group: 'Android Phone',
    platform: 'android',
    deviceFamily: 'phone',
    screenWidth: 412,
    screenHeight: 915,
    framePadding: 16,
    bezelRadius: 42,
    screenRadius: 30,
    background: '#111827',
    shadow: '',
    builtinShellKey: 'android-phone-shell',
  },
  {
    key: 'ipad-pro',
    title: 'iPad Pro',
    group: 'iPad',
    platform: 'ipados',
    deviceFamily: 'tablet',
    screenWidth: 1024,
    screenHeight: 1366,
    framePadding: 26,
    bezelRadius: 46,
    screenRadius: 28,
    background: '#111827',
    shadow: '',
    builtinShellKey: 'ipad-generic-shell',
  },
  {
    key: 'macbook-pro',
    title: 'MacBook Pro',
    group: 'Surface/Desktop',
    platform: 'web',
    deviceFamily: 'desktop',
    screenWidth: 1440,
    screenHeight: 900,
    framePadding: 22,
    bezelRadius: 26,
    screenRadius: 16,
    background: '#0f172a',
    shadow: '',
    builtinShellKey: 'desktop-generic-shell',
  },
  {
    key: 'browser-window',
    title: 'Browser Window',
    group: 'Browser',
    platform: 'web',
    deviceFamily: 'browser',
    screenWidth: 1440,
    screenHeight: 900,
    framePadding: 0,
    bezelRadius: 28,
    screenRadius: 28,
    background: '#e2e8f0',
    shadow: '',
    builtinShellKey: 'browser-window-shell',
  },
]

export const DEVICE_ARRANGEMENT_TEMPLATE_PRESETS: Array<{
  key: string
  categoryKey: DeviceArrangementTemplateCategoryKey
  title: string
  summary: string
  tags: string[]
  layoutPresetKey: DeviceArrangementLayoutPresetKey
  sizePresetKey: DeviceArrangementExportSizePresetKey
  background: string
  backgroundMode: DeviceArrangementBackgroundMode
  shadowPresetKey: DeviceArrangementShadowPresetKey
  watermarkText?: string
}> = [
  { key: 'launch-clean', categoryKey: 'launch', title: '新品封面', summary: '单机居中，适合首图。', tags: ['首图', '发布'], layoutPresetKey: 'solo', sizePresetKey: 'square', background: '#f8fafc', backgroundMode: 'solid', shadowPresetKey: 'soft' },
  { key: 'social-overlap', categoryKey: 'social', title: '叠屏预告', summary: '双机错位，适合社媒。', tags: ['社媒', '预告'], layoutPresetKey: 'duo-overlap', sizePresetKey: 'portrait-4-5', background: '#e0f2fe', backgroundMode: 'gradient', shadowPresetKey: 'deep' },
  { key: 'feature-fan', categoryKey: 'deck', title: '功能合集', summary: '三屏扇形，适合亮点页。', tags: ['功能', '宽屏'], layoutPresetKey: 'trio-fan', sizePresetKey: 'wide-16-9', background: '#ecfdf5', backgroundMode: 'solid', shadowPresetKey: 'soft' },
  { key: 'desktop-pair', categoryKey: 'deck', title: '桌面联动', summary: '桌面主画面搭配手机。', tags: ['桌面', '联动'], layoutPresetKey: 'desktop-phone', sizePresetKey: 'wide-16-9', background: '#fdf2f8', backgroundMode: 'gradient', shadowPresetKey: 'soft' },
  { key: 'store-grid', categoryKey: 'store', title: '截图矩阵', summary: '多图规整，适合商店图。', tags: ['商店', '矩阵'], layoutPresetKey: 'grid', sizePresetKey: 'portrait-4-5', background: '#fefce8', backgroundMode: 'solid', shadowPresetKey: 'none' },
  { key: 'brand-hero', categoryKey: 'brand', title: '品牌主视觉', summary: '大留白渐变，适合官网首屏。', tags: ['品牌', '官网'], layoutPresetKey: 'solo', sizePresetKey: 'wide-16-9', background: '#e0e7ff', backgroundMode: 'gradient', shadowPresetKey: 'deep', watermarkText: 'WinLoop' },
]

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sanitizeId(value: unknown, fallback: string): string {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || fallback
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function resolveSizePreset(value: unknown): DeviceArrangementExportSizePresetKey {
  const normalized = normalizeString(value)
  return DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS.some(item => item.key === normalized)
    ? normalized as DeviceArrangementExportSizePresetKey
    : 'square'
}

function resolveLayoutPreset(value: unknown): DeviceArrangementLayoutPresetKey {
  const normalized = normalizeString(value)
  return DEVICE_ARRANGEMENT_LAYOUT_PRESETS.some(item => item.key === normalized)
    ? normalized as DeviceArrangementLayoutPresetKey
    : 'solo'
}

function resolveShadowPreset(value: unknown): DeviceArrangementShadowPresetKey {
  const normalized = normalizeString(value)
  return DEVICE_ARRANGEMENT_SHADOW_PRESETS.some(item => item.key === normalized)
    ? normalized as DeviceArrangementShadowPresetKey
    : 'soft'
}

function resolveBackgroundMode(value: unknown): DeviceArrangementBackgroundMode {
  const normalized = normalizeString(value)
  if (normalized === 'gradient' || normalized === 'transparent' || normalized === 'solid')
    return normalized
  return 'solid'
}

export function resolveDeviceArrangementSize(
  sizePresetKey: unknown,
  customWidth?: unknown,
  customHeight?: unknown,
): { width: number, height: number, sizePresetKey: DeviceArrangementExportSizePresetKey } {
  const presetKey = resolveSizePreset(sizePresetKey)
  if (presetKey === 'custom') {
    return {
      width: clamp(Math.round(toFiniteNumber(customWidth, 1600)), 320, 6000),
      height: clamp(Math.round(toFiniteNumber(customHeight, 1600)), 320, 6000),
      sizePresetKey: presetKey,
    }
  }
  const preset = DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS.find(item => item.key === presetKey)
    || DEVICE_ARRANGEMENT_EXPORT_SIZE_PRESETS[0]!
  return { width: preset.width, height: preset.height, sizePresetKey: preset.key }
}

export function resolveDeviceArrangementPreset(key: unknown, presets: DeviceFramePreset[] = []): DeviceFramePreset {
  const normalized = normalizeString(key)
  return presets.find(item => item.key === normalized)
    || DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS.find(item => item.key === normalized)
    || DEVICE_ARRANGEMENT_BUILTIN_DEVICE_PRESETS[0]!
}

function resolveFitSize(preset: DeviceFramePreset, maxWidth: number, maxHeight: number): { width: number, height: number } {
  const aspect = Math.max(0.12, preset.screenWidth / Math.max(1, preset.screenHeight))
  const widthByHeight = maxHeight * aspect
  if (widthByHeight <= maxWidth)
    return { width: Math.round(widthByHeight), height: Math.round(maxHeight) }
  return { width: Math.round(maxWidth), height: Math.round(maxWidth / aspect) }
}

function basePlacement(
  item: DeviceArrangementItemV1,
  index: number,
  count: number,
  canvas: DeviceArrangementCanvasV1,
  layoutPresetKey: DeviceArrangementLayoutPresetKey,
): { x: number, y: number, width: number, height: number, rotation: number } {
  const preset = resolveDeviceArrangementPreset(item.devicePresetKey)
  const centered = (centerX: number, centerY: number, maxWidthRatio: number, maxHeightRatio: number, rotation = 0) => {
    const size = resolveFitSize(preset, canvas.width * maxWidthRatio, canvas.height * maxHeightRatio)
    return {
      x: Math.round(centerX - size.width / 2),
      y: Math.round(centerY - size.height / 2),
      width: size.width,
      height: size.height,
      rotation,
    }
  }

  if (layoutPresetKey === 'desktop-phone' && count > 1) {
    if (index === 0)
      return centered(canvas.width * 0.46, canvas.height * 0.46, 0.72, 0.54, 0)
    if (index === 1)
      return centered(canvas.width * 0.72, canvas.height * 0.58, 0.28, 0.62, 5)
  }

  if (layoutPresetKey === 'duo-overlap' && count > 1) {
    return centered(
      canvas.width * (count === 2 ? (index === 0 ? 0.43 : 0.57) : (0.32 + index * 0.18)),
      canvas.height * 0.53,
      0.34,
      0.64,
      index % 2 === 0 ? -7 : 7,
    )
  }

  if (layoutPresetKey === 'trio-fan' && count > 1) {
    const rotations = count === 2 ? [-8, 8] : [-12, 0, 12]
    return centered(
      canvas.width * (count === 2 ? (index === 0 ? 0.42 : 0.58) : (0.34 + index * (0.32 / Math.max(1, count - 1)))),
      canvas.height * (index === 1 && count >= 3 ? 0.49 : 0.54),
      0.3,
      0.58,
      rotations[index] ?? 0,
    )
  }

  if (layoutPresetKey === 'grid' && count > 1) {
    const columns = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / columns)
    const marginX = canvas.width * 0.14
    const marginY = canvas.height * 0.16
    const cellWidth = (canvas.width - marginX * 2) / columns
    const cellHeight = (canvas.height - marginY * 2) / rows
    const column = index % columns
    const row = Math.floor(index / columns)
    return centered(
      marginX + cellWidth * column + cellWidth / 2,
      marginY + cellHeight * row + cellHeight / 2,
      (cellWidth / canvas.width) * 0.78,
      (cellHeight / canvas.height) * 0.82,
      0,
    )
  }

  return centered(
    canvas.width * (count === 1 ? 0.5 : (0.26 + index * (0.48 / Math.max(1, count - 1)))),
    canvas.height * 0.52,
    count === 1 ? 0.48 : 0.28,
    count === 1 ? 0.68 : 0.54,
    0,
  )
}

export function layoutDeviceArrangementItems(
  items: DeviceArrangementItemV1[],
  canvas: DeviceArrangementCanvasV1,
  layoutPresetKey: DeviceArrangementLayoutPresetKey,
): DeviceArrangementItemV1[] {
  const count = Math.max(1, items.length)
  return items.map((item, index) => {
    const placement = basePlacement(item, index, count, canvas, layoutPresetKey)
    const scale = clamp(toFiniteNumber(item.scale, 1), 0.25, 3)
    return {
      ...item,
      x: Math.round(placement.x + toFiniteNumber(item.offsetX, 0)),
      y: Math.round(placement.y + toFiniteNumber(item.offsetY, 0)),
      width: Math.max(1, Math.round(placement.width * scale)),
      height: Math.max(1, Math.round(placement.height * scale)),
      rotation: Math.round(placement.rotation + toFiniteNumber(item.rotationOffset, 0)),
    }
  })
}

function normalizeShell(value: unknown, fallbackPresetKey: string): DeviceArrangementShellV1 {
  const source = normalizeRecord(value)
  const mode = normalizeString(source.mode)
  return {
    mode: mode === 'external' || mode === 'none' ? mode : 'builtin',
    assetId: normalizeString(source.assetId) || undefined,
    imageSrc: normalizeString(source.imageSrc || source.src) || undefined,
    viewportRect: normalizeRecord(source.viewportRect) as DesignAssetDeviceShellViewportRect || null,
    cornerRadius: Math.max(0, toFiniteNumber(source.cornerRadius, 0)) || undefined,
    presetKey: normalizeString(source.presetKey) || fallbackPresetKey,
  }
}

export function createDeviceArrangementItem(input: Partial<DeviceArrangementItemV1> & {
  screenshotSrc: string
  shellAssetPayload?: CanvasLibraryDeviceShellAssetPayload | null
  shellAssetUrl?: string
}): DeviceArrangementItemV1 {
  const devicePresetKey = normalizeString(input.devicePresetKey) || 'iphone-16-pro'
  const payload = input.shellAssetPayload || null
  const shell = input.shell || {
    mode: payload || input.shellAssetUrl ? 'external' : 'builtin',
    imageSrc: normalizeString(input.shellAssetUrl || payload?.src) || undefined,
    viewportRect: payload?.viewportRect || null,
    cornerRadius: payload?.cornerRadius,
    presetKey: devicePresetKey,
  }
  return {
    id: sanitizeId(input.id, `device-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: normalizeString(input.name) || '截图',
    screenshotSrc: normalizeString(input.screenshotSrc),
    screenshotWidth: Math.max(0, Math.round(toFiniteNumber(input.screenshotWidth, 0))) || undefined,
    screenshotHeight: Math.max(0, Math.round(toFiniteNumber(input.screenshotHeight, 0))) || undefined,
    devicePresetKey,
    shell: normalizeShell(shell, devicePresetKey),
    x: Math.round(toFiniteNumber(input.x, 0)),
    y: Math.round(toFiniteNumber(input.y, 0)),
    width: Math.max(1, Math.round(toFiniteNumber(input.width, 320))),
    height: Math.max(1, Math.round(toFiniteNumber(input.height, 640))),
    rotation: Math.round(toFiniteNumber(input.rotation, 0)),
    offsetX: Math.round(toFiniteNumber(input.offsetX, 0)),
    offsetY: Math.round(toFiniteNumber(input.offsetY, 0)),
    scale: Number(clamp(toFiniteNumber(input.scale, 1), 0.25, 3).toFixed(2)),
    rotationOffset: Math.round(clamp(toFiniteNumber(input.rotationOffset, 0), -45, 45)),
  }
}

export function normalizeDeviceArrangementDocument(input: unknown = {}, options: {
  title?: string
  relayout?: boolean
} = {}): DeviceArrangementDocumentV1 {
  const source = normalizeRecord(input)
  const canvasSource = normalizeRecord(source.canvas)
  const size = resolveDeviceArrangementSize(
    canvasSource.sizePresetKey || source.exportSizePresetKey,
    canvasSource.width || source.customWidth,
    canvasSource.height || source.customHeight,
  )
  const canvas: DeviceArrangementCanvasV1 = {
    width: size.width,
    height: size.height,
    sizePresetKey: size.sizePresetKey,
    background: normalizeString(canvasSource.background || source.background) || '#f8fafc',
    backgroundMode: resolveBackgroundMode(canvasSource.backgroundMode || source.backgroundMode),
  }
  const layoutPresetKey = resolveLayoutPreset(source.layoutPresetKey)
  const items = ensureArray(source.items)
    .map((item, index) => createDeviceArrangementItem({
      ...normalizeRecord(item),
      id: normalizeString(normalizeRecord(item).id) || `device-${index + 1}`,
      screenshotSrc: normalizeString(normalizeRecord(item).screenshotSrc || normalizeRecord(item).src),
      name: normalizeString(normalizeRecord(item).name || normalizeRecord(item).screenshotName) || `截图 ${index + 1}`,
    }))
    .filter(item => Boolean(item.screenshotSrc))
    .slice(0, 12)
  const exportSizePresetKeys = ensureArray(source.exportSizePresetKeys)
    .map(resolveSizePreset)
    .filter((item, index, all) => all.indexOf(item) === index)
  const document: DeviceArrangementDocumentV1 = {
    schemaVersion: DEVICE_ARRANGEMENT_SCHEMA_VERSION,
    title: normalizeString(options.title || source.title) || '设备排布',
    canvas,
    layoutPresetKey,
    shadowPresetKey: resolveShadowPreset(source.shadowPresetKey),
    watermarkText: normalizeString(source.watermarkText) || undefined,
    items,
    exportSizePresetKeys: exportSizePresetKeys.length > 0 ? exportSizePresetKeys : [canvas.sizePresetKey],
    createdAt: normalizeString(source.createdAt) || undefined,
    updatedAt: normalizeString(source.updatedAt) || undefined,
  }
  if (options.relayout === false)
    return document
  return {
    ...document,
    items: layoutDeviceArrangementItems(document.items, document.canvas, document.layoutPresetKey),
  }
}

function renderBackground(document: DeviceArrangementDocumentV1): string {
  const { canvas } = document
  if (canvas.backgroundMode === 'transparent')
    return ''
  if (canvas.backgroundMode === 'gradient') {
    return `<defs><linearGradient id="deviceArrangementBg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${escapeXml(canvas.background)}"/><stop offset="100%" stop-color="#ffffff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#deviceArrangementBg)"/>`
  }
  return `<rect width="100%" height="100%" fill="${escapeXml(canvas.background)}"/>`
}

function renderBuiltinShell(item: DeviceArrangementItemV1, preset: DeviceFramePreset): string {
  const padding = Math.max(0, preset.framePadding)
  const screenX = padding
  const screenY = padding
  const screenWidth = Math.max(1, item.width - padding * 2)
  const screenHeight = Math.max(1, item.height - padding * 2)
  return [
    `<rect x="0" y="0" width="${item.width}" height="${item.height}" rx="${preset.bezelRadius}" fill="${escapeXml(preset.background)}"/>`,
    `<clipPath id="screen-${escapeXml(item.id)}"><rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="${preset.screenRadius}"/></clipPath>`,
    `<image href="${escapeXml(item.screenshotSrc)}" x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#screen-${escapeXml(item.id)})"/>`,
  ].join('')
}

function renderExternalShell(item: DeviceArrangementItemV1, preset: DeviceFramePreset): string {
  const rect = item.shell.viewportRect
  const screenX = rect ? rect.x * item.width : preset.framePadding
  const screenY = rect ? rect.y * item.height : preset.framePadding
  const screenWidth = rect ? rect.width * item.width : Math.max(1, item.width - preset.framePadding * 2)
  const screenHeight = rect ? rect.height * item.height : Math.max(1, item.height - preset.framePadding * 2)
  const screenRadius = item.shell.cornerRadius || preset.screenRadius
  return [
    `<clipPath id="screen-${escapeXml(item.id)}"><rect x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" rx="${screenRadius}"/></clipPath>`,
    `<image href="${escapeXml(item.screenshotSrc)}" x="${screenX}" y="${screenY}" width="${screenWidth}" height="${screenHeight}" preserveAspectRatio="xMidYMid slice" clip-path="url(#screen-${escapeXml(item.id)})"/>`,
    item.shell.imageSrc
      ? `<image href="${escapeXml(item.shell.imageSrc)}" x="0" y="0" width="${item.width}" height="${item.height}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="0" y="0" width="${item.width}" height="${item.height}" rx="${preset.bezelRadius}" fill="none" stroke="rgba(15,23,42,.18)" stroke-width="2"/>`,
  ].join('')
}

function renderDeviceItem(item: DeviceArrangementItemV1, document: DeviceArrangementDocumentV1): string {
  const preset = resolveDeviceArrangementPreset(item.devicePresetKey)
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  const shadowPreset = DEVICE_ARRANGEMENT_SHADOW_PRESETS.find(entry => entry.key === document.shadowPresetKey)
  const filter = shadowPreset?.key && shadowPreset.key !== 'none' ? 'filter="url(#deviceShadow)"' : ''
  const content = item.shell.mode === 'external'
    ? renderExternalShell(item, preset)
    : item.shell.mode === 'none'
      ? `<image href="${escapeXml(item.screenshotSrc)}" x="0" y="0" width="${item.width}" height="${item.height}" preserveAspectRatio="xMidYMid slice"/>`
      : renderBuiltinShell(item, preset)
  return `<g transform="translate(${item.x} ${item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2})" ${filter}>${content}</g><title>${escapeXml(item.name)} ${Math.round(cx)},${Math.round(cy)}</title>`
}

export function renderDeviceArrangementDocumentToSvg(input: DeviceArrangementDocumentV1 | unknown): string {
  const document = normalizeDeviceArrangementDocument(input, { relayout: false })
  const shadow = DEVICE_ARRANGEMENT_SHADOW_PRESETS.find(item => item.key === document.shadowPresetKey)
  const shadowDef = shadow?.key && shadow.key !== 'none'
    ? '<filter id="deviceShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="rgba(15,23,42,.28)"/></filter>'
    : ''
  const watermark = document.watermarkText
    ? `<text x="${document.canvas.width - 64}" y="${document.canvas.height - 64}" text-anchor="end" font-family="Manrope, sans-serif" font-size="32" font-weight="700" fill="rgba(71,85,105,.72)">${escapeXml(document.watermarkText)}</text>`
    : ''
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${document.canvas.width}" height="${document.canvas.height}" viewBox="0 0 ${document.canvas.width} ${document.canvas.height}" role="img" aria-label="${escapeXml(document.title)}">`,
    shadowDef ? `<defs>${shadowDef}</defs>` : '',
    renderBackground(document),
    ...document.items.map(item => renderDeviceItem(item, document)),
    watermark,
    '</svg>',
  ].join('')
}

function parseSceneSourceModel(value: unknown): Record<string, unknown> {
  const document = normalizeRecord(value)
  return normalizeRecord(document.sourceModel)
}

function collectSceneElementsByFrame(sourceModel: Record<string, unknown>): Map<string, Record<string, unknown>[]> {
  const result = new Map<string, Record<string, unknown>[]>()
  for (const element of ensureArray(sourceModel.elements).map(normalizeRecord)) {
    const frameId = normalizeString(element.frameId)
    if (!frameId)
      continue
    const list = result.get(frameId) || []
    list.push(element)
    result.set(frameId, list)
  }
  return result
}

export function migrateSceneDocumentToDeviceArrangementDocument(sceneDocument: unknown, title = '设备排布'): DeviceArrangementDocumentV1 {
  const sourceModel = parseSceneSourceModel(sceneDocument)
  const metadata = normalizeRecord(sourceModel.metadata)
  const settings = normalizeRecord(metadata.deviceArrangement)
  const exportSize = resolveDeviceArrangementSize(
    settings.exportSizePresetKey,
    settings.customWidth,
    settings.customHeight,
  )
  const canvas: DeviceArrangementCanvasV1 = {
    width: exportSize.width,
    height: exportSize.height,
    sizePresetKey: exportSize.sizePresetKey,
    background: normalizeString(settings.background) || normalizeString(normalizeRecord(sourceModel.themeTokens).background) || '#f8fafc',
    backgroundMode: resolveBackgroundMode(settings.backgroundMode),
  }
  const sourceElementsByFrame = collectSceneElementsByFrame(sourceModel)
  const frames = ensureArray(sourceModel.frames).map(normalizeRecord)
  const assets = new Map(ensureArray(sourceModel.assets).map((asset) => {
    const record = normalizeRecord(asset)
    return [normalizeString(record.id), record] as const
  }).filter(([id]) => Boolean(id)))
  const settingsItems = ensureArray(settings.items).map(normalizeRecord)
  const mockupFrames = frames.filter((frame) => {
    const device = normalizeRecord(normalizeRecord(frame.metadata).device)
    return normalizeString(frame.kind) === 'device_mockup' || normalizeString(device.mockupSourceFrameId)
  })
  const items = mockupFrames.map((frame, index) => {
    const device = normalizeRecord(normalizeRecord(frame.metadata).device)
    const sourceFrameId = normalizeString(device.mockupSourceFrameId)
    const sourceImage = (sourceElementsByFrame.get(sourceFrameId) || [])
      .find(element => normalizeString(element.type) === 'image' && normalizeString(element.imageSrc))
    const settingsItem = settingsItems[index] || {}
    const shellAssetId = normalizeString(device.shellAssetId || settingsItem.shellAssetId)
    const shellAsset = shellAssetId ? assets.get(shellAssetId) : null
    const shellMetadata = normalizeRecord(normalizeRecord(shellAsset?.metadata).deviceShell)
    return createDeviceArrangementItem({
      id: normalizeString(frame.id) || `device-${index + 1}`,
      name: normalizeString(frame.name || settingsItem.screenshotName) || `截图 ${index + 1}`,
      screenshotSrc: normalizeString(sourceImage?.imageSrc || settingsItem.screenshotSrc),
      devicePresetKey: normalizeString(frame.deviceFramePresetKey || settingsItem.deviceFramePresetKey) || 'iphone-16-pro',
      x: toFiniteNumber(frame.x, 0),
      y: toFiniteNumber(frame.y, 0),
      width: toFiniteNumber(frame.width, 360),
      height: toFiniteNumber(frame.height, 720),
      rotation: toFiniteNumber(frame.rotation, 0),
      offsetX: toFiniteNumber(settingsItem.offsetX, 0),
      offsetY: toFiniteNumber(settingsItem.offsetY, 0),
      scale: toFiniteNumber(settingsItem.scale, 1),
      rotationOffset: toFiniteNumber(settingsItem.rotationOffset, 0),
      shell: {
        mode: shellAssetId ? 'external' : normalizeString(settingsItem.shellMode) === 'none' ? 'none' : 'builtin',
        assetId: shellAssetId || undefined,
        imageSrc: normalizeString(shellAsset?.src) || undefined,
        viewportRect: normalizeRecord(shellMetadata.viewportRect) as DesignAssetDeviceShellViewportRect || null,
        cornerRadius: Math.max(0, toFiniteNumber(shellMetadata.cornerRadius, 0)) || undefined,
        presetKey: normalizeString(frame.deviceFramePresetKey || settingsItem.deviceFramePresetKey) || 'iphone-16-pro',
      },
    })
  }).filter(item => Boolean(item.screenshotSrc))

  return normalizeDeviceArrangementDocument({
    title,
    canvas,
    layoutPresetKey: settings.layoutPresetKey,
    shadowPresetKey: settings.shadowPresetKey,
    watermarkText: settings.watermarkText,
    items,
    exportSizePresetKeys: [canvas.sizePresetKey],
  }, { relayout: false })
}
