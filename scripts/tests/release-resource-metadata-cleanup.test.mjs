import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  sanitizeContestReleaseResourceMetadata,
  sanitizeContestReleaseResourceSnapshot,
  sanitizeContestReleaseSnapshot,
} from '../../server/utils/release-resource-metadata.ts'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('资料库 legacy metadata 清理', () => {
  it('会移除资源 metadata 中已废弃的关联信息文本并保留其他字段', () => {
    const sanitized = sanitizeContestReleaseResourceMetadata({
      contestRelationInfo: '旧竞赛文本',
      trackRelationInfo: '旧赛道文本',
      recordId: 'rec_1',
      source: 'feishu_bitable',
      trackId: 'track_live_1',
    })

    assert.deepEqual(sanitized, {
      recordId: 'rec_1',
      source: 'feishu_bitable',
      trackId: 'track_live_1',
    })
  })

  it('会清理单条资源快照中的 legacy metadata', () => {
    const resource = sanitizeContestReleaseResourceSnapshot({
      externalId: 'resource_ext_1',
      contestExternalId: 'contest_ext_1',
      title: '资料 1',
      category: 'basic_info',
      url: 'https://example.com/a',
      metadata: {
        contestRelationInfo: '旧竞赛文本',
        trackRelationInfo: '旧赛道文本',
        source: 'feishu_bitable',
      },
    })

    assert.deepEqual(resource.metadata, {
      source: 'feishu_bitable',
    })
  })

  it('会批量清理 release snapshot.resources 下的 legacy metadata', () => {
    const snapshot = sanitizeContestReleaseSnapshot({
      contestExternalId: 'contest_ext_1',
      contest: null,
      tracks: [],
      timelines: [],
      trackTimelines: [],
      resources: [
        {
          externalId: 'resource_ext_1',
          contestExternalId: 'contest_ext_1',
          title: '资料 1',
          category: 'basic_info',
          url: 'https://example.com/a',
          metadata: {
            contestRelationInfo: '旧竞赛文本',
            trackRelationInfo: '旧赛道文本',
            recordId: 'rec_1',
          },
        },
        {
          externalId: 'resource_ext_2',
          contestExternalId: 'contest_ext_1',
          title: '资料 2',
          category: 'basic_info',
          url: 'https://example.com/b',
          metadata: {
            source: 'manual',
          },
        },
      ],
    })

    assert.deepEqual(snapshot.resources[0]?.metadata, {
      recordId: 'rec_1',
    })
    assert.deepEqual(snapshot.resources[1]?.metadata, {
      source: 'manual',
    })
  })

  it('release-store 已在草稿、基线和发布路径使用统一清洗函数', async () => {
    const helperSource = await readSource('server/utils/release-resource-metadata.ts')
    const releaseStoreSource = await readSource('server/utils/release-store.ts')

    assert.match(helperSource, /export function sanitizeContestReleaseResourceMetadata\(/, '缺少资源 metadata 清洗函数')
    assert.match(helperSource, /export function sanitizeContestReleaseResourceSnapshot\(/, '缺少资源快照清洗函数')
    assert.match(helperSource, /export function sanitizeContestReleaseSnapshot\(/, '缺少资源集合快照清洗函数')
    assert.match(releaseStoreSource, /const metadata = sanitizeContestReleaseResourceMetadata\(item\.metadata\)/, 'live 基线快照未清洗 legacy metadata')
    assert.match(releaseStoreSource, /sanitizeContestReleaseResourceSnapshot\(input\.resource\)/, '资源草稿写入前未清洗 legacy metadata')
    assert.match(releaseStoreSource, /const sanitizedCurrent = sanitizeContestReleaseSnapshot\(current\)/, '草稿快照持久化前未统一清洗')
    assert.match(releaseStoreSource, /\.\.\.sanitizeContestReleaseResourceMetadata\(resource\.metadata\)/, '发布写回 live 资源前未清洗 legacy metadata')
  })
})
