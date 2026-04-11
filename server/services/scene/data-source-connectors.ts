import type {
  ArchitectureImportResult,
  DataSourceConnector,
  SchemaImportResult,
  SceneDocument,
} from '~~/shared/types/domain'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve as resolvePath } from 'node:path'
import { Client as PgClient } from 'pg'
import YAML from 'yaml'
import {
  importArchitectureFromMetadata,
  importFromDDL,
  importFromMermaid,
  renderCompositionAssetToSvg,
  relayoutSceneDocument,
} from '~~/shared/utils/scene-document'

interface PostgresColumnRow {
  table_schema: string
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

interface PostgresPrimaryKeyRow {
  table_schema: string
  table_name: string
  column_name: string
  ordinal_position: number
}

interface PostgresForeignKeyRow {
  table_schema: string
  table_name: string
  column_name: string
  foreign_table_schema: string
  foreign_table_name: string
  foreign_column_name: string
  constraint_name: string
}

interface PostgresIndexRow {
  table_schema: string
  table_name: string
  index_name: string
  is_unique: boolean
  column_names: string[] | null
}

interface PostgresCommentRow {
  table_schema: string
  table_name: string
  table_comment: string | null
  column_name: string | null
  column_comment: string | null
}

interface RepoArchitectureScanResult extends ArchitectureImportResult {
  workspaceName: string
  packageManifestCount: number
  workspacePatterns: string[]
}

const REPO_SCAN_IGNORED_DIRS = new Set([
  '.git',
  '.nuxt',
  '.output',
  'node_modules',
  'dist',
  'coverage',
  'tmp',
])
const REPO_SCAN_MAX_DEPTH = 4

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return normalizeRecord(JSON.parse(raw))
  }
  catch {
    return {}
  }
}

async function readYamlRecord(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, 'utf8')
    return normalizeRecord(YAML.parse(raw))
  }
  catch {
    return {}
  }
}

async function collectPackageManifestPaths(rootDir: string, depth = 0): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isFile() && entry.name === 'package.json') {
      results.push(fullPath)
      continue
    }

    if (!entry.isDirectory())
      continue
    if (depth >= REPO_SCAN_MAX_DEPTH)
      continue
    if (REPO_SCAN_IGNORED_DIRS.has(entry.name))
      continue

    results.push(...await collectPackageManifestPaths(fullPath, depth + 1))
  }

  return results
}

export const SCENE_DATA_SOURCE_CONNECTORS: DataSourceConnector[] = [
  {
    key: 'ddl',
    title: 'DDL Adapter',
    type: 'ddl',
    readonly: true,
    capabilities: ['importFromDDL'],
  },
  {
    key: 'mermaid',
    title: 'Mermaid Adapter',
    type: 'mermaid',
    readonly: true,
    capabilities: ['importMermaid'],
  },
  {
    key: 'repo-architecture',
    title: 'Repo Architecture Adapter',
    type: 'repo_arch',
    readonly: true,
    capabilities: ['importRepoArchitecture'],
  },
  {
    key: 'postgres-introspection',
    title: 'Postgres Introspection Adapter',
    type: 'db_introspection',
    readonly: true,
    capabilities: ['introspectDatabase'],
  },
  {
    key: 'composition-renderer',
    title: 'Template Renderer',
    type: 'composition_render',
    readonly: true,
    capabilities: ['renderCompositionAsset'],
  },
]

export function importFromDDLSource(ddl: string): SchemaImportResult {
  return importFromDDL(ddl)
}

export function importMermaidSource(source: string): SceneDocument {
  return importFromMermaid(source)
}

export function importRepoArchitecture(source: string | Record<string, unknown>): ArchitectureImportResult {
  return importArchitectureFromMetadata(source)
}

