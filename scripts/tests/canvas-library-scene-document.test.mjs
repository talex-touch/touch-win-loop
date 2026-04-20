import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const SCENE_UTILS_PATH = resolve(process.cwd(), 'shared/utils/scene-document.ts')

async function loadSceneUtils() {
  return import(pathToFileURL(SCENE_UTILS_PATH).href)
}

it('page template 提取与合并会保留 libraryOrigin，并清理失效的 mockup source 关联', async () => {
  const {
    appendDesignAssetToSceneDocument,
    appendDesignFrameToSceneDocument,
    buildDeviceMockupSceneDocument,
    extractCanvasLibraryPageTemplate,
    mergeCanvasLibraryPageTemplate,
    updateDesignFrameInSceneDocument,
  } = await loadSceneUtils()

  let sourceDocument = buildDeviceMockupSceneDocument({
    title: '资源库源模板',
    subtitle: '用于验证 page template 快照导出',
    badge: 'Library',
    templateKey: 'device-showcase',
    deviceFramePresetKey: 'iphone-16-pro',
  })

  const sourceComposition = sourceDocument.sourceModel
  assert.equal(sourceComposition.kind, 'composition')
  const sourcePageId = String(sourceComposition.currentPageId || '')
  const sourceMockupFrame = sourceComposition.frames?.find(frame => frame.kind === 'device_mockup') || null
  assert.ok(sourceMockupFrame, '缺少源 device mockup frame')

  sourceDocument = appendDesignAssetToSceneDocument(sourceDocument, {
    id: 'shell-source',
    type: 'image',
    name: 'iPhone Shell',
    src: 'https://assets.example.com/device-shell.svg',
    metadata: {
      role: 'device_shell',
      deviceShell: {
        viewportRect: { x: 24, y: 24, width: 320, height: 640 },
        cornerRadius: 36,
        presetKeys: ['iphone-16-pro'],
        source: 'uploaded',
      },
    },
  })

  sourceDocument = appendDesignFrameToSceneDocument(sourceDocument, {
    pageId: sourcePageId,
    kind: 'device_artboard',
    name: 'Source Artboard',
    width: 320,
    height: 640,
    x: 120,
    y: 96,
    deviceFramePresetKey: 'iphone-16-pro',
  })

  const sourceArtboardId = sourceDocument.sourceModel.frames?.at(-1)?.id || ''
  assert.ok(sourceArtboardId, '缺少源 device artboard frame')

  sourceDocument = updateDesignFrameInSceneDocument(sourceDocument, sourceMockupFrame.id, {
    metadata: {
      ...(sourceMockupFrame.metadata || {}),
      device: {
        shellMode: 'external',
        shellAssetId: 'shell-source',
        mockupSourceFrameId: sourceArtboardId,
        screenScaleMode: 'fit',
        showSafeArea: false,
      },
    },
  })

  const payload = extractCanvasLibraryPageTemplate(sourceDocument, sourcePageId)
  assert.ok(payload, 'page template payload 未生成')
  assert.equal(payload?.target, 'page')
  assert.ok(payload?.assets.some(asset => asset.id === 'shell-source'))
  assert.ok(payload?.frames.some(frame => frame.id === sourceArtboardId))

  const mergedDocument = mergeCanvasLibraryPageTemplate(
    buildDeviceMockupSceneDocument({
      title: '导入目标文档',
      subtitle: '验证 page template 合并',
      badge: 'Target',
      templateKey: 'device-showcase',
      deviceFramePresetKey: 'iphone-16-pro',
    }),
    payload,
    {
      itemId: 'canvas-item-1',
      versionId: 'canvas-version-1',
      importedAt: '2026-04-15T08:00:00.000Z',
      importedBy: 'user-1',
      source: 'canvas_library',
    },
  )

  const mergedComposition = mergedDocument.sourceModel
  assert.equal(mergedComposition.kind, 'composition')

  const importedPage = mergedComposition.pages?.find(
    page => page.metadata?.libraryOrigin?.itemId === 'canvas-item-1',
  ) || null
  assert.ok(importedPage, '导入 page 未写入 libraryOrigin')

  const importedFrames = (mergedComposition.frames || []).filter(
    frame => frame.metadata?.libraryOrigin?.itemId === 'canvas-item-1',
  )
  const importedArtboard = importedFrames.find(frame => frame.kind === 'device_artboard') || null
  const importedMockup = importedFrames.find(frame => frame.kind === 'device_mockup') || null
  assert.ok(importedArtboard, '导入 artboard 丢失')
  assert.ok(importedMockup, '导入 mockup 丢失')
  assert.notEqual(importedArtboard?.id, sourceArtboardId)
  assert.equal(importedMockup?.metadata?.libraryOrigin?.versionId, 'canvas-version-1')
  assert.ok(!importedMockup?.metadata?.device?.mockupSourceFrameId)

  const importedShellAsset = (mergedComposition.assets || []).find(
    asset => asset.metadata?.libraryOrigin?.itemId === 'canvas-item-1',
  ) || null
  assert.ok(importedShellAsset, '导入设备壳素材丢失')
  assert.notEqual(importedShellAsset?.id, 'shell-source')
  assert.equal(importedMockup?.metadata?.device?.shellAssetId, importedShellAsset?.id)
})

it('device shell asset payload 会映射到现有设计壳元数据结构', async () => {
  const { buildDesignAssetFromCanvasLibraryPayload } = await loadSceneUtils()

  const asset = buildDesignAssetFromCanvasLibraryPayload(
    {
      mimeType: 'image/svg+xml',
      objectKey: 'canvas-library/device-shell.svg',
      fileName: 'device-shell.svg',
      size: 2048,
      viewportRect: { x: 16, y: 20, width: 320, height: 640 },
      cornerRadius: 32,
      presetKeys: ['iphone-16-pro', 'iphone-15-pro'],
      maskPath: 'M0,0 L1,0',
      metadata: {
        deviceShell: {
          source: 'uploaded',
        },
      },
    },
    {
      id: 'asset-device-shell',
      src: 'https://assets.example.com/device-shell.svg',
      assetKind: 'device_shell',
      origin: {
        itemId: 'canvas-item-2',
        versionId: 'canvas-version-2',
        importedAt: '2026-04-15T09:00:00.000Z',
        importedBy: 'user-2',
        source: 'canvas_library',
      },
    },
  )

  assert.equal(asset.type, 'image')
  assert.equal(asset.metadata?.role, 'device_shell')
  assert.equal(asset.metadata?.libraryOrigin?.itemId, 'canvas-item-2')
  assert.deepEqual(asset.metadata?.deviceShell?.presetKeys, ['iphone-16-pro', 'iphone-15-pro'])
  assert.equal(asset.metadata?.deviceShell?.viewportRect?.width, 320)
  assert.equal(asset.metadata?.deviceShell?.cornerRadius, 32)
  assert.equal(asset.metadata?.deviceShell?.maskPath, 'M0,0 L1,0')
})
