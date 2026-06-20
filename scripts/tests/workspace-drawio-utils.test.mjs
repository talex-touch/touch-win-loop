import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_DRAWIO_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-drawio.ts')
const SCENE_DOCUMENT_UTIL_FILE = resolve(process.cwd(), 'shared/utils/scene-document.ts')

async function loadWorkspaceDrawioUtils() {
  return import(pathToFileURL(WORKSPACE_DRAWIO_UTIL_FILE).href)
}

async function loadSceneDocumentUtils() {
  return import(pathToFileURL(SCENE_DOCUMENT_UTIL_FILE).href)
}

it('draw.io embed URL 固定为 embed 协议并开启最小化 UI', async () => {
  const {
    buildDrawioEmbedUrl,
    resolveDrawioEmbedBaseUrl,
    resolveDrawioOrigin,
  } = await loadWorkspaceDrawioUtils()

  const url = new URL(buildDrawioEmbedUrl())

  assert.equal(resolveDrawioEmbedBaseUrl(), 'https://embed.diagrams.net')
  assert.equal(resolveDrawioOrigin(), 'https://embed.diagrams.net')
  assert.equal(url.origin, 'https://embed.diagrams.net')
  assert.equal(url.searchParams.get('embed'), '1')
  assert.equal(url.searchParams.get('proto'), 'json')
  assert.equal(url.searchParams.get('ui'), 'min')
  assert.equal(url.searchParams.get('stealth'), '1')
})

it('draw.io embed URL 支持通过公开宿主配置覆盖，并稳定解析 origin', async () => {
  const {
    buildDrawioEmbedUrl,
    resolveDrawioEmbedBaseUrl,
    resolveDrawioOrigin,
  } = await loadWorkspaceDrawioUtils()

  const baseUrl = 'https://drawio.local/embed-app/index.html?foo=1#section'
  const url = new URL(buildDrawioEmbedUrl(baseUrl))

  assert.equal(resolveDrawioEmbedBaseUrl(baseUrl), 'https://drawio.local/embed-app/index.html')
  assert.equal(resolveDrawioOrigin(baseUrl), 'https://drawio.local')
  assert.equal(url.origin, 'https://drawio.local')
  assert.equal(url.pathname, '/embed-app/index.html')
  assert.equal(url.searchParams.get('embed'), '1')
  assert.equal(url.searchParams.get('proto'), 'json')
})

it('draw.io XML 可在协作文档里序列化并原样回读', async () => {
  const {
    createDefaultDrawioXml,
    extractDrawioXmlFromCollabValue,
    resolveDrawioCollabValue,
    serializeDrawioCollabValue,
  } = await loadWorkspaceDrawioUtils()

  const xml = createDefaultDrawioXml('订单流程')
  const serialized = serializeDrawioCollabValue(xml)
  const restored = extractDrawioXmlFromCollabValue(serialized, '订单流程')
  const resolved = resolveDrawioCollabValue(serialized, '订单流程')

  assert.match(xml, /<mxfile/)
  assert.match(xml, /name="订单流程"/)
  assert.equal(restored, xml)
  assert.equal(resolved.status, 'ready')
  assert.equal(resolved.xml, xml)
})

it('旧版 scene document 会迁移为可编辑的 draw.io XML 节点和连线', async () => {
  const {
    resolveDrawioCollabValue,
  } = await loadWorkspaceDrawioUtils()
  const {
    createEmptySceneDocument,
    serializeSceneDocument,
  } = await loadSceneDocumentUtils()

  const scene = createEmptySceneDocument({
    drawMode: 'diagram',
    sourceType: 'manual',
  })

  scene.sceneModel.nodes = [
    {
      id: 'start',
      label: '开始',
      x: 80,
      y: 120,
      width: 180,
      height: 72,
      shape: 'pill',
    },
    {
      id: 'review',
      label: '评审',
      x: 360,
      y: 120,
      width: 180,
      height: 72,
      shape: 'rounded',
    },
  ]
  scene.sceneModel.edges = [
    {
      id: 'edge-1',
      source: 'start',
      target: 'review',
      label: '提交',
      style: 'solid',
    },
  ]

  const resolved = resolveDrawioCollabValue(serializeSceneDocument(scene), '迁移流程')
  const xml = resolved.xml

  assert.equal(resolved.status, 'ready')
  assert.match(xml, /<mxfile/)
  assert.match(xml, /value="开始"/)
  assert.match(xml, /value="评审"/)
  assert.match(xml, /value="提交"/)
  assert.match(xml, /source="start"/)
  assert.match(xml, /target="review"/)
})

