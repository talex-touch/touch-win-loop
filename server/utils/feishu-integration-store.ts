import type { Queryable } from '~~/server/utils/db'
import type {
  FeishuAdminCandidate,
  FeishuAdminGroupReconcileResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverviewContestAdmin,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuBitableSourceConfig,
  FeishuBitableSync,
  FeishuBitableSyncDetail,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableSyncItemRun,
  FeishuBitableSyncRunStatus,
  FeishuBitableSyncRunTriggerSource,
  FeishuBitableWritebackConfig,
  FeishuConfigValidationResult,
  FeishuIntegrationConfig,
  FeishuMappingConfigV2,
  FeishuPostSyncTask,
  FeishuPostSyncTaskStatus,
  FeishuPostSyncTaskType,
  FeishuSyncIssue,
  FeishuSyncIssueResolution,
  FeishuSyncIssueStatus,
  FeishuSyncRunMode,
  FeishuTaskIssueStats,
  FeishuTaskLatestRunSummary,
  FeishuTaskScheduleConfig,
  PlatformRole,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import {
  computeNextScheduledRunAtOrNull,
  getDefaultFeishuTaskScheduleConfig,
  mergeFeishuTaskSchedulePatch,
  normalizeFeishuTaskScheduleConfig,
  validateFeishuTaskScheduleConfig,
} from '~~/server/utils/feishu-task-schedule'
import { decryptConfigSecretSafe, encryptConfigSecret, hasConfigMasterKey, isEncryptedConfigValue } from '~~/server/utils/secure-config'

const FEISHU_CONFIG_META_KEY = 'feishu_integration_config.v1'
const DEFAULT_WEBSDK_SCRIPT_URL = 'https://lf1-cdn-tos.bytegoofy.com/goofy/lark/op/h5-js-sdk-1.5.22.js'

interface AuthIdentityRow {
  id: string
  provider: string
  provider_user_id: string
  user_id: string
  profile_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface FeishuBitableSyncItemRow {
  id: string
  sync_id: string
  name: string
  entity_type: FeishuBitableSyncItemEntityType
  app_token: string
  table_id: string
  view_id: string
  source_json: Record<string, unknown>
  writeback_json: Record<string, unknown>
  is_enabled: boolean
  mapping_json: Record<string, unknown>
  options_json: Record<string, unknown>
  last_run_at: string | null
  schedule_enabled: boolean
  schedule_mode: 'interval' | 'cron'
  schedule_interval_minutes: number | string | null
  schedule_cron_expr: string | null
  schedule_timezone: string
  schedule_next_run_at: string | null
  schedule_last_run_at: string | null
  schedule_last_error: string | null
  latest_run_id: string | null
  latest_run_status: FeishuBitableSyncRunStatus | null
  latest_run_trigger_source: FeishuBitableSyncRunTriggerSource | null
  latest_run_started_at: string | null
  latest_run_finished_at: string | null
  latest_run_error_count: number | string | null
  latest_run_error_message: string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface FeishuBitableSyncRow {
  id: string
  name: string
  source_json: Record<string, unknown>
  item_count: number | string
  enabled_item_count: number | string
  latest_run_id: string | null
  latest_run_status: FeishuBitableSyncRunStatus | null
  latest_run_trigger_source: FeishuBitableSyncRunTriggerSource | null
  latest_run_started_at: string | null
  latest_run_finished_at: string | null
  latest_run_error_count: number | string | null
  latest_run_error_message: string | null
  open_issue_count: number | string | null
  resolved_issue_count: number | string | null
  ignored_issue_count: number | string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface FeishuBitableSyncItemRunRow {
  id: string
  sync_item_id: string
  task_name: string
  status: FeishuBitableSyncRunStatus
  trigger_source: FeishuBitableSyncRunTriggerSource
  mode: FeishuSyncRunMode
  delta_record_count: number | string
  started_at: string
  finished_at: string | null
  fetched_count: number | string
  created_count: number | string
  updated_count: number | string
  skipped_count: number | string
  error_count: number | string
  error_message: string
  created_by_user_id: string | null
  created_at: string
}

interface FeishuPostSyncTaskRow {
  id: string
  sync_item_id: string | null
  run_id: string | null
  scope: FeishuBitableSyncItemEntityType
  entity_id: string
  external_id: string
  task_type: FeishuPostSyncTaskType
  status: FeishuPostSyncTaskStatus
  attempt: number | string
  max_attempt: number | string
  source_hash: string
  next_run_at: string
  error_message: string
  payload: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

const FEISHU_VECTOR_MODE_KEY = Symbol.for('winloop.feishu.vector.mode.v1')

type FeishuVectorMode = 'vector' | 'json'

interface FeishuSyncIssueRow {
  id: string
  sync_item_id: string
  entity_type: FeishuBitableSyncItemEntityType
  record_id: string
  external_id: string
  status: FeishuSyncIssueStatus
  reason_code: string
  message: string
  payload: unknown
  resolution: string
  resolution_payload: unknown
  resolved_by_user_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

interface FeishuSyncIssueStatsRow {
  status: FeishuSyncIssueStatus
  issue_count: number | string
}

interface FeishuContestAdminDirectoryRow {
  user_id: string
  username: string
  union_id: string | null
}

interface FeishuAdminCandidateRow {
  user_id: string
  username: string
  union_id: string | null
  has_contest_admin: boolean
  is_platform_admin: boolean
}

export interface ClaimedFeishuBitableSyncItem {
  item: FeishuBitableSyncItem
  lockToken: string
}

export interface FeishuIntegrationConfigInternal {
  enabled: boolean
  appId: string
  appSecret: string
  oauthRedirectUri: string
  eventToken: string
  eventEncryptKey: string
  adminGroupIds: string[]
  webSdkScriptUrl: string
  startupNotifyEnabled: boolean
  startupNotifyChatId: string
  startupNotifyRemark: string
  startupFallbackVersion: string
  startupFallbackCommitSha: string
  updatedAt: string
  updatedByUserId: string
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function toBoolean(raw: unknown, fallback = false): boolean {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  return fallback
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw))
    return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const normalized = String(item || '').trim()
    if (!normalized || seen.has(normalized))
      continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function normalizeNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw))
    return []
  const result: number[] = []
  for (const item of raw) {
    const value = Number(item)
    if (!Number.isFinite(value))
      continue
    result.push(value)
  }
  return result
}

async function resolveFeishuVectorMode(db: Queryable): Promise<FeishuVectorMode> {
  const globalRef = globalThis as Record<symbol, unknown>
  const cached = globalRef[FEISHU_VECTOR_MODE_KEY] as FeishuVectorMode | undefined
  if (cached)
    return cached

  const result = await db.query<{ has_embedding: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'feishu_vectors'
        AND column_name = 'embedding'
    ) AS has_embedding`,
  )
  const mode: FeishuVectorMode = result.rows[0]?.has_embedding ? 'vector' : 'json'
  globalRef[FEISHU_VECTOR_MODE_KEY] = mode
  return mode
}

function normalizeBitableSource(raw: unknown, fallback: {
  appToken: string
  tableId: string
  viewId: string
}): FeishuBitableSourceConfig {
  const source = parseJsonObject(raw)
  return {
    appToken: toText(source.appToken) || fallback.appToken,
    tableId: toText(source.tableId) || fallback.tableId,
    viewId: toText(source.viewId) || fallback.viewId || '',
    appName: toText(source.appName),
    tableName: toText(source.tableName),
    viewName: toText(source.viewName),
    sourceUrl: toText(source.sourceUrl),
  }
}

function normalizeWritebackConfig(raw: unknown): FeishuBitableWritebackConfig {
  const source = parseJsonObject(raw)
  const fieldsRaw = parseJsonObject(source.fields)
  const valuesRaw = parseJsonObject(source.values)
  return {
    enabled: source.enabled !== false,
    fields: {
      status: toText(fieldsRaw.status),
      syncedAt: toText(fieldsRaw.syncedAt),
      errorMessage: toText(fieldsRaw.errorMessage),
      reasonCode: toText(fieldsRaw.reasonCode),
      entityId: toText(fieldsRaw.entityId),
      runId: toText(fieldsRaw.runId),
      triggerSource: toText(fieldsRaw.triggerSource),
    },
    values: {
      success: toText(valuesRaw.success),
      failed: toText(valuesRaw.failed),
      skipped: toText(valuesRaw.skipped),
    },
  }
}

function parseTaskSchedule(row: Pick<FeishuBitableSyncItemRow, 'schedule_enabled' | 'schedule_mode' | 'schedule_interval_minutes' | 'schedule_cron_expr' | 'schedule_timezone'>): FeishuTaskScheduleConfig {
  try {
    return normalizeFeishuTaskScheduleConfig({
      enabled: Boolean(row.schedule_enabled),
      mode: row.schedule_mode || 'interval',
      intervalMinutes: row.schedule_interval_minutes === null ? null : Number(row.schedule_interval_minutes || 0),
      cronExpr: row.schedule_cron_expr || null,
      timezone: row.schedule_timezone || getDefaultFeishuTaskScheduleConfig().timezone,
    })
  }
  catch {
    return getDefaultFeishuTaskScheduleConfig()
  }
}

function toLatestRunSummary(row: FeishuBitableSyncItemRow): FeishuTaskLatestRunSummary | null {
  if (!row.latest_run_id || !row.latest_run_status || !row.latest_run_trigger_source || !row.latest_run_started_at)
    return null

  return {
    runId: row.latest_run_id,
    status: row.latest_run_status,
    triggerSource: row.latest_run_trigger_source,
    startedAt: row.latest_run_started_at,
    finishedAt: row.latest_run_finished_at || null,
    errorCount: Number(row.latest_run_error_count || 0),
    errorMessage: row.latest_run_error_message || '',
  }
}

function toIssueStats(input: {
  open?: number | string | null
  resolved?: number | string | null
  ignored?: number | string | null
}): FeishuTaskIssueStats {
  const open = Math.max(0, Number(input.open || 0))
  const resolved = Math.max(0, Number(input.resolved || 0))
  const ignored = Math.max(0, Number(input.ignored || 0))
  return {
    total: open + resolved + ignored,
    open,
    resolved,
    ignored,
  }
}

function normalizeFeishuConfigInternal(raw: unknown): FeishuIntegrationConfigInternal {
  const source = parseJsonObject(raw)
  return {
    enabled: hasOwn(source, 'enabled') ? toBoolean(source.enabled, false) : false,
    appId: hasOwn(source, 'appId') ? toText(source.appId) : '',
    appSecret: hasOwn(source, 'appSecret') ? decryptConfigSecretSafe(source.appSecret) : '',
    oauthRedirectUri: hasOwn(source, 'oauthRedirectUri') ? toText(source.oauthRedirectUri) : '',
    eventToken: hasOwn(source, 'eventToken') ? decryptConfigSecretSafe(source.eventToken) : '',
    eventEncryptKey: hasOwn(source, 'eventEncryptKey') ? decryptConfigSecretSafe(source.eventEncryptKey) : '',
    adminGroupIds: hasOwn(source, 'adminGroupIds') ? toStringArray(source.adminGroupIds) : [],
    webSdkScriptUrl: hasOwn(source, 'webSdkScriptUrl') ? toText(source.webSdkScriptUrl) : DEFAULT_WEBSDK_SCRIPT_URL,
    startupNotifyEnabled: hasOwn(source, 'startupNotifyEnabled') ? toBoolean(source.startupNotifyEnabled, false) : false,
    startupNotifyChatId: hasOwn(source, 'startupNotifyChatId') ? toText(source.startupNotifyChatId) : '',
    startupNotifyRemark: hasOwn(source, 'startupNotifyRemark') ? toText(source.startupNotifyRemark) : '',
    startupFallbackVersion: hasOwn(source, 'startupFallbackVersion') ? toText(source.startupFallbackVersion) : '',
    startupFallbackCommitSha: hasOwn(source, 'startupFallbackCommitSha') ? toText(source.startupFallbackCommitSha) : '',
    updatedAt: hasOwn(source, 'updatedAt') ? toText(source.updatedAt) : '',
    updatedByUserId: hasOwn(source, 'updatedByUserId') ? toText(source.updatedByUserId) : '',
  }
}

function toSync(row: FeishuBitableSyncRow): FeishuBitableSync {
  const source = normalizeBitableSource(row.source_json, {
    appToken: toText(parseJsonObject(row.source_json).appToken),
    tableId: '',
    viewId: '',
  })
  return {
    id: row.id,
    name: row.name,
    source,
    itemCount: Number(row.item_count || 0),
    enabledItemCount: Number(row.enabled_item_count || 0),
    issueStats: toIssueStats({
      open: row.open_issue_count,
      resolved: row.resolved_issue_count,
      ignored: row.ignored_issue_count,
    }),
    latestRunSummary: row.latest_run_id
      ? {
          runId: row.latest_run_id,
          status: row.latest_run_status || 'failed',
          triggerSource: row.latest_run_trigger_source || 'manual',
          startedAt: row.latest_run_started_at || row.updated_at,
          finishedAt: row.latest_run_finished_at || null,
          errorCount: Number(row.latest_run_error_count || 0),
          errorMessage: row.latest_run_error_message || '',
        }
      : null,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSyncItem(row: FeishuBitableSyncItemRow): FeishuBitableSyncItem {
  const schedule = parseTaskSchedule(row)
  return {
    id: row.id,
    syncId: row.sync_id,
    name: row.name,
    entityType: row.entity_type,
    appToken: row.app_token,
    tableId: row.table_id,
    viewId: row.view_id || '',
    source: normalizeBitableSource(row.source_json, {
      appToken: row.app_token,
      tableId: row.table_id,
      viewId: row.view_id || '',
    }),
    writeback: normalizeWritebackConfig(row.writeback_json),
    isEnabled: Boolean(row.is_enabled),
    mapping: parseJsonObject(row.mapping_json),
    options: parseJsonObject(row.options_json),
    lastRunAt: row.last_run_at,
    schedule,
    scheduleRuntime: {
      nextRunAt: row.schedule_next_run_at || null,
      lastRunAt: row.schedule_last_run_at || null,
      lastError: row.schedule_last_error || '',
    },
    latestRunSummary: toLatestRunSummary(row),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRun(row: FeishuBitableSyncItemRunRow): FeishuBitableSyncItemRun {
  return {
    id: row.id,
    syncItemId: row.sync_item_id,
    syncItemName: row.task_name,
    status: row.status,
    triggerSource: row.trigger_source,
    mode: row.mode || 'full',
    deltaRecordCount: Number(row.delta_record_count || 0),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    fetchedCount: Number(row.fetched_count || 0),
    createdCount: Number(row.created_count || 0),
    updatedCount: Number(row.updated_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    errorCount: Number(row.error_count || 0),
    errorMessage: row.error_message || '',
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
  }
}

function toPostSyncTask(row: FeishuPostSyncTaskRow): FeishuPostSyncTask {
  return {
    id: row.id,
    syncItemId: row.sync_item_id || null,
    runId: row.run_id || null,
    scope: row.scope,
    entityId: row.entity_id,
    externalId: row.external_id || '',
    taskType: row.task_type,
    status: row.status,
    attempt: Number(row.attempt || 0),
    maxAttempt: Number(row.max_attempt || 0),
    sourceHash: row.source_hash || '',
    nextRunAt: row.next_run_at,
    errorMessage: row.error_message || '',
    payload: parseJsonObject(row.payload),
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toIssue(row: FeishuSyncIssueRow): FeishuSyncIssue {
  return {
    id: row.id,
    syncItemId: row.sync_item_id,
    entityType: row.entity_type,
    recordId: row.record_id,
    externalId: row.external_id,
    status: row.status,
    reasonCode: row.reason_code,
    message: row.message || '',
    payload: parseJsonObject(row.payload),
    resolution: row.resolution ? row.resolution as FeishuSyncIssueResolution : null,
    resolutionPayload: parseJsonObject(row.resolution_payload),
    resolvedByUserId: row.resolved_by_user_id || null,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeMappingConfigV2(raw: unknown): FeishuMappingConfigV2 | null {
  const source = parseJsonObject(raw)
  if (Number(source.schemaVersion) !== 2)
    return null

  const layers = Array.isArray(source.layers)
    ? source.layers
        .map((item) => {
          const layer = parseJsonObject(item)
          const fieldMap = parseJsonObject(layer.fieldMap)
          const fieldBindings = Array.isArray(layer.fieldBindings)
            ? layer.fieldBindings
                .map(bindingItem => parseJsonObject(bindingItem))
                .filter(binding => toText(binding.targetPath))
                .map(binding => ({
                  key: toText(binding.key),
                  targetPath: toText(binding.targetPath),
                  sourceField: toText(binding.sourceField),
                  transform: toText(binding.transform),
                }))
            : []
          return {
            id: toText(layer.id) || randomUUID(),
            scopeType: (toText(layer.scopeType) || 'global') as FeishuMappingConfigV2['layers'][number]['scopeType'],
            scopeValue: toText(layer.scopeValue) || '*',
            priority: Number.isFinite(Number(layer.priority)) ? Number(layer.priority) : 0,
            enabled: layer.enabled !== false,
            fieldMap: Object.fromEntries(
              Object.entries(fieldMap)
                .map(([key, value]) => [key, toText(value)])
                .filter(([, value]) => Boolean(value)),
            ),
            fieldBindings,
            defaults: parseJsonObject(layer.defaults),
          }
        })
        .filter(item => item.id && item.scopeType)
    : []

  const match = parseJsonObject(source.match)
  return {
    schemaVersion: 2,
    match: {
      externalIdField: toText(match.externalIdField),
      contestExternalIdField: toText(match.contestExternalIdField),
      trackExternalIdField: toText(match.trackExternalIdField),
    },
    layers,
  }
}

export function validateFeishuMappingConfig(raw: unknown): FeishuConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const v2 = normalizeMappingConfigV2(raw)
  if (!v2) {
    warnings.push('当前配置非 v2 结构，将按兼容模式解析。')
    return {
      valid: true,
      errors,
      warnings,
    }
  }

  if (!v2.layers.length)
    errors.push('v2 配置至少需要 1 个 layer。')

  const scopeTypes = new Set(['global', 'activity', 'instance', 'region', 'stage', 'track', 'policy'])
  for (const layer of v2.layers) {
    if (!scopeTypes.has(layer.scopeType))
      errors.push(`layer(${layer.id}) scopeType 非法：${layer.scopeType}`)
    if (!layer.fieldMap || Object.keys(layer.fieldMap).length === 0) {
      if (!Array.isArray(layer.fieldBindings) || layer.fieldBindings.length === 0)
        warnings.push(`layer(${layer.id}) 未配置 fieldMap/fieldBindings，可能不会产生映射结果。`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function toTaskIssueStats(rows: FeishuSyncIssueStatsRow[]): FeishuTaskIssueStats {
  const stats: FeishuTaskIssueStats = {
    total: 0,
    open: 0,
    resolved: 0,
    ignored: 0,
  }

  for (const row of rows) {
    const count = Number(row.issue_count || 0)
    stats.total += count
    if (row.status === 'open')
      stats.open += count
    else if (row.status === 'resolved')
      stats.resolved += count
    else if (row.status === 'ignored')
      stats.ignored += count
  }

  return stats
}

export function toPublicFeishuIntegrationConfig(config: FeishuIntegrationConfigInternal): FeishuIntegrationConfig {
  return {
    enabled: config.enabled,
    appId: config.appId,
    appSecretConfigured: Boolean(config.appSecret),
    oauthRedirectUri: config.oauthRedirectUri,
    eventTokenConfigured: Boolean(config.eventToken),
    eventEncryptKeyConfigured: Boolean(config.eventEncryptKey),
    adminGroupIds: [...config.adminGroupIds],
    webSdkScriptUrl: config.webSdkScriptUrl || DEFAULT_WEBSDK_SCRIPT_URL,
    startupNotifyEnabled: Boolean(config.startupNotifyEnabled),
    startupNotifyChatId: toText(config.startupNotifyChatId),
    startupNotifyRemark: toText(config.startupNotifyRemark),
    startupFallbackVersion: toText(config.startupFallbackVersion),
    startupFallbackCommitSha: toText(config.startupFallbackCommitSha),
    updatedAt: config.updatedAt,
    updatedByUserId: config.updatedByUserId,
  }
}

export async function readFeishuIntegrationConfig(db: Queryable): Promise<FeishuIntegrationConfigInternal> {
  const result = await db.query<{ value: string }>(
    'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
    [FEISHU_CONFIG_META_KEY],
  )

  const raw = String(result.rows[0]?.value || '').trim()
  if (!raw)
    return normalizeFeishuConfigInternal({})

  try {
    return normalizeFeishuConfigInternal(JSON.parse(raw))
  }
  catch {
    return normalizeFeishuConfigInternal({})
  }
}

export async function writeFeishuIntegrationConfig(
  db: Queryable,
  config: FeishuIntegrationConfigInternal,
): Promise<FeishuIntegrationConfigInternal> {
  const normalized = normalizeFeishuConfigInternal(config)
  const hasMasterKey = hasConfigMasterKey()
  const persistable = {
    ...normalized,
    appSecret: hasMasterKey && normalized.appSecret && !isEncryptedConfigValue(normalized.appSecret)
      ? encryptConfigSecret(normalized.appSecret)
      : normalized.appSecret,
    eventToken: hasMasterKey && normalized.eventToken && !isEncryptedConfigValue(normalized.eventToken)
      ? encryptConfigSecret(normalized.eventToken)
      : normalized.eventToken,
    eventEncryptKey: hasMasterKey && normalized.eventEncryptKey && !isEncryptedConfigValue(normalized.eventEncryptKey)
      ? encryptConfigSecret(normalized.eventEncryptKey)
      : normalized.eventEncryptKey,
  }
  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [FEISHU_CONFIG_META_KEY, JSON.stringify(persistable)],
  )
  return normalized
}

export async function findAuthIdentityByProviderUserId(
  db: Queryable,
  input: {
    provider: 'feishu'
    providerUserId: string
  },
): Promise<AuthIdentityRow | null> {
  const result = await db.query<AuthIdentityRow>(
    `SELECT
      id,
      provider,
      provider_user_id,
      user_id,
      profile_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM auth_identities
     WHERE provider = $1
       AND provider_user_id = $2
     LIMIT 1`,
    [input.provider, input.providerUserId],
  )

  return result.rows[0] || null
}

export async function findAuthIdentityByProviderAndUserId(
  db: Queryable,
  input: {
    provider: 'feishu'
    userId: string
  },
): Promise<AuthIdentityRow | null> {
  const result = await db.query<AuthIdentityRow>(
    `SELECT
      id,
      provider,
      provider_user_id,
      user_id,
      profile_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM auth_identities
     WHERE provider = $1
       AND user_id = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.provider, input.userId],
  )

  return result.rows[0] || null
}

export async function upsertAuthIdentity(
  db: Queryable,
  input: {
    provider: 'feishu'
    providerUserId: string
    userId: string
    profile?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO auth_identities (
      id,
      provider,
      provider_user_id,
      user_id,
      profile_json,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::JSONB, NOW(), NOW()
    )
    ON CONFLICT (provider, provider_user_id)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      profile_json = EXCLUDED.profile_json,
      updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      input.provider,
      input.providerUserId,
      input.userId,
      JSON.stringify(parseJsonObject(input.profile)),
    ],
  )
}

