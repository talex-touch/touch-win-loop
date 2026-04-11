import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const MAIN_PANEL_CHROME_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanelChrome.vue')
const DESIGN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDesignPanel.vue')
const FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const TLDRAW_FILE = resolve(process.cwd(), 'app/components/workspace/collab/WorkspaceTldrawCanvas.client.vue')
const SCENE_PREVIEW_FILE = resolve(process.cwd(), 'app/components/workspace/collab/WorkspaceScenePreview.vue')
const ORCHESTRATOR_FILE = resolve(process.cwd(), 'server/services/ai/workspace-orchestrator.ts')
const COLLAB_POST_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/collab.post.ts')
const VIEW_STORE_FILE = resolve(process.cwd(), 'server/utils/project-workspace-view-store.ts')

it('统一 scene 平台基础骨架已接入共享类型与 design 固定页签', async () => {
  const domainSource = await readFile(DOMAIN_FILE, 'utf8')
  const mainPanelSource = await readFile(MAIN_PANEL_FILE, 'utf8')
  const chromeSource = await readFile(MAIN_PANEL_CHROME_FILE, 'utf8')
  const designPanelSource = await readFile(DESIGN_PANEL_FILE, 'utf8')
  const flowTabSource = await readFile(FLOW_TAB_FILE, 'utf8')
  const viewStoreSource = await readFile(VIEW_STORE_FILE, 'utf8')

  assert.match(domainSource, /export type DrawMode = 'freeform' \| 'diagram' \| 'schema' \| 'architecture' \| 'composition'/)
  assert.match(domainSource, /export interface SceneDocument \{/)
  assert.match(domainSource, /export interface SchemaModel \{/)
  assert.match(domainSource, /export interface ArchitectureModel \{/)
  assert.match(domainSource, /export interface CompositionModel \{/)
  assert.match(domainSource, /export type WorkspaceFixedTabId = 'dashboard' \| 'meeting' \| 'members' \| 'flow' \| 'design' \| 'settings'/)

  assert.match(mainPanelSource, /id: 'design'/)
  assert.match(mainPanelSource, /title: '设计'/)
  assert.match(mainPanelSource, /activeTabId === 'design'/)
  assert.match(mainPanelSource, /<WorkspaceDesignPanel/)
  assert.match(mainPanelSource, /@open-design="ensureFixedTabOpen\('design', true\)"/)

  assert.match(chromeSource, /openDesign: \[\]/)
  assert.match(chromeSource, /@click="emit\('openDesign'\)"/)
  assert.match(chromeSource, /打开设计/)

  assert.match(designPanelSource, /buildDeviceMockupSceneDocument/)
  assert.match(designPanelSource, /renderCompositionAssetToSvg/)
  assert.match(designPanelSource, /update:modelValue/)
  assert.match(designPanelSource, /parseSceneDocumentString/)
  assert.match(designPanelSource, /isBoundToDesignResource/)
  assert.match(designPanelSource, /下载 SVG/)

  assert.match(flowTabSource, /importFromMermaid/)
  assert.match(flowTabSource, /importFromMarkdownOutline/)
  assert.match(flowTabSource, /importFromDDL/)
  assert.match(flowTabSource, /importArchitectureFromMetadata/)
  assert.match(flowTabSource, /结构源导入/)
  assert.match(flowTabSource, /导入到画布/)
  assert.match(flowTabSource, /docker-compose/)
  assert.match(flowTabSource, /workspace manifests/)
  assert.match(flowTabSource, /OpenAPI/)

  assert.match(viewStoreSource, /'dashboard', 'meeting', 'members', 'flow', 'design', 'settings'/)
})

it('画布兼容层和 AI scene 工具已接入 SceneDocument', async () => {
  const tldrawSource = await readFile(TLDRAW_FILE, 'utf8')
  const previewSource = await readFile(SCENE_PREVIEW_FILE, 'utf8')
  const orchestratorSource = await readFile(ORCHESTRATOR_FILE, 'utf8')
  const collabPostSource = await readFile(COLLAB_POST_FILE, 'utf8')

  assert.match(tldrawSource, /WorkspaceScenePreview/)
  assert.match(tldrawSource, /sceneDocumentHasStructuredPreview/)
  assert.match(tldrawSource, /withRuntimeSnapshot/)
  assert.match(tldrawSource, /serializeSceneDocument/)
  assert.match(tldrawSource, /scenePreviewDocument/)

  assert.match(previewSource, /renderCompositionAssetToSvg/)
  assert.match(previewSource, /sceneDocumentFromUnknown/)

  assert.match(orchestratorSource, /name: 'generate_scene_from_text'/)
  assert.match(orchestratorSource, /name: 'generate_schema_from_ddl'/)
  assert.match(orchestratorSource, /name: 'export_schema_to_ddl'/)
  assert.match(orchestratorSource, /name: 'generate_architecture_from_metadata'/)
  assert.match(orchestratorSource, /name: 'generate_architecture_from_repo'/)
  assert.match(orchestratorSource, /scanRepoArchitecture/)
  assert.match(orchestratorSource, /name: 'export_architecture_to_mermaid'/)
  assert.match(orchestratorSource, /view: z\.enum\(\['system_context', 'container', 'dependency_map'\]\)\.optional\(\)/)
  assert.match(orchestratorSource, /exportArchitectureModelToMermaid\(parseJsonValue\(sceneDocument\), view \|\| 'dependency_map'\)/)
  assert.match(orchestratorSource, /name: 'apply_template'/)
  assert.match(orchestratorSource, /name: 'relayout_scene'/)
  assert.match(orchestratorSource, /name: 'generate_device_mockup'/)
  assert.match(orchestratorSource, /name: 'export_scene_asset'/)

  assert.match(collabPostSource, /drawMode\?: string/)
  assert.match(collabPostSource, /sceneSourceType\?: string/)
  assert.match(collabPostSource, /templateKey\?: string/)
  assert.match(collabPostSource, /ensureProjectDesignCanvas/)
  assert.match(collabPostSource, /fixedTab/)
  assert.match(collabPostSource, /metadata:\s*\{/)
})
