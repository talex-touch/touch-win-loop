import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_OUTLINE_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-outline.ts')
const DESIGN_DOCUMENT_UTIL_FILE = resolve(process.cwd(), 'shared/utils/design-document.ts')

async function loadWorkspaceOutlineUtils() {
  return import(pathToFileURL(WORKSPACE_OUTLINE_UTIL_FILE).href)
}

async function loadDesignDocumentUtils() {
  return import(pathToFileURL(DESIGN_DOCUMENT_UTIL_FILE).href)
}

it('markdown outline adapter 会按标题层级构建树并保留 anchor 定位信息', async () => {
  const {
    buildMarkdownWorkspaceOutlineNodes,
    flattenWorkspaceOutlineRows,
  } = await loadWorkspaceOutlineUtils()

  const nodes = buildMarkdownWorkspaceOutlineNodes({
    resourceId: 'doc-1',
    headings: [
      { text: '会议纪要', level: 1, anchorId: 'doc-1#meeting' },
      { text: '决策', level: 2, anchorId: 'doc-1#decision' },
      { text: '待办', level: 2, anchorId: 'doc-1#todo' },
    ],
  })

  assert.equal(nodes.length, 1)
  assert.equal(nodes[0]?.label, '会议纪要')
  assert.equal(nodes[0]?.locator.anchorId, 'doc-1#meeting')
  assert.equal(nodes[0]?.children.length, 2)
  assert.equal(nodes[0]?.children[0]?.label, '决策')
  assert.equal(nodes[0]?.children[0]?.locator.resourceId, 'doc-1')

  const rows = flattenWorkspaceOutlineRows([{
    id: 'current_content',
    title: '当前内容结构',
    surface: 'notes',
    loading: false,
    emptyText: '',
    items: nodes,
  }])
  assert.deepEqual(rows.map(row => row.node.label), ['会议纪要', '决策', '待办'])
})

it('design outline adapter 会输出 page > frame > element，并补一个顶层 Assets 分组', async () => {
  const {
    buildDesignWorkspaceOutlineNodes,
    parseWorkspaceOutlineDesignDocument,
  } = await loadWorkspaceOutlineUtils()
  const {
    createEmptyDesignDocument,
    serializeDesignDocument,
  } = await loadDesignDocumentUtils()

  const document = createEmptyDesignDocument({
    templateKey: 'device-showcase',
  })
  const pageId = document.pages[0].id
  document.pages[0].name = '登录页'
  document.pages[0].frameIds = ['frame-1']
  document.currentPageId = pageId
  document.frames = [
    {
      id: 'frame-1',
      pageId,
      kind: 'freeform',
      name: 'Hero Frame',
      x: 24,
      y: 40,
      width: 390,
      height: 844,
    },
  ]
  document.elements = [
    {
      id: 'group-1',
      frameId: 'frame-1',
      type: 'shape',
      shapeKind: 'rectangle',
      x: 32,
      y: 56,
      width: 240,
      height: 180,
      metadata: {
        name: '登录卡片',
      },
    },
    {
      id: 'element-1',
      frameId: 'frame-1',
      parentId: 'group-1',
      type: 'text',
      text: '立即开始',
      x: 48,
      y: 88,
      width: 120,
      height: 32,
    },
  ]
  document.assets = [
    {
      id: 'asset-1',
      type: 'image',
      name: '封面插图',
      mimeType: 'image/png',
      width: 1200,
      height: 800,
      src: 'data:image/png;base64,AAAA',
      metadata: {},
    },
  ]

  const parsed = parseWorkspaceOutlineDesignDocument(serializeDesignDocument(document))
  assert.ok(parsed, '设计稿大纲应能从 design document 字符串恢复')

  const nodes = buildDesignWorkspaceOutlineNodes({
    resourceId: 'design-1',
    document: parsed,
  })

  assert.equal(nodes.length, 2)
  assert.equal(nodes[0]?.kind, 'page')
  assert.equal(nodes[0]?.label, '登录页')
  assert.equal(nodes[0]?.children[0]?.kind, 'frame')
  assert.equal(nodes[0]?.children[0]?.children[0]?.label, '登录卡片')
  assert.equal(nodes[0]?.children[0]?.children[0]?.children[0]?.label, '立即开始')
  assert.equal(nodes[1]?.kind, 'asset_group')
  assert.equal(nodes[1]?.label, 'Assets')
  assert.equal(nodes[1]?.children[0]?.locator.assetId, 'asset-1')
})