export async function getFeishuAuthBindStatusByUserId(
  db: Queryable,
  userId: string,
): Promise<FeishuAuthBindStatus> {
  const identity = await findAuthIdentityByProviderAndUserId(db, {
    provider: 'feishu',
    userId,
  })

  if (!identity) {
    return {
      linked: false,
    }
  }

  const profile = parseJsonObject(identity.profile_json)
  return {
    linked: true,
    unionId: String(identity.provider_user_id || '').trim() || '',
    name: toText(profile.name),
    enName: toText(profile.enName),
    email: toText(profile.email),
    mobile: toText(profile.mobile),
    updatedAt: identity.updated_at || '',
  }
}

export async function unbindFeishuAuthByUserId(
  db: Queryable,
  userId: string,
): Promise<FeishuAuthUnbindResult> {
  const normalizedUserId = toText(userId)
  if (!normalizedUserId) {
    return {
      removedCount: 0,
      removedUnionIds: [],
      status: {
        linked: false,
      },
    }
  }

  const existingResult = await db.query<{ provider_user_id: string }>(
    `SELECT provider_user_id
     FROM auth_identities
     WHERE provider = 'feishu'
       AND user_id = $1
     ORDER BY updated_at DESC`,
    [normalizedUserId],
  )
  const unionIds = toStringArray(existingResult.rows.map(row => row.provider_user_id))

  const removedResult = await db.query<{ id: string }>(
    `DELETE FROM auth_identities
     WHERE provider = 'feishu'
       AND user_id = $1
     RETURNING id`,
    [normalizedUserId],
  )

  return {
    removedCount: removedResult.rows.length,
    removedUnionIds: unionIds,
    status: {
      linked: false,
    },
  }
}

