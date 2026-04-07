import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

it('同步项编辑器会把当前草稿配置作为预检请求体提交', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /const draft: FeishuBitableSyncItemPreviewRequest = \{/, '编辑器没有构造草稿预检请求')
  assert.match(componentSource, /source:\s*\{[\s\S]*appToken:[\s\S]*tableId:[\s\S]*viewId:/, '预检请求缺少当前来源草稿')
  assert.match(componentSource, /mapping,\s*options,\s*writeback,/, '预检请求缺少当前映射\/选项\/回填草稿')
  assert.match(componentSource, /body:\s*draft,/, '预检请求未把草稿配置发送到后端')
})

it('同步项编辑器会为每个目标字段渲染固定映射行并展示模拟同步结果', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /normalizeMappingWizardBindings/, '编辑器未把映射行归一化到固定字段列表')
  assert.match(componentSource, /missingRequiredMappingLabels/, '编辑器未提示缺失的必填映射字段')
  assert.match(componentSource, /normalizeCurrentEntityTemplate/, '编辑器缺少整理旧配置为当前实体模板的能力')
  assert.match(componentSource, /v-for="binding in mappingWizardBindings"/, '编辑器未按固定字段行渲染映射表单')
  assert.match(componentSource, /WRITEBACK_FIELD_CONFIGS/, '编辑器未抽出回填字段选择配置')
  assert.match(componentSource, /v-model="writebackForm\[field\.key\]"/, '回填配置未改成字段选择下拉')
  assert.match(componentSource, /模拟同步结果/, '编辑器缺少模拟同步结果区块')
  assert.match(componentSource, /previewResult\.mappedSampleRows/, '编辑器未展示预检样例行')
})

it('新增同步项时会提供类型识别建议并生成推荐名称', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /suggestSyncItemEntityType/, '新增同步项未接入实体类型自动识别')
  assert.match(componentSource, /buildSuggestedSyncItemName/, '新增同步项未生成推荐名称')
  assert.match(componentSource, /useAutoDetectedNewItemEntityType/, '新增同步项缺少按子表识别入口')
})

it('新增同步项的实体类型选择器不会被 label 包裹导致点击异常', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(
    componentSource,
    /<div class="text-\[11px\] text-slate-600 font-medium block">\s*<div>同步到<\/div>\s*<div class="mt-1 flex gap-2">[\s\S]*?<a-select v-model="newItemForm\.entityType"[\s\S]*?<a-button size="mini" @click="useAutoDetectedNewItemEntityType">/,
    '新增同步项的实体类型选择器未改为普通容器包裹',
  )
})

it('服务端预检会优先使用草稿配置覆盖已保存同步项', async () => {
  const apiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/preview.post.ts'), 'utf8')
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')

  assert.match(apiSource, /readBody<FeishuBitableSyncItemPreviewRequest>/, '预检接口未读取草稿请求体')
  assert.match(apiSource, /draft:\s*body/, '预检接口未把草稿传入服务层')
  assert.match(serviceSource, /const sourceOverride = parseJsonObject\(input\.draft\?\.source\)/, '服务层未读取来源草稿覆盖')
  assert.match(serviceSource, /const mappingRaw = input\.draft && hasOwn\(input\.draft, 'mapping'\) \? input\.draft\.mapping : task\.mapping/, '服务层未优先使用草稿 mapping')
  assert.match(serviceSource, /const optionsRaw = input\.draft && hasOwn\(input\.draft, 'options'\) \? input\.draft\.options : task\.options/, '服务层未优先使用草稿 options')
  assert.match(serviceSource, /const writebackRaw = input\.draft && hasOwn\(input\.draft, 'writeback'\)/, '服务层未优先使用草稿 writeback')
})
