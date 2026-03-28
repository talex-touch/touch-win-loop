import type { Queryable } from '~~/server/utils/db'
import type {
  FeishuAdminCandidate,
  FeishuAdminGroupReconcileResult,
  FeishuAdminManualAddResult,
  FeishuAdminOverviewContestAdmin,
  FeishuAuthBindStatus,
  FeishuAuthUnbindResult,
  FeishuBitableSyncRun,
  FeishuBitableSyncRunStatus,
  FeishuBitableSyncRunTriggerSource,
  FeishuBitableTask,
  FeishuBitableTaskDetail,
  FeishuBitableTaskTargetType,
  FeishuConfigValidationResult,
  FeishuIntegrationConfig,
  FeishuMappingConfigV2,
  FeishuSyncIssue,
  FeishuSyncIssueResolution,
  FeishuSyncIssueStatus,
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

export interface ClaimedFeishuBitableTask {
  task: FeishuBitableTask
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

function parseTaskSchedule(row: Pick<FeishuBitableTaskRow, 'schedule_enabled' | 'schedule_mode' | 'schedule_interval_minutes' | 'schedule_cron_expr' | 'schedule_timezone'>): FeishuTaskScheduleConfig {
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

function toLatestRunSummary(row: FeishuBitableTaskRow): FeishuTaskLatestRunSummary | null {
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
  const schedule = parseTaskSchedule(row)
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

export async function listFeishuBitableTasks(
  db: Queryable,
  input: { includeInactive?: boolean } = {},
): Promise<FeishuBitableTask[]> {
  const includeInactive = input.includeInactive === true
  const result = await db.query<FeishuBitableTaskRow>(
    `SELECT
      t.id,
      t.name,
      t.target_type,
      t.app_token,
      t.table_id,
      t.view_id,
      t.is_active,
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
     FROM feishu_bitable_tasks t
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_runs r
       WHERE r.task_id = t.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE ($1::BOOLEAN = TRUE OR t.is_active = TRUE)
     ORDER BY t.updated_at DESC`,
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
      t.id,
      t.name,
      t.target_type,
      t.app_token,
      t.table_id,
      t.view_id,
      t.is_active,
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
     FROM feishu_bitable_tasks t
     LEFT JOIN LATERAL (
       SELECT
         r.id,
         r.status,
         r.trigger_source,
         r.started_at,
         r.finished_at,
         r.error_count,
         r.error_message
       FROM feishu_bitable_sync_runs r
       WHERE r.task_id = t.id
       ORDER BY r.started_at DESC
       LIMIT 1
     ) lr ON TRUE
     WHERE t.id = $1
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
    schedule?: Partial<FeishuTaskScheduleConfig>
  },
): Promise<FeishuBitableTask> {
  const schedule = normalizeFeishuTaskScheduleConfig(input.schedule || {}, getDefaultFeishuTaskScheduleConfig())
  const scheduleErrors = validateFeishuTaskScheduleConfig(schedule)
  if (scheduleErrors.length)
    throw new Error(`任务调度配置非法：${scheduleErrors.join('；')}`)

  const scheduleNextRunAt = schedule.enabled
    ? computeNextScheduledRunAtOrNull(schedule, { from: new Date() })
    : null
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
      $1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9::JSONB, NULL, $10, $11, $12, $13, $14, $15, NULL, '', NULL, NULL, $16, $16, NOW(), NOW()
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
      taskId,
      toText(input.name),
      input.targetType,
      toText(input.appToken),
      toText(input.tableId),
      toText(input.viewId),
      input.isActive !== false,
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
      schedule?: Partial<FeishuTaskScheduleConfig>
    }
  },
): Promise<FeishuBitableTask | null> {
  const existingTask = await getFeishuBitableTaskById(db, input.taskId)
  if (!existingTask)
    return null

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

  if (input.patch.schedule !== undefined) {
    const mergedSchedule = mergeFeishuTaskSchedulePatch({
      current: existingTask.schedule,
      patch: input.patch.schedule,
    })
    const scheduleErrors = validateFeishuTaskScheduleConfig(mergedSchedule)
    if (scheduleErrors.length)
      throw new Error(`任务调度配置非法：${scheduleErrors.join('；')}`)

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
         schedule_last_run_at = NOW(),
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

export async function getFeishuBitableTaskDetail(
  db: Queryable,
  input: {
    taskId: string
    runLimit?: number
    issueLimit?: number
  },
): Promise<FeishuBitableTaskDetail | null> {
  const task = await getFeishuBitableTaskById(db, input.taskId)
  if (!task)
    return null

  const runLimit = Math.max(1, Math.min(100, Number(input.runLimit || 20)))
  const issueLimit = Math.max(1, Math.min(200, Number(input.issueLimit || 50)))

  const [recentRuns, issues, issueStatsResult] = await Promise.all([
    listFeishuBitableSyncRuns(db, {
      taskId: input.taskId,
      limit: runLimit,
    }),
    listFeishuSyncIssues(db, {
      taskId: input.taskId,
      limit: issueLimit,
    }),
    db.query<FeishuSyncIssueStatsRow>(
      `SELECT status, COUNT(*)::INTEGER AS issue_count
       FROM feishu_sync_issues
       WHERE task_id = $1
       GROUP BY status`,
      [input.taskId],
    ),
  ])

  return {
    ...task,
    recentRuns,
    issues,
    issueStats: toTaskIssueStats(issueStatsResult.rows),
  }
}

export async function claimNextDueFeishuBitableTask(
  db: Queryable,
  input: {
    now?: Date
    lockTtlMs?: number
  } = {},
): Promise<ClaimedFeishuBitableTask | null> {
  const now = input.now || new Date()
  const staleAt = new Date(now.getTime() - Math.max(60_000, Number(input.lockTtlMs || 10 * 60 * 1000)))
  const lockToken = randomUUID()
  const claimed = await db.query<{ id: string }>(
    `WITH candidate AS (
      SELECT id
      FROM feishu_bitable_tasks
      WHERE is_active = TRUE
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
    UPDATE feishu_bitable_tasks t
    SET
      schedule_lock_token = $3,
      schedule_locked_at = NOW(),
      updated_at = NOW()
    FROM candidate
    WHERE t.id = candidate.id
    RETURNING t.id`,
    [now.toISOString(), staleAt.toISOString(), lockToken],
  )

  const taskId = claimed.rows[0]?.id
  if (!taskId)
    return null

  const task = await getFeishuBitableTaskById(db, taskId)
  if (!task)
    return null

  return {
    task,
    lockToken,
  }
}

export async function completeScheduledFeishuTaskExecution(
  db: Queryable,
  input: {
    taskId: string
    lockToken: string
    nextRunAt: string | null
    lastError: string
    lastRunAt?: string
  },
): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `UPDATE feishu_bitable_tasks
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
      input.taskId,
      input.lockToken,
      input.nextRunAt,
      input.lastRunAt || new Date().toISOString(),
      String(input.lastError || '').slice(0, 1000),
    ],
  )
  return Boolean(result.rows[0]?.id)
}

export async function releaseFeishuTaskScheduleLock(
  db: Queryable,
  input: {
    taskId: string
    lockToken: string
  },
): Promise<void> {
  await db.query(
    `UPDATE feishu_bitable_tasks
     SET schedule_locked_at = NULL,
         schedule_lock_token = NULL,
         updated_at = NOW()
     WHERE id = $1
       AND schedule_lock_token = $2`,
    [input.taskId, input.lockToken],
  )
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
