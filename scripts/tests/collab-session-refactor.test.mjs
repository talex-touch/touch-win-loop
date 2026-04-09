import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const USE_COLLAB_SESSION_FILE = resolve(process.cwd(), 'app/composables/useCollabSession.ts')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const RICH_TEXT_EDITOR_FILE = resolve(process.cwd(), 'app/components/editor/RichTextEditor.vue')

it('项目页使用 useCollabSession 统一协作状态机', async () => {
  const source = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const collabSessionSource = await readFile(USE_COLLAB_SESSION_FILE, 'utf8')
  assert.match(source, /useCollabSession\(/, '项目页未接入 useCollabSession')
  assert.match(source, /collabSession\.handleRealtimeEnvelope\(message\)/, '项目页未复用协作实时消息处理')
  assert.match(source, /collabSession\.activateRoom\(\)/, '项目页未复用协作会话激活逻辑')
  assert.match(source, /const collabMarkdownDoc = collabSession\.markdownDoc/, '项目页未透传 markdown Y.Doc')
  assert.match(source, /const collabMarkdownAwareness = collabSession\.markdownAwareness/, '项目页未透传 markdown Awareness')
  assert.match(source, /:collab-markdown-doc="collabMarkdownDoc"/, '主面板未接入 markdown 文档对象')
  assert.match(source, /:collab-markdown-awareness="collabMarkdownAwareness"/, '主面板未接入 markdown Awareness')
  assert.doesNotMatch(source, /update:collab-markdown-value/, '项目页仍保留旧的 Markdown 文本双向绑定')
  assert.doesNotMatch(source, /function startCollabSnapshotPollTimer/, '项目页仍保留旧的页面级轮询实现')

  assert.match(collabSessionSource, /const markdownDoc = computed\(\(\) => \{/, 'useCollabSession 未暴露 markdownDoc 计算属性')
  assert.match(collabSessionSource, /const markdownAwareness = computed\(\(\) => \{/, 'useCollabSession 未暴露 markdown Awareness 计算属性')
  assert.match(collabSessionSource, /ensureMarkdownCollabDocShape\(doc\)/, 'useCollabSession 未对 markdown 文档执行结构化迁移')
  assert.match(collabSessionSource, /syncMarkdownMirrorFromRichText\(doc\)/, 'useCollabSession 未维护 markdown 镜像同步')
})

it('markdown 协作文档已切换为公共富文本编辑器，旧双栏预览已移除', async () => {
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const editorSource = await readFile(RICH_TEXT_EDITOR_FILE, 'utf8')

  assert.match(panelSource, /<RichTextEditor[\s\S]*:doc="collabMarkdownDoc"/, '主面板未接入公共富文本编辑器')
  assert.match(panelSource, /:awareness="collabMarkdownAwareness"/, '主面板未向富文本编辑器传入 Awareness')
  assert.match(panelSource, /:current-user="collabCurrentUser"/, '主面板未向富文本编辑器传入当前用户信息')
  assert.match(panelSource, /@selection-change="onMarkdownSelectionChange"/, '主面板未接收 markdown 本地选区事件')
  assert.match(panelSource, /@remote-presence-change="onMarkdownRemotePresenceChange"/, '主面板未接收 markdown 远端选区事件')
  assert.doesNotMatch(panelSource, /Markdown 渲染预览/, '主面板仍保留旧的 Markdown 预览区')
  assert.doesNotMatch(panelSource, /workspace-markdown-preview__body/, '主面板仍保留旧的 Markdown 样式残留')
  assert.match(panelSource, /<CollabPresenceAvatarStack\s+:users="collabPresenceUsers"\s*\/>/, 'markdown 头部未接入头像栈')
  assert.match(panelSource, /<CollabPresenceDock\s+:users="collabPresenceUsers"\s*\/>/, 'markdown 底部成员栏未接入 Dock 组件')

  assert.match(editorSource, /createCollabMarkdownBaseExtensions\(\)/, '公共编辑器未复用共享 markdown schema 扩展')
  assert.match(editorSource, /Collaboration\.configure\(\{\s+document: doc,\s+field: 'prosemirror',/, '公共编辑器未接入 Yjs 协作片段')
  assert.match(editorSource, /yCursorPlugin\(awareness, \{/, '公共编辑器未接入 yCursorPlugin')
  assert.match(editorSource, /label: '正文'/, '公共编辑器缺少正文工具按钮')
  assert.match(editorSource, /label: `H\$\{level\}`/, '公共编辑器缺少标题工具按钮')
})

it('画布已升级为真实引擎组件并移除 JSON 文本输入', async () => {
  const source = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  assert.match(source, /<WorkspaceTldrawCanvas[\s\S]*@update:model-value="onCollabDrawModelUpdate"/, '画布未接入 WorkspaceTldrawCanvas 组件')
  assert.doesNotMatch(source, /请输入画布节点 JSON（数组）/, '画布仍暴露 JSON 文本输入入口')
})
