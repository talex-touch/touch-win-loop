import type {
  FeishuBitableAutoSyncConfig,
  FeishuBitableSourceConfig,
  FeishuBitableSyncConfigImportResult,
  FeishuBitableSyncConfigPackage,
  FeishuBitableSyncConfigPackageItem,
  FeishuBitableSyncConfigPackageSummary,
  FeishuBitableSyncDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableWritebackConfig,
  FeishuTaskScheduleConfig,
} from '~~/shared/types/domain'
import type { Queryable } from '~~/server/utils/db'
import {
  createFeishuBitableSync,
  createFeishuBitableSyncItem,
  getFeishuBitableSyncDetail,
  patchFeishuBitableSync,
} from '~~/server/utils/feishu-integration-store'
import {
  getDefaultFeishuTaskScheduleConfig,
  normalizeFeishuTaskScheduleConfig,
  validateFeishuTaskScheduleConfig,
} from '~~/server/utils/feishu-task-schedule'

const PACKAGE_KIND = 'feishu_bitable_sync_config'
const SUPPORTED_VERSION = 1
const ENTITY_TYPES = new Set<FeishuBitableSyncItemEntityType>(['contest', 'track', 'track_timeline', 'resource', 'policy', 'persona'])

export interface FeishuBitableSyncConfigImportDraft {
  name: string
  enabled: false
  source: FeishuBitableSourceConfig
  schedule: FeishuTaskScheduleConfig
  items: Array<{
    name: string
    entityType: FeishuBitableSyncItemEntityType
    tableId: string
    viewId: string
    source: FeishuBitableSourceConfig
    writeback: FeishuBitableWritebackConfig | Record<string, unknown>
    autoSync: FeishuBitableAutoSyncConfig | Record<string, unknown>
    mapping: Record<string, unknown>
    options: Record<string, unknown>
    isEnabled: false
    schedule: FeishuTaskScheduleConfig
  }>
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function cloneRecord(raw: unknown, label: string): Record<string, unknown> {
  if (raw === undefined || raw === null)
    return {}
  if (!isRecord(raw))
    throw new Error(`${label} 必须是对象`)
  return JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
}

function normalizeEnvironment(raw: unknown): FeishuBitableSourceConfig['environment'] | undefined {
  const text = toText(raw)
  if (text === 'test' || text === 'production')
    return text
  return undefined
}

function sanitizeSourceConfig(raw: unknown, fallback: Partial<FeishuBitableSourceConfig> = {}): FeishuBitableSourceConfig {
  const source = isRecord(raw) ? raw : {}
  const environment = normalizeEnvironment(source.environment ?? fallback.environment)
  return {
    appToken: toText(source.appToken) || toText(fallback.appToken),
    tableId: toText(source.tableId) || toText(fallback.tableId),
    viewId: toText(source.viewId) || toText(fallback.viewId),
    appName: toText(source.appName) || toText(fallback.appName),
    tableName: toText(source.tableName) || toText(fallback.tableName),
    viewName: toText(source.viewName) || toText(fallback.viewName),
    sourceUrl: toText(source.sourceUrl) || toText(fallback.sourceUrl),
    ...(environment ? { environment } : {}),
  }
}

function normalizeScheduleDraft(raw: unknown): FeishuTaskScheduleConfig {
  const normalized = normalizeFeishuTaskScheduleConfig(
    isRecord(raw) ? raw as Partial<FeishuTaskScheduleConfig> : {},
    getDefaultFeishuTaskScheduleConfig(),
  )
  const errors = validateFeishuTaskScheduleConfig(normalized)
  if (errors.length)
    throw new Error(`scheduleDraft 配置非法：${errors.join('；')}`)
  return normalized
}

function disableScheduleDraft(raw: unknown): FeishuTaskScheduleConfig {
  return {
    ...normalizeScheduleDraft(raw),
    enabled: false,
  }
}

function normalizeEntityType(raw: unknown): FeishuBitableSyncItemEntityType {
  const entityType = toText(raw) as FeishuBitableSyncItemEntityType
  if (!ENTITY_TYPES.has(entityType))
    throw new Error(`entityType 不支持：${entityType || 'empty'}`)
  return entityType
}

function mappingFieldCount(mapping: Record<string, unknown>): number {
  const layers = mapping.layers
  if (Array.isArray(layers))
    return layers.length
  return Object.keys(mapping).filter(key => key !== 'schemaVersion').length
}

function normalizeConfigPackageItem(raw: unknown, index: number, fallbackAppToken: string): FeishuBitableSyncConfigPackageItem {
  if (!isRecord(raw))
    throw new Error(`items[${index}] 必须是对象`)

  const entityType = normalizeEntityType(raw.entityType)
  const tableId = toText(raw.tableId || (isRecord(raw.source) ? raw.source.tableId : ''))
  if (!tableId)
    throw new Error(`items[${index}].tableId 不能为空`)

  const viewId = toText(raw.viewId || (isRecord(raw.source) ? raw.source.viewId : ''))
  const source = sanitizeSourceConfig(raw.source, {
    appToken: fallbackAppToken,
    tableId,
    viewId,
  })
  source.appToken = toText(source.appToken) || fallbackAppToken
  source.tableId = toText(source.tableId) || tableId
  source.viewId = toText(source.viewId) || viewId

  return {
    name: toText(raw.name) || source.tableName || `${entityType} 同步项`,
    entityType,
    tableId,
    viewId,
    source,
    writeback: cloneRecord(raw.writeback, `items[${index}].writeback`),
    autoSync: cloneRecord(raw.autoSync, `items[${index}].autoSync`),
    mapping: cloneRecord(raw.mapping, `items[${index}].mapping`),
    options: cloneRecord(raw.options, `items[${index}].options`),
    scheduleDraft: normalizeScheduleDraft(raw.scheduleDraft),
  }
}

export function normalizeFeishuBitableSyncConfigPackage(raw: unknown): FeishuBitableSyncConfigPackage {
  if (!isRecord(raw))
    throw new Error('同步配置包必须是对象')
  if (raw.version !== SUPPORTED_VERSION)
    throw new Error(`version 不支持：${String(raw.version || '')}`)
  if (raw.kind !== PACKAGE_KIND)
    throw new Error('kind 必须是 feishu_bitable_sync_config')

  const source = sanitizeSourceConfig(raw.source)
  if (!source.appToken)
    throw new Error('source.appToken 不能为空')

  const rawItems = Array.isArray(raw.items) ? raw.items : []
  const items = rawItems.map((item, index) => normalizeConfigPackageItem(item, index, source.appToken))

  return {
    version: SUPPORTED_VERSION,
    kind: PACKAGE_KIND,
    exportedAt: toText(raw.exportedAt) || new Date().toISOString(),
    name: toText(raw.name) || source.appName || '未命名同步信息',
    source,
    scheduleDraft: normalizeScheduleDraft(raw.scheduleDraft),
    items,
  }
}

export function buildFeishuBitableSyncConfigPackage(
  detail: FeishuBitableSyncDetail,
  input: { exportedAt?: string } = {},
): FeishuBitableSyncConfigPackage {
  return normalizeFeishuBitableSyncConfigPackage({
    version: SUPPORTED_VERSION,
    kind: PACKAGE_KIND,
    exportedAt: input.exportedAt || new Date().toISOString(),
    name: detail.name,
    source: sanitizeSourceConfig(detail.source),
    scheduleDraft: detail.schedule,
    items: detail.items.map(item => ({
      name: item.name,
      entityType: item.entityType,
      tableId: item.tableId,
      viewId: item.viewId,
      source: sanitizeSourceConfig(item.source, {
        appToken: item.appToken || detail.source.appToken,
        tableId: item.tableId,
        viewId: item.viewId,
      }),
      writeback: cloneRecord(item.writeback, 'writeback'),
      autoSync: cloneRecord(item.autoSync, 'autoSync'),
      mapping: cloneRecord(item.mapping, 'mapping'),
      options: cloneRecord(item.options, 'options'),
      scheduleDraft: item.schedule,
    })),
  })
}

export function buildFeishuBitableSyncConfigPackageSummary(
  pkg: FeishuBitableSyncConfigPackage,
): FeishuBitableSyncConfigPackageSummary {
  const entityTypes = Array.from(new Set(pkg.items.map(item => item.entityType)))
  return {
    name: pkg.name,
    appName: pkg.source.appName || '',
    appToken: pkg.source.appToken,
    environment: pkg.source.environment || '',
    itemCount: pkg.items.length,
    entityTypes,
    mappingFieldCount: pkg.items.reduce((total, item) => total + mappingFieldCount(item.mapping as Record<string, unknown>), 0),
  }
}

export function prepareFeishuBitableSyncConfigImportDraft(
  rawPackage: FeishuBitableSyncConfigPackage,
): FeishuBitableSyncConfigImportDraft {
  const pkg = normalizeFeishuBitableSyncConfigPackage(rawPackage)
  return {
    name: `导入 - ${pkg.name}`,
    enabled: false,
    source: pkg.source,
    schedule: disableScheduleDraft(pkg.scheduleDraft),
    items: pkg.items.map(item => ({
      name: item.name,
      entityType: item.entityType,
      tableId: item.tableId,
      viewId: item.viewId,
      source: {
        ...item.source,
        appToken: item.source.appToken || pkg.source.appToken,
      },
      writeback: item.writeback,
      autoSync: item.autoSync,
      mapping: item.mapping as Record<string, unknown>,
      options: item.options,
      isEnabled: false,
      schedule: disableScheduleDraft(item.scheduleDraft),
    })),
  }
}

export async function fetchFeishuBitableSyncConfigPackageFromUrl(rawUrl: string): Promise<FeishuBitableSyncConfigPackage> {
  const url = toText(rawUrl)
  if (!/^https?:\/\//i.test(url))
    throw new Error('配置包 URL 必须是 http(s) 地址')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  })
  if (!response.ok)
    throw new Error(`配置包读取失败：HTTP ${response.status}`)

