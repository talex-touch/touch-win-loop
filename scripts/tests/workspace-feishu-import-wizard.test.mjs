import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const SHARED_UTIL_FILE = resolve(process.cwd(), 'shared/utils/workspace-feishu-integration.ts')
const SOURCES_SEARCH_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/sources/search.get.ts')
const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const USER_SETTINGS_THIRD_PARTY_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue')

describe('workspace Feishu import wizard contracts', () => {
  it('declares source search result type and parses Feishu resource URLs', async () => {
    const [domainSource, utilSource] = await Promise.all([
      readFile(DOMAIN_FILE, 'utf8'),
      readFile(SHARED_UTIL_FILE, 'utf8'),
    ])

    assert.match(domainSource, /interface WorkspaceFeishuSourceSearchResult/, '缺少飞书资源搜索结果类型')
    assert.match(domainSource, /linkedResourceId\?: string \| null/, '搜索结果必须标注已映射资源')
    assert.match(domainSource, /lastImportStatus\?: WorkspaceExternalResourceRef\['lastImportStatus'\]/, '搜索结果必须透出最近导入状态')
    assert.match(utilSource, /parseWorkspaceFeishuSourceUrl/, '缺少飞书链接解析 helper')
    assert.match(utilSource, /'docx', 'docs', 'doc'/, '链接解析缺少文档 token 支持')
    assert.match(utilSource, /'wiki'/, '链接解析缺少 Wiki token 支持')
    assert.match(utilSource, /'file'/, '链接解析缺少云盘文件 token 支持')
    assert.match(utilSource, /'base', 'bitable'/, '链接解析缺少多维表 app token 支持')
    assert.match(utilSource, /'table', 'table_id', 'tableId'/, '多维表链接解析缺少 tableId 支持')
    assert.match(utilSource, /'view', 'view_id', 'viewId'/, '多维表链接解析缺少 viewId 支持')
  })

  it('extends sources search API with linked, remote, and resolve modes through marketplace token', async () => {
    const source = await readFile(SOURCES_SEARCH_API_FILE, 'utf8')

    assert.match(source, /normalizeSearchMode/, 'sources/search 缺少 mode 归一化')
    assert.match(source, /mode === 'linked'/, 'sources/search 缺少 linked 模式')
    assert.match(source, /mode === 'remote'/, 'sources/search 缺少 remote 模式')
    assert.match(source, /mode === 'resolve'/, 'sources/search 缺少 resolve 模式')
    assert.match(source, /parseWorkspaceFeishuSourceUrl/, 'sources/search 未复用飞书链接解析')
    assert.match(source, /getWorkspaceFeishuMarketplaceTenantAccessToken/, '远端搜索必须使用 workspace marketplace tenant token')
    assert.doesNotMatch(source, /getFeishuTenantAccessToken/, 'workspace sources/search 不应回退 admin internal token')
    assert.match(source, /markFeishuWorkspaceConnectionTokenHealth/, 'token 异常必须回写 connection 诊断')
    assert.match(source, /listFeishuBitableApps/, 'remote 模式缺少多维表 app 搜索')
    assert.match(source, /listFeishuBitableTables/, '缺 tableId 时必须列出多维表表格')
    assert.match(source, /invalid_feishu_url/, '非法链接必须返回明确诊断')
  })

  it('moves Feishu import to project resource manager and keeps settings as management entry', async () => {
    const [resourceManagerSource, settingsSource] = await Promise.all([
      readFile(RESOURCE_MANAGER_FILE, 'utf8'),
      readFile(USER_SETTINGS_THIRD_PARTY_FILE, 'utf8'),
    ])

    assert.match(resourceManagerSource, /workspace-feishu-import-dialog/, '资源管理器缺少飞书导入弹窗')
    assert.match(resourceManagerSource, /从飞书导入/, '资源管理器缺少飞书导入入口文案')
    assert.match(resourceManagerSource, /mode: 'resolve'/, '导入弹窗缺少链接解析调用')
    assert.match(resourceManagerSource, /mode: 'remote'/, '导入弹窗缺少远端搜索调用')
    assert.match(resourceManagerSource, /integrations\/feishu\/imports/, '导入弹窗缺少导入 API 调用')
    assert.match(resourceManagerSource, /props\.activeProjectId/, '导入弹窗必须绑定当前项目，不应要求用户手填 projectId')
    assert.match(resourceManagerSource, /reloadProjectResources/, '导入完成后必须刷新项目资源列表')
    assert.match(resourceManagerSource, /feishuImportTokenHealth\.value === 'ok'/, 'token 异常时必须禁用导入')

    assert.doesNotMatch(settingsSource, /importProjectIdDraft/, '设置弹窗不应继续保留手填 projectId 导入表单')
    assert.doesNotMatch(settingsSource, /importFeishuSource/, '设置弹窗不应继续直接执行导入')
    assert.match(settingsSource, /去项目资源管理器导入/, '设置弹窗应降级为项目导入入口')
  })
})
