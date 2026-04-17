import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/ai-prompts.vue')

it('顶部 tab 收敛为渠道和模型、场景、Audits、Logs', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /label:\s*'渠道和模型'/, '缺少“渠道和模型” tab')
  assert.match(source, /label:\s*'场景'/, '缺少“场景” tab')
  assert.match(source, /label:\s*'Audits'/, '缺少 “Audits” tab')
  assert.match(source, /label:\s*'Logs'/, '缺少 “Logs” tab')
})

it('页面不再暴露旧的 Providers、Models、Channels 文案入口', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.doesNotMatch(source, /label:\s*'Providers'/, '不应再出现 Providers tab')
  assert.doesNotMatch(source, /label:\s*'Models'/, '不应再出现 Models tab')
  assert.doesNotMatch(source, /label:\s*'Channels'/, '不应再出现 Channels tab')
  assert.doesNotMatch(source, /Provider Registry/, '不应再出现 Provider Registry 文案')
})

it('页面不再暴露兼容用途模型输入项', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.doesNotMatch(source, /默认对话模型/, '不应再出现默认对话模型输入项')
  assert.doesNotMatch(source, /Embedding 模型/, '不应再出现 Embedding 模型输入项')
  assert.doesNotMatch(source, /文档分析模型/, '不应再出现文档分析模型输入项')
})

it('base url 输入改为根地址并提示自动补 /v1', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /placeholder="https:\/\/your-newapi\.example"/, 'Base URL 占位符应使用根地址')
  assert.match(source, /Base URL 将自动规范为根地址，调用时自动补 \/v1/, '缺少 Base URL 自动补 /v1 提示')
  assert.match(source, /当前输入框里的 API Key 会优先用于测试上游和拉取模型/, '缺少 API Key 临时优先使用提示')
  assert.match(source, /测试\/拉取会优先使用当前输入；保存持久化需选择替换/, 'API Key 输入框占位提示不正确')
})

it('模型与场景编辑改为 drawer 且包含滚动容器', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<a-drawer[\s\S]*v-model:visible="modelEditorVisible"/, '缺少模型编辑抽屉')
  assert.match(source, /<a-drawer[\s\S]*v-model:visible="sceneEditorVisible"/, '缺少场景编辑抽屉')
  assert.match(source, /<a-drawer[\s\S]*v-model:visible="sceneBatchEditorVisible"/, '缺少批量场景模型抽屉')
  assert.match(source, /max-h-\[calc\(100vh-132px\)\][\s\S]*overflow-y-auto/, '抽屉内容缺少滚动容器')
})

it('场景页支持一键设置全部场景模型', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /一键设置全部场景模型/, '缺少批量设置全部场景模型入口')
  assert.match(source, /应用到全部场景/, '缺少批量应用按钮')
  assert.match(source, /复制模型链到全部场景/, '缺少从当前场景复制模型链到全部场景入口')
})

it('拉取模型改为分组导入弹框', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /title="选择导入模型"/, '缺少模型导入弹框')
  assert.match(source, /拉取结果会先按系列分组展示。你可以全选、按系列勾选，或继续精确到单个模型后再导入。/, '缺少分组导入说明')
  assert.match(source, /placeholder="按模型名或展示名筛选"/, '缺少导入模型筛选输入框')
  assert.match(source, /筛选结果：\{\{ filteredPulledModelCount \}\}/, '缺少筛选结果统计')
  assert.match(source, /点击展开查看该系列下的/, '模型分组默认应收起并支持展开')
  assert.match(source, /没有匹配的模型/, '筛选为空时应展示空态')
  assert.match(source, /导入选中模型/, '缺少导入选中模型按钮')
  assert.match(source, /已在模型池/, '导入弹框应标记已存在模型')
  assert.match(source, /新模型/, '导入弹框应标记新增模型')
})

it('模型池支持一键清空当前草稿', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /清空模型池/, '缺少清空模型池入口')
  assert.match(source, /确认清空当前模型池吗？这会移除全部模型，并同步清空场景里的模型回退链；只有保存后才会持久化。/, '缺少清空模型池确认说明')
})

it('场景模型编辑改为可搜索可创建的多选下拉', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /v-model="sceneEditorForm\.models"[\s\S]*multiple[\s\S]*allow-search[\s\S]*allow-create/, '场景模型编辑应使用支持搜索和创建的多选下拉')
  assert.match(source, /v-model="sceneBatchForm\.models"[\s\S]*multiple[\s\S]*allow-search[\s\S]*allow-create/, '批量场景模型编辑应使用支持搜索和创建的多选下拉')
  assert.match(source, /顺序按添加先后决定；如需调整顺序，请删除后按新的顺序重新添加。/, '缺少模型回退顺序说明')
  assert.doesNotMatch(source, /sceneEditorForm\.modelsText/, '场景编辑不应继续使用文本框状态')
  assert.doesNotMatch(source, /sceneBatchForm\.modelsText/, '批量场景编辑不应继续使用文本框状态')
})

it('表格列配置使用 columns slot、数值宽度并避免 cell slot 解构告警写法', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<a-table[\s\S]*<template #columns>/, '表格应通过 columns slot 注册列定义')
  assert.doesNotMatch(source, /<a-table-column[^>]*\swidth="(?:90|100|120|150|180|220|260)"/, '表格列宽不应再以字符串形式传入')
  assert.doesNotMatch(source, /#cell="\{ record \}"/, '表格 cell slot 不应继续使用 record 解构写法')
})

it('logs 表格与详情会展示 AI 请求耗时和尝试链', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<a-table-column title="耗时" data-index="latencyMs" :width="110">/, 'Logs 表格缺少耗时列')
  assert.match(source, /formatLatency\(scope\.record\.latencyMs\)/, 'Logs 表格应渲染 latencyMs')
  assert.match(source, /<span class="font-medium">耗时：<\/span>\{\{ formatLatency\(logDetailRow\.latencyMs\) \}\}/, 'Logs 详情缺少耗时展示')
  assert.match(source, /<span class="font-medium">尝试链：<\/span>/, 'Logs 详情缺少尝试链展示')
})

it('后台 AI 场景类型包含文档动作与画布动作 channel key', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /workspace_document_summarize/, '后台 AI 场景缺少文档总结 key')
  assert.match(source, /workspace_document_rewrite/, '后台 AI 场景缺少文档润写 key')
  assert.match(source, /workspace_document_expand/, '后台 AI 场景缺少文档扩写 key')
  assert.match(source, /workspace_document_complete_context/, '后台 AI 场景缺少文档补全上下文 key')
  assert.match(source, /workspace_document_restructure/, '后台 AI 场景缺少文档结构整理 key')
  assert.match(source, /workspace_canvas_generate/, '后台 AI 场景缺少画布生成 key')
  assert.match(source, /workspace_canvas_complete/, '后台 AI 场景缺少画布补全 key')
  assert.match(source, /workspace_canvas_refine/, '后台 AI 场景缺少画布局改 key')
})
