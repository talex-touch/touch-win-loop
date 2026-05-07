import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const CANVAS_ASSIST_FILE = resolve(process.cwd(), 'server/services/ai/canvas-assist.ts')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')

it('设计画布 AI 结果扩展为可导入预览，并在前端落成 scene/design 预览态', async () => {
  const [typesSource, assistSource, designSource] = await Promise.all([
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
    readFile(CANVAS_ASSIST_FILE, 'utf8'),
    readFile(DESIGN_PANEL_FILE, 'utf8'),
  ])

  assert.match(typesSource, /export type AiCanvasAssistImportTarget = 'scene_document' \| 'design_document'/, '共享类型缺少画布 AI 导入目标类型')
  assert.match(typesSource, /export interface AiCanvasAssistImportPreview \{[\s\S]*target: AiCanvasAssistImportTarget[\s\S]*summary: string[\s\S]*sceneDocument\?: SceneDocument \| null[\s\S]*designDocument\?: string \| null[\s\S]*\}/, '共享类型缺少画布 AI 导入预览结构')
  assert.match(typesSource, /export interface AiCanvasAssistResult \{[\s\S]*importPreview\?: AiCanvasAssistImportPreview \| null[\s\S]*previewSummary\?: string[\s\S]*\}/, '共享类型未把导入预览挂到 AiCanvasAssistResult')

  assert.match(assistSource, /function buildCanvasAssistImportPreview\(input: \{[\s\S]*sourceText: string[\s\S]*sourceFormat: AiCanvasAssistSourceFormat[\s\S]*template: AiCanvasAssistRequest\['template'\][\s\S]*\}\): AiCanvasAssistImportPreview \| null \{/, 'canvas assist 服务缺少导入预览构造器')
  assert.match(assistSource, /const importPreview = buildCanvasAssistImportPreview\(\{/, 'canvas assist 服务未生成导入预览')
  assert.match(assistSource, /importPreview,/, 'canvas assist 服务未回传 importPreview')
  assert.match(assistSource, /previewSummary: importPreview\?\.summary \|\| '画布结构源预览已生成。'/, 'canvas assist 服务未生成统一 previewSummary')

  assert.match(designSource, /const canvasAiPreviewSceneDocument = ref<SceneDocument \| null>\(null\)/, '设计画布缺少 AI scene 预览态')
  assert.match(designSource, /const canvasAiPreviewDesignDocument = ref<string>\(''\)/, '设计画布缺少 AI design document 预览态')
  assert.match(designSource, /const canvasAiPreviewSummary = ref\(''\)/, '设计画布缺少 AI 预览摘要态')
  assert.match(designSource, /function resolveCanvasAssistPreviewSceneDocument\(result: Partial<AiCanvasAssistResult>\): SceneDocument \| null \{/, '设计画布缺少 AI 预览 scene 解析器')
  assert.match(designSource, /canvasAiPreviewSceneDocument\.value = resolveCanvasAssistPreviewSceneDocument\(result\)/, '设计画布未写入 AI scene 预览')
  assert.match(designSource, /canvasAiPreviewDesignDocument\.value = normalizeString\(result\.importPreview\?\.designDocument\)/, '设计画布未写入 AI design document 预览')
  assert.match(designSource, /canvasAiPreviewSummary\.value = normalizeString\(result\.previewSummary \|\| result\.importPreview\?\.summary\)/, '设计画布未写入 AI 预览摘要')
  assert.match(designSource, /embeddedScene: canvasAiPreviewSceneDocument\.value \|\| embeddedScene/, '设计画布应用 AI 结果时未优先使用预解析 scene')
})
