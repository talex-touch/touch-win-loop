import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

it('主同步信息会持久化 enabled 字段并支持补丁更新', async () => {
  const dbSource = await readFile(resolve(process.cwd(), 'server/utils/db.ts'), 'utf8')
  const storeSource = await readFile(resolve(process.cwd(), 'server/utils/feishu-integration-store.ts'), 'utf8')
  const typeSource = await readFile(resolve(process.cwd(), 'shared/types/domain.ts'), 'utf8')
  const apiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id].patch.ts'), 'utf8')

  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS feishu_bitable_syncs[\s\S]*is_enabled BOOLEAN NOT NULL DEFAULT TRUE/, '主同步信息表未持久化 is_enabled 字段')
  assert.match(dbSource, /ALTER TABLE feishu_bitable_syncs[\s\S]*ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE/, '主同步信息表缺少 is_enabled 兼容迁移')
  assert.match(typeSource, /export type FeishuBitableSyncEnvironment = 'test' \| 'production'/, '领域类型未声明同步环境枚举')
  assert.match(typeSource, /export interface FeishuBitableSourceConfig \{[\s\S]*environment\?: FeishuBitableSyncEnvironment/, '来源配置未暴露环境标签字段')
  assert.match(typeSource, /export interface FeishuBitableSync \{[\s\S]*enabled: boolean/, '领域类型未暴露主同步启用状态')
  assert.match(storeSource, /enabled:\s*Boolean\(row\.is_enabled\)/, '存储层未返回主同步启用状态')
  assert.match(storeSource, /environment:\s*toSyncEnvironment\(source\.environment\)/, '存储层未规范化环境标签')
  assert.match(storeSource, /patch:\s*\{[\s\S]*enabled\?: boolean/, '主同步补丁类型未声明 enabled')
  assert.match(storeSource, /addSet\('is_enabled', Boolean\(input\.patch\.enabled\)\)/, '主同步补丁未写入 is_enabled')
  assert.match(apiSource, /interface PatchSyncBody \{[\s\S]*enabled\?: boolean/, '同步信息 PATCH 接口未接收 enabled')
  assert.match(apiSource, /enabled:\s*body\.enabled/, '同步信息 PATCH 接口未透传 enabled')
})

it('调度、事件和手动执行都会尊重主同步信息的 enabled 状态', async () => {
  const storeSource = await readFile(resolve(process.cwd(), 'server/utils/feishu-integration-store.ts'), 'utf8')
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')
  const runApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/run.post.ts'), 'utf8')

  assert.match(storeSource, /listFeishuBitableSyncItems[\s\S]*COALESCE\(s\.is_enabled, TRUE\) = TRUE/, '同步项活动列表未过滤已禁用的主同步信息')
  assert.match(storeSource, /claimNextDueFeishuBitableSyncItem[\s\S]*COALESCE\(s\.is_enabled, TRUE\) = TRUE/, '调度领取逻辑未过滤已禁用的主同步信息')
  assert.match(storeSource, /listActiveFeishuBitableSyncItemsBySource[\s\S]*COALESCE\(s\.is_enabled, TRUE\) = TRUE/, '事件同步入口未过滤已禁用的主同步信息')
  assert.match(serviceSource, /const sync = task\?\.syncId \? await getFeishuBitableSyncById\(db, task\.syncId\) : null/, '执行服务层未补查主同步信息')
  assert.match(serviceSource, /configAndTask\.sync && !configAndTask\.sync\.enabled[\s\S]*FEISHU_BITABLE_SYNC_DISABLED/, '执行服务层未阻断已禁用主同步信息')
  assert.match(runApiSource, /FEISHU_BITABLE_SYNC_DISABLED/, '手动执行接口未处理主同步已禁用错误')
  assert.match(runApiSource, /当前主同步信息已禁用，请先启用后再执行子表同步项/, '手动执行接口缺少主同步禁用提示')
})

it('编辑器会提供主同步启停和子表快捷启停入口', async () => {
  const editorSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')
  const overviewSource = await readFile(resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue'), 'utf8')

  assert.match(editorSource, /const syncForm = reactive\(\{[\s\S]*enabled: true/, '同步信息表单未接入 enabled 字段')
  assert.match(editorSource, /syncForm\.enabled = Boolean\(response\.data\.enabled\)/, '同步详情加载后未回填 enabled')
  assert.match(editorSource, /body:\s*\{[\s\S]*enabled:\s*syncForm\.enabled/, '保存同步信息时未提交 enabled')
  assert.match(editorSource, /environment:\s*syncForm\.environment === 'production' \|\| syncForm\.environment === 'test'/, '保存同步信息时未提交环境标签')
  assert.match(editorSource, /启用主同步/, '编辑器未展示主同步启用开关')
  assert.match(editorSource, /运行环境/, '编辑器未展示运行环境选择')
  assert.match(editorSource, /主同步状态/, '编辑器未展示主同步状态摘要')
  assert.match(editorSource, /syncExecutionDisabled/, '编辑器未根据主同步状态禁用执行入口')
  assert.match(editorSource, /async function toggleItemEnabled\(item: FeishuBitableSyncItem, enabled: boolean\)/, '编辑器未提供子表快捷启停方法')
  assert.match(editorSource, /@change="\(value\) => toggleItemEnabled\(item, Boolean\(value\)\)"/, '编辑器未绑定子表快捷启停开关')
  assert.match(editorSource, /主同步已禁用/, '编辑器未提示子表受主同步开关影响')
  assert.match(overviewSource, /!record\.enabled && !record\.archivedAt/, '同步信息总览未展示主同步禁用态')
  assert.match(overviewSource, /record\.enabled \? `已启用 \$\{record\.enabledItemCount\}` : '主同步已禁用'/, '同步信息总览未提示主同步禁用会覆盖子项执行')
  assert.match(overviewSource, /async function toggleSyncEnabled\(sync: FeishuBitableSync, enabled: boolean\)/, '同步信息总览未提供一键启停动作')
  assert.match(overviewSource, /@click="toggleSyncEnabled\(record, !record\.enabled\)"/, '同步信息总览未绑定一键启停按钮')
  assert.match(overviewSource, /syncEnvironmentLabel\(record\.source\?\.environment\)/, '同步信息总览未展示环境标签')
  assert.match(overviewSource, /buildSuggestedCreateSyncName\(\)/, '新建同步信息未生成环境感知的推荐名称')
  assert.match(overviewSource, /v-model="createSyncForm\.environment"/, '新建同步信息未提供环境标签选择')
})
