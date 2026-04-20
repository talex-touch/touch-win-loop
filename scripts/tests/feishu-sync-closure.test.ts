import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, vi } from 'vitest'
import {
  autoResolveFeishuSyncIssueByRecord,
  searchFeishuSyncedData,
  upsertFeishuSyncIssue,
} from '../../server/utils/feishu-integration-store'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {},
    secureConfig: {},
  }),
}))

function createQueryRecorder(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ text: string, values: unknown[] }> = []
  return {
    calls,
    db: {
      async query(text: string, values: unknown[] = []) {
        calls.push({ text, values })
        return { rows }
      },
    },
  }
}

describe('feishu sync issue closure', () => {
  it('自动解决同一同步项、记录和 externalId 的 open issue', async () => {
    const recorder = createQueryRecorder([{ resolved_count: '1' }])

    const resolvedCount = await autoResolveFeishuSyncIssueByRecord(recorder.db, {
      actorUserId: 'user_admin',
      syncItemId: 'sync_item_1',
      recordId: 'record_1',
      externalId: 'contest_1',
      resolutionPayload: { runId: 'run_1' },
    })

    assert.equal(resolvedCount, 1)
    assert.equal(recorder.calls.length, 1)
    assert.match(recorder.calls[0].text, /status = 'resolved'/)
    assert.match(recorder.calls[0].text, /resolution = 'auto_recovered'/)
    assert.match(recorder.calls[0].text, /AND status = 'open'/)
    assert.deepEqual(recorder.calls[0].values.slice(0, 4), [
      'user_admin',
      'sync_item_1',
      'record_1',
      'contest_1',
    ])
  })

  it('缺少定位键时不改动 issue 状态', async () => {
    const recorder = createQueryRecorder([{ resolved_count: '1' }])

    const resolvedCount = await autoResolveFeishuSyncIssueByRecord(recorder.db, {
      actorUserId: 'user_admin',
      syncItemId: 'sync_item_1',
      recordId: '',
      externalId: 'contest_1',
    })

    assert.equal(resolvedCount, 0)
    assert.equal(recorder.calls.length, 0)
  })

  it('再次失败会重开 resolved 问题，但保留 ignored 问题状态', async () => {
    const recorder = createQueryRecorder([{
      id: 'issue_1',
      sync_item_id: 'sync_item_1',
      entity_type: 'contest',
      record_id: 'record_1',
      external_id: 'contest_1',
      status: 'ignored',
      reason_code: 'MISSING_REQUIRED_FIELD',
      message: '竞赛记录缺少必要字段。',
      payload: { hasName: false },
      resolution: 'ignored',
      resolution_payload: { reason: '人工确认忽略' },
      resolved_by_user_id: 'user_admin',
      resolved_at: '2026-04-20T10:00:00.000Z',
      created_at: '2026-04-20T09:00:00.000Z',
      updated_at: '2026-04-20T10:00:00.000Z',
    }])

    const issue = await upsertFeishuSyncIssue(recorder.db, {
      syncItemId: 'sync_item_1',
      entityType: 'contest',
      recordId: 'record_1',
      externalId: 'contest_1',
      reasonCode: 'MISSING_REQUIRED_FIELD',
      message: '竞赛记录缺少必要字段。',
      payload: { hasName: false },
    })

    assert.equal(issue.status, 'ignored')
    assert.equal(issue.resolution, 'ignored')
    assert.match(recorder.calls[0].text, /WHEN feishu_sync_issues\.status = 'ignored' THEN feishu_sync_issues\.status/)
    assert.match(recorder.calls[0].text, /ELSE 'open'/)
  })
})

describe('feishu synced data release draft rows', () => {
  it('查询纳入飞书导入生成的 release draft 行', async () => {
    const recorder = createQueryRecorder([{
      status: 'release_draft',
      scope: 'contest',
      sync_id: 'sync_1',
      sync_name: '菁同步',
      sync_item_id: 'sync_item_1',
      sync_item_name: '竞赛库',
      title: '测试竞赛',
      summary: '摘要',
      body: '',
      external_id: 'contest_1',
      entity_id: 'release_1:contest:contest_1',
      record_id: '',
      run_id: 'run_1',
      keywords: ['AI'],
      metadata: {
        releaseVersionId: 'release_1',
        releaseStatus: 'pending_first_review',
        syncRunId: 'run_1',
      },
      created_at: '2026-04-20T09:00:00.000Z',
      updated_at: '2026-04-20T10:00:00.000Z',
      total_count: 1,
    }])

    const result = await searchFeishuSyncedData(recorder.db, {
      syncId: 'sync_1',
      page: 1,
      pageSize: 20,
    })

    assert.equal(result.total, 1)
    assert.equal(result.items[0].status, 'release_draft')
    assert.equal(result.items[0].metadata.releaseVersionId, 'release_1')
    assert.equal(result.items[0].metadata.releaseStatus, 'pending_first_review')
    assert.match(recorder.calls[0].text, /release_contest_rows AS/)
    assert.match(recorder.calls[0].text, /release_track_rows AS/)
    assert.match(recorder.calls[0].text, /release_resource_rows AS/)
    assert.match(recorder.calls[0].text, /release_policy_rows AS/)
    assert.match(recorder.calls[0].text, /'release_draft'::TEXT AS status/)
  })

  it('数据页显示 release draft 的业务状态文案', async () => {
    const pageSource = await readFile(
      resolve(process.cwd(), 'app/pages/admin/integrations/feishu/data.vue'),
      'utf8',
    )

    assert.match(pageSource, /status === 'release_draft'/)
    assert.match(pageSource, /草稿\/待审数据/)
  })
})
