import type { Queryable } from '~~/server/utils/db'
import type {
  Resource,
  WorkspaceExternalResourceRef,
  WorkspaceFeishuDirectoryUserCandidate,
  WorkspaceFeishuImportJob,
  WorkspaceFeishuImportSource,
  WorkspaceFeishuIntegrationSnapshot,
  WorkspaceFeishuMemberSyncPreview,
  WorkspaceFeishuMemberSyncResult,
  WorkspaceIntegrationConnection,
  WorkspaceIntegrationConnectionStatus,
  WorkspaceIntegrationListResult,
  WorkspaceIntegrationProvider,
  WorkspaceIntegrationSyncPolicy,
  WorkspaceMemberRole,
} from '~~/shared/types/domain'
import { createHash, randomUUID } from 'node:crypto'
import { teamEnsureWorkspaceMember } from '~~/server/utils/team-membership-store'
import { normalizeWorkspaceFeishuSyncPolicyPatch } from '~~/shared/utils/workspace-feishu-integration'

interface WorkspaceIntegrationConnectionRow {
  id: string
  workspace_id: string
  provider: WorkspaceIntegrationProvider
  status: WorkspaceIntegrationConnectionStatus
  tenant_key: string
  tenant_name: string
  external_app_id: string
  scopes: unknown
  capabilities: unknown
  installed_by_user_id: string | null
  authorized_by_user_id: string | null
  last_health_check_at: string | null
  last_error: string
  disconnected_at: string | null
  created_at: string
  updated_at: string
}

interface WorkspaceIntegrationSyncPolicyRow {
  id: string
  connection_id: string
  member_sync_mode: 'whitelist'
  auto_login_enabled: boolean
  default_workspace_role: Extract<WorkspaceMemberRole, 'admin' | 'manager' | 'member'>
  department_ids: string[] | null
  user_ids: string[] | null
  group_ids: string[] | null
  role_mappings: unknown
  last_preview_at: string | null
  last_sync_at: string | null
  last_sync_result: unknown
  created_at: string
  updated_at: string
}

interface WorkspaceIntegrationImportJobRow {
  id: string
  workspace_id: string
  connection_id: string
  project_id: string
  provider: 'feishu'
  status: WorkspaceFeishuImportJob['status']
  requested_by_user_id: string | null
  source_count: number | string
  imported_count: number | string
  skipped_count: number | string
  failed_count: number | string
  diagnostics: unknown
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

interface WorkspaceExternalResourceRefRow {
  id: string
  workspace_id: string
  project_id: string
  connection_id: string
  import_job_id: string | null
  provider: 'feishu'
  external_type: WorkspaceExternalResourceRef['externalType']
  external_token: string
  external_url: string
  resource_id: string | null
  source_hash: string
  metadata: unknown
  last_import_status: WorkspaceExternalResourceRef['lastImportStatus']
  last_error: string
  created_at: string
  updated_at: string
}

interface ExistingFeishuIdentityRow {
  provider_user_id: string
  user_id: string
  profile_json: unknown
}

interface ExistingUserRow {
  id: string
  username: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => normalizeString(item)).filter(Boolean)
}

function normalizeCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.trunc(parsed))
}

function buildFeishuMarketplaceCapabilities(input?: {
  tokenHealth?: string
  extra?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    docs: true,
    drive: true,
    bitable: true,
    memberSync: true,
    authMode: 'marketplace',
    tokenHealth: input?.tokenHealth || 'missing_tenant_key',
    ...normalizeRecord(input?.extra),
  }
}

