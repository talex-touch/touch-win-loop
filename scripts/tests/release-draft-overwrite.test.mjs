import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
let getContestReleasePublishCheck = null
let searchFeishuSyncedData = null
let upsertContestReleaseDraft = null
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
  const entityType = input.entityType || 'policy'
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
      $1, $2, $3, 'app_token_demo', $4, $5, $5
    )
    ON CONFLICT (id) DO UPDATE
    SET entity_type = EXCLUDED.entity_type,
        table_id = EXCLUDED.table_id,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()`,
    [input.syncItemId, input.name || input.syncItemId, entityType, `table_${entityType}`, ACTOR_USER_ID],
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
    entityType: 'policy',
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

async function createContestEntityDraft(pool, input) {
  await seedSyncContext(pool, {
    syncItemId: input.syncItemId,
    runId: input.runId,
    entityType: input.entityType,
    name: input.name,
  })
  return upsertContestReleaseDraft(pool, {
    actorUserId: ACTOR_USER_ID,
    syncItemId: input.syncItemId,
    syncRunId: input.runId,
    recordId: input.recordId || `${input.runId}_record`,
    contestExternalId: input.contestExternalId,
    scopeTitle: input.scopeTitle || input.contestExternalId,
    entityType: input.entityType,
    contest: input.contest || null,
    track: input.track || null,
    timelines: input.timelines || [],
    trackTimelines: input.trackTimelines || [],
    resource: input.resource || null,
  })
}

function buildContestSnapshot(overrides = {}) {
  return {
    externalId: 'contest_ext_agg',
    name: '聚合测试竞赛',
    level: 'national',
    organizer: '中国日报社',
    officialUrl: 'https://example.test/contest',
    summary: '用于验证飞书竞赛与赛道草稿聚合。',
    participantRequirements: '全国高校学生',
    currentSeason: '2026',
    disciplines: ['英语'],
    visibility: 'internal',
    ...overrides,
  }
}

function buildContestTimeline(overrides = {}) {
  return {
    externalId: 'contest_timeline_ext_agg',
    year: 2026,
    nodeType: 'submission_deadline',
    startAt: '2026-05-01T00:00:00.000Z',
    endAt: '2026-05-31T23:59:59.000Z',
    note: '提交截止',
    sourceLink: '',
    ...overrides,
  }
}

function buildTrackSnapshot(overrides = {}) {
  return {
    externalId: 'track_ext_agg',
    contestExternalId: 'contest_ext_agg',
    name: '大学组',
    summary: '大学组赛道',
    organizer: '中国日报社',
    participantRequirements: '大学生',
    currentSeason: '2026',
    sortOrder: 1,
    evidenceRequirements: ['提交演讲视频'],
    scoringPoints: ['语言表达', '主题立意'],
    deductionItems: [],
    ...overrides,
  }
}

function buildTrackTimeline(overrides = {}) {
  return {
    externalId: 'track_timeline_ext_agg',
    trackExternalId: 'track_ext_agg',
    year: 2026,
    nodeType: 'submission_deadline',
    startAt: '2026-05-01T00:00:00.000Z',
    endAt: '2026-05-31T23:59:59.000Z',
    note: '赛道提交截止',
    sourceLink: '',
    ...overrides,
  }
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

async function listContestReleaseVersions(pool, scopeId = 'contest_ext_agg') {
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
     WHERE scope_kind = 'contest'
       AND scope_id = $1
     ORDER BY version_number ASC`,
    [scopeId],
  )
  return result.rows
}

