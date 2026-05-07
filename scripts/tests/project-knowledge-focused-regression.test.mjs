import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const PROJECT_RESOURCE_UPLOAD_FILE = resolve(process.cwd(), 'server/services/project-resource-upload.ts')
const PROJECT_RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const PROJECT_DOCUMENT_PREVIEW_WORKER_FILE = resolve(process.cwd(), 'server/plugins/project-document-preview-worker.ts')
const PROJECT_INDEX_STATUS_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/knowledge/index-status.get.ts')
const RESOURCE_INDEX_STATUS_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/knowledge/index-status.get.ts')
const PROJECT_KNOWLEDGE_CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const WORKSPACE_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const ASSISTANT_MESSAGE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAssistantMessageContent.vue')

describe('project knowledge focused regression', () => {
  it('上传与资源变更会触发知识索引，并暴露项目级与单资源级状态读口', async () => {
    const [
      uploadSource,
      resourceStoreSource,
      previewWorkerSource,
      projectIndexApiSource,
      resourceIndexApiSource,
    ] = await Promise.all([
      readFile(PROJECT_RESOURCE_UPLOAD_FILE, 'utf8'),
      readFile(PROJECT_RESOURCE_STORE_FILE, 'utf8'),
      readFile(PROJECT_DOCUMENT_PREVIEW_WORKER_FILE, 'utf8'),
      readFile(PROJECT_INDEX_STATUS_API_FILE, 'utf8'),
      readFile(RESOURCE_INDEX_STATUS_API_FILE, 'utf8'),
    ])

    assert.match(
      uploadSource,
      /await markProjectKnowledgeSourceStale\(db,\s*\{[\s\S]*projectId,[\s\S]*resourceId:\s*resource\.id,[\s\S]*autoEnqueue:\s*true[\s\S]*\}\)/,
      '上传完成后未把资源标为 stale 并自动重新入队知识索引',
    )
    assert.match(
      resourceStoreSource,
      /async function syncMarkdownResourceProjection\([\s\S]*await markProjectKnowledgeSourceStale\(db,\s*\{[\s\S]*resourceId:\s*input\.resourceId,[\s\S]*autoEnqueue:\s*true[\s\S]*\}\)/,
      'Markdown 投影更新后未把资源标为 stale 并自动重新入队知识索引',
    )
    assert.match(
      resourceStoreSource,
      /export async function createProjectUploadedResource\([\s\S]*await scheduleProjectKnowledgeSourceUpsert\(db,\s*\{[\s\S]*resourceId:\s*resource\.id[\s\S]*\}\)/,
      '上传资源创建后未进入知识索引 upsert 队列',
    )
    assert.match(
      resourceStoreSource,
      /export async function createProjectCollabResource\([\s\S]*await scheduleProjectKnowledgeSourceUpsert\(db,\s*\{[\s\S]*resourceId[\s\S]*\}\)/,
      '协作文档资源创建后未进入知识索引 upsert 队列',
    )
    assert.match(
      resourceStoreSource,
      /export async function duplicateProjectResource\([\s\S]*await scheduleProjectKnowledgeSourceUpsert\(db,\s*\{[\s\S]*resourceId:\s*duplicated\.id[\s\S]*\}\)/,
      '资源复制后未进入知识索引 upsert 队列',
    )
    assert.match(
      previewWorkerSource,
      /await markProjectKnowledgeSourceStale\(db,\s*\{[\s\S]*projectId:\s*context\.document\.projectId,[\s\S]*resourceId:\s*context\.document\.projectResourceId,[\s\S]*autoEnqueue:\s*true[\s\S]*\}\)/,
      '文档预览更新完成后未把资源标为 stale 并自动重新入队知识索引',
    )
    assert.match(projectIndexApiSource, /buildProjectKnowledgeIndexDashboard/, '项目级索引状态接口未复用 dashboard 聚合')
    assert.match(resourceIndexApiSource, /getProjectKnowledgeSourceStatusByResourceId/, '单资源索引状态接口未复用 source 状态查询')
  })

  it('knowledge context 会区分 ready 命中与 incomplete/fallback 路径', async () => {
    const source = await readFile(PROJECT_KNOWLEDGE_CONTEXT_FILE, 'utf8')

    assert.match(
      source,
      /if \(incompleteCount >= Math\.ceil\(input\.relatedResources\.length \/ 2\)\)\s+return '索引未完成，结果可能不完整。'/,
      'knowledge context 未在相关资源多数未 ready 时给出明确 warning',
    )
    assert.match(
      source,
      /if \(selectedHits\.length === 0\) \{[\s\S]*暂无 ready 索引命中，已回退到项目资源摘要。[\s\S]*citations:\s*\[\],[\s\S]*warning,[\s\S]*usedFallback:\s*true/,
      'knowledge context 缺少无 ready 命中时的 fallback 路径',
    )
    assert.match(source, /const citations = selectedHits\.map\(buildCitation\)/, 'knowledge context 未把命中结果转换为 citations')
    assert.match(
      source,
      /return \{[\s\S]*summaryText:\s*lines\.join\('\\n\\n'\),[\s\S]*citations,[\s\S]*warning,[\s\S]*usedFallback:\s*(?:false|degradedResultUsed)[\s\S]*\}/,
      'knowledge context 缺少 ready 命中时的 citations + warning + degraded 标记返回结构',
    )
    assert.match(
      source,
      /引用规则：回答引用以上资料时，请直接保留对应方括号标签，不要编造新的 citation。/,
      'knowledge context 未约束回答必须保留 citation 标签',
    )
    assert.match(
      source,
      /如果命中视觉投影、OCR 投影或会议转写投影，请明确说明这是投影结果，不要表述为原始正文摘录。/,
      'knowledge context 未约束投影命中的说明方式',
    )
  })

  it('workspace AI 流式 done 事件会把 citations\/warning 写入 assistant metadata 并回传结果', async () => {
    const [workspaceStreamSource, projectPageSource] = await Promise.all([
      readFile(WORKSPACE_STREAM_FILE, 'utf8'),
      readFile(PROJECT_PAGE_FILE, 'utf8'),
    ])

    assert.match(
      workspaceStreamSource,
      /const contextBundle = await withClient\(event, async \(db\) => \{[\s\S]*knowledge:\s*\{[\s\S]*citations:\s*knowledgeContext\.citations,[\s\S]*warning:\s*knowledgeContext\.warning,[\s\S]*usedFallback:\s*knowledgeContext\.usedFallback,[\s\S]*\}/,
      'workspace stream 未把知识检索结果整理成标准 knowledge payload',
    )
    assert.match(
      workspaceStreamSource,
      /await appendAiChatMessage\(db,\s*\{[\s\S]*role:\s*'assistant'[\s\S]*knowledge:\s*execution\.data\.data\.knowledge \|\| contextBundle\.knowledge/,
      'workspace stream 未把 knowledge 写入 assistant 持久化 metadata',
    )
    assert.match(
      workspaceStreamSource,
      /const result: AiWorkspaceResult = \{[\s\S]*knowledge:\s*execution\.data\.data\.knowledge \|\| contextBundle\.knowledge/,
      'workspace stream done 结果未回传 knowledge',
    )
    assert.match(
      projectPageSource,
      /if \(eventType === 'done'\) \{[\s\S]*assistantMetadata = \{[\s\S]*result\.knowledge[\s\S]*\{ knowledge: result\.knowledge \}[^}]*\}[\s\S]*renderStreamMessages\(\)/,
      '项目页未在 done 事件把 knowledge 写回当前流式 assistant 消息',
    )
    assert.match(
      projectPageSource,
      /createWorkspaceLocalChatMessage\(\{[\s\S]*role: 'assistant'[\s\S]*streamState: 'streaming',[\s\S]*metadata: assistantMetadata,[\s\S]*\}\)/,
      '项目页流式 assistant 本地消息未携带 knowledge metadata',
    )
    assert.match(
      projectPageSource,
      /chatMessages\.value = finalizeWorkspaceLocalChatMessages\(chatMessages\.value, localRequestId\)/,
      '项目页完成流式回复后未保留 knowledge metadata 并清理 localOnly 状态',
    )
  })

  it('工作区 AI 侧栏会在保留 markdown\/toolcall 风格的同时渲染 citation 与 warning', async () => {
    const [assistantSource, sidebarSource] = await Promise.all([
      readFile(ASSISTANT_MESSAGE_FILE, 'utf8'),
      readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    ])

    assert.match(assistantSource, /<WorkspaceChatMarkdown :content="props\.message\.content" \/>/, 'assistant 内容未保持既有 markdown 渲染')
    assert.match(assistantSource, /workspace-assistant-knowledge-warning/, 'assistant 消息缺少索引 warning 渲染')
    assert.match(assistantSource, /const citationsExpanded = ref\(false\)/, 'assistant 消息未默认折叠资料引用')
    assert.match(assistantSource, /资料引用\(\$\{visibleCitations\.value\.length\}\)/, 'assistant 消息缺少资料引用计数入口')
    assert.match(assistantSource, /workspace-assistant-citation-toggle/, 'assistant 消息缺少资料引用折叠按钮')
    assert.match(assistantSource, /chevron_right/, 'assistant 消息资料引用折叠箭头未默认朝右')
    assert.match(assistantSource, /workspace-assistant-citation-expand/, 'assistant 消息资料引用缺少展开收起动效')
    assert.match(assistantSource, /workspace-assistant-citation-card/, 'assistant 消息缺少 citation 卡片渲染')
    assert.match(assistantSource, /workspace-assistant-citation-projection/, 'assistant 消息缺少 citation 投影标签')
    assert.match(assistantSource, /workspace-assistant-citation-stale/, 'assistant 消息缺少 stale 标记')
    assert.match(assistantSource, /workspace-assistant-message-content__fallback-badge/, 'assistant 消息缺少 fallback 标识')
    assert.match(sidebarSource, /workspace-chat-system-message/, '右栏未保留 progress\/tool 内联消息渲染')
    assert.match(
      sidebarSource,
      /<WorkspaceAssistantMessageContent[\s\S]*:message="entry\.message"[\s\S]*@open-resource="emit\('openResource', \$event\)"/,
      '右栏 assistant 气泡未接入统一 knowledge 渲染组件',
    )
  })
})
