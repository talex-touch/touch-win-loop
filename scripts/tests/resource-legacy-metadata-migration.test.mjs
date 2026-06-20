import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { Pool } from 'pg'
import { afterAll, beforeAll, it } from 'vitest'

const execFileAsync = promisify(execFile)
const rootDir = process.cwd()
const migrationFile = './scripts/migrations/2026-04-13-feishu-resource-legacy-metadata-cleanup.sql'
const originalPgUrl = String(process.env.WINLOOP_PG_URL || 'postgresql://winloop@127.0.0.1:5432/winloop').trim()
const tempDatabaseName = `winloop_resource_metadata_cleanup_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
const parsedPgUrl = new URL(originalPgUrl)
const canRunMigrationSmoke = parsedPgUrl.password.length > 0

let adminPool = null
let tempPool = null
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

async function seedLegacyData(pool) {
  await pool.query(`
    CREATE TABLE contest_resources (
      id TEXT PRIMARY KEY,
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB
    );

    CREATE TABLE release_versions (
      id TEXT PRIMARY KEY,
      scope_kind TEXT NOT NULL,
      snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB
    );

    INSERT INTO contest_resources (id, metadata)
    VALUES (
      'resource_1',
      '{
        "contestRelationInfo": "旧竞赛文本",
        "trackRelationInfo": "旧赛道文本",
        "trackId": "track_live_1",
        "source": "feishu_bitable"
      }'::JSONB
    );

    INSERT INTO release_versions (id, scope_kind, snapshot_json)
    VALUES (
      'release_1',
      'contest',
      '{
        "contestExternalId": "contest_ext_1",
        "resources": [
          {
            "externalId": "resource_ext_1",
            "title": "资料 1",
            "metadata": {
              "contestRelationInfo": "旧竞赛文本",
              "trackRelationInfo": "旧赛道文本",
              "recordId": "rec_1",
              "source": "feishu_bitable"
            }
          },
          {
            "externalId": "resource_ext_2",
            "title": "资料 2",
            "metadata": {
              "source": "manual"
            }
          }
        ]
      }'::JSONB
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

  tempPool = createPool(tempPgUrl)
  await seedLegacyData(tempPool)
})

afterAll(async () => {
  await tempPool?.end().catch(() => {})
  await adminPool?.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}" WITH (FORCE)`).catch(() => {})
  await adminPool?.end().catch(() => {})
})

const migrationTest = canRunMigrationSmoke ? it : it.skip

async function runMigration(force = false) {
  const args = ['./scripts/db-migrate.mjs', migrationFile]
  if (force)
    args.push('--force')

  await execFileAsync('node', args, {
    cwd: rootDir,
    env: {
      ...process.env,
      WINLOOP_PG_URL: tempPgUrl,
    },
  })
}

migrationTest('资源 legacy metadata 清理迁移会删除旧字段且可重复执行', async () => {
  assert.ok(tempPool)

  await runMigration()

  const resourceResult = await tempPool.query(
    `SELECT metadata
     FROM contest_resources
     WHERE id = 'resource_1'
     LIMIT 1`,
  )
  assert.deepEqual(resourceResult.rows[0]?.metadata, {
    trackId: 'track_live_1',
    source: 'feishu_bitable',
  })

  const releaseResult = await tempPool.query(
    `SELECT snapshot_json
     FROM release_versions
     WHERE id = 'release_1'
     LIMIT 1`,
  )
  assert.deepEqual(releaseResult.rows[0]?.snapshot_json?.resources?.[0]?.metadata, {
    recordId: 'rec_1',
    source: 'feishu_bitable',
  })
  assert.deepEqual(releaseResult.rows[0]?.snapshot_json?.resources?.[1]?.metadata, {
    source: 'manual',
  })

  await runMigration(true)

  const rerunResourceResult = await tempPool.query(
    `SELECT metadata
     FROM contest_resources
     WHERE id = 'resource_1'
     LIMIT 1`,
  )
  const rerunReleaseResult = await tempPool.query(
    `SELECT snapshot_json
     FROM release_versions
     WHERE id = 'release_1'
     LIMIT 1`,
  )

  assert.deepEqual(rerunResourceResult.rows[0]?.metadata, {
    trackId: 'track_live_1',
    source: 'feishu_bitable',
  })
  assert.deepEqual(rerunReleaseResult.rows[0]?.snapshot_json?.resources?.[0]?.metadata, {
    recordId: 'rec_1',
    source: 'feishu_bitable',
  })
})