beforeAll(async () => {
  if (!canRunDbSmoke) {
    return
  }

  ;({
    getContestReleasePublishCheck,
    upsertContestReleaseDraft,
    upsertPolicyLibraryReleaseDraft,
  } = await import('../../server/utils/release-store.ts'))
  ;({ searchFeishuSyncedData } = await import('../../server/utils/feishu-integration-store.ts'))

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
  it('竞赛子表同步会以最新 pending_first_review 草稿作为聚合基线', async () => {
    const releaseStoreSource = await readFile(
      resolve(process.cwd(), 'server/utils/release-store.ts'),
      'utf8',
    )

    const helperMatch = releaseStoreSource.match(/async function getLatestMergeableContestReleaseDraft\([\s\S]*?\n\}/)
    assert.ok(helperMatch, 'release-store 缺少竞赛同步可聚合草稿查询 helper')
    const helperSource = helperMatch[0]
    assert.match(
      helperSource,
      /statuses:\s*\['pending_first_review'\]/,
      '竞赛同步只能把 pending_first_review 草稿作为自动聚合基线',
    )
    assert.match(
      releaseStoreSource,
      /const mergeBaseVersion = existingVersion\s*\?\s*null\s*:\s*await getLatestMergeableContestReleaseDraft/,
      'upsertContestReleaseDraft 未在不同 syncRunId 下读取最新可聚合草稿',
    )
    assert.match(
      releaseStoreSource,
      /mergeBaseVersion\s*\?\s*toContestSnapshot\(mergeBaseVersion\.snapshot, scopeId\)/,
      'upsertContestReleaseDraft 未把最新可聚合草稿作为 sibling 快照来源',
    )
    assert.doesNotMatch(
      helperSource,
      /statuses:\s*\[[^\]]*pending_second_review[^\]]*\]/,
      '二审草稿不应被自动同步继续聚合改写',
    )
    assert.doesNotMatch(
      helperSource,
      /statuses:\s*\[[^\]]*approved[^\]]*\]/,
      'approved 草稿不应被自动同步继续聚合改写',
    )
  })

  it('竞赛主快照同步会对飞书源表缺失的人工字段做显式保留', async () => {
    const releaseStoreSource = await readFile(
      resolve(process.cwd(), 'server/utils/release-store.ts'),
      'utf8',
    )
    const typeSource = await readFile(
      resolve(process.cwd(), 'shared/types/domain-legacy.ts'),
      'utf8',
    )

    assert.match(typeSource, /export interface ReleaseSyncSource \{[\s\S]*preservedFields\?: string\[\]/, 'ReleaseSyncSource 未声明 preservedFields 审计字段')
    assert.match(releaseStoreSource, /mergeContestManualPreservedFields/, 'release-store 未调用竞赛人工字段保留工具')
    assert.match(releaseStoreSource, /preservedFields: preservedContestFields/, '竞赛同步未把保留字段写入 syncSource')
    assert.match(releaseStoreSource, /input\.contest,[\s\S]*current\.contest \|\| base\.contest/, '竞赛同步未用当前或基线竞赛快照作为人工字段保留来源')
  })

  databaseTest('pending_first_review 草稿在新一轮有 diff 的同步下会生成新版本并替换旧未发布版本', async () => {
    const first = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_reuse',
      runId: 'run_policy_reuse_1',
      externalId: 'policy_ext_reuse_1',
      meetingName: '政策会议 A',
      summary: '第一次同步摘要',
    })
    assert.ok(first.version, '首次同步应生成版本草稿')

    const second = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_reuse',
      runId: 'run_policy_reuse_2',
      externalId: 'policy_ext_reuse_1',
      meetingName: '政策会议 A',
      summary: '第二次同步摘要',
    })
    assert.ok(second.version, '第二次有 diff 的同步应生成新版本草稿')

    assert.notEqual(second.version.id, first.version.id, 'pending_first_review 草稿不应再被原地复用')

    const versions = await listPolicyReleaseVersions(tempPool)
    assert.equal(versions.length, 2, '重复同步有 diff 时应额外生成新草稿版本')
    assert.equal(versions[0]?.status, 'superseded')
    assert.equal(versions[0]?.superseded_by_version_id, second.version.id)
    assert.equal(versions[1]?.sync_item_id, 'sync_policy_reuse')
    assert.equal(versions[1]?.sync_run_id, 'run_policy_reuse_2')
    assert.equal(versions[1]?.snapshot_json?.items?.[0]?.summary, '第二次同步摘要')

    const firstLogResult = await tempPool.query(
      `SELECT action
       FROM release_review_logs
       WHERE release_version_id = $1
       ORDER BY created_at ASC`,
      [first.version.id],
    )
    assert.deepEqual(
      firstLogResult.rows.map(item => item.action),
      ['sync_generated'],
      '旧版本仅保留首次生成日志，不能再写覆盖草稿动作',
    )

    const secondLogResult = await tempPool.query(
      `SELECT action
       FROM release_review_logs
       WHERE release_version_id = $1
       ORDER BY created_at ASC`,
      [second.version.id],
    )
    assert.deepEqual(secondLogResult.rows.map(item => item.action), ['sync_generated'])
  })

  databaseTest('同步无 diff 时不会新建新版本', async () => {
    const first = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_no_diff',
      runId: 'run_policy_no_diff_1',
      externalId: 'policy_ext_no_diff',
      meetingName: '政策会议 无差异',
      summary: '稳定摘要',
    })
    assert.ok(first.version, '首次同步应生成版本草稿')

    await tempPool.query(
      `UPDATE release_versions
       SET status = 'published',
           live_entity_id = 'policy_library',
           published_by_user_id = $2,
           published_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [first.version.id, ACTOR_USER_ID],
    )

    const second = await createPolicyDraft(tempPool, {
      syncItemId: 'sync_policy_no_diff',
      runId: 'run_policy_no_diff_2',
      externalId: 'policy_ext_no_diff',
      meetingName: '政策会议 无差异',
      summary: '稳定摘要',
    })

    assert.equal(second.version, null, '无 diff 的同步不应再新建版本')

    const versions = await listPolicyReleaseVersions(tempPool)
    assert.equal(versions.length, 1, '无 diff 时应保留单一已发布版本')
    assert.equal(versions[0]?.status, 'published')
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
      assert.ok(first.version, '首次同步应生成版本草稿')

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
      assert.ok(second.version, `${status} 后的新同步应继续生成草稿`)

      assert.notEqual(second.version.id, first.version.id, `${status} 版本不应被重复同步直接覆盖`)

      const versions = await listPolicyReleaseVersions(tempPool)
      assert.equal(versions.length, 2, `${status} 场景应保留旧版本并新建一版草稿`)
      assert.equal(versions[0]?.status, 'superseded')
      assert.equal(versions[0]?.superseded_by_version_id, second.version.id)
      assert.equal(versions[1]?.status, 'pending_first_review')
      assert.equal(versions[1]?.sync_run_id, `run_policy_${status}_2`)
      assert.equal(versions[1]?.snapshot_json?.items?.[0]?.summary, '新版摘要')
    }
  })

  databaseTest('竞赛同步后再同步赛道时，最新 pending_first_review 草稿会保留竞赛主快照', async () => {
    const contestDraft = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_contest_agg',
      runId: 'run_contest_agg_1',
      entityType: 'contest',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      contest: buildContestSnapshot(),
      timelines: [buildContestTimeline()],
    })
    assert.ok(contestDraft.version, '竞赛同步应生成主草稿')

    const trackDraft = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_track_agg',
      runId: 'run_track_agg_1',
      entityType: 'track',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      track: buildTrackSnapshot(),
      trackTimelines: [buildTrackTimeline()],
    })
    assert.ok(trackDraft.version, '赛道同步应生成聚合草稿')

    const versions = await listContestReleaseVersions(tempPool)
    assert.equal(versions.length, 2, '竞赛和赛道不同 run 应生成两版草稿')
    assert.equal(versions[0]?.status, 'superseded')
    assert.equal(versions[0]?.superseded_by_version_id, trackDraft.version.id)
    assert.equal(versions[1]?.status, 'pending_first_review')
    assert.equal(versions[1]?.snapshot_json?.contest?.externalId, 'contest_ext_agg')
    assert.equal(versions[1]?.snapshot_json?.tracks?.[0]?.externalId, 'track_ext_agg')

    const publishCheck = await getContestReleasePublishCheck(tempPool, { version: trackDraft.version })
    assert.ok(publishCheck, '竞赛版本应返回发布校验结果')
    assert.equal(
      publishCheck.blockers.some(item => item.code === 'CONTEST_SNAPSHOT_REQUIRED'),
      false,
      '聚合后的赛道草稿不能丢失竞赛主快照',
    )

    const contestRows = await searchFeishuSyncedData(tempPool, {
      scope: 'contest',
      page: 1,
      pageSize: 20,
    })
    const trackRows = await searchFeishuSyncedData(tempPool, {
      scope: 'track',
      page: 1,
      pageSize: 20,
    })
    assert.equal(contestRows.items.some(item => item.externalId === 'contest_ext_agg'), true)
    assert.equal(trackRows.items.some(item => item.externalId === 'track_ext_agg'), true)
  })

  databaseTest('赛道同步后再同步竞赛时，最新 pending_first_review 草稿会保留赛道快照', async () => {
    const trackDraft = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_track_reverse',
      runId: 'run_track_reverse_1',
      entityType: 'track',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      track: buildTrackSnapshot(),
      trackTimelines: [buildTrackTimeline()],
    })
    assert.ok(trackDraft.version, '赛道同步应先生成草稿')

    const contestDraft = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_contest_reverse',
      runId: 'run_contest_reverse_1',
      entityType: 'contest',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      contest: buildContestSnapshot({ summary: '竞赛主信息随后同步。' }),
      timelines: [buildContestTimeline()],
    })
    assert.ok(contestDraft.version, '竞赛同步应生成聚合草稿')

    const versions = await listContestReleaseVersions(tempPool)
    assert.equal(versions.length, 2)
    assert.equal(versions[0]?.status, 'superseded')
    assert.equal(versions[0]?.superseded_by_version_id, contestDraft.version.id)
    assert.equal(versions[1]?.snapshot_json?.contest?.externalId, 'contest_ext_agg')
    assert.equal(versions[1]?.snapshot_json?.tracks?.[0]?.externalId, 'track_ext_agg')

    const publishCheck = await getContestReleasePublishCheck(tempPool, { version: contestDraft.version })
    assert.ok(publishCheck, '竞赛版本应返回发布校验结果')
    assert.equal(
      publishCheck.blockers.some(item => item.code === 'CONTEST_SNAPSHOT_REQUIRED'),
      false,
      '聚合后的竞赛草稿不能丢失已同步赛道快照',
    )
  })

  databaseTest('竞赛库同步缺失人工字段时会保留已有竞赛人工字段并标记 preservedFields', async () => {
    const manualContest = buildContestSnapshot({
      organizer: '人工主办单位',
      coOrganizer: '人工协办单位',
      participantRequirements: '人工参赛对象',
      teamRule: '人工组队规则',
      currentSeason: '2026 人工届次',
    })
    const first = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_contest_manual_preserve',
      runId: 'run_contest_manual_preserve_1',
      entityType: 'contest',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      contest: manualContest,
      timelines: [buildContestTimeline()],
    })
    assert.ok(first.version, '首版竞赛草稿应生成')

    const syncedContest = buildContestSnapshot({
      summary: '竞赛库下一轮同步摘要。',
    })
    for (const field of ['organizer', 'coOrganizer', 'participantRequirements', 'teamRule', 'currentSeason'])
      delete syncedContest[field]

    const second = await createContestEntityDraft(tempPool, {
      syncItemId: 'sync_item_contest_manual_preserve',
      runId: 'run_contest_manual_preserve_2',
      entityType: 'contest',
      contestExternalId: 'contest_ext_agg',
      scopeTitle: '聚合测试竞赛',
      contest: syncedContest,
      timelines: [buildContestTimeline()],
    })
    assert.ok(second.version, '缺失人工字段但有其他 diff 的竞赛同步应生成新草稿')

    const versions = await listContestReleaseVersions(tempPool)
    assert.equal(versions.length, 2)
    assert.equal(versions[0]?.status, 'superseded')
    assert.equal(versions[0]?.superseded_by_version_id, second.version.id)

    const contest = versions[1]?.snapshot_json?.contest
    assert.equal(contest?.summary, '竞赛库下一轮同步摘要。')
    assert.equal(contest?.organizer, '人工主办单位')
    assert.equal(contest?.coOrganizer, '人工协办单位')
    assert.equal(contest?.participantRequirements, '人工参赛对象')
    assert.equal(contest?.teamRule, '人工组队规则')
    assert.equal(contest?.currentSeason, '2026 人工届次')
    assert.deepEqual(contest?.syncSource?.preservedFields, [
      'organizer',
      'coOrganizer',
      'participantRequirements',
      'teamRule',
      'currentSeason',
    ])
  })
})
