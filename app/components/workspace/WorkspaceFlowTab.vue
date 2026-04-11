<script setup lang="ts">
import type { ApiResponse, ArchitectureImportResult, SceneDocument, SchemaImportResult } from '~~/shared/types/domain'
import type { WorkspaceCollabCursorUser, WorkspaceCollabPresenceUser } from '~/components/workspace/collab/presence'
import { computed, ref } from 'vue'
import WorkspaceTldrawCanvas from '~/components/workspace/collab/WorkspaceTldrawCanvas.client.vue'
import {
  exportArchitectureModelToMermaid,
  exportSchemaModelToDDL,
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMarkdownOutline,
  importFromMermaid,
  parseSceneDocumentString,
  serializeSceneDocument,
} from '~~/shared/utils/scene-document'

type SceneImportMode = 'mermaid' | 'markdown_outline' | 'ddl' | 'architecture' | 'postgres_introspection'
type ArchitectureMermaidView = 'system_context' | 'container' | 'dependency_map'

const props = withDefaults(defineProps<{
  projectId?: string
  hasFlowResource?: boolean
  flowPanelTitle?: string
  flowResourceId?: string
  collabRevision?: number
  collabConnected?: boolean
  collabConnectionText?: string
  collabPresenceUsers?: WorkspaceCollabPresenceUser[]
  collabPresenceCursors?: WorkspaceCollabCursorUser[]
  collabDrawValue?: string
  collabDrawError?: string
}>(), {
  projectId: '',
  hasFlowResource: false,
  flowPanelTitle: '流程画布',
  flowResourceId: '',
  collabRevision: 0,
  collabConnected: false,
  collabConnectionText: '',
  collabPresenceUsers: () => [],
  collabPresenceCursors: () => [],
  collabDrawValue: '{}',
  collabDrawError: '',
})

const emit = defineEmits<{
  updateCollabDrawValue: [value: string]
  updateCollabCursor: [value: { cursorX?: number, cursorY?: number }]
}>()

const authApiFetch = useAuthApiFetch()

const importPanelOpen = ref(true)
const importMode = ref<SceneImportMode>('mermaid')
const importSource = ref(`flowchart TD
产品需求 --> 结构源
结构源 --> SceneDocument
SceneDocument --> 模板
模板 --> 导出资产`)
const importError = ref('')
const importSummary = ref('可以直接粘贴 Mermaid、Markdown 大纲、DDL、架构关系文本、workspace manifests，或连接 Postgres 只读导入 schema。')
const importing = ref(false)

const postgresConnectionString = ref('')
const postgresSchemasText = ref('public')
const architectureView = ref<ArchitectureMermaidView>('dependency_map')

const architectureViewOptions: Array<{ value: ArchitectureMermaidView, label: string, fileName: string }> = [
  { value: 'system_context', label: 'System Context', fileName: 'architecture-system-context.mmd' },
  { value: 'container', label: 'Container', fileName: 'architecture-container.mmd' },
  { value: 'dependency_map', label: 'Dependency Map', fileName: 'architecture-dependency-map.mmd' },
]

const importModeOptions: Array<{ value: SceneImportMode, label: string, placeholder: string, example: string }> = [
  {
    value: 'mermaid',
    label: 'Mermaid',
    placeholder: '粘贴 Mermaid flowchart / graph 文本',
    example: `flowchart TD
入口 --> 解析
解析 --> SceneDocument
SceneDocument --> 导出`,
  },
  {
    value: 'markdown_outline',
    label: 'Markdown 大纲',
    placeholder: '粘贴 Markdown 标题或列表，自动生成脑图结构',
    example: `# 统一场景平台
- Diagram
  - Mermaid 导入
  - Markdown 大纲
- Schema
  - DDL
  - DB introspection`,
  },
  {
    value: 'ddl',
    label: 'DDL',
    placeholder: '粘贴 SQL DDL，自动转 SchemaModel / ERD',
    example: `CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY,
  user_id BIGINT REFERENCES users(id)
);`,
  },
  {
    value: 'architecture',
    label: '架构元数据',
    placeholder: '粘贴依赖关系文本、docker-compose、workspace manifests、package.json 或 OpenAPI JSON/YAML',
    example: `services:
  web:
    image: nginx:latest
    depends_on:
      - api
  api:
    image: node:20
    depends_on:
      - postgres
      - redis
  postgres:
    image: postgres:16
  redis:
    image: redis:7`,
  },
  {
    value: 'postgres_introspection',
    label: 'Postgres',
    placeholder: '输入 Postgres 连接串和 schema 名称，执行只读 metadata introspection',
    example: 'postgresql://user:password@127.0.0.1:5432/app',
  },
]

