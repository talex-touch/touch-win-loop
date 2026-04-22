import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const API_TYPES_FILE = resolve(process.cwd(), 'shared/types/api.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/feishu-integration-store.ts')
const API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/synced-data.get.ts')
const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu/data.vue')
const EDITOR_FILE = resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue')
const SAMPLE_API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/runs/[runId]/samples.get.ts')
const CLEANUP_PREVIEW_API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/cleanup-preview.post.ts')
const CLEANUP_API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/cleanup.post.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const OVERVIEW_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue')
const RESOURCE_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/contests/[id]/resources/index.vue')

it('飞书已同步数据查询台会暴露共享类型与只读查询接口', async () => {
  const [typeSource, apiTypeSource, storeSource, apiSource] = await Promise.all([
    readFile(DOMAIN_LEGACY_FILE, 'utf8'),
    readFile(API_TYPES_FILE, 'utf8'),
    readFile(STORE_FILE, 'utf8'),
    readFile(API_FILE, 'utf8'),
  ])

  assert.match(typeSource, /export interface FeishuSyncedDataQuery \{[\s\S]*syncId\?: string[\s\S]*syncItemId\?: string[\s\S]*scope\?: FeishuBitableSyncItemEntityType/, '共享类型未声明同步数据查询条件')
  assert.match(typeSource, /export interface FeishuSyncedDataRecord \{[\s\S]*syncId: string[\s\S]*syncName: string[\s\S]*syncItemId: string[\s\S]*syncItemName: string/, '共享类型未声明同步信息与同步项标识')
  assert.match(typeSource, /export interface FeishuSyncedDataMetrics \{[\s\S]*effectiveEntityTotal: number[\s\S]*latestRunSourceRowTotal: number[\s\S]*rawCountBasis: 'latest_run_per_sync_item'/, '共享类型未声明同步数据双口径指标')
  assert.match(typeSource, /export interface FeishuSyncedDataResult \{[\s\S]*metrics: FeishuSyncedDataMetrics[\s\S]*rawMetricAvailable: boolean[\s\S]*rawMetricNotice: string[\s\S]*syncOptions: FeishuSyncedDataSyncOption\[\][\s\S]*syncItemOptions: FeishuSyncedDataSyncItemOption\[\]/, '共享类型未声明查询台双口径返回结构')
  assert.match(typeSource, /export interface ReleaseSyncSource \{[\s\S]*syncItemId: string[\s\S]*syncRunId\?: string \| null[\s\S]*recordId\?: string \| null/, '共享类型未声明 release 行级同步来源')
  assert.match(typeSource, /export interface ContestReleaseContestSnapshot \{[\s\S]*syncSource\?: ReleaseSyncSource/, '竞赛 release snapshot 未声明 syncSource')
  assert.match(typeSource, /export interface ContestReleaseTrackSnapshot \{[\s\S]*syncSource\?: ReleaseSyncSource/, '赛道 release snapshot 未声明 syncSource')
  assert.match(typeSource, /export interface ContestReleaseTrackTimelineSnapshot \{[\s\S]*syncSource\?: ReleaseSyncSource/, '赛道时间线 release snapshot 未声明 syncSource')
  assert.match(typeSource, /export interface ContestReleaseResourceSnapshot \{[\s\S]*syncSource\?: ReleaseSyncSource/, '资料 release snapshot 未声明 syncSource')
  assert.match(typeSource, /export interface PolicyLibraryItemSnapshot \{[\s\S]*syncSource\?: ReleaseSyncSource/, '政策 release snapshot 未声明 syncSource')
  assert.match(typeSource, /export interface FeishuBitableSyncCleanupPreview \{[\s\S]*managedDataCounts[\s\S]*legacyReleaseCleanup[\s\S]*publishedDataRetained/, '共享类型未声明同步清理预览结果')
  assert.match(typeSource, /export interface FeishuBitableSyncCleanupResult \{[\s\S]*managedDataCounts[\s\S]*legacyForceCleared[\s\S]*publishedDataSkipped/, '共享类型未声明同步清理执行结果')
  assert.match(typeSource, /export type FeishuSyncRunSampleType = 'auto_sync_filtered' \| 'business_skipped'/, '共享类型未声明运行样本类型')
  assert.match(typeSource, /export interface FeishuSyncRunSamplePage \{[\s\S]*items: FeishuSyncRunSampleRecord\[\][\s\S]*total: number/, '共享类型未声明运行样本分页结果')
  assert.match(apiTypeSource, /FeishuSyncedDataQuery/, 'API 类型出口未透出同步数据查询结构')
  assert.match(apiTypeSource, /FeishuSyncRunSamplePage/, 'API 类型出口未透出运行样本分页结构')
  assert.match(apiTypeSource, /FeishuBitableSyncCleanupPreview/, 'API 类型出口未透出同步清理预览结构')
  assert.match(apiTypeSource, /FeishuBitableSyncCleanupResult/, 'API 类型出口未透出同步清理执行结构')

  assert.match(storeSource, /export async function searchFeishuSyncedData/, '存储层缺少已同步数据查询函数')
  assert.match(storeSource, /rows\.sync_id = \$\$\{values\.length\}/, '存储层查询未支持 syncId 过滤')
  assert.match(storeSource, /rows\.scope = \$\$\{values\.length\}/, '存储层查询未支持 scope 过滤')
  assert.match(storeSource, /rows\.record_id = \$\$\{values\.length\}/, '存储层查询未支持 recordId 过滤')
  assert.match(storeSource, /latest_index[\s\S]*ref_only_rows[\s\S]*li\.id IS NULL/, '存储层未补齐 ref_only 兜底结果')
  assert.match(storeSource, /rawMetricAvailable = !keyword && !externalId && !recordId/, '存储层未按细粒度筛选隐藏原始导入指标')
  assert.match(storeSource, /latest_run_source_row_total/, '存储层未聚合最近一次运行源行数')
  assert.match(storeSource, /export async function listFeishuSyncedDataSyncItemOptions/, '存储层缺少同步项选项查询')
  assert.match(storeSource, /export async function replaceFeishuBitableSyncRunSamples/, '存储层缺少运行样本持久化函数')
  assert.match(storeSource, /export async function listFeishuBitableSyncRunSamples/, '存储层缺少运行样本分页查询函数')

  assert.match(apiSource, /contest\.read_internal/, '查询接口未按 contest.read_internal 放开只读权限')
  assert.match(apiSource, /searchFeishuSyncedData/, '查询接口未接入存储层查询函数')
  assert.match(apiSource, /listFeishuSyncedDataSyncItemOptions/, '查询接口未返回同步项选项')
  assert.match(apiSource, /syncOptions/, '查询接口未返回同步信息选项')
  assert.match(apiSource, /syncItemOptions/, '查询接口未返回同步项选项')
})

it('飞书已同步数据查询台页面会展示筛选项、结果表和详情抽屉', async () => {
  const pageSource = await readFile(PAGE_FILE, 'utf8')

  assert.match(pageSource, /title="飞书已同步数据"/, '查询台页面未创建')
  assert.match(pageSource, /v-model="filters\.keyword"[\s\S]*placeholder="关键词"/, '查询台缺少 keyword 筛选项')
  assert.match(pageSource, /v-model="filters\.syncId"[\s\S]*placeholder="同步信息"/, '查询台缺少 syncId 筛选项')
  assert.match(pageSource, /v-model="filters\.syncItemId"[\s\S]*placeholder="同步项"/, '查询台缺少 syncItemId 筛选项')
  assert.match(pageSource, /v-model="filters\.scope"[\s\S]*placeholder="实体类型"/, '查询台缺少 scope 筛选项')
  assert.match(pageSource, /v-model="filters\.externalId"[\s\S]*placeholder="externalId"/, '查询台缺少 externalId 筛选项')
  assert.match(pageSource, /v-model="filters\.recordId"[\s\S]*placeholder="recordId"/, '查询台缺少 recordId 筛选项')
  assert.match(pageSource, /title: '同步信息'[\s\S]*title: '同步项'/, '查询台结果表未展示同步信息与同步项两列')
  assert.match(pageSource, /title: 'externalId \/ entityId \/ recordId'/, '查询台结果表未展示标识列')
  assert.match(pageSource, /查看详情/, '查询台操作列缺少详情入口')
  assert.match(pageSource, /打开同步配置/, '查询台操作列缺少同步配置入口')
  assert.match(pageSource, /title="同步数据详情"/, '查询台缺少详情 Drawer')
  assert.match(pageSource, /metadata/, '查询台详情 Drawer 未展示 metadata')
  assert.match(pageSource, /规则过滤不会产生同步数据/, '查询台空状态未说明规则过滤不会产生落库数据')
  assert.match(pageSource, /单行模拟/, '查询台空状态未引导使用单行模拟排查')
  assert.match(pageSource, /currentFilterSummary/, '查询台未展示当前筛选条件')
  assert.match(pageSource, /openFilteredSyncConfig/, '查询台空状态缺少返回同步配置入口')
  assert.match(pageSource, /当前有效实体数（当前仍可见）/, '查询台未展示新的当前有效实体口径')
  assert.match(pageSource, /最近运行源行数（最近一次运行抓取）/, '查询台未展示新的最近运行源行数口径')
  assert.match(pageSource, /已发布版本会保留/, '查询台未补充已发布版本保留但不重复计数的说明')
  assert.match(pageSource, /rawMetricNotice/, '查询台未展示原始导入口径说明')
})

it('运行样本分页接口、日志抽屉和单行模拟源字段分页已接入', async () => {
  const [editorSource, sampleApiSource, schemaSource] = await Promise.all([
    readFile(EDITOR_FILE, 'utf8'),
    readFile(SAMPLE_API_FILE, 'utf8'),
    readFile(SCHEMA_FILE, 'utf8'),
  ])

  assert.match(sampleApiSource, /listFeishuBitableSyncRunSamples/, '运行样本分页接口未接入存储层')
  assert.match(sampleApiSource, /type 必须合法/, '运行样本分页接口未校验样本类型')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS feishu_bitable_sync_run_samples/, 'Schema 未新增运行样本表')
  assert.match(editorSource, /新运行支持完整分页样本/, '日志抽屉未提示完整分页样本')
  assert.match(editorSource, /旧运行仅保留最多 12 条预览样本/, '日志抽屉未保留旧运行预览回退说明')
  assert.match(editorSource, /handleCurrentItemLogRunSamplePageChange\('auto_sync_filtered'/, '日志抽屉未接入规则过滤样本分页')
  assert.match(editorSource, /handleCurrentItemLogRunSamplePageChange\('business_skipped'/, '日志抽屉未接入业务跳过样本分页')
  assert.match(editorSource, /simulateSourceFieldsPageData/, '单行模拟未改为本地分页展示源字段')
  assert.match(editorSource, /共 \{\{ simulateSourceFieldsTotal \}\} 个源字段/, '单行模拟未展示源字段总量说明')
})

it('飞书同步项详情支持同步清理预览、危险确认与执行接口', async () => {
  const [editorSource, cleanupPreviewApiSource, cleanupApiSource] = await Promise.all([
    readFile(EDITOR_FILE, 'utf8'),
    readFile(CLEANUP_PREVIEW_API_FILE, 'utf8'),
    readFile(CLEANUP_API_FILE, 'utf8'),
  ])

  assert.match(cleanupPreviewApiSource, /contest\.write/, '同步清理预览接口未校验写权限')
  assert.match(cleanupPreviewApiSource, /previewFeishuBitableSyncItemCleanup/, '同步清理预览接口未接入预览逻辑')
  assert.match(cleanupApiSource, /contest\.write/, '同步清理执行接口未校验写权限')
  assert.match(cleanupApiSource, /cleanupFeishuBitableSyncItem/, '同步清理执行接口未接入清理逻辑')
  assert.match(editorSource, /清理同步数据/, '同步项详情缺少清理同步数据按钮')
  assert.match(editorSource, /cleanup-preview/, '同步项详情未请求清理预览接口')
  assert.match(editorSource, /\/cleanup`/, '同步项详情未请求清理执行接口')
  assert.match(editorSource, /请输入确认词/, '同步项详情缺少危险确认输入')
  assert.match(editorSource, /已发布的赛事\/政策正式数据会保留/, '同步项详情未提示已发布数据保留策略')
  assert.match(editorSource, /blockedConflictCount|冲突\/重复被拦截/, '同步项详情未展示冲突/重复被拦截信息')
})

it('飞书导入设计会在总览页和同步项详情里暴露阶段化流程', async () => {
  const [overviewSource, editorSource] = await Promise.all([
    readFile(OVERVIEW_FILE, 'utf8'),
    readFile(EDITOR_FILE, 'utf8'),
  ])

  assert.match(overviewSource, /const CREATE_SYNC_MILESTONES = \[/, '飞书总览页未收敛导入阶段常量')
  assert.match(overviewSource, /先建主库[\s\S]*再配子表[\s\S]*先预检再执行[\s\S]*最后启用调度/, '飞书总览页未展示完整导入主路径')
  assert.match(overviewSource, /syncProgressStageLabel\(sync: FeishuBitableSync\)/, '飞书总览页缺少同步阶段标签函数')
  assert.match(overviewSource, /syncNextActionText\(sync: FeishuBitableSync\)/, '飞书总览页缺少下一步动作摘要')
  assert.match(overviewSource, /下一步：\{\{ syncNextActionText\(record\) \}\}/, '飞书同步列表未展示下一步动作提示')
  assert.match(overviewSource, /runHealthFailed\(sync\.latestRunSummary\)/, '飞书总览页未把最近运行失败纳入阶段判断')
  assert.match(overviewSource, /runHealthWarned\(sync\.latestRunSummary\)/, '飞书总览页未把最近运行错误数纳入阶段判断')
  assert.match(overviewSource, /最近运行失败[\s\S]*最近运行告警/, '飞书总览页未区分失败态与告警态')
  assert.match(overviewSource, /成功但有告警/, '飞书总览页未把 success \\+ errorCount > 0 收口成告警文案')
  assert.match(overviewSource, /syncItemLatestRunSummary\(item: FeishuBitableSyncItem\)[\s\S]*runHealthLabel\(item\.latestRunSummary\)/, '飞书总览页子表预览未使用统一运行健康文案')
  assert.match(overviewSource, /:color="runHealthColor\(item\.latestRunSummary\)"/, '飞书总览页子表预览未按运行健康状态着色')
  assert.match(overviewSource, /先打开子表同步项查看错误日志，修复后再手动重跑。/, '飞书总览页缺少失败后的下一步动作')
  assert.match(overviewSource, /先核对错误记录和跳过原因，确认干净后再考虑启用调度。/, '飞书总览页缺少告警态后的下一步动作')

  assert.match(editorSource, /const itemStageCards = computed\(\(\) => \{/, '同步项详情未构建导入阶段状态卡')
  assert.match(editorSource, /key: 'source'[\s\S]*title: '来源'[\s\S]*key: 'mapping'[\s\S]*title: '基础映射'[\s\S]*key: 'writeback'[\s\S]*title: '回填配置'[\s\S]*key: 'autoSync'[\s\S]*title: '自动同步'[\s\S]*key: 'execution'[\s\S]*title: '执行入口'/, '同步项详情阶段卡未覆盖完整导入链路')
  assert.match(editorSource, /const itemNextStepHint = computed\(\(\) => \{/, '同步项详情缺少下一步建议计算')
  assert.match(editorSource, /当前导入阶段/, '同步项详情未展示阶段摘要区块')
  assert.match(editorSource, /下一步建议：\{\{ itemNextStepHint \}\}/, '同步项详情未展示下一步建议文案')
  assert.match(editorSource, /const syncDetailLatestRunSummary = computed\(\(\) => syncDetail\.value\?\.latestRunSummary \|\| null\)/, '同步项编辑器头部未收口主库最近执行摘要')
  assert.match(editorSource, /runHealthLabel\(syncDetailLatestRunSummary\)/, '同步项编辑器头部未展示主库最近执行健康标签')
  assert.match(editorSource, /syncDetailLatestRunText/, '同步项编辑器头部未统一展示主库最近执行文案')
  assert.match(editorSource, /runHealthFailed\(currentItem\.value\?\.latestRunSummary\)/, '同步项详情未把最近执行失败纳入阶段判断')
  assert.match(editorSource, /runHealthWarned\(currentItem\.value\?\.latestRunSummary\)/, '同步项详情未把最近执行错误数纳入阶段判断')
  assert.match(editorSource, /最近执行失败[\s\S]*最近执行告警/, '同步项详情未区分失败态与告警态')
  assert.match(editorSource, /latestRunSummaryText\(summary\?: FeishuTaskLatestRunSummary \| null\)[\s\S]*runHealthLabel\(summary\)/, '同步项详情最近结果摘要未使用统一运行健康文案')
  assert.match(editorSource, /function latestRunSummaryText\(summary\?: FeishuTaskLatestRunSummary \| null\): string \{[\s\S]*return `\$\{formatDateTime\(summary\.startedAt\)\} \/ \$\{runHealthLabel\(summary\)\} \/ \$\{triggerSourceLabel\(summary\.triggerSource\)\}`/, '同步项详情最近结果摘要未与总览页对齐触发来源文案')
  assert.match(editorSource, /最近执行：\$\{formatDateTime\(currentItem\.value\.latestRunSummary\.startedAt\)\} \/ \$\{runHealthLabel\(currentItem\.value\.latestRunSummary\)\}/, '同步项详情执行阶段摘要未复用统一运行健康文案')
  assert.match(editorSource, /:color="runHealthColor\(record\.latestRunSummary\)"/, '同步项详情同步项列表未按运行健康状态着色')
  assert.match(editorSource, /runHealthColor\(currentItemLogSelectedRun\)/, '同步项详情日志抽屉未按运行健康状态展示选中执行')
  assert.match(editorSource, /runHealthColor\(run\)/, '同步项详情最近执行历史未按运行健康状态着色')
  assert.match(editorSource, /runHealthLabel\(currentItem\.value\.latestRunSummary\)/, '同步项详情执行摘要未展示最近执行健康状态')
  assert.match(editorSource, /先看最近运行日志与预检结果，修正后再重跑。/, '同步项详情缺少失败后的执行提示')
  assert.match(editorSource, /最近一次执行仍有错误或部分成功，先清理异常记录，再决定是否开启自动同步。/, '同步项详情缺少告警态后的下一步建议')
})

it('飞书同步项预检结果会先给出结论摘要与下一步动作', async () => {
  const editorSource = await readFile(EDITOR_FILE, 'utf8')

  assert.match(editorSource, /function previewResultTone\(result: FeishuBitableSyncItemPreviewResult \| null\): ItemStageTone \{/, '同步项详情缺少预检结论色调 helper')
  assert.match(editorSource, /function previewResultStatusLabel\(result: FeishuBitableSyncItemPreviewResult \| null\): string \{/, '同步项详情缺少预检结论标题 helper')
  assert.match(editorSource, /function previewResultSummary\(result: FeishuBitableSyncItemPreviewResult \| null\): string \{/, '同步项详情缺少预检结论摘要 helper')
  assert.match(editorSource, /function previewResultNextActionText\(result: FeishuBitableSyncItemPreviewResult \| null\): string \{/, '同步项详情缺少预检下一步 helper')
  assert.match(editorSource, /预检结论/, '同步项详情未展示预检结论区块')
  assert.match(editorSource, /\{\{ previewResultSummary\(previewResult\) \}\}/, '同步项详情未展示预检结论摘要')
  assert.match(editorSource, /下一步：\{\{ previewResultNextActionText\(previewResult\) \}\}/, '同步项详情未展示预检后的下一步动作')
  assert.match(editorSource, /当前可以保存配置，并执行一次手动同步验证真实写入。/, '同步项详情缺少预检通过后的动作文案')
})

it('飞书集成页与资料管理页会补齐同步数据查询入口', async () => {
  const [overviewSource, resourcePageSource] = await Promise.all([
    readFile(OVERVIEW_FILE, 'utf8'),
    readFile(RESOURCE_PAGE_FILE, 'utf8'),
  ])

  assert.match(overviewSource, /查看所有已同步的数据/, '飞书集成配置卡片未提供全局同步数据入口')
  assert.match(overviewSource, /查看同步数据/, '飞书同步信息列表未提供按 syncId 查询入口')
  assert.match(overviewSource, /buildSyncedDataLink\(\{ syncId: record\.id \}\)/, '飞书同步信息行入口未绑定 syncId')
  assert.match(overviewSource, /const router = useRouter\(\)/, '飞书同步数据入口缺少路由解析兜底')
  assert.match(overviewSource, /window\.location\.assign\(router\.resolve\(target\)\.href\)/, '飞书同步数据入口未在导航失败时降级为浏览器跳转')
  assert.match(overviewSource, /const isOverviewRoute = computed\(\(\) => normalizedPath\.value === '\/admin\/integrations\/feishu'\)/, '飞书集成页未按精确路径区分总览与子路由')
  assert.match(overviewSource, /<NuxtPage v-else \/>/, '飞书集成页未为子路由渲染 NuxtPage')
  assert.match(resourcePageSource, /全览/, '资料管理页未提供同步数据全览入口')
  assert.match(resourcePageSource, /path: '\/admin\/integrations\/feishu\/data'[\s\S]*scope: 'resource'/, '资料管理页全览入口未跳转到 resource 视角的查询台')
})
