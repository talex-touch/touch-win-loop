import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const COMMENTS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectComments.ts')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const RESOURCE_PREVIEW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourcePreviewTab.vue')
const COMMENTS_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDocumentCommentsPanel.vue')
const RECYCLE_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/recycle-from-markdown.post.ts')
const RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const IMAGE_EXTENSION_FILE = resolve(process.cwd(), 'app/components/editor/rich-text-editor-image-extension.ts')
const WORKSPACE_STREAM_API_FILE = resolve(process.cwd(), 'server/api/ai/workspace/stream.post.ts')

it('评论与文档 AI 仍走现有状态链路，并保持 markdown 评论展示在文档内部右侧', async () => {
  const [projectSource, commentsComposableSource, sidebarSource, previewSource, commentsPanelSource] = await Promise.all([
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(COMMENTS_COMPOSABLE_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(RESOURCE_PREVIEW_TAB_FILE, 'utf8'),
    readFile(COMMENTS_PANEL_FILE, 'utf8'),
  ])

  assert.match(projectSource, /useWorkspaceProjectComments\(/, '项目页未接入 markdown 评论状态 composable')
  assert.match(projectSource, /createMarkdownCommentThread,[\s\S]*replyMarkdownCommentThread,[\s\S]*resolveMarkdownCommentThread,[\s\S]*reopenMarkdownCommentThread,/, '项目页未复用评论线程操作能力')
  assert.match(commentsComposableSource, /async function createMarkdownCommentThread\(/, '评论 composable 缺少评论线程创建入口')
  assert.match(commentsComposableSource, /async function replyMarkdownCommentThread\(/, '评论 composable 缺少评论回复入口')
  assert.match(commentsComposableSource, /async function resolveMarkdownCommentThread\(/, '评论 composable 缺少评论解决入口')
  assert.match(commentsComposableSource, /async function reopenMarkdownCommentThread\(/, '评论 composable 缺少评论重开入口')
  assert.match(projectSource, /function applyDocumentAssistToMarkdown\(\)/, '项目页缺少文档 AI 结果写回入口')
  assert.match(projectSource, /const applied = workspaceMainPanelRef\.value\?\.applyMarkdownDocumentAssistResult\(/, '文档 AI 结果未先经过主编辑器确认写回')
  assert.match(projectSource, /if \(applied\) \{\s+statusLine\.value = 'AI 结果已应用到文档。'/, '文档 AI 写回成功后未更新状态提示')
  assert.doesNotMatch(projectSource, /onOpenCommentsPanel:\s*\(\)\s*=>\s*\{[\s\S]*rightSidebarView\.value = 'comments'/, 'markdown 评论仍在把全局右栏切到 comments')

  assert.match(sidebarSource, /showCommentTab\?: boolean/, '右栏缺少 markdown 评论 tab 开关')
  assert.match(sidebarSource, /const showCommentsView = computed\(\(\) => props\.showCommentTab && props\.sidebarView === 'comments'\)/, '右栏评论视图判断未受开关控制')
  assert.match(sidebarSource, /const showDocumentAssistView = computed\(\(\) => props\.sidebarView === 'ai' && props\.aiMode === 'document_assist'\)/, '右栏 document_assist 视图判断缺失')
  assert.match(sidebarSource, /v-if="markdownSidebarEnabled && props\.showCommentTab"/, '右栏 markdown 切换按钮未按评论 tab 开关收敛')
  assert.match(previewSource, /<WorkspaceDocumentCommentsPanel\b/, 'markdown 资源预览未接入文档内评论面板')
  assert.match(previewSource, /markdownCommentsCollapsed = ref\(false\)/, 'markdown 资源预览缺少评论面板收起状态')
  assert.match(previewSource, /syncMarkdownCommentThreadFocus\(threadId: string\)/, 'markdown 资源预览未统一正文与评论线程滚动')
  assert.match(commentsPanelSource, /@click="selectCommentThread\(thread\.id\)"/, '文档内评论卡片默认点击未接入正文定位')
  assert.match(commentsPanelSource, /<UnifiedAvatar/, '文档内评论面板未展示头像')
  assert.match(commentsPanelSource, /formatRelativeUpdatedAt/, '文档内评论面板未展示相对时间')
  assert.match(commentsPanelSource, /a-trigger trigger="hover" position="bottom"/, '文档内评论面板缺少 hover 精确时间提示')
  assert.match(commentsPanelSource, /data-testid="workspace-document-comment-draft-card"/, '文档内评论面板缺少内联草稿线程卡片')
  assert.match(commentsPanelSource, /v-model="commentReplyDraftMap\[thread\.id\]"/, '文档内评论面板未提供内联回复输入')
  assert.doesNotMatch(commentsPanelSource, /当前线程/, '文档内评论面板仍展示“当前线程”')
  assert.doesNotMatch(commentsPanelSource, /定位正文/, '文档内评论面板仍保留定位正文按钮')
})

it('文稿助手继续复用 document_assist 与 complete_context 链路', async () => {
  const [projectSource, sidebarSource, streamApiSource] = await Promise.all([
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_STREAM_API_FILE, 'utf8'),
  ])

  assert.match(projectSource, /if \(action === 'complete_context'\)\s+return '请补全当前选区缺失的上下文、衔接与背景信息，直接输出可替换原文的完整正文。'/, '项目页未为补全上下文提供独立提示词')
  assert.match(projectSource, /projectAssistantMode\.value = 'contextual'[\s\S]*aiMode\.value = 'document_assist'/, '文稿助手触发后未切回研发侧 contextual + document_assist 组合')
  assert.match(projectSource, /assistantPreset: 'document',[\s\S]*assistantLabel: '文稿助手'[\s\S]*previewMode: previewMode\.value[\s\S]*resourcePurpose: activePreviewResourcePurpose\.value/, '文稿助手请求上下文未透传新的轻量助手字段')
  assert.match(sidebarSource, /label: '文稿助手'/, '右栏未统一显示文稿助手名称')
  assert.match(sidebarSource, />\s*补全上下文\s*</, '右栏未保留补全上下文动作入口')
  assert.match(streamApiSource, /if \(normalized === 'complete_context'\)\s+return 'workspace_document_complete_context'/, 'workspace_document_complete_context 映射被破坏')
})

it('markdown 图片回收链路仍会校验引用计数并广播资源刷新事件', async () => {
  const [apiSource, resourceStoreSource] = await Promise.all([
    readFile(RECYCLE_API_FILE, 'utf8'),
    readFile(RESOURCE_STORE_FILE, 'utf8'),
  ])

  assert.match(apiSource, /countProjectMarkdownResourceImageReferences\(/, '图片回收 API 未校验 markdown 引用计数')
  assert.match(apiSource, /if \(referenceCount > 1\)/, '图片回收 API 未阻止多引用资源回收')
  assert.match(apiSource, /setResponseStatus\(event, 409\)/, '图片回收 API 未返回 409 冲突状态')
  assert.match(apiSource, /moveProjectResourceToRecycleBin\(/, '图片回收 API 未执行资源回收')
  assert.match(apiSource, /emitRealtimeEvent\(\{\s+type: 'project\.resources\.changed'/, '图片回收 API 未广播资源刷新事件')

  assert.match(resourceStoreSource, /export async function moveProjectResourceToRecycleBin\(/, '资源仓储缺少回收实现')
  assert.match(resourceStoreSource, /export async function countProjectMarkdownResourceImageReferences\(/, '资源仓储缺少图片引用计数实现')
  assert.match(resourceStoreSource, /collectImageReferencesFromMarkdown\(/, '资源仓储未复用 markdown 图片引用扫描')
})

it('项目资源创建 SQL 会显式对齐 summary / content / metadata 三列', async () => {
  const source = await readFile(RESOURCE_STORE_FILE, 'utf8')

  assert.match(source, /'library', 'binary', \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14::JSONB, 'active', \$15, \$15, \$16, \$16/, 'library 资源创建 SQL 未显式写入 summary\/content\/metadata')
  assert.match(source, /'upload', 'binary', NULL, \$5, \$6, \$7, \$8, \$9, \$10, \$11, '', \$12::JSONB, 'active', \$13, \$13, \$14, \$14/, 'upload 资源创建 SQL 未显式写入 summary\/content\/metadata')
  assert.match(source, /'collab', \$5, NULL, \$6, \$7, \$8, \$9, \$10, \$11, \$12, '', \$13::JSONB, 'active', \$14, \$14, \$15, \$15/, 'collab 资源创建 SQL 未显式写入 summary\/content\/metadata')
  assert.match(source, /\$5, 'binary', \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15::JSONB, 'active', \$16, \$16, \$17, \$17/, 'duplicate 资源创建 SQL 未显式写入 summary\/content\/metadata')
})

it('markdown 图片节点操作条优先回到项目内资源预览，回收动作仍走独立链路', async () => {
  const [projectSource, imageExtensionSource] = await Promise.all([
    readFile(PROJECT_PAGE_FILE, 'utf8'),
    readFile(IMAGE_EXTENSION_FILE, 'utf8'),
  ])

  assert.match(imageExtensionSource, /mode: 'open_resource'/, '图片节点动作类型未扩展项目内打开资源')
  assert.match(imageExtensionSource, /if \(resourceId\) \{\s+options\.onRequestImageAction\?\.\(\{\s+resourceId,\s+src,\s+mode: 'open_resource'/, '图片节点打开资源时未优先走项目内动作')
  assert.match(imageExtensionSource, /window\.open\(src, '_blank', 'noopener,noreferrer'\)/, '图片节点缺少无 resourceId 时的外链回退')
  assert.match(imageExtensionSource, /const resetWidthButton = createIconButton\('恢复原始宽度', 'width_normal'/, '图片节点缺少恢复原始宽度入口')
  assert.match(imageExtensionSource, /resetWidthButton\.hidden = !width/, '图片节点未按宽度状态控制恢复按钮显隐')
  assert.match(imageExtensionSource, /updateImageNodeAttributes\(editor, getPos, \{\s+width: null,\s+\}\)/, '图片节点恢复原始宽度未清空 width attrs')
  assert.match(imageExtensionSource, /if \(event\.key === 'Escape'\)/, '图片元数据编辑器未支持 Esc 取消')
  assert.match(imageExtensionSource, /if \(event\.key === 'Enter' && !event\.shiftKey\)/, '图片元数据编辑器未支持 Enter 保存')

  assert.match(projectSource, /if \(payload\.mode === 'open_resource'\) \{[\s\S]*await openProjectResourcePreview\(resourceId\)/, '项目页未处理图片资源项目内打开动作')
  assert.match(projectSource, /if \(payload\.mode !== 'delete_and_recycle'\)\s+return/, '项目页图片动作分支未保持回收动作隔离')
  assert.match(projectSource, /`\/projects\/\$\{projectId\}\/resources\/\$\{resourceId\}\/recycle-from-markdown`/, '项目页图片回收动作未走专用 API')
})