export async function ensurePlatformRole(
  db: Queryable,
  input: {
    userId: string
    role: PlatformRole
  },
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO platform_user_roles (
      id,
      user_id,
      role,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, NOW(), NOW()
    )
    ON CONFLICT (user_id, role)
    DO NOTHING
    RETURNING id`,
    [randomUUID(), input.userId, input.role],
  )
  return Boolean(result.rows[0]?.id)
}

export async function revokePlatformRole(
  db: Queryable,
  input: {
    userId: string
    role: PlatformRole
  },
): Promise<boolean> {
  const result = await db.query<{ user_id: string }>(
    `DELETE FROM platform_user_roles
     WHERE user_id = $1
       AND role = $2
     RETURNING user_id`,
    [input.userId, input.role],
  )
  return Boolean(result.rows[0]?.user_id)
}

export async function listFeishuUserIdsByUnionIds(
  db: Queryable,
  unionIds: string[],
): Promise<Map<string, string>> {
  const normalized = toStringArray(unionIds)
  if (normalized.length === 0)
    return new Map<string, string>()

  const result = await db.query<{
    provider_user_id: string
    user_id: string
  }>(
    `SELECT provider_user_id, user_id
     FROM auth_identities
     WHERE provider = 'feishu'
       AND provider_user_id = ANY($1::TEXT[])`,
    [normalized],
  )

  return new Map(result.rows.map(row => [row.provider_user_id, row.user_id]))
}

export async function listFeishuContestAdminUsers(
  db: Queryable,
): Promise<Array<{ userId: string, unionId: string }>> {
  const result = await db.query<{ user_id: string, provider_user_id: string }>(
    `SELECT
      ai.user_id,
      ai.provider_user_id
     FROM auth_identities ai
     JOIN platform_user_roles pr ON pr.user_id = ai.user_id
     WHERE ai.provider = 'feishu'
       AND pr.role = 'contest_admin'`,
  )

  return result.rows.map(row => ({
    userId: row.user_id,
    unionId: row.provider_user_id,
  }))
}

export async function listFeishuContestAdminDirectory(
  db: Queryable,
): Promise<FeishuAdminOverviewContestAdmin[]> {
  const result = await db.query<FeishuContestAdminDirectoryRow>(
    `SELECT
      u.id AS user_id,
      u.username,
      ai.provider_user_id AS union_id
     FROM users u
     JOIN platform_user_roles pr ON pr.user_id = u.id
     LEFT JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'feishu'
     WHERE pr.role = 'contest_admin'
     ORDER BY u.username ASC`,
  )

  return result.rows.map(row => ({
    userId: row.user_id,
    username: row.username,
    unionId: row.union_id || null,
  }))
}

export async function searchFeishuAdminCandidates(
  db: Queryable,
  input: {
    keyword?: string
    limit?: number
  } = {},
): Promise<FeishuAdminCandidate[]> {
  const keyword = toText(input.keyword).slice(0, 120)
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)))
  const result = await db.query<FeishuAdminCandidateRow>(
    `SELECT
      u.id AS user_id,
      u.username,
      ai.provider_user_id AS union_id,
      EXISTS (
        SELECT 1
        FROM platform_user_roles pr_contest
        WHERE pr_contest.user_id = u.id
          AND pr_contest.role = 'contest_admin'
      ) AS has_contest_admin,
      u.is_platform_admin
     FROM users u
     LEFT JOIN auth_identities ai ON ai.user_id = u.id AND ai.provider = 'feishu'
     WHERE (
       $1::TEXT = ''
       OR u.username ILIKE ('%' || $1 || '%')
       OR COALESCE(ai.provider_user_id, '') ILIKE ('%' || $1 || '%')
     )
     ORDER BY has_contest_admin DESC, u.updated_at DESC
     LIMIT $2`,
    [keyword, limit],
  )

  return result.rows.map(row => ({
    userId: row.user_id,
    username: row.username,
    unionId: row.union_id || null,
    hasContestAdmin: Boolean(row.has_contest_admin),
    isPlatformSuperAdmin: Boolean(row.is_platform_admin),
  }))
}

export async function listUsersByIds(
  db: Queryable,
  userIds: string[],
): Promise<Map<string, { userId: string, username: string }>> {
  const normalized = toStringArray(userIds)
  if (normalized.length === 0)
    return new Map<string, { userId: string, username: string }>()

  const result = await db.query<{ user_id: string, username: string }>(
    `SELECT id AS user_id, username
     FROM users
     WHERE id = ANY($1::TEXT[])`,
    [normalized],
  )

  return new Map(result.rows.map(row => [
    row.user_id,
    {
      userId: row.user_id,
      username: row.username,
    },
  ]))
}

export async function grantFeishuContestAdminRole(
  db: Queryable,
  input: {
    targetUserId: string
  },
): Promise<FeishuAdminManualAddResult | null> {
  const targetUserId = toText(input.targetUserId)
  if (!targetUserId)
    return null

  const userResult = await db.query<{ user_id: string, username: string }>(
    `SELECT id AS user_id, username
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [targetUserId],
  )
  const user = userResult.rows[0]
  if (!user)
    return null

  const insertResult = await db.query<{ id: string }>(
    `INSERT INTO platform_user_roles (
      id,
      user_id,
      role,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'contest_admin', NOW(), NOW()
    )
    ON CONFLICT (user_id, role)
    DO NOTHING
    RETURNING id`,
    [randomUUID(), targetUserId],
  )

  return {
    userId: user.user_id,
    username: user.username,
    granted: Boolean(insertResult.rows[0]?.id),
  }
}

