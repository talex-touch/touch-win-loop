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

  assert.match(source, /class="[^"]*\bai-prompts-page\b[^"]*"/, '页面根节点应为 ai-prompts-page')
  assert.match(source, /class="[^"]*\bw-full\b[^"]*"/, '页面根节点应为全宽布局')
  assert.match(source, /class="[^"]*\bmin-w-0\b[^"]*"/, '页面根节点应限制最小宽度')
  assert.match(source, /Provider 列表/, '缺少 Provider 列表')
  assert.match(source, /新增 Provider/, '缺少新增 Provider 入口')
  assert.match(source, /Provider 类型/, '缺少 Provider 类型编辑项')
  assert.doesNotMatch(source, /单上游 \+ 模型池 \+ 场景回退/, '不应继续展示单上游标题')
  assert.doesNotMatch(source, /这里只保留共享上游连接信息/, '不应继续展示共享上游说明')
})

it('provider 类型固定包含 LLM、voice 与 search-only 枚举', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /value:\s*'newapi'[\s\S]*label:\s*'NewAPI'/, '缺少 NewAPI 类型')
  assert.match(source, /value:\s*'openai-compatible'[\s\S]*label:\s*'OpenAI Compatible'/, '缺少 OpenAI Compatible 类型')
  assert.match(source, /value:\s*'dashscope-bailian'[\s\S]*label:\s*'百炼 DashScope'/, '缺少百炼 DashScope 类型')
  assert.match(source, /value:\s*'coze-voice'[\s\S]*label:\s*'Coze 语音 \/ Realtime'[\s\S]*capability:\s*'voice'/, '缺少 Coze 语音 Provider 类型')
  assert.match(source, /value:\s*'searchxng'[\s\S]*capability:\s*'search'/, '缺少 SearchXNG search-only 类型')
  assert.match(source, /value:\s*'tavily'[\s\S]*capability:\s*'search'/, '缺少 Tavily search-only 类型')
  assert.match(source, /providerCapabilityOptions/, '缺少 Provider 能力枚举')
  assert.match(source, /value:\s*'embedding'[\s\S]*label:\s*'Embedding only'/, '缺少 Embedding Provider 能力')
  assert.match(source, /value:\s*'asr'[\s\S]*label:\s*'ASR only'/, '缺少 ASR Provider 能力')
  assert.match(source, /value:\s*'tts'[\s\S]*label:\s*'TTS only'/, '缺少 TTS Provider 能力')
  assert.match(source, /value:\s*'voice'[\s\S]*label:\s*'Voice realtime'/, '缺少 Voice Provider 能力')
})

it('渠道和模型页不再暴露默认模型入口与联网能力卡片', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.doesNotMatch(source, /<div class="text-sm text-slate-900 font-medium">\s*默认能力模型\s*<\/div>/, '不应继续展示默认能力模型卡片')
  assert.doesNotMatch(source, /<a-form-item label="默认聊天模型">/, '不应继续展示默认聊天模型入口')
  assert.doesNotMatch(source, /<a-form-item label="默认 Embedding 模型">/, '不应继续展示默认 Embedding 模型入口')
  assert.doesNotMatch(source, /<a-form-item label="默认视觉模型">/, '不应继续展示默认视觉模型入口')
  assert.doesNotMatch(source, /defaultsForm/, '页面不应再维护默认模型表单状态')
  assert.doesNotMatch(source, /<div class="text-base font-semibold">\s*联网能力\s*<\/div>/, '联网能力卡片应已移出当前页')
  assert.match(source, /每个 Provider 独立维护类型、密钥、模型池，以及搜索或 AI 能力配置。/, 'Provider 列表说明应体现搜索能力归属 Provider')
  assert.doesNotMatch(source, /价格优先级固定为 手工覆盖 > NewAPI 导入 > none。/, '旧统一模型池说明不应继续存在')
})

it('provider 抽屉支持独立测试、拉取模型和维护模型池', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /v-model:visible="providerEditorVisible"/, '缺少 Provider 编辑抽屉')
  assert.match(source, /测试 Provider/, '缺少 Provider 测试入口')
  assert.match(source, /拉取模型/, '缺少 Provider 拉取模型入口')
  assert.match(source, /Provider 模型池/, '缺少 Provider 模型池区域')
  assert.match(source, /每个可承载模型的 Provider 维护自己的模型池、能力标签、接入参数与价格覆盖。/, '缺少 Provider 级模型池说明')
  assert.match(source, /Provider 只保存连接身份；模型能力与接入细节在模型池里维护。/, 'Provider 抽屉应按连接与模型池分层')
  assert.match(source, /https:\/\/dashscope\.aliyuncs\.com/, '百炼 Base URL 应提示填写服务根地址')
  assert.match(source, /为聊天补 compatible-mode\/v1\/chat\/completions/, '百炼路径应由系统自动补齐')
  assert.doesNotMatch(source, /API Key 模式/, 'Provider API Key 不应再暴露模式下拉')
  assert.match(source, /填写即替换并持久化；留空则保持已保存密钥不变。/, 'API Key 应采用输入即替换、留空保持的规则')
  assert.match(source, /<a-form-item label="API Key">[\s\S]*<div class="w-full space-y-1">[\s\S]*providerEditorTypeGuide\.apiKeyHint/, 'API Key 提示应位于输入框下方')
  assert.match(source, /apiKey\?: string/, 'Provider 草稿请求体应允许省略空 API Key')
  assert.match(source, /if \(apiKey\)\s*payload\.apiKey = apiKey/, 'Provider 草稿不应把空 API Key 传给保存/拉取接口')
  assert.doesNotMatch(source, /百炼原生 SDK/, '暂不应暴露不可用的百炼原生聊天接入')
})

