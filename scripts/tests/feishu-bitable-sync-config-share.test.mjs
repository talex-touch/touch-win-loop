import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {},
    secureConfig: {},
  }),
}))

const DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const INTERNAL_DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'internal/shared-types/domain-legacy.ts')
const API_TYPES_FILE = resolve(process.cwd(), 'shared/types/api.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const PACKAGE_FILE = resolve(process.cwd(), 'server/utils/feishu-bitable-sync-config-package.ts')
const SHARE_STORE_FILE = resolve(process.cwd(), 'server/utils/feishu-bitable-sync-config-share-store.ts')
const OVERVIEW_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue')

const API_FILES = [
  resolve(process.cwd(), 'server/api/feishu/bitable-sync-config/[shareKey].get.ts'),
  resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/config-package.get.ts'),
  resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/config-share.post.ts'),
  resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/config-share.delete.ts'),
  resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/config-import/preview.post.ts'),
  resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/config-import/import.post.ts'),
]

async function loadPackageModule() {
  return import(pathToFileURL(PACKAGE_FILE).href)
}

function createSampleSyncDetail() {
  return {
    id: 'sync_1',
    name: '竞赛主库同步',
    enabled: true,
    source: {
      appToken: 'app_token_1',
      appName: '竞赛主库',
      tableId: 'tbl_main',
      viewId: 'vew_main',
      environment: 'production',
      sourceUrl: 'https://feishu.example/base/app_token_1',
    },
    schedule: {
      enabled: true,
      mode: 'interval',
      intervalMinutes: 60,
      cronExpr: null,
      timezone: 'Asia/Shanghai',
    },
    scheduleRuntime: {
      nextRunAt: '2026-04-30T10:00:00.000Z',
      lastRunAt: '2026-04-30T09:00:00.000Z',
      lastError: '',
    },
    itemCount: 1,
    enabledItemCount: 1,
    issueStats: {
      total: 0,
      open: 0,
      resolved: 0,
      ignored: 0,
    },
    latestRunSummary: {
      runId: 'run_1',
      status: 'success',
      triggerSource: 'manual',
      startedAt: '2026-04-30T09:00:00.000Z',
      finishedAt: '2026-04-30T09:01:00.000Z',
      errorCount: 0,
      errorMessage: '',
    },
    createdByUserId: 'user_1',
    updatedByUserId: 'user_2',
    archivedByUserId: null,
    archivedAt: null,
    createdAt: '2026-04-30T08:00:00.000Z',
    updatedAt: '2026-04-30T09:00:00.000Z',
    items: [
      {
        id: 'item_1',
        syncId: 'sync_1',
        name: '竞赛库',
        entityType: 'contest',
        appToken: 'app_token_1',
        tableId: 'tbl_contest',
        viewId: 'vew_contest',
        source: {
          appToken: 'app_token_1',
          appName: '竞赛主库',
          tableId: 'tbl_contest',
          tableName: '竞赛库',
          viewId: 'vew_contest',
          viewName: '待发布',
        },
        writeback: {
          enabled: true,
          fields: {
            status: '同步状态',
            syncedAt: '同步时间',
          },
        },
        autoSync: {
          enabled: true,
          recordStatusField: '记录状态',
          syncStatusField: '同步信息',
        },
        isEnabled: true,
        mapping: {
          schemaVersion: 2,
          layers: [{ sourceField: '名称', targetKey: 'name' }],
        },
        options: {
          defaultVisibility: 'public',
        },
        lastRunAt: '2026-04-30T09:00:00.000Z',
        schedule: {
          enabled: true,
          mode: 'interval',
          intervalMinutes: 30,
          cronExpr: null,
          timezone: 'Asia/Shanghai',
        },
        scheduleRuntime: {
          nextRunAt: '2026-04-30T10:00:00.000Z',
          lastRunAt: '2026-04-30T09:00:00.000Z',
          lastError: '',
        },
        latestRunSummary: {
          runId: 'run_item_1',
          status: 'success',
          triggerSource: 'manual',
          startedAt: '2026-04-30T09:00:00.000Z',
          finishedAt: '2026-04-30T09:01:00.000Z',
          errorCount: 0,
          errorMessage: '',
        },
        createdByUserId: 'user_1',
        updatedByUserId: 'user_2',
        createdAt: '2026-04-30T08:00:00.000Z',
        updatedAt: '2026-04-30T09:00:00.000Z',
      },
    ],
  }
}

it('飞书同步配置包共享类型、schema 与 API 路由已接入', async () => {
  await Promise.all(API_FILES.map(file => access(file)))

  const [typeSource, internalTypeSource, apiTypeSource, schemaSource, shareStoreSource] = await Promise.all([
    readFile(DOMAIN_LEGACY_FILE, 'utf8'),
    readFile(INTERNAL_DOMAIN_LEGACY_FILE, 'utf8'),
    readFile(API_TYPES_FILE, 'utf8'),
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(SHARE_STORE_FILE, 'utf8'),
  ])

  for (const source of [typeSource, internalTypeSource]) {
    assert.match(source, /export interface FeishuBitableSyncConfigPackage \{[\s\S]*version: 1[\s\S]*source: FeishuBitableSourceConfig[\s\S]*scheduleDraft: FeishuTaskScheduleConfig[\s\S]*items: FeishuBitableSyncConfigPackageItem\[\]/, '共享类型未声明同步配置包')
    assert.match(source, /export interface FeishuBitableSyncConfigShare \{[\s\S]*shareKey: string[\s\S]*shareUrl: string[\s\S]*expiresAt: string[\s\S]*revokedAt: string \| null/, '共享类型未声明公网配置分享')
    assert.match(source, /export interface FeishuBitableSyncConfigImportPreview \{[\s\S]*summary: FeishuBitableSyncConfigPackageSummary[\s\S]*package: FeishuBitableSyncConfigPackage/, '共享类型未声明导入预览')
    assert.match(source, /export interface FeishuBitableSyncConfigImportResult \{[\s\S]*sync: FeishuBitableSyncDetail[\s\S]*importedItemCount: number/, '共享类型未声明导入结果')
  }

  assert.match(apiTypeSource, /FeishuBitableSyncConfigPackage/, 'API 类型出口未透出配置包')
  assert.match(apiTypeSource, /FeishuBitableSyncConfigImportPreview/, 'API 类型出口未透出导入预览')
  assert.match(apiTypeSource, /FeishuBitableSyncConfigImportResult/, 'API 类型出口未透出导入结果')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS feishu_bitable_sync_config_shares/, 'Schema 未新增同步配置分享表')
  assert.match(schemaSource, /share_key TEXT NOT NULL UNIQUE/, '分享表缺少不可猜 share_key')
  assert.match(schemaSource, /package_json JSONB NOT NULL/, '分享表缺少配置包快照')
  assert.match(schemaSource, /expires_at TIMESTAMPTZ NOT NULL/, '分享表缺少过期时间')
  assert.match(schemaSource, /revoked_at TIMESTAMPTZ/, '分享表缺少撤销时间')
  assert.match(schemaSource, /idx_feishu_bitable_sync_config_shares_active/, '分享表缺少活跃分享索引')

  assert.match(shareStoreSource, /randomBytes\(20\)\.toString\('hex'\)/, '分享 key 未使用高熵随机值')
  assert.match(shareStoreSource, /publicBaseUrl\?: string/, '分享创建未接收已解析公网基址')
  assert.match(shareStoreSource, /buildApiEndpoint\(publicBaseUrl, sharePath\)/, '分享 URL 未优先使用已解析公网基址')
  assert.match(shareStoreSource, /buildServerAppUrl\(`\/api\/feishu\/bitable-sync-config\/\$\{row\.share_key\}`/, '分享 URL 未走 public app base URL')
  assert.match(shareStoreSource, /expires_at > NOW\(\)/, '公网读取未过滤过期配置包')
  assert.match(shareStoreSource, /revoked_at IS NULL/, '公网读取未过滤已撤销配置包')
})

it('飞书同步配置包工具会脱敏运行态，并为导入生成禁用态蓝图', async () => {
  const {
    buildFeishuBitableSyncConfigPackage,
    buildFeishuBitableSyncConfigPackageSummary,
    normalizeFeishuBitableSyncConfigPackage,
    prepareFeishuBitableSyncConfigImportDraft,
  } = await loadPackageModule()

  const pkg = buildFeishuBitableSyncConfigPackage(createSampleSyncDetail(), {
    exportedAt: '2026-04-30T12:00:00.000Z',
  })
  const serialized = JSON.stringify(pkg)

  assert.equal(pkg.version, 1)
  assert.equal(pkg.kind, 'feishu_bitable_sync_config')
  assert.equal(pkg.source.appToken, 'app_token_1')
  assert.equal(pkg.scheduleDraft.enabled, true)
  assert.equal(pkg.items.length, 1)
  assert.equal(pkg.items[0].entityType, 'contest')
  assert.equal(pkg.items[0].scheduleDraft.enabled, true)
  assert.equal(Object.prototype.hasOwnProperty.call(pkg, 'sourceSyncId'), false)
  assert.doesNotMatch(serialized, /createdByUserId|updatedByUserId|latestRunSummary|scheduleRuntime|run_item_1|eventToken|appSecret/, '配置包包含运行态、审计或敏感字段')

  const normalized = normalizeFeishuBitableSyncConfigPackage(pkg)
  assert.deepEqual(normalized, pkg)
  assert.deepEqual(buildFeishuBitableSyncConfigPackageSummary(pkg), {
    name: '竞赛主库同步',
    appName: '竞赛主库',
    appToken: 'app_token_1',
    environment: 'production',
    itemCount: 1,
    entityTypes: ['contest'],
    mappingFieldCount: 1,
  })

  const draft = prepareFeishuBitableSyncConfigImportDraft(pkg)
  assert.equal(draft.name, '导入 - 竞赛主库同步')
  assert.equal(draft.enabled, false)
  assert.equal(draft.schedule.enabled, false)
  assert.equal(draft.items[0].isEnabled, false)
  assert.equal(draft.items[0].schedule.enabled, false)
})

it('飞书同步配置包校验会拒绝非法版本、缺失 appToken、非法实体类型和非对象映射', async () => {
  const { normalizeFeishuBitableSyncConfigPackage } = await loadPackageModule()
  const validPackage = {
    version: 1,
    kind: 'feishu_bitable_sync_config',
    exportedAt: '2026-04-30T12:00:00.000Z',
    name: '竞赛主库同步',
    source: {
      appToken: 'app_token_1',
    },
    scheduleDraft: {
      enabled: false,
      mode: 'interval',
      intervalMinutes: 60,
      cronExpr: null,
      timezone: 'Asia/Shanghai',
    },
    items: [
      {
        name: '竞赛库',
        entityType: 'contest',
        tableId: 'tbl_contest',
        viewId: '',
        source: {
          appToken: 'app_token_1',
          tableId: 'tbl_contest',
        },
        writeback: {},
        autoSync: {},
        mapping: {},
        options: {},
        scheduleDraft: {
          enabled: false,
          mode: 'interval',
          intervalMinutes: 60,
          cronExpr: null,
          timezone: 'Asia/Shanghai',
        },
      },
    ],
  }

  assert.throws(() => normalizeFeishuBitableSyncConfigPackage({ ...validPackage, version: 2 }), /version/)
  assert.throws(() => normalizeFeishuBitableSyncConfigPackage({ ...validPackage, source: {} }), /appToken/)
  assert.throws(() => normalizeFeishuBitableSyncConfigPackage({
    ...validPackage,
    items: [{ ...validPackage.items[0], entityType: 'unknown' }],
  }), /entityType/)
  assert.throws(() => normalizeFeishuBitableSyncConfigPackage({
    ...validPackage,
    items: [{ ...validPackage.items[0], mapping: [] }],
  }), /mapping/)
})

it('飞书同步配置包管理 API 会按权限创建、撤销、预览和导入配置包', async () => {
  const [publicApiSource, exportApiSource, createShareApiSource, revokeShareApiSource, previewApiSource, importApiSource, packageSource] = await Promise.all([
    readFile(API_FILES[0], 'utf8'),
    readFile(API_FILES[1], 'utf8'),
    readFile(API_FILES[2], 'utf8'),
    readFile(API_FILES[3], 'utf8'),
    readFile(API_FILES[4], 'utf8'),
    readFile(API_FILES[5], 'utf8'),
    readFile(PACKAGE_FILE, 'utf8'),
  ])

  assert.doesNotMatch(publicApiSource, /requireAuth\(/, '公网配置包读取接口不应要求登录')
  assert.match(publicApiSource, /getActiveFeishuBitableSyncConfigShareByKey/, '公网配置包读取接口未读取活跃分享')
  assert.match(exportApiSource, /contest\.write/, '配置包导出接口未校验写权限')
  assert.match(exportApiSource, /buildFeishuBitableSyncConfigPackage/, '配置包导出接口未使用脱敏构建器')
  assert.match(createShareApiSource, /contest\.write/, '创建配置分享接口未校验写权限')
  assert.match(createShareApiSource, /runtime\.onlyOffice\.sourceBaseURL/, '创建配置分享接口未复用运行态公网基址')
  assert.match(createShareApiSource, /readBody<CreateConfigShareBody>\(event\)[\s\S]*\?\? \{\}/, '创建配置分享接口未兜底空请求体')
  assert.match(createShareApiSource, /publicBaseUrl,/, '创建配置分享接口未把运行态公网基址传给分享存储')
  assert.match(createShareApiSource, /createFeishuBitableSyncConfigShare/, '创建配置分享接口未接入分享存储')
  assert.match(revokeShareApiSource, /contest\.write/, '撤销配置分享接口未校验写权限')
  assert.match(revokeShareApiSource, /revokeFeishuBitableSyncConfigShare/, '撤销配置分享接口未接入分享存储')
  assert.match(previewApiSource, /fetchFeishuBitableSyncConfigPackageFromUrl/, '导入预览接口未从 URL 拉取配置包')
  assert.match(previewApiSource, /buildFeishuBitableSyncConfigPackageSummary/, '导入预览接口未返回配置摘要')
  assert.match(importApiSource, /contest\.write/, '配置导入接口未校验写权限')
  assert.match(importApiSource, /importFeishuBitableSyncConfigPackage/, '配置导入接口未调用导入适配层')
  assert.match(packageSource, /createFeishuBitableSync\(/, '导入适配层未复用主同步创建函数')
  assert.match(packageSource, /patchFeishuBitableSync\([\s\S]*enabled: false/, '导入适配层未强制禁用主同步')
  assert.match(packageSource, /createFeishuBitableSyncItem\([\s\S]*isEnabled: false/, '导入适配层未强制禁用子表同步项')
  assert.match(packageSource, /schedule: \{[\s\S]*enabled: false/, '导入适配层未强制关闭调度')
})

it('飞书同步信息总览页会提供配置导出、公网分享和 URL 导入入口', async () => {
  const source = await readFile(OVERVIEW_FILE, 'utf8')

  assert.match(source, /从配置 URL 导入/, '同步信息总览缺少配置 URL 导入入口')
  assert.match(source, /导出配置/, '同步信息行缺少导出配置入口')
  assert.match(source, /创建公网配置/, '同步信息行缺少创建公网配置入口')
  assert.match(source, /复制公网配置/, '同步信息行缺少复制公网配置入口')
  assert.match(source, /撤销公网配置/, '同步信息行缺少撤销公网配置入口')
  assert.match(source, /openSyncConfigImportDrawer/, '页面缺少导入配置抽屉动作')
  assert.match(source, /previewSyncConfigImport/, '页面缺少导入预览动作')
  assert.match(source, /confirmSyncConfigImport/, '页面缺少确认导入动作')
  assert.match(source, /downloadSyncConfigPackage/, '页面缺少导出配置动作')
  assert.match(source, /createSyncConfigShare/, '页面缺少创建公网配置动作')
  assert.match(source, /revokeSyncConfigShare/, '页面缺少撤销公网配置动作')
  assert.match(source, /copySyncConfigShareUrl/, '页面缺少复制公网配置动作')
  assert.match(source, /配置摘要/, '导入前未展示配置摘要')
  assert.match(source, /不会自动启用主同步、子表或调度/, '导入前未提示禁用态落库策略')
})
