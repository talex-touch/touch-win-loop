import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const SCENE_UTILS_PATH = resolve(process.cwd(), 'shared/utils/scene-document.ts')

async function loadSceneUtils() {
  return import(pathToFileURL(SCENE_UTILS_PATH).href)
}

it('mermaid / Markdown / DDL / 设备边框 scene 工具返回结构化结果', async () => {
  const {
    appendDesignElementToSceneDocument,
    appendDesignFrameToSceneDocument,
    appendDesignPageToSceneDocument,
    buildDeviceMockupSceneDocument,
    createEmptySceneDocument,
    exportArchitectureModelToMermaid,
    exportSchemaModelToDDL,
    importArchitectureFromMetadata,
    importFromDDL,
    importFromMarkdownOutline,
    importFromMermaid,
    parseSceneDocumentString,
    renderCompositionAssetToSvg,
    renderCompositionFramePreviewSvg,
    removeDesignFrameFromSceneDocument,
    updateDesignElementInSceneDocument,
    updateDesignPageInSceneDocument,
    updateDesignFrameInSceneDocument,
    resolveDesignFrameEditingBinding,
    resolveDesignFrameProjectionLayout,
  } = await loadSceneUtils()

  const mermaidScene = importFromMermaid('flowchart TD\nA[入口] --> B[出口]')
  assert.equal(mermaidScene.drawMode, 'diagram')
  assert.equal(mermaidScene.sourceType, 'mermaid')
  assert.equal(mermaidScene.sourceModel.kind, 'graph')
  assert.equal(mermaidScene.sceneModel.nodes.length, 2)
  assert.equal(mermaidScene.sceneModel.edges.length, 1)

  const hintedMermaidScene = importFromMermaid('%% diagramType: architecture\nflowchart TD\napi[API] --> db[(DB)]')
  assert.equal(hintedMermaidScene.sourceModel.kind, 'graph')
  assert.equal(hintedMermaidScene.sourceModel.diagramType, 'architecture')

  const outlineScene = importFromMarkdownOutline('# 总览\n- 平台\n  - Diagram\n  - Schema')
  assert.equal(outlineScene.drawMode, 'diagram')
  assert.equal(outlineScene.sourceType, 'markdown_outline')
  assert.equal(outlineScene.sourceModel.kind, 'graph')
  assert.ok(outlineScene.sceneModel.nodes.length >= 3)

  const ddlResult = importFromDDL(`
    CREATE TABLE users (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE posts (
      id BIGINT PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      title TEXT NOT NULL
    );
  `)
  assert.equal(ddlResult.schemaModel.kind, 'schema')
  assert.equal(ddlResult.sceneDocument.drawMode, 'schema')
  assert.equal(ddlResult.schemaModel.tables.length, 2)
  assert.equal(ddlResult.sceneDocument.sceneModel.nodes.length, 2)
  assert.ok(ddlResult.sceneDocument.sceneModel.edges.length >= 1)

  const exportedDdl = exportSchemaModelToDDL(ddlResult.sceneDocument)
  assert.match(exportedDdl, /CREATE TABLE "users"/)
  assert.match(exportedDdl, /CREATE TABLE "posts"/)
  assert.match(exportedDdl, /FOREIGN KEY \("user_id"\) REFERENCES "users" \("id"\)/)

  const dockerComposeArchitecture = importArchitectureFromMetadata(`services:
  web:
    image: nginx:latest
    depends_on:
      - api
  api:
    image: node:20
    depends_on:
      - postgres
  postgres:
    image: postgres:16`)
  assert.equal(dockerComposeArchitecture.sceneDocument.drawMode, 'architecture')
  assert.ok(dockerComposeArchitecture.architectureModel.services.length >= 2)
  assert.ok(dockerComposeArchitecture.architectureModel.databases.length >= 1)
  assert.ok(dockerComposeArchitecture.architectureModel.relations.length >= 2)

  const packageArchitecture = importArchitectureFromMetadata(JSON.stringify({
    name: '@winloop/app',
    version: '1.0.0',
    dependencies: {
      nuxt: '^4.0.0',
      pg: '^8.0.0',
    },
  }))
  assert.equal(packageArchitecture.architectureModel.services[0]?.label, '@winloop/app')
  assert.ok(packageArchitecture.architectureModel.externalDependencies.length >= 2)

  const workspaceArchitecture = importArchitectureFromMetadata(JSON.stringify({
    workspaceName: 'touch-win-loop',
    packages: ['apps/*', 'packages/*'],
    packageManifests: [
      {
        name: '@winloop/web',
        path: 'apps/web',
        dependencies: {
          '@winloop/api': 'workspace:*',
          'vue': '^3.5.0',
        },
      },
      {
        name: '@winloop/api',
        path: 'apps/api',
        dependencies: {
          '@winloop/shared': 'workspace:*',
          'pg': '^8.16.0',
        },
      },
      {
        name: '@winloop/shared',
        path: 'packages/shared',
      },
    ],
  }))
  assert.equal(workspaceArchitecture.architectureModel.systems[0]?.label, 'touch-win-loop')
  assert.ok(workspaceArchitecture.architectureModel.services.some(item => item.label === '@winloop/web'))
  assert.ok(workspaceArchitecture.architectureModel.services.some(item => item.label === '@winloop/api'))
  assert.ok(workspaceArchitecture.architectureModel.components.some(item => item.label === '@winloop/shared'))
  assert.ok(workspaceArchitecture.architectureModel.externalDependencies.some(item => item.label === 'vue'))
  assert.ok(workspaceArchitecture.architectureModel.relations.some(relation => relation.label === 'contains'))
  const webServiceId = workspaceArchitecture.architectureModel.services.find(item => item.label === '@winloop/web')?.id
  const apiServiceId = workspaceArchitecture.architectureModel.services.find(item => item.label === '@winloop/api')?.id
  assert.ok(workspaceArchitecture.architectureModel.relations.some(relation => relation.source === webServiceId && relation.target === apiServiceId))
  assert.equal(workspaceArchitecture.architectureModel.metadata?.sourceKind, 'workspace-manifest')

  const openApiArchitecture = importArchitectureFromMetadata(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Billing API', version: '1.0.0' },
    paths: {
      '/health': { get: { summary: 'Health' } },
      '/orders': { post: { summary: 'Create order' } },
    },
  }))
  assert.ok(openApiArchitecture.architectureModel.interfaces?.length >= 2)
  assert.ok(openApiArchitecture.architectureModel.relations.length >= 2)

  const architectureMermaid = exportArchitectureModelToMermaid(dockerComposeArchitecture.sceneDocument, 'dependency_map')
  assert.match(architectureMermaid, /flowchart TD/)
  assert.match(architectureMermaid, /web -->\|"depends_on"\| api/)
  assert.match(architectureMermaid, /api -->\|"depends_on"\| postgres/)

  const architectureWithContext = importArchitectureFromMetadata({
    systems: [{ id: 'system-platform', label: '平台系统', type: 'system' }],
    services: [{ id: 'service-api', label: 'API 服务', type: 'service' }],
    components: [{ id: 'component-auth', label: '认证组件', type: 'component' }],
    databases: [{ id: 'database-main', label: '主库', type: 'database' }],
    queues: [{ id: 'queue-jobs', label: '任务队列', type: 'queue' }],
    externalDependencies: [{ id: 'external-openai', label: 'OpenAI', type: 'external' }],
    interfaces: [{ id: 'interface-orders', label: 'POST /orders', type: 'interface', protocol: 'http' }],
    relations: [
      { source: 'system-platform', target: 'service-api', label: 'contains' },
      { source: 'service-api', target: 'component-auth', label: 'uses' },
      { source: 'service-api', target: 'database-main', label: 'reads' },
      { source: 'service-api', target: 'queue-jobs', label: 'publishes' },
      { source: 'service-api', target: 'external-openai', label: 'calls' },
      { source: 'service-api', target: 'interface-orders', label: 'exposes', protocol: 'http' },
    ],
  })
  const systemContextMermaid = exportArchitectureModelToMermaid(architectureWithContext.sceneDocument, 'system_context')
  assert.match(systemContextMermaid, /system-platform/)
  assert.match(systemContextMermaid, /database-main/)
  assert.match(systemContextMermaid, /external-openai/)
  assert.doesNotMatch(systemContextMermaid, /component-auth/)
  assert.doesNotMatch(systemContextMermaid, /queue-jobs/)
  assert.doesNotMatch(systemContextMermaid, /interface-orders/)

  const containerMermaid = exportArchitectureModelToMermaid(architectureWithContext.sceneDocument, 'container')
  assert.match(containerMermaid, /service-api/)
  assert.match(containerMermaid, /database-main/)
  assert.match(containerMermaid, /queue-jobs/)
  assert.match(containerMermaid, /interface-orders/)
  assert.doesNotMatch(containerMermaid, /system-platform/)
  assert.doesNotMatch(containerMermaid, /component-auth/)

  const dependencyMapMermaid = exportArchitectureModelToMermaid(architectureWithContext.sceneDocument, 'dependency_map')
  assert.match(dependencyMapMermaid, /component-auth/)
  assert.match(dependencyMapMermaid, /external-openai/)

  const workspaceGlobsOnlyArchitecture = importArchitectureFromMetadata(`workspaceName: mono-root
packages:
  - apps/*
  - packages/*`)
  assert.ok(workspaceGlobsOnlyArchitecture.architectureModel.components.some(item => item.label === 'apps/*'))
  assert.ok(workspaceGlobsOnlyArchitecture.warnings.some(item => item.includes('workspace globs')))

  const deviceScene = buildDeviceMockupSceneDocument({
    title: '统一图形平台',
    subtitle: '设备边框 + 模板导出',
    badge: 'Design',
    templateKey: 'device-showcase',
    deviceFramePresetKey: 'browser-window',
  })
  const svg = renderCompositionAssetToSvg(deviceScene)
  assert.equal(deviceScene.drawMode, 'composition')
  assert.equal(deviceScene.editorEngine, 'canvaskit_wasm')
  assert.equal(deviceScene.sourceModel.kind, 'composition')
  assert.equal(deviceScene.sourceModel.pages?.length, 1)
  assert.equal(deviceScene.sourceModel.frames?.length, 1)
  assert.match(svg, /data-device-frame="browser-window"/)
  assert.match(svg, /上传截图/)
  assert.doesNotMatch(svg, /统一图形平台/)
  assert.doesNotMatch(svg, /Page 1 · 1 Frame/)

  const expandedPageScene = appendDesignPageToSceneDocument(deviceScene, {
    name: 'Page 2',
  })
  assert.equal(expandedPageScene.sourceModel.kind, 'composition')
  assert.equal(expandedPageScene.sourceModel.pages?.length, 2)

  const flatFrameScene = appendDesignFrameToSceneDocument(expandedPageScene, {
    pageId: expandedPageScene.sourceModel.currentPageId,
    kind: 'freeform',
    name: '默认灰底 Frame',
  })
  const flatFrame = flatFrameScene.sourceModel.frames?.find(frame => frame.kind === 'freeform')
  assert.equal(flatFrame?.themeTokens?.background, '#e5e7eb')
  const flatFramePreviewSvg = renderCompositionFramePreviewSvg(flatFrameScene, flatFrame?.id || '')
  assert.match(flatFramePreviewSvg, /fill="#e5e7eb"/)
  assert.match(flatFramePreviewSvg, /stroke="#cbd5e1"/)
  assert.match(flatFramePreviewSvg, /rx="0" ry="0"/)
  assert.match(flatFramePreviewSvg, /style="overflow:hidden"/)

  const unclippedFlatFrameScene = updateDesignFrameInSceneDocument(
    flatFrameScene,
    flatFrame?.id || '',
    {
      metadata: {
        ...(flatFrame?.metadata || {}),
        clipContent: false,
      },
    },
  )
  const unclippedFlatFramePreviewSvg = renderCompositionFramePreviewSvg(
    unclippedFlatFrameScene,
    flatFrame?.id || '',
  )
  assert.match(unclippedFlatFramePreviewSvg, /style="overflow:visible"/)

  const pageRootElementScene = appendDesignElementToSceneDocument(unclippedFlatFrameScene, {
    pageId: unclippedFlatFrameScene.sourceModel.currentPageId,
    type: 'shape',
    x: 24,
    y: 32,
    width: 120,
    height: 72,
  })
  const pageRootElement = pageRootElementScene.sourceModel.elements?.find(element => element.pageId === unclippedFlatFrameScene.sourceModel.currentPageId && !element.frameId)
  assert.ok(pageRootElement)
  assert.equal(pageRootElement?.metadata?.containerRole, 'page_root')

  const overflowDetachedSourceScene = appendDesignElementToSceneDocument(unclippedFlatFrameScene, {
    id: 'detached-rectangle',
    pageId: unclippedFlatFrameScene.sourceModel.currentPageId,
    frameId: flatFrame?.id,
    type: 'shape',
    shapeKind: 'rectangle',
    x: 120,
    y: 80,
    width: 200,
    height: 120,
  })
  const overflowDetachedScene = updateDesignElementInSceneDocument(
    overflowDetachedSourceScene,
    'detached-rectangle',
    {
      x: Math.max(0, (flatFrame?.width || 0) - 96),
      y: 80,
      width: 200,
      height: 120,
    },
  )
  const overflowDetachedElement = overflowDetachedScene.sourceModel.elements?.find(element => element.id === 'detached-rectangle')
  assert.equal(overflowDetachedElement?.frameId, undefined)
  assert.equal(overflowDetachedElement?.metadata?.containerRole, 'page_root')
  assert.equal(
    overflowDetachedElement?.x,
    Math.max(0, Math.round((flatFrame?.x || 0) + Math.max(0, (flatFrame?.width || 0) - 96))),
  )
  assert.equal(
    overflowDetachedElement?.y,
    Math.round((flatFrame?.y || 0) + 80),
  )

  const overflowReattachedScene = updateDesignElementInSceneDocument(
    overflowDetachedScene,
    'detached-rectangle',
    {
      x: Math.round((flatFrame?.x || 0) + 64),
      y: Math.round((flatFrame?.y || 0) + 52),
      width: 160,
      height: 96,
    },
  )
  const overflowReattachedElement = overflowReattachedScene.sourceModel.elements?.find(element => element.id === 'detached-rectangle')
  assert.equal(overflowReattachedElement?.frameId, flatFrame?.id)
  assert.equal(overflowReattachedElement?.metadata?.containerRole, 'frame_child')
  assert.equal(overflowReattachedElement?.x, 64)
  assert.equal(overflowReattachedElement?.y, 52)

  const expandedFrameScene = appendDesignFrameToSceneDocument(expandedPageScene, {
    pageId: expandedPageScene.sourceModel.currentPageId,
    kind: 'diagram',
    name: '依赖图 Frame',
    embeddedScene: mermaidScene,
  })
  assert.ok(expandedFrameScene.sourceModel.frames?.some(frame => frame.kind === 'diagram'))
  const diagramFrameId = expandedFrameScene.sourceModel.frames?.find(frame => frame.kind === 'diagram')?.id || ''
  const frameSvg = renderCompositionAssetToSvg(expandedFrameScene, {
    frameId: diagramFrameId,
  })
  assert.match(frameSvg, /data-frame-id=/)
  const framePreviewSvg = renderCompositionFramePreviewSvg(expandedFrameScene, diagramFrameId)
  assert.doesNotMatch(framePreviewSvg, /依赖图 Frame/)

  const migratedComposition = parseSceneDocumentString(JSON.stringify({
    drawMode: 'composition',
    sourceType: 'image_mockup',
    sourceModel: {
      kind: 'composition',
      templateKey: 'device-showcase',
      slots: {
        title: '旧版标题',
        subtitle: '旧版副标题',
        badge: 'Legacy',
        imageSrc: 'data:image/png;base64,legacy',
      },
      themeTokens: {
        background: '#111827',
        accent: '#38bdf8',
      },
    },
  }), {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  assert.equal(migratedComposition.editorEngine, 'canvaskit_wasm')
  assert.equal(migratedComposition.sourceModel.kind, 'composition')
  assert.equal(migratedComposition.sourceModel.pages?.length, 1)
  assert.equal(migratedComposition.sourceModel.frames?.length, 1)
  assert.equal(migratedComposition.sourceModel.frames?.[0]?.kind, 'device_mockup')

  const legacyPageScene = parseSceneDocumentString(JSON.stringify({
    drawMode: 'composition',
    sourceType: 'manual',
    sourceModel: {
      kind: 'composition',
      templateKey: 'device-showcase',
      currentPageId: 'page-legacy',
      pages: [{
        id: 'page-legacy',
        name: 'Legacy Page',
        background: '#123456',
        frameIds: [],
      }],
      frames: [],
      elements: [],
      assets: [],
    },
  }), {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'manual',
  })
  assert.equal(legacyPageScene.editorEngine, 'canvaskit_wasm')
  const migratedLegacyPage = legacyPageScene.sourceModel.pages?.[0]
  assert.equal(migratedLegacyPage?.background, '#123456')
  assert.equal(migratedLegacyPage?.metadata?.workspaceBackground, '#123456')
  const legacyPageSolidSvg = renderCompositionAssetToSvg(legacyPageScene, {
    backgroundMode: 'solid',
  })
  assert.match(legacyPageSolidSvg, /fill="#123456"/)

  const updatedLegacyPageScene = updateDesignPageInSceneDocument(
    legacyPageScene,
    'page-legacy',
    {
      metadata: {
        workspaceBackground: '#654321',
      },
    },
  )
  const updatedLegacyPage = updatedLegacyPageScene.sourceModel.pages?.[0]
  assert.equal(updatedLegacyPage?.background, '#654321')
  assert.equal(updatedLegacyPage?.metadata?.workspaceBackground, '#654321')
  const updatedLegacyPageSolidSvg = renderCompositionAssetToSvg(updatedLegacyPageScene, {
    backgroundMode: 'solid',
  })
  assert.match(updatedLegacyPageSolidSvg, /fill="#654321"/)

  const linkedSourceFrame = {
    id: 'frame-source',
    pageId: 'page-2',
    kind: 'device_artboard',
    name: 'Source Artboard',
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  }
  const linkedWrapperFrame = {
    id: 'frame-wrapper',
    pageId: 'page-1',
    kind: 'device_artboard',
    name: 'Wrapper Preview',
    x: 120,
    y: 80,
    width: 480,
    height: 960,
    metadata: {
      device: {
        mockupSourceFrameId: 'frame-source',
        shellMode: 'builtin',
      },
    },
  }
  const linkedComposition = {
    kind: 'composition',
    templateKey: 'device-showcase',
    currentPageId: 'page-1',
    pages: [
      { id: 'page-1', name: 'Page 1', frameIds: ['frame-wrapper'] },
      { id: 'page-2', name: 'Page 2', frameIds: ['frame-source'] },
    ],
    frames: [linkedWrapperFrame, linkedSourceFrame],
    elements: [],
    assets: [],
  }
  const linkedBinding = resolveDesignFrameEditingBinding(
    linkedComposition,
    linkedWrapperFrame,
  )
  assert.equal(linkedBinding?.displayFrame.id, 'frame-wrapper')
  assert.equal(linkedBinding?.ownerFrame.id, 'frame-wrapper')
  assert.equal(linkedBinding?.projected, false)

  const linkedProjection = resolveDesignFrameProjectionLayout(
    linkedComposition,
    linkedWrapperFrame,
  )
  assert.equal(linkedProjection?.displayFrame.id, 'frame-wrapper')
  assert.equal(linkedProjection?.ownerFrame.id, 'frame-wrapper')
  assert.equal(linkedProjection?.projected, false)
  assert.ok(Number(linkedProjection?.contentScale || 0) > 0)

  const emptyCompositionScene = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'manual',
    templateKey: 'device-showcase',
    editorEngine: 'vueflow',
  })
  assert.equal(emptyCompositionScene.editorEngine, 'canvaskit_wasm')
  assert.equal(emptyCompositionScene.sourceModel.kind, 'composition')
  assert.equal(emptyCompositionScene.sourceModel.pages?.length, 1)
  assert.equal(emptyCompositionScene.sourceModel.frames?.length || 0, 0)

  const singleFrameScene = appendDesignFrameToSceneDocument(emptyCompositionScene, {
    pageId: emptyCompositionScene.sourceModel.currentPageId,
    kind: 'device_mockup',
    name: '可删除设备 Mock',
  })
  const removableFrameId = singleFrameScene.sourceModel.frames?.[0]?.id || ''
  assert.ok(removableFrameId)
  const removedFrameScene = removeDesignFrameFromSceneDocument(
    singleFrameScene,
    removableFrameId,
  )
  assert.equal(removedFrameScene.sourceModel.kind, 'composition')
  assert.equal(removedFrameScene.sourceModel.frames?.length || 0, 0)
})

