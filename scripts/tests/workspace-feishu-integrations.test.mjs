import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  buildWorkspaceFeishuImportedMarkdown,
  buildWorkspaceFeishuSourceHash,
  normalizeWorkspaceFeishuImportSources,
  normalizeWorkspaceFeishuSyncPolicyPatch,
} from '../../shared/utils/workspace-feishu-integration.ts'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/workspace-integration-store.ts')
const RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'internal/shared-types/domain-legacy.ts')
const USER_SETTINGS_DIALOG_FILE = resolve(process.cwd(), 'app/components/UserSettingsDialog.vue')
const THIRD_PARTY_PANEL_FILE = resolve(process.cwd(), 'app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue')
const RESOURCE_MANAGER_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const FEISHU_CLIENT_FILE = resolve(process.cwd(), 'server/services/feishu/client.ts')
const FEISHU_EVENTS_FILE = resolve(process.cwd(), 'server/api/integrations/feishu/events.post.ts')
const FEISHU_IMPORT_PROVIDER_FILE = resolve(process.cwd(), 'server/services/feishu/workspace-import.ts')
const IMPORTS_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/integrations/feishu/imports/index.post.ts')

const TEAM_INTEGRATION_API_FILES = [
  'server/api/teams/[id]/integrations/index.get.ts',
  'server/api/teams/[id]/integrations/feishu/index.get.ts',
  'server/api/teams/[id]/integrations/feishu/index.patch.ts',
  'server/api/teams/[id]/integrations/feishu/index.delete.ts',
  'server/api/teams/[id]/integrations/feishu/directory/search.get.ts',
  'server/api/teams/[id]/integrations/feishu/member-sync/preview.post.ts',
  'server/api/teams/[id]/integrations/feishu/member-sync/run.post.ts',
  'server/api/teams/[id]/integrations/feishu/sources/search.get.ts',
  'server/api/teams/[id]/integrations/feishu/imports/index.post.ts',
  'server/api/teams/[id]/integrations/feishu/imports/[jobId].get.ts',
]

