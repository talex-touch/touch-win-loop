import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const ENV_FILE = resolve(process.cwd(), 'server/utils/env.ts')
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

describe('project knowledge multimodal', () => {
  it('共享类型与运行时配置已扩展多模态字段', async () => {
    const [domainSource, envSource, providersGetSource, providersPatchSource] = await Promise.all([
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(ENV_FILE, 'utf8'),
      readFile(AI_PROVIDERS_GET_FILE, 'utf8'),
      readFile(AI_PROVIDERS_PATCH_FILE, 'utf8'),
    ])

    assert.match(domainSource, /'image_summary'/, '共享类型缺少 image_summary chunk kind')
    assert.match(domainSource, /'image_ocr'/, '共享类型缺少 image_ocr chunk kind')
    assert.match(domainSource, /'meeting_notes'/, '共享类型缺少 meeting_notes chunk kind')
    assert.match(domainSource, /'meeting_transcript'/, '共享类型缺少 meeting_transcript chunk kind')
    assert.match(domainSource, /modality\?: ProjectKnowledgeModality/, 'citation 缺少 modality 字段')
    assert.match(domainSource, /projectionType\?: ProjectKnowledgeProjectionType/, 'citation 缺少 projectionType 字段')
    assert.match(domainSource, /export interface ProjectKnowledgeChunkMetadata \{[\s\S]*fallbackUsed\?: boolean/, 'chunk metadata 缺少多模态投影字段')

    assert.match(envSource, /visionModel: string/, '运行时配置缺少 visionModel 字段')
    assert.match(envSource, /visionModel: String\(runtime\.ai\?\.visionModel \?\? ''\)/, '运行时配置未读取 visionModel')
    assert.match(providersGetSource, /visionModel: runtime\.ai\.visionModel/, 'AI 配置读取接口未返回 visionModel')
    assert.match(providersPatchSource, /visionModel: effectiveRuntime\.ai\.visionModel/, 'AI 配置保存接口未返回 visionModel')
  })

  it('worker 已生成图片投影、会议转写并升级索引版本', async () => {
    const [visionSource, workerSource, storeSource] = await Promise.all([
      readFile(VISION_SERVICE_FILE, 'utf8'),
      readFile(WORKER_FILE, 'utf8'),
      readFile(KNOWLEDGE_STORE_FILE, 'utf8'),
    ])

    assert.match(visionSource, /export async function analyzeKnowledgeVisualProjection/, '缺少视觉投影服务')
    assert.match(visionSource, /MAX_VISION_IMAGE_BYTES/, '视觉投影服务缺少图片体积保护')
    assert.match(workerSource, /analyzeKnowledgeVisualProjection/, 'worker 未接入视觉投影分析')
    assert.match(workerSource, /listProjectMeetingUtterances/, 'worker 未接入会议转写读取')
    assert.match(workerSource, /chunkKind:\s*'image_summary'/, 'worker 未生成 image_summary')
    assert.match(workerSource, /chunkKind:\s*'image_ocr'/, 'worker 未生成 image_ocr')
    assert.match(workerSource, /chunkKind:\s*'meeting_transcript'/, 'worker 未生成 meeting_transcript')
    assert.match(workerSource, /artifactKind === 'meeting_notes'/, 'worker 未接入 meeting_notes 投影分支')
    assert.match(workerSource, /isDocumentVisualFallbackCandidate/, 'worker 未限制文档视觉回退范围')
    assert.match(storeSource, /project-knowledge-v2-multimodal/, '多模态索引版本未升级')
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
    assert.match(contextSource, /projectionType/, '知识检索上下文未透传 projectionType')
    assert.match(contextSource, /modality/, '知识检索上下文未透传 modality')
    assert.match(contextSource, /这是投影结果，不要表述为原始正文摘录/, '知识检索上下文未约束投影引用文案')

    assert.match(assistantSource, /workspace-assistant-citation-projection/, 'assistant 引用卡缺少投影标签')
    assert.match(assistantSource, /视觉投影/, 'assistant 引用卡缺少视觉投影标签')
    assert.match(assistantSource, /转写投影/, 'assistant 引用卡缺少转写投影标签')

    assert.match(workerApiSource, /chunkKinds:/, '知识索引监控 API 未返回 chunkKinds')
    assert.match(workerPageSource, /多模态片段分布/, '知识索引监控页未展示多模态片段分布')
    assert.match(aiPromptsSource, /视觉模型/, 'AI 配置台未暴露 visionModel 字段')
    assert.match(aiPromptsSource, /visionModel: upstreamForm\.visionModel/, 'AI 配置保存未提交 visionModel')
  })
})