function appendStateToMarketplaceAppUrl(rawUrl: string, state: string): string {
  const url = normalizeString(rawUrl)
  const normalizedState = normalizeString(state)
  if (!url || !normalizedState)
    return url

  try {
    const parsed = new URL(url)
    parsed.searchParams.set('state', normalizedState)
    return parsed.toString()
  }
  catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}state=${encodeURIComponent(normalizedState)}`
  }
}

function normalizeConnection(row: WorkspaceIntegrationConnectionRow): WorkspaceIntegrationConnection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    status: row.status,
    tenantKey: row.tenant_key || '',
    tenantName: row.tenant_name || '',
    externalAppId: row.external_app_id || '',
    scopes: normalizeStringArray(row.scopes),
    capabilities: normalizeRecord(row.capabilities),
    installedByUserId: row.installed_by_user_id,
    authorizedByUserId: row.authorized_by_user_id,
    lastHealthCheckAt: row.last_health_check_at,
    lastError: row.last_error || '',
    disconnectedAt: row.disconnected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizePolicy(row: WorkspaceIntegrationSyncPolicyRow): WorkspaceIntegrationSyncPolicy {
  return {
    id: row.id,
    connectionId: row.connection_id,
    memberSyncMode: row.member_sync_mode || 'whitelist',
    autoLoginEnabled: row.auto_login_enabled !== false,
    defaultWorkspaceRole: row.default_workspace_role || 'member',
    departmentIds: normalizeStringArray(row.department_ids),
    userIds: normalizeStringArray(row.user_ids),
    groupIds: normalizeStringArray(row.group_ids),
    roleMappings: normalizeRecord(row.role_mappings) as WorkspaceIntegrationSyncPolicy['roleMappings'],
    lastPreviewAt: row.last_preview_at,
    lastSyncAt: row.last_sync_at,
    lastSyncResult: normalizeRecord(row.last_sync_result),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeImportJob(row: WorkspaceIntegrationImportJobRow): WorkspaceFeishuImportJob {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectionId: row.connection_id,
    projectId: row.project_id,
    provider: row.provider,
    status: row.status,
    requestedByUserId: row.requested_by_user_id,
    sourceCount: normalizeCount(row.source_count),
    importedCount: normalizeCount(row.imported_count),
    skippedCount: normalizeCount(row.skipped_count),
    failedCount: normalizeCount(row.failed_count),
    diagnostics: normalizeRecord(row.diagnostics),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeExternalResourceRef(row: WorkspaceExternalResourceRefRow): WorkspaceExternalResourceRef {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    connectionId: row.connection_id,
    importJobId: row.import_job_id,
    provider: row.provider,
    externalType: row.external_type,
    externalToken: row.external_token,
    externalUrl: row.external_url || '',
    resourceId: row.resource_id,
    sourceHash: row.source_hash || '',
    metadata: normalizeRecord(row.metadata),
    lastImportStatus: row.last_import_status,
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getFeishuConnectionRow(db: Queryable, workspaceId: string): Promise<WorkspaceIntegrationConnectionRow | null> {
  const result = await db.query<WorkspaceIntegrationConnectionRow>(
    `SELECT
      id,
      workspace_id,
      provider,
      status,
      tenant_key,
      tenant_name,
      external_app_id,
      scopes,
      capabilities,
      installed_by_user_id,
      authorized_by_user_id,
      last_health_check_at::TEXT,
      last_error,
      disconnected_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM workspace_integration_connections
     WHERE workspace_id = $1
       AND provider = 'feishu'
     LIMIT 1`,
    [workspaceId],
  )
  return result.rows[0] || null
}

async function getPolicyByConnectionId(db: Queryable, connectionId: string): Promise<WorkspaceIntegrationSyncPolicy | null> {
  const result = await db.query<WorkspaceIntegrationSyncPolicyRow>(
    `SELECT
      id,
      connection_id,
      member_sync_mode,
      auto_login_enabled,
      default_workspace_role,
      department_ids,
      user_ids,
      group_ids,
      role_mappings,
      last_preview_at::TEXT,
      last_sync_at::TEXT,
      last_sync_result,
      created_at::TEXT,
      updated_at::TEXT
     FROM workspace_integration_sync_policies
     WHERE connection_id = $1
     LIMIT 1`,
    [connectionId],
  )
  return result.rows[0] ? normalizePolicy(result.rows[0]!) : null
}

export async function getWorkspaceIntegrationList(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceIntegrationListResult> {
  const connectionRow = await getFeishuConnectionRow(db, workspaceId)
  const connection = connectionRow ? normalizeConnection(connectionRow) : null
  const policy = connection ? await getPolicyByConnectionId(db, connection.id) : null
  return {
    integrations: [
      {
        provider: 'feishu',
        connected: connection?.status === 'connected',
        connection,
        policy,
      },
    ],
  }
}

export async function getFeishuWorkspaceIntegrationSnapshot(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  const list = await getWorkspaceIntegrationList(db, workspaceId)
  const summary = list.integrations[0]!
  const connectionId = summary.connection?.id || ''
  const [jobResult, refResult] = connectionId
    ? await Promise.all([
        db.query<WorkspaceIntegrationImportJobRow>(
          `SELECT
            id,
            workspace_id,
            connection_id,
            project_id,
            provider,
            status,
            requested_by_user_id,
            source_count,
            imported_count,
            skipped_count,
            failed_count,
            diagnostics,
            started_at::TEXT,
            finished_at::TEXT,
            created_at::TEXT,
            updated_at::TEXT
           FROM workspace_integration_import_jobs
           WHERE workspace_id = $1
             AND connection_id = $2
           ORDER BY created_at DESC
           LIMIT 20`,
          [workspaceId, connectionId],
        ),
        db.query<WorkspaceExternalResourceRefRow>(
          `SELECT
            id,
            workspace_id,
            project_id,
            connection_id,
            import_job_id,
            provider,
            external_type,
            external_token,
            external_url,
            resource_id,
            source_hash,
            metadata,
            last_import_status,
            last_error,
            created_at::TEXT,
            updated_at::TEXT
           FROM workspace_external_resource_refs
           WHERE workspace_id = $1
             AND connection_id = $2
           ORDER BY updated_at DESC
           LIMIT 50`,
          [workspaceId, connectionId],
        ),
      ])
    : [{ rows: [] as WorkspaceIntegrationImportJobRow[] }, { rows: [] as WorkspaceExternalResourceRefRow[] }]

  return {
    provider: 'feishu',
    connected: summary.connected,
    connection: summary.connection || null,
    policy: summary.policy || null,
    importJobs: jobResult.rows.map(normalizeImportJob),
    externalResources: refResult.rows.map(normalizeExternalResourceRef),
  }
}

export async function upsertFeishuWorkspaceConnection(
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
    tenantKey?: string
    tenantName?: string
    externalAppId?: string
    status?: WorkspaceIntegrationConnectionStatus
    scopes?: string[]
    capabilities?: Record<string, unknown>
    config?: Record<string, unknown>
  },
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  const now = new Date().toISOString()
  const result = await db.query<{ id: string }>(
    `INSERT INTO workspace_integration_connections (
      id,
      workspace_id,
      provider,
      status,
      tenant_key,
      tenant_name,
      external_app_id,
      scopes,
      capabilities,
      config_json,
      installed_by_user_id,
      authorized_by_user_id,
      disconnected_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'feishu', $3, $4, $5, $6, $7::JSONB, $8::JSONB, $9::JSONB, $10, $10, NULL, $11, $11
    )
    ON CONFLICT (workspace_id, provider)
    DO UPDATE SET
      status = EXCLUDED.status,
      tenant_key = EXCLUDED.tenant_key,
      tenant_name = EXCLUDED.tenant_name,
      external_app_id = EXCLUDED.external_app_id,
      scopes = EXCLUDED.scopes,
      capabilities = EXCLUDED.capabilities,
      config_json = workspace_integration_connections.config_json || EXCLUDED.config_json,
      authorized_by_user_id = EXCLUDED.authorized_by_user_id,
      disconnected_at = NULL,
      updated_at = EXCLUDED.updated_at
    RETURNING id`,
    [
      randomUUID(),
      input.workspaceId,
      input.status || 'connected',
      normalizeString(input.tenantKey),
      normalizeString(input.tenantName),
      normalizeString(input.externalAppId),
      JSON.stringify(Array.isArray(input.scopes) ? input.scopes.filter(Boolean) : []),
      JSON.stringify(normalizeRecord(input.capabilities)),
      JSON.stringify(normalizeRecord(input.config)),
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO workspace_integration_sync_policies (
      id,
      connection_id,
      member_sync_mode,
      auto_login_enabled,
      default_workspace_role,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'whitelist', TRUE, 'member', $3, $3, $4, $4
    )
    ON CONFLICT (connection_id)
    DO NOTHING`,
    [randomUUID(), result.rows[0]!.id, input.actorUserId, now],
  )

  return getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
}

