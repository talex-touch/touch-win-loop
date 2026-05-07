import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const MIGRATION_FILE = 'scripts/migrations/2026-04-27-feishu-contest-track-field-contract-cleanup.sql'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('飞书字段口径历史数据迁移', () => {
  it('迁移会清理同步配置和 release snapshot 的废弃字段', async () => {
    const source = await readSource(MIGRATION_FILE)

    assert.match(source, /UPDATE feishu_bitable_sync_items[\s\S]*WHERE entity_type = 'contest'/, '迁移未清理竞赛同步项配置')
    assert.match(source, /UPDATE feishu_bitable_sync_items[\s\S]*WHERE entity_type = 'track'/, '迁移未清理赛道同步项配置')
    assert.match(source, /UPDATE release_versions[\s\S]*WHERE scope_kind = 'contest'/, '迁移未清理竞赛 release snapshot')

    for (const key of ['organizer', 'coOrganizer', 'participantRequirements', 'teamRule', 'currentSeason'])
      assert.match(source, new RegExp(`ARRAY\\[[\\s\\S]*'${key}'`), `竞赛历史字段未纳入迁移：${key}`)

    for (const key of ['currentSeason'])
      assert.match(source, new RegExp(`ARRAY\\[[\\s\\S]*'${key}'`), `赛道历史字段未纳入迁移：${key}`)

    assert.doesNotMatch(source, /ARRAY\[[\s\S]*'evidenceRequirements'[\s\S]*\]/, '迁移不应清理赛道必备项字段')
    assert.doesNotMatch(source, /RETURN result - 'trackTimelines'/, '迁移不应删除历史赛道时间节点快照')
    assert.match(source, /fieldBindings/, '迁移未覆盖新版分层绑定配置')
    assert.match(source, /winloop_mapping_has_stale_keys/, '迁移缺少递归残留校验')
    assert.match(source, /SELECT 'contest_mapping_stale'/, '迁移缺少竞赛配置残留校验')
    assert.match(source, /SELECT 'track_mapping_stale'/, '迁移缺少赛道配置残留校验')
    assert.match(source, /SELECT 'release_snapshot_stale'/, '迁移缺少 release snapshot 残留校验')
  })
})
