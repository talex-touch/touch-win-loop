import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('飞书多维表格版本草稿链路', () => {
  it('同步项编辑器仍然使用当前草稿做预检并本地回写保存结果', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')
    const saveBlockMatch = componentSource.match(/async function saveCurrentItem\(saveContext: SaveCurrentItemContext = 'main'\) \{([\s\S]*?)\n\}\n\nasync function toggleItemEnabled/)

    assert.match(componentSource, /const draft: FeishuBitableSyncItemPreviewRequest = \{/, '编辑器没有构造草稿预检请求')
    assert.match(componentSource, /source:\s*\{[\s\S]*appToken:[\s\S]*tableId:[\s\S]*viewId:/, '预检请求缺少来源草稿')
    assert.match(componentSource, /mapping,\s*options,\s*writeback,/, '预检请求缺少映射\/选项\/回填草稿')
    assert.ok(saveBlockMatch, '未找到同步项保存逻辑')
    const saveBlock = saveBlockMatch[1]
    assert.match(saveBlock, /applySavedItemLocally\(data\)/, '保存后没有本地回写同步项状态')
    assert.doesNotMatch(saveBlock, /await loadSyncDetail\(/, '保存同步项后不应隐式整页重载')
    assert.doesNotMatch(saveBlock, /await loadItemDetail\(/, '保存同步项后不应再次拉取当前项详情')
  })

  it('竞赛库映射已经统一为时间节点文本，并暴露适配人群字段', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')
    const configSource = await readSource('shared/utils/feishu-bitable-sync-config.ts')
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')

    assert.match(componentSource, /timelineText（时间节点）/, '竞赛映射未使用统一时间节点字段')
    assert.match(componentSource, /recommendedFor（适配人群）/, '竞赛映射缺少适配人群字段')
    assert.match(configSource, /if \(entityType === 'contest'\) \{[\s\S]*timelineText:\s*''[\s\S]*recommendedFor:\s*''/, '竞赛默认模板未切到 timelineText / recommendedFor')
    assert.match(serviceSource, /const timelineText = toText\(timelineTextRaw\)[\s\S]*registrationWindow[\s\S]*submissionDeadline/, '竞赛同步未兼容旧时间字段并收敛到 timelineText')
    assert.match(serviceSource, /const timelines = buildContestReleaseTimelines\(input\.externalId, timelineText\)/, '竞赛同步未从统一时间文本构建节点快照')
  })

  it('资料库与政策库映射已经切到新字段集，并支持政策实体类型', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')
    const configSource = await readSource('shared/utils/feishu-bitable-sync-config.ts')
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')
    const createApiSource = await readSource('server/api/admin/integrations/feishu/bitable-syncs/[id]/items/index.post.ts')
    const patchApiSource = await readSource('server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId].patch.ts')

    assert.match(componentSource, /attachment（附件）/, '资料映射缺少附件字段')
    assert.match(componentSource, /attachmentSummary（附件摘要）/, '资料映射缺少附件摘要字段')
    assert.doesNotMatch(componentSource, /contestRelationInfo（竞赛关联信息文本）/, '资料映射不应再暴露竞赛关联信息文本字段')
    assert.doesNotMatch(componentSource, /trackRelationInfo（赛道关联信息文本）/, '资料映射不应再暴露赛道关联信息文本字段')
    assert.doesNotMatch(configSource, /contestRelationInfo:\s*''/, '资料默认模板不应再包含竞赛关联信息文本字段')
    assert.doesNotMatch(configSource, /trackRelationInfo:\s*''/, '资料默认模板不应再包含赛道关联信息文本字段')
    assert.match(componentSource, /value: 'policy', label: '政策'/, '编辑器未提供政策实体类型')
    assert.match(componentSource, /meetingName（会议名称）/, '政策映射缺少会议名称字段')
    assert.match(componentSource, /officialMaterialLink（官网资料链接）/, '政策映射缺少官网资料链接字段')
    assert.match(configSource, /if \(entityType === 'policy'\) \{[\s\S]*meetingName:\s*''[\s\S]*xiaohongshuMaterialLink:\s*''/, '政策默认模板未补齐完整字段')
    assert.match(serviceSource, /attachmentSummary/, '资料同步缺少附件摘要字段')
    assert.doesNotMatch(serviceSource, /contestRelationInfo/, '资料同步不应再读取竞赛关联信息文本')
    assert.doesNotMatch(serviceSource, /trackRelationInfo/, '资料同步不应再读取赛道关联信息文本')
    assert.match(serviceSource, /async function applyPolicyRecord\(/, '服务端未接入政策同步')
    assert.match(serviceSource, /upsertPolicyLibraryReleaseDraft/, '政策同步未写入版本草稿')
    assert.match(createApiSource, /'policy'/, '新增同步项接口未接受 policy 实体类型')
    assert.match(patchApiSource, /'policy'/, '更新同步项接口未接受 policy 实体类型')
    assert.match(createApiSource, /entityType 不支持：\$\{rawEntityType\}。/, '新增同步项接口未返回可定位的 entityType 错误')
  })

  it('服务端预检与执行都已经围绕 release draft，而不是直接写 live 数据', async () => {
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')

    assert.match(serviceSource, /upsertContestReleaseDraft/, '竞赛相关同步未写入 release draft')
    assert.match(serviceSource, /entityId: draft\.version\.id/, '同步返回结果未回填 release version id')
    assert.match(serviceSource, /scopeKind: 'contest'/, '竞赛预检未基于 contest release scope 判断')
    assert.match(serviceSource, /upsertPolicyLibraryReleaseDraft/, '政策同步未写入 policy library release draft')
    assert.doesNotMatch(serviceSource, /syncContestDerivedTimelineNodes\(/, '同步链路不应回退到直接写 live 时间节点')
    assert.doesNotMatch(serviceSource, /syncTrackRubric\(/, '同步链路不应回退到直接派生 live rubric')
  })
})
