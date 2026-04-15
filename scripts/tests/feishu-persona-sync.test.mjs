import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const TARGET_FILE = pathToFileURL(resolve(process.cwd(), 'shared/utils/feishu-persona-sync.ts')).href

async function loadModule() {
  return import(TARGET_FILE)
}

describe('feishu-persona-sync', () => {
  it('按对象与非空槽位拆分 persona 草稿，并派生外部 ID / 名称 / 摘要 / 排序', async () => {
    const { buildFeishuPersonaSyncDrafts } = await loadModule()
    const drafts = buildFeishuPersonaSyncDrafts({
      sourceExternalId: 'persona-source',
      contestExternalId: 'contest-2026',
      object: 'ICPC',
      personaTexts: [
        '你是第一个人设，请重点追问工程实现和复杂度控制。',
        '',
        '你是第三个人设，请重点追问算法证明、边界情况和评测设计。',
        null,
        '   ',
      ],
      recordId: 'rec_persona_1',
      recordIndex: 2,
    })

    assert.deepEqual(
      drafts.map(item => ({
        externalId: item.externalId,
        name: item.name,
        sortOrder: item.sortOrder,
        slotIndex: item.slotIndex,
      })),
      [
        {
          externalId: 'persona-source:1',
          name: 'ICPC · 人设1',
          sortOrder: 21,
          slotIndex: 1,
        },
        {
          externalId: 'persona-source:3',
          name: 'ICPC · 人设3',
          sortOrder: 23,
          slotIndex: 3,
        },
      ],
    )
    assert.equal(drafts[0]?.metadata.object, 'ICPC')
    assert.equal(drafts[0]?.metadata.sourceExternalId, 'persona-source')
    assert.equal(drafts[0]?.metadata.recordId, 'rec_persona_1')
    assert.match(drafts[0]?.summary || '', /工程实现和复杂度控制/)
  })

  it('会统计已填槽位数量，并生成聚合状态与行级摘要', async () => {
    const {
      countFeishuPersonaFilledSlots,
      pickFeishuPersonaAggregateStatus,
      summarizeFeishuPersonaRowResult,
    } = await loadModule()

    assert.equal(countFeishuPersonaFilledSlots(['A', '', '  ', 'B']), 2)
    assert.equal(pickFeishuPersonaAggregateStatus({ createdCount: 1, updatedCount: 0, skippedCount: 0 }), 'created')
    assert.equal(pickFeishuPersonaAggregateStatus({ createdCount: 1, updatedCount: 1, skippedCount: 0 }), 'updated')
    assert.equal(pickFeishuPersonaAggregateStatus({ createdCount: 0, updatedCount: 0, skippedCount: 2 }), 'skipped')
    assert.equal(
      summarizeFeishuPersonaRowResult({
        createdCount: 1,
        updatedCount: 1,
        skippedCount: 0,
      }),
      '本行拆分 2 个人设：新增 1，更新 1，跳过 0。',
    )
  })

  it('会按本次活跃 externalId 计算需要清理的历史派生项', async () => {
    const {
      computeFeishuPersonaStaleExternalIds,
      shouldCleanupFeishuPersonaStaleData,
    } = await loadModule()

    assert.deepEqual(
      computeFeishuPersonaStaleExternalIds({
        existingExternalIds: [
          'persona-source',
          'persona-source:1',
          'persona-source:2',
          'persona-source:3',
          'persona-source:3',
        ],
        activeExternalIds: ['persona-source:1', 'persona-source:2'],
      }),
      ['persona-source', 'persona-source:3'],
    )
    assert.equal(
      shouldCleanupFeishuPersonaStaleData({
        fetchedCount: 0,
        activeExternalIds: [],
      }),
      true,
    )
    assert.equal(
      shouldCleanupFeishuPersonaStaleData({
        fetchedCount: 3,
        activeExternalIds: ['persona-source:1'],
      }),
      true,
    )
    assert.equal(
      shouldCleanupFeishuPersonaStaleData({
        fetchedCount: 3,
        activeExternalIds: [],
      }),
      false,
    )
  })
})