export async function createFeishuWorkspaceInstallSession(
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
    marketplaceAppUrl: string
    externalAppId?: string
    appTicketConfigured?: boolean
  },
): Promise<{
  installUrl: string
  state: string
  expiresAt: string
  snapshot: WorkspaceFeishuIntegrationSnapshot
}> {
  const state = randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const snapshot = await upsertFeishuWorkspaceConnection(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    status: 'pending',
    externalAppId: normalizeString(input.externalAppId),
    scopes: ['docs:read', 'drive:read', 'bitable:read', 'contact:read'],
    capabilities: buildFeishuMarketplaceCapabilities({
      tokenHealth: input.appTicketConfigured ? 'missing_tenant_key' : 'missing_app_ticket',
    }),
    config: {
      installState: state,
      installStateExpiresAt: expiresAt,
    },
  })

  return {
    installUrl: appendStateToMarketplaceAppUrl(input.marketplaceAppUrl, state),
    state,
    expiresAt,
    snapshot,
  }
}

export async function claimFeishuWorkspaceTenant(
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
    tenantKey: string
    tenantName?: string
    externalAppId?: string
  },
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  return upsertFeishuWorkspaceConnection(db, {
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    tenantKey: input.tenantKey,
    tenantName: input.tenantName,
    externalAppId: input.externalAppId,
    status: 'connected',
    scopes: ['docs:read', 'drive:read', 'bitable:read', 'contact:read'],
    capabilities: buildFeishuMarketplaceCapabilities({
      tokenHealth: 'ok',
    }),
  })
}

