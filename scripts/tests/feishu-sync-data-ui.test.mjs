import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const API_TYPES_FILE = resolve(process.cwd(), 'shared/types/api.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/feishu-integration-store.ts')
const API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/synced-data.get.ts')
const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu/data.vue')
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
  assert.match(typeSource, /export interface FeishuSyncedDataResult \{[\s\S]*syncOptions: FeishuSyncedDataSyncOption\[\][\s\S]*syncItemOptions: FeishuSyncedDataSyncItemOption\[\]/, '共享类型未声明查询台选项返回结构')
  assert.match(apiTypeSource, /FeishuSyncedDataQuery/, 'API 类型出口未透出同步数据查询结构')

  assert.match(storeSource, /export async function searchFeishuSyncedData/, '存储层缺少已同步数据查询函数')
  assert.match(storeSource, /rows\.sync_id = \$\$\{values\.length\}/, '存储层查询未支持 syncId 过滤')
  assert.match(storeSource, /rows\.scope = \$\$\{values\.length\}/, '存储层查询未支持 scope 过滤')
  assert.match(storeSource, /rows\.record_id = \$\$\{values\.length\}/, '存储层查询未支持 recordId 过滤')
  assert.match(storeSource, /latest_index[\s\S]*ref_only_rows[\s\S]*li\.id IS NULL/, '存储层未补齐 ref_only 兜底结果')
  assert.match(storeSource, /export async function listFeishuSyncedDataSyncItemOptions/, '存储层缺少同步项选项查询')

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
