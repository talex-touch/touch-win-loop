import type { Queryable } from '~~/server/utils/db'
import type {
  CanvasLibraryDeviceShellAssetPayload,
  MockupDeviceCategory,
  MockupDeviceModel,
  MockupDeviceModelStatus,
  MockupDeviceVariant,
  MockupProjectCatalog,
  MockupProjectCatalogCategory,
  MockupProjectCatalogVariant,
  MockupVariantSlotKey,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import {
  buildMockupDeviceResolvedPreset,
  createMockupDevicePresetKey,
  MOCKUP_DEVICE_CATEGORY_TITLES,
  MOCKUP_VARIANT_SLOT_KEYS,
  normalizeMockupVariantSlotKey,
  sortMockupCatalogCategories,
} from '~~/shared/utils/mockup-device-catalog'

interface MockupDeviceModelRow {
  id: string
  slug: string
  title: string
  category: MockupDeviceCategory
  brand: string | null
  model_name: string
  screen_width: number | string
  screen_height: number | string
  preview_asset_item_id: string | null
  preview_asset_version_id: string | null
  sort_order: number | string
  status: MockupDeviceModelStatus
  default_variant_slot_key: MockupVariantSlotKey | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface MockupDeviceVariantRow {
  id: string
  device_model_id: string
  slot_key: MockupVariantSlotKey
  title: string
  shell_asset_item_id: string | null
  shell_asset_version_id: string | null
  preview_asset_item_id: string | null
  preview_asset_version_id: string | null
  enabled: boolean
  sort_order: number | string
  created_at?: string
  updated_at?: string
}

interface MockupCatalogRow {
  model_id: string
  model_slug: string
  model_title: string
  model_category: MockupDeviceCategory
  model_brand: string | null
  model_model_name: string
  model_screen_width: number | string
  model_screen_height: number | string
  model_preview_asset_item_id: string | null
  model_preview_asset_version_id: string | null
  model_sort_order: number | string
  model_status: MockupDeviceModelStatus
  model_default_variant_slot_key: MockupVariantSlotKey | null
  model_created_by_user_id: string
  model_updated_by_user_id: string
  model_created_at: string
  model_updated_at: string
  variant_id: string
  variant_device_model_id: string
  variant_slot_key: MockupVariantSlotKey
  variant_title: string
  variant_shell_asset_item_id: string | null
  variant_shell_asset_version_id: string | null
  variant_preview_asset_item_id: string | null
  variant_preview_asset_version_id: string | null
  variant_enabled: boolean
  variant_sort_order: number | string
  shell_asset_title: string | null
  shell_asset_slug: string | null
  shell_asset_payload: Record<string, unknown> | string | null
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toInteger(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.trunc(parsed)
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string')
    return value
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function sanitizeSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeMockupCategory(value: unknown): MockupDeviceCategory {
  const normalized = normalizeString(value) as MockupDeviceCategory
  if (normalized === 'iphone' || normalized === 'tablet' || normalized === 'pc' || normalized === 'watch' || normalized === 'android' || normalized === 'browser')
    return normalized
  return 'iphone'
}

function normalizeMockupStatus(value: unknown): MockupDeviceModelStatus {
  const normalized = normalizeString(value) as MockupDeviceModelStatus
  if (normalized === 'published' || normalized === 'archived')
    return normalized
  return 'draft'
}

function toMockupDeviceModel(row: MockupDeviceModelRow): MockupDeviceModel {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    brand: normalizeString(row.brand) || undefined,
    modelName: row.model_name,
    screenWidth: Math.max(1, toInteger(row.screen_width, 1)),
    screenHeight: Math.max(1, toInteger(row.screen_height, 1)),
    previewAssetItemId: normalizeString(row.preview_asset_item_id) || null,
    previewAssetVersionId: normalizeString(row.preview_asset_version_id) || null,
    sortOrder: Math.max(0, toInteger(row.sort_order, 0)),
    status: normalizeMockupStatus(row.status),
    defaultVariantSlotKey: row.default_variant_slot_key || undefined,
    createdBy: normalizeString(row.created_by_user_id),
    updatedBy: normalizeString(row.updated_by_user_id),
    createdAt: normalizeString(row.created_at) || undefined,
    updatedAt: normalizeString(row.updated_at) || undefined,
  }
}

function toMockupDeviceVariant(row: MockupDeviceVariantRow): MockupDeviceVariant {
  return {
    id: row.id,
    deviceModelId: row.device_model_id,
    slotKey: normalizeMockupVariantSlotKey(row.slot_key),
    title: normalizeString(row.title),
    shellAssetItemId: normalizeString(row.shell_asset_item_id) || null,
    shellAssetVersionId: normalizeString(row.shell_asset_version_id) || null,
    previewAssetItemId: normalizeString(row.preview_asset_item_id) || null,
    previewAssetVersionId: normalizeString(row.preview_asset_version_id) || null,
    enabled: row.enabled === true,
    sortOrder: Math.max(0, toInteger(row.sort_order, 0)),
  }
}

function toCatalogModelRow(row: MockupCatalogRow): MockupDeviceModelRow {
  return {
    id: row.model_id,
    slug: row.model_slug,
    title: row.model_title,
    category: row.model_category,
    brand: row.model_brand,
    model_name: row.model_model_name,
    screen_width: row.model_screen_width,
    screen_height: row.model_screen_height,
    preview_asset_item_id: row.model_preview_asset_item_id,
    preview_asset_version_id: row.model_preview_asset_version_id,
    sort_order: row.model_sort_order,
    status: row.model_status,
    default_variant_slot_key: row.model_default_variant_slot_key,
    created_by_user_id: row.model_created_by_user_id,
    updated_by_user_id: row.model_updated_by_user_id,
    created_at: row.model_created_at,
    updated_at: row.model_updated_at,
  }
}

function toCatalogVariantRow(row: MockupCatalogRow): MockupDeviceVariantRow {
  return {
    id: row.variant_id,
    device_model_id: row.variant_device_model_id,
    slot_key: row.variant_slot_key,
    title: row.variant_title,
    shell_asset_item_id: row.variant_shell_asset_item_id,
    shell_asset_version_id: row.variant_shell_asset_version_id,
    preview_asset_item_id: row.variant_preview_asset_item_id,
    preview_asset_version_id: row.variant_preview_asset_version_id,
    enabled: row.variant_enabled,
    sort_order: row.variant_sort_order,
  }
}

function parseShellAssetPayload(value: unknown): CanvasLibraryDeviceShellAssetPayload | null {
  const record = normalizeRecord(parseJsonValue(value))
  if (!Object.keys(record).length)
    return null

  return record as unknown as CanvasLibraryDeviceShellAssetPayload
}

async function resolveUniqueMockupModelSlug(
  db: Queryable,
  preferredSlug: string,
  modelId?: string,
): Promise<string> {
  const base = sanitizeSlugPart(preferredSlug) || `mockup-model-${randomUUID().slice(0, 8)}`
  let slug = base
  let suffix = 1

  while (true) {
    const result = await db.query<{ id: string }>(
      `SELECT id
       FROM mockup_device_models
       WHERE slug = $1
         AND ($2::TEXT = '' OR id <> $2)
       LIMIT 1`,
      [slug, normalizeString(modelId)],
    )
    if (!result.rows[0]?.id)
      return slug
    suffix += 1
    slug = `${base}-${suffix}`
  }
}

async function listMockupVariantsByModelId(
  db: Queryable,
  modelId: string,
): Promise<MockupDeviceVariant[]> {
  const result = await db.query<MockupDeviceVariantRow>(
    `SELECT id, device_model_id, slot_key, title, shell_asset_item_id, shell_asset_version_id, enabled, sort_order
     FROM mockup_device_variants
     WHERE device_model_id = $1
     ORDER BY sort_order ASC, slot_key ASC`,
    [modelId],
  )
  return result.rows.map(toMockupDeviceVariant)
}

async function createDefaultMockupVariants(
  db: Queryable,
  input: {
    modelId: string
  },
): Promise<void> {
  for (let index = 0; index < MOCKUP_VARIANT_SLOT_KEYS.length; index += 1) {
    const slotKey = MOCKUP_VARIANT_SLOT_KEYS[index]!
    await db.query(
      `INSERT INTO mockup_device_variants (
        id,
        device_model_id,
        slot_key,
        title,
        shell_asset_item_id,
        shell_asset_version_id,
        enabled,
        sort_order,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, NULL, NULL, FALSE, $5, NOW(), NOW()
      )
      ON CONFLICT (device_model_id, slot_key)
      DO NOTHING`,
      [
        randomUUID(),
        input.modelId,
        slotKey,
        `展示姿态 ${index + 1}`,
        index,
      ],
    )
  }
}

async function getMockupDeviceModelRow(
  db: Queryable,
  modelId: string,
): Promise<MockupDeviceModelRow | null> {
  const result = await db.query<MockupDeviceModelRow>(
    `SELECT
      id,
      slug,
      title,
      category,
      brand,
      model_name,
      screen_width,
      screen_height,
      sort_order,
      status,
      default_variant_slot_key,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
     FROM mockup_device_models
     WHERE id = $1
     LIMIT 1`,
    [modelId],
  )
  return result.rows[0] || null
}

async function assertPublishedShellVariantBindings(
  db: Queryable,
  variants: MockupDeviceVariant[],
): Promise<void> {
  const enabledVariants = variants.filter(variant => variant.enabled)
  if (!enabledVariants.length)
    throw new Error('MOCKUP_MODEL_NO_ENABLED_VARIANTS')

  for (const variant of enabledVariants) {
    const itemId = normalizeString(variant.shellAssetItemId)
    const versionId = normalizeString(variant.shellAssetVersionId)
    if (!itemId || !versionId)
      throw new Error('MOCKUP_VARIANT_SHELL_REQUIRED')

    const result = await db.query<{ valid_binding: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM canvas_library_items item
        JOIN canvas_library_item_versions version ON version.item_id = item.id
        WHERE item.id = $1
          AND version.id = $2
          AND item.kind = 'asset'
          AND item.asset_kind = 'device_shell'
          AND item.status = 'published'
          AND item.published_version_id = version.id
      ) AS valid_binding`,
      [itemId, versionId],
    )

    if (!result.rows[0]?.valid_binding)
      throw new Error('MOCKUP_VARIANT_SHELL_NOT_PUBLISHED')
  }
}

async function assertPublishedPreviewAssetBinding(
  db: Queryable,
  input: {
    itemId: string
    versionId: string
    allowEmpty?: boolean
    errorWhenEmpty: string
    errorWhenInvalid: string
  },
): Promise<void> {
  const itemId = normalizeString(input.itemId)
  const versionId = normalizeString(input.versionId)
  if (!itemId || !versionId) {
    if (input.allowEmpty)
      return
    throw new Error(input.errorWhenEmpty)
  }

  const result = await db.query<{ valid_binding: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM canvas_library_items item
      JOIN canvas_library_item_versions version ON version.item_id = item.id
      WHERE item.id = $1
        AND version.id = $2
        AND item.kind = 'asset'
        AND item.asset_kind IN ('image', 'svg')
        AND item.status = 'published'
        AND item.published_version_id = version.id
    ) AS valid_binding`,
    [itemId, versionId],
  )

  if (!result.rows[0]?.valid_binding)
    throw new Error(input.errorWhenInvalid)
}

export async function listMockupDeviceModels(
  db: Queryable,
  input: {
    status?: MockupDeviceModelStatus | ''
    category?: MockupDeviceCategory | ''
    search?: string
    publishedOnly?: boolean
  } = {},
): Promise<MockupDeviceModel[]> {
  const result = await db.query<MockupDeviceModelRow>(
    `SELECT
      id,
      slug,
      title,
      category,
      brand,
      model_name,
      screen_width,
      screen_height,
      sort_order,
      status,
      default_variant_slot_key,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
     FROM mockup_device_models
     WHERE ($1::TEXT = '' OR status = $1)
       AND ($2::TEXT = '' OR category = $2)
       AND ($3::BOOLEAN = FALSE OR status = 'published')
       AND (
         $4::TEXT = ''
         OR title ILIKE '%' || $4 || '%'
         OR slug ILIKE '%' || $4 || '%'
         OR COALESCE(brand, '') ILIKE '%' || $4 || '%'
         OR model_name ILIKE '%' || $4 || '%'
       )
     ORDER BY category ASC, sort_order ASC, updated_at DESC, created_at DESC`,
    [
      normalizeString(input.status),
      normalizeString(input.category),
      input.publishedOnly === true,
      normalizeString(input.search),
    ],
  )
  return result.rows.map(toMockupDeviceModel)
}

export async function getMockupDeviceModelDetail(
  db: Queryable,
  input: {
    modelId: string
  },
): Promise<{
    model: MockupDeviceModel
    variants: MockupDeviceVariant[]
  } | null> {
  const modelRow = await getMockupDeviceModelRow(db, input.modelId)
  if (!modelRow)
    return null

  return {
    model: toMockupDeviceModel(modelRow),
    variants: await listMockupVariantsByModelId(db, input.modelId),
  }
}

export async function createMockupDeviceModel(
  db: Queryable,
  input: {
    actorUserId: string
    slug?: string
    title: string
    category: MockupDeviceCategory
    brand?: string
    modelName: string
    screenWidth: number
    screenHeight: number
    sortOrder?: number
    defaultVariantSlotKey?: MockupVariantSlotKey
  },
): Promise<{
    model: MockupDeviceModel
    variants: MockupDeviceVariant[]
  }> {
  const modelId = randomUUID()
  const slug = await resolveUniqueMockupModelSlug(
    db,
    normalizeString(input.slug) || normalizeString(input.modelName) || normalizeString(input.title),
  )
  const defaultVariantSlotKey = normalizeString(input.defaultVariantSlotKey)
    ? normalizeMockupVariantSlotKey(input.defaultVariantSlotKey)
    : null

  await db.query(
    `INSERT INTO mockup_device_models (
      id,
      slug,
      title,
      category,
      brand,
      model_name,
      screen_width,
      screen_height,
      sort_order,
      status,
      default_variant_slot_key,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $11, NOW(), NOW()
    )`,
    [
      modelId,
      slug,
      normalizeString(input.title) || normalizeString(input.modelName) || slug,
      normalizeMockupCategory(input.category),
      normalizeString(input.brand) || null,
      normalizeString(input.modelName) || normalizeString(input.title) || slug,
      Math.max(1, toInteger(input.screenWidth, 1)),
      Math.max(1, toInteger(input.screenHeight, 1)),
      Math.max(0, toInteger(input.sortOrder, 0)),
      defaultVariantSlotKey,
      input.actorUserId,
    ],
  )

  await createDefaultMockupVariants(db, { modelId })
  const detail = await getMockupDeviceModelDetail(db, { modelId })
  if (!detail)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')
  return detail
}

export async function updateMockupDeviceModel(
  db: Queryable,
  input: {
    modelId: string
    actorUserId: string
    slug?: string
    title?: string
    category?: MockupDeviceCategory
    brand?: string | null
    modelName?: string
    screenWidth?: number
    screenHeight?: number
    sortOrder?: number
    defaultVariantSlotKey?: MockupVariantSlotKey | null
  },
): Promise<{
    model: MockupDeviceModel
    variants: MockupDeviceVariant[]
  }> {
  const current = await getMockupDeviceModelRow(db, input.modelId)
  if (!current)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')
  const currentScreenWidth = Math.max(1, toInteger(current.screen_width, 1))
  const currentScreenHeight = Math.max(1, toInteger(current.screen_height, 1))
  const currentSortOrder = Math.max(0, toInteger(current.sort_order, 0))

  const nextSlug = input.slug !== undefined
    ? await resolveUniqueMockupModelSlug(db, input.slug, input.modelId)
    : current.slug

  await db.query(
    `UPDATE mockup_device_models
     SET
       slug = $2,
       title = $3,
       category = $4,
       brand = $5,
       model_name = $6,
       screen_width = $7,
       screen_height = $8,
       sort_order = $9,
       default_variant_slot_key = $10,
       updated_by_user_id = $11,
       updated_at = NOW()
     WHERE id = $1`,
    [
      input.modelId,
      nextSlug,
      input.title !== undefined ? normalizeString(input.title) || current.title : current.title,
      input.category !== undefined ? normalizeMockupCategory(input.category) : current.category,
      input.brand !== undefined ? (normalizeString(input.brand) || null) : current.brand,
      input.modelName !== undefined ? normalizeString(input.modelName) || current.model_name : current.model_name,
      input.screenWidth !== undefined ? Math.max(1, toInteger(input.screenWidth, currentScreenWidth)) : currentScreenWidth,
      input.screenHeight !== undefined ? Math.max(1, toInteger(input.screenHeight, currentScreenHeight)) : currentScreenHeight,
      input.sortOrder !== undefined ? Math.max(0, toInteger(input.sortOrder, currentSortOrder)) : currentSortOrder,
      input.defaultVariantSlotKey === null
        ? null
        : input.defaultVariantSlotKey !== undefined
          ? normalizeMockupVariantSlotKey(input.defaultVariantSlotKey)
          : current.default_variant_slot_key,
      input.actorUserId,
    ],
  )

  const detail = await getMockupDeviceModelDetail(db, { modelId: input.modelId })
  if (!detail)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')
  return detail
}

export async function patchMockupDeviceVariant(
  db: Queryable,
  input: {
    modelId: string
    actorUserId: string
    slotKey: MockupVariantSlotKey
    title?: string
    shellAssetItemId?: string | null
    shellAssetVersionId?: string | null
    enabled?: boolean
    sortOrder?: number
  },
): Promise<MockupDeviceVariant> {
  const currentResult = await db.query<MockupDeviceVariantRow>(
    `SELECT id, device_model_id, slot_key, title, shell_asset_item_id, shell_asset_version_id, enabled, sort_order
     FROM mockup_device_variants
     WHERE device_model_id = $1
       AND slot_key = $2
     LIMIT 1`,
    [input.modelId, normalizeMockupVariantSlotKey(input.slotKey)],
  )

  const current = currentResult.rows[0]
  if (!current) {
    await createDefaultMockupVariants(db, { modelId: input.modelId })
  }

  const existing = current || (await db.query<MockupDeviceVariantRow>(
    `SELECT id, device_model_id, slot_key, title, shell_asset_item_id, shell_asset_version_id, enabled, sort_order
     FROM mockup_device_variants
     WHERE device_model_id = $1
       AND slot_key = $2
     LIMIT 1`,
    [input.modelId, normalizeMockupVariantSlotKey(input.slotKey)],
  )).rows[0]

  if (!existing)
    throw new Error('MOCKUP_DEVICE_VARIANT_NOT_FOUND')
  const existingSortOrder = Math.max(0, toInteger(existing.sort_order, 0))

  await db.query(
    `UPDATE mockup_device_variants
     SET
       title = $3,
       shell_asset_item_id = $4,
       shell_asset_version_id = $5,
       enabled = $6,
       sort_order = $7,
       updated_at = NOW()
     WHERE device_model_id = $1
       AND slot_key = $2`,
    [
      input.modelId,
      normalizeMockupVariantSlotKey(input.slotKey),
      input.title !== undefined ? normalizeString(input.title) || existing.title : existing.title,
      input.shellAssetItemId !== undefined ? (normalizeString(input.shellAssetItemId) || null) : existing.shell_asset_item_id,
      input.shellAssetVersionId !== undefined ? (normalizeString(input.shellAssetVersionId) || null) : existing.shell_asset_version_id,
      input.enabled !== undefined ? input.enabled === true : existing.enabled,
      input.sortOrder !== undefined ? Math.max(0, toInteger(input.sortOrder, existingSortOrder)) : existingSortOrder,
    ],
  )

  await db.query(
    `UPDATE mockup_device_models
     SET
       updated_by_user_id = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [input.modelId, input.actorUserId],
  )

  const refreshed = await db.query<MockupDeviceVariantRow>(
    `SELECT id, device_model_id, slot_key, title, shell_asset_item_id, shell_asset_version_id, enabled, sort_order
     FROM mockup_device_variants
     WHERE device_model_id = $1
       AND slot_key = $2
     LIMIT 1`,
    [input.modelId, normalizeMockupVariantSlotKey(input.slotKey)],
  )

  if (!refreshed.rows[0])
    throw new Error('MOCKUP_DEVICE_VARIANT_NOT_FOUND')
  return toMockupDeviceVariant(refreshed.rows[0])
}

export async function publishMockupDeviceModel(
  db: Queryable,
  input: {
    modelId: string
    actorUserId: string
  },
): Promise<{
    model: MockupDeviceModel
    variants: MockupDeviceVariant[]
  }> {
  const detail = await getMockupDeviceModelDetail(db, { modelId: input.modelId })
  if (!detail)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')

  await assertPublishedShellVariantBindings(db, detail.variants)

  const defaultVariantSlotKey = normalizeString(detail.model.defaultVariantSlotKey)
  if (defaultVariantSlotKey) {
    const defaultVariant = detail.variants.find(variant => variant.slotKey === defaultVariantSlotKey)
    if (!defaultVariant || !defaultVariant.enabled)
      throw new Error('MOCKUP_DEVICE_DEFAULT_VARIANT_INVALID')
  }

  await db.query(
    `UPDATE mockup_device_models
     SET
       status = 'published',
       updated_by_user_id = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [input.modelId, input.actorUserId],
  )

  const refreshed = await getMockupDeviceModelDetail(db, { modelId: input.modelId })
  if (!refreshed)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')
  return refreshed
}

export async function archiveMockupDeviceModel(
  db: Queryable,
  input: {
    modelId: string
    actorUserId: string
  },
): Promise<{
    model: MockupDeviceModel
    variants: MockupDeviceVariant[]
  }> {
  const exists = await getMockupDeviceModelRow(db, input.modelId)
  if (!exists)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')

  await db.query(
    `UPDATE mockup_device_models
     SET
       status = 'archived',
       updated_by_user_id = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [input.modelId, input.actorUserId],
  )

  const detail = await getMockupDeviceModelDetail(db, { modelId: input.modelId })
  if (!detail)
    throw new Error('MOCKUP_DEVICE_MODEL_NOT_FOUND')
  return detail
}

export async function listPublishedMockupProjectCatalog(
  db: Queryable,
): Promise<MockupProjectCatalog> {
  const result = await db.query<MockupCatalogRow>(
    `SELECT
      model.id AS model_id,
      model.slug AS model_slug,
      model.title AS model_title,
      model.category AS model_category,
      model.brand AS model_brand,
      model.model_name AS model_model_name,
      model.screen_width AS model_screen_width,
      model.screen_height AS model_screen_height,
      model.sort_order AS model_sort_order,
      model.status AS model_status,
      model.default_variant_slot_key AS model_default_variant_slot_key,
      model.created_by_user_id AS model_created_by_user_id,
      model.updated_by_user_id AS model_updated_by_user_id,
      model.created_at AS model_created_at,
      model.updated_at AS model_updated_at,
      variant.id AS variant_id,
      variant.device_model_id AS variant_device_model_id,
      variant.slot_key AS variant_slot_key,
      variant.title AS variant_title,
      variant.shell_asset_item_id AS variant_shell_asset_item_id,
      variant.shell_asset_version_id AS variant_shell_asset_version_id,
      variant.enabled AS variant_enabled,
      variant.sort_order AS variant_sort_order,
      asset.title AS shell_asset_title,
      asset.slug AS shell_asset_slug,
      version.payload AS shell_asset_payload
     FROM mockup_device_models model
     JOIN mockup_device_variants variant ON variant.device_model_id = model.id
     LEFT JOIN canvas_library_items asset ON asset.id = variant.shell_asset_item_id
     LEFT JOIN canvas_library_item_versions version ON version.id = variant.shell_asset_version_id
     WHERE model.status = 'published'
       AND variant.enabled = TRUE
     ORDER BY model.category ASC, model.sort_order ASC, model.created_at ASC, variant.sort_order ASC, variant.slot_key ASC`,
    [],
  )

  const categoryMap = new Map<MockupDeviceCategory, MockupProjectCatalogCategory>()
  const modelMap = new Map<string, MockupProjectCatalogCategory['models'][number]>()
  const resolvedPresets = new Map<string, MockupProjectCatalogVariant['resolvedPreset']>()

  for (const row of result.rows) {
    const model = toMockupDeviceModel(toCatalogModelRow(row))
    const category = categoryMap.get(model.category) || {
      key: model.category,
      title: MOCKUP_DEVICE_CATEGORY_TITLES[model.category] || model.category,
      models: [],
    }
    if (!categoryMap.has(model.category))
      categoryMap.set(model.category, category)

    const modelEntry = modelMap.get(model.id) || {
      ...model,
      variants: [],
    }
    if (!modelMap.has(model.id)) {
      category.models.push(modelEntry)
      modelMap.set(model.id, modelEntry)
    }

    const variantBase = toMockupDeviceVariant(toCatalogVariantRow(row))
    const resolvedPreset = buildMockupDeviceResolvedPreset(model, variantBase)
    const variant: MockupProjectCatalogVariant = {
      ...variantBase,
      presetKey: createMockupDevicePresetKey(model.slug, variantBase.slotKey),
      resolvedPreset,
      shellAssetTitle: normalizeString(row.shell_asset_title) || undefined,
      shellAssetSlug: normalizeString(row.shell_asset_slug) || undefined,
      shellAssetPayload: parseShellAssetPayload(row.shell_asset_payload),
    }
    modelEntry.variants.push(variant)
    resolvedPresets.set(variant.presetKey, resolvedPreset)
  }

  return {
    categories: sortMockupCatalogCategories([...categoryMap.values()]).map((category) => {
      category.models.sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title))
      category.models.forEach((model) => {
        model.variants.sort((left, right) => left.sortOrder - right.sortOrder)
      })
      return category
    }),
    resolvedPresets: [...resolvedPresets.values()],
  }
}
