import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

async function readOptionalSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8').catch(() => '')
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
    assert.doesNotMatch(releaseStoreSource, /CONTEST_TRACK_NAMES_DUPLICATED/, '发布校验不能按赛道名称阻断合法的同名赛道')
    assert.doesNotMatch(releaseStoreSource, /collectDuplicatedTrackNames/, '发布校验不能按赛道名称收口赛道身份')
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
    assert.match(auditPageSource, /const initialLoading = ref\(false\)/, '审计页应只在首次加载展示骨架屏')
    assert.match(auditPageSource, /const appliedActionFilter = ref\(''\)/, '审计页应拆分输入筛选和已应用筛选，避免重复 reload')
    assert.match(auditPageSource, /type AuditReloadScope = 'initial' \| 'manual' \| 'timeline' \| 'insights'/, '审计页应区分首次、手动、时间线和洞察刷新范围')
    assert.match(auditPageSource, /action: appliedActionFilter\.value/, '审计页接口查询应使用已应用筛选值')
    assert.match(auditPageSource, /function applyActionFilter\(\)/, '审计页筛选提交应收口到轻量 reload 函数')
    assert.match(auditPageSource, /watch\(\[page, pageSize, appliedActionFilter\]/, '审计页分页和筛选应合并为时间线局部 reload')
    assert.match(auditPageSource, /watch\(\[rankingMode, windowDays\]/, '审计页排名和窗口切换应合并为洞察局部 reload')
    assert.match(auditPageSource, /v-if="initialLoading"/, '审计页骨架屏不应绑定所有刷新状态')
    assert.doesNotMatch(auditPageSource, /v-if="loading"/, '审计页不应再用全局 loading 触发整块骨架屏')
  })

  it('版本审批工作台收口为审核入口、二级时间线和赛道确认表单', async () => {
    const [workbenchSource, releaseStoreSource] = await Promise.all([
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
      readSource('server/utils/release-store.ts'),
    ])
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
    for (const field of ['organizer', 'participantRequirements', 'currentSeason'])
      assert.doesNotMatch(workbenchSource, new RegExp(`function contestMetadataFormRows[\\s\\S]*key: '${field}'[\\s\\S]*function formatTimelineSnapshotItem`), `metadata 确认表单不应展示保留字段：${field}`)
    assert.doesNotMatch(workbenchSource, /contest\.organizer 不从 Feishu contest 库写回/, 'metadata 确认表单不应再解释已移除的 organizer 字段')
    assert.doesNotMatch(workbenchSource, /同版本赛道参赛对象聚合/, 'metadata 确认表单不应再解释已移除的参赛对象兜底口径')
    assert.doesNotMatch(workbenchSource, /currentSeason 不作为 Feishu target/, 'metadata 确认表单不应再解释已移除的 currentSeason 字段')
    assert.doesNotMatch(workbenchSource, /时间线年份推断/, 'metadata 确认表单不应再解释已移除的当前届次兜底口径')
    assert.match(workbenchSource, /contestTimelineText\(detailContestSnapshot\.timelines\)/, '概览确认表单应只展示赛事库自身时间节点')
    assert.doesNotMatch(workbenchSource, /mergedContestTimelineReviewText\(detailContestSnapshot\)/, '概览确认表单不应合并展示赛道时间节点')
    for (const field of ['竞赛编号', '竞赛名称', '级别', '学科门类', '官网地址', '竞赛简介', '关键词', '时间节点', '适配人群'])
      assert.match(workbenchSource, new RegExp(`function contestSummaryRows[\\s\\S]*label: '${field}'[\\s\\S]*function contestTimelineText`), `竞赛库快照缺少字段：${field}`)
    assert.doesNotMatch(workbenchSource, /function contestSummaryRows[\s\S]*label: '(主办方|参赛对象|届次|协办\/承办|组队规则)'[\s\S]*function contestTimelineText/, '竞赛库快照不应展示飞书竞赛库没有的字段')
    assert.doesNotMatch(workbenchSource, /function contestSummaryRows[\s\S]*label: '(别名|FAQ|热度|可见性)'[\s\S]*function contestTimelineText/, '竞赛库快照不应展示非飞书竞赛库字段')
    for (const field of ['赛道编号', '赛道名称', '封面', '具体位置', '主办方', '承办方', '赛道简介', '参赛对象', '组队规则', '时间节点', '相关专业', '获奖比例', '必备项', '加分项', '扣分项', '提交内容'])
      assert.match(workbenchSource, new RegExp(`function trackFormRows[\\s\\S]*label: '${field}'[\\s\\S]*function reviewLogPayloadText`), `赛道库快照缺少字段：${field}`)
    assert.doesNotMatch(workbenchSource, /function trackFormRows[\s\S]*label: '证明材料'[\s\S]*function reviewLogPayloadText/, '赛道确认表单不应使用证明材料旧文案')
    assert.match(workbenchSource, /detailContestSnapshot\.tracks\.length/, 'metadata 确认抽屉应把赛道数量并入同一审核路径')
    assert.doesNotMatch(workbenchSource, /赛道时间节点[^保]/, '审核工作台不应回退展示独立赛道时间节点模块')
    assert.match(workbenchSource, /trackTimelineText/, '审核工作台应在赛道快照字段中渲染时间节点文本')
    assert.match(workbenchSource, /trackTimelineReviewText/, '审核工作台应使用审核友好的时间节点格式')
    assert.match(workbenchSource, /function trackTimelineReviewSections\(/, '赛道确认表单应把时间节点拆成自动识别与待人工确认')
    assert.match(workbenchSource, /自动识别/, '赛道确认表单缺少自动识别时间节点分段')
    assert.match(workbenchSource, /待人工确认/, '赛道确认表单缺少待人工确认时间节点分段')
    assert.match(workbenchSource, /uniqueTimelineReviewTexts/, '赛道时间节点分段应去重，避免自动识别和待确认重复展示')
    assert.match(workbenchSource, /item\.recognitionStatus !== 'needs_confirmation'/, '待人工确认节点不应同时进入自动识别分组')
    assert.match(workbenchSource, /businessNodeLabel/, '赛道确认表单缺少可扩展业务节点字段')
    assert.match(workbenchSource, /保存时间节点/, '赛道确认表单缺少结构化时间节点保存动作')
    assert.match(workbenchSource, /建议同步修正飞书/, '赛道确认表单缺少重新导入修正提示')
    assert.doesNotMatch(workbenchSource, /timelineNodeTypeLabel\(item\.nodeType\),\s*dateText/, '时间节点展示不应直接拼接 nodeType 与 dateText 机器态字段')
    assert.match(workbenchSource, /formatTimelineSnapshotItem/, '审核工作台应把时间节点格式化为中文可读文本')
    assert.match(workbenchSource, /isTrackTimelineForTrack/, '赛道确认表单应按多口径关联时间节点')
    assert.match(workbenchSource, /item\.timelineText/, '赛道时间节点为空时应回退展示赛道库原始 timelineText')
    assert.match(workbenchSource, /openedTrackTimelineExternalIds/, '赛道确认表单应记录打开时可见节点，保存时显式删除已移除节点')
    assert.match(workbenchSource, /removedTrackTimelineExternalIds: openedTrackTimelineExternalIds\.value/, '赛道确认表单保存缺少显式删除集合')
    assert.match(releaseStoreSource, /if \(normalizedTimelines\.length === 0\)\s+track\.timelineText = ''/, '清空结构化时间节点时应同时清掉当前版本的 timelineText 回退文本')
    assert.match(releaseStoreSource, /removedTrackTimelineExternalIds\?: string\[\]/, '结构化节点保存接口缺少显式删除集合')
    assert.match(releaseStoreSource, /explicitRemovedExternalIds/, '结构化节点保存未按显式删除集合清理旧节点')
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

  it('公开赛事页遵守竞赛库与赛道库字段边界', async () => {
    const [listPageSource, detailPageSource] = await Promise.all([
      readSource('app/pages/contests/index.vue'),
      readSource('app/pages/contests/[id].vue'),
    ])

    assert.match(listPageSource, /placeholder="搜索赛事名称\/关键词\/赛道"/, '公开赛事列表搜索不应继续提示主办方')
    assert.doesNotMatch(listPageSource, /主办方：\{\{\s*trimText\(contest\.organizer\)/, '公开赛事列表卡片不应展示竞赛级主办方')
    assert.match(listPageSource, /赛道：\{\{\s*resolveTrackNames\(contest\)\s*\}\}/, '公开赛事列表应使用赛道名称补充上下文')
    assert.match(listPageSource, /时间节点：报名/, '公开赛事列表应把报名窗口标注为时间节点报名信息')
    assert.doesNotMatch(listPageSource, /const requiredFields = \[[\s\S]*contest\.organizer[\s\S]*contest\.participantRequirements[\s\S]*contest\.teamRule[\s\S]*\]/, '公开赛事列表缺失统计不应包含赛道库字段')

    assert.doesNotMatch(detailPageSource, /主办方：\{\{\s*contest\.organizer/, '公开详情顶部不应展示竞赛级主办方')
    assert.doesNotMatch(detailPageSource, /届次：\{\{\s*contest\.currentSeason/, '公开详情顶部不应展示竞赛级届次')
    assert.match(detailPageSource, /aggregateTrackField\('participantRequirements'\)/, '公开详情概览参赛对象应从赛道聚合')
    assert.match(detailPageSource, /aggregateTrackField\('teamRule'\)/, '公开详情概览组队规则应从赛道聚合')
    assert.match(detailPageSource, /主办方：\{\{\s*formatTrackField\(track, 'organizer'\)/, '公开详情赛道卡片应展示赛道主办方')
    assert.match(detailPageSource, /参赛对象：\{\{\s*formatTrackField\(track, 'participantRequirements'\)/, '公开详情赛道卡片应展示赛道参赛对象')
    assert.match(detailPageSource, /组队规则：\{\{\s*formatTrackField\(track, 'teamRule'\)/, '公开详情赛道卡片应展示赛道组队规则')
  })

  it('政策库审批快照按平台字段分组展示', async () => {
    const [workbenchSource, policyPageSource] = await Promise.all([
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
      readSource('app/pages/admin/policies/index.vue'),
    ])

    assert.match(workbenchSource, /function policyPlatformRows/, '政策审批快照缺少平台字段分组 helper')
    for (const field of ['官网', '微信公众号', '微博', '抖音', '小红书'])
      assert.match(workbenchSource, new RegExp(`label: '${field}'`), `政策审批快照缺少平台分组：${field}`)
    assert.doesNotMatch(workbenchSource, /function policySummary/, '政策审批快照不应再把所有字段拼成一行')
    assert.match(workbenchSource, /v-for="platform in policyPlatformRows\(item\)"/, '政策审批快照未按平台循环展示')
    assert.match(policyPageSource, /function policyPlatformRows/, '已发布政策页缺少平台字段分组 helper')
    assert.match(policyPageSource, /v-for="platform in policyPlatformRows\(item\)"/, '已发布政策页未按平台循环展示')
  })

  it('政策库发布失败会返回可读错误', async () => {
    const [releaseStoreSource, publishApiSource, bitableSyncSource] = await Promise.all([
      readSource('server/utils/release-store.ts'),
      readSource('server/api/admin/releases/[id]/publish.post.ts'),
      readSource('server/services/feishu/bitable-sync.ts'),
    ])

    assert.match(releaseStoreSource, /POLICY_RELEASE_ITEM_INVALID/, '政策库发布前未校验必要字段')
    assert.match(publishApiSource, /POLICY_RELEASE_ITEM_INVALID/, '政策库发布错误未映射为 API 错误')
    assert.match(publishApiSource, /缺少政策编号或会议名称/, '政策库发布失败缺少可读提示')
    assert.match(publishApiSource, /RELEASE_TRACK_TIMELINE_TRACK_NOT_FOUND/, '赛事时间节点发布失败未映射为可读错误')
    assert.match(publishApiSource, /无法关联赛道的时间节点/, '赛事时间节点发布失败缺少可读提示')
    assert.doesNotMatch(publishApiSource, /contest_tracks_contest_id_name_key/, '发布接口不能把同名赛道视为错误')
    assert.doesNotMatch(publishApiSource, /重复赛道名称/, '发布接口不能提示合法同名赛道为错误')
    assert.match(releaseStoreSource, /extractTrackExternalIdFromTimelineExternalId/, '发布链路未从派生时间节点编号解析赛道编号')
    assert.match(bitableSyncSource, /const policyItem: PolicyLibraryItemSnapshot = \{\s*externalId: explicitExternalId,/, '政策库发布草稿应使用显式政策编号，不能用 recordId 兜底 externalId')
    assert.match(bitableSyncSource, /status: draft\.existed \? 'updated' : 'created',\s*externalId: explicitExternalId,/, '政策库同步结果应回传显式政策编号')
  })

  it('赛道 schema 允许同一赛事下不同外部编号的同名赛道', async () => {
    const schemaSource = await readSource('server/database/bootstrap/schema.ts')

    assert.match(schemaSource, /DROP CONSTRAINT IF EXISTS contest_tracks_contest_id_name_key/, '启动迁移未移除旧赛道名称唯一约束')
    assert.doesNotMatch(schemaSource, /UNIQUE\s*\(\s*contest_id\s*,\s*name\s*\)/, 'contest_tracks 不应继续限制同一赛事下赛道名称唯一')
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
    assert.match(releaseStoreSource, /const DEFAULT_RELEASE_QUEUE_STATUSES: ReleaseVersionStatus\[\] = \[[^\]]*'pending_first_review'[^\]]*'pending_second_review'[^\]]*'approved'[^\]]*'rejected'[^\]]*'published'[^\]]*'superseded'[^\]]*\]/, '全部状态默认队列未覆盖已驳回、已发布和已替换版本')
    assert.match(releaseStoreSource, /includeSnapshot:\s*false/, '发布审批队列列表不应返回完整 snapshot_json')
    assert.match(releaseStoreSource, /COUNT\(\*\)::INT AS item_count[\s\S]*GROUP BY status/, '队列统计未按状态做不带 limit 的聚合')
    assert.match(workbenchSource, /AdminReleaseQueueResult/, '版本工作台未识别队列结果对象')
    assert.match(workbenchSource, /queueStats\.value \|\|/, '版本工作台 summary 仍只按当前加载列表计数')
    assert.match(workbenchSource, /已驳回[\s\S]*\{\{ summaryStats\.rejected \}\}/, '版本工作台统计未展示已驳回版本数量')
    assert.match(workbenchSource, /已替换[\s\S]*\{\{ summaryStats\.superseded \}\}/, '版本工作台统计未展示已替换版本数量')
    assert.match(workbenchSource, /顶部统计为全量口径/, '版本工作台未提示统计与当前加载列表的口径差异')
  })

  it('发布审批队列清除待处理筛选会恢复真正的全部状态', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(workbenchSource, /function clearActionableFilter\(\)[\s\S]*actionableFilter\.value = 'all'[\s\S]*statusFilter\.value = ''/, '待处理筛选清除操作未同步恢复全部状态')
    assert.match(workbenchSource, /@click="clearActionableFilter"/, '待处理筛选清除按钮未复用统一清除函数')
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

  it('已驳回版本在发布审批队列列表展示列表级驳回摘要', async () => {
    const [typeSource, releaseStoreSource, workbenchSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/utils/release-store.ts'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
    ])
    const tableStart = workbenchSource.indexOf('v-if="filteredVersions.length"')
    const tableSource = workbenchSource.slice(
      tableStart,
      workbenchSource.indexOf('<a-empty v-else-if="!loading"', tableStart),
    )

    assert.match(typeSource, /export interface ReleaseVersion \{[\s\S]*rejectedByUserId\?: string \| null[\s\S]*rejectedAt\?: string \| null[\s\S]*rejectReason\?: string \| null/, 'ReleaseVersion 合同未暴露驳回人、驳回时间和驳回原因')
    assert.match(releaseStoreSource, /rejected_by_user_id,[\s\S]*rejected_at::TEXT,[\s\S]*reject_reason/, 'release-store 列表查询未返回驳回人、驳回时间和驳回原因')
    assert.match(releaseStoreSource, /rejectedByUserId: row\.rejected_by_user_id,[\s\S]*rejectedAt: row\.rejected_at,[\s\S]*rejectReason: row\.reject_reason \|\| null/, 'release-store 未把驳回字段映射到 ReleaseVersion')
    assert.match(workbenchSource, /function rejectedSummaryText\(version: ReleaseVersion\): string/, '工作台缺少列表级驳回原因摘要格式化')
    assert.match(workbenchSource, /function rejectedMetaText\(version: ReleaseVersion\): string/, '工作台缺少列表级驳回人和时间格式化')
    assert.match(tableSource, /驳回摘要/, '发布审批队列列表缺少驳回摘要列')
    assert.match(tableSource, /record\.status === 'rejected'/, '驳回摘要应只在已驳回版本上展示')
    assert.match(tableSource, /rejectedSummaryText\(record\)/, '驳回摘要列未展示 rejectReason')
    assert.match(tableSource, /rejectedMetaText\(record\)/, '驳回摘要列未展示驳回人和驳回时间')
  })

  it('已驳回版本可重新提交到待初审并保留审计日志', async () => {
    const [typeSource, internalTypeSource, schemaSource, migrationSource, releaseStoreSource, apiSource, workbenchSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('internal/shared-types/domain-legacy.ts'),
      readSource('server/database/bootstrap/schema.ts'),
      readSource('scripts/migrations/2026-04-30-release-reset-to-first-review.sql'),
      readSource('server/utils/release-store.ts'),
      readSource('server/api/admin/releases/[id]/reset-to-first-review.post.ts'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
    ])
    const tableStart = workbenchSource.indexOf('v-if="filteredVersions.length"')
    const tableSource = workbenchSource.slice(
      tableStart,
      workbenchSource.indexOf('<a-empty v-else-if="!loading"', tableStart),
    )

    assert.match(typeSource, /export type ReleaseReviewAction[\s\S]*'reset_to_first_review'/, '共享类型未声明 reset_to_first_review 审核动作')
    assert.match(internalTypeSource, /export type ReleaseReviewAction[\s\S]*'reset_to_first_review'/, '内部共享类型未声明 reset_to_first_review 审核动作')
    assert.match(schemaSource, /release_review_logs_action_check[\s\S]*'reset_to_first_review'/, 'bootstrap schema 未放行 reset_to_first_review 审核动作')
    assert.match(migrationSource, /ADD CONSTRAINT release_review_logs_action_check[\s\S]*'reset_to_first_review'/, '迁移未扩展 review logs action check')
    assert.match(releaseStoreSource, /function workflowTimelineTitleFromReleaseAction[\s\S]*reset_to_first_review[\s\S]*重新提交初审/, '流程时间线未展示重新提交初审动作')
    assert.match(releaseStoreSource, /const reviewActions: ReleaseReviewAction\[\] = \[[\s\S]*'reset_to_first_review'[\s\S]*\]/, '审核洞察未把重新提交初审纳入总审核动作')
    assert.match(releaseStoreSource, /export async function resetRejectedReleaseToFirstReview\(/, 'release-store 缺少已驳回版本重提函数')
    assert.match(releaseStoreSource, /if \(row\.status !== 'rejected'\)\s+throw new Error\('RELEASE_RESET_TO_FIRST_REVIEW_STATUS_INVALID'\)/, '重提函数未限制仅已驳回版本可操作')
    assert.match(releaseStoreSource, /SET status = 'pending_first_review'[\s\S]*first_review_by_user_id = NULL[\s\S]*second_review_claimed_by_user_id = NULL[\s\S]*second_review_by_user_id = NULL[\s\S]*rejected_by_user_id = NULL[\s\S]*reject_reason = ''/, '重提函数未清空初审、二审和驳回字段')
    assert.match(releaseStoreSource, /action: 'reset_to_first_review'/, '重提函数未写入 reset_to_first_review 审计日志')
    assert.match(apiSource, /resetRejectedReleaseToFirstReview/, '重提 API 未调用 release-store 重提函数')
    assert.match(apiSource, /checkPlatformPermission\(event, user, 'contest\.write'\)/, '重提 API 未沿用 contest.write 权限')
    assert.match(apiSource, /仅已驳回版本允许重新提交初审/, '重提 API 未返回清晰状态错误')
    assert.match(workbenchSource, /action: 'approve' \| 'reject' \| 'publish' \| 'reset-to-first-review'/, '工作台 mutateVersion 未支持重提动作')
    assert.match(workbenchSource, /action === 'reset-to-first-review'[\s\S]*版本已重新提交初审/, '工作台未展示重提成功反馈')
    assert.match(tableSource, /record\.status === 'rejected'[\s\S]*mutateVersion\(record\.id, 'reset-to-first-review'\)[\s\S]*重新提交初审/, '列表操作列未对已驳回版本展示重新提交初审')
    assert.match(workbenchSource, /detail\.version\.status === 'rejected'[\s\S]*mutateVersion\(detail\.version\.id, 'reset-to-first-review'\)[\s\S]*重新提交初审/, '详情抽屉未对已驳回版本展示重新提交初审')
  })

  it('发布审批工作台支持内部滚动、加宽详情与局部飞书重读', async () => {
    const [workbenchSource, releaseStoreSource, refreshApiSource] = await Promise.all([
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
      readSource('server/utils/release-store.ts'),
      readOptionalSource('server/api/admin/releases/[id]/refresh-from-feishu.post.ts'),
    ])

    assert.match(workbenchSource, /releaseDetailDrawerWidth = 'min\(1180px, calc\(100vw - 48px\)\)'/, '版本详情 drawer 未按计划加宽')
    assert.match(workbenchSource, /release-workbench__queue-body/, '版本队列主体缺少内部滚动布局容器')
    assert.match(workbenchSource, /release-workbench__insights-scroll/, '左侧审核洞察区缺少内部滚动容器')
    assert.match(workbenchSource, /release-workbench__table-scroll/, '右侧版本表缺少内部滚动容器')
    assert.match(workbenchSource, /function canRefreshCurrentVersionFromFeishu\(/, '工作台缺少飞书单项重读可用性判断')
    assert.match(workbenchSource, /function refreshCurrentVersionFromFeishu\(/, '工作台缺少飞书单项重读动作')
    assert.match(workbenchSource, /重新从飞书读取该项/, '版本详情未展示飞书单项重读入口')
    assert.match(workbenchSource, /refresh-from-feishu/, '前端未调用 release 专用飞书重读接口')
    assert.match(releaseStoreSource, /export function resolveReleaseVersionRefreshSource\(/, 'release-store 缺少版本重读来源解析 helper')
    assert.match(refreshApiSource, /resolveReleaseVersionRefreshSource/, '重读 API 未复用 release-store 来源解析')
    assert.match(refreshApiSource, /runWorkflow/, '重读 API 未复用现有 Feishu workflow')
    assert.match(refreshApiSource, /mode:\s*'delta'/, '重读 API 未使用单条 delta 同步')
    assert.match(refreshApiSource, /recordIds:\s*\[refreshSource\.recordId\]/, '重读 API 未按当前版本 recordId 限定同步范围')
  })

  it('版本详情把关键词和资料预览改成审核友好的紧凑交互', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(workbenchSource, /function keywordTags\(/, '版本详情缺少关键词拆分去重 helper')
    assert.match(workbenchSource, /keywordTags\(contest\?\.keywords\)/, '竞赛快照未使用关键词标签渲染')
    assert.match(workbenchSource, /keywordTags\(item\.value\)/, '概览确认表单未使用关键词标签渲染')
    assert.match(workbenchSource, /resourcePreviewDrawerVisible/, '资料库快照缺少预览 drawer 状态')
    assert.match(workbenchSource, /function openResourcePreview\(item: ContestReleaseResourceSnapshot\)/, '资料库快照缺少点击预览动作')
    assert.match(workbenchSource, /@click="openResourcePreview\(item\)"/, '资料库文件行未绑定点击预览')
    assert.match(workbenchSource, /buildMappedResourcePreviewSource/, '资料附件预览未复用飞书映射附件代理')
    assert.match(workbenchSource, /资料预览/, '资料预览 drawer 缺少明确标题')
    assert.match(workbenchSource, /isResourcePreviewImage/, '资料预览缺少图片内嵌判断')
    assert.match(workbenchSource, /isResourcePreviewPdf/, '资料预览缺少 PDF 内嵌判断')
  })

  it('赛道确认表单改为右侧 drawer', async () => {
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')
    const trackDetailStart = workbenchSource.indexOf('title="赛道确认表单"')
    const trackDetailSource = workbenchSource.slice(Math.max(0, trackDetailStart - 220), trackDetailStart + 260)

    assert.match(trackDetailSource, /<a-drawer[\s\S]*v-model:visible="trackDetailVisible"/, '赛道确认表单未改为 drawer')
    assert.doesNotMatch(trackDetailSource, /<a-modal/, '赛道确认表单不应继续使用 modal')
  })

  it('赛道确认表单不会把裸附件文件名当图片地址，并补充多口径时间节点关联', async () => {
    const [workbenchSource, bitableSyncSource, attachmentApiSource, mappedAttachmentApiSource] = await Promise.all([
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
      readSource('server/services/feishu/bitable-sync.ts'),
      readSource('server/api/admin/integrations/feishu/bitable/attachments/[fileToken].get.ts'),
      readSource('server/api/admin/integrations/feishu/bitable/attachments/resolve.get.ts'),
    ])

    assert.match(workbenchSource, /function isBareCoverAttachmentName\(/, '封面预览缺少裸附件文件名识别')
    assert.match(workbenchSource, /if \(isBareCoverAttachmentName\(text\)\)\s+return ''/, '裸附件文件名不应被转换成根路径图片地址')
    assert.match(workbenchSource, /function coverPreviewUnavailableText\(value: string, previewSource = ''\)/, '封面确认表单缺少基于预览来源的不可预览原因提示')
    assert.match(workbenchSource, /coverPreviewUnavailableText\(item\.value, item\.previewSource\)/, '封面确认表单失败提示未使用实际预览来源')
    assert.match(workbenchSource, /function buildMappedCoverPreviewSource\(/, '裸附件文件名缺少按同步来源回查附件的预览地址')
    assert.match(workbenchSource, /attachments\/resolve\?/, '裸附件文件名未走受控附件解析预览接口')
    assert.match(bitableSyncSource, /function buildFeishuAttachmentPreviewUrl\(/, '附件 file_token 缺少本地受控预览 URL 构造')
    assert.match(bitableSyncSource, /buildFeishuAttachmentPreviewUrl\([\s\S]*pickFeishuAttachmentFileToken\(source\)/, '赛道封面附件未从 file_token 生成可预览地址')
    assert.match(bitableSyncSource, /export async function resolveFeishuBitableMappedAttachmentReference\(/, '历史裸文件名快照缺少按 sync item 与 record 回查附件 token 的服务')
    assert.match(bitableSyncSource, /getFeishuBitableRecordById/, '附件回查服务未读取飞书源记录原始字段')
    assert.match(bitableSyncSource, /source\.token/, '附件 token 解析未兼容飞书附件字段的 token 变体')
    assert.match(attachmentApiSource, /downloadFeishuDriveMedia/, '飞书附件预览 API 未代理下载附件内容')
    assert.match(mappedAttachmentApiSource, /resolveFeishuBitableMappedAttachmentReference/, '映射附件预览 API 未接入附件回查服务')
    assert.match(mappedAttachmentApiSource, /downloadFeishuDriveMedia/, '映射附件预览 API 未代理下载附件内容')
    assert.match(mappedAttachmentApiSource, /isSafeMappedAttachmentTargetKey/, '映射附件预览 API 缺少 targetKey 基本格式约束')
    assert.match(workbenchSource, /item\.syncSource\?\.recordId/, '赛道时间节点关联未纳入赛道 sync record 口径')
    assert.match(workbenchSource, /item\.syncSource\?\.syncItemId/, '赛道时间节点关联未纳入赛道 sync item 口径')
    assert.match(workbenchSource, /item\.name/, '赛道时间节点关联未纳入赛道名称口径')
    assert.match(workbenchSource, /timeline\.externalId/, '赛道时间节点关联未从节点 externalId 兜底识别派生前缀')
    assert.match(bitableSyncSource, /record_id/, '飞书关联记录字段未把 record_id 纳入特殊文本解析')
    assert.match(bitableSyncSource, /record_ids/, '飞书关联记录字段未把 record_ids 纳入特殊文本解析')
    assert.doesNotMatch(workbenchSource, /function mergedContestTimelineReviewText\(/, '概览抽屉不应再合并赛事与赛道时间节点')
    assert.match(workbenchSource, /function trackFormRows[\s\S]*trackTimelinesForTrack\(item, snapshot\)[\s\S]*item\.timelineText[\s\S]*function reviewLogPayloadText/, '赛道确认表单应在赛道维度展示结构化时间节点并用原始 timelineText 兜底')
  })

  it('赛事审核历史会把同步保留原因整理成可读摘要', async () => {
    const [releaseStoreSource, bitableSyncSource, auditPageSource, workbenchSource] = await Promise.all([
      readSource('server/utils/release-store.ts'),
      readSource('server/services/feishu/bitable-sync.ts'),
      readSource('app/pages/admin/contests/[id]/audit/index.vue'),
      readSource('app/components/admin/AdminReleaseWorkbench.vue'),
    ])

    assert.match(releaseStoreSource, /function buildContestSyncPreservationSummary\(/, 'release-store 未从版本快照整理同步保留摘要')
    assert.match(releaseStoreSource, /syncPreservationSummary/, '流程时间线 payload 未挂载同步保留摘要')
    assert.match(releaseStoreSource, /preservedFields: preservedContestFields/, '竞赛 preservedFields 未落到 contest.syncSource')
    assert.match(bitableSyncSource, /const coverImageUrl = normalizeImageReferenceText\(coverImageRaw\)/, '赛道封面原值未落到 track.coverImageUrl 快照')
    assert.match(bitableSyncSource, /const trackTimelines = buildTrackReleaseTimelines\(input\.externalId, timelineText\)/, '赛道时间节点未从 Feishu timelineText 构造结构化节点')
    assert.match(auditPageSource, /function syncPreservationSummarySections\(/, '审计页缺少同步保留摘要渲染 helper')
    assert.match(auditPageSource, /同步保留摘要/, '审计页未展示同步保留摘要')
    assert.match(auditPageSource, /Feishu 原值/, '审计页未区分 Feishu 原值')
    assert.match(auditPageSource, /本地沿用\/兜底/, '审计页未区分本地沿用或兜底')
    assert.match(workbenchSource, /function syncPreservationSummarySections\(/, '版本详情缺少同步保留摘要渲染 helper')
    assert.match(workbenchSource, /同步保留摘要/, '版本详情未展示同步保留摘要')
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