async function ensureFeishuBitableSync(
  db: Queryable,
  input: {
    syncId: string
    actorUserId: string
    name: string
    source: FeishuBitableSourceConfig
  },
): Promise<void> {
  const syncId = toText(input.syncId)
  if (!syncId)
    throw new Error('SYNC_ID_REQUIRED')

  await db.query(
    `INSERT INTO feishu_bitable_syncs (
      id,
      name,
      source_json,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3::JSONB, $4, $4, NOW(), NOW()
    )
    ON CONFLICT (id)
    DO NOTHING`,
    [
      syncId,
      toText(input.name) || '多维同步',
      JSON.stringify(parseJsonObject(input.source)),
      input.actorUserId,
    ],
  )
}

export async function suggestNextFeishuBitableSyncName(
  db: Queryable,
  prefix = '多维同步',
): Promise<string> {
  const normalizedPrefix = toText(prefix) || '多维同步'
  const result = await db.query<{ name: string }>(
    `SELECT name
     FROM feishu_bitable_syncs
     WHERE name LIKE $1`,
    [`${normalizedPrefix} %`],
  )

  let maxIndex = 0
  for (const row of result.rows) {
    const name = toText(row.name)
    const match = name.match(new RegExp(`^${normalizedPrefix}\\s+(\\d+)$`))
    if (!match)
      continue
    const index = Number(match[1] || 0)
    if (Number.isInteger(index) && index > maxIndex)
      maxIndex = index
  }

  return `${normalizedPrefix} ${maxIndex + 1}`
}

export async function listFeishuBitableSyncs(
  db: Queryable,
): Promise<FeishuBitableSync[]> {
  const result = await db.query<FeishuBitableSyncRow>(
    `SELECT
      s.id,
      s.name,
      s.source_json,
      COUNT(i.id)::INTEGER AS item_count,
      COUNT(i.id) FILTER (WHERE i.is_enabled = TRUE)::INTEGER AS enabled_item_count,
      lr.id AS latest_run_id,
      lr.status AS latest_run_status,
      lr.trigger_source AS latest_run_trigger_source,
      lr.started_at::TEXT AS latest_run_started_at,
      lr.finished_at::TEXT AS latest_run_finished_at,
      lr.error_count AS latest_run_error_count,
      lr.error_message AS latest_run_error_message,
      COALESCE(issue_stats.open_issue_count, 0)::INTEGER AS open_issue_count,
      COALESCE(issue_stats.resolved_issue_count, 0)::INTEGER AS resolved_issue_count,
      COALESCE(issue_stats.ignored_issue_count, 0)::INTEGER AS ignored_issue_count,
      s.created_by_user_id,
      s.updated_by_user_id,
      s.created_at::TEXT,
      s.updated_at::TEXT
     FROM feishu_bitable_syncs s
     LEFT JOIN feishu_bitable_sync_items i ON i.sync_id = s.id
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_item_runs r
       JOIN feishu_bitable_sync_items i2 ON i2.id = r.sync_item_id
       WHERE i2.sync_id = s.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE iss.status = 'open') AS open_issue_count,
         COUNT(*) FILTER (WHERE iss.status = 'resolved') AS resolved_issue_count,
         COUNT(*) FILTER (WHERE iss.status = 'ignored') AS ignored_issue_count
       FROM feishu_sync_issues iss
       JOIN feishu_bitable_sync_items i3 ON i3.id = iss.sync_item_id
       WHERE i3.sync_id = s.id
     ) issue_stats ON TRUE
     GROUP BY
      s.id,
      s.name,
      s.source_json,
      lr.id,
      lr.status,
      lr.trigger_source,
      lr.started_at,
      lr.finished_at,
      lr.error_count,
      lr.error_message,
      issue_stats.open_issue_count,
      issue_stats.resolved_issue_count,
      issue_stats.ignored_issue_count,
      s.created_by_user_id,
      s.updated_by_user_id,
      s.created_at,
      s.updated_at
     ORDER BY s.updated_at DESC`,
  )
  return result.rows.map(toSync)
}

export async function getFeishuBitableSyncById(
  db: Queryable,
  syncId: string,
): Promise<FeishuBitableSync | null> {
  const result = await db.query<FeishuBitableSyncRow>(
    `SELECT
      s.id,
      s.name,
      s.source_json,
      COUNT(i.id)::INTEGER AS item_count,
      COUNT(i.id) FILTER (WHERE i.is_enabled = TRUE)::INTEGER AS enabled_item_count,
      lr.id AS latest_run_id,
      lr.status AS latest_run_status,
      lr.trigger_source AS latest_run_trigger_source,
      lr.started_at::TEXT AS latest_run_started_at,
      lr.finished_at::TEXT AS latest_run_finished_at,
      lr.error_count AS latest_run_error_count,
      lr.error_message AS latest_run_error_message,
      COALESCE(issue_stats.open_issue_count, 0)::INTEGER AS open_issue_count,
      COALESCE(issue_stats.resolved_issue_count, 0)::INTEGER AS resolved_issue_count,
      COALESCE(issue_stats.ignored_issue_count, 0)::INTEGER AS ignored_issue_count,
      s.created_by_user_id,
      s.updated_by_user_id,
      s.created_at::TEXT,
      s.updated_at::TEXT
     FROM feishu_bitable_syncs s
     LEFT JOIN feishu_bitable_sync_items i ON i.sync_id = s.id
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_item_runs r
       JOIN feishu_bitable_sync_items i2 ON i2.id = r.sync_item_id
       WHERE i2.sync_id = s.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE iss.status = 'open') AS open_issue_count,
         COUNT(*) FILTER (WHERE iss.status = 'resolved') AS resolved_issue_count,
         COUNT(*) FILTER (WHERE iss.status = 'ignored') AS ignored_issue_count
       FROM feishu_sync_issues iss
       JOIN feishu_bitable_sync_items i3 ON i3.id = iss.sync_item_id
       WHERE i3.sync_id = s.id
     ) issue_stats ON TRUE
     WHERE s.id = $1
     GROUP BY
      s.id,
      s.name,
      s.source_json,
      lr.id,
      lr.status,
      lr.trigger_source,
      lr.started_at,
      lr.finished_at,
      lr.error_count,
      lr.error_message,
      issue_stats.open_issue_count,
      issue_stats.resolved_issue_count,
      issue_stats.ignored_issue_count,
      s.created_by_user_id,
      s.updated_by_user_id,
      s.created_at,
      s.updated_at
     LIMIT 1`,
    [syncId],
  )
  const row = result.rows[0]
  return row ? toSync(row) : null
}

export async function createFeishuBitableSync(
  db: Queryable,
  input: {
    actorUserId: string
    name: string
    source: FeishuBitableSourceConfig
  },
): Promise<FeishuBitableSync> {
  const syncId = randomUUID()
  await ensureFeishuBitableSync(db, {
    syncId,
    actorUserId: input.actorUserId,
    name: input.name,
    source: input.source,
  })
  const sync = await getFeishuBitableSyncById(db, syncId)
  if (!sync)
    throw new Error('FEISHU_BITABLE_SYNC_CREATE_FAILED')
  return sync
}

