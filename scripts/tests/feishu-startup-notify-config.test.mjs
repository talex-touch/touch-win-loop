import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const CONFIG_GET_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/config.get.ts')
const CONFIG_PATCH_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/config.patch.ts')
const STARTUP_TEST_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/startup-notify/test.post.ts')
const STARTUP_NOTIFY_SERVICE_FILE = resolve(process.cwd(), 'server/services/feishu/startup-notify.ts')
const STARTUP_NOTIFY_PLUGIN_FILE = resolve(process.cwd(), 'server/plugins/feishu-startup-notify.ts')
const FEISHU_STORE_FILE = resolve(process.cwd(), 'server/utils/feishu-integration-store.ts')
const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const FEISHU_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue')
const ADMIN_INDEX_FILE = resolve(process.cwd(), 'app/pages/admin/index.vue')

describe('feishu startup notify config', () => {
  it('启动通知构建标识不再允许集成配置 fallback', async () => {
    const [
      configGet,
      configPatch,
      startupTest,
      startupService,
      startupPlugin,
      feishuStore,
      domainTypes,
      feishuPage,
      adminIndex,
    ] = await Promise.all([
      readFile(CONFIG_GET_FILE, 'utf8'),
      readFile(CONFIG_PATCH_FILE, 'utf8'),
      readFile(STARTUP_TEST_FILE, 'utf8'),
      readFile(STARTUP_NOTIFY_SERVICE_FILE, 'utf8'),
      readFile(STARTUP_NOTIFY_PLUGIN_FILE, 'utf8'),
      readFile(FEISHU_STORE_FILE, 'utf8'),
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(FEISHU_PAGE_FILE, 'utf8'),
      readFile(ADMIN_INDEX_FILE, 'utf8'),
    ])

    for (const [label, source] of Object.entries({
      configGet,
      configPatch,
      startupTest,
      startupService,
      startupPlugin,
      feishuStore,
      domainTypes,
      feishuPage,
      adminIndex,
    })) {
      assert.doesNotMatch(source, /startupFallbackVersion|startupFallbackCommitSha|fallbackVersion|fallbackCommitSha/, `${label} 仍保留启动通知 fallback 字段`)
    }

    assert.match(configGet, /type BuildValueSource = 'env' \| 'runtime' \| 'missing'/, '配置读取接口仍允许 fallback 来源')
    assert.match(startupService, /runtimeVersion\?: string[\s\S]*runtimeCommitSha\?: string/, '启动通知构建信息应只接收运行时版本与 commit')
    assert.match(startupService, /const version = toText\(input\.runtimeVersion\)/, '启动通知版本不应再拼接 fallback')
    assert.match(startupService, /const commitSha = toText\(input\.runtimeCommitSha\)/, '启动通知 commit 不应再拼接 fallback')
    assert.doesNotMatch(feishuPage, /兜底 Version|兜底 Commit SHA|集成配置兜底值/, '飞书管理页仍暴露启动通知兜底配置')
    assert.doesNotMatch(adminIndex, /集成配置兜底/, '管理首页仍展示启动通知兜底来源')
  })
})
