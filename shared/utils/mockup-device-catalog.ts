import type {
  DeviceFramePlatform,
  DeviceFramePreset,
  MockupDeviceCategory,
  MockupDeviceModel,
  MockupDeviceVariant,
  MockupProjectCatalogCategory,
  MockupVariantSlotKey,
} from '../types/domain'

export const DEFAULT_MOCKUP_VARIANT_SLOT_KEY: MockupVariantSlotKey = 'variant_1'

export const MOCKUP_DEVICE_CATEGORY_TITLES: Record<MockupDeviceCategory, string> = {
  phone: '手机',
  tablet: '平板',
  desktop: '电脑',
  watch: '手表',
  earbuds: '耳机',
  glasses: '眼镜 / XR',
  browser: '浏览器',
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function isAppleDevice(model: Pick<MockupDeviceModel, 'brand' | 'modelName' | 'title'>): boolean {
  const haystack = [
    normalizeString(model.brand),
    normalizeString(model.modelName),
    normalizeString(model.title),
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes('apple')
    || haystack.includes('iphone')
    || haystack.includes('ipad')
    || haystack.includes('watch')
    || haystack.includes('airpods')
    || haystack.includes('vision')
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

export function normalizeMockupVariantSlotKey(
  value: unknown,
  fallback: MockupVariantSlotKey = DEFAULT_MOCKUP_VARIANT_SLOT_KEY,
): MockupVariantSlotKey {
  const normalized = normalizeString(value)
  return normalized || fallback
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
    slotKey: normalizeString(slotKeyRaw),
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
  if (model.category === 'phone') {
    if (isAppleDevice(model)) {
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

  if (model.category === 'earbuds') {
    return {
      group: 'Watch',
      platform: isAppleDevice(model) ? 'ios' : 'android',
      deviceFamily: 'watch',
      framePadding: 12,
      bezelRadius: 40,
      screenRadius: 28,
      background: '#0f172a',
      shadow: '0 22px 64px rgba(15, 23, 42, 0.28)',
    }
  }

  if (model.category === 'glasses') {
    return {
      group: 'Surface/Desktop',
      platform: isAppleDevice(model) ? 'ios' : 'android',
      deviceFamily: 'browser',
      framePadding: 0,
      bezelRadius: 32,
      screenRadius: 24,
      background: '#e2e8f0',
      shadow: '0 24px 72px rgba(15, 23, 42, 0.2)',
    }
  }

  if (model.category === 'watch') {
    return {
      group: 'Watch',
      platform: isAppleDevice(model) ? 'watchos' : 'android',
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

  if (model.category === 'desktop') {
    return {
      group: 'Surface/Desktop',
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
  const variantTitle = normalizeString(variant?.title) || slotKey.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
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
    ['phone', 0],
    ['tablet', 1],
    ['desktop', 2],
    ['watch', 3],
    ['earbuds', 4],
    ['glasses', 5],
    ['browser', 6],
  ])

  return [...categories].sort((left, right) => {
    return (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99)
  })
}