export async function patchFeishuBitableSync(
  db: Queryable,
  input: {
    actorUserId: string
    syncId: string
    patch: {
      name?: string
      source?: FeishuBitableSourceConfig
    }
  },
): Promise<FeishuBitableSync | null> {
  const existing = await getFeishuBitableSyncById(db, input.syncId)
  if (!existing)
    return null

  const sets: string[] = []
  const values: unknown[] = [input.syncId]
  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.name !== undefined)
    addSet('name', toText(input.patch.name))
  if (input.patch.source !== undefined)
    addSet('source_json', JSON.stringify(parseJsonObject(input.patch.source)))
  if (!sets.length)
    return existing

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')
  await db.query(
    `UPDATE feishu_bitable_syncs
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  if (input.patch.source?.appToken) {
    await db.query(
      `UPDATE feishu_bitable_sync_items
       SET app_token = $2,
           updated_at = NOW()
       WHERE sync_id = $1`,
      [input.syncId, toText(input.patch.source.appToken)],
    )
  }

  return getFeishuBitableSyncById(db, input.syncId)
}

export async function listFeishuBitableSyncItems(
  db: Queryable,
  input: { includeInactive?: boolean, syncId?: string } = {},
): Promise<FeishuBitableSyncItem[]> {
  const includeInactive = input.includeInactive === true
  const result = await db.query<FeishuBitableSyncItemRow>(
    `SELECT
      t.id,
      t.sync_id,
      t.name,
      t.entity_type,
      t.app_token,
      t.table_id,
      t.view_id,
      t.source_json,
      t.writeback_json,
      t.is_enabled,
      t.mapping_json,
      t.options_json,
      t.last_run_at::TEXT,
      t.schedule_enabled,
      t.schedule_mode,
      t.schedule_interval_minutes,
      t.schedule_cron_expr,
      t.schedule_timezone,
      t.schedule_next_run_at::TEXT,
      t.schedule_last_run_at::TEXT,
      t.schedule_last_error,
      lr.id AS latest_run_id,
      lr.status AS latest_run_status,
      lr.trigger_source AS latest_run_trigger_source,
      lr.started_at::TEXT AS latest_run_started_at,
      lr.finished_at::TEXT AS latest_run_finished_at,
      lr.error_count AS latest_run_error_count,
      lr.error_message AS latest_run_error_message,
      t.created_by_user_id,
      t.updated_by_user_id,
      t.created_at::TEXT,
      t.updated_at::TEXT
     FROM feishu_bitable_sync_items t
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_item_runs r
       WHERE r.sync_item_id = t.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE ($1::BOOLEAN = TRUE OR t.is_enabled = TRUE)
       AND ($2::TEXT = '' OR t.sync_id = $2)
     ORDER BY t.updated_at DESC`,
    [includeInactive, toText(input.syncId)],
  )
  return result.rows.map(toSyncItem)
}

export async function getFeishuBitableSyncItemById(
  db: Queryable,
  syncItemId: string,
): Promise<FeishuBitableSyncItem | null> {
  const result = await db.query<FeishuBitableSyncItemRow>(
    `SELECT
      t.id,
      t.sync_id,
      t.name,
      t.entity_type,
      t.app_token,
      t.table_id,
      t.view_id,
      t.source_json,
      t.writeback_json,
      t.is_enabled,
      t.mapping_json,
      t.options_json,
      t.last_run_at::TEXT,
      t.schedule_enabled,
      t.schedule_mode,
      t.schedule_interval_minutes,
      t.schedule_cron_expr,
      t.schedule_timezone,
      t.schedule_next_run_at::TEXT,
      t.schedule_last_run_at::TEXT,
      t.schedule_last_error,
      lr.id AS latest_run_id,
      lr.status AS latest_run_status,
      lr.trigger_source AS latest_run_trigger_source,
      lr.started_at::TEXT AS latest_run_started_at,
      lr.finished_at::TEXT AS latest_run_finished_at,
      lr.error_count AS latest_run_error_count,
      lr.error_message AS latest_run_error_message,
      t.created_by_user_id,
      t.updated_by_user_id,
      t.created_at::TEXT,
      t.updated_at::TEXT
     FROM feishu_bitable_sync_items t
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_item_runs r
       WHERE r.sync_item_id = t.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE t.id = $1
     LIMIT 1`,
    [syncItemId],
  )
  const row = result.rows[0]
  return row ? toSyncItem(row) : null
}

export async function createFeishuBitableSyncItem(
  db: Queryable,
  input: {
    actorUserId: string
    name: string
    syncId?: string
    entityType: FeishuBitableSyncItemEntityType
    appToken?: string
    tableId: string
    viewId?: string
    source?: FeishuBitableSourceConfig
    writeback?: FeishuBitableWritebackConfig
    isEnabled?: boolean
    mapping?: Record<string, unknown>
    options?: Record<string, unknown>
    schedule?: Partial<FeishuTaskScheduleConfig>
  },
): Promise<FeishuBitableSyncItem> {
  const schedule = normalizeFeishuTaskScheduleConfig(input.schedule || {}, getDefaultFeishuTaskScheduleConfig())
  const scheduleErrors = validateFeishuTaskScheduleConfig(schedule)
  if (scheduleErrors.length)
    throw new Error(`子表同步项调度配置非法：${scheduleErrors.join('；')}`)

  const syncId = toText(input.syncId)
  const parentSync = syncId ? await getFeishuBitableSyncById(db, syncId) : null
  if (syncId && !parentSync)
    throw new Error('FEISHU_BITABLE_SYNC_NOT_FOUND')
  const resolvedAppToken = toText(input.appToken) || toText(parentSync?.source.appToken)
  if (!resolvedAppToken)
    throw new Error('FEISHU_BITABLE_SYNC_APP_TOKEN_REQUIRED')

  const ensuredSyncId = syncId || randomUUID()
  const resolvedSource = {
    ...(input.source || {}),
    appToken: resolvedAppToken,
    appName: input.source?.appName || parentSync?.source.appName || '',
    sourceUrl: input.source?.sourceUrl || parentSync?.source.sourceUrl || '',
    tableId: toText(input.source?.tableId) || toText(input.tableId),
    viewId: toText(input.source?.viewId) || toText(input.viewId),
  } satisfies FeishuBitableSourceConfig

  await ensureFeishuBitableSync(db, {
    syncId: ensuredSyncId,
    actorUserId: input.actorUserId,
    name: toText(input.name),
    source: resolvedSource,
  })

  const scheduleNextRunAt = schedule.enabled
    ? computeNextScheduledRunAtOrNull(schedule, { from: new Date() })
    : null
  const syncItemId = randomUUID()
  const result = await db.query<FeishuBitableSyncItemRow>(
    `INSERT INTO feishu_bitable_sync_items (
      id,
      sync_id,
      name,
      entity_type,
      app_token,
      table_id,
      view_id,
      source_json,
      writeback_json,
      is_enabled,
      mapping_json,
      options_json,
      last_run_at,
      schedule_enabled,
      schedule_mode,
      schedule_interval_minutes,
      schedule_cron_expr,
      schedule_timezone,
      schedule_next_run_at,
      schedule_last_run_at,
      schedule_last_error,
      schedule_locked_at,
      schedule_lock_token,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9::JSONB, $10, $11::JSONB, $12::JSONB, NULL, $13, $14, $15, $16, $17, $18, NULL, '', NULL, NULL, $19, $19, NOW(), NOW()
    )
    RETURNING
      id,
      sync_id,
      name,
      entity_type,
      app_token,
      table_id,
      view_id,
      source_json,
      writeback_json,
      is_enabled,
      mapping_json,
      options_json,
      last_run_at::TEXT,
      schedule_enabled,
      schedule_mode,
      schedule_interval_minutes,
      schedule_cron_expr,
      schedule_timezone,
      schedule_next_run_at::TEXT,
      schedule_last_run_at::TEXT,
      schedule_last_error,
      NULL::TEXT AS latest_run_id,
      NULL::TEXT AS latest_run_status,
      NULL::TEXT AS latest_run_trigger_source,
      NULL::TEXT AS latest_run_started_at,
      NULL::TEXT AS latest_run_finished_at,
      NULL::INTEGER AS latest_run_error_count,
      NULL::TEXT AS latest_run_error_message,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      syncItemId,
      ensuredSyncId,
      toText(input.name),
      input.entityType,
      resolvedAppToken,
      toText(input.tableId),
      toText(input.viewId),
      JSON.stringify(parseJsonObject(resolvedSource)),
      JSON.stringify(parseJsonObject(input.writeback)),
      input.isEnabled !== false,
      JSON.stringify(parseJsonObject(input.mapping)),
      JSON.stringify(parseJsonObject(input.options)),
      schedule.enabled,
      schedule.mode,
      schedule.mode === 'interval' ? Math.max(1, Number(schedule.intervalMinutes || 0)) : null,
      schedule.mode === 'cron' ? schedule.cronExpr : null,
      schedule.timezone,
      scheduleNextRunAt,
      input.actorUserId,
    ],
  )
  return toSyncItem(result.rows[0]!)
}

export async function suggestNextFeishuBitableSyncItemName(
  db: Queryable,
  prefix = '默认任务',
): Promise<string> {
  const normalizedPrefix = toText(prefix) || '默认任务'
  const result = await db.query<{ name: string }>(
    `SELECT name
     FROM feishu_bitable_sync_items
     WHERE name LIKE $1`,
    [`${normalizedPrefix} %`],
  )

  let maxIndex = 0
  for (const row of result.rows) {
    const name = toText(row.name)
    const match = name.match(new RegExp(`^${normalizedPrefix}\\s+(\\d+)$`))
    if (!match)
      continue
    const index = Number(match[1] || 0)
    if (Number.isInteger(index) && index > maxIndex)
      maxIndex = index
  }

  return `${normalizedPrefix} ${maxIndex + 1}`
}

export async function patchFeishuBitableSyncItem(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId: string
    patch: {
      name?: string
      syncId?: string
      entityType?: FeishuBitableSyncItemEntityType
      appToken?: string
      tableId?: string
      viewId?: string
      source?: FeishuBitableSourceConfig
      writeback?: FeishuBitableWritebackConfig
      isEnabled?: boolean
      mapping?: Record<string, unknown>
      options?: Record<string, unknown>
      schedule?: Partial<FeishuTaskScheduleConfig>
    }
  },
): Promise<FeishuBitableSyncItem | null> {
  const existingTask = await getFeishuBitableSyncItemById(db, input.syncItemId)
  if (!existingTask)
    return null
  const nextSyncId = input.patch.syncId !== undefined ? toText(input.patch.syncId) : existingTask.syncId
  const parentSync = nextSyncId ? await getFeishuBitableSyncById(db, nextSyncId) : null
  if (nextSyncId && !parentSync)
    return null

  const values: unknown[] = [input.syncItemId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.name !== undefined)
    addSet('name', toText(input.patch.name))
  if (input.patch.syncId !== undefined)
    addSet('sync_id', toText(input.patch.syncId))
  if (input.patch.entityType !== undefined)
    addSet('entity_type', input.patch.entityType)
  if (input.patch.appToken !== undefined)
    addSet('app_token', toText(input.patch.appToken))
  else if (nextSyncId && parentSync && parentSync.source.appToken !== existingTask.appToken)
    addSet('app_token', toText(parentSync.source.appToken))
  if (input.patch.tableId !== undefined)
    addSet('table_id', toText(input.patch.tableId))
  if (input.patch.viewId !== undefined)
    addSet('view_id', toText(input.patch.viewId))
  if (input.patch.source !== undefined) {
    const resolvedSource = {
      ...parseJsonObject(input.patch.source),
      appToken: toText(input.patch.appToken) || toText(parentSync?.source.appToken) || existingTask.appToken,
      appName: input.patch.source.appName || parentSync?.source.appName || existingTask.source?.appName || '',
      sourceUrl: input.patch.source.sourceUrl || parentSync?.source.sourceUrl || existingTask.source?.sourceUrl || '',
      tableId: toText(input.patch.source.tableId) || toText(input.patch.tableId) || existingTask.tableId,
      viewId: toText(input.patch.source.viewId) || toText(input.patch.viewId) || existingTask.viewId || '',
    } satisfies FeishuBitableSourceConfig
    addSet('source_json', JSON.stringify(parseJsonObject(resolvedSource)))
  }
  if (input.patch.writeback !== undefined)
    addSet('writeback_json', JSON.stringify(parseJsonObject(input.patch.writeback)))
  if (input.patch.isEnabled !== undefined)
    addSet('is_enabled', Boolean(input.patch.isEnabled))
  if (input.patch.mapping !== undefined)
    addSet('mapping_json', JSON.stringify(parseJsonObject(input.patch.mapping)))
  if (input.patch.options !== undefined)
    addSet('options_json', JSON.stringify(parseJsonObject(input.patch.options)))

  const sourceChangedByPrimitive = input.patch.appToken !== undefined
    || input.patch.tableId !== undefined
    || input.patch.viewId !== undefined
  if (sourceChangedByPrimitive && input.patch.source === undefined) {
    const mergedSource = {
      ...(existingTask.source || {
        appToken: existingTask.appToken,
        tableId: existingTask.tableId,
        viewId: existingTask.viewId || '',
      }),
      appToken: input.patch.appToken !== undefined
        ? toText(input.patch.appToken)
        : (toText(parentSync?.source.appToken) || existingTask.source?.appToken || existingTask.appToken),
      tableId: input.patch.tableId !== undefined ? toText(input.patch.tableId) : (existingTask.source?.tableId || existingTask.tableId),
      viewId: input.patch.viewId !== undefined ? toText(input.patch.viewId) : (existingTask.source?.viewId || existingTask.viewId || ''),
      appName: parentSync?.source.appName || existingTask.source?.appName || '',
      sourceUrl: parentSync?.source.sourceUrl || existingTask.source?.sourceUrl || '',
    }
    addSet('source_json', JSON.stringify(parseJsonObject(mergedSource)))
  }

  if (input.patch.schedule !== undefined) {
    const mergedSchedule = mergeFeishuTaskSchedulePatch({
      current: existingTask.schedule,
      patch: input.patch.schedule,
    })
    const scheduleErrors = validateFeishuTaskScheduleConfig(mergedSchedule)
    if (scheduleErrors.length)
      throw new Error(`子表同步项调度配置非法：${scheduleErrors.join('；')}`)

    const nextRunAt = mergedSchedule.enabled
      ? computeNextScheduledRunAtOrNull(mergedSchedule, { from: new Date() })
      : null

    addSet('schedule_enabled', mergedSchedule.enabled)
    addSet('schedule_mode', mergedSchedule.mode)
    addSet('schedule_interval_minutes', mergedSchedule.mode === 'interval' ? mergedSchedule.intervalMinutes : null)
    addSet('schedule_cron_expr', mergedSchedule.mode === 'cron' ? mergedSchedule.cronExpr : null)
    addSet('schedule_timezone', mergedSchedule.timezone)
    addSet('schedule_next_run_at', nextRunAt)
    addSet('schedule_last_error', mergedSchedule.enabled ? existingTask.scheduleRuntime.lastError : '')
    addSet('schedule_locked_at', null)
    addSet('schedule_lock_token', null)
  }

  if (sets.length === 0)
    return existingTask

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE feishu_bitable_sync_items
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  return getFeishuBitableSyncItemById(db, input.syncItemId)
}