  const payload = await response.json().catch(() => null) as unknown
  const rawPackage = isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.package)
    ? payload.data.package
    : (isRecord(payload) && isRecord(payload.package) ? payload.package : payload)

  return normalizeFeishuBitableSyncConfigPackage(rawPackage)
}

export async function importFeishuBitableSyncConfigPackage(
  db: Queryable,
  input: {
    actorUserId: string
    package: FeishuBitableSyncConfigPackage
    sourceShareKey?: string | null
  },
): Promise<FeishuBitableSyncConfigImportResult> {
  const draft = prepareFeishuBitableSyncConfigImportDraft(input.package)
  const sync = await createFeishuBitableSync(db, {
    actorUserId: input.actorUserId,
    name: draft.name,
    source: draft.source,
  })

  await patchFeishuBitableSync(db, {
    actorUserId: input.actorUserId,
    syncId: sync.id,
    patch: {
      enabled: false,
      schedule: draft.schedule,
    },
  })

  for (const item of draft.items) {
    await createFeishuBitableSyncItem(db, {
      actorUserId: input.actorUserId,
      syncId: sync.id,
      name: item.name,
      entityType: item.entityType,
      tableId: item.tableId,
      viewId: item.viewId,
      source: item.source,
      writeback: item.writeback,
      autoSync: item.autoSync,
      isEnabled: false,
      mapping: item.mapping,
      options: item.options,
      schedule: {
        ...item.schedule,
        enabled: false,
      },
    })
  }

  const detail = await getFeishuBitableSyncDetail(db, {
    syncId: sync.id,
    includeInactive: true,
  })
  if (!detail)
    throw new Error('FEISHU_BITABLE_SYNC_CONFIG_IMPORT_FAILED')

  return {
    sync: detail,
    importedItemCount: draft.items.length,
    sourceShareKey: toText(input.sourceShareKey) || null,
  }
}
