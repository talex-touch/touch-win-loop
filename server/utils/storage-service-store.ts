import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings, RuntimeStorageChannel, RuntimeStorageProvider } from '~~/server/utils/env'
import { normalizeRuntimeStorageSettings } from '~~/server/utils/env'

export const STORAGE_WATERMARK_DEFAULT_PERCENT = 90

interface StorageUsageRow {
  channel_id: string
  provider: string
  workspace_id: string
  workspace_name: string | null
  object_count: string
  used_bytes: string
}

interface StorageTrafficTrendRow {
  day: string
  upload_bytes: string
  download_bytes: string
  upload_count: string
  download_count: string
}

interface StorageUserTrafficRow {
  user_id: string
  username: string | null
  download_bytes: string
  download_count: string
}

interface StorageWorkspaceTrafficRow {
  workspace_id: string
  workspace_name: string | null
  upload_bytes: string
  download_bytes: string
  upload_count: string
  download_count: string
}

interface StorageObjectUsage {
  channelId: string
  provider: string
  workspaceId: string
  workspaceName: string
  objectCount: number
  usedBytes: number
}

export interface StorageChannelUsage {
  channelId: string
  name: string
  provider: RuntimeStorageProvider
  enabled: boolean
  priority: number
  capacityBytes: number
  watermarkPercent: number
  usedBytes: number
  objectCount: number
  usagePercent: number
  watermarkBytes: number
  writeAvailable: boolean
}

export interface StorageServiceOverviewPayload {
  config: {
    primaryChannelId: string
    configSource: 'env' | 'override'
    updatedAt: string
    updatedByUserId: string
    channels: Array<StorageChannelConfigPayload>
  }
  overview: {
    totalUsedBytes: number
    totalObjectCount: number
    activeChannelId: string
    activeProvider: string
    channelCount: number
    enabledChannelCount: number
    uploadBytes30d: number
    downloadBytes30d: number
  }
  channels: StorageChannelUsage[]
  distribution: Array<{
    channelId: string
    name: string
    provider: string
    usedBytes: number
    percent: number
  }>
  trends: StorageTrendPoint[]
  topUsers: Array<{
    userId: string
    username: string
    downloadBytes: number
    downloadCount: number
  }>
  topWorkspaces: Array<{
    workspaceId: string
    workspaceName: string
    storageBytes: number
    uploadBytes: number
    downloadBytes: number
    uploadCount: number
    downloadCount: number
  }>
}

export interface StorageChannelConfigPayload {
  id: string
  name: string
  provider: RuntimeStorageProvider
  enabled: boolean
  priority: number
  capacityBytes: number
  watermarkPercent: number
  localRoot: string
  endpoint: string
  region: string
  bucket: string
  accessKeyConfigured: boolean
  secretKeyConfigured: boolean
  forcePathStyle: boolean
}

export interface StorageTrendPoint {
  date: string
  uploadBytes: number
  downloadBytes: number
  uploadCount: number
  downloadCount: number
}

export interface StorageWriteSelection {
  channel: RuntimeStorageChannel
  usedBytes: number
  watermarkBytes: number
  projectedBytes: number
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function jsonTextBigintSql(expression: string): string {
  return `CASE WHEN ${expression} ~ '^[0-9]+$' THEN (${expression})::BIGINT ELSE 0 END`
}

function normalizeChannelId(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function normalizeProvider(value: unknown): RuntimeStorageProvider {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 's3' || normalized === 'minio')
    return normalized
  return 'local'
}

function normalizeWatermarkPercent(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return STORAGE_WATERMARK_DEFAULT_PERCENT
  return Math.max(1, Math.min(100, Math.trunc(parsed)))
}

function normalizeCapacityBytes(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.trunc(parsed))
}