export async function createFeishuBitableSyncItemRun(
  db: Queryable,
  input: {
    syncItemId: string
    triggerSource: FeishuBitableSyncRunTriggerSource
    mode?: FeishuSyncRunMode
    deltaRecordCount?: number
    createdByUserId?: string | null
  },
): Promise<string> {
  const runId = randomUUID()
  await db.query(
    `INSERT INTO feishu_bitable_sync_item_runs (
      id,
      sync_item_id,
      status,
      trigger_source,
      mode,
      delta_record_count,
      started_at,
      finished_at,
      fetched_count,
      created_count,
      updated_count,
      skipped_count,
      error_count,
      error_message,
      created_by_user_id,
      created_at
    ) VALUES (
      $1, $2, 'running', $3, $4, $5, NOW(), NULL, 0, 0, 0, 0, 0, '', $6, NOW()
    )`,
    [
      runId,
      input.syncItemId,
      input.triggerSource,
      input.mode || 'full',
      Math.max(0, Number(input.deltaRecordCount || 0)),
      input.createdByUserId || null,
    ],
  )
  return runId
}

export async function completeFeishuBitableSyncItemRun(
  db: Queryable,
  input: {
    runId: string
    syncItemId: string
    status: FeishuBitableSyncRunStatus
    fetchedCount?: number
    createdCount?: number
    updatedCount?: number
    skippedCount?: number
    errorCount?: number
    errorMessage?: string
  },
): Promise<void> {
  await db.query(
    `UPDATE feishu_bitable_sync_item_runs
     SET
       status = $3,
       finished_at = NOW(),
       fetched_count = $4,
       created_count = $5,
       updated_count = $6,
       skipped_count = $7,
       error_count = $8,
       error_message = $9
     WHERE id = $1
       AND sync_item_id = $2`,
    [
      input.runId,
      input.syncItemId,
      input.status,
      Math.max(0, Number(input.fetchedCount || 0)),
      Math.max(0, Number(input.createdCount || 0)),
      Math.max(0, Number(input.updatedCount || 0)),
      Math.max(0, Number(input.skippedCount || 0)),
      Math.max(0, Number(input.errorCount || 0)),
      String(input.errorMessage || '').slice(0, 1000),
    ],
  )

  await db.query(
    `UPDATE feishu_bitable_sync_items
     SET last_run_at = NOW(),
         schedule_last_run_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.syncItemId],
  )
}

export async function listFeishuBitableSyncItemRuns(
  db: Queryable,
  input: {
    syncItemId?: string
    limit?: number
  } = {},
): Promise<FeishuBitableSyncItemRun[]> {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)))
  const result = await db.query<FeishuBitableSyncItemRunRow>(
    `SELECT
      r.id,
      r.sync_item_id,
      t.name AS task_name,
      r.status,
      r.trigger_source,
      r.mode,
      r.delta_record_count,
      r.started_at::TEXT,
      r.finished_at::TEXT,
      r.fetched_count,
      r.created_count,
      r.updated_count,
      r.skipped_count,
      r.error_count,
      r.error_message,
      r.created_by_user_id,
      r.created_at::TEXT
     FROM feishu_bitable_sync_item_runs r
     JOIN feishu_bitable_sync_items t ON t.id = r.sync_item_id
     WHERE ($1::TEXT IS NULL OR r.sync_item_id = $1)
     ORDER BY r.started_at DESC
     LIMIT $2`,
    [input.syncItemId || null, limit],
  )
  return result.rows.map(toRun)
}

export async function getFeishuBitableSyncItemDetail(
  db: Queryable,
  input: {
    syncId: string
    syncItemId: string
    runLimit?: number
    issueLimit?: number
  },
): Promise<FeishuBitableSyncItemDetail | null> {
  const item = await getFeishuBitableSyncItemById(db, input.syncItemId)
  if (!item || item.syncId !== input.syncId)
    return null

  const runLimit = Math.max(1, Math.min(100, Number(input.runLimit || 20)))
  const issueLimit = Math.max(1, Math.min(200, Number(input.issueLimit || 50)))

  const [recentRuns, issues, issueStatsResult] = await Promise.all([
    listFeishuBitableSyncItemRuns(db, {
      syncItemId: input.syncItemId,
      limit: runLimit,
    }),
    listFeishuSyncIssues(db, {
      syncItemId: input.syncItemId,
      limit: issueLimit,
    }),
    db.query<FeishuSyncIssueStatsRow>(
      `SELECT status, COUNT(*)::INTEGER AS issue_count
       FROM feishu_sync_issues
       WHERE sync_item_id = $1
       GROUP BY status`,
      [input.syncItemId],
    ),
  ])

  return {
    ...item,
    recentRuns,
    issues,
    issueStats: toTaskIssueStats(issueStatsResult.rows),
  }
}

export async function getFeishuBitableSyncDetail(
  db: Queryable,
  input: {
    syncId: string
    includeInactive?: boolean
  },
): Promise<FeishuBitableSyncDetail | null> {
  const sync = await getFeishuBitableSyncById(db, input.syncId)
  if (!sync)
    return null

  const items = await listFeishuBitableSyncItems(db, {
    syncId: input.syncId,
    includeInactive: input.includeInactive,
  })

  return {
    ...sync,
    items,
  }
}

export async function claimNextDueFeishuBitableSyncItem(
  db: Queryable,
  input: {
    now?: Date
    lockTtlMs?: number
  } = {},
): Promise<ClaimedFeishuBitableSyncItem | null> {
  const now = input.now || new Date()
  const staleAt = new Date(now.getTime() - Math.max(60_000, Number(input.lockTtlMs || 10 * 60 * 1000)))
  const lockToken = randomUUID()
  const claimed = await db.query<{ id: string }>(
    `WITH candidate AS (
      SELECT id
      FROM feishu_bitable_sync_items
      WHERE is_enabled = TRUE
        AND schedule_enabled = TRUE
        AND schedule_next_run_at IS NOT NULL
        AND schedule_next_run_at <= $1::TIMESTAMPTZ
        AND (
          schedule_lock_token IS NULL
          OR schedule_locked_at IS NULL
          OR schedule_locked_at < $2::TIMESTAMPTZ
        )
      ORDER BY schedule_next_run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE feishu_bitable_sync_items t
    SET
      schedule_lock_token = $3,
      schedule_locked_at = NOW(),
      updated_at = NOW()
    FROM candidate
    WHERE t.id = candidate.id
    RETURNING t.id`,
    [now.toISOString(), staleAt.toISOString(), lockToken],
  )

  const syncItemId = claimed.rows[0]?.id
  if (!syncItemId)
    return null

  const item = await getFeishuBitableSyncItemById(db, syncItemId)
  if (!item)
    return null

  return {
    item,
    lockToken,
  }
}

async function completeScheduledFeishuSyncItemExecutionInternal(
  db: Queryable,
  input: {
    syncItemId: string
    lockToken: string
    nextRunAt: string | null
    lastError: string
    lastRunAt?: string
  },
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `UPDATE feishu_bitable_sync_items
     SET
       schedule_next_run_at = $3,
       schedule_last_run_at = $4::TIMESTAMPTZ,
       schedule_last_error = $5,
       schedule_locked_at = NULL,
       schedule_lock_token = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND schedule_lock_token = $2
    RETURNING id`,
    [
      input.syncItemId,
      input.lockToken,
      input.nextRunAt,
      input.lastRunAt || new Date().toISOString(),
      String(input.lastError || '').slice(0, 1000),
    ],
  )
  return Boolean(result.rows[0]?.id)
}

export async function completeScheduledFeishuSyncItemExecution(
  db: Queryable,
  input: {
    syncItemId: string
    lockToken: string
    nextRunAt: string | null
    lastError: string
    lastRunAt?: string
  },
): Promise<boolean> {
  return completeScheduledFeishuSyncItemExecutionInternal(db, {
    syncItemId: input.syncItemId,
    lockToken: input.lockToken,
    nextRunAt: input.nextRunAt,
    lastError: input.lastError,
    lastRunAt: input.lastRunAt,
  })
}

async function releaseFeishuSyncItemScheduleLockInternal(
  db: Queryable,
  input: {
    syncItemId: string
    lockToken: string
  },
): Promise<void> {
  await db.query(
    `UPDATE feishu_bitable_sync_items
     SET schedule_locked_at = NULL,
         schedule_lock_token = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND schedule_lock_token = $2`,
    [input.syncItemId, input.lockToken],
  )
}

export async function releaseFeishuSyncItemScheduleLock(
  db: Queryable,
  input: {
    syncItemId: string
    lockToken: string
  },
): Promise<void> {
  await releaseFeishuSyncItemScheduleLockInternal(db, {
    syncItemId: input.syncItemId,
    lockToken: input.lockToken,
  })
}

export async function getFeishuExternalRef(
  db: Queryable,
  input: {
    scope: FeishuBitableSyncItemEntityType
    externalId: string
  },
): Promise<{ id: string, entityId: string, metadata: Record<string, unknown> } | null> {
  const result = await db.query<{
    id: string
    entity_id: string
    metadata: Record<string, unknown>
  }>(
    `SELECT id, entity_id, metadata
     FROM feishu_external_refs
     WHERE provider = 'feishu_bitable'
       AND scope = $1
       AND external_id = $2
     LIMIT 1`,
    [input.scope, input.externalId],
  )

  const row = result.rows[0]
  if (!row)
    return null

  return {
    id: row.id,
    entityId: row.entity_id,
    metadata: parseJsonObject(row.metadata),
  }
}

export async function upsertFeishuExternalRef(
  db: Queryable,
  input: {
    syncItemId: string
    scope: FeishuBitableSyncItemEntityType
    externalId: string
    entityId: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO feishu_external_refs (
      id,
      provider,
      scope,
      external_id,
      sync_item_id,
      entity_id,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, 'feishu_bitable', $2, $3, $4, $5, $6::JSONB, NOW(), NOW()
    )
    ON CONFLICT (provider, scope, external_id)
    DO UPDATE SET
      sync_item_id = EXCLUDED.sync_item_id,
      entity_id = EXCLUDED.entity_id,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      input.scope,
      input.externalId,
      input.syncItemId,
      input.entityId,
      JSON.stringify(parseJsonObject(input.metadata)),
    ],
  )
}

export function buildDefaultReconcileResult(input: {
  groupIds: string[]
}): FeishuAdminGroupReconcileResult {
  return {
    synchronizedAt: new Date().toISOString(),
    groupIds: [...input.groupIds],
    totalGroupMembers: 0,
    createdUsers: 0,
    grantedContestAdmin: 0,
    revokedContestAdmin: 0,
    skippedMembers: 0,
  }
}

export async function upsertFeishuSyncIssue(
  db: Queryable,
  input: {
    syncItemId: string
    entityType: FeishuBitableSyncItemEntityType
    recordId: string
    externalId: string
    reasonCode: string
    message: string
    payload?: Record<string, unknown>
  },
): Promise<FeishuSyncIssue> {
  const issueId = randomUUID()
  const result = await db.query<FeishuSyncIssueRow>(
    `INSERT INTO feishu_sync_issues (
      id,
      sync_item_id,
      entity_type,
      record_id,
      external_id,
      status,
      reason_code,
      message,
      payload,
      resolution,
      resolution_payload,
      resolved_by_user_id,
      resolved_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'open', $6, $7, $8::JSONB, '', '{}'::JSONB, NULL, NULL, NOW(), NOW()
    )
    ON CONFLICT (sync_item_id, record_id, external_id)
    DO UPDATE SET
      entity_type = EXCLUDED.entity_type,
      status = 'open',
      reason_code = EXCLUDED.reason_code,
      message = EXCLUDED.message,
      payload = EXCLUDED.payload,
      resolution = '',
      resolution_payload = '{}'::JSONB,
      resolved_by_user_id = NULL,
      resolved_at = NULL,
      updated_at = NOW()
    RETURNING
      id,
      sync_item_id,
      entity_type,
      record_id,
      external_id,
      status,
      reason_code,
      message,
      payload,
      resolution,
      resolution_payload,
      resolved_by_user_id,
      resolved_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      issueId,
      input.syncItemId,
      input.entityType,
      input.recordId,
      input.externalId,
      toText(input.reasonCode),
      toText(input.message),
      JSON.stringify(parseJsonObject(input.payload)),
    ],
  )

  return toIssue(result.rows[0]!)
}

