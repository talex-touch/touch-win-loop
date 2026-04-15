import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const SCENE_UTILS_PATH = resolve(process.cwd(), 'shared/utils/scene-document.ts')

async function loadSceneUtils() {
  return import(pathToFileURL(SCENE_UTILS_PATH).href)
}

it('Mermaid / Markdown / DDL / 设备边框 scene 工具返回结构化结果', async () => {
  const {
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
    removeDesignFrameFromSceneDocument,
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
          vue: '^3.5.0',
        },
      },
      {
        name: '@winloop/api',
        path: 'apps/api',
        dependencies: {
          '@winloop/shared': 'workspace:*',
          pg: '^8.16.0',
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
  assert.match(architectureMermaid, /web -->\|\"depends_on\"\| api/)
  assert.match(architectureMermaid, /api -->\|\"depends_on\"\| postgres/)

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
  assert.equal(deviceScene.editorEngine, 'vueflow')
  assert.equal(deviceScene.sourceModel.kind, 'composition')
  assert.equal(deviceScene.sourceModel.pages?.length, 1)
  assert.equal(deviceScene.sourceModel.frames?.length, 1)
  assert.match(svg, /data-device-frame="browser-window"/)
  assert.match(svg, /上传截图/)
  assert.doesNotMatch(svg, /统一图形平台/)

  const expandedPageScene = appendDesignPageToSceneDocument(deviceScene, {
    name: 'Page 2',
  })
  assert.equal(expandedPageScene.sourceModel.kind, 'composition')
  assert.equal(expandedPageScene.sourceModel.pages?.length, 2)

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
  assert.equal(migratedComposition.sourceModel.kind, 'composition')
  assert.equal(migratedComposition.sourceModel.pages?.length, 1)
  assert.equal(migratedComposition.sourceModel.frames?.length, 1)
  assert.equal(migratedComposition.sourceModel.frames?.[0]?.kind, 'device_mockup')

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
  assert.doesNotMatch(linkedSvg, /联动画板内容/)
  assert.match(linkedSvg, /custom-shell-asset/)
  const linkedPreviewSvg = renderCompositionFramePreviewSvg(scene, mockupFrame?.id || '')
  assert.doesNotMatch(linkedPreviewSvg, /联动画板内容/)
  assert.doesNotMatch(linkedPreviewSvg, /设备联动/)
  assert.doesNotMatch(linkedPreviewSvg, /验证 device_artboard/)
  assert.match(linkedPreviewSvg, /上传截图/)

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
  assert.doesNotMatch(noShellSvg, /联动画板内容/)
  assert.doesNotMatch(noShellSvg, /custom-shell-asset/)
  const canonicalizedScene = JSON.parse(serializeSceneDocument(scene))
  const canonicalizedMockupFrame = canonicalizedScene.sourceModel.frames?.find(frame => frame.id === mockupFrame?.id)
  assert.equal(canonicalizedMockupFrame?.kind, 'device_mockup')
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.shellMode, 'external')
  assert.equal(canonicalizedMockupFrame?.metadata?.device?.shellAssetId, externalShellAsset.id)
  assert.ok(!canonicalizedMockupFrame?.metadata?.device?.mockupSourceFrameId)
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
