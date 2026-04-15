import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, it, vi } from 'vitest'
import { ensureSchemaReady } from '../../server/database/bootstrap/schema.ts'

const ACTOR_USER_ID = 'user_release_tester'
const rootPgUrl = String(process.env.WINLOOP_PG_URL || 'postgresql://winloop@127.0.0.1:5432/winloop').trim()
const tempDatabaseName = `winloop_release_draft_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 8)}`
const parsedPgUrl = new URL(rootPgUrl)
const canRunDbSmoke = parsedPgUrl.password.length > 0

let adminPool = null
let tempPool = null
let upsertPolicyLibraryReleaseDraft = null

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {},
  }),
}))

function buildConnectionString(databaseName) {
  const url = new URL(rootPgUrl)
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

async function seedActorUser(pool) {
  await pool.query(
    `INSERT INTO users (
      id,
      username,
      password_hash,
      is_platform_admin
    ) VALUES ($1, $2, $3, TRUE)
    ON CONFLICT (id) DO NOTHING`,
    [ACTOR_USER_ID, 'release_tester', 'hash_placeholder'],
  )
}

async function resetReleaseScopeTables(pool) {
  await pool.query(`
    TRUNCATE TABLE
      release_review_logs,
      release_versions,
      policy_library_items,
      feishu_external_refs,
      feishu_bitable_sync_item_runs,
      feishu_bitable_sync_items
    CASCADE;
  `)
}

async function seedSyncContext(pool, input) {
  await pool.query(
    `INSERT INTO feishu_bitable_sync_items (
      id,
      name,
      entity_type,
      app_token,
      table_id,
      created_by_user_id,
      updated_by_user_id
    ) VALUES (
      $1, $2, 'policy', 'app_token_demo', 'table_demo', $3, $3
    )
    ON CONFLICT (id) DO UPDATE
    SET updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()`,
    [input.syncItemId, input.name || input.syncItemId, ACTOR_USER_ID],
  )

  await pool.query(
    `INSERT INTO feishu_bitable_sync_item_runs (
      id,
      sync_item_id,
      status,
      trigger_source,
      mode,
      created_by_user_id
    ) VALUES (
      $1, $2, 'running', 'manual', 'full', $3
    )
    ON CONFLICT (id) DO NOTHING`,
    [input.runId, input.syncItemId, ACTOR_USER_ID],
  )
}

async function createPolicyDraft(pool, input) {
  await seedSyncContext(pool, {
    syncItemId: input.syncItemId,
    runId: input.runId,
    name: input.name,
  })
  return upsertPolicyLibraryReleaseDraft(pool, {
    actorUserId: ACTOR_USER_ID,
    syncItemId: input.syncItemId,
    syncRunId: input.runId,
    scopeTitle: '政策库',
    item: {
      externalId: input.externalId,
      meetingName: input.meetingName,
      summary: input.summary || '',
      conferenceDate: input.conferenceDate || '',
      importance: input.importance || '',
      officialMaterial: '',
      officialMaterialLink: '',
      wechatMaterial: '',
      wechatMaterialLink: '',
      weiboMaterial: '',
      weiboMaterialLink: '',
      douyinMaterial: '',
      douyinMaterialLink: '',
      xiaohongshuMaterial: '',
      xiaohongshuMaterialLink: '',
      metadata: {},
      status: 'active',
    },
  })
}

async function listPolicyReleaseVersions(pool) {
  const result = await pool.query(
    `SELECT
      id,
      status,
      version_number,
      sync_item_id,
      sync_run_id,
      superseded_by_version_id,
      snapshot_json
     FROM release_versions
     WHERE scope_kind = 'policy_library'
       AND scope_id = 'policy_library'
     ORDER BY version_number ASC`,
  )
  return result.rows
}

beforeAll(async () => {
  if (!canRunDbSmoke)
    return

  ({ upsertPolicyLibraryReleaseDraft } = await import('../../server/utils/release-store.ts'))

  adminPool = createPool(buildConnectionString('postgres'))
  await adminPool.query(`CREATE DATABASE "${tempDatabaseName}"`)

  tempPool = createPool(buildConnectionString(tempDatabaseName))
  await ensureSchemaReady(tempPool)
  await seedActorUser(tempPool)
})

beforeEach(async () => {
  if (!canRunDbSmoke)
    return
  await resetReleaseScopeTables(tempPool)
  await seedActorUser(tempPool)
})

afterAll(async () => {
  await tempPool?.end().catch(() => {})
  await adminPool?.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}" WITH (FORCE)`).catch(() => {})
  await adminPool?.end().catch(() => {})
})

