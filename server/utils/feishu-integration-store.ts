import type { Queryable } from '~~/server/utils/db'
import type {
  FeishuAdminGroupReconcileResult,
  FeishuBitableSyncRun,
  FeishuBitableSyncRunStatus,
  FeishuBitableSyncRunTriggerSource,
  FeishuBitableTask,
  FeishuBitableTaskTargetType,
  FeishuConfigValidationResult,
  FeishuIntegrationConfig,
  FeishuMappingConfigV2,
  FeishuSyncIssue,
  FeishuSyncIssueResolution,
  FeishuSyncIssueStatus,
  PlatformRole,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

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

interface FeishuBitableTaskRow {
  id: string
  name: string
  target_type: FeishuBitableTaskTargetType
  app_token: string
  table_id: string
  view_id: string
  is_active: boolean
  mapping_json: Record<string, unknown>
  options_json: Record<string, unknown>
  last_run_at: string | null
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface FeishuBitableSyncRunRow {
  id: string
  task_id: string
  task_name: string
  status: FeishuBitableSyncRunStatus
  trigger_source: FeishuBitableSyncRunTriggerSource
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

interface FeishuSyncIssueRow {
  id: string
  task_id: string
  target_type: FeishuBitableTaskTargetType
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

export interface FeishuIntegrationConfigInternal {
  enabled: boolean
  appId: string
  appSecret: string
  oauthRedirectUri: string
  eventToken: string
  eventEncryptKey: string
  adminGroupIds: string[]
  webSdkScriptUrl: string
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

function normalizeFeishuConfigInternal(raw: unknown): FeishuIntegrationConfigInternal {
  const source = parseJsonObject(raw)
  return {
    enabled: hasOwn(source, 'enabled') ? toBoolean(source.enabled, false) : false,
    appId: hasOwn(source, 'appId') ? toText(source.appId) : '',
    appSecret: hasOwn(source, 'appSecret') ? String(source.appSecret || '') : '',
    oauthRedirectUri: hasOwn(source, 'oauthRedirectUri') ? toText(source.oauthRedirectUri) : '',
    eventToken: hasOwn(source, 'eventToken') ? String(source.eventToken || '') : '',
    eventEncryptKey: hasOwn(source, 'eventEncryptKey') ? String(source.eventEncryptKey || '') : '',
    adminGroupIds: hasOwn(source, 'adminGroupIds') ? toStringArray(source.adminGroupIds) : [],
    webSdkScriptUrl: hasOwn(source, 'webSdkScriptUrl') ? toText(source.webSdkScriptUrl) : DEFAULT_WEBSDK_SCRIPT_URL,
    updatedAt: hasOwn(source, 'updatedAt') ? toText(source.updatedAt) : '',
    updatedByUserId: hasOwn(source, 'updatedByUserId') ? toText(source.updatedByUserId) : '',
  }
}

function toTask(row: FeishuBitableTaskRow): FeishuBitableTask {
  return {
    id: row.id,
    name: row.name,
    targetType: row.target_type,
    appToken: row.app_token,
    tableId: row.table_id,
    viewId: row.view_id || '',
    isActive: Boolean(row.is_active),
    mapping: parseJsonObject(row.mapping_json),
    options: parseJsonObject(row.options_json),
    lastRunAt: row.last_run_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRun(row: FeishuBitableSyncRunRow): FeishuBitableSyncRun {
  return {
    id: row.id,
    taskId: row.task_id,
    taskName: row.task_name,
    status: row.status,
    triggerSource: row.trigger_source,
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

function toIssue(row: FeishuSyncIssueRow): FeishuSyncIssue {
  return {
    id: row.id,
    taskId: row.task_id,
    targetType: row.target_type,
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
  await db.query(
    `INSERT INTO migrations_meta (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [FEISHU_CONFIG_META_KEY, JSON.stringify(normalized)],
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

export async function listFeishuBitableTasks(
  db: Queryable,
  input: { includeInactive?: boolean } = {},
): Promise<FeishuBitableTask[]> {
  const includeInactive = input.includeInactive === true
  const result = await db.query<FeishuBitableTaskRow>(
    `SELECT
      id,
      name,
      target_type,
      app_token,
      table_id,
      view_id,
      is_active,
      mapping_json,
      options_json,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM feishu_bitable_tasks
     WHERE ($1::BOOLEAN = TRUE OR is_active = TRUE)
     ORDER BY updated_at DESC`,
    [includeInactive],
  )
  return result.rows.map(toTask)
}

export async function getFeishuBitableTaskById(
  db: Queryable,
  taskId: string,
): Promise<FeishuBitableTask | null> {
  const result = await db.query<FeishuBitableTaskRow>(
    `SELECT
      id,
      name,
      target_type,
      app_token,
      table_id,
      view_id,
      is_active,
      mapping_json,
      options_json,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM feishu_bitable_tasks
     WHERE id = $1
     LIMIT 1`,
    [taskId],
  )
  const row = result.rows[0]
  return row ? toTask(row) : null
}

export async function createFeishuBitableTask(
  db: Queryable,
  input: {
    actorUserId: string
    name: string
    targetType: FeishuBitableTaskTargetType
    appToken: string
    tableId: string
    viewId?: string
    isActive?: boolean
    mapping?: Record<string, unknown>
    options?: Record<string, unknown>
  },
): Promise<FeishuBitableTask> {
  const taskId = randomUUID()
  const result = await db.query<FeishuBitableTaskRow>(
    `INSERT INTO feishu_bitable_tasks (
      id,
      name,
      target_type,
      app_token,
      table_id,
      view_id,
      is_active,
      mapping_json,
      options_json,
      last_run_at,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9::JSONB, NULL, $10, $10, NOW(), NOW()
    )
    RETURNING
      id,
      name,
      target_type,
      app_token,
      table_id,
      view_id,
      is_active,
      mapping_json,
      options_json,
      last_run_at::TEXT,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      taskId,
      toText(input.name),
      input.targetType,
      toText(input.appToken),
      toText(input.tableId),
      toText(input.viewId),
      input.isActive !== false,
      JSON.stringify(parseJsonObject(input.mapping)),
      JSON.stringify(parseJsonObject(input.options)),
      input.actorUserId,
    ],
  )
  return toTask(result.rows[0]!)
}

export async function patchFeishuBitableTask(
  db: Queryable,
  input: {
    actorUserId: string
    taskId: string
    patch: {
      name?: string
      targetType?: FeishuBitableTaskTargetType
      appToken?: string
      tableId?: string
      viewId?: string
      isActive?: boolean
      mapping?: Record<string, unknown>
      options?: Record<string, unknown>
    }
  },
): Promise<FeishuBitableTask | null> {
  const values: unknown[] = [input.taskId]
  const sets: string[] = []

  const addSet = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.patch.name !== undefined)
    addSet('name', toText(input.patch.name))
  if (input.patch.targetType !== undefined)
    addSet('target_type', input.patch.targetType)
  if (input.patch.appToken !== undefined)
    addSet('app_token', toText(input.patch.appToken))
  if (input.patch.tableId !== undefined)
    addSet('table_id', toText(input.patch.tableId))
  if (input.patch.viewId !== undefined)
    addSet('view_id', toText(input.patch.viewId))
  if (input.patch.isActive !== undefined)
    addSet('is_active', Boolean(input.patch.isActive))
  if (input.patch.mapping !== undefined)
    addSet('mapping_json', JSON.stringify(parseJsonObject(input.patch.mapping)))
  if (input.patch.options !== undefined)
    addSet('options_json', JSON.stringify(parseJsonObject(input.patch.options)))

  if (sets.length === 0)
    return getFeishuBitableTaskById(db, input.taskId)

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE feishu_bitable_tasks
     SET ${sets.join(', ')}
     WHERE id = $1`,
    values,
  )

  return getFeishuBitableTaskById(db, input.taskId)
}

export async function createFeishuBitableSyncRun(
  db: Queryable,
  input: {
    taskId: string
    triggerSource: FeishuBitableSyncRunTriggerSource
    createdByUserId?: string | null
  },
): Promise<string> {
  const runId = randomUUID()
  await db.query(
    `INSERT INTO feishu_bitable_sync_runs (
      id,
      task_id,
      status,
      trigger_source,
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
      $1, $2, 'running', $3, NOW(), NULL, 0, 0, 0, 0, 0, '', $4, NOW()
    )`,
    [runId, input.taskId, input.triggerSource, input.createdByUserId || null],
  )
  return runId
}

export async function completeFeishuBitableSyncRun(
  db: Queryable,
  input: {
    runId: string
    taskId: string
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
    `UPDATE feishu_bitable_sync_runs
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
       AND task_id = $2`,
    [
      input.runId,
      input.taskId,
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
    `UPDATE feishu_bitable_tasks
     SET last_run_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.taskId],
  )
}

export async function listFeishuBitableSyncRuns(
  db: Queryable,
  input: {
    taskId?: string
    limit?: number
  } = {},
): Promise<FeishuBitableSyncRun[]> {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 50)))
  const result = await db.query<FeishuBitableSyncRunRow>(
    `SELECT
      r.id,
      r.task_id,
      t.name AS task_name,
      r.status,
      r.trigger_source,
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
     FROM feishu_bitable_sync_runs r
     JOIN feishu_bitable_tasks t ON t.id = r.task_id
     WHERE ($1::TEXT IS NULL OR r.task_id = $1)
     ORDER BY r.started_at DESC
     LIMIT $2`,
    [input.taskId || null, limit],
  )
  return result.rows.map(toRun)
}

export async function getFeishuExternalRef(
  db: Queryable,
  input: {
    scope: FeishuBitableTaskTargetType
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
    taskId: string
    scope: FeishuBitableTaskTargetType
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
      task_id,
      entity_id,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      $1, 'feishu_bitable', $2, $3, $4, $5, $6::JSONB, NOW(), NOW()
    )
    ON CONFLICT (provider, scope, external_id)
    DO UPDATE SET
      task_id = EXCLUDED.task_id,
      entity_id = EXCLUDED.entity_id,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      input.scope,
      input.externalId,
      input.taskId,
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
    taskId: string
    targetType: FeishuBitableTaskTargetType
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
      task_id,
      target_type,
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
    ON CONFLICT (task_id, record_id, external_id)
    DO UPDATE SET
      target_type = EXCLUDED.target_type,
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
      task_id,
      target_type,
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
      input.taskId,
      input.targetType,
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
    taskId?: string
    status?: FeishuSyncIssueStatus
    limit?: number
  } = {},
): Promise<FeishuSyncIssue[]> {
  const where: string[] = []
  const values: unknown[] = []
  if (input.taskId) {
    values.push(input.taskId)
    where.push(`task_id = $${values.length}`)
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
      task_id,
      target_type,
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
       task_id,
       target_type,
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