function normalizeChannelDraft(raw: unknown, existing?: RuntimeStorageChannel | null): RuntimeStorageChannel {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}
  const provider = normalizeProvider(source.provider ?? existing?.provider)
  const id = normalizeChannelId(source.id, existing?.id || (provider === 'local' ? 'local' : provider))
  const resolvedProvider = id === 'local' ? 'local' : provider
  return {
    id,
    name: normalizeString(source.name ?? existing?.name) || id,
    provider: resolvedProvider,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : (existing?.enabled ?? true),
    priority: Math.max(0, Math.trunc(Number(source.priority ?? existing?.priority ?? 0))),
    capacityBytes: normalizeCapacityBytes(source.capacityBytes ?? existing?.capacityBytes),
    watermarkPercent: normalizeWatermarkPercent(source.watermarkPercent ?? existing?.watermarkPercent),
    localRoot: normalizeString(source.localRoot ?? existing?.localRoot) || './tmp/document-storage',
    endpoint: resolvedProvider === 'local' ? '' : normalizeString(source.endpoint ?? existing?.endpoint).replace(/\/+$/g, ''),
    region: resolvedProvider === 'local' ? '' : normalizeString(source.region ?? existing?.region),
    bucket: resolvedProvider === 'local' ? '' : normalizeString(source.bucket ?? existing?.bucket),
    accessKey: resolvedProvider === 'local'
      ? ''
      : Object.prototype.hasOwnProperty.call(source, 'accessKey')
        ? String(source.accessKey || '')
        : (existing?.accessKey || ''),
    secretKey: resolvedProvider === 'local'
      ? ''
      : Object.prototype.hasOwnProperty.call(source, 'secretKey')
        ? String(source.secretKey || '')
        : (existing?.secretKey || ''),
    forcePathStyle: resolvedProvider === 'local' ? true : typeof source.forcePathStyle === 'boolean' ? source.forcePathStyle : (existing?.forcePathStyle ?? true),
  }
}

function channelToConfigPayload(channel: RuntimeStorageChannel): StorageChannelConfigPayload {
  return {
    id: channel.id,
    name: channel.name,
    provider: channel.provider,
    enabled: channel.enabled,
    priority: channel.priority,
    capacityBytes: channel.capacityBytes,
    watermarkPercent: channel.watermarkPercent,
    localRoot: channel.localRoot,
    endpoint: channel.endpoint,
    region: channel.region,
    bucket: channel.bucket,
    accessKeyConfigured: Boolean(channel.accessKey),
    secretKeyConfigured: Boolean(channel.secretKey),
    forcePathStyle: channel.forcePathStyle,
  }
}

function compareStorageWriteChannels(
  storage: RuntimeSettings['storage'],
  left: RuntimeStorageChannel,
  right: RuntimeStorageChannel,
): number {
  if (left.id === storage.primaryChannelId)
    return -1
  if (right.id === storage.primaryChannelId)
    return 1
  return left.priority - right.priority || left.id.localeCompare(right.id)
}

function sortStorageChannelsForFallback(
  storage: RuntimeSettings['storage'],
): RuntimeStorageChannel[] {
  return [...storage.channels].sort((left, right) => compareStorageWriteChannels(storage, left, right))
}

function resolveUsageChannelId(
  storage: RuntimeSettings['storage'],
  rawChannelId: string,
  rawProvider: string,
): string {
  const channelId = normalizeString(rawChannelId) || 'local'
  const provider = normalizeString(rawProvider)
  const channels = sortStorageChannelsForFallback(storage)
  if (channels.some(channel => channel.id === channelId))
    return channelId

  const legacyProviderMatch = channels.find(channel => channel.provider === channelId)
  if (legacyProviderMatch)
    return legacyProviderMatch.id

  if (provider) {
    const providerIdMatch = channels.find(channel => channel.id === provider)
    if (providerIdMatch)
      return providerIdMatch.id
    const providerMatch = channels.find(channel => channel.provider === provider)
    if (providerMatch)
      return providerMatch.id
  }

  return channelId
}

function resolveUsageProvider(
  storage: RuntimeSettings['storage'],
  channelId: string,
  rawProvider: string,
): string {
  const channel = storage.channels.find(item => item.id === channelId)
  if (channel)
    return channel.provider
  return normalizeString(rawProvider) || channelId || 'local'
}

function resolveStorageObjectUsage(
  storage: RuntimeSettings['storage'],
  usage: StorageObjectUsage,
): StorageObjectUsage {
  const channelId = resolveUsageChannelId(storage, usage.channelId, usage.provider)
  return {
    ...usage,
    channelId,
    provider: resolveUsageProvider(storage, channelId, usage.provider),
  }
}

