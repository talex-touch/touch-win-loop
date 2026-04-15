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
  assert.match(source, /max-h-\[calc\(100vh-132px\)\][\s\S]*overflow-y-auto/, '抽屉内容缺少滚动容器')
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
