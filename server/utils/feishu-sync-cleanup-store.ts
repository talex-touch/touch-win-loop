import type { Queryable } from '~~/server/utils/db'
import type {
  FeishuBitableSyncCleanupLegacySummary,
  FeishuBitableSyncCleanupManagedDataCounts,
  FeishuBitableSyncCleanupPreview,
  FeishuBitableSyncCleanupResult,
  FeishuBitableSyncItem,
} from '~~/shared/types/domain'
import {
  getFeishuBitableSyncItemById,
} from '~~/server/utils/feishu-integration-store'
import {
  cleanupFeishuManagedReleaseDrafts,
  previewFeishuManagedReleaseDraftCleanup,
} from '~~/server/utils/release-store'

export const FEISHU_SYNC_ITEM_CLEANUP_CONFIRMATION_TOKEN = '清理同步数据'

function toText(value: unknown): string {
  return String(value || '').trim()
}

function toCleanupCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value || 0) || 0))
}

function createEmptyManagedDataCounts(): FeishuBitableSyncCleanupManagedDataCounts {
  return {
    externalRefs: 0,
    searchIndex: 0,
    entityAnalysis: 0,
    vectors: 0,
    postSyncTasks: 0,
    runSamples: 0,
    issues: 0,
    personaPresets: 0,
    unpublishedReleaseDrafts: 0,
  }
}

async function loadCleanupTarget(
  db: Queryable,
  input: {
    syncId: string
    syncItemId: string
  },
): Promise<FeishuBitableSyncItem> {
  const syncId = toText(input.syncId)
  const syncItemId = toText(input.syncItemId)
  const item = await getFeishuBitableSyncItemById(db, syncItemId)
  if (!item || toText(item.syncId) !== syncId)
    throw new Error('FEISHU_BITABLE_SYNC_ITEM_NOT_FOUND')
  return item
}

async function countManagedVectors(
  db: Queryable,
  syncItemId: string,
): Promise<number> {
  const result = await db.query<{ item_count: string }>(
    `WITH target_entities AS (
      SELECT DISTINCT scope, entity_id
      FROM feishu_external_refs
      WHERE provider = 'feishu_bitable'
        AND sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_search_index
      WHERE sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_entity_analysis
      WHERE sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_post_sync_tasks
      WHERE sync_item_id = $1
        AND task_type <> 'writeback_retry'
    )
    SELECT COUNT(*)::TEXT AS item_count
    FROM feishu_vectors vector_doc
    JOIN target_entities target
      ON target.scope = vector_doc.scope
     AND target.entity_id = vector_doc.entity_id`,
    [syncItemId],
  )
  return toCleanupCount(result.rows[0]?.item_count)
}

async function deleteManagedVectors(
  db: Queryable,
  syncItemId: string,
): Promise<number> {
  const result = await db.query<{ deleted_count: string }>(
    `WITH target_entities AS (
      SELECT DISTINCT scope, entity_id
      FROM feishu_external_refs
      WHERE provider = 'feishu_bitable'
        AND sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_search_index
      WHERE sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_entity_analysis
      WHERE sync_item_id = $1
      UNION
      SELECT DISTINCT scope, entity_id
      FROM feishu_post_sync_tasks
      WHERE sync_item_id = $1
        AND task_type <> 'writeback_retry'
    ),
    deleted AS (
      DELETE FROM feishu_vectors vector_doc
      USING target_entities target
      WHERE target.scope = vector_doc.scope
        AND target.entity_id = vector_doc.entity_id
      RETURNING 1
    )
    SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
    [syncItemId],
  )
  return toCleanupCount(result.rows[0]?.deleted_count)
}

async function buildManagedDataCounts(
  db: Queryable,
  item: FeishuBitableSyncItem,
): Promise<{
  managedDataCounts: FeishuBitableSyncCleanupManagedDataCounts
  legacyReleaseCleanup: FeishuBitableSyncCleanupLegacySummary
  publishedContestDataCount: number
  publishedPolicyDataCount: number
  blockedConflictCount: number
}> {
  const syncItemId = toText(item.id)
  const [externalRefs, searchIndex, entityAnalysis, vectors, postSyncTasks, runSamples, issues, personaPresets, releaseCleanup, blockedConflictCountResult] = await Promise.all([
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_external_refs
       WHERE provider = 'feishu_bitable'
         AND sync_item_id = $1`,
      [syncItemId],
    ),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_search_index
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_entity_analysis
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    countManagedVectors(db, syncItemId),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_post_sync_tasks
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_bitable_sync_run_samples
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_sync_issues
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM defense_persona_presets
       WHERE sync_item_id = $1`,
      [syncItemId],
    ),
    previewFeishuManagedReleaseDraftCleanup(db, {
      syncItemId,
      entityType: item.entityType,
    }),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_sync_issues
       WHERE sync_item_id = $1
         AND reason_code = 'OWNED_BY_OTHER_SYNC_ITEM'
         AND status = 'open'`,
      [syncItemId],
    ),
  ])

  return {
    managedDataCounts: {
      externalRefs: toCleanupCount(externalRefs.rows[0]?.item_count),
      searchIndex: toCleanupCount(searchIndex.rows[0]?.item_count),
      entityAnalysis: toCleanupCount(entityAnalysis.rows[0]?.item_count),
      vectors: typeof vectors === 'number' ? vectors : 0,
      postSyncTasks: toCleanupCount(postSyncTasks.rows[0]?.item_count),
      runSamples: toCleanupCount(runSamples.rows[0]?.item_count),
      issues: toCleanupCount(issues.rows[0]?.item_count),
      personaPresets: toCleanupCount(personaPresets.rows[0]?.item_count),
      unpublishedReleaseDrafts: releaseCleanup.unpublishedReleaseDrafts,
    },
    legacyReleaseCleanup: releaseCleanup.legacyReleaseCleanup,
    publishedContestDataCount: releaseCleanup.publishedContestDataCount,
    publishedPolicyDataCount: releaseCleanup.publishedPolicyDataCount,
    blockedConflictCount: toCleanupCount(blockedConflictCountResult.rows[0]?.item_count),
  }
}

