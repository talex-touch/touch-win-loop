import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const TARGET_FILE = pathToFileURL(resolve(process.cwd(), 'shared/utils/feishu-bitable-sync-config.ts')).href

async function loadModule() {
  return import(TARGET_FILE)
}

describe('feishu-bitable-sync-config', () => {
  it('按 entityType 生成推荐默认模板', async () => {
    const { buildDefaultSyncItemConfig } = await loadModule()

    const contest = buildDefaultSyncItemConfig('contest')
    const track = buildDefaultSyncItemConfig('track')
    const resource = buildDefaultSyncItemConfig('resource')

    assert.equal(contest.mapping.externalIdField, '')
    assert.deepEqual(contest.options, {})
    assert.equal(track.mapping.contestExternalIdField, '')
    assert.equal(track.options.contestId, '')
    assert.equal(resource.mapping.trackExternalIdField, '')
    assert.equal(resource.options.defaultVisibility, 'internal')
    assert.equal(resource.writeback.values.success, '已同步')
    assert.equal(resource.writeback.values.failed, '失败')
    assert.equal(resource.writeback.values.skipped, '跳过')
  })

  it('能按来源名称猜测 entityType 并生成推荐同步项名称', async () => {
    const {
      buildSuggestedSyncItemName,
      listRequiredSyncItemFieldKeys,
      suggestSyncItemEntityType,
    } = await loadModule()

    assert.equal(suggestSyncItemEntityType({ tableName: '赛道库' }), 'track')
    assert.equal(suggestSyncItemEntityType({ tableName: '竞赛主表' }), 'contest')
    assert.equal(suggestSyncItemEntityType({ tableName: '资料中心', viewName: '公开资源' }), 'resource')
    assert.equal(suggestSyncItemEntityType({ tableName: '未命名子表' }), null)

    assert.equal(buildSuggestedSyncItemName('track', '赛道库', '启用视图'), '赛道库 / 启用视图 · 赛道同步')
    assert.equal(buildSuggestedSyncItemName('contest', '竞赛库', ''), '竞赛库 · 竞赛同步')
    assert.deepEqual(listRequiredSyncItemFieldKeys('contest'), ['externalId', 'name', 'officialUrl'])
    assert.deepEqual(listRequiredSyncItemFieldKeys('track'), ['externalId', 'contestExternalId', 'name'])
  })

  it('只把真正空配置判定为空，避免覆盖已有配置', async () => {
    const { isSyncItemConfigEmpty } = await loadModule()

    assert.equal(isSyncItemConfigEmpty(null), true)
    assert.equal(isSyncItemConfigEmpty(''), true)
    assert.equal(isSyncItemConfigEmpty({ externalIdField: '', fieldMap: { name: '' } }), true)
    assert.equal(isSyncItemConfigEmpty({ externalIdField: 'external_id' }), false)
    assert.equal(isSyncItemConfigEmpty({ values: { success: '已同步' } }), false)
  })
})
