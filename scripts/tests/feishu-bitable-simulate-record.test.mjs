import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

async function readSource(relativePath) {
  return readFile(resolve(process.cwd(), relativePath), 'utf8')
}

describe('飞书单行模拟执行诊断', () => {
  it('共享类型与只读模拟接口已补齐', async () => {
    const [typeSource, apiSource] = await Promise.all([
      readSource('shared/types/domain-legacy.ts'),
      readSource('server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/simulate-record.post.ts'),
    ])

    assert.match(typeSource, /export type FeishuBitableRecordLocatorType = 'auto' \| 'externalId' \| 'recordId' \| 'rowNumber'/, '共享类型未声明单行定位方式')
    assert.match(typeSource, /export interface FeishuBitableSimulateRecordRequest extends FeishuBitableSyncItemPreviewRequest/, '共享类型未声明模拟请求结构')
    assert.match(typeSource, /export interface FeishuBitableSimulateRecordResult \{[\s\S]*sourceFields:[\s\S]*autoSync:[\s\S]*mappedFields:[\s\S]*business:[\s\S]*writebackPreview:/, '共享类型未声明完整模拟返回结构')
    assert.match(apiSource, /simulateFeishuBitableSyncItemRecord/, '模拟接口未接入服务层')
    assert.match(apiSource, /contest\.write/, '模拟接口未沿用同步项配置权限')
    assert.match(apiSource, /locatorValue/, '模拟接口未校验定位值')
  })

  it('服务层按当前草稿定位单行并只做 dry-run', async () => {
    const serviceSource = await readSource('server/services/feishu/bitable-sync.ts')
    const simulateBlockMatch = serviceSource.match(/async function simulateFeishuBitableSyncItemRecordById\([\s\S]*?\n\}\n\nexport async function simulateFeishuBitableSyncItemRecord/)

    assert.ok(simulateBlockMatch, '服务层缺少单行模拟实现')
    const simulateBlock = simulateBlockMatch[0]
    assert.match(serviceSource, /async function locateSimulateRecord/, '服务层未实现 recordId、externalId、rowNumber 定位')
    assert.match(serviceSource, /requestedType: FeishuBitableRecordLocatorType/, '定位结果未保留请求定位方式')
    assert.match(serviceSource, /buildSimulateAutoSyncResult/, '服务层未输出自动同步规则诊断')
    assert.match(serviceSource, /buildSimulateMappedFields/, '服务层未输出字段映射诊断')
    assert.match(simulateBlock, /listFeishuBitableRecords/, '模拟执行未按当前视图读取飞书源行')
    assert.match(simulateBlock, /dryRun:\s*true/, '模拟执行业务链路必须 dry-run')
    assert.match(simulateBlock, /buildSimulateWritebackPreview/, '模拟执行未输出回填预览')
    assert.doesNotMatch(simulateBlock, /createFeishuBitableSyncItemRun|batchUpdateFeishuBitableRecords|upsertFeishuExternalRef/, '模拟执行不应创建 run、回写飞书或写 external refs')
  })

  it('管理后台 Drawer 提供单行模拟入口并携带当前草稿配置', async () => {
    const componentSource = await readSource('app/components/admin/AdminFeishuBitableSyncEditor.vue')

    assert.match(componentSource, /单行模拟/, '子表同步项 Drawer 缺少单行模拟入口')
    assert.match(componentSource, /simulateForm\.locatorType/, '单行模拟缺少定位方式选择')
    assert.match(componentSource, /simulateForm\.locatorValue/, '单行模拟缺少定位值输入')
    assert.match(componentSource, /const draft: FeishuBitableSimulateRecordRequest = \{[\s\S]*\.\.\.buildCurrentItemDraft\(\)[\s\S]*locatorType:[\s\S]*locatorValue:/, '模拟请求未携带当前 Drawer 草稿配置')
    assert.match(componentSource, /simulate-record/, '单行模拟未调用模拟接口')
    assert.match(componentSource, /规则命中[\s\S]*字段映射[\s\S]*业务结果[\s\S]*回填预览/, '单行模拟结果未按规则、映射、业务、回填分块展示')
    assert.match(componentSource, /人设槽位/, '人设库单行模拟未高亮 persona1~5 槽位')
  })
})