export async function listFeishuSyncIssues(
  db: Queryable,
  input: {
    syncItemId?: string
    status?: FeishuSyncIssueStatus
    limit?: number
  } = {},
): Promise<FeishuSyncIssue[]> {
  const where: string[] = []
  const values: unknown[] = []
  const syncItemId = toText(input.syncItemId)
  if (syncItemId) {
    values.push(syncItemId)
    where.push(`sync_item_id = $${values.length}`)
  }
  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }
  const limit = Math.max(1, Math.min(500, Number(input.limit || 100)))
  values.push(limit)

  const result = await db.query<FeishuSyncIssueRow>(
    `SELECT
      id,
      sync_item_id,
      entity_type,
      record_id,
      external_id,
      status,
      reason_code,
      message,
      payload,
      resolution,
      resolution_payload,
      resolved_by_user_id,
      resolved_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM feishu_sync_issues
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY updated_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(toIssue)
}

export async function resolveFeishuSyncIssue(
  db: Queryable,
  input: {
    actorUserId: string
    issueId: string
    resolution: FeishuSyncIssueResolution
    resolutionPayload?: Record<string, unknown>
  },
): Promise<FeishuSyncIssue | null> {
  const result = await db.query<FeishuSyncIssueRow>(
    `UPDATE feishu_sync_issues
     SET
       status = CASE WHEN $3 = 'ignored' THEN 'ignored' ELSE 'resolved' END,
       resolution = $3,
       resolution_payload = $4::JSONB,
       resolved_by_user_id = $1,
       resolved_at = NOW(),
       updated_at = NOW()
     WHERE id = $2
     RETURNING
       id,
       sync_item_id,
       entity_type,
       record_id,
       external_id,
       status,
       reason_code,
       message,
       payload,
       resolution,
       resolution_payload,
       resolved_by_user_id,
       resolved_at::TEXT,
       created_at::TEXT,
       updated_at::TEXT`,
    [
      input.actorUserId,
      input.issueId,
      input.resolution,
      JSON.stringify(parseJsonObject(input.resolutionPayload)),
    ],
  )

  const row = result.rows[0]
  return row ? toIssue(row) : null
}

export async function listActiveFeishuBitableSyncItemsBySource(
  db: Queryable,
  input: {
    appToken: string
    tableId: string
    viewId?: string
  },
): Promise<FeishuBitableSyncItem[]> {
  const appToken = toText(input.appToken)
  const tableId = toText(input.tableId)
  const viewId = toText(input.viewId)
  if (!appToken || !tableId)
    return []

  const result = await db.query<FeishuBitableSyncItemRow>(
    `SELECT
      t.id,
      t.sync_id,
      t.name,
      t.entity_type,
      t.app_token,
      t.table_id,
      t.view_id,
      t.source_json,
      t.writeback_json,
      t.is_enabled,
      t.mapping_json,
      t.options_json,
      t.last_run_at::TEXT,
      t.schedule_enabled,
      t.schedule_mode,
      t.schedule_interval_minutes,
      t.schedule_cron_expr,
      t.schedule_timezone,
      t.schedule_next_run_at::TEXT,
      t.schedule_last_run_at::TEXT,
      t.schedule_last_error,
      NULL::TEXT AS latest_run_id,
      NULL::TEXT AS latest_run_status,
      NULL::TEXT AS latest_run_trigger_source,
      NULL::TEXT AS latest_run_started_at,
      NULL::TEXT AS latest_run_finished_at,
      NULL::INTEGER AS latest_run_error_count,
      NULL::TEXT AS latest_run_error_message,
      t.created_by_user_id,
      t.updated_by_user_id,
      t.created_at::TEXT,
      t.updated_at::TEXT
     FROM feishu_bitable_sync_items t
     WHERE t.is_enabled = TRUE
       AND t.app_token = $1
       AND t.table_id = $2
       AND ($3::TEXT = '' OR t.view_id = '' OR t.view_id = $3)
     ORDER BY t.updated_at DESC`,
    [appToken, tableId, viewId],
  )

  return result.rows.map(toSyncItem)
}

export async function registerFeishuBitableEventDedup(
  db: Queryable,
  input: {
    eventId: string
    eventType?: string
    appToken?: string
    tableId?: string
    recordIds?: string[]
    payload?: Record<string, unknown>
  },
): Promise<boolean> {
  const eventId = toText(input.eventId)
  if (!eventId)
    return false

  const result = await db.query<{ id: string }>(
    `INSERT INTO feishu_bitable_event_dedup (
      id,
      event_id,
      event_type,
      app_token,
      table_id,
      record_ids,
      payload,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::TEXT[], $7::JSONB, NOW()
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id`,
    [
      randomUUID(),
      eventId,
      toText(input.eventType),
      toText(input.appToken),
      toText(input.tableId),
      toStringArray(input.recordIds || []),
      JSON.stringify(parseJsonObject(input.payload)),
    ],
  )
  return Boolean(result.rows[0]?.id)
}

export async function enqueueFeishuPostSyncTask(
  db: Queryable,
  input: {
    syncItemId?: string | null
    runId?: string | null
    scope: FeishuBitableSyncItemEntityType
    entityId: string
    externalId?: string
    taskType: FeishuPostSyncTaskType
    payload?: Record<string, unknown>
    sourceHash?: string
    maxAttempt?: number
    nextRunAt?: string
  },
): Promise<FeishuPostSyncTask> {
  const sourceHash = toText(input.sourceHash)
    || toText(parseJsonObject(input.payload).sourceHash)
    || randomUUID()
  const result = await db.query<FeishuPostSyncTaskRow>(
    `INSERT INTO feishu_post_sync_tasks (
      id,
      sync_item_id,
      run_id,
      scope,
      entity_id,
      external_id,
      task_type,
      status,
      attempt,
      max_attempt,
      source_hash,
      next_run_at,
      error_message,
      payload,
      started_at,
      finished_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 'queued', 0, $8, $9, $10::TIMESTAMPTZ, '', $11::JSONB, NULL, NULL, NOW(), NOW()
    )
    ON CONFLICT (task_type, scope, entity_id, source_hash)
    DO UPDATE SET
      status = 'queued',
      next_run_at = EXCLUDED.next_run_at,
      error_message = '',
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING
      id,
      sync_item_id,
      run_id,
      scope,
      entity_id,
      external_id,
      task_type,
      status,
      attempt,
      max_attempt,
      source_hash,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      toText(input.syncItemId) || null,
      toText(input.runId) || null,
      input.scope,
      toText(input.entityId),
      toText(input.externalId),
      input.taskType,
      Math.max(1, Number(input.maxAttempt || 6)),
      sourceHash,
      toText(input.nextRunAt) || new Date().toISOString(),
      JSON.stringify(parseJsonObject(input.payload)),
    ],
  )
  return toPostSyncTask(result.rows[0]!)
}