export async function previewFeishuBitableSyncItemCleanup(
  db: Queryable,
  input: {
    syncId: string
    syncItemId: string
  },
): Promise<FeishuBitableSyncCleanupPreview> {
  const item = await loadCleanupTarget(db, input)
  const counts = await buildManagedDataCounts(db, item)

  return {
    syncId: item.syncId,
    syncItemId: item.id,
    entityType: item.entityType,
    confirmationToken: FEISHU_SYNC_ITEM_CLEANUP_CONFIRMATION_TOKEN,
    managedDataCounts: counts.managedDataCounts,
    legacyReleaseCleanup: counts.legacyReleaseCleanup,
    publishedDataRetained: true,
    publishedContestDataCount: counts.publishedContestDataCount,
    publishedPolicyDataCount: counts.publishedPolicyDataCount,
    blockedConflictCount: counts.blockedConflictCount,
  }
}

export async function cleanupFeishuBitableSyncItem(
  db: Queryable,
  input: {
    syncId: string
    syncItemId: string
    actorUserId: string
  },
): Promise<FeishuBitableSyncCleanupResult> {
  const item = await loadCleanupTarget(db, input)
  const syncItemId = toText(item.id)
  const managedDataCounts = createEmptyManagedDataCounts()

  managedDataCounts.vectors = await deleteManagedVectors(db, syncItemId)

  const [externalRefs, searchIndex, entityAnalysis, postSyncTasks, runSamples, issues, personaPresets, releaseCleanup, blockedConflictCountResult] = await Promise.all([
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_external_refs
        WHERE provider = 'feishu_bitable'
          AND sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_search_index
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_entity_analysis
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_post_sync_tasks
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_bitable_sync_run_samples
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM feishu_sync_issues
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    db.query<{ deleted_count: string }>(
      `WITH deleted AS (
        DELETE FROM defense_persona_presets
        WHERE sync_item_id = $1
        RETURNING 1
      )
      SELECT COUNT(*)::TEXT AS deleted_count FROM deleted`,
      [syncItemId],
    ),
    cleanupFeishuManagedReleaseDrafts(db, {
      actorUserId: input.actorUserId,
      syncItemId,
      entityType: item.entityType,
      preserveExternalIds: [],
    }),
    db.query<{ item_count: string }>(
      `SELECT COUNT(*)::TEXT AS item_count
       FROM feishu_sync_issues
       WHERE sync_item_id = $1
         AND reason_code = 'OWNED_BY_OTHER_SYNC_ITEM'
         AND status = 'open'`,
      [syncItemId],
    ),
  ])

  managedDataCounts.externalRefs = toCleanupCount(externalRefs.rows[0]?.deleted_count)
  managedDataCounts.searchIndex = toCleanupCount(searchIndex.rows[0]?.deleted_count)
  managedDataCounts.entityAnalysis = toCleanupCount(entityAnalysis.rows[0]?.deleted_count)
  managedDataCounts.postSyncTasks = toCleanupCount(postSyncTasks.rows[0]?.deleted_count)
  managedDataCounts.runSamples = toCleanupCount(runSamples.rows[0]?.deleted_count)
  managedDataCounts.issues = toCleanupCount(issues.rows[0]?.deleted_count)
  managedDataCounts.personaPresets = toCleanupCount(personaPresets.rows[0]?.deleted_count)
  managedDataCounts.unpublishedReleaseDrafts = releaseCleanup.unpublishedReleaseDrafts

  return {
    syncId: item.syncId,
    syncItemId: item.id,
    entityType: item.entityType,
    managedDataCounts,
    legacyReleaseCleanup: releaseCleanup.legacyReleaseCleanup,
    legacyForceCleared: releaseCleanup.legacyForceCleared,
    publishedDataSkipped: releaseCleanup.publishedContestDataCount > 0 || releaseCleanup.publishedPolicyDataCount > 0,
    blockedConflictCount: toCleanupCount(blockedConflictCountResult.rows[0]?.item_count),
  }
}