it('repo architecture scanner 可从当前工作区读取 manifests 并生成 architecture scene', async () => {
  const connectorModule = await import(pathToFileURL(resolve(process.cwd(), 'server/services/scene/data-source-connectors.ts')).href)
  const result = await connectorModule.scanRepoArchitecture({
    rootDir: process.cwd(),
  })

  assert.equal(result.sceneDocument.drawMode, 'architecture')
  assert.equal(result.sceneDocument.sourceType, 'repo_arch')
  assert.ok(result.workspaceName.length > 0)
  assert.ok(result.packageManifestCount >= 1)
  assert.ok(Array.isArray(result.workspacePatterns))
})

it('design group / ungroup 与 auto layout relayout 保持稳定', async () => {
  const {
    appendDesignElementToSceneDocument,
    appendDesignFrameToSceneDocument,
    createEmptySceneDocument,
    groupDesignElementsInSceneDocument,
    resolveDisplayCompositionElementsForFrame,
    ungroupDesignElementInSceneDocument,
    updateDesignElementInSceneDocument,
    updateDesignFrameInSceneDocument,
  } = await loadSceneUtils()

  let document = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'manual',
    templateKey: 'device-showcase',
    editorEngine: 'vueflow',
  })
  assert.equal(document.editorEngine, 'canvaskit_wasm')
  const pageId = document.sourceModel.currentPageId
  document = appendDesignFrameToSceneDocument(document, {
    pageId,
    kind: 'freeform',
    name: 'Frame A',
    width: 480,
    height: 320,
  })
  const frameId = document.sourceModel.frames[0]?.id
  assert.ok(frameId)

  document = appendDesignElementToSceneDocument(document, {
    id: 'shape-a',
    type: 'shape',
    shapeKind: 'rectangle',
    pageId,
    frameId,
    x: 40,
    y: 48,
    width: 120,
    height: 80,
  })
  document = appendDesignElementToSceneDocument(document, {
    id: 'shape-b',
    type: 'shape',
    shapeKind: 'ellipse',
    pageId,
    frameId,
    x: 220,
    y: 72,
    width: 96,
    height: 64,
  })

  document = groupDesignElementsInSceneDocument(document, ['shape-a', 'shape-b'], {
    groupId: 'group-alpha',
    groupName: 'Alpha Group',
  })
  const groupedElements = document.sourceModel.elements || []
  const groupElement = groupedElements.find(element => element.id === 'group-alpha')
  assert.equal(groupElement?.type, 'group')
  assert.equal(groupElement?.x, 40)
  assert.equal(groupElement?.y, 48)
  assert.equal(groupElement?.width, 276)
  assert.equal(groupElement?.height, 88)
  assert.ok(groupedElements.filter(element => element.parentId === 'group-alpha').length === 2)

  document = updateDesignElementInSceneDocument(document, 'shape-b', {
    x: 260,
    y: 84,
  })
  const syncedGroup = (document.sourceModel.elements || []).find(element => element.id === 'group-alpha')
  assert.equal(syncedGroup?.width, 316)
  assert.equal(syncedGroup?.height, 100)

  document = ungroupDesignElementInSceneDocument(document, 'group-alpha')
  const ungroupedElements = document.sourceModel.elements || []
  assert.ok(!ungroupedElements.some(element => element.id === 'group-alpha'))
  assert.ok(ungroupedElements.some(element => element.id === 'shape-a' && !element.parentId))
  assert.ok(ungroupedElements.some(element => element.id === 'shape-b' && !element.parentId))

  document = updateDesignFrameInSceneDocument(document, frameId, {
    metadata: {
      layout: {
        mode: 'auto',
        direction: 'vertical',
        gap: 16,
        padding: {
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        },
      },
    },
  })
  document = updateDesignElementInSceneDocument(document, 'shape-a', {
    metadata: {
      layoutSizing: 'fill',
    },
  })
  document = updateDesignElementInSceneDocument(document, 'shape-b', {
    metadata: {
      layoutSizing: 'fixed',
    },
  })

  const frame = document.sourceModel.frames.find(item => item.id === frameId)
  const displayElements = resolveDisplayCompositionElementsForFrame(document.sourceModel, frame)
  assert.equal(displayElements[0]?.id, 'shape-a')
  assert.equal(displayElements[0]?.x, 20)
  assert.equal(displayElements[0]?.width, 440)
  assert.equal(displayElements[1]?.y, displayElements[0]?.y + displayElements[0]?.height + 16)

  document = updateDesignElementInSceneDocument(document, 'shape-a', {
    zIndex: 1,
  })
  const reorderedElements = resolveDisplayCompositionElementsForFrame(document.sourceModel, frame)
  assert.equal(reorderedElements[0]?.id, 'shape-b')
  assert.equal(reorderedElements[1]?.id, 'shape-a')
})