export async function scanRepoArchitecture(input: { rootDir?: string } = {}): Promise<RepoArchitectureScanResult> {
  const repoRoot = resolvePath(normalizeString(input.rootDir) || process.cwd())
  const rootPackage = await readJsonRecord(join(repoRoot, 'package.json'))
  const pnpmWorkspace = await readYamlRecord(join(repoRoot, 'pnpm-workspace.yaml'))
  const workspacePatterns = Array.isArray(pnpmWorkspace.packages)
    ? pnpmWorkspace.packages.map(item => normalizeString(item)).filter(Boolean)
    : []

  const manifestPaths = await collectPackageManifestPaths(repoRoot)
  const packageManifests: Record<string, unknown>[] = []
  for (const manifestPath of manifestPaths) {
    const payload = await readJsonRecord(manifestPath)
    if (Object.keys(payload).length === 0)
      continue

    const manifestDir = relative(repoRoot, dirname(manifestPath)) || '.'
    packageManifests.push({
      ...payload,
      path: manifestDir,
    })
  }

  if (packageManifests.length === 0 && Object.keys(rootPackage).length === 0)
    throw new Error('REPO_ARCHITECTURE_MANIFESTS_NOT_FOUND')

  const workspaceName = normalizeString(rootPackage.name) || basename(repoRoot) || 'Workspace'
  const result = importRepoArchitecture({
    workspaceName,
    packages: workspacePatterns,
    packageManifests,
    packageManager: normalizeString(rootPackage.packageManager),
    tool: Object.keys(pnpmWorkspace).length > 0 ? 'pnpm-workspace' : 'package-json',
  })

  if (packageManifests.length === 0)
    result.warnings.push('当前仓库未扫描到 package.json，结果可能只包含 workspace 元数据。')

  return {
    ...result,
    workspaceName,
    packageManifestCount: packageManifests.length,
    workspacePatterns,
  }
}

