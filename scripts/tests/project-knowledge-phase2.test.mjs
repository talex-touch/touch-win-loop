import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')
const PROJECT_CHAT_FILE = resolve(process.cwd(), 'server/api/ai/project-chat.post.ts')
const CANVAS_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/canvas/stream.post.ts')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const FINAL_REVIEW_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewSidebar.vue')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const DESIGN_AI_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/design/WorkspaceDesignDiagramCanvasAiPanel.vue')
const ASSISTANT_MESSAGE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAssistantMessageContent.vue')
const KNOWLEDGE_WORKER_STATE_FILE = resolve(process.cwd(), 'server/utils/project-knowledge-worker-state.ts')
const KNOWLEDGE_WORKER_PLUGIN_FILE = resolve(process.cwd(), 'server/plugins/project-knowledge-worker.ts')
const KNOWLEDGE_WORKER_API_FILE = resolve(process.cwd(), 'server/api/admin/resources/knowledge-worker.get.ts')
const KNOWLEDGE_WORKER_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/resource-knowledge-worker.vue')
const ADMIN_INDEX_FILE = resolve(process.cwd(), 'app/pages/admin/index.vue')
const ADMIN_OPERATIONS_STORE_FILE = resolve(process.cwd(), 'server/utils/admin-operations-store.ts')
const PROJECT_KNOWLEDGE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-knowledge-store.ts')
const KNOWLEDGE_ANALYTICS_STORE_FILE = resolve(process.cwd(), 'server/utils/project-knowledge-analytics-store.ts')

