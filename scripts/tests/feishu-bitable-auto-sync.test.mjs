import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const SERVICE_FILE = pathToFileURL(resolve(process.cwd(), 'server/services/feishu/bitable-auto-sync.ts')).href
const CONFIG_FILE = pathToFileURL(resolve(process.cwd(), 'shared/utils/feishu-bitable-sync-config.ts')).href

async function loadModules() {
  const [serviceModule, configModule] = await Promise.all([
    import(SERVICE_FILE),
    import(CONFIG_FILE),
  ])
  return {
    ...serviceModule,
    ...configModule,
  }
}

describe('feishu-bitable-auto-sync', () => {
  it('会用实体默认模板补齐自动同步配置', async () => {
    const { normalizeFeishuBitableAutoSyncConfig } = await loadModules()

    const config = normalizeFeishuBitableAutoSyncConfig('contest', {})

    assert.equal(config.enabled, false)
    assert.equal(config.recordStatusField, '记录状态')
    assert.equal(config.syncStatusField, '同步信息')
    assert.deepEqual(config.completedValues, ['已完成'])
    assert.deepEqual(config.pendingValues, ['未同步'])
    assert.deepEqual(config.syncedValues, ['已同步'])
    assert.equal(config.resetRecordStatusValue, '撰写中')
    assert.equal(config.resetSyncStatusValue, '未同步')
    assert.equal(config.useMappedFieldsAsWatched, true)
  })

  it('会按映射字段、额外监听字段、回填字段和忽略字段计算业务字段集合', async () => {
    const {
      buildDefaultSyncItemConfig,
      computeFeishuBitableWatchedFieldNames,
      normalizeFeishuBitableAutoSyncConfig,
    } = await loadModules()

    const defaults = buildDefaultSyncItemConfig('contest')
    const autoSync = normalizeFeishuBitableAutoSyncConfig('contest', {
      watchedFieldNames: ['补充说明', '忽略我'],
      ignoredFieldNames: ['官网', '忽略我'],
    })

    const watchedFieldNames = computeFeishuBitableWatchedFieldNames({
      autoSync,
      mapping: {
        ...defaults.mapping,
        externalIdField: '业务编号',
        fieldMap: {
          ...defaults.mapping.fieldMap,
          name: '名称',
          officialUrl: '官网',
          timelineText: '时间节点',
        },
      },
      writeback: {
        ...defaults.writeback,
        fields: {
          ...defaults.writeback.fields,
          status: '同步信息',
          syncedAt: '同步时间',
        },
      },
    })

    assert.deepEqual(watchedFieldNames.sort(), ['业务编号', '名称', '时间节点', '补充说明'].sort())
  })

  it('已完成且未同步时会触发自动同步', async () => {
    const {
      buildDefaultSyncItemConfig,
      decideFeishuBitableAutoSyncAction,
      normalizeFeishuBitableAutoSyncConfig,
    } = await loadModules()

    const defaults = buildDefaultSyncItemConfig('contest')
    const decision = decideFeishuBitableAutoSyncAction({
      action: 'record_added',
      changedFieldNames: [],
      record: {
        recordId: 'rec_sync',
        fields: {
          记录状态: '已完成',
          同步信息: '未同步',
        },
      },
      autoSync: normalizeFeishuBitableAutoSyncConfig('contest', { enabled: true }),
      mapping: defaults.mapping,
      writeback: defaults.writeback,
    })

    assert.equal(decision.kind, 'sync')
    assert.equal(decision.reason, 'completed_pending_sync')
  })

  it('已完成且已同步的记录在业务字段变更后会先重置状态', async () => {
    const {
      buildDefaultSyncItemConfig,
      decideFeishuBitableAutoSyncAction,
      normalizeFeishuBitableAutoSyncConfig,
    } = await loadModules()

    const defaults = buildDefaultSyncItemConfig('contest')
    const decision = decideFeishuBitableAutoSyncAction({
      action: 'record_edited',
      changedFieldNames: ['名称', '同步时间'],
      record: {
        recordId: 'rec_reset',
        fields: {
          记录状态: '已完成',
          同步信息: '已同步',
          名称: '新的竞赛名称',
        },
      },
      autoSync: normalizeFeishuBitableAutoSyncConfig('contest', { enabled: true }),
      mapping: {
        ...defaults.mapping,
        fieldMap: {
          ...defaults.mapping.fieldMap,
          name: '名称',
        },
      },
      writeback: {
        ...defaults.writeback,
        fields: {
          ...defaults.writeback.fields,
          syncedAt: '同步时间',
        },
      },
    })

    assert.equal(decision.kind, 'reset')
    assert.equal(decision.reason, 'business_change_reset')
    assert.deepEqual(decision.effectiveChangedFieldNames, ['名称'])
  })

  it('仅状态字段或回填字段变化时不会触发重置或自动同步', async () => {
    const {
      buildDefaultSyncItemConfig,
      decideFeishuBitableAutoSyncAction,
      normalizeFeishuBitableAutoSyncConfig,
    } = await loadModules()

    const defaults = buildDefaultSyncItemConfig('contest')
    const decision = decideFeishuBitableAutoSyncAction({
      action: 'record_edited',
      changedFieldNames: ['同步信息', '同步时间', '同步任务'],
      record: {
        recordId: 'rec_ignore',
        fields: {
          记录状态: '已完成',
          同步信息: '已同步',
        },
      },
      autoSync: normalizeFeishuBitableAutoSyncConfig('contest', { enabled: true }),
      mapping: defaults.mapping,
      writeback: {
        ...defaults.writeback,
        fields: {
          ...defaults.writeback.fields,
          syncedAt: '同步时间',
          runId: '同步任务',
        },
      },
    })

    assert.equal(decision.kind, 'ignore')
    assert.equal(decision.reason, 'writeback_only_change')
    assert.deepEqual(decision.effectiveChangedFieldNames, [])
  })
})
