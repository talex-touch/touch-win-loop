import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

it('赛道同步映射会补齐扩展字段，并暴露赛道时间线实体选项', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')
  const configSource = await readFile(resolve(process.cwd(), 'shared/utils/feishu-bitable-sync-config.ts'), 'utf8')

  assert.match(componentSource, /coverImageUrl（封面）/, '赛道映射缺少封面字段')
  assert.match(componentSource, /location（具体位置）/, '赛道映射缺少位置字段')
  assert.match(componentSource, /organizer（主办方）/, '赛道映射缺少主办方字段')
  assert.match(componentSource, /undertaker（承办方）/, '赛道映射缺少承办方字段')
  assert.match(componentSource, /participantRequirements（参赛对象）/, '赛道映射缺少参赛对象字段')
  assert.match(componentSource, /teamRule（组队规则）/, '赛道映射缺少组队规则字段')
  assert.match(componentSource, /awardRatio（获奖比例）/, '赛道映射缺少获奖比例字段')
  assert.match(componentSource, /evidenceRequirements（必备项）/, '赛道映射缺少必备项字段')
  assert.match(componentSource, /scoringPoints（加分项）/, '赛道映射缺少加分项字段')
  assert.match(componentSource, /deductionItems（扣分项）/, '赛道映射缺少扣分项字段')
  assert.match(componentSource, /value: 'track_timeline', label: '赛道时间线'/, '同步项实体类型缺少赛道时间线')
  assert.match(componentSource, /nodeType（节点类型）/, '赛道时间线映射缺少节点类型字段')
  assert.match(componentSource, /startAt（开始时间）/, '赛道时间线映射缺少开始时间字段')
  assert.match(componentSource, /endAt（结束时间）/, '赛道时间线映射缺少结束时间字段')

  assert.match(configSource, /if \(entityType === 'track'\) \{[\s\S]*coverImageUrl:\s*''[\s\S]*location:\s*''[\s\S]*organizer:\s*''[\s\S]*undertaker:\s*''[\s\S]*participantRequirements:\s*''[\s\S]*teamRule:\s*''[\s\S]*awardRatio:\s*''[\s\S]*evidenceRequirements:\s*''[\s\S]*scoringPoints:\s*''[\s\S]*deductionItems:\s*''/, '赛道默认模板未补齐扩展字段')
  assert.match(configSource, /if \(entityType === 'track_timeline'\) \{[\s\S]*trackExternalIdField:\s*''[\s\S]*year:\s*''[\s\S]*nodeType:\s*''[\s\S]*startAt:\s*''[\s\S]*endAt:\s*''[\s\S]*note:\s*''[\s\S]*sourceLink:\s*''/, '赛道时间线默认模板未生成')
})

it('赛道同步执行会写入扩展字段并派生 rubric', async () => {
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')

  const applyTrackMatch = serviceSource.match(/async function applyTrackRecord\([\s\S]*?\n\}\n\nasync function applyTrackTimelineRecord/)
  assert.ok(applyTrackMatch, '未找到赛道同步执行逻辑')
  const applyTrackBlock = applyTrackMatch[0]

  assert.match(applyTrackBlock, /getText\('coverImageUrl'\)/, '赛道同步未读取封面字段')
  assert.match(applyTrackBlock, /getText\('location'\)/, '赛道同步未读取位置字段')
  assert.match(applyTrackBlock, /getText\('organizer'\)/, '赛道同步未读取主办方字段')
  assert.match(applyTrackBlock, /getText\('undertaker'\)/, '赛道同步未读取承办方字段')
  assert.match(applyTrackBlock, /getText\('participantRequirements'\)/, '赛道同步未读取参赛对象字段')
  assert.match(applyTrackBlock, /getText\('teamRule'\)/, '赛道同步未读取组队规则字段')
  assert.match(applyTrackBlock, /getText\('awardRatio'\)/, '赛道同步未读取获奖比例字段')
  assert.match(applyTrackBlock, /await syncTrackRubric\(db,\s*\{/, '赛道同步未在 upsert 后派生 rubric')

  assert.match(serviceSource, /async function syncTrackRubric\(/, '缺少赛道 rubric 派生 helper')
  assert.match(serviceSource, /hasAnyRubricConfig = rubricKeys\.some/, '赛道 rubric 派生未按字段映射白名单触发')
  assert.match(serviceSource, /patchAdminRubric\(db,\s*\{[\s\S]*scoringPoints,[\s\S]*deductionItems,[\s\S]*evidenceRequirements,/, '赛道已有 rubric 时未走 patch')
  assert.match(serviceSource, /createAdminRubric\(db,\s*\{[\s\S]*trackId: input\.trackId,[\s\S]*dimensions:\s*\[\{[\s\S]*weight:\s*100/, '赛道缺少 rubric 时未自动创建默认 rubric')
})

it('赛道时间线会走独立模型、独立 API 和独立同步链路', async () => {
  const domainSource = await readFile(resolve(process.cwd(), 'shared/types/domain.ts'), 'utf8')
  const dbSource = await readFile(resolve(process.cwd(), 'server/utils/db.ts'), 'utf8')
  const storeSource = await readFile(resolve(process.cwd(), 'server/utils/contest-store.ts'), 'utf8')
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')
  const indexApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/contests/[id]/track-timelines.get.ts'), 'utf8')
  const postApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/contests/[id]/track-timelines.post.ts'), 'utf8')
  const patchApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/contests/[id]/track-timelines.patch.ts'), 'utf8')

  assert.match(domainSource, /export interface TrackTimeline \{[\s\S]*trackId: string[\s\S]*nodeType: TimelineNodeType/, '领域模型缺少 TrackTimeline')
  assert.match(domainSource, /FeishuBitableSyncItemEntityType = 'contest' \| 'track' \| 'track_timeline' \| 'resource'/, '飞书同步实体类型未加入 track_timeline')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS contest_track_timelines \(/, '数据库未创建赛道时间线表')
  assert.match(dbSource, /idx_contest_track_timelines_track/, '数据库未为赛道时间线建立索引')
  assert.match(storeSource, /export async function listAdminTrackTimelines\(/, 'store 未暴露赛道时间线列表')
  assert.match(storeSource, /export async function createAdminTrackTimeline\(/, 'store 未暴露赛道时间线创建')
  assert.match(storeSource, /export async function patchAdminTrackTimeline\(/, 'store 未暴露赛道时间线更新')
  assert.match(serviceSource, /async function applyTrackTimelineRecord\(/, '同步服务缺少赛道时间线执行逻辑')
  assert.match(serviceSource, /scope: 'track_timeline'/, '赛道时间线执行链路未使用独立 scope')
  assert.match(indexApiSource, /listAdminTrackTimelines/, '赛道时间线列表 API 未接 store')
  assert.match(postApiSource, /createAdminTrackTimeline/, '赛道时间线创建 API 未接 store')
  assert.match(patchApiSource, /patchAdminTrackTimeline/, '赛道时间线更新 API 未接 store')
})

it('后台赛道手工页与赛道时间线页面会暴露新增维护能力', async () => {
  const trackNewSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/tracks/new.vue'), 'utf8')
  const trackEditSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/tracks/[trackId]/edit.vue'), 'utf8')
  const timelineIndexSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/track-timelines/index.vue'), 'utf8')
  const timelineNewSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/track-timelines/new.vue'), 'utf8')
  const timelineEditSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/track-timelines/[timelineId]/edit.vue'), 'utf8')
  const contestWorkspaceSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id].vue'), 'utf8')

  assert.match(trackNewSource, /v-model="form\.coverImageUrl"/, '赛道新增页未暴露封面维护能力')
  assert.match(trackNewSource, /v-model="form\.organizer"/, '赛道新增页未暴露主办方维护能力')
  assert.match(trackNewSource, /v-model="form\.undertaker"/, '赛道新增页未暴露承办方维护能力')
  assert.match(trackNewSource, /v-model="form\.participantRequirements"/, '赛道新增页未暴露参赛对象维护能力')
  assert.match(trackNewSource, /v-model="form\.teamRule"/, '赛道新增页未暴露组队规则维护能力')
  assert.match(trackNewSource, /v-model="form\.awardRatio"/, '赛道新增页未暴露获奖比例维护能力')
  assert.match(trackEditSource, /form\.coverImageUrl = item\.coverImageUrl \|\| ''/, '赛道编辑页未回填封面字段')
  assert.match(trackEditSource, /form\.awardRatio = item\.awardRatio \|\| ''/, '赛道编辑页未回填获奖比例字段')

  assert.match(timelineIndexSource, /赛道时间线管理/, '赛道时间线列表页未创建')
  assert.match(timelineNewSource, /endpoint\(`\/admin\/contests\/\$\{contestId\.value\}\/track-timelines`\)/, '赛道时间线新增页未调用新 API')
  assert.match(timelineEditSource, /trackTimelineId: timelineId\.value/, '赛道时间线编辑页未提交 trackTimelineId')
  assert.match(contestWorkspaceSource, /label: '赛道时间线'/, '赛事工作台未接入赛道时间线模块入口')
})