export async function introspectDatabase(input: {
  connectionString: string
  dialect?: 'postgres' | 'mysql'
  schemaNames?: string[]
}): Promise<SchemaImportResult> {
  const dialect = input.dialect || 'postgres'
  if (dialect === 'mysql')
    throw new Error('MYSQL_INTROSPECTION_NOT_SUPPORTED_YET')

  const client = new PgClient({
    connectionString: input.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    statement_timeout: 10000,
    application_name: 'winloop-scene-introspection',
  })
  await client.connect()

  try {
    const schemaNames = input.schemaNames && input.schemaNames.length > 0
      ? input.schemaNames
      : ['public']

    const columns = await client.query<PostgresColumnRow>(
      `SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = ANY($1::text[])
      ORDER BY table_schema, table_name, ordinal_position`,
      [schemaNames],
    )

    const primaryKeys = await client.query<PostgresPrimaryKeyRow>(
      `SELECT
         tc.table_schema,
         tc.table_name,
         kcu.column_name,
         kcu.ordinal_position
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = ANY($1::text[])
       ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position`,
      [schemaNames],
    )

    const foreignKeys = await client.query<PostgresForeignKeyRow>(
      `SELECT
         tc.table_schema,
         tc.table_name,
         kcu.column_name,
         ccu.table_schema AS foreign_table_schema,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name,
         tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = ANY($1::text[])`,
      [schemaNames],
    )

    const indexes = await client.query<PostgresIndexRow>(
      `SELECT
         ns.nspname AS table_schema,
         tbl.relname AS table_name,
         idx.relname AS index_name,
         i.indisunique AS is_unique,
         array_remove(array_agg(att.attname ORDER BY ord.ordinality), NULL) AS column_names
       FROM pg_class tbl
       JOIN pg_namespace ns
         ON ns.oid = tbl.relnamespace
       JOIN pg_index i
         ON i.indrelid = tbl.oid
       JOIN pg_class idx
         ON idx.oid = i.indexrelid
       LEFT JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS ord(attnum, ordinality)
         ON TRUE
       LEFT JOIN pg_attribute att
         ON att.attrelid = tbl.oid
        AND att.attnum = ord.attnum
       WHERE tbl.relkind = 'r'
         AND ns.nspname = ANY($1::text[])
       GROUP BY ns.nspname, tbl.relname, idx.relname, i.indisunique
       ORDER BY ns.nspname, tbl.relname, idx.relname`,
      [schemaNames],
    )

    const comments = await client.query<PostgresCommentRow>(
      `SELECT
         ns.nspname AS table_schema,
         cls.relname AS table_name,
         obj_description(cls.oid, 'pg_class') AS table_comment,
         attr.attname AS column_name,
         col_description(cls.oid, attr.attnum) AS column_comment
       FROM pg_class cls
       JOIN pg_namespace ns
         ON ns.oid = cls.relnamespace
       LEFT JOIN pg_attribute attr
         ON attr.attrelid = cls.oid
        AND attr.attnum > 0
        AND NOT attr.attisdropped
       WHERE cls.relkind = 'r'
         AND ns.nspname = ANY($1::text[])
       ORDER BY ns.nspname, cls.relname, attr.attnum`,
      [schemaNames],
    )

    const tableMap = new Map<string, {
      schemaName: string
      tableName: string
      columns: Array<{
        name: string
        type: string
        nullable: boolean
        defaultValue?: string
        comment?: string
        isPrimaryKey?: boolean
      }>
      primaryKeys: string[]
      foreignKeys: Array<{
        name: string
        columns: string[]
        referencedTable: string
        referencedColumns: string[]
      }>
      indexes: Array<{
        name: string
        columns: string[]
        unique?: boolean
      }>
      comment?: string
    }>()

    for (const row of columns.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      const entry = tableMap.get(key) || {
        schemaName: row.table_schema,
        tableName: row.table_name,
        columns: [],
        primaryKeys: [],
        foreignKeys: [],
        indexes: [],
      }
      entry.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default || undefined,
      })
      tableMap.set(key, entry)
    }

    for (const row of primaryKeys.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      const entry = tableMap.get(key)
      if (!entry)
        continue

      if (!entry.primaryKeys.includes(row.column_name))
        entry.primaryKeys.push(row.column_name)

      const targetColumn = entry.columns.find(column => column.name === row.column_name)
      if (targetColumn)
        targetColumn.isPrimaryKey = true
    }

    for (const row of foreignKeys.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      const entry = tableMap.get(key)
      if (!entry)
        continue
      entry.foreignKeys.push({
        name: row.constraint_name,
        columns: [row.column_name],
        referencedTable: row.foreign_table_name,
        referencedColumns: [row.foreign_column_name],
      })

      const targetColumn = entry.columns.find(column => column.name === row.column_name)
      if (targetColumn) {
        targetColumn.referencesTable = row.foreign_table_name
        targetColumn.referencesColumn = row.foreign_column_name
      }
    }

    for (const row of indexes.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      const entry = tableMap.get(key)
      if (!entry)
        continue
      entry.indexes.push({
        name: row.index_name,
        columns: Array.isArray(row.column_names) ? row.column_names.filter(Boolean) : [],
        unique: Boolean(row.is_unique),
      })
    }

    for (const row of comments.rows) {
      const key = `${row.table_schema}.${row.table_name}`
      const entry = tableMap.get(key)
      if (!entry)
        continue

      if (row.table_comment && !entry.comment)
        entry.comment = row.table_comment

      if (row.column_name && row.column_comment) {
        const targetColumn = entry.columns.find(column => column.name === row.column_name)
        if (targetColumn)
          targetColumn.comment = row.column_comment
      }
    }

    const schemaResult = importFromDDL('')
    schemaResult.schemaModel.dialect = 'postgres'
    schemaResult.schemaModel.tables = [...tableMap.values()].map(table => ({
      name: table.tableName,
      schemaName: table.schemaName,
      columns: table.columns.map(column => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        defaultValue: column.defaultValue,
        comment: column.comment,
        isPrimaryKey: column.isPrimaryKey,
        referencesTable: column.referencesTable,
        referencesColumn: column.referencesColumn,
      })),
      foreignKeys: table.foreignKeys,
      indexes: table.indexes,
      primaryKeys: table.primaryKeys,
      comment: table.comment,
      metadata: {},
    }))
    schemaResult.warnings = schemaResult.schemaModel.tables.length > 0
      ? []
      : [`未在 schema: ${schemaNames.join(', ')} 中读取到表结构。`]
    schemaResult.sceneDocument = relayoutSceneDocument({
      ...schemaResult.sceneDocument,
      drawMode: 'schema',
      sourceType: 'db_introspection',
      sourceModel: schemaResult.schemaModel,
    })
    return schemaResult
  }
  finally {
    await client.end().catch(() => {})
  }
}

export function renderCompositionAsset(document: SceneDocument | unknown): string {
  return renderCompositionAssetToSvg(document)
}
