import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

it('同步信息归档会写入归档字段并停用全部子表同步项', async () => {
  const dbSource = await readFile(resolve(process.cwd(), 'server/utils/db.ts'), 'utf8')
  const storeSource = await readFile(resolve(process.cwd(), 'server/utils/feishu-integration-store.ts'), 'utf8')

  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS feishu_bitable_syncs[\s\S]*archived_by_user_id TEXT[\s\S]*archived_at TIMESTAMPTZ/, '同步信息表未持久化归档字段')
  assert.match(storeSource, /export async function archiveFeishuBitableSync/, '存储层缺少同步信息归档函数')
  assert.match(storeSource, /UPDATE feishu_bitable_syncs[\s\S]*archived_at = NOW\(\)/, '归档逻辑未写入 archived_at')
  assert.match(storeSource, /UPDATE feishu_bitable_sync_items[\s\S]*is_enabled = FALSE,[\s\S]*schedule_enabled = FALSE/, '归档逻辑未同时停用子表同步项与调度')
  assert.match(storeSource, /export async function restoreFeishuBitableSync/, '存储层缺少同步信息恢复函数')
  assert.match(storeSource, /UPDATE feishu_bitable_syncs[\s\S]*archived_by_user_id = NULL,[\s\S]*archived_at = NULL/, '恢复逻辑未清理归档字段')
})

it('活动同步项查询会排除已归档同步信息', async () => {
  const storeSource = await readFile(resolve(process.cwd(), 'server/utils/feishu-integration-store.ts'), 'utf8')

  assert.match(storeSource, /listFeishuBitableSyncs[\s\S]*archived_at IS NULL/, '同步信息列表未默认过滤已归档数据')
  assert.match(storeSource, /getFeishuBitableSyncItemById[\s\S]*s\.archived_at IS NULL/, '同步项详情未过滤已归档同步信息')
  assert.match(storeSource, /claimNextDueFeishuBitableSyncItem[\s\S]*s\.archived_at IS NULL/, '定时调度领取逻辑未排除已归档同步信息')
  assert.match(storeSource, /listActiveFeishuBitableSyncItemsBySource[\s\S]*s\.archived_at IS NULL/, '事件同步入口未排除已归档同步信息')
})

it('管理页会提供同步信息归档按钮并调用归档接口', async () => {
  const pageSource = await readFile(resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue'), 'utf8')
  const apiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/archive.post.ts'), 'utf8')
  const restoreApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/restore.post.ts'), 'utf8')

  assert.match(pageSource, /async function archiveSync\(sync: FeishuBitableSync\)/, '管理页缺少同步信息归档动作')
  assert.match(pageSource, /async function restoreSync\(sync: FeishuBitableSync\)/, '管理页缺少同步信息恢复动作')
  assert.match(pageSource, /bitable-syncs\/\$\{encodeURIComponent\(syncId\)\}\/archive/, '管理页未调用同步信息归档接口')
  assert.match(pageSource, /bitable-syncs\/\$\{encodeURIComponent\(syncId\)\}\/restore/, '管理页未调用同步信息恢复接口')
  assert.match(pageSource, /a-popconfirm[\s\S]*归档/, '管理页未展示归档确认按钮')
  assert.match(pageSource, /恢复归档/, '管理页未展示恢复归档按钮')
  assert.match(apiSource, /archiveFeishuBitableSync/, '归档接口未接入存储层归档逻辑')
  assert.match(restoreApiSource, /restoreFeishuBitableSync/, '恢复接口未接入存储层恢复逻辑')
})

it('管理页支持显示已归档同步信息，并把归档记录以只读方式打开', async () => {
  const pageSource = await readFile(resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue'), 'utf8')
  const editorSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')
  const listApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/index.get.ts'), 'utf8')
  const detailApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id].get.ts'), 'utf8')
  const itemApiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId].get.ts'), 'utf8')

  assert.match(pageSource, /showArchivedSyncs = ref\(false\)/, '管理页缺少“显示已归档”筛选开关')
  assert.match(pageSource, /includeArchived=true/, '管理页未把显示已归档状态传给同步信息列表接口')
  assert.match(pageSource, /查看同步信息/, '管理页未为已归档同步信息提供查看入口')
  assert.match(pageSource, /:include-archived="editingSyncIncludeArchived"/, '管理页未把归档态传给同步信息编辑器')

  assert.match(editorSource, /includeArchived\?: boolean/, '同步信息编辑器未声明 includeArchived 属性')
  assert.match(editorSource, /const archivedReadonly = computed/, '同步信息编辑器未进入归档只读模式')
  assert.match(editorSource, /只允许查看，不允许/, '同步信息编辑器未阻断归档数据的修改操作')

  assert.match(listApiSource, /includeArchived = String\(getQuery\(event\)\.includeArchived/, '同步信息列表接口未读取 includeArchived 查询参数')
  assert.match(detailApiSource, /includeArchived = String\(getQuery\(event\)\.includeArchived/, '同步信息详情接口未读取 includeArchived 查询参数')
  assert.match(itemApiSource, /includeArchived = String\(getQuery\(event\)\.includeArchived/, '同步项详情接口未读取 includeArchived 查询参数')
})
