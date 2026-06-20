import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const INTROSPECT_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/introspect.post.ts')
const REPO_ARCH_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/repo-architecture.post.ts')
const CONNECTOR_FILE = resolve(process.cwd(), 'server/services/scene/data-source-connectors.ts')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const DRAWIO_COMPONENT_FILE = resolve(process.cwd(), 'app/components/workspace/collab/WorkspaceDrawioCanvas.client.vue')
const DRAWIO_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-drawio.ts')

it('flow tab 已改为 draw.io 工作台，并移除旧的 schema 导入控制区', async () => {
  const flowTabSource = await readFile(FLOW_TAB_FILE, 'utf8')
  const mainPanelSource = await readFile(MAIN_PANEL_FILE, 'utf8')
  const drawioComponentSource = await readFile(DRAWIO_COMPONENT_FILE, 'utf8')
  const drawioUtilSource = await readFile(DRAWIO_UTIL_FILE, 'utf8')

  assert.match(flowTabSource, /import WorkspaceDrawioCanvas from/, 'flow tab 未接入 draw.io 画布组件')
  assert.match(flowTabSource, /@update:model-value="emit\('updateCollabDrawValue', \$event\)"/, 'flow tab 未把 draw.io XML 回写到协作状态')
  assert.match(flowTabSource, /暂未初始化流程画布/, 'flow tab 缺少空态')
  assert.doesNotMatch(flowTabSource, /实时连接中|AgentProto|draw\.io/, 'flow tab 仍保留右上角连接态胶囊')
  assert.match(drawioComponentSource, /resolveDrawioCollabValue/, 'draw.io 组件未接入统一阻断判定')
  assert.match(drawioComponentSource, /v-if="!isLegacyUnavailable"/, 'draw.io 组件未在 legacy 场景阻断 iframe')
  assert.match(drawioComponentSource, /resolvedDrawioDocument\.title/, 'draw.io 组件缺少整页错误态标题')
  assert.match(drawioComponentSource, /解决方式：点击下方“重建流程画布”/, 'draw.io 组件缺少 legacy 解决方案文案')
  assert.match(drawioComponentSource, /@click="requestLegacyRebuild"/, 'draw.io 组件缺少重建按钮点击入口')
  assert.doesNotMatch(drawioComponentSource, /px-8 py-10 text-center border border-slate-200 rounded-3xl bg-white max-w-2xl shadow-sm/, 'draw.io 组件仍保留旧的卡片式 legacy 提示')
  assert.match(drawioUtilSource, /status:\s*'legacy_unavailable'/, 'draw.io utils 未返回 legacy 阻断状态')
  assert.doesNotMatch(flowTabSource, /type SceneImportMode = 'mermaid' \| 'markdown_outline' \| 'ddl' \| 'architecture' \| 'postgres_introspection'/, 'flow tab 仍残留旧的导入模式枚举')
  assert.doesNotMatch(flowTabSource, /label: 'Postgres'/, 'flow tab 仍残留 Postgres 导入入口')
  assert.doesNotMatch(flowTabSource, /导出 DDL|导出 Mermaid|扫描当前仓库|OpenAPI/, 'flow tab 仍残留旧的结构导入导出控制区')

  assert.match(mainPanelSource, /:project-id="props\.activeProjectId"/)
  assert.match(mainPanelSource, /activeResourceTab \|\| activeTabId === 'flow' \? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden p-4 md:p-6'/, 'flow tab 内容区未贴满 tab content')
})

it('服务端提供项目级 schema introspection 与 repo architecture API，并复用 scene connectors', async () => {
  const apiSource = await readFile(INTROSPECT_API_FILE, 'utf8')
  const repoApiSource = await readFile(REPO_ARCH_API_FILE, 'utf8')
  const connectorSource = await readFile(CONNECTOR_FILE, 'utf8')

  assert.match(apiSource, /introspectDatabase/)
  assert.match(apiSource, /resolveProjectRealtimeAccess/)
  assert.match(apiSource, /connectionString/)
  assert.match(apiSource, /schemaNames/)
  assert.match(apiSource, /MySQL introspection 暂未开放/)

  assert.match(repoApiSource, /scanRepoArchitecture/)
  assert.match(repoApiSource, /resolveProjectRealtimeAccess/)
  assert.match(repoApiSource, /packageManifestCount/)
  assert.match(repoApiSource, /workspacePatterns/)
  assert.match(repoApiSource, /REPO_ARCHITECTURE_MANIFESTS_NOT_FOUND/)

  assert.match(connectorSource, /export async function scanRepoArchitecture/)
  assert.match(connectorSource, /pnpm-workspace\.yaml/)
  assert.match(connectorSource, /packageManifestCount/)
  assert.match(connectorSource, /workspacePatterns/)
  assert.match(connectorSource, /application_name: 'winloop-scene-introspection'/)
  assert.match(connectorSource, /PRIMARY KEY/)
  assert.match(connectorSource, /FOREIGN KEY/)
  assert.match(connectorSource, /obj_description/)
  assert.match(connectorSource, /col_description/)
  assert.match(connectorSource, /sourceType: 'db_introspection'/)
})