it('workflow outline adapter 会输出 page/group/node 树，并把页面统计保留在 meta 中', async () => {
  const {
    buildWorkflowWorkspaceOutlineNodes,
  } = await loadWorkspaceOutlineUtils()

  const nodes = buildWorkflowWorkspaceOutlineNodes({
    resourceId: 'workflow-1',
    snapshot: {
      pages: [
        {
          id: 'page-1',
          name: '主流程',
          groupCount: 1,
          nodeCount: 3,
          edgeCount: 2,
          groups: [
            {
              id: 'group-1',
              label: '审批段',
              layoutKind: 'vertical',
              childNodeIds: ['node-1', 'node-2'],
              x: 0,
              y: 0,
            },
          ],
          nodes: [
            {
              id: 'node-1',
              label: '开始',
              shape: 'pill',
              x: 24,
              y: 24,
            },
            {
              id: 'node-2',
              label: '审批',
              shape: 'rounded',
              x: 24,
              y: 120,
            },
            {
              id: 'node-3',
              label: '归档',
              shape: 'rectangle',
              x: 320,
              y: 120,
            },
          ],
        },
      ],
    },
  })

  assert.equal(nodes.length, 1)
  assert.equal(nodes[0]?.kind, 'workflow_page')
  assert.match(nodes[0]?.meta || '', /1 组/)
  assert.match(nodes[0]?.meta || '', /3 节点/)
  assert.match(nodes[0]?.meta || '', /2 连线/)
  assert.equal(nodes[0]?.children[0]?.kind, 'workflow_group')
  assert.equal(nodes[0]?.children[0]?.children.map(item => item.label).join(','), '开始,审批')
  assert.equal(nodes[0]?.children[1]?.label, '归档')
  assert.equal(nodes[0]?.children[1]?.locator.workflowNodeId, 'node-3')
})

it('outline 深链工具会为标题复用原锚点，并为设计/流程节点生成可解析 hash', async () => {
  const {
    buildWorkspaceOutlineNavigationHash,
    parseWorkspaceOutlineNavigationHash,
  } = await loadWorkspaceOutlineUtils()

  const markdownHash = buildWorkspaceOutlineNavigationHash({
    id: 'doc-heading',
    kind: 'heading',
    label: '会议纪要',
    depth: 0,
    locator: {
      surface: 'notes',
      kind: 'heading',
      resourceId: 'doc-1',
      anchorId: 'doc-1#meeting',
    },
    children: [],
  })
  assert.equal(markdownHash, '#doc-1#meeting')

  const designHash = buildWorkspaceOutlineNavigationHash({
    id: 'design-frame:frame-1',
    kind: 'frame',
    label: 'Hero Frame',
    depth: 1,
    locator: {
      surface: 'design',
      kind: 'frame',
      resourceId: 'design-1',
      pageId: 'page-1',
      frameId: 'frame-1',
    },
    children: [],
  })
  assert.match(designHash, /^#wl-outline=/)

  const parsed = parseWorkspaceOutlineNavigationHash(designHash)
  assert.ok(parsed, '自定义 outline hash 应可恢复结构节点')
  assert.equal(parsed?.label, 'Hero Frame')
  assert.equal(parsed?.locator.surface, 'design')
  assert.equal(parsed?.locator.frameId, 'frame-1')
})
