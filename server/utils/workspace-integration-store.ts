import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import type { Queryable } from '~~/server/utils/db'
import type {
  Resource,
  WorkspaceExternalResourceRef,
  WorkspaceFeishuDirectoryUserCandidate,
  WorkspaceFeishuImportJob,
  WorkspaceFeishuImportSource,
  WorkspaceFeishuIntegrationDiagnosticSummary,
  WorkspaceFeishuIntegrationSnapshot,
  WorkspaceFeishuMemberSyncDiagnostic,
  WorkspaceFeishuMemberSyncPreview,
  WorkspaceFeishuMemberSyncResult,
  WorkspaceIntegrationAuditLog,
  WorkspaceIntegrationAuditStatus,
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

interface WorkspaceIntegrationAuditLogRow {
  id: string
  workspace_id: string
  provider: WorkspaceIntegrationProvider
  connection_id: string | null
  actor_user_id: string | null
  action: string
  status: WorkspaceIntegrationAuditStatus
  summary: string
  payload: unknown
  created_at: string
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

interface FeishuAutoJoinPolicyRow {
  workspace_id: string
  connection_id: string
  tenant_key: string
  user_ids: string[] | null
  department_ids: string[] | null
  group_ids: string[] | null
  role_mappings: unknown
  default_workspace_role: Extract<WorkspaceMemberRole, 'admin' | 'manager' | 'member'>
}

interface FeishuWorkspaceAutoJoinResult {
  joinedWorkspaceIds: string[]
  diagnostics: WorkspaceFeishuMemberSyncDiagnostic[]
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

function normalizeAuditStatus(value: unknown): WorkspaceIntegrationAuditStatus {
  const status = normalizeString(value)
  if (status === 'success' || status === 'warning' || status === 'error' || status === 'info')
    return status
  return 'info'
}

function uniqueStringArray(value: unknown): string[] {
  const seen = new Set<string>()
  const items = normalizeStringArray(value)
  const result: string[] = []
  for (const item of items) {
    if (seen.has(item))
      continue
    seen.add(item)
    result.push(item)
  }
  return result
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

function normalizeAuditLog(row: WorkspaceIntegrationAuditLogRow): WorkspaceIntegrationAuditLog {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    connectionId: row.connection_id,
    actorUserId: row.actor_user_id,
    action: row.action || '',
    status: normalizeAuditStatus(row.status),
    summary: row.summary || '',
    payload: normalizeRecord(row.payload),
    createdAt: row.created_at,
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

function toDiagnosticSamples(rawDiagnostics: unknown): WorkspaceFeishuMemberSyncDiagnostic[] {
  if (!Array.isArray(rawDiagnostics))
    return []
  return rawDiagnostics
    .map((item) => {
      const record = normalizeRecord(item)
      return {
        code: normalizeString(record.code) as WorkspaceFeishuMemberSyncDiagnostic['code'],
        message: normalizeString(record.message),
        count: normalizeCount(record.count),
        unionId: normalizeString(record.unionId) || undefined,
      }
    })
    .filter(item => item.code && item.message)
    .slice(0, 5)
}

function resolveTokenHealthText(tokenHealth: string, connected: boolean): string {
  if (tokenHealth === 'ok')
    return 'token 正常'
  if (tokenHealth === 'missing_app_ticket')
    return '平台尚未收到 app_ticket'
  if (tokenHealth === 'missing_tenant_key')
    return '等待认领飞书租户'
  if (tokenHealth === 'tenant_token_failed')
    return '租户 token 检查失败'
  return connected ? '等待 token 健康检查' : '未建立连接'
}

function buildMemberSyncSummary(policy: WorkspaceIntegrationSyncPolicy | null): Record<string, unknown> {
  const result = normalizeRecord(policy?.lastSyncResult)
  return {
    lastPreviewAt: policy?.lastPreviewAt || null,
    lastSyncAt: policy?.lastSyncAt || null,
    totalCandidates: normalizeCount(result.totalCandidates),
    createCount: normalizeCount(result.createCount),
    updateCount: normalizeCount(result.updateCount),
    skipCount: normalizeCount(result.skipCount),
    conflictCount: normalizeCount(result.conflictCount),
    seatRequired: normalizeCount(result.seatRequired),
    seatFailedCount: normalizeCount(result.seatFailedCount),
    roleMappingAppliedCount: normalizeCount(result.roleMappingAppliedCount),
    diagnosticSamples: toDiagnosticSamples(result.diagnostics),
  }
}

function buildAutoLoginSummary(policy: WorkspaceIntegrationSyncPolicy | null): Record<string, unknown> {
  const autoLogin = normalizeRecord(normalizeRecord(policy?.lastSyncResult).autoLogin)
  const diagnostics = toDiagnosticSamples(autoLogin.diagnostics)
  return {
    checkedAt: normalizeString(autoLogin.checkedAt) || null,
    joined: Boolean(autoLogin.joined),
    joinedCount: autoLogin.joined ? 1 : 0,
    failedCount: diagnostics.length,
    diagnosticSamples: diagnostics,
  }
}

function buildImportSummary(importJobs: WorkspaceFeishuImportJob[]): Record<string, unknown> {
  const latestJob = importJobs[0] || null
  const failures = Array.isArray(latestJob?.diagnostics?.failures)
    ? latestJob.diagnostics.failures.slice(0, 5)
    : []
  return {
    latestJobId: latestJob?.id || '',
    latestStatus: latestJob?.status || '',
    importedCount: latestJob?.importedCount || 0,
    skippedCount: latestJob?.skippedCount || 0,
    failedCount: latestJob?.failedCount || 0,
    diagnosticSamples: failures,
  }
}

export function buildWorkspaceFeishuDiagnosticSummary(
  snapshot: Pick<WorkspaceFeishuIntegrationSnapshot, 'connected' | 'connection' | 'policy' | 'importJobs'>,
): WorkspaceFeishuIntegrationDiagnosticSummary {
  const tokenHealth = normalizeString(snapshot.connection?.capabilities?.tokenHealth)
  const connectionStatus = snapshot.connection?.status || ''
  const memberSyncSummary = buildMemberSyncSummary(snapshot.policy || null)
  const autoLoginSummary = buildAutoLoginSummary(snapshot.policy || null)
  return {
    connectionStatus,
    tokenHealth,
    tokenHealthText: resolveTokenHealthText(tokenHealth, snapshot.connected),
    lastError: snapshot.connection?.lastError || '',
    memberSyncSummary,
    autoLoginSummary,
    importSummary: buildImportSummary(snapshot.importJobs || []),
  }
}

export function sanitizeWorkspaceIntegrationAuditPayload(input: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>()
  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value))
      return value.slice(0, 20).map(item => sanitizeValue(item))
    if (!value || typeof value !== 'object')
      return value
    if (seen.has(value))
      return '[Circular]'
    seen.add(value)
    const result: Record<string, unknown> = {}
    for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase()
      const isDiagnosticTokenField = normalizedKey === 'tokenhealth' || normalizedKey === 'tokenhealthtext'
      if (!isDiagnosticTokenField && /token|ticket|secret|authorization|password/i.test(key)) {
        result[key] = '[redacted]'
        continue
      }
      result[key] = sanitizeValue(rawValue)
    }
    return result
  }
  return normalizeRecord(sanitizeValue(input))
}

export async function recordWorkspaceIntegrationAuditLog(
  db: Queryable,
  input: {
    workspaceId: string
    provider: WorkspaceIntegrationProvider
    connectionId?: string | null
    actorUserId?: string | null
    action: string
    status: WorkspaceIntegrationAuditStatus
    summary: string
    payload?: Record<string, unknown>
  },
): Promise<WorkspaceIntegrationAuditLog> {
  const result = await db.query<WorkspaceIntegrationAuditLogRow>(
    `INSERT INTO workspace_integration_audit_logs (
      id,
      workspace_id,
      provider,
      connection_id,
      actor_user_id,
      action,
      status,
      summary,
      payload,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, NOW()
    )
    RETURNING
      id,
      workspace_id,
      provider,
      connection_id,
      actor_user_id,
      action,
      status,
      summary,
      payload,
      created_at::TEXT`,
    [
      randomUUID(),
      input.workspaceId,
      input.provider,
      normalizeString(input.connectionId) || null,
      normalizeString(input.actorUserId) || null,
      normalizeString(input.action),
      normalizeAuditStatus(input.status),
      normalizeString(input.summary),
      JSON.stringify(sanitizeWorkspaceIntegrationAuditPayload(input.payload || {})),
    ],
  )
  return normalizeAuditLog(result.rows[0]!)
}

export async function listWorkspaceIntegrationAuditLogs(
  db: Queryable,
  input: {
    workspaceId: string
    provider: WorkspaceIntegrationProvider
    limit?: number
  },
): Promise<WorkspaceIntegrationAuditLog[]> {
  const limit = Math.max(1, Math.min(50, normalizeCount(input.limit) || 20))
  const result = await db.query<WorkspaceIntegrationAuditLogRow>(
    `SELECT
      id,
      workspace_id,
      provider,
      connection_id,
      actor_user_id,
      action,
      status,
      summary,
      payload,
      created_at::TEXT
     FROM workspace_integration_audit_logs
     WHERE workspace_id = $1
       AND provider = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.workspaceId, input.provider, limit],
  )
  return result.rows.map(normalizeAuditLog)
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
  const [jobResult, refResult, auditResult] = connectionId
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
        db.query<WorkspaceIntegrationAuditLogRow>(
          `SELECT
            id,
            workspace_id,
            provider,
            connection_id,
            actor_user_id,
            action,
            status,
            summary,
            payload,
            created_at::TEXT
           FROM workspace_integration_audit_logs
           WHERE workspace_id = $1
             AND provider = 'feishu'
           ORDER BY created_at DESC
           LIMIT 20`,
          [workspaceId],
        ),
      ])
    : [{ rows: [] as WorkspaceIntegrationImportJobRow[] }, { rows: [] as WorkspaceExternalResourceRefRow[] }, { rows: [] as WorkspaceIntegrationAuditLogRow[] }]

  const snapshotBase = {
    provider: 'feishu',
    connected: summary.connected,
    connection: summary.connection || null,
    policy: summary.policy || null,
    importJobs: jobResult.rows.map(normalizeImportJob),
    externalResources: refResult.rows.map(normalizeExternalResourceRef),
  }
  const diagnosticSummary = buildWorkspaceFeishuDiagnosticSummary(snapshotBase)
  return {
    ...snapshotBase,
    auditLogs: auditResult.rows.map(normalizeAuditLog),
    diagnosticSummary,
    memberSyncSummary: diagnosticSummary.memberSyncSummary,
    autoLoginSummary: diagnosticSummary.autoLoginSummary,
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
  await recordWorkspaceIntegrationAuditLog(db, {
    workspaceId: input.workspaceId,
    provider: 'feishu',
    connectionId: snapshot.connection?.id || null,
    actorUserId: input.actorUserId,
    action: 'feishu.install_session.created',
    status: input.appTicketConfigured ? 'success' : 'warning',
    summary: input.appTicketConfigured ? '已创建飞书安装会话。' : '已创建飞书安装会话，但平台 app_ticket 尚未就绪。',
    payload: {
      expiresAt,
      hasMarketplaceAppUrl: Boolean(input.marketplaceAppUrl),
      appTicketConfigured: Boolean(input.appTicketConfigured),
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
  const snapshot = await upsertFeishuWorkspaceConnection(db, {
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
  await recordWorkspaceIntegrationAuditLog(db, {
    workspaceId: input.workspaceId,
    provider: 'feishu',
    connectionId: snapshot.connection?.id || null,
    actorUserId: input.actorUserId,
    action: 'feishu.claim.connected',
    status: 'success',
    summary: '飞书租户已认领并通过 token 健康检查。',
    payload: {
      tenantKeyConfigured: Boolean(normalizeString(input.tenantKey)),
      tenantName: normalizeString(input.tenantName),
    },
  })
  return getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
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
  const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
  if (input.tokenHealth !== 'ok') {
    await recordWorkspaceIntegrationAuditLog(db, {
      workspaceId: input.workspaceId,
      provider: 'feishu',
      connectionId: snapshot.connection?.id || null,
      actorUserId: input.actorUserId || null,
      action: 'feishu.token.failed',
      status: input.tokenHealth === 'tenant_token_failed' ? 'error' : 'warning',
      summary: `飞书租户 token 检查失败：${input.tokenHealth}`,
      payload: {
        tokenHealth: input.tokenHealth,
        connectionStatus: input.status,
        message: normalizeString(input.lastError),
      },
    })
  }
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
  const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, input.workspaceId)
  await recordWorkspaceIntegrationAuditLog(db, {
    workspaceId: input.workspaceId,
    provider: 'feishu',
    connectionId: snapshot.connection?.id || null,
    actorUserId: input.actorUserId,
    action: 'feishu.connection.disabled',
    status: 'warning',
    summary: '已断开飞书第三方平台连接。',
    payload: {
      connectionStatus: snapshot.connection?.status || '',
    },
  })
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
  const result = await db.query<{ id: string, workspace_id: string }>(
    `UPDATE workspace_integration_connections
     SET status = $2,
         tenant_name = COALESCE(NULLIF($3, ''), tenant_name),
         last_error = $4,
         disconnected_at = CASE WHEN $2 IN ('disabled', 'uninstalled') THEN NOW() ELSE disconnected_at END,
         updated_at = NOW()
     WHERE provider = 'feishu'
       AND tenant_key = $1
     RETURNING id, workspace_id`,
    [
      normalizeString(input.tenantKey),
      input.status,
      normalizeString(input.tenantName),
      normalizeString(input.lastError),
    ],
  )
  for (const row of result.rows) {
    await recordWorkspaceIntegrationAuditLog(db, {
      workspaceId: row.workspace_id,
      provider: 'feishu',
      connectionId: row.id,
      actorUserId: null,
      action: input.status === 'uninstalled' ? 'feishu.connection.uninstalled' : 'feishu.connection.status_updated',
      status: input.status === 'connected' ? 'success' : 'warning',
      summary: input.status === 'uninstalled' ? '飞书租户已卸载 WinLoop。' : `飞书租户连接状态已更新为 ${input.status}。`,
      payload: {
        connectionStatus: input.status,
        tenantName: normalizeString(input.tenantName),
        message: normalizeString(input.lastError),
      },
    })
  }
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

function resolveCandidateWorkspaceRole(
  candidate: WorkspaceFeishuDirectoryUserCandidate,
  policy: WorkspaceIntegrationSyncPolicy,
): Extract<WorkspaceMemberRole, 'admin' | 'manager' | 'member'> {
  const unionId = normalizeString(candidate.unionId)
  const role = policy.userIds.includes(unionId)
    ? policy.roleMappings[unionId]
    : ''
  return role === 'admin' || role === 'manager' || role === 'member'
    ? role
    : policy.defaultWorkspaceRole || 'member'
}

function hasAppliedRoleMapping(candidate: WorkspaceFeishuDirectoryUserCandidate, policy: WorkspaceIntegrationSyncPolicy): boolean {
  const unionId = normalizeString(candidate.unionId)
  return Boolean(unionId && policy.userIds.includes(unionId) && policy.roleMappings[unionId])
}

function buildRoleMappingIgnoredCount(policy: WorkspaceIntegrationSyncPolicy | null, candidates: WorkspaceFeishuDirectoryUserCandidate[]): number {
  if (!policy)
    return 0
  const candidateUnionIds = new Set(candidates.map(candidate => normalizeString(candidate.unionId)).filter(Boolean))
  return Object.keys(policy.roleMappings || {})
    .filter((unionId) => {
      const normalizedUnionId = normalizeString(unionId)
      return normalizedUnionId && (!policy.userIds.includes(normalizedUnionId) || !candidateUnionIds.has(normalizedUnionId))
    })
    .length
}

function pushDiagnostic(
  diagnostics: WorkspaceFeishuMemberSyncDiagnostic[],
  input: WorkspaceFeishuMemberSyncDiagnostic,
): void {
  const existing = diagnostics.find(item => item.code === input.code && (input.unionId ? item.unionId === input.unionId : !item.unionId))
  if (existing) {
    existing.count = (existing.count || 1) + (input.count || 1)
    return
  }
  diagnostics.push({
    ...input,
    count: input.count || 1,
  })
}

function normalizeFeishuAssignableWorkspaceRole(value: unknown): Extract<WorkspaceMemberRole, 'admin' | 'manager' | 'member'> {
  const role = normalizeString(value)
  if (role === 'admin' || role === 'manager' || role === 'member')
    return role
  return 'member'
}

function buildAutoJoinCandidate(
  profile: FeishuOAuthLoginProfile,
  identityProfile: Record<string, unknown>,
): WorkspaceFeishuDirectoryUserCandidate {
  return {
    openId: normalizeString(profile.openId) || normalizeString(identityProfile.openId),
    unionId: normalizeString(profile.unionId) || normalizeString(identityProfile.unionId),
    name: normalizeString(profile.name) || normalizeString(profile.enName) || normalizeString(identityProfile.name),
    email: normalizeString(profile.email) || normalizeString(identityProfile.email),
    mobile: normalizeString(profile.mobile) || normalizeString(identityProfile.mobile),
    avatarUrl: normalizeString(profile.avatarUrl) || normalizeString(identityProfile.avatarUrl),
    departmentIds: uniqueStringArray(identityProfile.departmentIds),
    groupIds: uniqueStringArray(identityProfile.groupIds),
  }
}

function isAutoJoinPolicyMatched(
  candidate: WorkspaceFeishuDirectoryUserCandidate,
  policy: Pick<WorkspaceIntegrationSyncPolicy, 'userIds' | 'departmentIds' | 'groupIds'>,
): boolean {
  return isCandidateWhitelisted(candidate, {
    id: '',
    connectionId: '',
    memberSyncMode: 'whitelist',
    autoLoginEnabled: true,
    defaultWorkspaceRole: 'member',
    roleMappings: {},
    lastPreviewAt: null,
    lastSyncAt: null,
    lastSyncResult: {},
    createdAt: '',
    updatedAt: '',
    ...policy,
  })
}

function resolveAutoJoinWorkspaceRole(
  candidate: WorkspaceFeishuDirectoryUserCandidate,
  policy: Pick<WorkspaceIntegrationSyncPolicy, 'userIds' | 'roleMappings' | 'defaultWorkspaceRole'>,
): Extract<WorkspaceMemberRole, 'admin' | 'manager' | 'member'> {
  const unionId = normalizeString(candidate.unionId)
  const explicitRole = policy.userIds.includes(unionId)
    ? policy.roleMappings[unionId]
    : ''
  return normalizeFeishuAssignableWorkspaceRole(explicitRole || policy.defaultWorkspaceRole)
}

async function readFeishuIdentityProfile(
  db: Queryable,
  unionId: string,
): Promise<Record<string, unknown>> {
  if (!unionId)
    return {}
  const result = await db.query<{ profile_json: unknown }>(
    `SELECT profile_json
     FROM auth_identities
     WHERE provider = 'feishu'
       AND provider_user_id = $1
     LIMIT 1`,
    [unionId],
  )
  return normalizeRecord(result.rows[0]?.profile_json)
}

async function writeFeishuAutoJoinResult(
  db: Queryable,
  connectionId: string,
  result: {
    joined: boolean
    diagnostics: WorkspaceFeishuMemberSyncDiagnostic[]
  },
): Promise<void> {
  if (!connectionId)
    return
  await db.query(
    `UPDATE workspace_integration_sync_policies
     SET last_sync_result = COALESCE(last_sync_result, '{}'::JSONB) || $2::JSONB,
         updated_at = NOW()
     WHERE connection_id = $1`,
    [
      connectionId,
      JSON.stringify({
        autoLogin: {
          joined: result.joined,
          diagnostics: result.diagnostics,
          checkedAt: new Date().toISOString(),
        },
      }),
    ],
  )
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
    actorUserId?: string
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
  let roleMappingAppliedCount = 0
  const diagnostics: WorkspaceFeishuMemberSyncDiagnostic[] = []

  for (const candidate of candidates) {
    const unionId = normalizeString(candidate.unionId)
    if (!isCandidateWhitelisted(candidate, policy)) {
      skipCount += 1
      pushDiagnostic(diagnostics, {
        code: 'not_whitelisted',
        message: '飞书成员未命中当前工作空间白名单。',
        unionId,
      })
      continue
    }

    whitelistedCount += 1
    if (policy && hasAppliedRoleMapping(candidate, policy))
      roleMappingAppliedCount += 1
    if (existing.has(unionId)) {
      updateCount += 1
      continue
    }

    if (await hasEmailConflict(db, normalizeString(candidate.email), unionId)) {
      conflictCount += 1
      pushDiagnostic(diagnostics, {
        code: 'email_conflict',
        message: '邮箱已被其他飞书身份使用，需用户主动绑定确认。',
        unionId,
      })
      continue
    }
    createCount += 1
  }

  const ignoredRoleMappings = buildRoleMappingIgnoredCount(policy, candidates)
  if (ignoredRoleMappings > 0) {
    pushDiagnostic(diagnostics, {
      code: 'role_mapping_ignored',
      message: '部分角色映射未命中显式用户白名单，已忽略。',
      count: ignoredRoleMappings,
    })
  }

  await db.query(
    `UPDATE workspace_integration_sync_policies
     SET last_preview_at = NOW(),
         updated_at = NOW()
     WHERE connection_id = $1`,
    [connectionRow?.id || ''],
  )

  const preview: WorkspaceFeishuMemberSyncPreview = {
    totalCandidates: candidates.length,
    whitelistedCount,
    createCount,
    updateCount,
    skipCount,
    conflictCount,
    seatRequired: createCount,
    seatFailedCount: 0,
    roleMappingAppliedCount,
    diagnostics: policy
      ? diagnostics
      : [{ code: 'feishu_policy_missing', message: '飞书成员同步策略尚未配置。', count: 1 }],
  }
  if (input.actorUserId) {
    await recordWorkspaceIntegrationAuditLog(db, {
      workspaceId: input.workspaceId,
      provider: 'feishu',
      connectionId: connectionRow?.id || null,
      actorUserId: input.actorUserId,
      action: 'feishu.member_sync.previewed',
      status: preview.conflictCount > 0 || preview.skipCount > 0 ? 'warning' : 'success',
      summary: `飞书成员同步预览：新增 ${preview.createCount}，更新 ${preview.updateCount}，冲突 ${preview.conflictCount}。`,
      payload: {
        totalCandidates: preview.totalCandidates,
        whitelistedCount: preview.whitelistedCount,
        createCount: preview.createCount,
        updateCount: preview.updateCount,
        skipCount: preview.skipCount,
        conflictCount: preview.conflictCount,
        seatRequired: preview.seatRequired,
        roleMappingAppliedCount: preview.roleMappingAppliedCount,
        diagnosticSamples: preview.diagnostics.slice(0, 5),
      },
    })
  }
  return preview
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
    actorUserId?: string
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
  const diagnostics: WorkspaceFeishuMemberSyncDiagnostic[] = [...(preview.diagnostics || [])]
  const now = new Date().toISOString()
  let seatFailedCount = 0
  let roleMappingAppliedCount = 0

  for (const candidate of candidates) {
    const unionId = normalizeString(candidate.unionId)
    if (!unionId)
      continue
    if (!existing.has(unionId) && await hasEmailConflict(db, normalizeString(candidate.email), unionId))
      continue

    let userId = existing.get(unionId)?.user_id || ''
    let created = false
    if (!userId) {
      userId = randomUUID()
      const username = await resolveUniqueUsername(db, candidate)
      await db.query(
        `INSERT INTO users (id, username, password_hash, avatar_url, is_platform_admin, is_disabled, created_at, updated_at)
         VALUES ($1, $2, '', $3, FALSE, FALSE, $4, $4)`,
        [userId, username, normalizeString(candidate.avatarUrl) || null, now],
      )
      created = true
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
    try {
      await teamEnsureWorkspaceMember(db, input.workspaceId, userId, resolveCandidateWorkspaceRole(candidate, policy))
    }
    catch (error) {
      if (error instanceof Error && error.message === 'TEAM_SEAT_LIMIT_REACHED') {
        seatFailedCount += 1
        pushDiagnostic(diagnostics, {
          code: 'seat_limit_exceeded',
          message: '工作空间席位不足，该成员未加入工作空间。',
          unionId,
        })
        continue
      }
      throw error
    }
    if (hasAppliedRoleMapping(candidate, policy))
      roleMappingAppliedCount += 1
    if (created)
      createdUserIds.push(userId)
    else
      updatedUserIds.push(userId)
  }

  const result: WorkspaceFeishuMemberSyncResult = {
    ...preview,
    seatFailedCount,
    roleMappingAppliedCount,
    diagnostics,
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
  if (input.actorUserId) {
    await recordWorkspaceIntegrationAuditLog(db, {
      workspaceId: input.workspaceId,
      provider: 'feishu',
      connectionId: connectionRow.id,
      actorUserId: input.actorUserId,
      action: 'feishu.member_sync.completed',
      status: result.seatFailedCount || result.conflictCount ? 'warning' : 'success',
      summary: `飞书成员同步完成：创建 ${result.createdUserIds.length}，更新 ${result.updatedUserIds.length}，席位失败 ${result.seatFailedCount || 0}。`,
      payload: {
        totalCandidates: result.totalCandidates,
        createCount: result.createCount,
        updateCount: result.updateCount,
        skipCount: result.skipCount,
        conflictCount: result.conflictCount,
        seatFailedCount: result.seatFailedCount || 0,
        roleMappingAppliedCount: result.roleMappingAppliedCount || 0,
        createdCount: result.createdUserIds.length,
        updatedCount: result.updatedUserIds.length,
        diagnosticSamples: result.diagnostics.slice(0, 5),
      },
    })
  }
  return result
}

export async function applyFeishuWorkspaceAutoJoin(
  db: Queryable,
  profile: FeishuOAuthLoginProfile,
  userId: string,
): Promise<FeishuWorkspaceAutoJoinResult> {
  const unionId = normalizeString(profile.unionId)
  const normalizedUserId = normalizeString(userId)
  if (!unionId || !normalizedUserId) {
    return {
      joinedWorkspaceIds: [],
      diagnostics: [],
    }
  }

  const identityProfile = await readFeishuIdentityProfile(db, unionId)
  const candidate = buildAutoJoinCandidate(profile, identityProfile)
  const identityTenantKey = normalizeString(identityProfile.tenantKey)
  const policyRows = await db.query<FeishuAutoJoinPolicyRow>(
    `SELECT
       c.workspace_id,
       c.id AS connection_id,
       c.tenant_key,
       p.user_ids,
       p.department_ids,
       p.group_ids,
       p.role_mappings,
       p.default_workspace_role
     FROM workspace_integration_connections c
     JOIN workspace_integration_sync_policies p ON p.connection_id = c.id
     WHERE c.provider = 'feishu'
       AND c.status = 'connected'
       AND p.auto_login_enabled = TRUE`,
  )

  const joinedWorkspaceIds: string[] = []
  const diagnostics: WorkspaceFeishuMemberSyncDiagnostic[] = []

  for (const row of policyRows.rows) {
    if (identityTenantKey && normalizeString(row.tenant_key) && normalizeString(row.tenant_key) !== identityTenantKey)
      continue

    const policy = {
      userIds: uniqueStringArray(row.user_ids),
      departmentIds: uniqueStringArray(row.department_ids),
      groupIds: uniqueStringArray(row.group_ids),
      roleMappings: normalizeRecord(row.role_mappings) as WorkspaceIntegrationSyncPolicy['roleMappings'],
      defaultWorkspaceRole: normalizeFeishuAssignableWorkspaceRole(row.default_workspace_role),
    }

    if (!isAutoJoinPolicyMatched(candidate, policy)) {
      const diagnostic: WorkspaceFeishuMemberSyncDiagnostic = {
        code: 'not_whitelisted',
        message: '飞书登录身份未命中工作空间自动加入策略。',
        count: 1,
        unionId,
      }
      pushDiagnostic(diagnostics, {
        ...diagnostic,
      })
      await writeFeishuAutoJoinResult(db, row.connection_id, {
        joined: false,
        diagnostics: [diagnostic],
      })
      await recordWorkspaceIntegrationAuditLog(db, {
        workspaceId: row.workspace_id,
        provider: 'feishu',
        connectionId: row.connection_id,
        actorUserId: normalizedUserId,
        action: 'feishu.auto_login.checked',
        status: 'info',
        summary: '飞书登录未命中该工作空间自动加入策略。',
        payload: {
          joined: false,
          reason: 'not_whitelisted',
          diagnosticSamples: [diagnostic],
        },
      })
      continue
    }

    const workspaceDiagnostics: WorkspaceFeishuMemberSyncDiagnostic[] = []
    try {
      await teamEnsureWorkspaceMember(
        db,
        row.workspace_id,
        normalizedUserId,
        resolveAutoJoinWorkspaceRole(candidate, policy),
      )
      joinedWorkspaceIds.push(row.workspace_id)
      await writeFeishuAutoJoinResult(db, row.connection_id, {
        joined: true,
        diagnostics: [],
      })
      await recordWorkspaceIntegrationAuditLog(db, {
        workspaceId: row.workspace_id,
        provider: 'feishu',
        connectionId: row.connection_id,
        actorUserId: normalizedUserId,
        action: 'feishu.auto_login.checked',
        status: 'success',
        summary: '飞书登录已自动加入工作空间。',
        payload: {
          joined: true,
          role: resolveAutoJoinWorkspaceRole(candidate, policy),
          diagnosticSamples: [],
        },
      })
    }
    catch (error) {
      if (error instanceof Error && error.message === 'TEAM_SEAT_LIMIT_REACHED') {
        const diagnostic: WorkspaceFeishuMemberSyncDiagnostic = {
          code: 'seat_limit_exceeded',
          message: '工作空间席位不足，飞书登录未自动加入该工作空间。',
          count: 1,
          unionId,
        }
        workspaceDiagnostics.push(diagnostic)
        pushDiagnostic(diagnostics, diagnostic)
        await writeFeishuAutoJoinResult(db, row.connection_id, {
          joined: false,
          diagnostics: workspaceDiagnostics,
        })
        await recordWorkspaceIntegrationAuditLog(db, {
          workspaceId: row.workspace_id,
          provider: 'feishu',
          connectionId: row.connection_id,
          actorUserId: normalizedUserId,
          action: 'feishu.auto_login.checked',
          status: 'warning',
          summary: '工作空间席位不足，飞书登录未自动加入。',
          payload: {
            joined: false,
            reason: 'seat_limit_exceeded',
            diagnosticSamples: workspaceDiagnostics.slice(0, 5),
          },
        })
        continue
      }

      const diagnostic: WorkspaceFeishuMemberSyncDiagnostic = {
        code: 'token_failed',
        message: error instanceof Error ? error.message : '飞书登录自动加入失败。',
        count: 1,
        unionId,
      }
      workspaceDiagnostics.push(diagnostic)
      pushDiagnostic(diagnostics, diagnostic)
      await writeFeishuAutoJoinResult(db, row.connection_id, {
        joined: false,
        diagnostics: workspaceDiagnostics,
      })
      await recordWorkspaceIntegrationAuditLog(db, {
        workspaceId: row.workspace_id,
        provider: 'feishu',
        connectionId: row.connection_id,
        actorUserId: normalizedUserId,
        action: 'feishu.auto_login.checked',
        status: 'error',
        summary: '飞书登录自动加入失败。',
        payload: {
          joined: false,
          reason: 'error',
          diagnosticSamples: workspaceDiagnostics.slice(0, 5),
        },
      })
    }
  }

  return {
    joinedWorkspaceIds,
    diagnostics,
  }
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