const currentImportOption = computed(() => {
  return importModeOptions.find(option => option.value === importMode.value) || importModeOptions[0]!
})

const connectionToneClass = computed(() => {
  return props.collabConnected ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-amber-700 border-amber-200 bg-amber-50'
})

const isTextImportMode = computed(() => importMode.value !== 'postgres_introspection')
const currentSceneDocument = computed(() => {
  return parseSceneDocumentString(String(props.collabDrawValue || ''), {
    fallbackDrawMode: 'diagram',
    fallbackSourceType: 'manual',
  })
})
const isSchemaScene = computed(() => currentSceneDocument.value.sourceModel.kind === 'schema')
const isArchitectureScene = computed(() => currentSceneDocument.value.sourceModel.kind === 'architecture')
const exportedDdl = computed(() => {
  if (!isSchemaScene.value)
    return ''
  return exportSchemaModelToDDL(currentSceneDocument.value)
})
const exportedArchitectureMermaid = computed(() => {
  if (!isArchitectureScene.value)
    return ''
  return exportArchitectureModelToMermaid(currentSceneDocument.value, architectureView.value)
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSchemaNames(text: string): string[] {
  return String(text || '')
    .split(/[\n,，、;\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function applyImportExample(): void {
  if (importMode.value === 'postgres_introspection') {
    postgresConnectionString.value = currentImportOption.value.example
    postgresSchemasText.value = 'public'
    return
  }
  importSource.value = currentImportOption.value.example
}

function applyStructuredSceneToCanvas(document: SceneDocument): void {
  emit('updateCollabDrawValue', serializeSceneDocument(document))
}

function downloadCurrentSchemaDdl(): void {
  if (!import.meta.client || !exportedDdl.value)
    return

  const blob = new Blob([exportedDdl.value], { type: 'text/sql;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'schema-export.sql'
  link.click()
  URL.revokeObjectURL(url)
}

function downloadCurrentArchitectureMermaid(): void {
  if (!import.meta.client || !exportedArchitectureMermaid.value)
    return

  const blob = new Blob([exportedArchitectureMermaid.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = architectureViewOptions.find(option => option.value === architectureView.value)?.fileName || 'architecture-export.mmd'
  link.click()
  URL.revokeObjectURL(url)
}

async function importPostgresSchema(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  const connectionString = normalizeString(postgresConnectionString.value)
  const schemaNames = normalizeSchemaNames(postgresSchemasText.value)

  if (!projectId) {
    importError.value = '缺少项目上下文，暂时无法发起 schema introspection。'
    return
  }

  if (!connectionString) {
    importError.value = '请输入 Postgres 连接串。'
    return
  }

  importing.value = true
  importError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<{
      schemaModel: SchemaImportResult['schemaModel']
      sceneDocument: SceneDocument
      warnings: string[]
    }>>(`/projects/${projectId}/scene/introspect`, {
      method: 'POST',
      body: {
        dialect: 'postgres',
        connectionString,
        schemaNames,
      },
    })

    applyStructuredSceneToCanvas(response.data.sceneDocument)
    importSummary.value = `已从 Postgres 读取 ${response.data.schemaModel.tables.length} 张表，并生成 SchemaModel / ERD。`
    if (Array.isArray(response.data.warnings) && response.data.warnings.length > 0)
      importSummary.value = `${importSummary.value} ${response.data.warnings.join(' ')}`
  }
  catch (error: any) {
    importError.value = String(error?.data?.message || 'Postgres schema 导入失败，请检查连接串、schema 和网络连通性。')
  }
  finally {
    importing.value = false
  }
}

async function importRepoArchitectureScene(): Promise<void> {
  const projectId = normalizeString(props.projectId)
  if (!projectId) {
    importError.value = '缺少项目上下文，暂时无法执行仓库结构扫描。'
    return
  }

  importing.value = true
  importError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<{
      architectureModel: ArchitectureImportResult['architectureModel']
      sceneDocument: SceneDocument
      warnings: string[]
      workspaceName: string
      packageManifestCount: number
      workspacePatterns: string[]
    }>>(`/projects/${projectId}/scene/repo-architecture`, {
      method: 'POST',
    })

    applyStructuredSceneToCanvas(response.data.sceneDocument)
    importSummary.value = `已扫描工作区 ${response.data.workspaceName}，识别 ${response.data.packageManifestCount} 个 package manifests 并生成 architecture scene。`
    if (Array.isArray(response.data.warnings) && response.data.warnings.length > 0)
      importSummary.value = `${importSummary.value} ${response.data.warnings.join(' ')}`
  }
  catch (error: any) {
    importError.value = String(error?.data?.message || '仓库结构导入失败，请检查服务端工作区是否存在 package.json / workspace manifests。')
  }
  finally {
    importing.value = false
  }
}

async function importStructuredScene(): Promise<void> {
  try {
    importError.value = ''

    if (importMode.value === 'postgres_introspection') {
      await importPostgresSchema()
      return
    }

    let document: SceneDocument
    if (importMode.value === 'mermaid')
      document = importFromMermaid(importSource.value)
    else if (importMode.value === 'markdown_outline')
      document = importFromMarkdownOutline(importSource.value)
    else if (importMode.value === 'ddl')
      document = importFromDDL(importSource.value).sceneDocument
    else
      document = importArchitectureFromMetadata(importSource.value).sceneDocument

    applyStructuredSceneToCanvas(document)
    importSummary.value = `已导入 ${currentImportOption.value.label}，当前以结构化 SceneDocument 进入画布。`
  }
  catch (error) {
    importError.value = error instanceof Error ? error.message : '结构源导入失败，请检查输入格式。'
  }
}
</script>

<template>
  <div class="h-full min-h-0 w-full">
    <div class="bg-white flex h-full min-h-0 overflow-hidden">
      <aside class="w-[360px] shrink-0 border-r border-slate-200 bg-slate-50/80">
        <div class="border-b border-slate-200 bg-white px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-slate-900">
                结构源导入
              </div>
              <p class="mt-1 text-[11px] leading-5 text-slate-500">
                把文本、DDL 或 Postgres metadata 先编译成 SceneDocument，再进入统一图形链路。
              </p>
            </div>
            <button
              class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
              type="button"
              @click="importPanelOpen = !importPanelOpen"
            >
              {{ importPanelOpen ? '收起' : '展开' }}
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <span class="rounded-full border px-2.5 py-1 text-[11px] font-semibold" :class="connectionToneClass">
              {{ props.hasFlowResource ? props.collabConnectionText : '待初始化' }}
            </span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {{ props.flowPanelTitle }}
            </span>
          </div>
        </div>

        <div v-if="importPanelOpen" class="flex h-[calc(100%-96px)] flex-col">
          <div class="border-b border-slate-200 px-4 py-3">
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="option in importModeOptions"
                :key="option.value"
                class="rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors"
                :class="importMode === option.value ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                type="button"
                @click="importMode = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="flex-1 space-y-3 overflow-auto px-4 py-4">
            <template v-if="isTextImportMode">
              <div>
                <div class="mb-1 text-[11px] font-semibold text-slate-700">
                  输入源
                </div>
                <textarea
                  v-model="importSource"
                  class="min-h-[280px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-[11px] leading-5 text-slate-700 outline-none focus:border-blue-500"
                  :placeholder="currentImportOption.placeholder"
                />
              </div>
            </template>

            <template v-else>
              <div class="space-y-3">
                <label class="block space-y-1">
                  <span class="text-[11px] font-semibold text-slate-700">Postgres 连接串</span>
                  <textarea
                    v-model="postgresConnectionString"
                    class="min-h-[112px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 font-mono text-[11px] leading-5 text-slate-700 outline-none focus:border-blue-500"
                    placeholder="postgresql://user:password@127.0.0.1:5432/app"
                  />
                </label>

                <label class="block space-y-1">
                  <span class="text-[11px] font-semibold text-slate-700">Schema 列表</span>
                  <input
                    v-model="postgresSchemasText"
                    class="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500"
                    placeholder="public, app"
                    type="text"
                  >
                </label>

                <div class="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] leading-6 text-amber-700">
                  只读 metadata introspection：仅访问 `information_schema` / `pg_catalog`，不读取业务数据，不执行 DDL / DML。
                </div>
              </div>
            </template>

            <div class="flex gap-2">
              <button
                class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                type="button"
                @click="applyImportExample"
              >
                填充示例
              </button>
              <button
                class="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                type="button"
                :disabled="importing"
                @click="importStructuredScene"
              >
                {{ importing ? '导入中...' : '导入到画布' }}
              </button>
              <button
                v-if="importMode === 'architecture'"
                class="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                :disabled="importing"
                @click="importRepoArchitectureScene"
              >
                扫描当前仓库
              </button>
              <button
                v-if="isSchemaScene"
                class="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                :disabled="!exportedDdl"
                @click="downloadCurrentSchemaDdl"
              >
                导出 DDL
              </button>
              <button
                v-if="isArchitectureScene"
                class="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                :disabled="!exportedArchitectureMermaid"
                @click="downloadCurrentArchitectureMermaid"
              >
                导出 Mermaid
              </button>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div class="text-[11px] font-semibold text-slate-700">
                导入说明
              </div>
              <p class="mt-2 text-[11px] leading-6 text-slate-500">
                {{ importSummary }}
              </p>
              <p v-if="importError" class="mt-2 text-[11px] leading-6 text-rose-600">
                {{ importError }}
              </p>
            </div>

            <div v-if="isSchemaScene" class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="text-[11px] font-semibold text-slate-700">
                  当前 Schema DDL
                </div>
                <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                  canonical -> ddl
                </span>
              </div>
              <pre class="mt-2 max-h-[240px] overflow-auto rounded-2xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{{ exportedDdl || '-- 当前 schema scene 暂无可导出的表结构' }}</pre>
            </div>

            <div v-if="isArchitectureScene" class="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-[11px] font-semibold text-slate-700">
                    当前 Architecture Mermaid
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="option in architectureViewOptions"
                      :key="option.value"
                      class="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors"
                      :class="architectureView === option.value ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'"
                      type="button"
                      @click="architectureView = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
                </div>
                <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                  canonical -> mermaid {{ architectureView }}
                </span>
              </div>
              <pre class="mt-2 max-h-[240px] overflow-auto rounded-2xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{{ exportedArchitectureMermaid || '-- 当前 architecture scene 暂无可导出的 Mermaid' }}</pre>
            </div>
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1">
        <div v-if="props.hasFlowResource" class="flex h-full min-h-0 flex-col">
          <WorkspaceTldrawCanvas
            :key="props.flowResourceId || 'flow-canvas'"
            class="h-full min-h-0 w-full"
            :model-value="props.collabDrawValue"
            :remote-cursors="props.collabPresenceCursors"
            :persistence-key="`workspace-flow-${props.flowResourceId || 'default'}`"
            :readonly="false"
            @update:model-value="emit('updateCollabDrawValue', $event)"
            @update-collab-cursor="emit('updateCollabCursor', $event)"
          />
          <p v-if="props.collabDrawError" class="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[11px] text-rose-600">
            {{ props.collabDrawError }}
          </p>
        </div>

        <div v-else class="px-6 bg-slate-50 flex h-full items-center justify-center">
          <div class="max-w-md rounded-xl border border-slate-300 border-dashed bg-white px-6 py-8 text-center">
            <span class="material-symbols-outlined text-3xl text-blue-600">flowsheet</span>
            <h3 class="mt-3 text-sm font-semibold text-slate-800">
              暂未初始化流程画布
            </h3>
            <p class="mt-2 text-[12px] leading-6 text-slate-500">
              从左侧“流程”入口进入时，系统会自动为当前项目创建并打开唯一的主流程画布。
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
