import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, it } from 'vitest'

const originalPgUrl = String(process.env.WINLOOP_PG_URL || 'postgresql://winloop@127.0.0.1:5432/winloop').trim()
const tempDatabaseName = `winloop_feishu_sync_migration_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
const parsedPgUrl = new URL(originalPgUrl)
const canRunMigrationSmoke = parsedPgUrl.password.length > 0

let adminPool = null
let legacyPool = null
let dbModule = null
let storeModule = null
let tempPgUrl = ''

function buildConnectionString(databaseName) {
  const url = new URL(originalPgUrl)
  url.pathname = `/${databaseName}`
  return url.toString()
}

function createPool(connectionString) {
  const url = new URL(connectionString)
  return new Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: url.password || '',
    database: url.pathname.replace(/^\//, ''),
  })
}

async function seedLegacySchema(pool) {
  await pool.query(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO users (id, username, password_hash)
    VALUES ('user_feishu_admin', 'feishu-admin', 'hash');

    CREATE TABLE feishu_bitable_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      target_type TEXT NOT NULL,
      app_token TEXT NOT NULL,
      table_id TEXT NOT NULL,
      view_id TEXT NOT NULL DEFAULT '',
      source_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      writeback_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      mapping_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      options_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      last_run_at TIMESTAMPTZ,
      schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      schedule_mode TEXT NOT NULL DEFAULT 'interval',
      schedule_interval_minutes INTEGER,
      schedule_cron_expr TEXT,
      schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      schedule_next_run_at TIMESTAMPTZ,
      schedule_last_run_at TIMESTAMPTZ,
      schedule_last_error TEXT NOT NULL DEFAULT '',
      schedule_locked_at TIMESTAMPTZ,
      schedule_lock_token TEXT,
      created_by_user_id TEXT NOT NULL,
      updated_by_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_bitable_sync_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'full',
      delta_record_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      fetched_count INTEGER NOT NULL DEFAULT 0,
      created_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_external_refs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      scope TEXT NOT NULL,
      external_id TEXT NOT NULL,
      task_id TEXT,
      entity_id TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_post_sync_tasks (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      run_id TEXT,
      scope TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      attempt INTEGER NOT NULL DEFAULT 0,
      max_attempt INTEGER NOT NULL DEFAULT 6,
      source_hash TEXT NOT NULL DEFAULT '',
      next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      error_message TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_search_index (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT '',
      task_id TEXT,
      run_id TEXT,
      source_hash TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      keywords TEXT[] NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_entity_analysis (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT '',
      task_id TEXT,
      run_id TEXT,
      source_hash TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      analysis_json JSONB NOT NULL DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE feishu_sync_issues (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      record_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      reason_code TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      resolution TEXT NOT NULL DEFAULT '',
      resolution_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
      resolved_by_user_id TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO feishu_bitable_tasks (
      id,
      name,
      target_type,
      app_token,
      table_id,
      view_id,
      source_json,
      writeback_json,
      is_active,
      mapping_json,
      options_json,
      schedule_enabled,
      schedule_mode,
      schedule_interval_minutes,
      schedule_timezone,
      created_by_user_id,
      updated_by_user_id
    ) VALUES (
      'task_legacy_1',
      '旧竞赛同步任务',
      'contest',
      'app_legacy_1',
      'tbl_legacy_1',
      'vew_legacy_1',
      '{"appToken":"app_legacy_1","tableId":"tbl_legacy_1","viewId":"vew_legacy_1","appName":"旧主库"}'::JSONB,
      '{"enabled":true}'::JSONB,
      TRUE,
      '{"schemaVersion":2,"layers":[]}'::JSONB,
      '{}'::JSONB,
      TRUE,
      'interval',
      30,
      'Asia/Shanghai',
      'user_feishu_admin',
      'user_feishu_admin'
    );

    INSERT INTO feishu_bitable_sync_runs (
      id,
      task_id,
      status,
      trigger_source,
      mode,
      delta_record_count,
      fetched_count,
      created_count,
      updated_count,
      skipped_count,
      error_count,
      error_message,
      created_by_user_id
    ) VALUES (
      'run_legacy_1',
      'task_legacy_1',
      'success',
      'manual',
      'full',
      0,
      12,
      3,
      4,
      5,
      0,
      '',
      'user_feishu_admin'
    );

    INSERT INTO feishu_external_refs (id, provider, scope, external_id, task_id, entity_id, metadata)
    VALUES ('ext_legacy_1', 'feishu_bitable', 'contest', 'contest-ext-1', 'task_legacy_1', 'contest_1', '{}'::JSONB);

    INSERT INTO feishu_post_sync_tasks (id, task_id, run_id, scope, entity_id, external_id, task_type, status, source_hash, payload)
    VALUES ('post_legacy_1', 'task_legacy_1', 'run_legacy_1', 'contest', 'contest_1', 'contest-ext-1', 'embedding_upsert', 'queued', 'hash_1', '{}'::JSONB);

    INSERT INTO feishu_search_index (id, scope, entity_id, external_id, task_id, run_id, source_hash)
    VALUES ('search_legacy_1', 'contest', 'contest_1', 'contest-ext-1', 'task_legacy_1', 'run_legacy_1', 'hash_1');

    INSERT INTO feishu_entity_analysis (id, scope, entity_id, external_id, task_id, run_id, source_hash)
    VALUES ('analysis_legacy_1', 'contest', 'contest_1', 'contest-ext-1', 'task_legacy_1', 'run_legacy_1', 'hash_1');

    INSERT INTO feishu_sync_issues (id, task_id, target_type, record_id, external_id, status, reason_code, message, payload)
    VALUES ('issue_legacy_1', 'task_legacy_1', 'contest', 'rec_1', 'contest-ext-1', 'open', 'MISSING_NAME', 'legacy issue', '{}'::JSONB);
  `)
}

