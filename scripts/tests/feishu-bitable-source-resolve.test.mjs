import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const TARGET_FILE = pathToFileURL(resolve(process.cwd(), 'server/utils/feishu-bitable-source.ts')).href

async function loadModule() {
  return import(TARGET_FILE)
}

it('支持解析标准飞书多维 URL query 参数', async () => {
  const { resolveFeishuBitableSourceInput } = await loadModule()
  const result = resolveFeishuBitableSourceInput('https://example.feishu.cn/base/bascnA1B2C3D4?table=tblE5F6G7H8&view=vewI9J0K1L2')

  assert.deepEqual(result, {
    appToken: 'bascnA1B2C3D4',
    tableId: 'tblE5F6G7H8',
    viewId: 'vewI9J0K1L2',
    sourceUrl: 'https://example.feishu.cn/base/bascnA1B2C3D4?table=tblE5F6G7H8&view=vewI9J0K1L2',
  })
})

it('支持解析 hash 中携带 table/view 的飞书链接', async () => {
  const { resolveFeishuBitableSourceInput } = await loadModule()
  const result = resolveFeishuBitableSourceInput('https://example.feishu.cn/base/bascnA1B2C3D4#open?table=tblE5F6G7H8&view=vewI9J0K1L2')

  assert.equal(result.appToken, 'bascnA1B2C3D4')
  assert.equal(result.tableId, 'tblE5F6G7H8')
  assert.equal(result.viewId, 'vewI9J0K1L2')
})

it('支持解析 appToken/tableId/viewId 简写文本', async () => {
  const { resolveFeishuBitableSourceInput } = await loadModule()
  const result = resolveFeishuBitableSourceInput('bascnA1B2C3D4 / tblE5F6G7H8 / vewI9J0K1L2')

  assert.equal(result.appToken, 'bascnA1B2C3D4')
  assert.equal(result.tableId, 'tblE5F6G7H8')
  assert.equal(result.viewId, 'vewI9J0K1L2')
})

it('支持解析显式字段文本', async () => {
  const { resolveFeishuBitableSourceInput } = await loadModule()
  const result = resolveFeishuBitableSourceInput('appToken=bascnA1B2C3D4 tableId=tblE5F6G7H8 viewId=vewI9J0K1L2')

  assert.equal(result.appToken, 'bascnA1B2C3D4')
  assert.equal(result.tableId, 'tblE5F6G7H8')
  assert.equal(result.viewId, 'vewI9J0K1L2')
})

it('wiki 链接不会把 wiki token 误识别成 bitable appToken', async () => {
  const { resolveFeishuBitableSourceInput, extractFeishuWikiNodeToken } = await loadModule()
  const input = 'https://jcn6saobodid.feishu.cn/wiki/Fr5YwVxgMiZK69kN9t7cDPiGnwh?from=top_doc_tab'
  const result = resolveFeishuBitableSourceInput(input)

  assert.equal(extractFeishuWikiNodeToken(input), 'Fr5YwVxgMiZK69kN9t7cDPiGnwh')
  assert.equal(result.appToken, '')
  assert.equal(result.tableId, '')
  assert.equal(result.viewId, '')
})
