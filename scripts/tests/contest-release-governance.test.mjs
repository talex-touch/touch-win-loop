import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('赛事版本流与前台可见性收口', () => {
  it('前台 contests API 不再按 contest.read_internal 放大管理员口径', async () => {
    const [listApiSource, detailApiSource, contestStoreSource] = await Promise.all([
      readSource('server/api/contests.get.ts'),
      readSource('server/api/contests/[id].get.ts'),
      readSource('server/utils/contest-store.ts'),
    ])

    assert.doesNotMatch(listApiSource, /contest\.read_internal/, '公开赛事列表仍按管理员权限放大口径')
    assert.doesNotMatch(detailApiSource, /contest\.read_internal/, '公开赛事详情仍按管理员权限放大口径')
    assert.match(listApiSource, /includeInternal: false/, '公开赛事列表未强制关闭 includeInternal')
    assert.match(detailApiSource, /includeInternal: false/, '公开赛事详情未强制关闭 includeInternal')
    assert.match(contestStoreSource, /EXISTS \([\s\S]*FROM release_versions rv[\s\S]*rv\.scope_kind = 'contest'[\s\S]*rv\.status = 'published'[\s\S]*rv\.live_entity_id = contests\.id/, '公开赛事读取未要求存在已发布 release 版本')
  })

  it('后台赛事列表已切换到 live + latest release 合并视图', async () => {
    const [typeSource, apiSource, pageSource, releaseStoreSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/contests/index.get.ts'),
      readSource('app/pages/admin/contests.vue'),
      readSource('server/utils/release-store.ts'),
    ])

    assert.match(typeSource, /export interface AdminContestListItem \{[\s\S]*latestReleaseStatus\?: ReleaseVersionStatus \| ''[\s\S]*hasPublishBlockers: boolean/, '共享类型未声明后台赛事双状态 DTO')
    assert.match(apiSource, /listAdminContestReleaseOverview/, '后台赛事列表 API 未改为 release overview 聚合')
    assert.match(releaseStoreSource, /export async function listAdminContestReleaseOverview\(/, 'release-store 未提供后台赛事列表聚合函数')
    assert.match(pageSource, /Live 状态 \/ 可见性/, '后台赛事列表未展示 live 状态与可见性')
    assert.match(pageSource, /最新版本状态/, '后台赛事列表未展示最新版本状态')
    assert.match(pageSource, /审核\/版本/, '后台赛事列表未提供审核\/版本入口')
    assert.match(pageSource, /查看审计/, '后台赛事列表未提供审计入口')
  })

  it('后台赛事详情与人工保存已切到 admin 口径和手工版本流', async () => {
    const [typeSource, detailApiSource, patchApiSource, releaseStoreSource, adminPageSource, overviewSource, faqSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/contests/[id].get.ts'),
      readSource('server/api/admin/contests/[id].patch.ts'),
      readSource('server/utils/release-store.ts'),
      readSource('app/pages/admin/contests/[id].vue'),
      readSource('app/pages/admin/contests/[id]/overview/edit.vue'),
      readSource('app/pages/admin/contests/[id]/faq/index.vue'),
    ])

    assert.match(typeSource, /export type ReleaseReviewAction[\s\S]*'manual_generated'/, '共享类型未声明 manual_generated 审核动作')
    assert.match(detailApiSource, /getContestDetail\(db, \{[\s\S]*includeInternal: true/, '后台赛事详情接口未强制走 admin 口径')
    assert.match(patchApiSource, /createContestManualReleaseDraft/, '后台赛事保存接口仍未改成手工版本流')
    assert.match(releaseStoreSource, /export async function createContestManualReleaseDraft\(/, 'release-store 未提供手工版本草稿生成函数')
    assert.match(releaseStoreSource, /reviewAction: 'manual_generated'/, '手工版本草稿未写入 manual_generated 审计动作')
    assert.match(adminPageSource, /endpoint\(`\/admin\/contests\/\$\{contestId\.value\}`\)/, '后台赛事工作区仍在读取公开 contests 详情接口')
    assert.match(overviewSource, /sourceModule: 'overview'/, '基础信息保存未标记来源模块')
    assert.match(overviewSource, /生成待审核版本/, '基础信息页未改成版本流语义')
    assert.match(faqSource, /sourceModule: 'faq'/, 'FAQ 保存未标记来源模块')
    assert.match(faqSource, /生成 FAQ 待审核版本/, 'FAQ 页未改成版本流语义')
  })

  it('已发布赛事的旧子模块编辑口会被版本流守卫拦截', async () => {
    const [contestStoreSource, trackPostSource, trackPatchSource, timelinePostSource, resourcePostSource, rubricPatchSource] = await Promise.all([
      readSource('server/utils/contest-store.ts'),
      readSource('server/api/admin/contests/[id]/tracks.post.ts'),
      readSource('server/api/admin/contests/[id]/tracks.patch.ts'),
      readSource('server/api/admin/contests/[id]/timelines.post.ts'),
      readSource('server/api/admin/contests/[id]/resources.post.ts'),
      readSource('server/api/admin/contests/[id]/rubrics.patch.ts'),
    ])

    assert.match(contestStoreSource, /throw new Error\('CONTEST_RELEASE_WORKFLOW_REQUIRED'\)/, 'contest-store 未增加版本流直写守卫')
    assert.match(trackPostSource, /CONTEST_RELEASE_WORKFLOW_REQUIRED/, '赛道新增接口未拦截已发布赛事直写')
    assert.match(trackPatchSource, /CONTEST_RELEASE_WORKFLOW_REQUIRED/, '赛道编辑接口未拦截已发布赛事直写')
    assert.match(timelinePostSource, /CONTEST_RELEASE_WORKFLOW_REQUIRED/, '时间节点新增接口未拦截已发布赛事直写')
    assert.match(resourcePostSource, /CONTEST_RELEASE_WORKFLOW_REQUIRED/, '资料新增接口未拦截已发布赛事直写')
    assert.match(rubricPatchSource, /CONTEST_RELEASE_WORKFLOW_REQUIRED/, 'rubric 编辑接口未拦截已发布赛事直写')
  })

  it('版本详情与审计页已改为发布门禁 + 统一时间线', async () => {
    const [typeSource, releaseStoreSource, workbenchSource, auditApiSource, auditPageSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/utils/release-store.ts'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
      readSource('server/api/admin/contests/[id]/audit.get.ts'),
      readSource('app/pages/admin/contests/[id]/audit/index.vue'),
    ])

    assert.match(typeSource, /export type ContestWorkflowTimelineSource = 'feishu' \| 'manual' \| 'review' \| 'publish' \| 'repair'/, '共享类型未声明统一流程来源')
    assert.match(releaseStoreSource, /if \(action === 'manual_generated'\)\s+return 'manual'/, 'release 时间线未将 manual_generated 归入 manual 来源')
    assert.match(typeSource, /export interface ContestWorkflowTimelineItem \{[\s\S]*versionNumber\?: number \| null[\s\S]*syncRunId\?: string \| null/, '共享类型未声明统一流程时间线条目')
    assert.match(typeSource, /export interface ContestAuditAggregates \{[\s\S]*currentUser: ReleaseQueueReviewerStats \| null[\s\S]*reviewers: ReleaseQueueReviewerStats\[\][\s\S]*recentReviews: ReleaseQueueRecentReviewItem\[\]/, '共享类型未声明赛事审计统计聚合')
    assert.match(typeSource, /export interface ContestWorkflowTimelineResult \{[\s\S]*items: ContestWorkflowTimelineItem\[\][\s\S]*aggregates: ContestAuditAggregates/, '共享类型未声明流程时间线聚合结果')
    assert.match(typeSource, /export interface ReleaseVersionDetail \{[\s\S]*publishCheck\?: PublishCheckResult \| null[\s\S]*workflowTimeline\?: ContestWorkflowTimelineItem\[\]/, '版本详情未挂载发布校验与流程时间线')
    assert.match(releaseStoreSource, /export async function getContestReleasePublishCheck\(/, 'release-store 未提供版本级发布校验')
    assert.match(releaseStoreSource, /export async function listContestWorkflowTimeline\(/, 'release-store 未提供统一流程时间线聚合')
    assert.match(releaseStoreSource, /export async function listContestAuditAggregates\(/, 'release-store 未提供赛事审核统计聚合')
    assert.match(releaseStoreSource, /JOIN release_versions rv ON rv\.id = l\.release_version_id[\s\S]*LEFT JOIN users u ON u\.id = l\.actor_user_id/, '赛事审核统计未从 review logs 联表用户信息')
    assert.match(releaseStoreSource, /aggregates,[\s\S]*items: items\.slice/, '流程时间线结果未把 aggregates 与 timeline 一次返回')
    assert.match(workbenchSource, /发布校验/, '版本工作台未展示发布校验')
    assert.match(workbenchSource, /流程时间线/, '版本工作台未展示流程时间线')
    assert.match(auditApiSource, /listContestWorkflowTimeline/, '审计 API 未改为统一流程时间线聚合')
    assert.match(auditApiSource, /rankingMode = normalizeReviewerRankingMode/, '审计 API 未解析审核排名维度')
    assert.match(auditApiSource, /windowDays = normalizeInsightsWindowDays/, '审计 API 未解析审核洞察时间窗口')
    assert.match(auditApiSource, /actorUserId: user\.id/, '审计 API 未把当前用户传入审核统计聚合')
    assert.match(auditPageSource, /流程时间线/, '审计页未改为流程时间线视图')
    assert.match(auditPageSource, /sourceLabel/, '审计页未展示来源标签')
    assert.match(auditPageSource, /我的审核统计/, '审计页未展示个人审核统计')
    assert.match(auditPageSource, /管理员审核排名/, '审计页未展示管理员审核排名')
    assert.match(auditPageSource, /近期审核流/, '审计页未展示近期审核流')
    assert.match(auditPageSource, /按总审核|按二审通过|按发布次数/, '审计页未提供排名维度选项')
    assert.match(auditPageSource, /近 7 天|近 30 天|累计/, '审计页未提供统计窗口选项')
  })

  it('版本审批工作台收口为审核入口、二级时间线和赛道确认表单', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')
    const tableActionSource = workbenchSource.slice(
      workbenchSource.indexOf('<a-table-column title="操作"'),
      workbenchSource.indexOf('<a-drawer'),
    )

    assert.match(tableActionSource, />\s*审核\s*</, '列表操作列应统一为审核入口')
    assert.doesNotMatch(tableActionSource, />\s*查看\s*</, '列表操作列不应再展示查看按钮')
    assert.doesNotMatch(tableActionSource, />\s*初审通过\s*</, '列表操作列不应直接初审通过')
    assert.doesNotMatch(tableActionSource, />\s*二审通过\s*</, '列表操作列不应直接二审通过')

    assert.match(workbenchSource, /currentUserId/, '工作台需要加载当前用户用于审批约束')
    assert.match(workbenchSource, /canReviewSecond\(detail\.version\)/, '二审按钮必须经过当前用户与领取人校验')
    assert.match(workbenchSource, /firstReviewByUserId/, '二审校验必须识别初审人')
    assert.match(workbenchSource, /secondReviewClaimedByUserId/, '二审校验必须识别领取人')

    assert.match(workbenchSource, /timelineVisible/, '流程时间线应作为二级弹窗状态管理')
    assert.match(workbenchSource, /查看流程时间线/, '版本详情应提供流程时间线二级入口')
    assert.match(workbenchSource, /<a-modal[\s\S]*v-model:visible="timelineVisible"[\s\S]*title="流程时间线"/, '流程时间线应放入二级弹窗')

    assert.match(workbenchSource, /trackDetailVisible/, '赛道详情应使用独立确认表单弹窗')
    assert.match(workbenchSource, /selectedTrack/, '赛道详情应按单条赛道打开')
    assert.match(workbenchSource, /赛道确认表单/, '赛道详情弹窗应是表单确认语义')
    assert.match(workbenchSource, /<a-table[\s\S]*detailContestSnapshot\.tracks/, '赛道库快照应改为表格')
    assert.doesNotMatch(workbenchSource, /\{\{\s*trackSummary\(item\)\s*\}\}/, '赛道库不应再用长文本卡片展示')

    assert.match(workbenchSource, /metadataDrawerVisible/, '赛事概览 metadata 应使用独立确认抽屉状态')
    assert.match(workbenchSource, /contestMetadataFormRows/, '赛事概览 metadata 应整理成确认表单行')
    assert.match(workbenchSource, /确认概览字段/, '版本详情应提供概览字段确认入口')
    assert.match(workbenchSource, /赛事概览确认表单/, '赛事概览 metadata drawer 应有明确标题')
    assert.doesNotMatch(workbenchSource, /function contestMetadataFormRows[\s\S]*key: 'organizer'[\s\S]*function trackFormRows/, 'metadata 确认表单不应展示竞赛级主办方')
    assert.doesNotMatch(workbenchSource, /function contestMetadataFormRows[\s\S]*key: '(participantRequirements|currentSeason|coOrganizer|teamRule)'[\s\S]*function trackFormRows/, 'metadata 确认表单不应展示飞书竞赛库没有的概览字段')
    for (const field of ['竞赛编号', '竞赛名称', '级别', '学科门类', '官网地址', '竞赛简介', '关键词', '时间节点', '适配人群'])
      assert.match(workbenchSource, new RegExp(`function contestSummaryRows[\\s\\S]*label: '${field}'[\\s\\S]*function contestTimelineText`), `竞赛库快照缺少字段：${field}`)
    assert.doesNotMatch(workbenchSource, /function contestSummaryRows[\s\S]*label: '(主办方|参赛对象|届次|协办\/承办|组队规则)'[\s\S]*function contestTimelineText/, '竞赛库快照不应展示飞书竞赛库没有的字段')
    assert.doesNotMatch(workbenchSource, /function contestSummaryRows[\s\S]*label: '(别名|FAQ|热度|可见性)'[\s\S]*function contestTimelineText/, '竞赛库快照不应展示非飞书竞赛库字段')
    for (const field of ['赛道编号', '赛道名称', '封面', '具体位置', '主办方', '承办方', '赛道简介', '参赛对象', '组队规则', '时间节点', '相关专业', '获奖比例', '必备项', '加分项', '扣分项', '提交内容'])
      assert.match(workbenchSource, new RegExp(`function trackFormRows[\\s\\S]*label: '${field}'[\\s\\S]*function reviewLogPayloadText`), `赛道库快照缺少字段：${field}`)
    assert.doesNotMatch(workbenchSource, /function trackFormRows[\s\S]*label: '证明材料'[\s\S]*function reviewLogPayloadText/, '赛道确认表单不应使用证明材料旧文案')
    assert.match(workbenchSource, /detailContestSnapshot\.tracks\.length/, 'metadata 确认抽屉应把赛道数量并入同一审核路径')
    assert.doesNotMatch(workbenchSource, /赛道时间节点/, '审核工作台不应展示赛道时间节点')
    assert.match(workbenchSource, /trackTimelineText/, '审核工作台应在赛道快照字段中渲染时间节点文本')
    assert.match(workbenchSource, /trackTimelineReviewText/, '审核工作台应使用审核友好的时间节点格式')
    assert.match(workbenchSource, /formatTimelineSnapshotItem/, '审核工作台应把时间节点格式化为中文可读文本')
    assert.match(workbenchSource, /isTrackTimelineForTrack/, '赛道确认表单应按多口径关联时间节点')
    assert.match(workbenchSource, /item\.timelineText/, '赛道时间节点为空时应回退展示赛道库原始 timelineText')
    assert.match(workbenchSource, /isCoverPreviewUrl/, '赛道确认表单应支持封面图片预览')
    assert.match(workbenchSource, /resolveCoverPreviewSource/, '赛道确认表单应从封面字段解析可预览地址')
    assert.match(workbenchSource, /coverPreviewFrames/, '封面预览应覆盖常用裁切比例')
    assert.match(workbenchSource, /object-contain/, '封面预览应适配不同尺寸图片')
    assert.match(workbenchSource, /object-cover/, '封面预览应展示最终裁切效果')

    assert.match(workbenchSource, /reviewLogDrawerVisible/, '审批日志详情应使用独立 drawer 状态')
    assert.match(workbenchSource, /selectedReviewLog/, '审批日志详情应按单条日志打开')
    assert.match(workbenchSource, /审批日志详情/, '审批日志 drawer 应有明确标题')
    assert.match(workbenchSource, /openReviewLogDetail\(record\)/, '审批日志列表应点击打开详情 drawer')
    assert.match(workbenchSource, /<a-drawer[\s\S]*v-model:visible="reviewLogDrawerVisible"[\s\S]*title="审批日志详情"/, '审批日志详情应放入独立 drawer')
    assert.doesNotMatch(workbenchSource, /<pre v-if="Object\.keys\(item\.payload \|\| \{\}\)\.length"[\s\S]*JSON\.stringify\(item\.payload/, '审批日志列表不应直接展开 payload')
  })

  it('发布审批队列统计使用全量口径，不受当前列表 limit 截断', async () => {
    const [typeSource, queueApiSource, releaseStoreSource, workbenchSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/releases/queue.get.ts'),
      readSource('server/utils/release-store.ts'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
    ])

    assert.match(typeSource, /export interface ReleaseQueueStatusStats \{[\s\S]*pendingFirst: number[\s\S]*approved: number[\s\S]*total: number/, '共享类型未声明 release queue 全量状态统计')
    assert.match(typeSource, /export interface AdminReleaseQueueResult \{[\s\S]*items: ReleaseVersion\[\][\s\S]*stats: ReleaseQueueStatusStats/, '共享类型未声明 release queue 结果对象')
    assert.match(queueApiSource, /listReleaseQueueResult/, '队列 API 仍返回受 limit 截断的纯列表')
    assert.match(releaseStoreSource, /export async function listReleaseQueueResult\(/, 'release-store 未提供队列结果聚合函数')
    assert.match(releaseStoreSource, /includeSnapshot:\s*false/, '发布审批队列列表不应返回完整 snapshot_json')
    assert.match(releaseStoreSource, /COUNT\(\*\)::INT AS item_count[\s\S]*GROUP BY status/, '队列统计未按状态做不带 limit 的聚合')
    assert.match(workbenchSource, /AdminReleaseQueueResult/, '版本工作台未识别队列结果对象')
    assert.match(workbenchSource, /queueStats\.value \|\|/, '版本工作台 summary 仍只按当前加载列表计数')
    assert.match(workbenchSource, /顶部统计为全量口径/, '版本工作台未提示统计与当前加载列表的口径差异')
  })

  it('发布审批队列返回审核洞察，并在左侧展示个人统计、管理员排名和近期审核', async () => {
    const [typeSource, queueApiSource, releaseStoreSource, workbenchSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/releases/queue.get.ts'),
      readSource('server/utils/release-store.ts'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
    ])

    assert.match(typeSource, /export type ReleaseQueueReviewerRankingMode = 'total_actions' \| 'second_review_approved' \| 'published'/, '共享类型未声明审核排名维度')
    assert.match(typeSource, /export type ReleaseQueueInsightsWindowDays = 0 \| 7 \| 30/, '共享类型未声明审核洞察时间窗口')
    assert.match(typeSource, /export interface ReleaseQueueReviewerStats \{[\s\S]*totalActions: number[\s\S]*publishedCount: number/, '共享类型未声明审核员统计 DTO')
    assert.match(typeSource, /export interface ReleaseQueueActionableCounts \{[\s\S]*pendingFirstCount: number[\s\S]*claimedSecondCount: number[\s\S]*readyToPublishCount: number/, '共享类型未声明待我处理统计 DTO')
    assert.match(typeSource, /export interface ReleaseQueueRecentReviewItem \{[\s\S]*action: ReleaseReviewAction[\s\S]*actorName: string/, '共享类型未声明近期审核 DTO')
    assert.match(typeSource, /export interface ReleaseQueueInsights \{[\s\S]*windowDays: ReleaseQueueInsightsWindowDays[\s\S]*rankingMode: ReleaseQueueReviewerRankingMode[\s\S]*actionable: ReleaseQueueActionableCounts \| null[\s\S]*recentReviews: ReleaseQueueRecentReviewItem\[\]/, '共享类型未声明发布审批洞察结构')
    assert.match(typeSource, /export interface AdminReleaseQueueResult \{[\s\S]*insights: ReleaseQueueInsights/, '发布审批队列返回结构未挂载洞察字段')
    assert.match(queueApiSource, /actorUserId: user\.id/, '队列 API 未把当前用户传入洞察聚合')
    assert.match(queueApiSource, /rankingMode = normalizeReviewerRankingMode/, '队列 API 未解析审核排名维度')
    assert.match(queueApiSource, /windowDays = normalizeInsightsWindowDays/, '队列 API 未解析审核洞察时间窗口')
    assert.match(releaseStoreSource, /export async function listReleaseQueueInsights\(/, 'release-store 未提供审核洞察聚合函数')
    assert.match(releaseStoreSource, /FROM release_review_logs l[\s\S]*LEFT JOIN users u ON u\.id = l\.actor_user_id/, '审核洞察未从 review logs 联表用户信息')
    assert.match(releaseStoreSource, /readyToPublishCount/, 'release-store 未统计待我处理发布桶')
    assert.match(releaseStoreSource, /ORDER BY total_actions DESC|ORDER BY second_review_approved_count DESC|ORDER BY published_count DESC/, 'release-store 未支持按维度排序审核排名')
    assert.match(workbenchSource, /我的审核统计/, '工作台左侧未展示个人审核统计')
    assert.match(workbenchSource, /待我处理/, '工作台左侧未展示待我处理')
    assert.match(workbenchSource, /管理员审核排名/, '工作台左侧未展示管理员审核排名')
    assert.match(workbenchSource, /近期审核/, '工作台左侧未展示近期审核')
    assert.match(workbenchSource, /insightWindowDays/, '工作台未提供审核洞察时间窗口状态')
    assert.match(workbenchSource, /reviewerRankingMode/, '工作台未提供审核排名维度状态')
    assert.match(workbenchSource, /近 7 天|近 30 天|累计/, '工作台未提供审核洞察窗口选项')
    assert.match(workbenchSource, /按总审核|按二审通过|按发布次数/, '工作台未提供审核排名维度选项')
    assert.match(workbenchSource, /insights\.value\?\.currentUser/, '工作台未消费个人审核统计')
    assert.match(workbenchSource, /insights\.value\?\.actionable/, '工作台未消费待我处理统计')
    assert.match(workbenchSource, /insights\.value\?\.reviewers/, '工作台未消费管理员排名')
    assert.match(workbenchSource, /insights\.value\?\.recentReviews/, '工作台未消费近期审核列表')
    assert.match(workbenchSource, /const actionableFilter = ref<'all' \| 'pending_first' \| 'claimed_second' \| 'ready_publish'>\('all'\)/, '工作台未维护待我处理快捷筛选状态')
    assert.match(workbenchSource, /item\.status === 'pending_second_review' && item\.secondReviewClaimedByUserId === currentUserId\.value/, '工作台未按当前用户筛选我领的二审')
    assert.match(workbenchSource, /toggleActionableFilter\('pending_first'\)|toggleActionableFilter\('claimed_second'\)|toggleActionableFilter\('ready_publish'\)/, '工作台待我处理卡片未提供快捷筛选交互')
    assert.match(workbenchSource, /async function openRecentReview\(item: ReleaseQueueRecentReviewItem\)/, '工作台未提供近期审核快捷打开能力')
    assert.match(workbenchSource, /@click="openRecentReview\(item\)"/, '工作台近期审核列表未绑定详情打开交互')
  })

  it('发布审批工作台状态筛选会回传队列 API，避免已驳回只在默认待审队列内过滤', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(workbenchSource, /statuses:\s*statusFilter\.value \|\| undefined/, '状态筛选未作为 statuses 查询参数传给发布审批队列 API')
    assert.match(workbenchSource, /watch\(\s*\[\(\) => props\.fetchPath,\s*statusFilter,\s*insightWindowDays,\s*reviewerRankingMode\]/, '状态筛选变化后未重新加载队列数据')
  })

  it('赛道确认表单不会把裸附件文件名当图片地址，并补充多口径时间节点关联', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(workbenchSource, /function isBareCoverAttachmentName\(/, '封面预览缺少裸附件文件名识别')
    assert.match(workbenchSource, /if \(isBareCoverAttachmentName\(text\)\)\s+return ''/, '裸附件文件名不应被转换成根路径图片地址')
    assert.match(workbenchSource, /function coverPreviewUnavailableText\(/, '封面确认表单缺少不可预览原因提示')
    assert.match(workbenchSource, /item\.syncSource\?\.recordId/, '赛道时间节点关联未纳入赛道 sync record 口径')
    assert.match(workbenchSource, /item\.syncSource\?\.syncItemId/, '赛道时间节点关联未纳入赛道 sync item 口径')
    assert.match(workbenchSource, /item\.name/, '赛道时间节点关联未纳入赛道名称口径')
    assert.match(workbenchSource, /timeline\.externalId/, '赛道时间节点关联未从节点 externalId 兜底识别派生前缀')
  })

  it('后台赛事列表的四个操作会按 live 与待审版本分流', async () => {
    const pageSource = await readSource('app/pages/admin/contests.vue')

    assert.match(pageSource, /function buildReleaseDetailPath\(record: AdminContestListItem\): string/, '赛事列表缺少待审版本详情深链构造函数')
    assert.match(pageSource, /url\.searchParams\.set\('versionId', record\.latestReleaseVersionId\)/, '待审版本详情深链未携带 versionId')
    assert.match(pageSource, /async function goToReleaseDetail\(record: AdminContestListItem\)/, '赛事列表缺少统一版本详情跳转函数')
    assert.match(pageSource, /goToContestOverviewEditor\(record\)/, '编辑版本按钮仍只传 live contest id')
    assert.match(pageSource, /goToContestWorkspace\(record\)/, '工作区按钮仍只传 live contest id')
    assert.match(pageSource, /:disabled="!record\.id"/, '未生成 live 赛事的工作区按钮未置灰')
    assert.match(pageSource, /发布后生成工作区/, '未生成 live 赛事的工作区按钮缺少明确提示')
    assert.doesNotMatch(pageSource, /if \(!contestId\) \{\s+await navigateTo\('\/admin\/releases\/queue'\)/, '无 live id 时不应再把所有操作裸跳全局审批队列')
    assert.doesNotMatch(pageSource, /if \(!record\.id\) \{\s+await navigateTo\('\/admin\/releases\/queue'\)/, '无 live id 的版本操作不应裸跳全局审批队列')
  })

  it('发布审批工作台支持 versionId 深链自动打开详情', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(workbenchSource, /const route = useRoute\(\)/, '版本工作台未读取当前路由')
    assert.match(workbenchSource, /const routeVersionId = computed/, '版本工作台缺少 versionId query 解析')
    assert.match(workbenchSource, /async function openRouteVersionDetail\(/, '版本工作台缺少深链详情打开函数')
    assert.match(workbenchSource, /await openRouteVersionDetail\(data\.items\)/, '队列结果加载后未尝试打开深链版本详情')
    assert.match(workbenchSource, /watch\(routeVersionId,[\s\S]*openRouteVersionDetail\(versions\.value\)/, 'versionId query 变化时未重新打开对应版本')
  })

  it('管理页标签会识别发布审批队列路由', async () => {
    const tabSource = await readSource('app/composables/useAdminRouteTabs.ts')

    assert.match(tabSource, /if \(path === '\/admin\/releases\/queue'\)\s+return '发布审批队列'/, '管理页 tabs 未给发布审批队列专用标题')
  })
})