it('search-only Provider 不参与模型场景路由', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /搜索型 Provider，只做 search-only 登记，不参与 AI 场景模型路由。/, '缺少 search-only 限制说明')
  assert.match(source, /按场景能力过滤 Provider/, '场景 Provider 选择应按场景能力过滤')
  assert.match(source, /routableProviderOptions/, '场景 Provider 下拉应来自可路由 Provider 列表')
  assert.match(source, /sceneEditorProviderOptions[\s\S]*providerCanServeScene\(provider, sceneEditorForm\.key\)/, '单场景 Provider 下拉应按当前场景允许能力过滤')
  assert.match(source, /v-for="item in sceneEditorProviderOptions"/, '单场景 Provider 下拉不应展示全部可路由 Provider')
  assert.match(source, /Provider 能力/, 'Provider 抽屉应允许显式选择模型路由能力')
  assert.match(source, /providerEditorCapabilityLocked/, 'search-only 类型应锁定 Provider 能力')
  assert.match(source, /providerEditorCanRunTtsTest/, 'Provider 连通性测试应覆盖 TTS Provider')
  assert.match(source, /providerEditorCanRunProviderTest[\s\S]*providerEditorCanRunTtsTest/, 'Provider 连通性测试应覆盖 LLM、voice 与 TTS Provider')
})

it('coze 语音 Provider 暴露语音参数并跳过普通模型池', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /Coze 语音参数/, '缺少 Coze 语音参数配置区')
  assert.match(source, /providerEditorForm\.voice\.botId/, '缺少 botId 配置')
  assert.match(source, /providerEditorForm\.voice\.connectorId/, '缺少 connectorId 配置')
  assert.match(source, /providerEditorForm\.voice\.voiceId/, '缺少 voiceId 配置')
  assert.match(source, /providerEditorForm\.voice\.authMode/, '缺少 authMode 配置')
  assert.match(source, /providerEditorSupportsModels[\s\S]*providerCapabilitySupportsModels/, 'Provider 是否支持模型池应按能力判断')
  assert.match(source, /const nextProviderDefault = type === 'coze-voice' \? 'coze' : type[\s\S]*providerEditorForm\.provider = nextProviderDefault/, 'Coze 语音类型应默认使用 coze provider 标识')
  assert.match(source, /模型池：无需配置/, 'voice Provider 应提示无需配置模型池')
  assert.match(source, /sceneUsesModelLessVoice/, '场景页应识别 Coze 语音无模型运行时')
})

it('场景抽屉支持 Provider 绑定、模型池、回退顺序和故障转移策略', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /ID:\s*\{\{\s*scope\.record\.key\s*\}\}/, '场景列表未展示稳定的场景 ID 代号')
  assert.match(source, /return `\$\{providerName\} #\$\{id\}`/, '场景列表里的 Provider 预览未展示“名称 #id”格式')
  assert.match(source, /v-model:visible="sceneEditorVisible"/, '缺少场景编辑抽屉')
  assert.match(source, /绑定 Provider/, '缺少场景 Provider 绑定项')
  assert.match(source, /负载均衡策略/, '缺少负载均衡策略项')
  assert.match(source, /模型池/, '缺少模型池项')
  assert.match(source, /回退顺序/, '缺少回退顺序项')
  assert.match(source, /故障转移策略/, '缺少故障转移策略项')
  assert.match(source, /failoverStrategy: 'model_then_provider'/, '场景表单未声明默认故障转移策略')
  assert.match(source, /knowledge_embedding/, '缺少专用 Embedding 场景')
  assert.match(source, /knowledge_visual_embedding/, '缺少专用视觉 Embedding 场景')
  assert.match(source, /knowledge_visual_projection/, '缺少专用视觉投影场景')
  assert.match(source, /sceneRequiredCapability/, '场景模型选择应按能力过滤')
  assert.match(source, /sceneEmbeddingApiStyleFilter/, 'Embedding 场景模型选择应按接入类型过滤')
  assert.match(source, /只配置模型路由，无需执行对话测试/, '非聊天场景不应执行对话测试')
  assert.match(source, /复制当前策略到全部场景/, '缺少一键复制当前场景策略入口')
  assert.match(source, /一键设置全部场景/, '缺少批量配置入口')
  assert.match(source, /内置提示词/, '场景编辑抽屉应展示内置提示词')
  assert.match(source, /sceneDefinitionForKey\(sceneEditorForm\.key\)\?\.builtinPrompt/, '场景编辑抽屉应从后端定义读取内置提示词')
  assert.match(source, /label="自定义提示词"/, '场景追加提示词应命名为自定义提示词')
  assert.match(source, /sceneModelEmptyHint/, '场景模型池空态应说明过滤原因')
})