export async function markFeishuWorkspaceConnectionTokenHealth(
  db: Queryable,
  input: {
    workspaceId: string
    status: WorkspaceIntegrationConnectionStatus
    tokenHealth: 'ok' | 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed'
    lastError?: string
    actorUserId?: string
  },
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  await db.query(
    `UPDATE workspace_integration_connections
     SET status = $2,
         capabilities = capabilities || $3::JSONB,
         last_error = $4,
         authorized_by_user_id = COALESCE($5, authorized_by_user_id),
         updated_at = NOW()
     WHERE workspace_id = $1
       AND provider = 'feishu'`,
    [
      input.workspaceId,
      input.status,
      JSON.stringify(buildFeishuMarketplaceCapabilities({
        tokenHealth: input.tokenHealth,
      })),
      normalizeString(input.lastError),
      normalizeString(input.actorUserId) || null,
    ],
  )
  return getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
}

export async function patchFeishuWorkspaceSyncPolicy(
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
    patch: Parameters<typeof normalizeWorkspaceFeishuSyncPolicyPatch>[0]
  },
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  const connection = await getFeishuConnectionRow(db, input.workspaceId)
  if (!connection)
    throw new Error('WORKSPACE_FEISHU_CONNECTION_NOT_FOUND')

  const patch = normalizeWorkspaceFeishuSyncPolicyPatch(input.patch)
  const now = new Date().toISOString()
  await db.query(
    `INSERT INTO workspace_integration_sync_policies (
      id,
      connection_id,
      member_sync_mode,
      auto_login_enabled,
      default_workspace_role,
      department_ids,
      user_ids,
      group_ids,
      role_mappings,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, 'whitelist', $3, $4, $5::TEXT[], $6::TEXT[], $7::TEXT[], $8::JSONB, $9, $9, $10, $10
    )
    ON CONFLICT (connection_id)
    DO UPDATE SET
      auto_login_enabled = EXCLUDED.auto_login_enabled,
      default_workspace_role = EXCLUDED.default_workspace_role,
      department_ids = EXCLUDED.department_ids,
      user_ids = EXCLUDED.user_ids,
      group_ids = EXCLUDED.group_ids,
      role_mappings = EXCLUDED.role_mappings,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      connection.id,
      patch.autoLoginEnabled,
      patch.defaultWorkspaceRole,
      patch.departmentIds,
      patch.userIds,
      patch.groupIds,
      JSON.stringify(patch.roleMappings),
      input.actorUserId,
      now,
    ],
  )

  return getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
}

export async function disableFeishuWorkspaceConnection(
  db: Queryable,
  input: {
    workspaceId: string
    actorUserId: string
  },
): Promise<WorkspaceFeishuIntegrationSnapshot> {
  await db.query(
    `UPDATE workspace_integration_connections
     SET status = 'disabled',
         authorized_by_user_id = $2,
         disconnected_at = NOW(),
         updated_at = NOW()
     WHERE workspace_id = $1
       AND provider = 'feishu'`,
    [input.workspaceId, input.actorUserId],
  )
  return getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
}

export async function registerIntegrationEventDedup(
  db: Queryable,
  input: {
    provider: WorkspaceIntegrationProvider
    eventId: string
    tenantKey?: string
    eventType?: string
    payload?: unknown
  },
): Promise<{ inserted: boolean }> {
  const eventId = normalizeString(input.eventId)
  if (!eventId)
    return { inserted: false }
  const payloadHash = createHash('sha256').update(JSON.stringify(input.payload || {})).digest('hex')
  const result = await db.query<{ id: string }>(
    `INSERT INTO integration_event_dedup (
      id,
      provider,
      event_id,
      tenant_key,
      event_type,
      payload_hash,
      processed_at,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, NOW(), NOW()
    )
    ON CONFLICT (provider, event_id)
    DO NOTHING
    RETURNING id`,
    [
      randomUUID(),
      input.provider,
      eventId,
      normalizeString(input.tenantKey),
      normalizeString(input.eventType),
      payloadHash,
    ],
  )
  return { inserted: Boolean(result.rows[0]?.id) }
}

export async function updateFeishuWorkspaceConnectionStatusByTenantKey(
  db: Queryable,
  input: {
    tenantKey: string
    status: WorkspaceIntegrationConnectionStatus
    tenantName?: string
    lastError?: string
  },
): Promise<number> {
  const result = await db.query<{ id: string }>(
    `UPDATE workspace_integration_connections
     SET status = $2,
         tenant_name = COALESCE(NULLIF($3, ''), tenant_name),
         last_error = $4,
         disconnected_at = CASE WHEN $2 IN ('disabled', 'uninstalled') THEN NOW() ELSE disconnected_at END,
         updated_at = NOW()
     WHERE provider = 'feishu'
       AND tenant_key = $1
     RETURNING id`,
    [
      normalizeString(input.tenantKey),
      input.status,
      normalizeString(input.tenantName),
      normalizeString(input.lastError),
    ],
  )
  return result.rows.length
}

function isCandidateWhitelisted(candidate: WorkspaceFeishuDirectoryUserCandidate, policy: WorkspaceIntegrationSyncPolicy | null): boolean {
  if (!policy)
    return false
  const unionId = normalizeString(candidate.unionId)
  const userIds = new Set(policy.userIds)
  if (unionId && userIds.has(unionId))
    return true
  const departmentIds = new Set(policy.departmentIds)
  if ((candidate.departmentIds || []).some(id => departmentIds.has(normalizeString(id))))
    return true
  const groupIds = new Set(policy.groupIds)
  return (candidate.groupIds || []).some(id => groupIds.has(normalizeString(id)))
}

async function loadExistingFeishuIdentities(
  db: Queryable,
  unionIds: string[],
): Promise<Map<string, ExistingFeishuIdentityRow>> {
  if (!unionIds.length)
    return new Map()
  const result = await db.query<ExistingFeishuIdentityRow>(
    `SELECT provider_user_id, user_id, profile_json
     FROM auth_identities
     WHERE provider = 'feishu'
       AND provider_user_id = ANY($1::TEXT[])`,
    [unionIds],
  )
  return new Map(result.rows.map(row => [row.provider_user_id, row]))
}

async function hasEmailConflict(
  db: Queryable,
  email: string,
  unionId: string,
): Promise<boolean> {
  if (!email)
    return false
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM auth_identities
      WHERE provider = 'feishu'
        AND provider_user_id <> $2
        AND LOWER(profile_json->>'email') = LOWER($1)
    ) AS exists`,
    [email, unionId],
  )
  return Boolean(result.rows[0]?.exists)
}

