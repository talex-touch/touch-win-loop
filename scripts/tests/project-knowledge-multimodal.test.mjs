import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const ENV_FILE = resolve(process.cwd(), 'server/utils/env.ts')
const KNOWLEDGE_AI_FILE = resolve(process.cwd(), 'server/services/knowledge-ai.ts')
const VISION_SERVICE_FILE = resolve(process.cwd(), 'server/services/knowledge-vision.ts')
const WORKER_FILE = resolve(process.cwd(), 'server/plugins/project-knowledge-worker.ts')
const CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const ASSISTANT_MESSAGE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAssistantMessageContent.vue')
const WORKER_API_FILE = resolve(process.cwd(), 'server/api/admin/resources/knowledge-worker.get.ts')
const WORKER_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/resource-knowledge-worker.vue')
const AI_PROVIDERS_GET_FILE = resolve(process.cwd(), 'server/api/admin/ai/providers.get.ts')
const AI_PROVIDERS_PATCH_FILE = resolve(process.cwd(), 'server/api/admin/ai/providers.patch.ts')
const AI_PROMPTS_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/ai-prompts.vue')
const KNOWLEDGE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-knowledge-store.ts')
const PLATFORM_AI_CHANNELS_FILE = resolve(process.cwd(), 'server/utils/platform-ai-channels.ts')
const PLATFORM_AI_CLIENT_FILE = resolve(process.cwd(), 'server/utils/platform-ai-client.ts')