export function normalizeStoragePoolDraft(
  runtime: RuntimeSettings,
  input: {
    primaryChannelId?: unknown
    channels?: unknown[]
  },
): RuntimeSettings['storage'] {
  const current = normalizeRuntimeStorageSettings(runtime.storage)
  const existingById = new Map(current.channels.map(channel => [channel.id, channel]))
  const rawChannels = Array.isArray(input.channels) ? input.channels : current.channels
  const channels = rawChannels.map((raw, index) => {
    const rawId = raw && typeof raw === 'object' ? normalizeChannelId((raw as Record<string, unknown>).id, '') : ''
    return normalizeChannelDraft(raw, existingById.get(rawId) || current.channels[index] || null)
  })
  const hasLocal = channels.some(channel => channel.id === 'local')
  if (!hasLocal) {
    channels.push({
      id: 'local',
      name: '本机存储',
      provider: 'local',
      enabled: true,
      priority: 0,
      capacityBytes: 0,
      watermarkPercent: STORAGE_WATERMARK_DEFAULT_PERCENT,
      localRoot: current.localRoot || './tmp/document-storage',
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      forcePathStyle: true,
    })
  }

  const seen = new Set<string>()
  for (const channel of channels) {
    if (seen.has(channel.id))
      throw new Error(`存储渠道 ID 重复：${channel.id}`)
    seen.add(channel.id)
    if ((channel.provider === 's3' || channel.provider === 'minio') && !channel.bucket)
      throw new Error(`存储渠道 ${channel.name || channel.id} 缺少 Bucket。`)
    if (channel.provider === 'minio' && !channel.endpoint)
      throw new Error(`MinIO 渠道 ${channel.name || channel.id} 缺少 Endpoint。`)
  }

  if (!channels.some(channel => channel.enabled))
    throw new Error('至少需要启用一个存储渠道。')

  const primaryChannelId = normalizeChannelId(input.primaryChannelId, current.primaryChannelId)
  const resolvedPrimary = channels.some(channel => channel.id === primaryChannelId && channel.enabled)
    ? primaryChannelId
    : channels.find(channel => channel.enabled)?.id || 'local'
  return normalizeRuntimeStorageSettings({
    ...current,
    primaryChannelId: resolvedPrimary,
    channels,
  })
}

function buildObjectUsageSql(): string {
  return `
    WITH object_usage AS (
      SELECT
        COALESCE(NULLIF(prd.source_storage_provider, ''), NULLIF(prd.storage_provider, ''), 'local') AS channel_id,
        COALESCE(NULLIF(prd.source_storage_provider, ''), NULLIF(prd.storage_provider, ''), 'local') AS provider,
        COALESCE(p.workspace_id, '') AS workspace_id,
        COALESCE(w.name, '') AS workspace_name,
        prd.source_object_key AS object_key,
        GREATEST(COALESCE(prd.source_file_size, prd.file_size, 0), 0)::BIGINT AS used_bytes
      FROM project_resource_documents prd
      JOIN projects p ON p.id = prd.project_id
      LEFT JOIN workspaces w ON w.id = p.workspace_id
      WHERE COALESCE(prd.source_object_key, '') <> ''

      UNION ALL

      SELECT
        COALESCE(NULLIF(prd.preview_storage_provider, ''), NULLIF(prd.storage_provider, ''), 'local') AS channel_id,
        COALESCE(NULLIF(prd.preview_storage_provider, ''), NULLIF(prd.storage_provider, ''), 'local') AS provider,
        COALESCE(p.workspace_id, '') AS workspace_id,
        COALESCE(w.name, '') AS workspace_name,
        prd.preview_object_key AS object_key,
        GREATEST(COALESCE(prd.preview_file_size, 0), 0)::BIGINT AS used_bytes
      FROM project_resource_documents prd
      JOIN projects p ON p.id = prd.project_id
      LEFT JOIN workspaces w ON w.id = p.workspace_id
      WHERE COALESCE(prd.preview_object_key, '') <> ''
        AND prd.preview_object_key IS DISTINCT FROM prd.source_object_key

      UNION ALL

      SELECT
        COALESCE(NULLIF(crd.storage_provider, ''), 'local') AS channel_id,
        COALESCE(NULLIF(crd.storage_provider, ''), 'local') AS provider,
        '' AS workspace_id,
        '平台资料' AS workspace_name,
        crd.object_key,
        GREATEST(COALESCE(crd.file_size, 0), 0)::BIGINT AS used_bytes
      FROM contest_resource_documents crd
      WHERE COALESCE(crd.object_key, '') <> ''

      UNION ALL

      SELECT
        COALESCE(NULLIF(pr.metadata->>'storageProvider', ''), 'local') AS channel_id,
        COALESCE(NULLIF(pr.metadata->>'storageProvider', ''), 'local') AS provider,
        COALESCE(p.workspace_id, '') AS workspace_id,
        COALESCE(w.name, '') AS workspace_name,
        pr.metadata->>'objectKey' AS object_key,
        GREATEST(${jsonTextBigintSql(`pr.metadata->>'fileSize'`)}, 0)::BIGINT AS used_bytes
      FROM project_resources pr
      JOIN projects p ON p.id = pr.project_id
      LEFT JOIN workspaces w ON w.id = p.workspace_id
      WHERE pr.source = 'upload'
        AND COALESCE(pr.metadata->>'objectKey', '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM project_resource_documents prd
          WHERE prd.project_resource_id = pr.id
        )

      UNION ALL

      SELECT
        COALESCE(NULLIF(v.payload->>'storageProvider', ''), 'local') AS channel_id,
        COALESCE(NULLIF(v.payload->>'storageProvider', ''), 'local') AS provider,
        '' AS workspace_id,
        '画布资源库' AS workspace_name,
        v.payload->>'objectKey' AS object_key,
        GREATEST(${jsonTextBigintSql(`v.payload->>'size'`)}, 0)::BIGINT AS used_bytes
      FROM canvas_library_item_versions v
      WHERE COALESCE(v.payload->>'objectKey', '') <> ''
    )
  `
}