export async function previewFeishuWorkspaceMemberSync(
  db: Queryable,
  input: {
    workspaceId: string
    candidates: WorkspaceFeishuDirectoryUserCandidate[]
  },
): Promise<WorkspaceFeishuMemberSyncPreview> {
  const connectionRow = await getFeishuConnectionRow(db, input.workspaceId)
  const policy = connectionRow ? await getPolicyByConnectionId(db, connectionRow.id) : null
  const candidates = (Array.isArray(input.candidates) ? input.candidates : [])
    .filter(candidate => normalizeString(candidate.unionId))
  const unionIds = candidates.map(candidate => normalizeString(candidate.unionId))
  const existing = await loadExistingFeishuIdentities(db, unionIds)

  let whitelistedCount = 0
  let createCount = 0
  let updateCount = 0
  let conflictCount = 0
  let skipCount = 0

  for (const candidate of candidates) {
    const unionId = normalizeString(candidate.unionId)
    if (!isCandidateWhitelisted(candidate, policy)) {
      skipCount += 1
      continue
    }

    whitelistedCount += 1
    if (existing.has(unionId)) {
      updateCount += 1
      continue
    }

    if (await hasEmailConflict(db, normalizeString(candidate.email), unionId)) {
      conflictCount += 1
      continue
    }
    createCount += 1
  }

  await db.query(
    `UPDATE workspace_integration_sync_policies
     SET last_preview_at = NOW(),
         updated_at = NOW()
     WHERE connection_id = $1`,
    [connectionRow?.id || ''],
  )

  return {
    totalCandidates: candidates.length,
    whitelistedCount,
    createCount,
    updateCount,
    skipCount,
    conflictCount,
    seatRequired: createCount,
    diagnostics: policy
      ? []
      : [{ code: 'feishu_policy_missing', message: '飞书成员同步策略尚未配置。' }],
  }
}

