import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const DOMAIN_BARREL_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const DOMAIN_LEGACY_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const COLLAB_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/collab.post.ts')
const COLLAB_RESOURCE_LABEL_FILE = resolve(process.cwd(), 'shared/utils/collab-resource.ts')
const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const RESOURCE_MANAGER_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceResourceManagerPanel.vue')
const SIDEBAR_HELPERS_FILE = resolve(process.cwd(), 'app/utils/workspace-left-sidebar-helpers.ts')

async function loadWorkspaceSidebarHelpers() {
  return import(pathToFileURL(SIDEBAR_HELPERS_FILE).href)
}

it('协作资源模型暴露 collabPurpose 顶层字段，并在服务端实现 workflow 唯一画布', async () => {
  const domainBarrelSource = await readFile(DOMAIN_BARREL_FILE, 'utf8')
  const domainLegacySource = await readFile(DOMAIN_LEGACY_FILE, 'utf8')
  const storeSource = await readFile(RESOURCE_STORE_FILE, 'utf8')
  const apiSource = await readFile(COLLAB_API_FILE, 'utf8')

  assert.match(domainBarrelSource, /export \* from '\.\.\/\.\.\/internal\/shared-types\/domain-legacy'/)
  assert.match(domainLegacySource, /export type CollabPurpose = 'workflow' \| 'freeform' \| 'design' \| 'notes'/)
  assert.match(domainLegacySource, /collabPurpose\?: CollabPurpose/)
  assert.match(storeSource, /export async function ensureProjectWorkflowCanvas\(/)
  assert.match(storeSource, /function parseCollabPurpose\(value: unknown\): CollabPurpose \| null \{[\s\S]*normalized === 'design'/)
  assert.match(storeSource, /collabPurpose: purpose/)
  assert.match(storeSource, /COALESCE\(pr\.metadata->>'collabPurpose', ''\) = 'workflow'/)
  assert.match(storeSource, /purpose === 'workflow'[\s\S]*'diagram'[\s\S]*purpose === 'design'[\s\S]*'composition'/)
  assert.match(apiSource, /purpose\?: CollabPurpose/)
  assert.match(apiSource, /ensurePrimary\?: boolean/)
  assert.match(apiSource, /const ensurePrimary = body\.ensurePrimary === true/)
  assert.match(apiSource, /purpose === 'workflow' && ensurePrimary[\s\S]*\? await ensureProjectWorkflowCanvas/)
})

it('项目页从流程入口打开 workflow 画布，并切到 draw.io + AgentProto 工作台', async () => {
  const pageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const panelSource = await readFile(MAIN_PANEL_FILE, 'utf8')
  const flowTabSource = await readFile(FLOW_TAB_FILE, 'utf8')

  assert.match(pageSource, /purpose:\s*'workflow'/)
  assert.match(pageSource, /statusLine\.value = '已打开流程画布，可继续协作梳理项目流程。'/)
  assert.match(pageSource, /useWorkspaceProjectResources\(\)/)
  assert.match(pageSource, /flowResourceId,/)
  assert.match(pageSource, /previewResourceId,/)
  assert.match(panelSource, /title: '流程画布'/)
  assert.match(panelSource, /v-else-if="activeTabId === 'flow'"/)
  assert.match(panelSource, /<WorkspaceFlowTab/)
  assert.match(panelSource, /:flow-resource-id="props\.flowResourceId"/)
  assert.match(flowTabSource, /WorkspaceDrawioCanvas/)
  assert.match(flowTabSource, /:key="props\.flowResourceId \|\| 'flow-canvas'"/)
  assert.match(flowTabSource, /@update:model-value="emit\('updateCollabDrawValue', \$event\)"/)
  assert.match(flowTabSource, /@request-rebuild="emit\('requestWorkflowCanvasRebuild'\)"/)
  assert.doesNotMatch(flowTabSource, /实时连接中|AgentProto|draw\.io|pointer-events-none absolute right-3 top-3 z-10 items-center/)
  assert.doesNotMatch(flowTabSource, /<header class=/)
  assert.match(panelSource, /if \(activeTabId\.value === 'flow'\)\s+return \['竞赛分析', '流程画布'\]/)
  assert.match(panelSource, /return \[resolveCollabResourceLabel\(activeResource\.value\), title\]/)
  assert.match(panelSource, /activeResourceTab \|\| activeTabId === 'flow' \? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6'/)
  assert.match(pageSource, /resolveDrawioCollabValue\(/)
  assert.match(pageSource, /workflowDrawioLegacyUnavailable\.value = resolvedDrawio\.status === 'legacy_unavailable'/)
  assert.match(pageSource, /workflowDrawioLegacyMessage\.value = resolvedDrawio\.message/)
  assert.doesNotMatch(panelSource, /<div v-else-if="activeTabId === 'flow'"[\s\S]*flowPanelTitle/)
  assert.doesNotMatch(panelSource, /<template v-else-if="activePreviewMode === 'draw'">[\s\S]*rev \{\{ Math\.max\(0, Number\(collabRevision \|\| 0\)\) \}\}/)
  assert.doesNotMatch(panelSource, /赛题确认/)
})

it('项目页对 AgentProto workflow 草案使用独立动作 gating，并在恢复消息时重置本地 workflow 草案状态', async () => {
  const pageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')

  assert.match(pageSource, /function resetChatDraftArtifactState\(\): void \{[\s\S]*appliedWorkflowDraftKeys\.value = \[\][\s\S]*discardedWorkflowDraftKeys\.value = \[\][\s\S]*\}/)
  assert.match(pageSource, /chatMessages\.value = restoredMessages[\s\S]*resetChatDraftArtifactState\(\)/)
  assert.match(pageSource, /const workflowGenerateAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('generate'\)\)\)/)
  assert.match(pageSource, /const workflowCompleteAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('complete'\)\)\)/)
  assert.match(pageSource, /const workflowRefineAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('refine'\)\)\)/)
  assert.match(pageSource, /const workflowRestyleAvailable = computed\(\(\) => !workflowCanvasUnavailableReason\.value && isAiFeatureAvailable\(resolveWorkflowDraftFeatureKey\('restyle'\)\)\)/)
  assert.match(pageSource, /workflowCanvasUnavailableReason/)
  assert.match(pageSource, /statusLine\.value = workflowCanvasUnavailableReason\.value/)
  assert.match(pageSource, /当前流程画布为旧版数据，暂不支持在 draw\.io 中直接加载\/生成，请重建流程画布。/)
  assert.match(pageSource, /@request-workflow-canvas-rebuild="requestWorkflowCanvasRebuild"/)
  assert.match(pageSource, /function requestWorkflowCanvasRebuild\(\): void \{[\s\S]*workflowCanvasRebuildConfirmVisible\.value = true[\s\S]*\}/)
  assert.match(pageSource, /function confirmWorkflowCanvasRebuild\(\): void \{[\s\S]*createDefaultDrawioXml\([\s\S]*updateCollabDrawContent\(serializeDrawioCollabValue\(xml\)\)[\s\S]*已重建流程画布，可继续在 draw\.io 中编辑或生成 AgentProto 草案。[\s\S]*\}/)
  assert.match(pageSource, /title="确认重建流程画布？"/)
  assert.match(pageSource, /旧版自由绘制数据不会自动迁移/)
})

