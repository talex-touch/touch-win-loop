import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_LEFT_RAIL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftRail.vue')

it('左栏始终保留 WorkspaceLeftRail，并通过 collapsed 控制右侧 panel', async () => {
  const source = await readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8')
  const railSource = await readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8')

  assert.match(source, /collapsed\?: boolean/, 'WorkspaceLeftSidebar 缺少 collapsed prop')
  assert.match(source, /tabSpacingPreset\?: WorkspaceTabSpacingPreset \| ''/, 'WorkspaceLeftSidebar 缺少标签边距预设入参')
  assert.match(source, /'update:collapsed': \[value: boolean\]/, 'WorkspaceLeftSidebar 缺少折叠态更新事件')
  assert.match(source, /<WorkspaceLeftRail/, 'WorkspaceLeftSidebar 缺少常驻 left rail')
  assert.match(source, /:collapsed="props\.collapsed"/, 'WorkspaceLeftSidebar 未向 left rail 透传折叠态')
  assert.match(source, /<Transition :name="panelContentTransitionName" mode="out-in">/, 'WorkspaceLeftSidebar 缺少按方向切换的左侧模块内容过渡')
  assert.match(source, /panelContentTransitionKey/, 'WorkspaceLeftSidebar 缺少左侧模块内容切换 key')
  assert.match(source, /panelContentTransitionName = ref<'workspace-left-panel-content-forward' \| 'workspace-left-panel-content-backward'>/, 'WorkspaceLeftSidebar 缺少左侧模块内容切换方向状态')
  assert.match(source, /syncPanelTransitionDirection\(moduleId\)/, 'WorkspaceLeftSidebar 未在模块切换时同步动画方向')
  assert.match(source, /workspace-left-panel-content-forward-enter-from/, 'WorkspaceLeftSidebar 缺少左侧模块正向切换动画')
  assert.match(source, /workspace-left-panel-content-backward-enter-from/, 'WorkspaceLeftSidebar 缺少左侧模块反向切换动画')
  assert.match(source, /:class="\{ 'workspace-left-panel--hidden': props\.collapsed \}"/, 'WorkspaceLeftSidebar 未改成 class 驱动的左侧 panel 折叠动画')
  assert.match(source, /workspace-left-dock--collapsed/, 'WorkspaceLeftSidebar 缺少折叠宽度样式')
  assert.match(source, /flex-basis: 56px;/, 'WorkspaceLeftSidebar 缺少外层 dock 收缩过渡宽度')
  assert.match(source, /workspace-left-dock--compact/, 'WorkspaceLeftSidebar 未为紧凑标签边距提供列表压缩样式')
  assert.match(source, /workspace-left-panel--hidden/, 'WorkspaceLeftSidebar 缺少左侧 panel 收起状态类')
  assert.match(source, /width: 0;/, 'WorkspaceLeftSidebar 缺少左侧 panel 宽度收起动画')
  assert.match(source, /opacity: 0;/, 'WorkspaceLeftSidebar 缺少左侧 panel 透明度收起动画')
  assert.match(source, /transform: translateX\(-10px\);/, 'WorkspaceLeftSidebar 缺少左侧 panel 位移动画')
  assert.match(railSource, /workspace-left-rail__item--active': !collapsed && item\.id === activeId/, 'left rail 在折叠态仍显示顶部模块选中标识')
})

it('资源管理器删除独立系统资料库分组，只保留导入入口', async () => {
  const source = await readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8')

  assert.doesNotMatch(source, /type ResourceSectionId = 'projectResources' \| 'linkedContestResources' \| 'systemLibrary' \| 'outline'/, '系统资料库 section id 仍保留在左栏状态中')
  assert.doesNotMatch(source, /sectionExpanded\.systemLibrary/, '系统资料库 section 展开状态仍保留')
  assert.doesNotMatch(source, /visibleSystemLibraryResources/, '系统资料库独立展示列表仍保留')
  assert.match(source, /从系统资料库导入/, '资源添加菜单未保留系统资料库导入入口')
  assert.match(source, /title="从系统资料库导入"/, '系统资料库导入弹窗标题未更新')
})

it('项目资料区改为 markdown 文档图片虚拟树，不再截断前 10 项', async () => {
  const source = await readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /interface ProjectResourceTreeItem \{\s+resource: Resource\s+children: Resource\[\]\s+\}/, '左栏未定义资源树节点结构')
  assert.match(source, /const visibleResources = computed\(\(\) => props\.selectedResources\)/, '左栏仍未使用完整资源列表')
  assert.doesNotMatch(source, /selectedResources\.slice\(0,\s*10\)/, '左栏仍然截断前 10 个资源')
  assert.match(source, /function resolveEmbeddedMarkdownResourceId\(resource: Resource\): string \{/, '左栏缺少 markdown 嵌入资源归属解析')
  assert.match(source, /function isUploadedImageResource\(resource: Resource\): boolean \{/, '左栏缺少上传图片资源识别')
  assert.match(source, /const projectResourceTreeItems = computed<ProjectResourceTreeItem\[\]>\(\(\) => \{/, '左栏未构建项目资源虚拟树')
  assert.match(source, /if \(!embeddedMarkdownResourceId \|\| !markdownResourceIds\.has\(embeddedMarkdownResourceId\)\)\s+continue/, 'orphan 图片未保留顶层回退逻辑')
  assert.match(source, /watch\(projectResourceTreeItems, \(items\) => \{/, '左栏未清理失效的文档展开状态')
  assert.match(source, /v-for="treeItem in projectResourceTreeItems"/, '左栏模板未按树节点渲染项目资料')
  assert.match(source, /v-for="child in treeItem\.children"/, '左栏模板未渲染文档图片子节点')
  assert.match(source, /workspace-resource-tree-group__children/, '左栏未为文档图片子树提供容器')
  assert.match(source, /workspace-tree-item__expander/, '左栏未提供文档图片展开按钮')
})

it('左栏结构大纲不再用本地推断结果充当真实大纲', async () => {
  const source = await readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8')

  assert.doesNotMatch(source, /const fallbackOutlineItems = computed<OutlineItem\[\]>\(\(\) => \{/, '左栏仍保留本地推断大纲 fallback')
  assert.doesNotMatch(source, /extractResourceOutlineChildren/, '左栏仍在从资源正文推断假大纲')
  assert.match(source, /return uploadItems/, '左栏在无后端大纲时未回退到仅展示真实上传任务')
})

it('left rail 图标收窄并改成轻量 popover 名称提示', async () => {
  const source = await readFile(WORKSPACE_LEFT_RAIL_FILE, 'utf8')

  assert.match(source, /font-variation-settings:\s*'FILL' 0,\s*'wght' 320,\s*'opsz' 24/, 'left rail 图标未改成轻字重')
  assert.match(source, /workspace-left-rail__popover/, 'left rail 缺少轻量 popover 名称层')
  assert.doesNotMatch(source, /workspace-left-rail__item--active::before/, 'left rail 仍保留旧的粗高亮指示条')
  assert.doesNotMatch(source, /record_voice_over/, 'left rail 底部仍保留模拟答辩按钮')
})
