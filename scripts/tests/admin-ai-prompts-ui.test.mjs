import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/ai-prompts.vue')

it('顶部 tab 保留渠道和模型、场景、Audits、Logs', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /label:\s*'渠道和模型'/, '缺少“渠道和模型” tab')
  assert.match(source, /label:\s*'场景'/, '缺少“场景” tab')
  assert.match(source, /label:\s*'Audits'/, '缺少 “Audits” tab')
  assert.match(source, /label:\s*'Logs'/, '缺少 “Logs” tab')
})

it('页面已切换为多 Provider 管理入口', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /class="ai-prompts-page space-y-4 w-full min-w-0"/, '页面根节点应为全宽布局')
  assert.match(source, /Provider 列表/, '缺少 Provider 列表')
  assert.match(source, /新增 Provider/, '缺少新增 Provider 入口')
  assert.match(source, /Provider 类型/, '缺少 Provider 类型编辑项')
  assert.doesNotMatch(source, /单上游 \+ 模型池 \+ 场景回退/, '不应继续展示单上游标题')
  assert.doesNotMatch(source, /这里只保留共享上游连接信息/, '不应继续展示共享上游说明')
})

it('provider 类型固定包含 LLM 与 search-only 首批枚举', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /value:\s*'newapi'[\s\S]*label:\s*'NewAPI'/, '缺少 NewAPI 类型')
  assert.match(source, /value:\s*'openai-compatible'[\s\S]*label:\s*'OpenAI Compatible'/, '缺少 OpenAI Compatible 类型')
  assert.match(source, /value:\s*'dashscope-bailian'[\s\S]*label:\s*'百炼 DashScope'/, '缺少百炼 DashScope 类型')
  assert.match(source, /value:\s*'searchxng'[\s\S]*capability:\s*'search'/, '缺少 SearchXNG search-only 类型')
  assert.match(source, /value:\s*'tavily'[\s\S]*capability:\s*'search'/, '缺少 Tavily search-only 类型')
})

it('默认模型与联网能力不再单独占据渠道和模型页', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.doesNotMatch(source, /<div class="text-base font-semibold">\s*默认模型\s*<\/div>/, '默认模型卡片应已移出当前页')
  assert.doesNotMatch(source, /<div class="text-base font-semibold">\s*联网能力\s*<\/div>/, '联网能力卡片应已移出当前页')
  assert.match(source, /每个 Provider 独立维护类型、密钥、模型池，以及搜索或 LLM 能力配置。/, 'Provider 列表说明应体现搜索能力归属 Provider')
  assert.doesNotMatch(source, /价格优先级固定为 手工覆盖 > NewAPI 导入 > none。/, '旧统一模型池说明不应继续存在')
})

it('provider 抽屉支持独立测试、拉取模型和维护模型池', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /v-model:visible="providerEditorVisible"/, '缺少 Provider 编辑抽屉')
  assert.match(source, /测试 Provider/, '缺少 Provider 测试入口')
  assert.match(source, /拉取模型/, '缺少 Provider 拉取模型入口')
  assert.match(source, /Provider 模型池/, '缺少 Provider 模型池区域')
  assert.match(source, /每个 LLM Provider 维护自己的模型池与价格覆盖。/, '缺少 Provider 级模型池说明')
})

it('search-only Provider 不参与 LLM 场景模型路由', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /SearchXNG \/ Tavily 属于 search-only Provider，当前不会进入 LLM 模型池，也不能绑定到这些 LLM 场景。/, '缺少 search-only 限制说明')
  assert.match(source, /只能选择 llm Provider/, '场景 Provider 选择应限制为 llm Provider')
  assert.match(source, /llmProviderOptions/, '场景 Provider 下拉应来自 llmProviderOptions')
})

it('场景抽屉支持 Provider 绑定、轮询和模型回退链', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /v-model:visible="sceneEditorVisible"/, '缺少场景编辑抽屉')
  assert.match(source, /绑定 Provider/, '缺少场景 Provider 绑定项')
  assert.match(source, /负载均衡策略/, '缺少负载均衡策略项')
  assert.match(source, /模型回退链/, '缺少模型回退链项')
  assert.match(source, /复制当前策略到全部场景/, '缺少一键复制当前场景策略入口')
  assert.match(source, /一键设置全部场景/, '缺少批量配置入口')
})

it('logs 表格与详情展示 AI 请求耗时和尝试链', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<a-table-column title="耗时" data-index="latencyMs" :width="110">/, 'Logs 表格缺少耗时列')
  assert.match(source, /formatLatency\(scope\.record\.latencyMs\)/, 'Logs 表格应渲染 latencyMs')
  assert.match(source, /<span class="font-medium">耗时：<\/span>\{\{ formatLatency\(logDetailRow\.latencyMs\) \}\}/, 'Logs 详情缺少耗时展示')
  assert.match(source, /<span class="font-medium">尝试链：<\/span>/, 'Logs 详情缺少尝试链展示')
})