describe('project knowledge phase2', () => {
  it('aI 返回协议与 assistant metadata 已扩展 knowledge 结构', async () => {
    const [typesSource, workspaceSource, projectChatSource, canvasSource] = await Promise.all([
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(WORKSPACE_STREAM_FILE, 'utf8'),
      readFile(PROJECT_CHAT_FILE, 'utf8'),
      readFile(CANVAS_STREAM_FILE, 'utf8'),
    ])

    assert.match(typesSource, /export interface ProjectKnowledgeMessagePayload \{[\s\S]*citations: ProjectKnowledgeCitation\[\][\s\S]*warning: string[\s\S]*usedFallback: boolean[\s\S]*\}/, '共享类型缺少 knowledge 载荷结构')
    assert.match(typesSource, /export interface AiProjectChatResult \{[\s\S]*knowledge\?: ProjectKnowledgeMessagePayload \| null/, 'AiProjectChatResult 未扩展 knowledge')
    assert.match(typesSource, /export interface AiCanvasAssistResult \{[\s\S]*knowledge\?: ProjectKnowledgeMessagePayload \| null/, 'AiCanvasAssistResult 未扩展 knowledge')
    assert.match(typesSource, /export interface AiWorkspaceResult \{[\s\S]*knowledge\?: ProjectKnowledgeMessagePayload \| null/, 'AiWorkspaceResult 未扩展 knowledge')
    assert.match(workspaceSource, /knowledge: execution\.data\.data\.knowledge \|\| contextBundle\.knowledge/, 'workspace stream 未将 knowledge 写入 assistant metadata 或结果')
    assert.match(projectChatSource, /knowledge: execution\.data\.data\.knowledge \|\| contextBundle\.knowledge/, 'project chat 未将 knowledge 写入 assistant metadata 或结果')
    assert.match(canvasSource, /knowledge: execution\.data\.knowledge \|\| contextBundle\.knowledge/, 'canvas stream 未返回 knowledge')
  })

  it('统一引用渲染组件已接入右栏、终审和画布 AI 最近消息', async () => {
    const [assistantSource, sidebarSource, finalReviewSource, designSource, designAiPanelSource, pageSource] = await Promise.all([
      readFile(ASSISTANT_MESSAGE_FILE, 'utf8'),
      readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
      readFile(FINAL_REVIEW_SIDEBAR_FILE, 'utf8'),
      readFile(DESIGN_PANEL_FILE, 'utf8'),
      readFile(DESIGN_AI_PANEL_FILE, 'utf8'),
      readFile(PROJECT_PAGE_FILE, 'utf8'),
    ])

    assert.match(assistantSource, /资料引用\(\$\{visibleCitations\.value\.length\}\)/, '统一 assistant 消息组件缺少带数量的资料引用入口')
    assert.match(assistantSource, /const citationsExpanded = ref\(false\)/, '统一 assistant 消息组件未默认折叠资料引用')
    assert.match(assistantSource, /data-testid="workspace-assistant-citation-toggle"/, '统一 assistant 消息组件缺少资料引用折叠入口')
    assert.match(assistantSource, /chevron_right/, '统一 assistant 消息组件未使用默认朝右的 Chevron')
    assert.match(assistantSource, /workspace-assistant-citation-expand/, '统一 assistant 消息组件缺少资料引用动效')
    assert.match(assistantSource, /workspace-assistant-knowledge-warning/, '统一 assistant 消息组件缺少索引警告提示')
    assert.match(assistantSource, /workspace-assistant-citation-stale/, '统一 assistant 消息组件缺少 stale 标记')
    assert.match(sidebarSource, /<WorkspaceAssistantMessageContent/, '右栏未接入统一 assistant 消息组件')
    assert.match(finalReviewSource, /<WorkspaceAssistantMessageContent/, '终审侧栏未接入统一 assistant 消息组件')
    assert.match(designSource, /<WorkspaceDesignDiagramCanvasAiPanel[\s\S]*:messages="canvasAiMessages"[\s\S]*@open-resource="emit\('openResource', \$event\)"/, '画布 AI 父面板未挂载最近消息面板')
    assert.match(designAiPanelSource, /data-testid="workspace-canvas-ai-messages"/, '画布 AI 未展示最近消息列表')
    assert.match(designAiPanelSource, /<WorkspaceAssistantMessageContent[\s\S]*@open-resource="emit\('openResource', \$event\)"/, '画布 AI 最近消息未接入引用打开资源动作')
    assert.match(designSource, /workspace-design-canvas-ai:/, '画布 AI 最近消息未接入本地持久化 key')
    assert.match(designSource, /localStorage\.setItem/, '画布 AI 最近消息未持久化到本地存储')
    assert.match(pageSource, /@open-resource="openProjectResourcePreview"/, '项目页未接住工作台或画布引用打开资源事件')
    assert.match(pageSource, /<WorkspaceFinalReviewSidebar[\s\S]*@open-resource="openResourceFromFinalReview"/, '终审侧栏未接住引用打开资源事件')
    assert.match(pageSource, /knowledge: result\.knowledge/, '工作台本地流式 assistant 消息未保留 knowledge metadata')
  })

  it('知识索引 worker 已接入独立运行时状态、后台 API、监控页和后台总览', async () => {
    const [stateSource, pluginSource, apiSource, pageSource, adminIndexSource, operationsSource] = await Promise.all([
      readFile(KNOWLEDGE_WORKER_STATE_FILE, 'utf8'),
      readFile(KNOWLEDGE_WORKER_PLUGIN_FILE, 'utf8'),
      readFile(KNOWLEDGE_WORKER_API_FILE, 'utf8'),
      readFile(KNOWLEDGE_WORKER_PAGE_FILE, 'utf8'),
      readFile(ADMIN_INDEX_FILE, 'utf8'),
      readFile(ADMIN_OPERATIONS_STORE_FILE, 'utf8'),
    ])

    assert.match(stateSource, /export interface ProjectKnowledgeWorkerState \{[\s\S]*recentRuns: ProjectKnowledgeWorkerRunRecord\[\][\s\S]*\}/, '知识索引 worker 缺少独立运行时状态定义')
    assert.match(pluginSource, /getProjectKnowledgeWorkerState/, '知识索引 worker 未接入独立运行时状态')
    assert.match(pluginSource, /pushProjectKnowledgeWorkerRunRecord/, '知识索引 worker 未记录 recent runs')
    assert.match(apiSource, /当前用户无权查看知识索引监控/, '缺少知识索引 worker 后台 API 入口实现')
    assert.match(apiSource, /projectBacklog/, '知识索引 worker API 缺少项目 backlog 聚合')
    assert.match(apiSource, /recentFailures/, '知识索引 worker API 缺少最近失败列表')
    assert.match(pageSource, /知识索引 Worker 监控/, '后台页缺少知识索引 worker 标题')
    assert.match(pageSource, /Top Errors/, '后台页缺少错误聚合区块')
    assert.match(pageSource, /Recent Runs/, '后台页缺少最近运行区块')
    assert.match(pageSource, /任务列表/, '后台页缺少任务列表')
    assert.match(adminIndexSource, /\/admin\/resource-knowledge-worker/, 'admin 首页未暴露知识索引监控入口')
    assert.match(operationsSource, /label: '知识索引 Worker'/, 'admin operations 总览未接入知识索引 worker')
    assert.match(operationsSource, /detailPath: '\/admin\/resource-knowledge-worker'/, 'admin operations 总览未指向知识索引监控页')
  })

  it('项目知识索引 dashboard 已补齐真实 embedding provenance 与诊断聚合', async () => {
    const [typesSource, storeSource, analyticsStoreSource, pluginSource] = await Promise.all([
      readFile(DOMAIN_TYPES_FILE, 'utf8'),
      readFile(PROJECT_KNOWLEDGE_STORE_FILE, 'utf8'),
      readFile(KNOWLEDGE_ANALYTICS_STORE_FILE, 'utf8'),
      readFile(KNOWLEDGE_WORKER_PLUGIN_FILE, 'utf8'),
    ])

    assert.match(typesSource, /embeddingProvider\?: string/, '共享 Chunk metadata 缺少 embeddingProvider provenance')
    assert.match(typesSource, /embeddingModel\?: string/, '共享 Chunk metadata 缺少 embeddingModel provenance')
    assert.match(typesSource, /embeddingFallbackUsed\?: boolean/, '共享 Chunk metadata 缺少 embeddingFallbackUsed provenance')
    assert.match(typesSource, /healthState: ProjectKnowledgeIndexHealthState/, '共享 dashboard diagnostics 缺少 healthState')
    assert.match(typesSource, /visuals: ProjectKnowledgeIndexVisuals/, '共享 dashboard 缺少 visuals 聚合字段')
    assert.match(typesSource, /export interface ProjectKnowledgeSemanticLayoutSummary \{[\s\S]*averageSimilarity: number[\s\S]*maxSimilarity: number[\s\S]*\}/, '共享类型缺少语义空间 summary 结构')
    assert.match(typesSource, /densityScore: number/, '共享类型缺少 cluster densityScore')
    assert.match(typesSource, /topicLabel: string/, '共享类型缺少 cluster topicLabel')
    assert.match(typesSource, /similarityScore: number/, '共享类型缺少 cluster similarityScore')
    assert.match(storeSource, /buildProjectKnowledgeRuntimeStatus/, '项目知识索引 store 未聚合 runtime 诊断')
    assert.match(storeSource, /buildProjectKnowledgeWorkerStatus/, '项目知识索引 store 未聚合 worker 诊断')
    assert.match(storeSource, /healthState: 'missing_runtime'/, '项目知识索引 store 缺少 missing_runtime 判定')
    assert.match(storeSource, /healthState: 'worker_inactive'/, '项目知识索引 store 缺少 worker_inactive 判定')
    assert.match(storeSource, /healthState: 'queued_but_not_running'/, '项目知识索引 store 缺少 queued_but_not_running 判定')
    assert.match(storeSource, /healthState: 'fallback_only'/, '项目知识索引 store 缺少 fallback_only 判定')
    assert.match(storeSource, /healthState: 'healthy'/, '项目知识索引 store 缺少 healthy 判定')
    assert.match(storeSource, /starfieldNodes:/, '项目知识索引 store 未生成状态星图输入')
    assert.match(storeSource, /embeddingComposition:/, '项目知识索引 store 未生成 embedding 构成图输入')
    assert.match(analyticsStoreSource, /summary: emptySummary/, '语义空间 analytics store 缺少空 summary 返回')
    assert.match(analyticsStoreSource, /densityScore:/, '语义空间 analytics store 未生成 cluster densityScore')
    assert.match(analyticsStoreSource, /topicLabel:/, '语义空间 analytics store 未生成 cluster topicLabel')
    assert.match(analyticsStoreSource, /similarityScore:/, '语义空间 analytics store 未生成 cluster similarityScore')
    assert.match(analyticsStoreSource, /averageSimilarity:/, '语义空间 analytics store 未生成 summary averageSimilarity')
    assert.match(analyticsStoreSource, /maxSimilarity:/, '语义空间 analytics store 未生成 summary maxSimilarity')
    assert.match(pluginSource, /embeddingProvider: embeddingResult\.provider/, '知识索引 worker 未持久化 embedding provider')
    assert.match(pluginSource, /embeddingModel: embeddingResult\.model/, '知识索引 worker 未持久化 embedding model')
    assert.match(pluginSource, /embeddingFallbackUsed: embeddingResult\.fallbackUsed/, '知识索引 worker 未持久化 fallback 标记')
  })
})
