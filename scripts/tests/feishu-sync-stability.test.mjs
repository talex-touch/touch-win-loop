import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('飞书多维同步稳定性修复', () => {
  it('执行链路会收紧 authoritative prune，并在手动执行前阻断缺失关联映射的同步项', async () => {
    const [serviceSource, runApiSource, editorSource] = await Promise.all([
      readSource('server/services/feishu/bitable-sync.ts'),
      readSource('server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/run.post.ts'),
      readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue'),
    ])

    assert.match(serviceSource, /export function getFeishuSyncItemManualRunBlockReason\(input: \{/, '服务端缺少手动执行关联预检 helper')
    assert.match(serviceSource, /const successfulBusinessExternalIds = new Set<string>\(\)/, '执行链路未改用成功业务实体集合做 prune 保护')
    assert.match(serviceSource, /if \(input\.entityType !== 'persona' && result\.status !== 'skipped' && toText\(result\.externalId\)\)/, '执行链路仍会把被跳过记录算进 prune externalId 集合')
    assert.match(serviceSource, /&& successfulBusinessExternalIds\.size > 0/, 'authoritative prune 未要求本轮至少命中一个有效业务实体')
    assert.match(serviceSource, /const authoritativePrune = mode === 'full' && deltaRecordIds\.length === 0 && autoSync\.enabled !== true/, '自动同步开启时 full run 不应触发权威清理')
    assert.match(serviceSource, /preserveExternalIds: \[\.\.\.successfulBusinessExternalIds\]/, 'authoritative prune 未使用成功业务实体 externalId 作为保留集合')
    assert.match(serviceSource, /缺少 contestExternalId 映射，也没有默认 contestId 兜底/, '服务端未提供 contest 关联缺失阻断提示')
    assert.match(serviceSource, /缺少 trackExternalId 映射。请先在“映射配置”补齐对应赛道字段后再手动执行。/, '服务端未提供 track timeline 关联缺失阻断提示')

    assert.match(runApiSource, /const syncId = String\(getRouterParam\(event, 'id'\) \|\| ''\)\.trim\(\)/, '手动执行接口未读取路由 syncId')
    assert.match(runApiSource, /if \(!syncItem \|\| syncItem\.syncId !== syncId\)/, '手动执行接口未校验同步项是否属于当前 syncId')
    assert.match(runApiSource, /const manualRunBlockedReason = getFeishuSyncItemManualRunBlockReason\(\{/, '手动执行接口未接入关联预检')
    assert.match(runApiSource, /return fail\(manualRunBlockedReason/, '手动执行接口未把关联预检结果直接反馈给前端')

    assert.match(editorSource, /const currentItemRelationGuardText = computed\(\(\) => buildManualRunRelationGuardText\(/, '编辑器未计算当前同步项的关联阻断提示')
    assert.match(editorSource, /<a-alert v-if="currentItemRelationGuardText" type="warning" :show-icon="true">/, '编辑器未展示运行前关联阻断提示')
    assert.match(editorSource, /if \(currentItemRelationGuardText\.value\) \{\s+setError\(currentItemRelationGuardText\.value\)\s+return\s+\}/, '编辑器手动执行前未先给出本地阻断反馈')
    assert.match(editorSource, /const itemId = currentItem\.value\.id[\s\S]*currentItemLogVisible\.value = true[\s\S]*await loadCurrentItemLogDetail\(itemId, result\.runId\)/, '编辑器手动执行成功后未用本次同步项和 runId 打开日志')
  })

  it('共享 contest release draft 被其他子表更新后，查询仍按节点级 syncSource 保持竞赛和赛道归属稳定', async () => {
    const storeSource = await readSource('server/utils/feishu-integration-store.ts')

    assert.match(storeSource, /release_contest_rows AS[\s\S]*NULLIF\(rv\.snapshot_json -> 'contest' -> 'syncSource' ->> 'syncItemId', ''\)[\s\S]*LEFT JOIN feishu_bitable_sync_items item ON item\.id = owner_source\.sync_item_id/, '竞赛 release draft 仍未按 contest 节点归属解析同步项')
    assert.match(storeSource, /release_track_rows AS[\s\S]*NULLIF\(track_item\.item -> 'syncSource' ->> 'syncItemId', ''\)[\s\S]*LEFT JOIN feishu_bitable_sync_items item ON item\.id = owner_source\.sync_item_id/, '赛道 release draft 仍未按 track 节点归属解析同步项')
    assert.match(storeSource, /release_track_timeline_rows AS[\s\S]*NULLIF\(timeline_item\.item -> 'syncSource' ->> 'syncItemId', ''\)/, '赛道时间线 release draft 未跟随节点级归属')
    assert.match(storeSource, /release_resource_rows AS[\s\S]*NULLIF\(resource_item\.item -> 'syncSource' ->> 'syncItemId', ''\)/, '资料 release draft 未跟随节点级归属')
    assert.match(storeSource, /WHERE owner_source\.sync_item_id IS NOT NULL/, '共享 release draft 查询仍未按节点级 owner 过滤')
    assert.match(storeSource, /COALESCE\(owner_source\.sync_run_id, ''\) AS run_id/, '共享 release draft 查询仍未按节点级 owner run 暴露 runId')
  })

  it('查询存储层与编辑器问题面板会支持原因码聚合和批量处理', async () => {
    const [storeSource, typeSource, batchApiSource, editorSource] = await Promise.all([
      readSource('server/utils/feishu-integration-store.ts'),
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/issues/batch-handle.post.ts'),
      readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue'),
    ])

    assert.match(typeSource, /export interface FeishuSyncIssueReasonStat \{[\s\S]*reasonCode: string[\s\S]*openCount: number[\s\S]*totalCount: number/, '共享类型未声明问题原因聚合结构')
    assert.match(typeSource, /export interface FeishuSyncIssueBatchHandleResult \{[\s\S]*affectedCount: number/, '共享类型未声明批量问题处理结果')
    assert.match(typeSource, /export interface FeishuBitableSyncItemDetail extends FeishuBitableSyncItem \{[\s\S]*issueReasonStats: FeishuSyncIssueReasonStat\[\]/, '同步项详情类型未暴露问题原因聚合结果')

    assert.match(storeSource, /const \[recentRuns, issues, issueStatsResult, issueReasonStatsResult\] = await Promise\.all\(/, '同步项详情查询未并行读取问题原因聚合')
    assert.match(storeSource, /COUNT\(\*\) FILTER \(WHERE status = 'open'\)::INTEGER AS open_count/, '问题原因聚合未统计 openCount')
    assert.match(storeSource, /issueReasonStats: issueReasonStatsResult\.rows\.map\(toIssueReasonStat\)\.filter\(item => item\.reasonCode\)/, '同步项详情未返回问题原因聚合列表')
    assert.match(storeSource, /export async function resolveFeishuSyncIssuesByFilter\(/, '存储层缺少批量问题处理函数')
    assert.match(storeSource, /'status = \$5'/, '批量问题处理未固定只改当前状态筛选')
    assert.match(storeSource, /where\.push\(`reason_code = \$\$\{values\.length\}`\)/, '批量问题处理未支持原因码筛选')
    assert.match(storeSource, /SELECT[\s\S]*item\.id AS sync_item_id,[\s\S]*item\.name AS sync_item_name,[\s\S]*sync\.id AS sync_id,[\s\S]*sync\.name AS sync_name,[\s\S]*item\.entity_type/, '同步数据同步项选项查询未补齐 entity_type 元数据')

    assert.match(batchApiSource, /contest\.write/, '批量问题处理接口未校验写权限')
    assert.match(batchApiSource, /resolveFeishuSyncIssuesByFilter/, '批量问题处理接口未接入存储层批量处理函数')
    assert.match(batchApiSource, /status = ALLOWED_STATUSES\.has\(body\.status as FeishuSyncIssueStatus\)/, '批量问题处理接口未限制允许的状态筛选')
    assert.match(batchApiSource, /source: 'sync_item_editor_batch'/, '批量问题处理接口未标记批量处理来源')

    assert.match(editorSource, /const currentItemIssueReasonOptions = computed\(\(\) => syncIssueReasonOptions\(currentItem\.value\)\)/, '编辑器当前同步项问题区未派生原因码选项')
    assert.match(editorSource, /const currentItemLogIssueReasonOptions = computed\(\(\) => syncIssueReasonOptions\(currentItemLogItemDetail\.value\)\)/, '编辑器日志问题区未派生原因码选项')
    assert.match(editorSource, /async function handleBatchSyncIssueAction\(target: 'current' \| 'log', action: 'resolve' \| 'ignore'\)/, '编辑器未提供批量问题处理动作')
    assert.match(editorSource, /issues\/batch-handle/, '编辑器未请求批量问题处理接口')
    assert.match(editorSource, /当前范围：仅处理这个同步项下符合筛选条件的待处理问题；本次可批量处理 \{\{ currentItemBatchOpenIssueCount \}\} 条。/, '编辑器当前同步项问题区未提示批量处理范围')
    assert.match(editorSource, /当前范围：仅处理这个同步项下符合筛选条件的待处理问题；本次可批量处理 \{\{ currentItemLogBatchOpenIssueCount \}\} 条。/, '编辑器日志问题区未提示批量处理范围')
    assert.match(editorSource, /watch\(currentItemIssueReasonOptions,\s*\(options\) => \{[\s\S]*currentItemIssueFilters\.reasonCode = ''/, '编辑器未在原因码集合变化时清空失效筛选')
    assert.match(editorSource, /watch\(currentItemLogIssueReasonOptions,\s*\(options\) => \{[\s\S]*currentItemLogIssueFilters\.reasonCode = ''/, '编辑器日志问题区未在原因码集合变化时清空失效筛选')
  })
})