beforeAll(async () => {
  if (!canRunMigrationSmoke)
    return

  const adminPgUrl = buildConnectionString('postgres')
  tempPgUrl = buildConnectionString(tempDatabaseName)
  adminPool = createPool(adminPgUrl)
  await adminPool.query(`CREATE DATABASE "${tempDatabaseName}"`)

  legacyPool = createPool(tempPgUrl)
  await seedLegacySchema(legacyPool)

  process.env.WINLOOP_PG_URL = tempPgUrl
  dbModule = await import('../../server/utils/db.ts')
  storeModule = await import('../../server/utils/feishu-integration-store.ts')
  await dbModule.withClient(undefined, async () => {})
})

afterAll(async () => {
  process.env.WINLOOP_PG_URL = originalPgUrl
  await legacyPool?.end().catch(() => {})
  await adminPool?.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}" WITH (FORCE)`).catch(() => {})
  await adminPool?.end().catch(() => {})
})

const migrationTest = canRunMigrationSmoke ? it : it.skip

migrationTest('旧 feishu bitable task 结构会迁移为 sync + sync item', async () => {
  assert.ok(dbModule)
  assert.ok(storeModule)

  await dbModule.withClient(undefined, async (db) => {
    const tableChecks = await db.query(`
      SELECT
        to_regclass('public.feishu_bitable_syncs')::TEXT AS syncs_table,
        to_regclass('public.feishu_bitable_sync_items')::TEXT AS items_table,
        to_regclass('public.feishu_bitable_sync_item_runs')::TEXT AS runs_table
    `)
    assert.equal(tableChecks.rows[0]?.syncs_table, 'feishu_bitable_syncs')
    assert.equal(tableChecks.rows[0]?.items_table, 'feishu_bitable_sync_items')
    assert.equal(tableChecks.rows[0]?.runs_table, 'feishu_bitable_sync_item_runs')

    const columnChecks = await db.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'feishu_bitable_sync_items' AND column_name IN ('sync_id', 'entity_type', 'is_enabled'))
          OR (table_name = 'feishu_bitable_sync_item_runs' AND column_name = 'sync_item_id')
          OR (table_name = 'feishu_external_refs' AND column_name = 'sync_item_id')
          OR (table_name = 'feishu_post_sync_tasks' AND column_name = 'sync_item_id')
          OR (table_name = 'feishu_search_index' AND column_name = 'sync_item_id')
          OR (table_name = 'feishu_entity_analysis' AND column_name = 'sync_item_id')
          OR (table_name = 'feishu_sync_issues' AND column_name IN ('sync_item_id', 'entity_type'))
        )
      ORDER BY table_name, column_name
    `)
    assert.ok(columnChecks.rows.length >= 10)

    const migratedItemResult = await db.query(`
      SELECT id, sync_id, entity_type, is_enabled, app_token, table_id, view_id
      FROM feishu_bitable_sync_items
      WHERE id = 'task_legacy_1'
      LIMIT 1
    `)
    assert.equal(migratedItemResult.rows[0]?.id, 'task_legacy_1')
    assert.equal(migratedItemResult.rows[0]?.sync_id, 'sync_task_legacy_1')
    assert.equal(migratedItemResult.rows[0]?.entity_type, 'contest')
    assert.equal(migratedItemResult.rows[0]?.is_enabled, true)

    const migratedSyncResult = await db.query(`
      SELECT id, name, source_json->>'appToken' AS app_token
      FROM feishu_bitable_syncs
      WHERE id = 'sync_task_legacy_1'
      LIMIT 1
    `)
    assert.equal(migratedSyncResult.rows[0]?.name, '旧竞赛同步任务')
    assert.equal(migratedSyncResult.rows[0]?.app_token, 'app_legacy_1')

    const runLink = await db.query(`SELECT sync_item_id FROM feishu_bitable_sync_item_runs WHERE id = 'run_legacy_1' LIMIT 1`)
    assert.equal(runLink.rows[0]?.sync_item_id, 'task_legacy_1')

    const externalRefLink = await db.query(`SELECT sync_item_id FROM feishu_external_refs WHERE id = 'ext_legacy_1' LIMIT 1`)
    assert.equal(externalRefLink.rows[0]?.sync_item_id, 'task_legacy_1')

    const postTaskLink = await db.query(`SELECT sync_item_id FROM feishu_post_sync_tasks WHERE id = 'post_legacy_1' LIMIT 1`)
    assert.equal(postTaskLink.rows[0]?.sync_item_id, 'task_legacy_1')

    const issueLink = await db.query(`SELECT sync_item_id, entity_type FROM feishu_sync_issues WHERE id = 'issue_legacy_1' LIMIT 1`)
    assert.equal(issueLink.rows[0]?.sync_item_id, 'task_legacy_1')
    assert.equal(issueLink.rows[0]?.entity_type, 'contest')
  })

  await dbModule.withClient(undefined, async (db) => {
    const items = await storeModule.listActiveFeishuBitableSyncItemsBySource(db, {
      appToken: 'app_legacy_1',
      tableId: 'tbl_legacy_1',
    })
    assert.equal(items.length, 1)
    assert.equal(items[0]?.id, 'task_legacy_1')
    assert.equal(items[0]?.syncId, 'sync_task_legacy_1')

    const detail = await storeModule.getFeishuBitableSyncItemDetail(db, {
      syncId: 'sync_task_legacy_1',
      syncItemId: 'task_legacy_1',
    })
    assert.equal(detail?.recentRuns[0]?.id, 'run_legacy_1')
    assert.equal(detail?.issues[0]?.id, 'issue_legacy_1')
  })
})