export async function listStorageObjectUsage(db: Queryable): Promise<StorageObjectUsage[]> {
  const result = await db.query<StorageUsageRow>(
    `${buildObjectUsageSql()}
     SELECT
       channel_id,
       provider,
       workspace_id,
       workspace_name,
       COUNT(DISTINCT object_key)::TEXT AS object_count,
       COALESCE(SUM(used_bytes), 0)::TEXT AS used_bytes
     FROM object_usage
     GROUP BY channel_id, provider, workspace_id, workspace_name`,
  )
  return result.rows.map(row => ({
    channelId: normalizeString(row.channel_id) || 'local',
    provider: normalizeString(row.provider) || 'local',
    workspaceId: normalizeString(row.workspace_id),
    workspaceName: normalizeString(row.workspace_name),
    objectCount: toNumber(row.object_count),
    usedBytes: toNumber(row.used_bytes),
  }))
}

export async function getStorageChannelUsedBytes(
  db: Queryable,
  runtime: RuntimeSettings,
): Promise<Map<string, number>> {
  const storage = normalizeRuntimeStorageSettings(runtime.storage)
  const rows = (await listStorageObjectUsage(db)).map(row => resolveStorageObjectUsage(storage, row))
  const result = new Map<string, number>()
  for (const row of rows)
    result.set(row.channelId, (result.get(row.channelId) || 0) + row.usedBytes)
  return result
}

export async function selectStorageWriteChannel(
  db: Queryable,
  runtime: RuntimeSettings,
  incomingBytes: number,
): Promise<StorageWriteSelection> {
  const normalizedStorage = normalizeRuntimeStorageSettings(runtime.storage)
  const usedByChannel = await getStorageChannelUsedBytes(db, {
    ...runtime,
    storage: normalizedStorage,
  })
  const enabledChannels = normalizedStorage.channels
    .filter(channel => channel.enabled)
    .sort((left, right) => compareStorageWriteChannels(normalizedStorage, left, right))

  for (const channel of enabledChannels) {
    const usedBytes = usedByChannel.get(channel.id) || 0
    if (channel.capacityBytes <= 0) {
      return {
        channel,
        usedBytes,
        watermarkBytes: 0,
        projectedBytes: usedBytes + Math.max(0, incomingBytes),
      }
    }
    const watermarkBytes = Math.floor(channel.capacityBytes * (channel.watermarkPercent / 100))
    const projectedBytes = usedBytes + Math.max(0, incomingBytes)
    if (projectedBytes <= watermarkBytes) {
      return {
        channel,
        usedBytes,
        watermarkBytes,
        projectedBytes,
      }
    }
  }

  throw new Error('STORAGE_CAPACITY_EXCEEDED')
}

