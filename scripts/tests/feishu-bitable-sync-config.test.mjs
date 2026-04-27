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
    const policy = buildDefaultSyncItemConfig('policy')
    const persona = buildDefaultSyncItemConfig('persona')

    assert.equal(contest.mapping.externalIdField, '')
    assert.deepEqual(contest.options, {})
    assert.equal(Object.prototype.hasOwnProperty.call(contest.mapping.fieldMap, 'organizer'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(contest.mapping.fieldMap, 'coOrganizer'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(contest.mapping.fieldMap, 'participantRequirements'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(contest.mapping.fieldMap, 'teamRule'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(contest.mapping.fieldMap, 'currentSeason'), false)
    assert.equal(track.mapping.contestExternalIdField, '')
    assert.equal(Object.prototype.hasOwnProperty.call(track.mapping.fieldMap, 'organizer'), true)
    assert.equal(Object.prototype.hasOwnProperty.call(track.mapping.fieldMap, 'currentSeason'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(track.mapping.fieldMap, 'evidenceRequirements'), true)
    assert.equal(track.options.contestId, '')
    assert.equal(resource.mapping.trackExternalIdField, '')
    assert.equal(resource.options.defaultVisibility, 'internal')
    assert.equal(resource.writeback.values.success, '已同步')
    assert.equal(resource.writeback.values.failed, '失败')
    assert.equal(resource.writeback.values.skipped, '跳过')
    assert.equal(contest.autoSync.enabled, false)
    assert.equal(contest.autoSync.recordStatusField, '记录状态')
    assert.equal(contest.autoSync.syncStatusField, '同步信息')
    assert.deepEqual(contest.autoSync.completedValues, ['已完成'])
    assert.deepEqual(contest.autoSync.pendingValues, ['未同步'])
    assert.deepEqual(contest.autoSync.syncedValues, ['已同步'])
    assert.equal(contest.autoSync.resetRecordStatusValue, '撰写中')
    assert.equal(contest.autoSync.resetSyncStatusValue, '未同步')
    assert.equal(contest.autoSync.useMappedFieldsAsWatched, true)
    assert.equal(policy.mapping.externalIdField, '')
    assert.equal(policy.mapping.fieldMap.meetingName, '')
    assert.equal(persona.mapping.contestExternalIdField, '')
    assert.equal(persona.mapping.fieldMap.object, '')
    assert.equal(persona.mapping.fieldMap.persona1, '')
    assert.equal(persona.mapping.fieldMap.persona5, '')
    assert.deepEqual(persona.options, {})
  })

  it('能按来源名称猜测 entityType 并生成推荐同步项名称', async () => {
    const {
      buildSuggestedSyncItemName,
      listRequiredSyncItemFieldGroups,
      listRequiredSyncItemFieldKeys,
      suggestSyncItemEntityType,
    } = await loadModule()

    assert.equal(suggestSyncItemEntityType({ tableName: '赛道库' }), 'track')
    assert.equal(suggestSyncItemEntityType({ tableName: '竞赛主表' }), 'contest')
    assert.equal(suggestSyncItemEntityType({ tableName: '资料中心', viewName: '公开资源' }), 'resource')
    assert.equal(suggestSyncItemEntityType({ tableName: '答辩评委人设库' }), 'persona')
    assert.equal(suggestSyncItemEntityType({ tableName: '大会政策库' }), 'policy')
    assert.equal(suggestSyncItemEntityType({ tableName: '未命名子表' }), null)

    assert.equal(buildSuggestedSyncItemName('track', '赛道库', '启用视图'), '赛道库 / 启用视图 · 赛道同步')
    assert.equal(buildSuggestedSyncItemName('contest', '竞赛库', ''), '竞赛库 · 竞赛同步')
    assert.equal(buildSuggestedSyncItemName('persona', '评委人设库', '启用视图'), '评委人设库 / 启用视图 · 人设同步')
    assert.equal(buildSuggestedSyncItemName('policy', '政策库', ''), '政策库 · 政策同步')
    assert.deepEqual(listRequiredSyncItemFieldKeys('contest'), ['externalId', 'name', 'officialUrl'])
    assert.deepEqual(listRequiredSyncItemFieldKeys('track'), ['externalId', 'contestExternalId', 'name'])
    assert.deepEqual(listRequiredSyncItemFieldKeys('policy'), ['externalId', 'meetingName'])
    assert.deepEqual(listRequiredSyncItemFieldKeys('persona'), ['externalId', 'contestExternalId', 'object'])
    assert.deepEqual(
      listRequiredSyncItemFieldGroups('persona'),
      [
        { keys: ['externalId'], label: 'externalId', mode: 'all' },
        { keys: ['contestExternalId'], label: 'contestExternalId', mode: 'all' },
        { keys: ['object'], label: 'object', mode: 'all' },
        { keys: ['persona1', 'persona2', 'persona3', 'persona4', 'persona5'], label: 'persona1~5 任一槽位', mode: 'any' },
      ],
    )
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
