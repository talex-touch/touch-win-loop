import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RICH_TEXT_EDITOR_FILE = resolve(process.cwd(), 'app/components/editor/RichTextEditor.vue')
const RESOURCE_PREVIEW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourcePreviewTab.vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const TAB_STRIP_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceTabStrip.vue')
const COMMENTS_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDocumentCommentsPanel.vue')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const SCHEMA_FILE = resolve(process.cwd(), 'shared/utils/collab-rich-text-schema.ts')
const NAVIGATION_UTIL_FILE = resolve(process.cwd(), 'app/utils/collab-markdown-navigation.ts')

it('协作文档编辑器已补齐代码块工具条、文内搜索、标题锚点与可收缩大纲入口', async () => {
  const source = await readFile(RICH_TEXT_EDITOR_FILE, 'utf8')

  assert.match(source, /resourceId\?: string \| null/, '编辑器未暴露 resourceId 透传入口')
  assert.match(source, /data-testid="rich-text-editor-search-input"/, '编辑器缺少文内搜索输入锚点')
  assert.match(source, /data-testid="rich-text-editor-code-block-toolbar"/, '编辑器缺少代码块工具条锚点')
  assert.match(source, /data-testid', 'rich-text-editor-heading-fold-toggle'/, '编辑器未渲染标题折叠按钮')
  assert.match(source, /data-testid="rich-text-editor-outline-collapse"/, '编辑器未提供大纲收缩按钮')
  assert.match(source, /class="rich-text-editor__outline-title"/, '编辑器未提供可点击的大纲标题收起入口')
  assert.match(source, /outlineCollapsed = ref\(false\)/, '编辑器缺少大纲收缩状态')
  assert.match(source, /copyHeadingAnchor\(/, '编辑器未实现标题锚点复制')
  assert.match(source, /scrollToHeadingAnchor\(/, '编辑器未实现标题锚点滚动落位')
  assert.match(source, /createSearchExtension\(/, '编辑器未接入文内搜索 decorations')
  assert.match(source, /createEditorChromeExtension\(/, '编辑器未接入标题折叠 decorations')
  assert.match(source, /focusOutlineSearchInput\(/, '编辑器未接管 Cmd\/Ctrl\+F 到文内搜索')
  assert.match(source, /copyActiveCodeBlockText\(/, '编辑器未实现代码块复制')
  assert.match(source, /updateActiveCodeBlockLanguage\(/, '编辑器未实现代码块语言切换')
  assert.match(source, /\.rich-text-editor__outline\s*\{[\s\S]*height:\s*100%/, '编辑器左侧大纲高度未撑满')
})

it('markdown 资源预览与主面板已补齐全宽 chrome 和满高文档容器', async () => {
  const [previewSource, mainPanelSource, chromeSource, tabStripSource] = await Promise.all([
    readFile(RESOURCE_PREVIEW_TAB_FILE, 'utf8'),
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(MAIN_PANEL_CHROME_FILE, 'utf8'),
    readFile(TAB_STRIP_FILE, 'utf8'),
  ])

  assert.match(previewSource, /workspace-resource-preview-tab__markdown bg-white flex h-full min-h-0 w-full/, '资源预览 markdown 容器未铺满宽度')
  assert.match(previewSource, /class="flex min-w-0 flex-1 min-h-0"/, '资源预览编辑区外层未补齐满高 flex 容器')
  assert.match(previewSource, /class="h-full min-h-0 w-full"/, '资源预览未让编辑器占满可用高度')
  assert.match(previewSource, /:resource-id="props\.previewResourceId"/, '资源预览页未向编辑器透传 resourceId')
  assert.match(previewSource, /<WorkspaceDocumentCommentsPanel\b/, '资源预览页未接入文档内右侧评论 panel')
  assert.match(previewSource, /:comment-draft-anchor="props\.commentDraftAnchor"/, '资源预览页未向文档评论 panel 透传评论草稿锚点')
  assert.match(previewSource, /:current-user-id="props\.currentUserId"/, '资源预览页未向文档评论 panel 透传当前用户 ID')
  assert.match(previewSource, /@create-comment-thread="emit\('markdownCreateCommentThread', \$event\)"/, '资源预览页未接收文档内评论创建事件')
  assert.match(previewSource, /scrollToHeadingAnchor\(anchorId: string\)/, '资源预览页未暴露标题锚点滚动能力')
  assert.match(mainPanelSource, /workspace-main-tab-strip-shell border-b border-slate-200 bg-white flex shrink-0 min-w-0 w-full items-center relative/, '主面板 tabs 外层未铺满宽度')
  assert.match(mainPanelSource, /scrollToMarkdownHeadingAnchor\(anchorId: string\)/, '主面板未透出 markdown 标题锚点滚动方法')
  assert.match(chromeSource, /<div class="flex w-full min-w-0 flex-col">/, '主面板 chrome 根节点未铺满宽度')
  assert.match(chromeSource, /class="text-\[11px\] text-slate-400 px-4 py-2 border-b border-slate-200 bg-white flex w-full min-w-0 items-center justify-between gap-3"/, 'breadcrumb 行未铺满宽度')
  assert.match(tabStripSource, /class="workspace-main-tab-strip border-b border-slate-200 bg-white flex shrink-0 w-full min-w-0 items-center relative"/, 'tabs 根节点未铺满宽度')
})

it('项目页已识别 markdown 标题深链并自动打开对应文档', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')

  assert.match(source, /findMarkdownResourceByAnchorHash\(/, '项目页未从 hash 解析 markdown 资源')
  assert.match(source, /resolveMarkdownAnchorNavigation\(/, '项目页未实现 markdown 标题深链导航')
  assert.match(source, /watch\(\(\) => route\.hash/, '项目页未监听路由 hash 变化')
  assert.match(source, /scrollToMarkdownHeadingAnchor/, '项目页未调用主面板标题锚点滚动能力')
  assert.match(source, /:show-comment-tab="!isMarkdownWorkspaceTabActive"/, '项目页未在 markdown 场景关闭全局右栏评论 tab')
})

it('共享 schema 与导航工具已补齐代码语言常量与标题锚点规则', async () => {
  const [schemaSource, navigationSource] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(NAVIGATION_UTIL_FILE, 'utf8'),
  ])

  assert.match(schemaSource, /export const COLLAB_MARKDOWN_CODE_LANGUAGES = \[/, '共享 schema 未导出代码语言常量')
  assert.match(schemaSource, /'plaintext',\s+'bash',\s+'json',\s+'javascript',\s+'typescript',\s+'html',\s+'css',\s+'markdown',\s+'sql'/, '共享 schema 的代码语言集不完整')
  assert.match(navigationSource, /buildCollabMarkdownHeadingAnchorId\(/, '导航工具缺少标题 anchor 构造器')
  assert.match(navigationSource, /buildCollabMarkdownHeadingSectionRanges\(/, '导航工具缺少章节范围计算')
  assert.match(navigationSource, /resolveCollabMarkdownCollapsedHeadingAncestors\(/, '导航工具缺少折叠祖先解析')
})

it('文档内评论面板已切成卡片式交互并展示头像与相对时间', async () => {
  const source = await readFile(COMMENTS_PANEL_FILE, 'utf8')

  assert.match(source, /<UnifiedAvatar/, '文档内评论面板未接入统一头像组件')
  assert.match(source, /formatRelativeUpdatedAt/, '文档内评论面板未接入相对时间格式化')
  assert.match(source, /formatPreciseDateTime/, '文档内评论面板未接入精确时间格式化')
  assert.match(source, /data-testid="workspace-document-comment-card"/, '文档内评论面板缺少评论卡片锚点')
  assert.match(source, /data-testid="workspace-document-comments-filter-trigger"/, '文档内评论面板缺少评论筛选触发器')
  assert.match(source, /filter_list/, '文档内评论面板缺少筛选 icon')
  assert.match(source, /const COMMENT_FILTER_OPTIONS: Array<\{ key: WorkspaceDocumentCommentFilterKey, label: string \}> = \[/, '文档内评论面板未声明评论筛选项')
  assert.match(source, /selectedCommentFilters = ref<WorkspaceDocumentCommentFilterKey\[]>\(\['all'\]\)/, '文档内评论面板未声明评论筛选状态')
  assert.match(source, /if \(filterKey === 'all'\) \{[\s\S]*selectedCommentFilters\.value = \['all'\]/, '文档内评论面板未实现“所有”筛选重置逻辑')
  assert.match(source, /if \(filterKey === 'resolved'\)\s+return thread\.status === 'resolved'/, '文档内评论面板未实现“已解决”筛选')
  assert.match(source, /if \(filterKey === 'mine'\)\s+return Boolean\(currentUserId\) && normalizeString\(thread\.createdByUserId\) === currentUserId/, '文档内评论面板未实现“我发出的”筛选')
  assert.doesNotMatch(source, /点击评论卡片可跳转到对应内容，悬停时间可查看精确时间。/, '文档内评论面板仍保留顶部说明提示')
  assert.doesNotMatch(source, /aria-hidden="true">place<\/span>/, '文档内评论卡片仍保留锚点位置行')
  assert.match(source, /@click="selectCommentThread\(thread\.id\)"/, '评论卡片默认点击未接入正文定位')
  assert.match(source, /check_circle/, '评论卡片缺少 icon 化解决操作')
  assert.doesNotMatch(source, /当前线程/, '文档内评论面板仍展示“当前线程”文案')
  assert.doesNotMatch(source, /定位正文/, '文档内评论面板仍保留额外的定位正文按钮')
})