export async function buildStorageServiceOverview(
  db: Queryable,
  input: {
    runtime: RuntimeSettings
    configSource: 'env' | 'override'
    updatedAt: string
    updatedByUserId: string
  },
): Promise<StorageServiceOverviewPayload> {
  const storage = normalizeRuntimeStorageSettings(input.runtime.storage)
  const [rawObjectUsage, trendRows, userRows, workspaceRows] = await Promise.all([
    listStorageObjectUsage(db),
    db.query<StorageTrafficTrendRow>(
      `SELECT
         TO_CHAR(day, 'YYYY-MM-DD') AS day,
         COALESCE(SUM(CASE WHEN event_code = 'resource.upload' THEN bytes ELSE 0 END), 0)::TEXT AS upload_bytes,
         COALESCE(SUM(CASE WHEN event_code = 'resource.download' THEN bytes ELSE 0 END), 0)::TEXT AS download_bytes,
         COALESCE(SUM(CASE WHEN event_code = 'resource.upload' THEN count_value ELSE 0 END), 0)::TEXT AS upload_count,
         COALESCE(SUM(CASE WHEN event_code = 'resource.download' THEN count_value ELSE 0 END), 0)::TEXT AS download_count
       FROM (
         SELECT
           DATE_TRUNC('day', created_at) AS day,
           event_code,
           GREATEST(${jsonTextBigintSql(`meta->>'bytes'`)}, 0) AS bytes,
           1 AS count_value
         FROM billing_usage_events
         WHERE event_code IN ('resource.upload', 'resource.download')
           AND result = 'success'
           AND created_at >= NOW() - INTERVAL '30 days'
       ) traffic
       GROUP BY day
       ORDER BY day ASC`,
    ),
    db.query<StorageUserTrafficRow>(
      `SELECT
         COALESCE(e.actor_user_id, '') AS user_id,
         COALESCE(u.username, '') AS username,
         COALESCE(SUM(GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0)), 0)::TEXT AS download_bytes,
         COUNT(*)::TEXT AS download_count
       FROM billing_usage_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.event_code = 'resource.download'
         AND e.result = 'success'
         AND e.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY e.actor_user_id, u.username
       ORDER BY SUM(GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0)) DESC, COUNT(*) DESC
       LIMIT 10`,
    ),
    db.query<StorageWorkspaceTrafficRow>(
      `SELECT
         e.workspace_id,
         COALESCE(w.name, '') AS workspace_name,
         COALESCE(SUM(CASE WHEN e.event_code = 'resource.upload' THEN GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0) ELSE 0 END), 0)::TEXT AS upload_bytes,
         COALESCE(SUM(CASE WHEN e.event_code = 'resource.download' THEN GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0) ELSE 0 END), 0)::TEXT AS download_bytes,
         COALESCE(SUM(CASE WHEN e.event_code = 'resource.upload' THEN 1 ELSE 0 END), 0)::TEXT AS upload_count,
         COALESCE(SUM(CASE WHEN e.event_code = 'resource.download' THEN 1 ELSE 0 END), 0)::TEXT AS download_count
       FROM billing_usage_events e
       LEFT JOIN workspaces w ON w.id = e.workspace_id
       WHERE e.event_code IN ('resource.upload', 'resource.download')
         AND e.result = 'success'
         AND e.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY e.workspace_id, w.name
       ORDER BY
         SUM(CASE WHEN e.event_code = 'resource.download' THEN GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0) ELSE 0 END) DESC,
         SUM(CASE WHEN e.event_code = 'resource.upload' THEN GREATEST(${jsonTextBigintSql(`e.meta->>'bytes'`)}, 0) ELSE 0 END) DESC
       LIMIT 10`,
    ),
  ])

  const objectUsage = rawObjectUsage.map(row => resolveStorageObjectUsage(storage, row))
  const usedByChannel = new Map<string, { usedBytes: number, objectCount: number }>()
  const storageByWorkspace = new Map<string, { workspaceName: string, storageBytes: number }>()
  for (const row of objectUsage) {
    const channelUsage = usedByChannel.get(row.channelId) || { usedBytes: 0, objectCount: 0 }
    channelUsage.usedBytes += row.usedBytes
    channelUsage.objectCount += row.objectCount
    usedByChannel.set(row.channelId, channelUsage)

    if (row.workspaceId) {
      const workspaceUsage = storageByWorkspace.get(row.workspaceId) || {
        workspaceName: row.workspaceName || row.workspaceId,
        storageBytes: 0,
      }
      workspaceUsage.storageBytes += row.usedBytes
      storageByWorkspace.set(row.workspaceId, workspaceUsage)
    }
  }

  const totalUsedBytes = [...usedByChannel.values()].reduce((sum, row) => sum + row.usedBytes, 0)
  const channels = storage.channels.map((channel): StorageChannelUsage => {
    const usage = usedByChannel.get(channel.id) || { usedBytes: 0, objectCount: 0 }
    const watermarkBytes = channel.capacityBytes > 0 ? Math.floor(channel.capacityBytes * (channel.watermarkPercent / 100)) : 0
    return {
      channelId: channel.id,
      name: channel.name,
      provider: channel.provider,
      enabled: channel.enabled,
      priority: channel.priority,
      capacityBytes: channel.capacityBytes,
      watermarkPercent: channel.watermarkPercent,
      usedBytes: usage.usedBytes,
      objectCount: usage.objectCount,
      usagePercent: channel.capacityBytes > 0 ? Number(((usage.usedBytes / channel.capacityBytes) * 100).toFixed(2)) : 0,
      watermarkBytes,
      writeAvailable: channel.enabled && (channel.capacityBytes <= 0 || usage.usedBytes < watermarkBytes),
    }
  })

  const trends = trendRows.rows.map(row => ({
    date: row.day,
    uploadBytes: toNumber(row.upload_bytes),
    downloadBytes: toNumber(row.download_bytes),
    uploadCount: toNumber(row.upload_count),
    downloadCount: toNumber(row.download_count),
  }))
  const uploadBytes30d = trends.reduce((sum, row) => sum + row.uploadBytes, 0)
  const downloadBytes30d = trends.reduce((sum, row) => sum + row.downloadBytes, 0)

  const workspaceTraffic = new Map<string, {
    workspaceName: string
    uploadBytes: number
    downloadBytes: number
    uploadCount: number
    downloadCount: number
  }>()
  for (const row of workspaceRows.rows) {
    workspaceTraffic.set(normalizeString(row.workspace_id), {
      workspaceName: normalizeString(row.workspace_name) || normalizeString(row.workspace_id),
      uploadBytes: toNumber(row.upload_bytes),
      downloadBytes: toNumber(row.download_bytes),
      uploadCount: toNumber(row.upload_count),
      downloadCount: toNumber(row.download_count),
    })
  }

  const workspaceIds = new Set([...storageByWorkspace.keys(), ...workspaceTraffic.keys()])
  const topWorkspaces = [...workspaceIds].map((workspaceId) => {
    const storageUsage = storageByWorkspace.get(workspaceId)
    const traffic = workspaceTraffic.get(workspaceId)
    return {
      workspaceId,
      workspaceName: traffic?.workspaceName || storageUsage?.workspaceName || workspaceId,
      storageBytes: storageUsage?.storageBytes || 0,
      uploadBytes: traffic?.uploadBytes || 0,
      downloadBytes: traffic?.downloadBytes || 0,
      uploadCount: traffic?.uploadCount || 0,
      downloadCount: traffic?.downloadCount || 0,
    }
  }).sort((left, right) => {
    return right.storageBytes - left.storageBytes
      || right.downloadBytes - left.downloadBytes
      || right.uploadBytes - left.uploadBytes
  }).slice(0, 10)

  return {
    config: {
      primaryChannelId: storage.primaryChannelId,
      configSource: input.configSource,
      updatedAt: input.updatedAt,
      updatedByUserId: input.updatedByUserId,
      channels: storage.channels.map(channelToConfigPayload),
    },
    overview: {
      totalUsedBytes,
      totalObjectCount: channels.reduce((sum, channel) => sum + channel.objectCount, 0),
      activeChannelId: storage.primaryChannelId,
      activeProvider: storage.provider,
      channelCount: storage.channels.length,
      enabledChannelCount: storage.channels.filter(channel => channel.enabled).length,
      uploadBytes30d,
      downloadBytes30d,
    },
    channels,
    distribution: channels.map(channel => ({
      channelId: channel.channelId,
      name: channel.name,
      provider: channel.provider,
      usedBytes: channel.usedBytes,
      percent: totalUsedBytes > 0 ? Number(((channel.usedBytes / totalUsedBytes) * 100).toFixed(2)) : 0,
    })),
    trends,
    topUsers: userRows.rows.map(row => ({
      userId: normalizeString(row.user_id),
      username: normalizeString(row.username) || normalizeString(row.user_id) || '匿名下载',
      downloadBytes: toNumber(row.download_bytes),
      downloadCount: toNumber(row.download_count),
    })),
    topWorkspaces,
  }
}