it('知识库 Embedding 场景只使用 embedding 模型并禁用对话测试', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /'knowledge_embedding'/, '场景类型缺少知识库 Embedding')
  assert.match(source, /function sceneRequiredCapability\(key: PlatformAiChannelKey\): ModelCapability \{[\s\S]*requiredModelCapability \|\| 'chat'/, '知识库 Embedding 场景应从后端定义读取模型能力')
  assert.match(source, /resolveSceneModelCatalog\(sceneEditorForm\.providerIds, sceneEditorForm\.models, sceneRequiredCapability\(sceneEditorForm\.key\), sceneEmbeddingApiStyleFilter\(sceneEditorForm\.key\)\)/, '场景模型池候选未按场景能力与 Embedding 接入类型过滤')
  assert.match(source, /function normalizeSceneRoutingConfig\(/, '场景保存前未统一整理模型池与回退顺序')
  assert.match(source, /modelFallback: normalizeSceneModels\(/, '场景回退顺序未按模型池裁剪')
  assert.match(source, /if \(!sceneCanRunChatTest\(scene\)\)[\s\S]*无需执行对话测试/, 'Embedding 场景测试入口未拦截对话测试')
  assert.match(source, /:disabled="!sceneCanRunChatTest\(scope\.record\)"[\s\S]*无需测试/, 'Embedding 场景测试按钮未禁用并提示无需测试')
  assert.match(source, /if \(capability === 'tts'\)[\s\S]*provider\?\.capability === 'tts'/, 'TTS 场景应允许执行 TTS 连通性测试')
  assert.match(source, /sceneAllowedProviderCapabilities/, '场景 Provider 过滤应从后端定义读取允许 Provider 类型')
  assert.doesNotMatch(source, /回退默认模型池/, '场景页不应再出现默认模型池兜底文案')
  assert.doesNotMatch(source, /回退默认模型/, '场景页不应再出现默认模型兜底文案')
})

it('模型编辑与导入弹窗支持能力配置和 embedding 搜索', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /modelCapabilityOptions/, '缺少模型能力枚举')
  assert.match(source, /模型能力/, '缺少模型能力编辑项')
  assert.match(source, /modelPullCapabilityFilters/, '缺少导入模型能力过滤')
  assert.match(source, /Provider 原始字段/, '导入搜索应覆盖 Provider 原始字段')
  assert.match(source, /百炼多模态 Embedding 运行端点/, '导入弹窗应明确百炼 Embedding 原生端点')
  assert.match(source, /未从该 Provider 拉取到 Embedding 模型/, '缺少 embedding 空结果提示')
  assert.match(source, /tongyi-embedding-vision-plus/, '缺少百炼多模态 Embedding 模型提示')
  assert.match(source, /providerEditorForm\.type !== 'dashscope-bailian'[\s\S]*value="response"/, 'DashScope 应隐藏 response 格式')
})

it('provider 删除和缺失价格展示提供安全兜底', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /a-popconfirm[\s\S]*确认删除该 Provider 吗[\s\S]*@ok="removeProvider\(scope\.record\.id\)"/, 'Provider 删除缺少二次确认')
  assert.match(source, /return '默认未计费'/, '缺失价格应显示统一兜底文案')
  assert.doesNotMatch(source, /return 'none'/, '缺失价格不应继续显示 none')
})

it('logs 表格与详情展示 AI 请求耗时和尝试链', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<a-table-column title="耗时" data-index="latencyMs" :width="110">/, 'Logs 表格缺少耗时列')
  assert.match(source, /formatLatency\(scope\.record\.latencyMs\)/, 'Logs 表格应渲染 latencyMs')
  assert.match(source, /<span class="font-medium">耗时：<\/span>\{\{ formatLatency\(logDetailRow\.latencyMs\) \}\}/, 'Logs 详情缺少耗时展示')
  assert.match(source, /<span class="font-medium">尝试链：<\/span>/, 'Logs 详情缺少尝试链展示')
})
