import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, it } from 'vitest'

const originalPgUrl = String(process.env.WINLOOP_PG_URL || 'postgresql://winloop@127.0.0.1:5432/winloop').trim()
const tempDatabaseName = `winloop_resource_tree_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
const parsedPgUrl = new URL(originalPgUrl)
const canRunMigrationSmoke = parsedPgUrl.password.length > 0

let adminPool = null
let legacyPool = null
let dbModule = null
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

    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      team_profile JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      creator_user_id TEXT NOT NULL,
      payer_user_id TEXT,
      title TEXT NOT NULL,
      contest_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      problem_statement TEXT NOT NULL,
      innovation_points TEXT[] NOT NULL DEFAULT '{}',
      tech_route_steps TEXT[] NOT NULL DEFAULT '{}',
      scoring_mapping TEXT[] NOT NULL DEFAULT '{}',
      risks TEXT[] NOT NULL DEFAULT '{}',
      deliverables TEXT[] NOT NULL DEFAULT '{}',
      summary TEXT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE contest_resources (
      id TEXT PRIMARY KEY,
      contest_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'basic_info',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE project_resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source TEXT NOT NULL,
      resource_kind TEXT NOT NULL DEFAULT 'binary',
      linked_contest_resource_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      category TEXT NOT NULL,
      year INTEGER NOT NULL DEFAULT 0,
      source_link TEXT NOT NULL DEFAULT '',
      availability TEXT NOT NULL DEFAULT 'public',
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id TEXT,
      updated_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE project_resource_upload_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_user_id TEXT,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size BIGINT NOT NULL DEFAULT 0,
      last_modified BIGINT NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      access_level TEXT NOT NULL DEFAULT 'public',
      title TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      chunk_size INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 1,
      uploaded_bytes BIGINT NOT NULL DEFAULT 0,
      uploaded_chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'queued',
      error_code TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      final_object_key TEXT NOT NULL DEFAULT '',
      final_storage_provider TEXT NOT NULL DEFAULT '',
      resource_id TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO users (id, username, password_hash)
    VALUES ('user_1', 'legacy-user', 'hash');

    INSERT INTO workspaces (id, type, name, owner_user_id)
    VALUES ('ws_1', 'personal', 'Legacy Personal', 'user_1');

    INSERT INTO projects (
      id,
      workspace_id,
      owner_user_id,
      creator_user_id,
      title,
      contest_id,
      track_id,
      problem_statement,
      source,
      status
    ) VALUES (
      'project_1',
      'ws_1',
      'user_1',
      'user_1',
      'Legacy Project',
      'contest_1',
      'track_1',
      'problem',
      'form',
      'draft'
    );

    INSERT INTO project_resources (
      id,
      project_id,
      source,
      title,
      category,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      'resource_1',
      'project_1',
      'upload',
      'Legacy Resource',
      'basic_info',
      'user_1',
      'user_1',
      NOW() - INTERVAL '1 hour',
      NOW() - INTERVAL '1 hour'
    );

    INSERT INTO project_resource_upload_sessions (
      id,
      project_id,
      actor_user_id,
      file_name,
      category,
      expires_at
    ) VALUES (
      'upload_session_1',
      'project_1',
      'user_1',
      'legacy.txt',
      'basic_info',
      NOW() + INTERVAL '1 day'
    );
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
  await dbModule.withClient(undefined, async () => {})
})

afterAll(async () => {
  process.env.WINLOOP_PG_URL = originalPgUrl
  await legacyPool?.end().catch(() => {})
  await adminPool?.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}" WITH (FORCE)`).catch(() => {})
  await adminPool?.end().catch(() => {})
})

const migrationTest = canRunMigrationSmoke ? it : it.skip

migrationTest('旧 project resource schema 会自动补齐 tree 字段', async () => {
  assert.ok(dbModule)

  await dbModule.withClient(undefined, async (db) => {
    const columnChecks = await db.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'project_resources' AND column_name IN ('parent_resource_id', 'sort_order'))
          OR (table_name = 'project_resource_upload_sessions' AND column_name = 'parent_resource_id')
        )
      ORDER BY table_name, column_name
    `)

    assert.deepEqual(
      columnChecks.rows.map(row => `${row.table_name}.${row.column_name}`),
      [
        'project_resource_upload_sessions.parent_resource_id',
        'project_resources.parent_resource_id',
        'project_resources.sort_order',
      ],
    )

    const indexChecks = await db.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_project_resources_project_parent_sort'
    `)
    assert.equal(indexChecks.rows[0]?.indexname, 'idx_project_resources_project_parent_sort')

    const resourceRow = await db.query(`
      SELECT parent_resource_id, sort_order
      FROM project_resources
      WHERE id = 'resource_1'
      LIMIT 1
    `)
    assert.equal(resourceRow.rows[0]?.parent_resource_id, null)
    assert.equal(resourceRow.rows[0]?.sort_order, 0)
  })
})