export async function listFeishuPostSyncTasks(
  db: Queryable,
  input: {
    status?: FeishuPostSyncTaskStatus
    limit?: number
  } = {},
): Promise<FeishuPostSyncTask[]> {
  const limit = Math.max(1, Math.min(500, Number(input.limit || 100)))
  const result = await db.query<FeishuPostSyncTaskRow>(
    `SELECT
      id,
      sync_item_id,
      run_id,
      scope,
      entity_id,
      external_id,
      task_type,
      status,
      attempt,
      max_attempt,
      source_hash,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM feishu_post_sync_tasks
     WHERE ($1::TEXT = '' OR status = $1)
     ORDER BY created_at DESC
     LIMIT $2`,
    [toText(input.status), limit],
  )
  return result.rows.map(toPostSyncTask)
}

export async function claimNextQueuedFeishuPostSyncTask(
  db: Queryable,
): Promise<FeishuPostSyncTask | null> {
  const result = await db.query<FeishuPostSyncTaskRow>(
    `WITH picked AS (
      SELECT id
      FROM feishu_post_sync_tasks
      WHERE status = 'queued'
        AND next_run_at <= NOW()
      ORDER BY next_run_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE feishu_post_sync_tasks t
    SET status = 'processing',
        attempt = t.attempt + 1,
        started_at = NOW(),
        finished_at = NULL,
        updated_at = NOW()
    FROM picked
    WHERE t.id = picked.id
    RETURNING
      t.id,
      t.sync_item_id,
      t.run_id,
      t.scope,
      t.entity_id,
      t.external_id,
      t.task_type,
      t.status,
      t.attempt,
      t.max_attempt,
      t.source_hash,
      t.next_run_at::TEXT,
      t.error_message,
      t.payload,
      t.started_at::TEXT,
      t.finished_at::TEXT,
      t.created_at::TEXT,
      t.updated_at::TEXT`,
  )
  const row = result.rows[0]
  return row ? toPostSyncTask(row) : null
}

export async function completeFeishuPostSyncTask(
  db: Queryable,
  input: {
    taskId: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `UPDATE feishu_post_sync_tasks
     SET status = 'succeeded',
         error_message = '',
         payload = CASE WHEN $2::JSONB IS NULL THEN payload ELSE $2::JSONB END,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId, input.payload ? JSON.stringify(parseJsonObject(input.payload)) : null],
  )
}

export async function failFeishuPostSyncTask(
  db: Queryable,
  input: {
    taskId: string
    errorMessage: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  const current = await db.query<{ attempt: number | string, max_attempt: number | string }>(
    `SELECT attempt, max_attempt
     FROM feishu_post_sync_tasks
     WHERE id = $1
     LIMIT 1`,
    [input.taskId],
  )
  const row = current.rows[0]
  if (!row)
    return

  const attempt = Math.max(0, Number(row.attempt || 0))
  const maxAttempt = Math.max(1, Number(row.max_attempt || 1))
  const dead = attempt >= maxAttempt
  const backoffMs = Math.min(60 * 60 * 1000, Math.max(10_000, 15_000 * (2 ** Math.max(0, attempt - 1))))
  const nextRunAt = new Date(Date.now() + backoffMs).toISOString()

  await db.query(
    `UPDATE feishu_post_sync_tasks
     SET status = $2,
         error_message = $3,
         payload = CASE WHEN $4::JSONB IS NULL THEN payload ELSE $4::JSONB END,
         next_run_at = CASE WHEN $2 = 'dead_letter' THEN next_run_at ELSE $5::TIMESTAMPTZ END,
         finished_at = CASE WHEN $2 = 'dead_letter' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      input.taskId,
      dead ? 'dead_letter' : 'queued',
      toText(input.errorMessage).slice(0, 1000),
      input.payload ? JSON.stringify(parseJsonObject(input.payload)) : null,
      nextRunAt,
    ],
  )
}

export async function retryFeishuPostSyncTask(
  db: Queryable,
  input: {
    taskId: string
  },
): Promise<FeishuPostSyncTask | null> {
  const result = await db.query<FeishuPostSyncTaskRow>(
    `UPDATE feishu_post_sync_tasks
     SET status = 'queued',
         error_message = '',
         next_run_at = NOW(),
         finished_at = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING
      id,
      sync_item_id,
      run_id,
      scope,
      entity_id,
      external_id,
      task_type,
      status,
      attempt,
      max_attempt,
      source_hash,
      next_run_at::TEXT,
      error_message,
      payload,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [input.taskId],
  )
  const row = result.rows[0]
  return row ? toPostSyncTask(row) : null
}

export async function upsertFeishuVectorChunk(
  db: Queryable,
  input: {
    scope: FeishuBitableSyncItemEntityType
    entityId: string
    chunkIndex: number
    content: string
    embedding: number[]
    sourceHash: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const mode = await resolveFeishuVectorMode(db)
  const id = randomUUID()
  const embedding = normalizeNumberArray(input.embedding)
  const sourceHash = toText(input.sourceHash) || randomUUID()
  if (mode === 'vector') {
    const vectorText = `[${embedding.join(',')}]`
    await db.query(
      `INSERT INTO feishu_vectors (
        id,
        scope,
        entity_id,
        chunk_index,
        content,
        embedding,
        source_hash,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::vector, $7, $8::JSONB, NOW(), NOW()
      )
      ON CONFLICT (scope, entity_id, chunk_index, source_hash)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()`,
      [
        id,
        input.scope,
        toText(input.entityId),
        Math.max(0, Number(input.chunkIndex || 0)),
        toText(input.content),
        vectorText,
        sourceHash,
        JSON.stringify(parseJsonObject(input.metadata)),
      ],
    )
    return
  }

  await db.query(
    `INSERT INTO feishu_vectors (
      id,
      scope,
      entity_id,
      chunk_index,
      content,
      embedding_json,
      source_hash,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7, $8::JSONB, NOW(), NOW()
    )
    ON CONFLICT (scope, entity_id, chunk_index, source_hash)
    DO UPDATE SET
      content = EXCLUDED.content,
      embedding_json = EXCLUDED.embedding_json,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      id,
      input.scope,
      toText(input.entityId),
      Math.max(0, Number(input.chunkIndex || 0)),
      toText(input.content),
      JSON.stringify(embedding),
      sourceHash,
      JSON.stringify(parseJsonObject(input.metadata)),
    ],
  )
}

export async function upsertFeishuSearchIndexDoc(
  db: Queryable,
  input: {
    scope: FeishuBitableSyncItemEntityType
    entityId: string
    externalId?: string
    syncItemId?: string | null
    runId?: string | null
    sourceHash: string
    title?: string
    summary?: string
    body?: string
    keywords?: string[]
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO feishu_search_index (
      id,
      scope,
      entity_id,
      external_id,
      sync_item_id,
      run_id,
      source_hash,
      title,
      summary,
      body,
      keywords,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::TEXT[], $12::JSONB, NOW(), NOW()
    )
    ON CONFLICT (scope, entity_id, source_hash)
    DO UPDATE SET
      external_id = EXCLUDED.external_id,
      sync_item_id = EXCLUDED.sync_item_id,
      run_id = EXCLUDED.run_id,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      body = EXCLUDED.body,
      keywords = EXCLUDED.keywords,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      randomUUID(),
      input.scope,
      toText(input.entityId),
      toText(input.externalId),
      toText(input.syncItemId) || null,
      toText(input.runId) || null,
      toText(input.sourceHash) || randomUUID(),
      toText(input.title),
      toText(input.summary),
      toText(input.body),
      toStringArray(input.keywords || []),
      JSON.stringify(parseJsonObject(input.metadata)),
    ],
  )
}

export async function upsertFeishuEntityAnalysis(
  db: Queryable,
  input: {
    scope: FeishuBitableSyncItemEntityType
    entityId: string
    externalId?: string
    syncItemId?: string | null
    runId?: string | null
    sourceHash: string
    provider?: string
    model?: string
    analysis: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO feishu_entity_analysis (
      id,
      scope,
      entity_id,
      external_id,
      sync_item_id,
      run_id,
      source_hash,
      provider,
      model,
      analysis_json,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, NOW(), NOW()
    )
    ON CONFLICT (scope, entity_id, source_hash)
    DO UPDATE SET
      external_id = EXCLUDED.external_id,
      sync_item_id = EXCLUDED.sync_item_id,
      run_id = EXCLUDED.run_id,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      analysis_json = EXCLUDED.analysis_json,
      updated_at = NOW()`,
    [
      randomUUID(),
      input.scope,
      toText(input.entityId),
      toText(input.externalId),
      toText(input.syncItemId) || null,
      toText(input.runId) || null,
      toText(input.sourceHash) || randomUUID(),
      toText(input.provider),
      toText(input.model),
      JSON.stringify(parseJsonObject(input.analysis)),
    ],
  )
}