describe('workspace Feishu integration contracts', () => {
  it('schema exposes workspace-level integration tables and external resources', async () => {
    const source = await readFile(SCHEMA_FILE, 'utf8')

    for (const tableName of [
      'workspace_integration_connections',
      'workspace_integration_sync_policies',
      'workspace_external_resource_refs',
      'workspace_integration_import_jobs',
      'integration_event_dedup',
    ]) {
      assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`), `缺少 ${tableName} 表`)
    }

    assert.match(source, /UNIQUE\(workspace_id, provider\)/, '工作空间连接缺少 provider 唯一约束')
    assert.match(source, /UNIQUE\(connection_id, external_type, external_token, project_id\)/, '外部资源引用缺少幂等约束')
    assert.match(source, /UNIQUE\(provider, event_id\)/, '事件去重缺少 provider + event_id 唯一约束')
    assert.match(source, /source IN \('upload', 'library', 'collab', 'external'\)/, 'project_resources.source 未允许 external')

    const externalRefsIndex = source.indexOf('CREATE TABLE IF NOT EXISTS workspace_external_resource_refs')
    const eventDedupIndex = source.indexOf('CREATE TABLE IF NOT EXISTS integration_event_dedup')
    const projectResourcesIndex = source.indexOf('CREATE TABLE IF NOT EXISTS project_resources')
    assert.ok(externalRefsIndex >= 0 && eventDedupIndex > externalRefsIndex, '无法定位外部资源引用表定义')
    assert.ok(projectResourcesIndex > externalRefsIndex, '测试前提失效：project_resources 不再晚于外部资源引用表')

    const externalRefsCreateBlock = source.slice(externalRefsIndex, eventDedupIndex)
    assert.doesNotMatch(
      externalRefsCreateBlock,
      /resource_id TEXT REFERENCES project_resources\(id\)/,
      'fresh DB bootstrap 不应在 project_resources 创建前声明外键',
    )
    assert.match(
      source,
      /FOREIGN KEY \(resource_id\) REFERENCES project_resources\(id\) ON DELETE SET NULL/,
      '外部资源引用仍需在 project_resources 创建后补回外键',
    )
  })

  it('types and store provide workspace Feishu integration surface', async () => {
    const [typeSource, storeSource, resourceStoreSource] = await Promise.all([
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(STORE_FILE, 'utf8'),
      readFile(RESOURCE_STORE_FILE, 'utf8'),
    ])

    for (const symbolName of [
      'WorkspaceIntegrationConnection',
      'WorkspaceIntegrationSyncPolicy',
      'WorkspaceFeishuIntegrationSnapshot',
      'WorkspaceFeishuMemberSyncPreview',
      'WorkspaceFeishuImportJob',
      'WorkspaceFeishuImportSource',
    ]) {
      assert.match(typeSource, new RegExp(`export interface ${symbolName}`), `缺少类型 ${symbolName}`)
    }

    for (const functionName of [
      'getWorkspaceIntegrationList',
      'getFeishuWorkspaceIntegrationSnapshot',
      'upsertFeishuWorkspaceConnection',
      'patchFeishuWorkspaceSyncPolicy',
      'disableFeishuWorkspaceConnection',
      'registerIntegrationEventDedup',
      'previewFeishuWorkspaceMemberSync',
      'runFeishuWorkspaceMemberSync',
      'createWorkspaceFeishuImportJob',
      'finishWorkspaceFeishuImportJob',
      'recordWorkspaceFeishuImportResource',
    ]) {
      assert.match(storeSource, new RegExp(`export async function ${functionName}\\b`), `缺少 store 函数 ${functionName}`)
    }

    assert.match(resourceStoreSource, /export async function createProjectExternalMarkdownResource\b/, '资源 store 缺少外部 Markdown 资源创建函数')
    assert.match(resourceStoreSource, /export async function createProjectExternalBinaryResource\b/, '资源 store 缺少外部 binary 资源创建函数')
    assert.match(resourceStoreSource, /'external', 'binary'/, '外部 binary 资源必须以 source=external 落库')
    assert.match(resourceStoreSource, /scheduleProjectKnowledgeSourceUpsert/, '外部导入资源未复用知识索引调度')
  })

  it('feishu import provider resolves real docs, files, and bitables into external resources', async () => {
    const [providerSource, importsApiSource, clientSource] = await Promise.all([
      readFile(FEISHU_IMPORT_PROVIDER_FILE, 'utf8'),
      readFile(IMPORTS_API_FILE, 'utf8'),
      readFile(FEISHU_CLIENT_FILE, 'utf8'),
    ])

    assert.match(clientSource, /getFeishuDocxRawContent/, 'Feishu client 缺少 docx raw_content 读取')
    assert.match(providerSource, /export async function resolveWorkspaceFeishuImportSource\b/, '缺少工作空间飞书导入 provider')
    assert.match(providerSource, /getFeishuDocxRawContent/, 'provider 未读取飞书文档纯文本')
    assert.match(providerSource, /getFeishuWikiNodeInfo/, 'provider 未解析飞书 Wiki token')
    assert.match(providerSource, /downloadFeishuDriveMedia/, 'provider 未下载飞书云盘文件')
    assert.match(providerSource, /listFeishuBitableRecords/, 'provider 未读取飞书多维表记录')
    assert.match(importsApiSource, /resolveWorkspaceFeishuImportSource/, '导入 API 未调用 Feishu provider')
    assert.match(importsApiSource, /createProjectExternalBinaryResource/, '导入 API 未创建 external binary 资源')
    assert.match(importsApiSource, /createProjectPreviewDocumentWithTask/, 'external binary 未复用预览任务')
    assert.match(importsApiSource, /getDocumentStorage/, 'external binary 未写入现有 document storage')
  })

  it('team APIs, Feishu token helpers, and event routing are present', async () => {
    const sources = await Promise.all([
      ...TEAM_INTEGRATION_API_FILES.map(file => readFile(resolve(process.cwd(), file), 'utf8')),
      readFile(FEISHU_CLIENT_FILE, 'utf8'),
      readFile(FEISHU_EVENTS_FILE, 'utf8'),
    ])

    const combined = sources.join('\n')
    assert.match(combined, /getFeishuMarketplaceAppAccessToken/, '缺少商店应用 app_access_token helper')
    assert.match(combined, /getFeishuMarketplaceTenantAccessToken/, '缺少商店应用 tenant_access_token helper')
    assert.match(combined, /tenant_key|tenantKey/, '事件入口未暴露 tenant_key 路由语义')
    assert.match(combined, /registerIntegrationEventDedup/, '事件入口未接入第三方事件去重')
    assert.match(combined, /teamHasWorkspaceRoles/, '工作空间级配置接口未限制 owner/admin')
    assert.match(combined, /teamCanManageProject/, '导入接口未限制项目管理权限')
  })

  it('workspace settings and resource manager expose Feishu platform entry points', async () => {
    const [dialogSource, panelSource, resourceManagerSource] = await Promise.all([
      readFile(USER_SETTINGS_DIALOG_FILE, 'utf8'),
      readFile(THIRD_PARTY_PANEL_FILE, 'utf8'),
      readFile(RESOURCE_MANAGER_FILE, 'utf8'),
    ])

    assert.match(dialogSource, /thirdPartyPlatforms/, '用户设置缺少连接器 tab id')
    assert.match(dialogSource, /label:\s*'连接器'/, '用户设置未把 workspace 飞书入口命名为连接器')
    assert.match(dialogSource, /<UserSettingsThirdPartyPlatformsPanel\b/, '用户设置未渲染连接器面板')
    assert.match(panelSource, /飞书连接器/, '连接器面板缺少飞书配置入口')
    assert.match(panelSource, /member-sync\/preview/, '连接器面板缺少成员同步预览调用')
    assert.match(panelSource, /去项目资源管理器导入/, '连接器面板缺少项目导入入口')
    assert.doesNotMatch(panelSource, /autoLoginEnabled/, '连接器面板不应提交自动登录策略')
    assert.match(resourceManagerSource, /从飞书导入/, '项目资源管理器缺少从飞书导入入口')
    assert.match(resourceManagerSource, /openFeishuImportFromMenu/, '项目资源管理器缺少飞书导入菜单动作')
    assert.match(resourceManagerSource, /integrations\/feishu\/imports/, '项目资源管理器缺少导入任务调用')
  })
})

describe('workspace Feishu integration pure helpers', () => {
  it('normalizes sync policy patches conservatively', () => {
    const patch = normalizeWorkspaceFeishuSyncPolicyPatch({
      autoLoginEnabled: true,
      defaultWorkspaceRole: 'owner',
      departmentIds: [' dep-1 ', '', 'dep-1'],
      userIds: ['ou_1', 'ou_1', ''],
      groupIds: [' group-a '],
      roleMappings: { ou_1: 'admin', ou_2: 'owner', ou_3: 'manager' },
    })

    assert.equal(patch.defaultWorkspaceRole, 'member')
    assert.equal(patch.autoLoginEnabled, false)
    assert.deepEqual(patch.departmentIds, ['dep-1'])
    assert.deepEqual(patch.userIds, ['ou_1'])
    assert.deepEqual(patch.groupIds, ['group-a'])
    assert.deepEqual(patch.roleMappings, { ou_1: 'admin', ou_3: 'manager' })
  })

  it('normalizes import sources and produces stable source hashes', () => {
    const [source] = normalizeWorkspaceFeishuImportSources([
      {
        type: 'feishu_doc',
        token: ' doc-token ',
        title: ' 方案 ',
        content: '正文',
        originalUrl: ' https://example.test/doc ',
      },
    ])

    assert.equal(source.type, 'feishu_doc')
    assert.equal(source.token, 'doc-token')
    assert.equal(source.title, '方案')
    assert.equal(source.originalUrl, 'https://example.test/doc')

    const firstHash = buildWorkspaceFeishuSourceHash(source)
    const secondHash = buildWorkspaceFeishuSourceHash({ ...source, title: '方案副本' })
    assert.equal(firstHash, secondHash, 'source hash 应基于外部身份和内容版本，而不是本地标题')
  })

  it('builds markdown resources with external provenance', () => {
    const markdown = buildWorkspaceFeishuImportedMarkdown({
      type: 'feishu_bitable',
      token: 'tbl-1',
      title: '需求表',
      content: '| 名称 | 状态 |',
      originalUrl: 'https://example.test/base',
      updatedAt: '2026-04-30T12:00:00.000Z',
    })

    assert.match(markdown, /^# 需求表/m)
    assert.match(markdown, /来源：飞书多维表/)
    assert.match(markdown, /https:\/\/example\.test\/base/)
    assert.match(markdown, /\| 名称 \| 状态 \|/)
  })
})