it('空的新 draw payload 会回落到默认 draw.io 画布，而不是被误判为 legacy', async () => {
  const {
    resolveDrawioCollabValue,
  } = await loadWorkspaceDrawioUtils()
  const {
    createEmptySceneDocument,
    serializeSceneDocument,
  } = await loadSceneDocumentUtils()

  const emptyScene = createEmptySceneDocument({
    drawMode: 'diagram',
    sourceType: 'manual',
  })

  const emptyObjectResolved = resolveDrawioCollabValue('{}', '空对象流程')
  const emptyArrayResolved = resolveDrawioCollabValue('[]', '空数组流程')
  const emptySceneResolved = resolveDrawioCollabValue(serializeSceneDocument(emptyScene), '空白流程')

  assert.equal(emptyObjectResolved.status, 'ready')
  assert.match(emptyObjectResolved.xml, /<mxfile/)
  assert.equal(emptyArrayResolved.status, 'ready')
  assert.match(emptyArrayResolved.xml, /<mxfile/)
  assert.equal(emptySceneResolved.status, 'ready')
  assert.match(emptySceneResolved.xml, /<mxfile/)
})

it('真正 legacy fallback 的 workflow 资源会被判定为阻断式不可加载状态', async () => {
  const {
    resolveDrawioCollabValue,
  } = await loadWorkspaceDrawioUtils()

  const resolved = resolveDrawioCollabValue(JSON.stringify({
    version: 1,
    drawMode: 'diagram',
    sourceType: 'manual',
    runtimeSnapshot: {
      legacyRuntime: {
        engine: 'tldraw',
      },
    },
    sceneModel: {
      nodes: [],
      edges: [],
    },
  }), '旧版流程')

  assert.equal(resolved.status, 'legacy_unavailable')
  assert.equal(resolved.xml, '')
  assert.equal(resolved.title, '检测到旧版流程画布')
  assert.match(resolved.message, /draw\.io 无法无损自动迁移/)
})

it('draw.io XML 可解析为 workflowSnapshot，并稳定输出节点/连线摘要与 hash', async () => {
  const {
    createDefaultDrawioXml,
    computeWorkflowSnapshotHash,
    parseDrawioXmlToWorkflowSnapshot,
  } = await loadWorkspaceDrawioUtils()

  const xml = createDefaultDrawioXml('审批流程')
  const snapshot = parseDrawioXmlToWorkflowSnapshot(xml)

  assert.equal(snapshot.format, 'drawio')
  assert.equal(snapshot.pageCount, 1)
  assert.equal(snapshot.isSinglePage, true)
  assert.equal(snapshot.currentPageName, '审批流程')
  assert.equal(snapshot.nodeCount, 1)
  assert.equal(snapshot.edgeCount, 0)
  assert.equal(snapshot.hash, computeWorkflowSnapshotHash(snapshot))
  assert.ok(snapshot.sampleLabels.includes('开始梳理流程'))
})

it('workflowDraft 可转换为可加载的 draw.io XML，并支持样式与布局预设', async () => {
  const {
    buildDrawioXmlFromWorkflowDraft,
    parseDrawioXmlToWorkflowSnapshot,
  } = await loadWorkspaceDrawioUtils()

  const xml = buildDrawioXmlFromWorkflowDraft({
    action: 'generate',
    title: '订单履约流程',
    summary: '生成一版订单履约流程图。',
    resourceId: 'workflow-1',
    resourceTitle: '订单履约流程',
    template: 'flowchart',
    sourceFormat: 'mermaid',
    sourceText: 'flowchart TD\n  A[开始] --> B{是否支付}\n  B -->|是| C[发货]\n  B -->|否| D[取消]',
    stylePreset: 'workflow',
    layoutPreset: 'left_to_right',
    baseWorkflowHash: '',
  })
  const snapshot = parseDrawioXmlToWorkflowSnapshot(xml)

  assert.match(xml, /<mxfile/)
  assert.equal(snapshot.nodeCount, 4)
  assert.equal(snapshot.edgeCount, 3)
  assert.equal(snapshot.styleSummary.fillColors[0], '#ecfeff')
  assert.equal(snapshot.pages[0]?.direction, 'left_to_right')
})

it('workflowSnapshot hash 会在画布结构变化后失效，用于阻止过期草案 apply', async () => {
  const {
    buildDrawioXmlFromWorkflowDraft,
    computeWorkflowSnapshotHash,
    createDefaultDrawioXml,
    parseDrawioXmlToWorkflowSnapshot,
  } = await loadWorkspaceDrawioUtils()

  const baseSnapshot = parseDrawioXmlToWorkflowSnapshot(createDefaultDrawioXml('基础流程'))
  const refinedSnapshot = parseDrawioXmlToWorkflowSnapshot(buildDrawioXmlFromWorkflowDraft({
    action: 'generate',
    title: '基础流程',
    summary: '补充审批与归档节点。',
    resourceId: 'workflow-1',
    resourceTitle: '基础流程',
    template: 'flowchart',
    sourceFormat: 'mermaid',
    sourceText: 'flowchart TD\n  A[开始] --> B[审批]\n  B --> C[归档]',
    stylePreset: 'default',
    layoutPreset: 'top_to_bottom',
    baseWorkflowHash: baseSnapshot.hash,
  }))

  assert.notEqual(baseSnapshot.hash, refinedSnapshot.hash)
  assert.notEqual(computeWorkflowSnapshotHash(baseSnapshot), computeWorkflowSnapshotHash(refinedSnapshot))
})