it('设备预设目录、单图 mockup 语义和旧文档兼容都可用', async () => {
  const {
    DEVICE_FRAME_PRESETS,
    appendDesignFrameToSceneDocument,
    buildDeviceMockupSceneDocument,
    parseSceneDocumentString,
    renderCompositionAssetToSvg,
    renderCompositionFramePreviewSvg,
    resolveDeviceFramePreset,
    serializeSceneDocument,
    updateDesignFrameInSceneDocument,
  } = await loadSceneUtils()

  const presetGroups = new Set(DEVICE_FRAME_PRESETS.map(preset => preset.group))
  assert.ok(presetGroups.has('iPhone'))
  assert.ok(presetGroups.has('Android Phone'))
  assert.ok(presetGroups.has('iPad'))
  assert.ok(presetGroups.has('Surface/Desktop'))

  const artboardPreset = resolveDeviceFramePreset('ipad-pro-11')
  let scene = buildDeviceMockupSceneDocument({
    title: '设备联动',
    subtitle: '验证 device_artboard',
    badge: 'Device',
    templateKey: 'device-showcase',
    deviceFramePresetKey: 'iphone-16-pro',
  })
  const pageId = scene.sourceModel.currentPageId
  scene = appendDesignFrameToSceneDocument(scene, {
    pageId,
    kind: 'device_artboard',
    name: 'iPad 画板',
    deviceFramePresetKey: artboardPreset.key,
    elements: [
      {
        id: 'linked-title',
        type: 'text',
        x: 48,
        y: 72,
        width: 320,
        height: 64,
        text: '联动画板内容',
      },
    ],
  })

  const artboardFrame = scene.sourceModel.frames?.find(frame => frame.kind === 'device_artboard')
  const mockupFrame = scene.sourceModel.frames?.find(frame => frame.kind === 'device_mockup')
  assert.ok(artboardFrame)
  assert.ok(mockupFrame)
  assert.equal(artboardFrame?.width, artboardPreset.screenWidth)
  assert.equal(artboardFrame?.height, artboardPreset.screenHeight)

  const externalShellAsset = {
    id: 'shell-1',
    type: 'image',
    name: 'External Shell',
    src: 'data:image/png;base64,custom-shell-asset',
    metadata: {
      role: 'device_shell',
      deviceShell: {
        presetKeys: ['iphone-16-pro'],
        viewportRect: {
          x: 18,
          y: 18,
          width: 390,
          height: 844,
        },
        cornerRadius: 48,
        source: 'uploaded',
      },
    },
  }
  scene = {
    ...scene,
    sourceModel: {
      ...scene.sourceModel,
      assets: [...(scene.sourceModel.assets || []), externalShellAsset],
    },
  }
  scene = updateDesignFrameInSceneDocument(scene, mockupFrame?.id || '', {
    metadata: {
      device: {
        shellMode: 'external',
        shellAssetId: externalShellAsset.id,
        mockupSourceFrameId: artboardFrame?.id,
      },
    },
  })

  const linkedSvg = renderCompositionAssetToSvg(scene, {
    frameId: mockupFrame?.id,
  })
  assert.match(linkedSvg, /联动画板内容/)
  assert.match(linkedSvg, /custom-shell-asset/)
  const linkedPreviewSvg = renderCompositionFramePreviewSvg(scene, mockupFrame?.id || '')
  assert.match(linkedPreviewSvg, /联动画板内容/)
  assert.doesNotMatch(linkedPreviewSvg, /设备联动/)
  assert.doesNotMatch(linkedPreviewSvg, /验证 device_artboard/)
  assert.doesNotMatch(linkedPreviewSvg, /上传截图/)

  const noShellScene = updateDesignFrameInSceneDocument(scene, mockupFrame?.id || '', {
    metadata: {
      device: {
        shellMode: 'none',
        shellAssetId: externalShellAsset.id,
        mockupSourceFrameId: artboardFrame?.id,
      },
    },
  })
  const noShellSvg = renderCompositionAssetToSvg(noShellScene, {
    frameId: mockupFrame?.id,
  })
  assert.match(noShellSvg, /联动画板内容/)
  assert.doesNotMatch(noShellSvg, /custom-shell-asset/)
  const canonicalizedScene = JSON.parse(serializeSceneDocument(scene))
  const canonicalizedMockupFrame = canonicalizedScene.sourceModel.frames?.find(frame => frame.id === mockupFrame?.id)
  assert.equal(canonicalizedMockupFrame?.kind, 'device_mockup')
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.shellMode, 'external')
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.shellAssetId, externalShellAsset.id)
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.mockupSourceFrameId, artboardFrame?.id)
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.screenScaleMode, 'fit')
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.showSafeArea, false)

  const migratedDeviceScene = parseSceneDocumentString(JSON.stringify({
    drawMode: 'composition',
    sourceType: 'image_mockup',
    sourceModel: {
      kind: 'composition',
      currentPageId: 'page-1',
      pages: [
        {
          id: 'page-1',
          name: 'Legacy Page',
        },
      ],
      frames: [
        {
          id: 'frame-1',
          pageId: 'page-1',
          name: 'Legacy Device Mockup',
          kind: 'device_mockup',
          x: 120,
          y: 120,
          width: 1440,
          height: 960,
          deviceFramePresetKey: 'iphone-13-14',
          elements: [
            {
              id: 'hero-image',
              type: 'image',
              pageId: 'page-1',
              frameId: 'frame-1',
              x: 960,
              y: 128,
              width: 520,
              height: 640,
              imageSrc: 'data:image/png;base64,legacy-image',
            },
            {
              id: 'legacy-title',
              type: 'text',
              pageId: 'page-1',
              frameId: 'frame-1',
              x: 120,
              y: 120,
              width: 320,
              height: 64,
              text: '旧标题',
            },
          ],
          metadata: {
            export: {
              scale: 2,
            },
          },
        },
      ],
      elements: [],
      assets: [],
    },
  }), {
    fallbackDrawMode: 'composition',
    fallbackSourceType: 'image_mockup',
  })
  const migratedFrame = migratedDeviceScene.sourceModel.frames?.[0]
  assert.equal(migratedFrame?.kind, 'device_mockup')
  assert.equal(migratedFrame?.metadata?.device?.shellMode, 'builtin')
  assert.equal(migratedFrame?.metadata?.device?.screenScaleMode, 'fit')
  assert.equal(migratedFrame?.metadata?.device?.showSafeArea, false)
  assert.equal(migratedFrame?.metadata?.export?.scale, 2)
  const migratedCanonicalScene = JSON.parse(serializeSceneDocument(migratedDeviceScene))
  const migratedCanonicalFrame = migratedCanonicalScene.sourceModel.frames?.[0]
  assert.equal(migratedCanonicalFrame?.kind, 'device_mockup')
  assert.equal(migratedCanonicalFrame?.metadata?.device?.shellMode, 'builtin')
  assert.equal(migratedCanonicalFrame?.metadata?.device?.screenScaleMode, 'fit')
  assert.equal(migratedCanonicalFrame?.metadata?.device?.showSafeArea, false)
  assert.equal(migratedCanonicalFrame?.metadata?.export?.scale, 2)
  assert.deepEqual(
    migratedCanonicalScene.sourceModel.elements?.map(element => element.id),
    ['hero-image'],
  )
  assert.match(
    renderCompositionAssetToSvg(migratedDeviceScene, { frameId: migratedFrame?.id }),
    /data-device-frame="iphone-13-14"/,
  )
})