describe('project knowledge multimodal', () => {
  it('共享类型与运行时配置已扩展多模态字段', async () => {
    const [domainSource, envSource, providersGetSource, providersPatchSource, channelsSource, clientTypeSource] = await Promise.all([
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(ENV_FILE, 'utf8'),
      readFile(AI_PROVIDERS_GET_FILE, 'utf8'),
      readFile(AI_PROVIDERS_PATCH_FILE, 'utf8'),
      readFile(PLATFORM_AI_CHANNELS_FILE, 'utf8'),
      readFile(PLATFORM_AI_CLIENT_FILE, 'utf8'),
    ])

    assert.match(domainSource, /'image_summary'/, '共享类型缺少 image_summary chunk kind')
    assert.match(domainSource, /'image_ocr'/, '共享类型缺少 image_ocr chunk kind')
    assert.match(domainSource, /'meeting_notes'/, '共享类型缺少 meeting_notes chunk kind')
    assert.match(domainSource, /'meeting_transcript'/, '共享类型缺少 meeting_transcript chunk kind')
    assert.match(domainSource, /modality\?: ProjectKnowledgeModality/, 'citation 缺少 modality 字段')
    assert.match(domainSource, /projectionType\?: ProjectKnowledgeProjectionType/, 'citation 缺少 projectionType 字段')
    assert.match(domainSource, /export interface ProjectKnowledgeChunkMetadata \{[\s\S]*fallbackUsed\?: boolean/, 'chunk metadata 缺少多模态投影字段')
    assert.match(domainSource, /export type PlatformAiClientType = 'langchain' \| 'bailian-native' \| 'coze-sdk'/, '共享类型缺少 AI clientType')
    assert.match(domainSource, /export type ProjectKnowledgeEmbeddingApiStyle = 'openai-compatible-text' \| 'bailian-multimodal'/, '共享类型缺少 embeddingApiStyle')
    assert.match(domainSource, /embeddingApiStyle\?: ProjectKnowledgeEmbeddingApiStyle/, 'chunk metadata 缺少 embeddingApiStyle')
    assert.match(domainSource, /embeddingInputType\?: ProjectKnowledgeEmbeddingInputType/, 'chunk metadata 缺少 embeddingInputType')
    assert.match(domainSource, /embeddingDimensions\?: number/, 'chunk metadata 缺少 embeddingDimensions')
    assert.match(domainSource, /embeddingFusionUsed\?: boolean/, 'chunk metadata 缺少 embeddingFusionUsed')

    assert.match(clientTypeSource, /export function normalizePlatformAiClientType/, '缺少统一的 AI clientType 归一化工具')
    assert.match(clientTypeSource, /export function normalizeProjectKnowledgeEmbeddingApiStyle/, '缺少统一的 embeddingApiStyle 归一化工具')
    assert.match(envSource, /clientType: PlatformAiClientType/, '运行时配置缺少 typed clientType 字段')
    assert.match(envSource, /visionModel: string/, '运行时配置缺少 visionModel 字段')
    assert.match(envSource, /embeddingApiStyle: ProjectKnowledgeEmbeddingApiStyle/, '运行时配置缺少 typed embeddingApiStyle 字段')
    assert.match(envSource, /embeddingDimensions: number/, '运行时配置缺少 embeddingDimensions 字段')
    assert.match(envSource, /clientType: normalizePlatformAiClientType\(runtime\.ai\?\.clientType\)/, '运行时配置未读取 clientType')
    assert.match(envSource, /visionModel: String\(runtime\.ai\?\.visionModel \?\? ''\)/, '运行时配置未读取 visionModel')
    assert.match(envSource, /embeddingApiStyle: normalizeProjectKnowledgeEmbeddingApiStyle\(runtime\.ai\?\.embeddingApiStyle\)/, '运行时配置未读取 embeddingApiStyle')
    assert.match(envSource, /embeddingDimensions: Math\.max\(0, Math\.trunc\(toNumber\(runtime\.ai\?\.embeddingDimensions, 1024\)\)\)/, '运行时配置未读取 embeddingDimensions')
    assert.match(channelsSource, /clientType: PlatformAiClientType/, 'provider registry 缺少 clientType 字段')
    assert.match(channelsSource, /capabilities: PlatformAiModelCapability\[\]/, 'provider registry 模型缺少 capabilities 字段')
    assert.match(channelsSource, /clientType: model\.clientType/, 'provider registry 未向场景运行时透传模型级 clientType')
    assert.match(channelsSource, /resolvePlatformAiRuntimeByCapability/, 'provider registry 缺少按模型能力解析运行时')
    assert.match(providersGetSource, /clientType: provider\.clientType/, 'AI 配置读取接口未返回 clientType')
    assert.match(providersGetSource, /visionModel: provider\.visionModel \|\| ''/, 'AI 配置读取接口未返回 visionModel')
    assert.match(providersGetSource, /embeddingApiStyle: provider\.embeddingApiStyle \|\| runtime\.ai\.embeddingApiStyle/, 'AI 配置读取接口未返回 embeddingApiStyle')
    assert.match(providersGetSource, /embeddingDimensions: provider\.embeddingDimensions \|\| runtime\.ai\.embeddingDimensions/, 'AI 配置读取接口未返回 embeddingDimensions')
    assert.match(providersPatchSource, /clientType\?: PlatformAiClientType/, 'AI 配置保存接口缺少 clientType 入参')
    assert.match(providersPatchSource, /clientType: hasOwn\(source as Record<string, unknown>, 'clientType'\)/, 'AI 配置保存接口未将 clientType 写入 provider registry')
    assert.match(providersPatchSource, /clientType: provider\.clientType/, 'AI 配置保存接口未返回 clientType')
    assert.match(providersPatchSource, /visionModel: provider\.visionModel \|\| ''/, 'AI 配置保存接口未返回 visionModel')
    assert.match(providersPatchSource, /embeddingApiStyle: provider\.embeddingApiStyle \|\| effectiveRuntime\.ai\.embeddingApiStyle/, 'AI 配置保存接口未返回 embeddingApiStyle')
    assert.match(providersPatchSource, /embeddingDimensions: provider\.embeddingDimensions \|\| effectiveRuntime\.ai\.embeddingDimensions/, 'AI 配置保存接口未返回 embeddingDimensions')
  })

  it('worker 已生成图片投影、会议转写并升级索引版本', async () => {
    const [knowledgeAiSource, visionSource, workerSource, storeSource] = await Promise.all([
      readFile(KNOWLEDGE_AI_FILE, 'utf8'),
      readFile(VISION_SERVICE_FILE, 'utf8'),
      readFile(WORKER_FILE, 'utf8'),
      readFile(KNOWLEDGE_STORE_FILE, 'utf8'),
    ])

    assert.match(knowledgeAiSource, /resolveDashScopeNativeBaseURL/, 'knowledge-ai 未推导百炼原生地域地址')
    assert.match(knowledgeAiSource, /resolveKnowledgeEmbeddingChannelKey/, 'knowledge-ai 未按文本与视觉输入选择 Embedding 场景')
    assert.match(knowledgeAiSource, /knowledge_visual_embedding/, 'knowledge-ai 未接入视觉 Embedding 场景')
    assert.match(knowledgeAiSource, /bailian-multimodal/, 'knowledge-ai 未增加百炼多模态 dispatcher')
    assert.match(knowledgeAiSource, /api\/v1\/services\/embeddings\/multimodal-embedding\/multimodal-embedding/, 'knowledge-ai 未调用百炼原生多模态接口')
    assert.match(knowledgeAiSource, /BAILIAN_MULTIMODAL_RUNTIME_NOT_CONFIGURED/, 'knowledge-ai 未对多模态缺配置做严格失败')
    assert.match(knowledgeAiSource, /enable_fusion/, 'knowledge-ai 未向百炼多模态接口传递融合参数')
    assert.match(visionSource, /export async function analyzeKnowledgeVisualProjection/, '缺少视觉投影服务')
    assert.match(visionSource, /MAX_VISION_IMAGE_BYTES/, '视觉投影服务缺少图片体积保护')
    assert.match(workerSource, /analyzeKnowledgeVisualProjection/, 'worker 未接入视觉投影分析')
    assert.match(workerSource, /listProjectMeetingUtterances/, 'worker 未接入会议转写读取')
    assert.match(workerSource, /chunkKind:\s*'image_summary'/, 'worker 未生成 image_summary')
    assert.match(workerSource, /chunkKind:\s*'image_ocr'/, 'worker 未生成 image_ocr')
    assert.match(workerSource, /chunkKind:\s*'meeting_transcript'/, 'worker 未生成 meeting_transcript')
    assert.match(workerSource, /artifactKind === 'meeting_notes'/, 'worker 未接入 meeting_notes 投影分支')
    assert.match(workerSource, /isDocumentVisualFallbackCandidate/, 'worker 未限制文档视觉回退范围')
    assert.match(workerSource, /buildProjectResourceSignedUrls/, 'worker 未为视频资源生成签名 URL')
    assert.match(workerSource, /inputType:\s*'fused'/, 'worker 未为图片摘要声明 fused embedding 输入')
    assert.match(workerSource, /enableFusion:\s*true/, 'worker 未为图片摘要开启融合向量')
    assert.match(workerSource, /inputType:\s*'video'/, 'worker 未为视频资源声明 video embedding 输入')
    assert.match(workerSource, /BAILIAN_MULTIMODAL_VIDEO_URL_UNREACHABLE/, 'worker 未对不可达视频 URL 做严格失败')
    assert.match(workerSource, /embeddingApiStyle: embeddingResult\.apiStyle/, 'worker 未持久化 embeddingApiStyle')
    assert.match(workerSource, /embeddingInputType: embeddingResult\.inputType/, 'worker 未持久化 embeddingInputType')
    assert.match(workerSource, /embeddingDimensions: embeddingResult\.dimensions/, 'worker 未持久化 embeddingDimensions')
    assert.match(workerSource, /embeddingFusionUsed: embeddingResult\.fusionUsed/, 'worker 未持久化 embeddingFusionUsed')
    assert.match(storeSource, /project-knowledge-v2-multimodal/, '多模态索引版本未升级')
    assert.match(storeSource, /buildProjectKnowledgeEmbeddingConfigSignature/, 'store 未将 embedding 配置纳入 source hash')
  })

  it('检索排序、引用展示与后台监控已具备多模态感知', async () => {
    const [contextSource, assistantSource, workerApiSource, workerPageSource, aiPromptsSource] = await Promise.all([
      readFile(CONTEXT_FILE, 'utf8'),
      readFile(ASSISTANT_MESSAGE_FILE, 'utf8'),
      readFile(WORKER_API_FILE, 'utf8'),
      readFile(WORKER_PAGE_FILE, 'utf8'),
      readFile(AI_PROMPTS_PAGE_FILE, 'utf8'),
    ])

    assert.match(contextSource, /VISUAL_QUERY_HINTS/, '知识检索上下文缺少视觉查询意图')
    assert.match(contextSource, /MEETING_QUERY_HINTS/, '知识检索上下文缺少会议查询意图')
    assert.match(contextSource, /inputType: 'text'/, '知识检索 query embedding 未显式声明 text 输入')
    assert.match(contextSource, /projectionType/, '知识检索上下文未透传 projectionType')
    assert.match(contextSource, /modality/, '知识检索上下文未透传 modality')
    assert.match(contextSource, /这是投影结果，不要表述为原始正文摘录/, '知识检索上下文未约束投影引用文案')

    assert.match(assistantSource, /workspace-assistant-citation-projection/, 'assistant 引用卡缺少投影标签')
    assert.match(assistantSource, /视觉投影/, 'assistant 引用卡缺少视觉投影标签')
    assert.match(assistantSource, /转写投影/, 'assistant 引用卡缺少转写投影标签')

    assert.match(workerApiSource, /chunkKinds:/, '知识索引监控 API 未返回 chunkKinds')
    assert.match(workerPageSource, /多模态片段分布/, '知识索引监控页未展示多模态片段分布')
    assert.match(aiPromptsSource, /视觉模型/, 'AI 配置台未暴露 visionModel 字段')
    assert.match(aiPromptsSource, /当前聊天接入固定使用 LangChain/, 'AI 配置台未暴露模型级 clientType 说明')
    assert.match(aiPromptsSource, /Embedding 接入类型/, 'AI 配置台未暴露 embeddingApiStyle 字段')
    assert.match(aiPromptsSource, /Embedding 维度/, 'AI 配置台未暴露 embeddingDimensions 字段')
    assert.match(aiPromptsSource, /clientType: 'langchain'/, 'AI 配置保存未提交模型级 clientType')
    assert.match(aiPromptsSource, /embeddingApiStyle: isEmbedding \?/, 'AI 配置保存未提交模型级 embeddingApiStyle')
    assert.match(aiPromptsSource, /embeddingDimensions: isEmbedding \?/, 'AI 配置保存未提交模型级 embeddingDimensions')
    assert.match(aiPromptsSource, /visionModel: defaultsForm\.visionModel/, 'AI 配置保存未提交默认视觉模型')
  })
})