it('项目页把 design 资源作为独立 resource tab 打开，并通过创建接口生成多实例 design 文件', async () => {
  const pageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const apiSource = await readFile(COLLAB_API_FILE, 'utf8')
  const storeSource = await readFile(RESOURCE_STORE_FILE, 'utf8')

  assert.match(pageSource, /purpose,\s*\.\.\.\(purpose === 'design'/)
  assert.match(pageSource, /title:\s*'设计稿'/)
  assert.match(pageSource, /drawMode:\s*'composition'/)
  assert.doesNotMatch(pageSource, /fixedTab:\s*'design'/)
  assert.doesNotMatch(apiSource, /purpose === 'design'\s*\?\s*await ensureProjectDesignCanvas/)
  assert.match(apiSource, /purpose === 'design'[\s\S]*drawMode: normalizeString\(body\.drawMode \|\| requestMetadata\.drawMode\) \|\| 'composition'/)
  assert.match(apiSource, /purpose === 'design'[\s\S]*editorEngine: 'canvaskit_wasm'/)
  assert.match(storeSource, /function resolveDefaultSceneEditorEngine\([\s\S]*purpose === 'design' \|\| drawMode === 'composition'[\s\S]*return 'canvaskit_wasm'/)
  assert.match(storeSource, /function normalizeSceneEditorEngine\([\s\S]*if \(purpose === 'design'\)[\s\S]*return 'canvaskit_wasm'/)
  assert.match(storeSource, /purpose === 'workflow'[\s\S]*'diagram'[\s\S]*purpose === 'design'[\s\S]*'composition'/)
  assert.match(pageSource, /async function resolveProjectResourceOpenTarget\(/)
  assert.doesNotMatch(pageSource, /isLegacyDesignDraftAliasResource\(targetResource\)/)
  assert.match(pageSource, /if \(target\.surface === 'preview' \|\| target\.surface === 'design'\) \{[\s\S]*surface: target\.surface/)
})

it('左侧资源入口与资源命名统一为妙想文档 / 原型白板 / 设计画布 / 流程画布', async () => {
  const resourceManagerSource = await readFile(RESOURCE_MANAGER_PANEL_FILE, 'utf8')
  const collabLabelSource = await readFile(COLLAB_RESOURCE_LABEL_FILE, 'utf8')

  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_NOTES_RESOURCE_LABEL\}`[\s\S]*?icon: 'edit_note'/)
  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_FREEFORM_RESOURCE_LABEL\}`[\s\S]*?icon: 'draw'/)
  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_DESIGN_RESOURCE_LABEL\}`[\s\S]*?icon: 'palette'/)
  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_WORKFLOW_RESOURCE_LABEL\}`[\s\S]*?icon: 'flowsheet'/)
  assert.match(resourceManagerSource, /label: `新建子\$\{COLLAB_WORKFLOW_RESOURCE_LABEL\}`[\s\S]*?icon: 'flowsheet'/)
  assert.match(collabLabelSource, /COLLAB_WORKFLOW_RESOURCE_LABEL = '流程画布'/)
  assert.match(collabLabelSource, /COLLAB_FREEFORM_RESOURCE_LABEL = '原型白板'/)
  assert.match(collabLabelSource, /COLLAB_DESIGN_RESOURCE_LABEL = '设计画布'/)
  assert.match(collabLabelSource, /COLLAB_NOTES_RESOURCE_LABEL = '妙想文档'/)
})

it('左侧资源管理器支持流程画布改名，并把事件透传到项目页 PATCH 接口', async () => {
  const [resourceManagerSource, pageSource] = await Promise.all([
    readFile(RESOURCE_MANAGER_PANEL_FILE, 'utf8'),
    readFile(PROJECT_PAGE_FILE, 'utf8'),
  ])

  assert.match(resourceManagerSource, /'renameProjectResource': \[payload: \{ resourceId: string, title: string \}\]/, '资源管理器缺少改名事件')
  assert.match(resourceManagerSource, /key: 'rename'[\s\S]*label: '改名'/, '资源操作菜单缺少改名项')
  assert.match(resourceManagerSource, /@dblclick\.stop\.prevent="startRenamingResource\(row\.resource\.id\)"/, '资源项未接入双击改名')
  assert.match(resourceManagerSource, /data-resource-rename-id/, '资源项缺少 inline rename 输入锚点')
  assert.match(resourceManagerSource, /emit\('renameProjectResource', \{[\s\S]*resourceId: normalizedResourceId,[\s\S]*title: nextTitle[\s\S]*\}\)/, '资源管理器未发出改名事件')
  assert.match(pageSource, /async function renameProjectResource\(payload: \{ resourceId: string, title: string \}\)/, '项目页缺少改名处理入口')
  assert.match(pageSource, /method: 'PATCH'/, '项目页改名未调用 PATCH 接口')
  assert.match(pageSource, /endpoint\(`\/projects\/\$\{projectId\}\/resources\/\$\{resourceId\}`\)/, '项目页改名未命中资源 PATCH 路由')
  assert.match(pageSource, /@rename-project-resource="renameProjectResource"/, '左栏改名事件未接回项目页')
})

it('资源语义解析层可把新旧 design 资源都统一识别为设计画布', async () => {
  const {
    isDesignCanvasResource,
    resolveCollabPurpose,
    resolveCollabResourceIcon,
    resolveCollabResourceIconClass,
    resolveCollabResourceLabel,
  } = await loadWorkspaceSidebarHelpers()

  const explicitDesign = {
    source: 'collab',
    resourceKind: 'draw',
    collabPurpose: 'design',
    drawMode: 'freeform',
    metadata: {},
  }
  const legacyComposition = {
    source: 'collab',
    resourceKind: 'draw',
    drawMode: 'composition',
    metadata: {},
  }
  const legacyFixedTab = {
    source: 'collab',
    resourceKind: 'draw',
    metadata: {
      fixedTab: 'design',
    },
  }
  const workflowCanvas = {
    source: 'collab',
    resourceKind: 'draw',
    collabPurpose: 'workflow',
    metadata: {},
  }
  const freeformCanvas = {
    source: 'collab',
    resourceKind: 'draw',
    collabPurpose: 'freeform',
    metadata: {},
  }
  const notesDocument = {
    source: 'collab',
    resourceKind: 'markdown',
    metadata: {},
  }

  assert.equal(resolveCollabPurpose(explicitDesign), 'design')
  assert.equal(resolveCollabPurpose(legacyComposition), 'design')
  assert.equal(resolveCollabPurpose(legacyFixedTab), 'design')
  assert.ok(isDesignCanvasResource(explicitDesign))
  assert.ok(isDesignCanvasResource(legacyComposition))
  assert.ok(isDesignCanvasResource(legacyFixedTab))
  assert.equal(resolveCollabResourceLabel(explicitDesign), '设计画布')
  assert.equal(resolveCollabResourceIcon(explicitDesign), 'palette')
  assert.equal(resolveCollabResourceIconClass(explicitDesign), 'workspace-icon--collab')
  assert.equal(resolveCollabPurpose(workflowCanvas), 'workflow')
  assert.equal(resolveCollabResourceLabel(workflowCanvas), '流程画布')
  assert.equal(resolveCollabResourceIcon(workflowCanvas), 'flowsheet')
  assert.equal(resolveCollabPurpose(freeformCanvas), 'freeform')
  assert.equal(resolveCollabResourceLabel(freeformCanvas), '原型白板')
  assert.equal(resolveCollabResourceIcon(freeformCanvas), 'draw')
  assert.equal(resolveCollabPurpose(notesDocument), 'notes')
  assert.equal(resolveCollabResourceLabel(notesDocument), '妙想文档')
  assert.equal(resolveCollabResourceIcon(notesDocument), 'edit_note')
})
