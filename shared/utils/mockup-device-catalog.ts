import type {
  DeviceFramePlatform,
  DeviceFramePreset,
  MockupDeviceCategory,
  MockupDeviceModel,
  MockupDeviceVariant,
  MockupProjectCatalogCategory,
  MockupVariantSlotKey,
} from '../types/domain-legacy'

export const MOCKUP_VARIANT_SLOT_KEYS: MockupVariantSlotKey[] = [
  'variant_1',
  'variant_2',
  'variant_3',
  'variant_4',
]

export const MOCKUP_DEVICE_CATEGORY_TITLES: Record<MockupDeviceCategory, string> = {
  iphone: 'iPhone',
  tablet: 'Tablet',
  pc: 'PC',
  watch: 'Watch',
  android: 'Android',
  browser: 'Browser',
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isAppleTabletModel(model: Pick<MockupDeviceModel, 'brand' | 'modelName' | 'title'>): boolean {
  const haystack = [
    normalizeString(model.brand),
    normalizeString(model.modelName),
    normalizeString(model.title),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes('ipad') || haystack.includes('apple')
}

export function normalizeMockupVariantSlotKey(value: unknown, fallback: MockupVariantSlotKey = 'variant_1'): MockupVariantSlotKey {
  const normalized = normalizeString(value)
  return MOCKUP_VARIANT_SLOT_KEYS.includes(normalized as MockupVariantSlotKey)
    ? normalized as MockupVariantSlotKey
    : fallback
}

export function createMockupDevicePresetKey(modelSlug: string, slotKey: MockupVariantSlotKey): string {
  const normalizedModelSlug = normalizeString(modelSlug)
  return normalizedModelSlug ? `${normalizedModelSlug}::${slotKey}` : ''
}

export function parseMockupDevicePresetKey(value: unknown): {
  key: string
  modelSlug: string
  slotKey: MockupVariantSlotKey | ''
} {
  const key = normalizeString(value)
  if (!key)
    return { key: '', modelSlug: '', slotKey: '' }

  const [modelSlug = '', slotKeyRaw = ''] = key.split('::')
  return {
    key,
    modelSlug: normalizeString(modelSlug),
    slotKey: MOCKUP_VARIANT_SLOT_KEYS.includes(slotKeyRaw as MockupVariantSlotKey)
      ? slotKeyRaw as MockupVariantSlotKey
      : '',
  }
}

export function resolveMockupDeviceCategoryTitle(category: MockupDeviceCategory): string {
  return MOCKUP_DEVICE_CATEGORY_TITLES[category] || 'Device'
}

function resolveMockupPresetPresentation(model: Pick<MockupDeviceModel, 'category' | 'brand' | 'modelName' | 'title'>): {
  group: DeviceFramePreset['group']
  platform: DeviceFramePlatform
  deviceFamily: DeviceFramePreset['deviceFamily']
  framePadding: number
  bezelRadius: number
  screenRadius: number
  background: string
  shadow: string
  builtinShellKey?: string
} {
  if (model.category === 'iphone') {
    return {
      group: 'iPhone',
      platform: 'ios',
      deviceFamily: 'phone',
      framePadding: 18,
      bezelRadius: 54,
      screenRadius: 42,
      background: '#020617',
      shadow: '0 36px 96px rgba(2, 6, 23, 0.32)',
      builtinShellKey: 'iphone-generic-shell',
    }
  }

  if (model.category === 'android') {
    return {
      group: 'Android Phone',
      platform: 'android',
      deviceFamily: 'phone',
      framePadding: 16,
      bezelRadius: 42,
      screenRadius: 30,
      background: '#111827',
      shadow: '0 32px 84px rgba(15, 23, 42, 0.3)',
      builtinShellKey: 'android-phone-shell',
    }
  }

  if (model.category === 'watch') {
    return {
      group: 'Watch',
      platform: 'watchos',
      deviceFamily: 'watch',
      framePadding: 16,
      bezelRadius: 54,
      screenRadius: 34,
      background: '#020617',
      shadow: '0 28px 72px rgba(2, 6, 23, 0.3)',
      builtinShellKey: 'watch-generic-shell',
    }
  }

  if (model.category === 'browser') {
    return {
      group: 'Browser',
      platform: 'web',
      deviceFamily: 'browser',
      framePadding: 0,
      bezelRadius: 28,
      screenRadius: 28,
      background: '#e2e8f0',
      shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
      builtinShellKey: 'browser-window-shell',
    }
  }

  if (model.category === 'pc') {
    return {
      group: 'PC',
      platform: 'windows',
      deviceFamily: 'desktop',
      framePadding: 0,
      bezelRadius: 24,
      screenRadius: 16,
      background: '#e2e8f0',
      shadow: '0 30px 80px rgba(15, 23, 42, 0.18)',
      builtinShellKey: 'desktop-generic-shell',
    }
  }

  if (isAppleTabletModel(model)) {
    return {
      group: 'iPad',
      platform: 'ipados',
      deviceFamily: 'tablet',
      framePadding: 26,
      bezelRadius: 46,
      screenRadius: 28,
      background: '#111827',
      shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
      builtinShellKey: 'ipad-generic-shell',
    }
  }

  return {
    group: 'Tablet',
    platform: 'windows',
    deviceFamily: 'tablet',
    framePadding: 24,
    bezelRadius: 42,
    screenRadius: 24,
    background: '#111827',
    shadow: '0 32px 88px rgba(15, 23, 42, 0.24)',
    builtinShellKey: 'ipad-generic-shell',
  }
}

export function buildMockupDeviceResolvedPreset(
  model: Pick<MockupDeviceModel, 'slug' | 'title' | 'category' | 'brand' | 'modelName' | 'screenWidth' | 'screenHeight'>,
  variant?: Pick<MockupDeviceVariant, 'slotKey' | 'title'> | null,
): DeviceFramePreset {
  const presentation = resolveMockupPresetPresentation(model)
  const slotKey = normalizeMockupVariantSlotKey(variant?.slotKey)
  const variantTitle = normalizeString(variant?.title) || slotKey.replace('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  return {
    key: createMockupDevicePresetKey(model.slug, slotKey),
    title: `${normalizeString(model.title) || normalizeString(model.modelName) || normalizeString(model.slug)} · ${variantTitle}`,
    group: presentation.group,
    platform: presentation.platform,
    deviceFamily: presentation.deviceFamily,
    screenWidth: Math.max(1, Number(model.screenWidth || 0)),
    screenHeight: Math.max(1, Number(model.screenHeight || 0)),
    framePadding: presentation.framePadding,
    bezelRadius: presentation.bezelRadius,
    screenRadius: presentation.screenRadius,
    background: presentation.background,
    shadow: presentation.shadow,
    builtinShellKey: presentation.builtinShellKey,
  }
}

export function sortMockupCatalogCategories(categories: MockupProjectCatalogCategory[]): MockupProjectCatalogCategory[] {
  const order = new Map<MockupDeviceCategory, number>([
    ['iphone', 0],
    ['tablet', 1],
    ['pc', 2],
    ['watch', 3],
    ['android', 4],
    ['browser', 5],
  ])

  return [...categories].sort((left, right) => {
    return (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99)
  })
}