const databaseTest = canRunDbSmoke ? it : it.skip

describe('release draft 覆盖与审批边界', () => {
  databaseTest('pending_first_review 草稿会被重复同步复用并写入覆盖日志', async () => {
    const first = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_reuse',
      runId: 'run_policy_reuse_1',
      externalId: 'policy_ext_reuse_1',
      meetingName: '政策会议 A',
      summary: '第一次同步摘要',
    })

    const second = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_reuse',
      runId: 'run_policy_reuse_2',
      externalId: 'policy_ext_reuse_1',
      meetingName: '政策会议 A',
      summary: '第二次同步摘要',
    })

    assert.equal(second.version.id, first.version.id, 'pending_first_review 草稿应被原地复用')

    const versions = await listPolicyReleaseVersions(tempPool)
    assert.equal(versions.length, 1, '重复同步不应额外生成新草稿版本')
    assert.equal(versions[0]?.sync_item_id, 'sync_policy_reuse')
    assert.equal(versions[0]?.sync_run_id, 'run_policy_reuse_2')
    assert.equal(versions[0]?.snapshot_json?.items?.[0]?.summary, '第二次同步摘要')

    const logResult = await tempPool.query(
      `SELECT action
       FROM release_review_logs
       WHERE release_version_id = $1
       ORDER BY created_at ASC`,
      [first.version.id],
    )
    assert.deepEqual(
      logResult.rows.map(item => item.action),
      ['sync_generated', 'sync_draft_overwritten'],
      '复用草稿时应额外记录覆盖日志动作',
    )
  })

  databaseTest('pending_second_review 与 approved 版本不会被原地覆盖，而是生成新草稿', async () => {
    for (const status of ['pending_second_review', 'approved']) {
      await resetReleaseScopeTables(tempPool)
      await seedActorUser(tempPool)

      const first = await createPolicyDraft(tempPool, {
        syncItemId: `sync_policy_${status}`,
        runId: `run_policy_${status}_1`,
        externalId: `policy_ext_${status}`,
        meetingName: `政策会议_${status}`,
        summary: '首版摘要',
      })

      await tempPool.query(
        `UPDATE release_versions
         SET status = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [first.version.id, status],
      )

      const second = await createPolicyDraft(tempPool, {
        syncItemId: `sync_policy_${status}`,
        runId: `run_policy_${status}_2`,
        externalId: `policy_ext_${status}`,
        meetingName: `政策会议_${status}`,
        summary: '新版摘要',
      })

      assert.notEqual(second.version.id, first.version.id, `${status} 版本不应被重复同步直接覆盖`)

      const versions = await listPolicyReleaseVersions(tempPool)
      assert.equal(versions.length, 2, `${status} 场景应保留旧版本并新建一版草稿`)
      assert.equal(versions[0]?.status, status)
      assert.equal(versions[0]?.superseded_by_version_id, null)
      assert.equal(versions[1]?.status, 'pending_first_review')
      assert.equal(versions[1]?.sync_run_id, `run_policy_${status}_2`)
      assert.equal(versions[1]?.snapshot_json?.items?.[0]?.summary, '新版摘要')
    }
  })
})
