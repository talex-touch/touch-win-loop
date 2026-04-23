import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const DEVICE_DOCUMENT_UTILS_PATH = resolve(process.cwd(), 'shared/utils/device-arrangement-document.ts')

async function loadDeviceArrangementUtils() {
  return import(pathToFileURL(DEVICE_DOCUMENT_UTILS_PATH).href)
}

it('独立设备排布文档会规范化尺寸、自由排布 transform 与导出 SVG', async () => {
  const {
    createDeviceArrangementItem,
    normalizeDeviceArrangementDocument,
    renderDeviceArrangementDocumentToSvg,
    resolveDeviceArrangementSize,
  } = await loadDeviceArrangementUtils()

  const size = resolveDeviceArrangementSize('portrait-4-5')
  assert.equal(size.width, 1600)
  assert.equal(size.height, 2000)

  const document = normalizeDeviceArrangementDocument({
    title: '设备排布',
    canvas: {
      sizePresetKey: 'wide-16-9',
      background: '#e0e7ff',
      backgroundMode: 'gradient',
    },
    layoutPresetKey: 'duo-overlap',
    items: [
      createDeviceArrangementItem({
        id: 'hero',
        name: '首页',
        screenshotSrc: 'https://example.com/hero.png',
        devicePresetKey: 'iphone-16-pro',
        offsetX: 24,
        offsetY: -12,
        scale: 1.1,
        rotationOffset: 8,
      }),
      createDeviceArrangementItem({
        id: 'feature',
        name: '功能页',
        screenshotSrc: 'https://example.com/feature.png',
        devicePresetKey: 'browser-window',
      }),
    ],
    exportSizePresetKeys: ['wide-16-9', 'square'],
  })

  assert.equal(document.canvas.width, 1920)
  assert.equal(document.canvas.height, 1080)
  assert.equal(document.items.length, 2)
  assert.ok(document.items[0].x !== 0 || document.items[0].y !== 0)
  assert.equal(document.items[0].scale, 1.1)
  assert.equal(document.exportSizePresetKeys.length, 2)

  const svg = renderDeviceArrangementDocumentToSvg(document)
  assert.match(svg, /<svg/)
  assert.match(svg, /hero\.png/)
  assert.match(svg, /feature\.png/)
})

it('旧 SceneDocument 设备排布可迁移为独立 JSON 文档', async () => {
  const {
    migrateSceneDocumentToDeviceArrangementDocument,
  } = await loadDeviceArrangementUtils()

  const legacyScene = {
    sourceModel: {
      kind: 'composition',
      metadata: {
        designMode: 'device_arrangement',
        deviceArrangement: {
          layoutPresetKey: 'solo',
          exportSizePresetKey: 'square',
          background: '#f8fafc',
          backgroundMode: 'solid',
          shadowPresetKey: 'soft',
          items: [
            {
              screenshotName: '首页',
              deviceFramePresetKey: 'iphone-16-pro',
              offsetX: 12,
              offsetY: -6,
              scale: 1.2,
              rotationOffset: 5,
            },
          ],
        },
      },
      themeTokens: {
        background: '#f8fafc',
      },
      assets: [
        {
          id: 'shell-1',
          src: 'https://example.com/shell.png',
          metadata: {
            deviceShell: {
              viewportRect: {
                x: 0.08,
                y: 0.06,
                width: 0.84,
                height: 0.88,
              },
              cornerRadius: 28,
            },
          },
        },
      ],
      frames: [
        {
          id: 'source-frame',
          pageId: 'sources',
          kind: 'device_artboard',
          x: 80,
          y: 120,
          width: 393,
          height: 852,
          deviceFramePresetKey: 'iphone-16-pro',
        },
        {
          id: 'mockup-frame',
          pageId: 'export',
          kind: 'device_mockup',
          x: 420,
          y: 240,
          width: 420,
          height: 910,
          rotation: 4,
          deviceFramePresetKey: 'iphone-16-pro',
          metadata: {
            device: {
              shellAssetId: 'shell-1',
              mockupSourceFrameId: 'source-frame',
            },
          },
        },
      ],
      elements: [
        {
          id: 'source-image',
          pageId: 'sources',
          frameId: 'source-frame',
          type: 'image',
          imageSrc: 'https://example.com/legacy-home.png',
        },
      ],
    },
  }

  const document = migrateSceneDocumentToDeviceArrangementDocument(legacyScene, '旧设备排布')
  assert.equal(document.title, '旧设备排布')
  assert.equal(document.items.length, 1)
  assert.equal(document.items[0].screenshotSrc, 'https://example.com/legacy-home.png')
  assert.equal(document.items[0].shell.mode, 'external')
  assert.equal(document.items[0].shell.assetId, 'shell-1')
  assert.equal(document.items[0].devicePresetKey, 'iphone-16-pro')
})
