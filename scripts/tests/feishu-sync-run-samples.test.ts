import assert from 'node:assert/strict'
import { describe, it, vi } from 'vitest'
import { replaceFeishuBitableSyncRunSamples } from '../../server/utils/feishu-integration-store'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {},
    secureConfig: {},
  }),
}))

function createQueryRecorder() {
  const calls: Array<{ text: string, values: unknown[] }> = []
  return {
    calls,
    db: {
      async query(text: string, values: unknown[] = []) {
        calls.push({ text, values })
        return { rows: [] }
      },
    },
  }
}

describe('feishu sync run samples persistence', () => {
  it('会先清空旧样本，再批量写入新样本并保留稳定 sample_index', async () => {
    const recorder = createQueryRecorder()

    await replaceFeishuBitableSyncRunSamples(recorder.db, {
      runId: 'run_1',
      syncItemId: 'sync_item_1',
      samples: [
        {
          sampleType: 'auto_sync_filtered',
          sampleIndex: 1,
          recordId: 'record_1',
          reasonCode: 'record_status',
          payload: { recordStatus: '撰写中' },
        },
        {
          sampleType: 'business_skipped',
          sampleIndex: 2,
          recordId: 'record_2',
          externalId: 'contest_2',
          reasonCode: 'MISSING_REQUIRED_FIELD',
          payload: { missingFields: ['externalId'] },
        },
      ],
    })

    assert.equal(recorder.calls.length, 2)
    assert.match(recorder.calls[0].text, /DELETE FROM feishu_bitable_sync_run_samples/)
    assert.deepEqual(recorder.calls[0].values, ['run_1'])
    assert.match(recorder.calls[1].text, /INSERT INTO feishu_bitable_sync_run_samples/)
    assert.match(recorder.calls[1].text, /sample_index/)
    assert.equal(recorder.calls[1].values[1], 'run_1')
    assert.equal(recorder.calls[1].values[2], 'sync_item_1')
    assert.equal(recorder.calls[1].values[4], 1)
    assert.equal(recorder.calls[1].values[13], 2)
  })
})