async function resolveUniqueUsername(db: Queryable, candidate: WorkspaceFeishuDirectoryUserCandidate): Promise<string> {
  const rawBase = normalizeString(candidate.name) || normalizeString(candidate.email).split('@')[0] || normalizeString(candidate.unionId) || 'feishu-user'
  const base = rawBase.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'feishu-user'
  for (let index = 0; index < 20; index += 1) {
    const username = index === 0 ? base : `${base}-${index + 1}`
    const result = await db.query<ExistingUserRow>(
      `SELECT id, username
       FROM users
       WHERE username = $1
       LIMIT 1`,
      [username],
    )
    if (!result.rows[0])
      return username
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}

export async function runFeishuWorkspaceMemberSync(
  db: Queryable,
  input: {
    workspaceId: string
    candidates: WorkspaceFeishuDirectoryUserCandidate[]
  },
): Promise<WorkspaceFeishuMemberSyncResult> {
  const preview = await previewFeishuWorkspaceMemberSync(db, input)
  const connectionRow = await getFeishuConnectionRow(db, input.workspaceId)
  const policy = connectionRow ? await getPolicyByConnectionId(db, connectionRow.id) : null
  if (!policy || !connectionRow) {
    return {
      ...preview,
      createdUserIds: [],
      updatedUserIds: [],
    }
  }

  const candidates = input.candidates.filter(candidate => normalizeString(candidate.unionId) && isCandidateWhitelisted(candidate, policy))
  const existing = await loadExistingFeishuIdentities(db, candidates.map(candidate => normalizeString(candidate.unionId)))
  const createdUserIds: string[] = []
  const updatedUserIds: string[] = []
  const now = new Date().toISOString()

  for (const candidate of candidates) {
    const unionId = normalizeString(candidate.unionId)
    if (!unionId)
      continue
    if (!existing.has(unionId) && await hasEmailConflict(db, normalizeString(candidate.email), unionId))
      continue

    let userId = existing.get(unionId)?.user_id || ''
    if (!userId) {
      userId = randomUUID()
      const username = await resolveUniqueUsername(db, candidate)
      await db.query(
        `INSERT INTO users (id, username, password_hash, avatar_url, is_platform_admin, is_disabled, created_at, updated_at)
         VALUES ($1, $2, '', $3, FALSE, FALSE, $4, $4)`,
        [userId, username, normalizeString(candidate.avatarUrl) || null, now],
      )
      createdUserIds.push(userId)
    }
    else {
      updatedUserIds.push(userId)
    }

    await db.query(
      `INSERT INTO auth_identities (id, provider, provider_user_id, user_id, profile_json, created_at, updated_at)
       VALUES ($1, 'feishu', $2, $3, $4::JSONB, $5, $5)
       ON CONFLICT (provider, provider_user_id)
       DO UPDATE SET
         user_id = EXCLUDED.user_id,
         profile_json = EXCLUDED.profile_json,
         updated_at = EXCLUDED.updated_at`,
      [
        randomUUID(),
        unionId,
        userId,
        JSON.stringify({
          openId: normalizeString(candidate.openId),
          unionId,
          name: normalizeString(candidate.name),
          email: normalizeString(candidate.email),
          mobile: normalizeString(candidate.mobile),
          departmentIds: candidate.departmentIds || [],
          groupIds: candidate.groupIds || [],
          tenantKey: connectionRow.tenant_key,
        }),
        now,
      ],
    )
    await teamEnsureWorkspaceMember(db, input.workspaceId, userId, policy.roleMappings[unionId] || policy.defaultWorkspaceRole || 'member')
  }

  const result: WorkspaceFeishuMemberSyncResult = {
    ...preview,
    createdUserIds,
    updatedUserIds,
  }
  await db.query(
    `UPDATE workspace_integration_sync_policies
     SET last_sync_at = NOW(),
         last_sync_result = $2::JSONB,
         updated_at = NOW()
     WHERE connection_id = $1`,
    [connectionRow.id, JSON.stringify(result)],
  )
  return result
}

export async function createWorkspaceFeishuImportJob(
  db: Queryable,
  input: {
    workspaceId: string
    connectionId: string
    projectId: string
    requestedByUserId: string
    sourceCount: number
  },
): Promise<WorkspaceFeishuImportJob> {
  const now = new Date().toISOString()
  const id = randomUUID()
  const result = await db.query<WorkspaceIntegrationImportJobRow>(
    `INSERT INTO workspace_integration_import_jobs (
      id,
      workspace_id,
      connection_id,
      project_id,
      provider,
      status,
      requested_by_user_id,
      source_count,
      started_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, 'feishu', 'processing', $5, $6, $7, $7, $7
    )
    RETURNING
      id,
      workspace_id,
      connection_id,
      project_id,
      provider,
      status,
      requested_by_user_id,
      source_count,
      imported_count,
      skipped_count,
      failed_count,
      diagnostics,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      id,
      input.workspaceId,
      input.connectionId,
      input.projectId,
      input.requestedByUserId,
      Math.max(0, Math.trunc(input.sourceCount)),
      now,
    ],
  )
  return normalizeImportJob(result.rows[0]!)
}

export async function getWorkspaceFeishuImportJob(
  db: Queryable,
  input: {
    workspaceId: string
    jobId: string
  },
): Promise<WorkspaceFeishuImportJob | null> {
  const result = await db.query<WorkspaceIntegrationImportJobRow>(
    `SELECT
      id,
      workspace_id,
      connection_id,
      project_id,
      provider,
      status,
      requested_by_user_id,
      source_count,
      imported_count,
      skipped_count,
      failed_count,
      diagnostics,
      started_at::TEXT,
      finished_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM workspace_integration_import_jobs
     WHERE workspace_id = $1
       AND id = $2
     LIMIT 1`,
    [input.workspaceId, input.jobId],
  )
  return result.rows[0] ? normalizeImportJob(result.rows[0]!) : null
}

export async function finishWorkspaceFeishuImportJob(
  db: Queryable,
  input: {
    jobId: string
    status: WorkspaceFeishuImportJob['status']
    importedCount: number
    skippedCount: number
    failedCount: number
    diagnostics?: Record<string, unknown>
  },
): Promise<WorkspaceFeishuImportJob | null> {
  const result = await db.query<WorkspaceIntegrationImportJobRow>(
    `UPDATE workspace_integration_import_jobs
     SET status = $2,
         imported_count = $3,
         skipped_count = $4,
         failed_count = $5,
         diagnostics = $6::JSONB,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       workspace_id,
       connection_id,
       project_id,
       provider,
       status,
       requested_by_user_id,
       source_count,
       imported_count,
       skipped_count,
       failed_count,
       diagnostics,
       started_at::TEXT,
       finished_at::TEXT,
       created_at::TEXT,
       updated_at::TEXT`,
    [
      input.jobId,
      input.status,
      input.importedCount,
      input.skippedCount,
      input.failedCount,
      JSON.stringify(normalizeRecord(input.diagnostics)),
    ],
  )
  return result.rows[0] ? normalizeImportJob(result.rows[0]!) : null
}

export async function findWorkspaceExternalResourceRef(
  db: Queryable,
  input: {
    connectionId: string
    projectId: string
    externalType: WorkspaceFeishuImportSource['type']
    externalToken: string
  },
): Promise<WorkspaceExternalResourceRef | null> {
  const result = await db.query<WorkspaceExternalResourceRefRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      connection_id,
      import_job_id,
      provider,
      external_type,
      external_token,
      external_url,
      resource_id,
      source_hash,
      metadata,
      last_import_status,
      last_error,
      created_at::TEXT,
      updated_at::TEXT
     FROM workspace_external_resource_refs
     WHERE connection_id = $1
       AND project_id = $2
       AND external_type = $3
       AND external_token = $4
     LIMIT 1`,
    [input.connectionId, input.projectId, input.externalType, input.externalToken],
  )
  return result.rows[0] ? normalizeExternalResourceRef(result.rows[0]!) : null
}

export async function recordWorkspaceFeishuImportResource(
  db: Queryable,
  input: {
    workspaceId: string
    connectionId: string
    projectId: string
    importJobId: string
    source: WorkspaceFeishuImportSource
    sourceHash: string
    resource: Resource
    actorUserId: string
    metadata?: Record<string, unknown>
  },
): Promise<WorkspaceExternalResourceRef> {
  const now = new Date().toISOString()
  const result = await db.query<WorkspaceExternalResourceRefRow>(
    `INSERT INTO workspace_external_resource_refs (
      id,
      workspace_id,
      project_id,
      connection_id,
      import_job_id,
      provider,
      external_type,
      external_token,
      external_url,
      resource_id,
      source_hash,
      metadata,
      last_import_status,
      last_error,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'feishu', $6, $7, $8, $9, $10, $11::JSONB, 'succeeded', '', $12, $12, $13, $13
    )
    ON CONFLICT (connection_id, external_type, external_token, project_id)
    DO UPDATE SET
      import_job_id = EXCLUDED.import_job_id,
      external_url = EXCLUDED.external_url,
      resource_id = EXCLUDED.resource_id,
      source_hash = EXCLUDED.source_hash,
      metadata = EXCLUDED.metadata,
      last_import_status = 'succeeded',
      last_error = '',
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = EXCLUDED.updated_at
    RETURNING
      id,
      workspace_id,
      project_id,
      connection_id,
      import_job_id,
      provider,
      external_type,
      external_token,
      external_url,
      resource_id,
      source_hash,
      metadata,
      last_import_status,
      last_error,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.workspaceId,
      input.projectId,
      input.connectionId,
      input.importJobId,
      input.source.type,
      input.source.token,
      input.source.originalUrl || '',
      input.resource.id,
      input.sourceHash,
      JSON.stringify({
        ...normalizeRecord(input.metadata),
        sourceTitle: input.source.title,
      }),
      input.actorUserId,
      now,
    ],
  )
  return normalizeExternalResourceRef(result.rows[0]!)
}
