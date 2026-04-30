import type {
  FeishuBitableSyncConfigPackage,
  FeishuBitableSyncConfigShare,
} from '~~/shared/types/domain'
import type { Queryable } from '~~/server/utils/db'
import { randomBytes, randomUUID } from 'node:crypto'
import { buildServerAppUrl } from '~~/server/utils/api-url'
import { normalizeFeishuBitableSyncConfigPackage } from '~~/server/utils/feishu-bitable-sync-config-package'

interface FeishuBitableSyncConfigShareRow {
  id: string
  source_sync_id: string
  share_key: string
  package_json: Record<string, unknown>
  expires_at: string
  revoked_at: string | null
  created_by_user_id: string | null
  revoked_by_user_id: string | null
  created_at: string
  updated_at: string
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function createShareKey(): string {
  return randomBytes(20).toString('hex')
}

function resolveExpiresAt(expiresInDays = 30): string {
  const safeDays = Math.min(365, Math.max(1, Math.trunc(Number(expiresInDays || 30))))
  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString()
}

function mapShare(row: FeishuBitableSyncConfigShareRow): FeishuBitableSyncConfigShare {
  return {
    id: row.id,
    sourceSyncId: row.source_sync_id,
    shareKey: row.share_key,
    shareUrl: buildServerAppUrl(`/api/feishu/bitable-sync-config/${row.share_key}`),
    package: normalizeFeishuBitableSyncConfigPackage(row.package_json),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdByUserId: row.created_by_user_id,
    revokedByUserId: row.revoked_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createFeishuBitableSyncConfigShare(
  db: Queryable,
  input: {
    sourceSyncId: string
    actorUserId: string
    package: FeishuBitableSyncConfigPackage
    expiresInDays?: number
  },
): Promise<FeishuBitableSyncConfigShare> {
  const sourceSyncId = toText(input.sourceSyncId)
  if (!sourceSyncId)
    throw new Error('sourceSyncId 不能为空')

  await db.query(
    `UPDATE feishu_bitable_sync_config_shares
     SET revoked_at = NOW(),
         revoked_by_user_id = $2,
         updated_at = NOW()
     WHERE source_sync_id = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [sourceSyncId, input.actorUserId],
  )

  const result = await db.query<FeishuBitableSyncConfigShareRow>(
    `INSERT INTO feishu_bitable_sync_config_shares (
       id,
       source_sync_id,
       share_key,
       package_json,
       expires_at,
       created_by_user_id,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4::JSONB, $5, $6, NOW(), NOW()
     )
     RETURNING
       id,
       source_sync_id,
       share_key,
       package_json,
       expires_at::TEXT,
       revoked_at::TEXT,
       created_by_user_id,
       revoked_by_user_id,
       created_at::TEXT,
       updated_at::TEXT`,
    [
      randomUUID(),
      sourceSyncId,
      createShareKey(),
      JSON.stringify(normalizeFeishuBitableSyncConfigPackage(input.package)),
      resolveExpiresAt(input.expiresInDays),
      input.actorUserId,
    ],
  )

  return mapShare(result.rows[0]!)
}

export async function getActiveFeishuBitableSyncConfigShareByKey(
  db: Queryable,
  shareKey: string,
): Promise<FeishuBitableSyncConfigShare | null> {
  const result = await db.query<FeishuBitableSyncConfigShareRow>(
    `SELECT
       id,
       source_sync_id,
       share_key,
       package_json,
       expires_at::TEXT,
       revoked_at::TEXT,
       created_by_user_id,
       revoked_by_user_id,
       created_at::TEXT,
       updated_at::TEXT
     FROM feishu_bitable_sync_config_shares
     WHERE share_key = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [toText(shareKey)],
  )
  const row = result.rows[0]
  return row ? mapShare(row) : null
}

export async function revokeFeishuBitableSyncConfigShare(
  db: Queryable,
  input: {
    sourceSyncId: string
    actorUserId: string
    shareKey?: string
  },
): Promise<{ revokedCount: number }> {
  const sourceSyncId = toText(input.sourceSyncId)
  const shareKey = toText(input.shareKey)
  const result = await db.query<{ id: string }>(
    `UPDATE feishu_bitable_sync_config_shares
     SET revoked_at = NOW(),
         revoked_by_user_id = $2,
         updated_at = NOW()
     WHERE source_sync_id = $1
       AND revoked_at IS NULL
       AND ($3::TEXT = '' OR share_key = $3)
     RETURNING id`,
    [sourceSyncId, input.actorUserId, shareKey],
  )
  return {
    revokedCount: result.rows.length,
  }
}
