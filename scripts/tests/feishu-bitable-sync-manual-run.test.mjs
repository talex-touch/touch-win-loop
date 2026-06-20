import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RUNNER_FILE = resolve(process.cwd(), 'server/services/feishu/bitable-sync-runner.ts')
const RUN_API_FILE = resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/run.post.ts')
const SCHEDULER_FILE = resolve(process.cwd(), 'server/plugins/feishu-bitable-scheduler-worker.ts')
const EDITOR_FILE = resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue')

it('主同步信息支持手动顺序执行当前启用子表同步项', async () => {
  await Promise.all([
    access(RUNNER_FILE),
    access(RUN_API_FILE),
  ])

  const [runnerSource, apiSource, schedulerSource, editorSource] = await Promise.all([
    readFile(RUNNER_FILE, 'utf8'),
    readFile(RUN_API_FILE, 'utf8'),
    readFile(SCHEDULER_FILE, 'utf8'),
    readFile(EDITOR_FILE, 'utf8'),
  ])

  assert.match(runnerSource, /export async function runFeishuBitableSync\(/, '缺少主同步级别手动执行服务')
  assert.match(runnerSource, /getFeishuBitableSyncById\(db, syncId, \{ includeArchived: true \}\)/, '执行服务未先读取主同步信息')
  assert.match(runnerSource, /listFeishuBitableSyncItems\(db, \{ syncId \}\)/, '执行服务未按主同步拉取启用子项')
  assert.match(runnerSource, /FEISHU_BITABLE_SYNC_DISABLED/, '执行服务未阻断已禁用主同步')
  assert.match(runnerSource, /FEISHU_BITABLE_SYNC_NO_ACTIVE_ITEMS/, '执行服务未阻断无启用子项的主同步')
  assert.match(runnerSource, /input\.triggerSource === 'manual'[\s\S]*assertManualRunReady\(items\)/, '手动执行未复用子项关联预检')
  assert.match(runnerSource, /const triggerSource = input\.triggerSource === 'event' \? 'webhook' : input\.triggerSource[\s\S]*runWorkflow\(\{[\s\S]*providerName: 'feishu_bitable'[\s\S]*syncItemId: item\.id[\s\S]*triggerSource,/, '执行服务未复用现有 Feishu workflow')
  assert.match(runnerSource, /summarizeRun\(syncId, input\.triggerSource, itemSummaries\)/, '执行服务未返回聚合执行摘要')

  assert.match(apiSource, /runFeishuBitableSync\(event,\s*\{[\s\S]*triggerSource: 'manual'/, '主同步 run API 未触发手动执行')
  assert.match(apiSource, /FeishuBitableSyncRunError/, '主同步 run API 未处理可预期业务错误')
  assert.match(apiSource, /contest\.write/, '主同步 run API 未校验写权限')

  assert.match(schedulerSource, /runFeishuBitableSync\(undefined,\s*\{[\s\S]*triggerSource: 'scheduled'/, '定时调度未复用主同步执行服务')

  assert.match(editorSource, /const runningSync = ref\(false\)/, '编辑器未声明主同步执行 pending 状态')
  assert.match(editorSource, /const syncManualRunDisabled = computed\(/, '编辑器未声明主同步手动执行禁用条件')
  assert.match(editorSource, /async function runCurrentSync\(\)/, '编辑器未提供主同步手动执行方法')
  assert.match(editorSource, /bitable-syncs\/\$\{encodeURIComponent\(normalizedSyncId\.value\)\}\/run/, '编辑器未请求主同步 run API')
  assert.match(editorSource, /手动执行同步/, '主同步调度区未展示手动执行入口')
  assert.match(editorSource, /:loading="runningSync"[\s\S]*:disabled="syncManualRunDisabled"[\s\S]*@click="runCurrentSync"/, '手动执行入口未绑定 pending、禁用与点击动作')
})
