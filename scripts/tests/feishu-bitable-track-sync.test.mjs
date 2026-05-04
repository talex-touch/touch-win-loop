import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({}),
}))

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

function buildReleaseVersionRow({ id, snapshot }) {
  return {
    id,
    scope_kind: 'contest',
    scope_id: snapshot.contestExternalId,
    live_entity_id: 'contest-live-1',
    scope_title: snapshot.contest?.name || snapshot.contestExternalId,
    version_number: 1,
    status: 'pending_first_review',
    snapshot_json: snapshot,
    diff_summary_json: {
      createdCount: 0,
      updatedCount: 0,
      removedCount: 0,
      changedExternalIds: [],
    },
    sync_item_id: null,
    sync_run_id: null,
    first_review_by_user_id: null,
    first_review_at: null,
    second_review_claimed_by_user_id: null,
    second_review_claimed_at: null,
    second_review_by_user_id: null,
    second_review_at: null,
    rejected_by_user_id: null,
    rejected_at: null,
    reject_reason: '',
    published_by_user_id: null,
    published_at: null,
    created_by_user_id: 'admin-1',
    updated_by_user_id: 'admin-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('版本审批与赛道同步新流程', () => {
  it('赛道时间节点解析支持业务节点标签、同年补全和人工确认状态', async () => {
    const { parseTimelineTextLines } = await import('../../shared/utils/feishu-timeline-parser.ts')
    const items = parseTimelineTextLines('截至 2025-05-15：企业命题征集：2025年5月15日前。\n报名：2024年5月15日 - 8月1日报名；6-8月校赛 / 省赛；10月12-15日总决赛')

    assert.ok(items.some(item => item.businessNodeLabel === '命题征集' && item.nodeType === 'submission' && item.endAt?.startsWith('2025-05-15')), '命题征集截止未识别为业务节点')
    assert.ok(items.some(item => item.businessNodeLabel === '报名' && item.startAt?.startsWith('2024-05-15') && item.endAt?.startsWith('2024-08-01')), '报名同年日期区间未补全')
    assert.ok(items.some(item => item.businessNodeLabel === '校赛' && item.startAt?.startsWith('2024-06-01') && item.endAt?.startsWith('2024-08-31')), '校赛月份区间未识别')
    assert.ok(items.some(item => item.businessNodeLabel === '总决赛' && item.startAt?.startsWith('2024-10-12') && item.endAt?.startsWith('2024-10-15')), '总决赛月日范围未识别')

    const unknown = parseTimelineTextLines('路演彩排另行通知')
    assert.equal(unknown[0]?.nodeType, 'other')
    assert.equal(unknown[0]?.recognitionStatus, 'needs_confirmation')
  })

  it('赛道同步映射已覆盖赛道字段，并统一收敛到 timelineText', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')
    const configSource = await readSource('shared/utils/feishu-bitable-sync-config.ts')
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')
    const timelineParserSource = await readSource('shared/utils/feishu-timeline-parser.ts')
    const releaseStoreSource = await readSource('server/utils/release-store.ts')
    const contestStoreSource = await readSource('server/utils/contest-store.ts')
    const typeSource = await readSource('shared/types/domain-legacy.ts')
    const internalTypeSource = await readSource('internal/shared-types/domain-legacy.ts')

    assert.match(componentSource, /coverImageUrl（封面）/, '赛道映射缺少封面字段')
    assert.match(componentSource, /location（具体位置）/, '赛道映射缺少具体位置字段')
    assert.match(componentSource, /organizer（主办方）/, '赛道映射缺少主办方字段')
    assert.match(componentSource, /undertaker（承办方）/, '赛道映射缺少承办方字段')
    assert.match(componentSource, /participantRequirements（参赛对象）/, '赛道映射缺少参赛对象字段')
    assert.match(componentSource, /teamRule（组队规则）/, '赛道映射缺少组队规则字段')
    assert.doesNotMatch(componentSource, /track:\s*\[[\s\S]*currentSeason（当前届次）[\s\S]*\],\n\s{2}track_timeline:/, '赛道映射不应暴露当前届次字段')
    assert.match(componentSource, /timelineText（时间节点）/, '赛道映射未统一使用时间节点文本')
    assert.match(componentSource, /evidenceRequirements（必备项）/, '赛道映射缺少必备项字段')
    assert.match(componentSource, /deliverableTypes（提交内容）/, '赛道映射缺少提交内容字段')
    assert.match(configSource, /if \(entityType === 'track'\) \{[\s\S]*timelineText:\s*''[\s\S]*evidenceRequirements:\s*''[\s\S]*deliverableTypes:\s*''/, '赛道默认模板未补齐时间节点、必备项与提交内容')
    assert.doesNotMatch(configSource, /if \(entityType === 'track'\) \{[\s\S]*currentSeason:\s*''[\s\S]*\n\s{2}return \{/, '赛道默认模板不应包含当前届次字段')
    assert.doesNotMatch(serviceSource, /track:[\s\S]*'currentSeason'[\s\S]*'timelineText'/, '赛道预检字段不应包含 currentSeason')
    assert.doesNotMatch(serviceSource, /async function applyTrackRecord[\s\S]*input\.resolver\.getText\('currentSeason'\)[\s\S]*const trackSnapshot/, '赛道同步不应读取 currentSeason')
    assert.match(serviceSource, /async function applyTrackRecord[\s\S]*input\.resolver\.getStringArray\('evidenceRequirements'\)[\s\S]*const trackSnapshot/, '赛道同步应读取 evidenceRequirements 作为必备项')
    assert.match(typeSource, /export interface ContestReleaseTrackSnapshot \{[\s\S]*timelineText\?: string/, '赛道 release snapshot 未声明原始时间节点文本')
    assert.match(internalTypeSource, /export interface ContestReleaseTrackSnapshot \{[\s\S]*timelineText\?: string/, '内部共享类型未声明原始时间节点文本')
    assert.match(serviceSource, /normalizeImageReferenceText/, '赛道封面同步应优先保留图片可访问地址')
    assert.match(serviceSource, /input\.resolver\.getValue\('coverImageUrl'\)/, '赛道封面同步不应只读取附件文件名')
    assert.match(serviceSource, /const trackSnapshot: ContestReleaseTrackSnapshot = \{[\s\S]*teamRule,[\s\S]*timelineText,[\s\S]*awardRatio/, '赛道同步未把原始 timelineText 保留到赛道快照')
    assert.match(serviceSource, /const trackTimelines = buildTrackReleaseTimelines\(input\.externalId, timelineText\)/, '赛道同步未从 timelineText 构造赛道时间节点')
    assert.match(timelineParserSource, /function collectExplicitTimelineDateTokens\(/, '赛道时间节点解析应只收集明确日级日期 token')
    assert.match(timelineParserSource, /businessNodeLabel/, '赛道时间节点解析应输出可扩展业务节点标签')
    assert.match(timelineParserSource, /recognitionStatus/, '赛道时间节点解析应输出识别状态')
    assert.match(timelineParserSource, /numericDatePattern|\\d\{4\}\(\[\.\/-\]\)\\d\{1,2\}\\1\\d\{1,2\}/, '赛道时间节点解析缺少数字日期严格匹配')
    assert.match(timelineParserSource, /chineseDatePattern|\\d\{4\}\\s\*年\\s\*\\d\{1,2\}\\s\*月\\s\*\\d\{1,2\}\\s\*日/, '赛道时间节点解析缺少中文年月日严格匹配')
    assert.doesNotMatch(serviceSource, /body\.match\(\/\\d\{4\}\[\.\/-\]\\d\{1,2\}\[\.\/-\]\\d\{1,2\}\/g\)/, '赛道时间节点不应把 2026.5-6 月误解析成日级日期')
    assert.doesNotMatch(serviceSource, /if \(!startAt && !endAt\)\s+continue/, '时间节点解析不应丢弃只有月份或说明的赛道库原文')
    assert.match(releaseStoreSource, /if \(\(input\.trackTimelines \|\| \[\]\)\.length > 0\)/, '赛道记录未提供可解析时间节点时不应清空已有时间节点')
    assert.doesNotMatch(releaseStoreSource, /resolveContestReleaseEffectiveMetadata[\s\S]*snapshot\.tracks\.map\(item => item\.organizer\)/, '竞赛发布校验不应从赛道主办方回填竞赛主办方')
    assert.match(releaseStoreSource, /resolveContestReleaseEffectiveMetadata[\s\S]*snapshot\.tracks\.map\(item => item\.participantRequirements\)/, '发布校验未从赛道快照聚合参赛对象')
    assert.doesNotMatch(releaseStoreSource, /resolveContestReleaseEffectiveMetadata[\s\S]*snapshot\.tracks\.map\(item => item\.currentSeason\)/, '发布校验不应从赛道快照聚合当前届次')
    assert.match(releaseStoreSource, /inferLatestTimelineSeason\(\[\.\.\.snapshot\.timelines, \.\.\.snapshot\.trackTimelines\]\)/, '发布校验未用时间线年份兜底届次')
    assert.doesNotMatch(contestStoreSource, /resolveContestPublishEffectiveMetadata[\s\S]*input\.contest\.tracks[\s\S]*item\.organizer/, 'live 发布校验不应从赛道主办方回填竞赛主办方')
    assert.match(contestStoreSource, /resolveContestPublishEffectiveMetadata[\s\S]*input\.contest\.tracks[\s\S]*item\.participantRequirements/, 'live 发布校验未从赛道聚合参赛对象')
    assert.match(contestStoreSource, /const trackTimelines = await loadTrackTimelines\(db, \[contest\.id\]\)[\s\S]*trackTimelines,/, 'live 发布校验未纳入赛道时间线兜底')
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
    assert.match(releaseStoreSource, /async function findSyncRunScopedReleaseVersion\(/, '未按 sync run 做幂等复用查询')
    assert.match(releaseStoreSource, /async function createWorkingReleaseVersion\(/, '未收口为显式新版本创建流程')
    assert.match(releaseStoreSource, /status <> 'published'[\s\S]*status <> 'superseded'/, '新版本创建时未替换更老的未发布版本')
    assert.match(releaseStoreSource, /if \(!existingVersion && !hasReleaseDiffSummaryChanges\(diffSummary\)\)/, '无 diff 场景仍可能误建新版本')
    assert.match(releaseStoreSource, /action: 'published'/, '发布后未记录审批日志')
    assert.match(schemaSource, /'sync_draft_overwritten'/, 'release_review_logs schema 未放行覆盖草稿动作')
    assert.match(typeSource, /'sync_draft_overwritten'/, '共享类型未补齐覆盖草稿动作')
    assert.match(workbenchSource, /流程时间线/, '审批工作台未展示版本流程时间线')
    assert.match(workbenchSource, /发布校验/, '审批工作台未展示发布校验区块')
    assert.match(claimApiSource, /claimRandomPendingSecondReviewRelease/, '二审领取 API 未接入 release-store')
    assert.match(approveApiSource, /approveReleaseVersion/, '审批 API 未接入 release-store')
    assert.match(rejectApiSource, /rejectReleaseVersion/, '驳回 API 未接入 release-store')
    assert.match(publishApiSource, /publishReleaseVersion/, '发布 API 未接入 release-store')
  })

  it('赛道确认表单保存会按统一赛道身份替换结构化节点', async () => {
    const { patchContestReleaseTrackTimelines } = await import('../../server/utils/release-store.ts')
    const releaseVersionId = 'release_track_timeline_patch'
    const trackExternalId = 'track-ext-1'
    const snapshot = {
      contestExternalId: 'contest-ext-1',
      contest: {
        externalId: 'contest-ext-1',
        name: '结构化节点替换测试竞赛',
        level: 'national',
        officialUrl: 'https://example.test/contest',
        summary: '用于验证赛道确认表单保存行为。',
        disciplines: ['计算机'],
        keywords: [],
        recommendedFor: [],
        visibility: 'internal',
      },
      tracks: [{
        externalId: trackExternalId,
        liveId: 'track-live-1',
        name: '目标赛道',
      }, {
        externalId: 'track-ext-2',
        liveId: 'track-live-2',
        name: '其他赛道',
      }],
      timelines: [],
      trackTimelines: [
        {
          externalId: 'direct-old',
          trackExternalId,
          trackLiveId: null,
          year: 2024,
          nodeType: 'registration',
          businessNodeLabel: '旧报名',
          recognitionStatus: 'auto_recognized',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
        {
          externalId: 'live-old',
          trackExternalId: '',
          trackLiveId: 'track-live-1',
          year: 2024,
          nodeType: 'preliminary',
          businessNodeLabel: '旧初赛',
          recognitionStatus: 'needs_confirmation',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
        {
          externalId: `derived:track:${trackExternalId}:old-derived`,
          trackExternalId: '',
          trackLiveId: null,
          year: 2024,
          nodeType: 'final',
          businessNodeLabel: '旧派生',
          recognitionStatus: 'auto_recognized',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
        {
          externalId: `legacy:track:${trackExternalId}:old-legacy`,
          trackExternalId: '',
          trackLiveId: null,
          year: 2024,
          nodeType: 'other',
          businessNodeLabel: '旧兼容',
          recognitionStatus: 'auto_recognized',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
        {
          externalId: 'other-track-node',
          trackExternalId: 'track-ext-2',
          trackLiveId: 'track-live-2',
          year: 2024,
          nodeType: 'registration',
          businessNodeLabel: '其他赛道报名',
          recognitionStatus: 'auto_recognized',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
        {
          externalId: 'opened-only-stale',
          trackExternalId: '',
          trackLiveId: '',
          year: 2024,
          nodeType: 'other',
          businessNodeLabel: '用户已删除节点',
          recognitionStatus: 'needs_confirmation',
          startAt: null,
          endAt: null,
          note: '',
          sourceLink: '',
        },
      ],
      resources: [],
    }
    const queries = []
    const db = {
      async query(sql, values = []) {
        queries.push({ sql, values })
        if (sql.includes('FOR UPDATE')) {
          return { rows: [buildReleaseVersionRow({ id: releaseVersionId, snapshot })] }
        }
        if (sql.includes('FROM release_versions') && sql.includes('status = $3')) {
          return { rows: [] }
        }
        if (sql.includes('FROM release_versions') && sql.includes('id = $1') && sql.includes('LIMIT 1')) {
          const updateQuery = queries.find(item => item.sql.includes('SET snapshot_json = $2::JSONB'))
          const nextSnapshot = updateQuery ? JSON.parse(updateQuery.values[1]) : snapshot
          return { rows: [buildReleaseVersionRow({ id: releaseVersionId, snapshot: nextSnapshot })] }
        }
        if (sql.includes('FROM release_review_logs'))
          return { rows: [] }
        if (sql.includes('INSERT INTO release_review_logs'))
          return { rows: [] }
        if (sql.includes('UPDATE release_versions'))
          return { rows: [] }
        if (sql.includes('FROM feishu_external_refs'))
          return { rows: [] }
        return { rows: [] }
      },
    }

    const detail = await patchContestReleaseTrackTimelines(db, {
      actorUserId: 'admin-1',
      releaseVersionId,
      trackExternalId,
      removedTrackTimelineExternalIds: ['opened-only-stale'],
      trackTimelines: [{
        externalId: 'manual-new',
        trackExternalId,
        trackLiveId: null,
        year: 2026,
        nodeType: 'other',
        businessNodeLabel: '新节点',
        recognitionStatus: 'manual_adjusted',
        startAt: null,
        endAt: null,
        note: '',
        sourceLink: '',
      }],
    })

    const savedExternalIds = detail.version.snapshot.trackTimelines.map(item => item.externalId).sort()
    assert.deepEqual(savedExternalIds, ['manual-new', 'other-track-node'])
    const savedTimeline = detail.version.snapshot.trackTimelines.find(item => item.externalId === 'manual-new')
    assert.equal(savedTimeline.trackExternalId, trackExternalId)
    assert.equal(savedTimeline.trackLiveId, 'track-live-1')
    assert.equal(savedTimeline.recognitionStatus, 'manual_adjusted')
  })

  it('contest release snapshot 与发布链路不再依赖竞赛库已移除字段', async () => {
    const releaseStoreSource = await readSource('server/utils/release-store.ts')
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')

    assert.doesNotMatch(serviceSource, /async function applyContestRecord[\s\S]*input\.resolver\.getText\('organizer'\)[\s\S]*async function applyTrackRecord/, '竞赛库同步不应读取 organizer')
    assert.doesNotMatch(serviceSource, /async function applyContestRecord[\s\S]*input\.resolver\.getText\('coOrganizer'\)[\s\S]*async function applyTrackRecord/, '竞赛库同步不应读取 coOrganizer')
    assert.doesNotMatch(serviceSource, /async function applyContestRecord[\s\S]*input\.resolver\.getText\('participantRequirements'\)[\s\S]*async function applyTrackRecord/, '竞赛库同步不应读取 participantRequirements')
    assert.doesNotMatch(serviceSource, /async function applyContestRecord[\s\S]*input\.resolver\.getText\('teamRule'\)[\s\S]*async function applyTrackRecord/, '竞赛库同步不应读取 teamRule')
    assert.doesNotMatch(serviceSource, /async function applyContestRecord[\s\S]*input\.resolver\.getText\('currentSeason'\)[\s\S]*async function applyTrackRecord/, '竞赛库同步不应读取 currentSeason')
    assert.match(releaseStoreSource, /organizer: detail\.contest\.organizer \|\| ''/, 'release 基线快照应带回 organizer 作为人工字段保留基线')
    assert.match(releaseStoreSource, /coOrganizer: detail\.contest\.coOrganizer \|\| ''/, 'release 基线快照应带回 coOrganizer 作为人工字段保留基线')
    assert.match(releaseStoreSource, /participantRequirements: detail\.contest\.participantRequirements \|\| ''/, 'release 基线快照应带回 participantRequirements 作为人工字段保留基线')
    assert.match(releaseStoreSource, /teamRule: detail\.contest\.teamRule \|\| ''/, 'release 基线快照应带回 teamRule 作为人工字段保留基线')
    assert.match(releaseStoreSource, /currentSeason: detail\.contest\.currentSeason \|\| ''/, 'release 基线快照应带回 currentSeason 作为人工字段保留基线')
    assert.match(releaseStoreSource, /mergeContestManualPreservedFields/, '竞赛同步应显式合并保留人工字段')
    assert.match(releaseStoreSource, /preservedFields: preservedContestFields/, '竞赛同步应把保留字段写入 syncSource.preservedFields')
    assert.doesNotMatch(releaseStoreSource, /patch: \{[\s\S]*organizer: effectiveMetadata\.organizer/, '发布版本时不应把赛道主办方写回竞赛 organizer')
    assert.doesNotMatch(releaseStoreSource, /patch: \{[\s\S]*coOrganizer: normalizeText\(snapshot\.contest\.coOrganizer\)/, '发布版本时不应从竞赛快照写回 coOrganizer')
    assert.doesNotMatch(releaseStoreSource, /patch: \{[\s\S]*teamRule: normalizeText\(snapshot\.contest\.teamRule\)/, '发布版本时不应从竞赛快照写回 teamRule')
    assert.match(releaseStoreSource, /patch: \{[\s\S]*participantRequirements: effectiveMetadata\.participantRequirements/, '发布版本时未按有效元信息回写 participantRequirements')
    assert.match(releaseStoreSource, /patch: \{[\s\S]*currentSeason: effectiveMetadata\.currentSeason/, '发布版本时未按有效元信息回写 currentSeason')
  })

  it('管理后台已经提供版本队列、竞赛版本页和政策版本页入口', async () => {
    const adminIndexSource = await readSource('app/pages/admin/index.vue')
    const contestWorkspaceSource = await readSource('app/pages/admin/contests/[id].vue')
    const queuePageSource = await readSource('app/pages/admin/releases/queue.vue')
    const contestReleasePageSource = await readSource('app/pages/admin/contests/[id]/releases/index.vue')
    const policyIndexPageSource = await readSource('app/pages/admin/policies/index.vue')
    const policyReleasePageSource = await readSource('app/pages/admin/policies/releases.vue')
    const workbenchSource = await readSource('app/components/admin/AdminReleaseWorkbench.vue')

    assert.match(adminIndexSource, /to:\s*'\/admin\/releases\/queue'/, '管理首页未接入发布审批入口')
    assert.match(adminIndexSource, /to:\s*'\/admin\/policies'/, '管理首页未接入政策库入口')
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
