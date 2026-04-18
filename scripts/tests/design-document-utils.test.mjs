import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const SCENE_UTILS_PATH = resolve(process.cwd(), 'shared/utils/scene-document.ts')
const DESIGN_DOCUMENT_UTILS_PATH = resolve(process.cwd(), 'shared/utils/design-document.ts')

async function loadSceneUtils() {
  return import(pathToFileURL(SCENE_UTILS_PATH).href)
}

async function loadDesignDocumentUtils() {
  return import(pathToFileURL(DESIGN_DOCUMENT_UTILS_PATH).href)
}

it('DesignDocumentV1 可从 composition scene 迁移并保持兼容回读', async () => {
  const {
    appendDesignFrameToSceneDocument,
    buildDeviceMockupSceneDocument,
  } = await loadSceneUtils()
  const {
    createEmptyDesignDocument,
    designDocumentToSceneDocument,
    isDesignDocumentV1,
    parseDesignDocumentString,
    sceneDocumentToDesignDocument,
    serializeDesignDocument,
  } = await loadDesignDocumentUtils()

  const legacyScene = appendDesignFrameToSceneDocument(
    {
      ...buildDeviceMockupSceneDocument({
        title: '迁移测试',
        subtitle: '兼容旧设计资源',
        badge: 'Compat',
        templateKey: 'device-showcase',
        deviceFramePresetKey: 'browser-window',
      }),
      editorEngine: 'canvaskit_wasm',
    },
    {
      pageId: 'page-1',
      kind: 'freeform',
      name: '新建海报 Frame',
      x: 64,
      y: 80,
      width: 720,
      height: 480,
    },
  )

  const designDocument = sceneDocumentToDesignDocument(legacyScene)
  assert.equal(designDocument.schema, 'design_document_v1')
  assert.equal(designDocument.drawMode, 'composition')
  assert.equal(designDocument.editorEngine, 'canvaskit_wasm')
  assert.equal(designDocument.pages.length, 1)
  assert.ok(designDocument.frames.length >= 2)
  assert.ok(isDesignDocumentV1(designDocument))

  const serialized = serializeDesignDocument(designDocument)
  const parsed = parseDesignDocumentString(serialized)
  assert.ok(parsed)
  assert.equal(parsed?.schema, 'design_document_v1')
  assert.equal(parsed?.editorEngine, 'canvaskit_wasm')

  const roundTripScene = designDocumentToSceneDocument(parsed)
  assert.equal(roundTripScene.drawMode, 'composition')
  assert.equal(roundTripScene.editorEngine, 'canvaskit_wasm')
  assert.equal(roundTripScene.sourceModel.kind, 'composition')
  assert.equal(roundTripScene.sourceModel.pages?.length, designDocument.pages.length)
  assert.equal(roundTripScene.sourceModel.frames?.length, designDocument.frames.length)
})

it('空白 DesignDocumentV1 默认带 composition 语义和导出预设', async () => {
  const {
    createEmptyDesignDocument,
    designDocumentToSceneDocument,
  } = await loadDesignDocumentUtils()

  const document = createEmptyDesignDocument({
    templateKey: 'device-showcase',
  })

  assert.equal(document.schema, 'design_document_v1')
  assert.equal(document.editorEngine, 'canvaskit_wasm')
  assert.equal(document.templateKey, 'device-showcase')
  assert.equal(document.pages.length, 1)
  assert.deepEqual(document.exportPresets, ['svg', 'png', 'pdf'])

  const scene = designDocumentToSceneDocument(document)
  assert.equal(scene.drawMode, 'composition')
  assert.equal(scene.editorEngine, 'canvaskit_wasm')
  assert.equal(scene.sourceModel.kind, 'composition')
  assert.equal(scene.sourceModel.pages?.length, 1)
})
