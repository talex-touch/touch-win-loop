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

  assert.match(domainBarrelSource, /export \* from '\.\/resource'/)
  assert.match(domainLegacySource, /export type CollabPurpose = 'workflow' \| 'freeform' \| 'design' \| 'notes'/)
  assert.match(domainLegacySource, /collabPurpose\?: CollabPurpose/)
  assert.match(storeSource, /export async function ensureProjectWorkflowCanvas\(/)
  assert.match(storeSource, /export async function ensureProjectDesignCanvas\(/)
  assert.match(storeSource, /collabPurpose: purpose/)
  assert.match(storeSource, /COALESCE\(pr\.metadata->>'collabPurpose', ''\) = 'workflow'/)
  assert.match(apiSource, /purpose\?: CollabPurpose/)
  assert.match(apiSource, /purpose === 'workflow'\s*\?\s*await ensureProjectWorkflowCanvas/)
})

it('项目页从流程入口打开 workflow 画布，并通过资源状态 composable 维护绑定', async () => {
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
  assert.match(flowTabSource, /WorkspaceTldrawCanvas/)
  assert.match(flowTabSource, /workspace-flow-/)
  assert.match(panelSource, /if \(activeTabId\.value === 'flow'\)\s+return \['竞赛分析', '流程画布'\]/)
  assert.match(panelSource, /return \[resolveCollabResourceLabel\(activeResource\.value\), title\]/)
  assert.doesNotMatch(panelSource, /<div v-else-if="activeTabId === 'flow'"[\s\S]*flowPanelTitle/)
  assert.doesNotMatch(panelSource, /<template v-else-if="activePreviewMode === 'draw'">[\s\S]*rev \{\{ Math\.max\(0, Number\(collabRevision \|\| 0\)\) \}\}/)
  assert.doesNotMatch(panelSource, /赛题确认/)
})

it('左侧资源入口与资源命名统一为妙想文档 / 原型白板 / 设计画布 / 流程画布', async () => {
  const resourceManagerSource = await readFile(RESOURCE_MANAGER_PANEL_FILE, 'utf8')
  const collabLabelSource = await readFile(COLLAB_RESOURCE_LABEL_FILE, 'utf8')

  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_NOTES_RESOURCE_LABEL\}`[\s\S]*?icon: 'edit_note'/)
  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_FREEFORM_RESOURCE_LABEL\}`[\s\S]*?icon: 'draw'/)
  assert.match(resourceManagerSource, /label: `新建\$\{COLLAB_DESIGN_RESOURCE_LABEL\}`[\s\S]*?icon: 'palette'/)
  assert.match(collabLabelSource, /COLLAB_WORKFLOW_RESOURCE_LABEL = '流程画布'/)
  assert.match(collabLabelSource, /COLLAB_FREEFORM_RESOURCE_LABEL = '原型白板'/)
  assert.match(collabLabelSource, /COLLAB_DESIGN_RESOURCE_LABEL = '设计画布'/)
  assert.match(collabLabelSource, /COLLAB_NOTES_RESOURCE_LABEL = '妙想文档'/)
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