it('设备排布文档支持源画板绑定、静态旋转和页面级固定导出', async () => {
  const {
    appendDesignFrameToSceneDocument,
    buildDeviceArrangementSceneDocument,
    createEmptySceneDocument,
    renderCompositionAssetToSvg,
    serializeSceneDocument,
  } = await loadSceneUtils()

  const blankScene = buildDeviceArrangementSceneDocument({
    title: '空白设备排布',
  })
  assert.equal(blankScene.sourceModel.frames?.length || 0, 0)
  assert.equal(blankScene.sourceModel.currentPageId, 'device-arrangement-export')

  const shellAsset = {
    id: 'shell-iphone',
    type: 'image',
    name: 'iPhone Shell',
    src: 'data:image/png;base64,shell',
    metadata: {
      role: 'device_shell',
      deviceShell: {
        presetKeys: ['iphone-16-pro'],
        viewportRect: {
          x: 18,
          y: 18,
          width: 390,
          height: 844,
        },
        cornerRadius: 48,
        source: 'uploaded',
      },
    },
  }
  const scene = buildDeviceArrangementSceneDocument({
    title: '设备排布',
    layoutPresetKey: 'duo-overlap',
    exportSizePresetKey: 'custom',
    shadowPresetKey: 'none',
    spacingPresetKey: 'spacious',
    rotationPresetKey: 'dynamic',
    customWidth: 1200,
    customHeight: 900,
    background: '#f8fafc',
    backgroundMode: 'solid',
    watermarkText: 'WinLoop',
    items: [
      {
        screenshotSrc: 'data:image/png;base64,screen-a',
        screenshotName: '首页',
        deviceFramePresetKey: 'iphone-16-pro',
        shellAsset,
        shellMode: 'external',
      },
      {
        screenshotSrc: 'data:image/png;base64,screen-b',
        screenshotName: '详情页',
        deviceFramePresetKey: 'iphone-16-pro',
      },
    ],
  })

  assert.equal(scene.drawMode, 'composition')
  assert.equal(scene.sourceType, 'image_mockup')
  assert.equal(scene.sourceModel.kind, 'composition')
  assert.equal(scene.sourceModel.pages?.length, 2)
  assert.equal(scene.sourceModel.currentPageId, 'device-arrangement-export')
  const exportPage = scene.sourceModel.pages?.find(page => page.id === 'device-arrangement-export')
  const sourcePage = scene.sourceModel.pages?.find(page => page.id === 'device-arrangement-sources')
  assert.equal(exportPage?.metadata?.export?.width, 1200)
  assert.equal(exportPage?.metadata?.export?.height, 900)
  assert.equal(exportPage?.metadata?.export?.backgroundMode, 'solid')
  assert.equal(scene.sourceModel.metadata?.deviceArrangement?.shadowPresetKey, 'none')
  assert.equal(scene.sourceModel.metadata?.deviceArrangement?.spacingPresetKey, 'spacious')
  assert.equal(scene.sourceModel.metadata?.deviceArrangement?.rotationPresetKey, 'dynamic')
  assert.equal(scene.sourceModel.metadata?.deviceArrangement?.items?.[0]?.deviceFramePresetKey, 'iphone-16-pro')
  assert.ok(sourcePage)

  const mockupFrames = scene.sourceModel.frames?.filter(frame => frame.kind === 'device_mockup') || []
  const sourceFrames = scene.sourceModel.frames?.filter(frame => frame.kind === 'device_artboard') || []
  assert.equal(mockupFrames.length, 2)
  assert.equal(sourceFrames.length, 2)
  assert.equal(mockupFrames[0]?.metadata?.device?.mockupSourceFrameId, sourceFrames[0]?.id)
  assert.equal(mockupFrames[0]?.metadata?.device?.shellMode, 'external')
  assert.equal(mockupFrames[0]?.metadata?.device?.shellAssetId, 'shell-iphone')
  assert.equal(mockupFrames[0]?.metadata?.device?.shadowPresetKey, 'none')
  assert.notEqual(mockupFrames[0]?.rotation, 0)
  assert.equal(scene.sourceModel.assets?.[0]?.metadata?.role, 'device_shell')

  const svg = renderCompositionAssetToSvg(scene)
  assert.match(svg, /width="1200" height="900"/)
  assert.match(svg, /WinLoop/)
  assert.match(svg, /rotate\(/)
  assert.doesNotMatch(svg, /drop-shadow/)
  assert.doesNotMatch(svg, /截图源/)

  const canonical = JSON.parse(serializeSceneDocument(scene))
  const canonicalMockup = canonical.sourceModel.frames.find(frame => frame.id === mockupFrames[0]?.id)
  assert.equal(canonicalMockup.metadata.device.mockupSourceFrameId, sourceFrames[0]?.id)
  assert.equal(canonicalMockup.metadata.device.shellAssetId, 'shell-iphone')
  assert.notEqual(canonicalMockup.rotation, 0)

  let rotatedScene = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'manual',
    templateKey: 'device-showcase',
    editorEngine: 'vueflow',
  })
  assert.equal(rotatedScene.editorEngine, 'canvaskit_wasm')
  rotatedScene = appendDesignFrameToSceneDocument(rotatedScene, {
    id: 'rotated-frame',
    pageId: rotatedScene.sourceModel.currentPageId,
    kind: 'freeform',
    width: 100,
    height: 200,
    rotation: 450,
  })
  const rotatedFrame = rotatedScene.sourceModel.frames?.[0]
  assert.equal(rotatedFrame?.rotation, 90)
  const rotatedSvg = renderCompositionAssetToSvg(rotatedScene, {
    frameId: 'rotated-frame',
  })
  assert.match(rotatedSvg, /width="200" height="100"/)
  assert.match(rotatedSvg, /rotate\(90/)
})

