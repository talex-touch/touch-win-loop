import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('版本审批与赛道同步新流程', () => {
  it('赛道同步映射已覆盖赛道字段，并统一收敛到 timelineText', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')
    const configSource = await readSource('shared/utils/feishu-bitable-sync-config.ts')
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')

    assert.match(componentSource, /coverImageUrl（封面）/, '赛道映射缺少封面字段')
    assert.match(componentSource, /location（具体位置）/, '赛道映射缺少具体位置字段')
    assert.match(componentSource, /organizer（主办方）/, '赛道映射缺少主办方字段')
    assert.match(componentSource, /undertaker（承办方）/, '赛道映射缺少承办方字段')
    assert.match(componentSource, /participantRequirements（参赛对象）/, '赛道映射缺少参赛对象字段')
    assert.match(componentSource, /teamRule（组队规则）/, '赛道映射缺少组队规则字段')
    assert.match(componentSource, /timelineText（时间节点）/, '赛道映射未统一使用时间节点文本')
    assert.match(componentSource, /deliverableTypes（提交内容）/, '赛道映射缺少提交内容字段')
    assert.match(configSource, /if \(entityType === 'track'\) \{[\s\S]*timelineText:\s*''[\s\S]*deliverableTypes:\s*''/, '赛道默认模板未补齐时间节点与提交内容')
    assert.match(serviceSource, /const trackTimelines = buildTrackReleaseTimelines\(input\.externalId, timelineText\)/, '赛道同步未从 timelineText 构造赛道时间节点')
    assert.match(serviceSource, /recordDuplicateExternalIdDiagnostics[\s\S]*sourceDuplicateExternalIdCount/, '赛道同步运行未记录重复 externalId 业务折叠诊断')
  })

  it('release-store 已实现双人审批、随机领取二审和替换发布', async () => {
    const releaseStoreSource = await readSource('server/utils/release-store.ts')
    const approveApiSource = await readSource('server/api/admin/releases/[id]/approve.post.ts')
    const rejectApiSource = await readSource('server/api/admin/releases/[id]/reject.post.ts')
    const claimApiSource = await readSource('server/api/admin/releases/claim-second-review.post.ts')
    const publishApiSource = await readSource('server/api/admin/releases/[id]/publish.post.ts')
    const schemaSource = await readSource('server/database/bootstrap/schema.ts')
    const typeSource = await readSource('shared/types/domain-legacy.ts')
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(releaseStoreSource, /export async function claimRandomPendingSecondReviewRelease\(/, '缺少随机领取二审任务能力')
    assert.match(releaseStoreSource, /function upsertSnapshotItem<T extends \{ externalId: string \}>[\s\S]*current\.externalId === item\.externalId/, 'release 草稿仍应按 externalId 合并同一业务实体')
    assert.match(releaseStoreSource, /COALESCE\(first_review_by_user_id, ''\) <> \$1/, '二审领取未排除初审人')
    assert.match(releaseStoreSource, /RELEASE_SECOND_REVIEW_NOT_CLAIMED/, '二审审批未要求先领取任务')
    assert.match(releaseStoreSource, /second_review_claimed/, '审批日志未记录二审领取')
    assert.match(releaseStoreSource, /SET status = 'superseded'/, '发布时未替换旧 published 版本')
    assert.match(releaseStoreSource, /action: 'sync_draft_overwritten'/, '重复同步覆盖草稿时未记录明确审批日志动作')
    assert.match(releaseStoreSource, /action: 'published'/, '发布后未记录审批日志')
    assert.match(schemaSource, /'sync_draft_overwritten'/, 'release_review_logs schema 未放行覆盖草稿动作')
    assert.match(typeSource, /'sync_draft_overwritten'/, '共享类型未补齐覆盖草稿动作')
    assert.match(workbenchSource, /飞书同步覆盖草稿/, '审批工作台未提供覆盖草稿日志文案')
    assert.match(claimApiSource, /claimRandomPendingSecondReviewRelease/, '二审领取 API 未接入 release-store')
    assert.match(approveApiSource, /approveReleaseVersion/, '审批 API 未接入 release-store')
    assert.match(rejectApiSource, /rejectReleaseVersion/, '驳回 API 未接入 release-store')
    assert.match(publishApiSource, /publishReleaseVersion/, '发布 API 未接入 release-store')
  })

  it('管理后台已经提供版本队列、竞赛版本页和政策版本页入口', async () => {
    const adminIndexSource = await readSource('app/pages/admin/index.vue')
    const contestWorkspaceSource = await readSource('app/pages/admin/contests/[id].vue')
    const queuePageSource = await readSource('app/pages/admin/releases/queue.vue')
    const contestReleasePageSource = await readSource('app/pages/admin/contests/[id]/releases/index.vue')
    const policyIndexPageSource = await readSource('app/pages/admin/policies/index.vue')
    const policyReleasePageSource = await readSource('app/pages/admin/policies/releases.vue')
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(adminIndexSource, /to="\/admin\/releases\/queue"/, '管理首页未接入发布审批入口')
    assert.match(adminIndexSource, /to="\/admin\/policies"/, '管理首页未接入政策库入口')
    assert.match(contestWorkspaceSource, /label: '版本发布'/, '竞赛工作区未接入版本发布模块')
    assert.match(queuePageSource, /<AdminReleaseWorkbench/, '审批队列页未复用版本工作台')
    assert.match(contestReleasePageSource, /fetch-path="`\/admin\/contests\/\$\{contestId\}\/releases`"/, '竞赛版本页未接入竞赛版本 API')
    assert.match(policyIndexPageSource, /to="\/admin\/policies\/releases"/, '政策库首页未接入版本页入口')
    assert.match(policyReleasePageSource, /scope-kind="policy_library"/, '政策版本页未限定 policy_library scope')
    assert.match(workbenchSource, /随机领取二审/, '版本工作台未提供随机领取二审动作')
    assert.match(workbenchSource, /发布替换/, '版本工作台未提供替换发布动作')
    assert.match(workbenchSource, /审批日志/, '版本工作台未展示审批日志')
  })

  it('后端已经补齐 release 相关管理 API', async () => {
    const queueApiSource = await readSource('server/api/admin/releases/queue.get.ts')
    const detailApiSource = await readSource('server/api/admin/releases/[id].get.ts')
    const contestApiSource = await readSource('server/api/admin/contests/[id]/releases.get.ts')
    const policyApiSource = await readSource('server/api/admin/policies/releases.get.ts')
    const policyIndexApiSource = await readSource('server/api/admin/policies/index.get.ts')

    assert.match(queueApiSource, /listReleaseQueue/, '队列 API 未返回待审版本')
    assert.match(detailApiSource, /getReleaseVersionDetail/, '版本详情 API 未返回审批日志明细')
    assert.match(contestApiSource, /listContestReleaseVersions/, '竞赛版本 API 未接入 contest release list')
    assert.match(policyApiSource, /listPolicyReleaseVersions/, '政策版本 API 未接入 policy release list')
    assert.match(policyIndexApiSource, /listPolicyLibraryItems/, '政策库列表 API 未接入 live policy list')
  })
})
