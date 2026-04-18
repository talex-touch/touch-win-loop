import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const INTROSPECT_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/introspect.post.ts')
const REPO_ARCH_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/repo-architecture.post.ts')
const CONNECTOR_FILE = resolve(process.cwd(), 'server/services/scene/data-source-connectors.ts')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')

it('flow tab 已改为 draw.io 工作台，并移除旧的 schema 导入控制区', async () => {
  const flowTabSource = await readFile(FLOW_TAB_FILE, 'utf8')
  const mainPanelSource = await readFile(MAIN_PANEL_FILE, 'utf8')

  assert.match(flowTabSource, /import WorkspaceDrawioCanvas from/, 'flow tab 未接入 draw.io 画布组件')
  assert.match(flowTabSource, /AgentProto/, 'flow tab 未声明 AgentProto 协作语义')
  assert.match(flowTabSource, /connectionToneClass|connectionLabel/, 'flow tab 未保留流程画布连接态标记')
  assert.match(flowTabSource, /@update:model-value="emit\('updateCollabDrawValue', \$event\)"/, 'flow tab 未把 draw.io XML 回写到协作状态')
  assert.match(flowTabSource, /暂未初始化流程画布/, 'flow tab 缺少空态')
  assert.doesNotMatch(flowTabSource, /type SceneImportMode = 'mermaid' \| 'markdown_outline' \| 'ddl' \| 'architecture' \| 'postgres_introspection'/, 'flow tab 仍残留旧的导入模式枚举')
  assert.doesNotMatch(flowTabSource, /label: 'Postgres'/, 'flow tab 仍残留 Postgres 导入入口')
  assert.doesNotMatch(flowTabSource, /导出 DDL|导出 Mermaid|扫描当前仓库|OpenAPI/, 'flow tab 仍残留旧的结构导入导出控制区')

  assert.match(mainPanelSource, /:project-id="props\.activeProjectId"/)
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
