import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const FLOW_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFlowTab.vue')
const INTROSPECT_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/introspect.post.ts')
const REPO_ARCH_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/scene/repo-architecture.post.ts')
const CONNECTOR_FILE = resolve(process.cwd(), 'server/services/scene/data-source-connectors.ts')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')

it('flow tab 已接入 Postgres introspection 入口，并可将 schema scene 导入当前画布', async () => {
  const flowTabSource = await readFile(FLOW_TAB_FILE, 'utf8')
  const mainPanelSource = await readFile(MAIN_PANEL_FILE, 'utf8')

  assert.match(flowTabSource, /type SceneImportMode = 'mermaid' \| 'markdown_outline' \| 'ddl' \| 'architecture' \| 'postgres_introspection'/)
  assert.match(flowTabSource, /label: 'Postgres'/)
  assert.match(flowTabSource, /\/projects\/\$\{projectId\}\/scene\/introspect/)
  assert.match(flowTabSource, /只读 metadata introspection/)
  assert.match(flowTabSource, /emit\('updateCollabDrawValue', serializeSceneDocument\(document\)\)/)
  assert.match(flowTabSource, /导出 DDL/)
  assert.match(flowTabSource, /exportSchemaModelToDDL/)
  assert.match(flowTabSource, /导出 Mermaid/)
  assert.match(flowTabSource, /exportArchitectureModelToMermaid/)
  assert.match(flowTabSource, /type ArchitectureMermaidView = 'system_context' \| 'container' \| 'dependency_map'/)
  assert.match(flowTabSource, /const architectureView = ref<ArchitectureMermaidView>\('dependency_map'\)/)
  assert.match(flowTabSource, /architecture-system-context\.mmd/)
  assert.match(flowTabSource, /architecture-container\.mmd/)
  assert.match(flowTabSource, /architecture-dependency-map\.mmd/)
  assert.match(flowTabSource, /canonical -> mermaid \{\{ architectureView \}\}/)
  assert.match(flowTabSource, /parseSceneDocumentString/)
  assert.match(flowTabSource, /docker-compose/)
  assert.match(flowTabSource, /workspace manifests/)
  assert.match(flowTabSource, /package\.json/)
  assert.match(flowTabSource, /OpenAPI/)
  assert.match(flowTabSource, /扫描当前仓库/)
  assert.match(flowTabSource, /\/projects\/\$\{projectId\}\/scene\/repo-architecture/)
  assert.match(flowTabSource, /importRepoArchitectureScene/)

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