it('device_mockup 的 screenTransform 会同步作用于预览与导出', async () => {
  const {
    appendDesignFrameToSceneDocument,
    buildDeviceMockupSceneDocument,
    renderCompositionAssetToSvg,
    renderCompositionFramePreviewSvg,
    resolveDesignFrameProjectionLayoutForFrames,
    updateDesignFrameInSceneDocument,
  } = await loadSceneUtils()

  let scene = buildDeviceMockupSceneDocument({
    title: 'Mockup 构图',
    subtitle: '验证 screenTransform',
    badge: 'Transform',
    templateKey: 'device-showcase',
    deviceFramePresetKey: 'iphone-16-pro',
  })
  const pageId = scene.sourceModel.currentPageId

  scene = appendDesignFrameToSceneDocument(scene, {
    id: 'artboard-source',
    pageId,
    kind: 'device_artboard',
    name: '联动画板',
    deviceFramePresetKey: 'iphone-16-pro',
    elements: [
      {
        id: 'artboard-title',
        type: 'text',
        x: 48,
        y: 64,
        width: 240,
        height: 72,
        text: '构图联动',
      },
    ],
  })

  const sourceArtboard = scene.sourceModel.frames?.find(frame => frame.id === 'artboard-source')
  const mockupFrame = scene.sourceModel.frames?.find(frame => frame.kind === 'device_mockup')
  assert.ok(sourceArtboard, '缺少 source artboard')
  assert.ok(mockupFrame, '缺少 device_mockup')

  const baselinePreviewSvg = renderCompositionFramePreviewSvg(scene, mockupFrame?.id || '')
  const baselineAssetSvg = renderCompositionAssetToSvg(scene, {
    frameId: mockupFrame?.id,
  })

  scene = updateDesignFrameInSceneDocument(scene, mockupFrame?.id || '', {
    metadata: {
      device: {
        mockupSourceFrameId: sourceArtboard?.id,
        screenScaleMode: 'fit',
        screenTransform: {
          offsetX: 32,
          offsetY: -18,
          scale: 1.2,
        },
      },
    },
  })

  const updatedMockup = scene.sourceModel.frames?.find(frame => frame.id === mockupFrame?.id) || null
  const projectionLayout = resolveDesignFrameProjectionLayoutForFrames(
    updatedMockup,
    sourceArtboard,
    {
      assets: scene.sourceModel.assets,
      outerRect: {
        x: 0,
        y: 0,
        width: updatedMockup?.width || 0,
        height: updatedMockup?.height || 0,
      },
    },
  )
  assert.ok(projectionLayout, '缺少 mockup 投影布局')
  const expectedScale = (projectionLayout?.contentScale || 1) * 1.2
  const expectedTransform = `transform="translate(${(projectionLayout?.surfaceLayout?.screenRect.x || 0) + ((projectionLayout?.surfaceLayout?.screenRect.width || 0) - sourceArtboard.width * expectedScale) / 2 + 32} ${(projectionLayout?.surfaceLayout?.screenRect.y || 0) + ((projectionLayout?.surfaceLayout?.screenRect.height || 0) - sourceArtboard.height * expectedScale) / 2 - 18}) scale(${expectedScale})"`
  const previewSvg = renderCompositionFramePreviewSvg(scene, mockupFrame?.id || '')
  const assetSvg = renderCompositionAssetToSvg(scene, {
    frameId: mockupFrame?.id,
  })

  assert.notEqual(previewSvg, baselinePreviewSvg)
  assert.notEqual(assetSvg, baselineAssetSvg)
  assert.ok(previewSvg.includes(expectedTransform), '预览未应用 screenTransform 后的 translate/scale')
  assert.ok(assetSvg.includes(expectedTransform), '导出未应用 screenTransform 后的 translate/scale')
})
