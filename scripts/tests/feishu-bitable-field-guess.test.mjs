import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const TARGET_FILE = pathToFileURL(resolve(process.cwd(), 'shared/utils/feishu-bitable-field-guess.ts')).href

async function loadModule() {
  return import(TARGET_FILE)
}

describe('feishu-bitable-field-guess', () => {
  it('会按实体语义猜测关键映射字段', async () => {
    const { guessFeishuBitableFieldName } = await loadModule()

    assert.equal(
      guessFeishuBitableFieldName({
        entityType: 'persona',
        targetKey: 'contestExternalId',
        fields: ['对象', '对应竞赛', '人设一'],
      }),
      '对应竞赛',
    )
    assert.equal(
      guessFeishuBitableFieldName({
        entityType: 'policy',
        targetKey: 'meetingName',
        fields: ['会议编号', '大会名称'],
      }),
      '大会名称',
    )
    assert.equal(
      guessFeishuBitableFieldName({
        entityType: 'policy',
        targetKey: 'externalId',
        fields: ['会议编号', '大会名称'],
      }),
      '会议编号',
    )
  })

  it('会兼容人设槽位数字、中文数字和 prompt 别名', async () => {
    const { guessFeishuBitableFieldName } = await loadModule()

    for (const fieldName of ['人设一', '人设 1', 'prompt1', '提示词1']) {
      assert.equal(
        guessFeishuBitableFieldName({
          entityType: 'persona',
          targetKey: 'persona1',
          fields: [fieldName],
        }),
        fieldName,
      )
    }
  })

  it('调用方只填充空映射时不会覆盖已有映射', async () => {
    const { guessFeishuBitableFieldName } = await loadModule()
    const binding = {
      targetKey: 'persona1',
      sourceField: '已有字段',
    }
    const nextBinding = binding.sourceField
      ? binding
      : {
          ...binding,
          sourceField: guessFeishuBitableFieldName({
            entityType: 'persona',
            targetKey: binding.targetKey,
            fields: ['人设一'],
          }),
        }

    assert.equal(nextBinding.sourceField, '已有字段')
  })
})
