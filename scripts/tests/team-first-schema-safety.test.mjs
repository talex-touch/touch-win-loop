import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DB_MIGRATE_FILE = resolve(process.cwd(), 'scripts/db-migrate.mjs')
const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const COMPATIBILITY_FILE = resolve(process.cwd(), 'server/database/bootstrap/compatibility.ts')
const RESTORE_MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-04-15-restore-workspace-schema-from-team-first.sql')

it('hard cutover migration requires explicit env confirmation', async () => {
  const source = await readFile(DB_MIGRATE_FILE, 'utf8')

  assert.match(source, /WINLOOP_ALLOW_HARD_CUTOVER/, 'db migrate 缺少 hard cutover 显式确认环境变量')
  assert.match(source, /hard-cutover/i, 'db migrate 未识别 hard cutover 迁移命名')
  assert.match(source, /process\.exit\(1\)/, 'db migrate 未在未确认时中断 hard cutover 迁移')
})

it('db bootstrap performs team-first schema compatibility preflight', async () => {
  const dbSource = await readFile(DB_FILE, 'utf8')
  const compatibilitySource = await readFile(COMPATIBILITY_FILE, 'utf8')

  assert.match(dbSource, /assertWorkspaceSchemaCompatible/, 'db.ts 未在 schema bootstrap 前执行兼容性预检')
  assert.match(compatibilitySource, /team_id/, 'compatibility 检查未覆盖 team_id 残留列')
  assert.match(compatibilitySource, /teams/, 'compatibility 检查未覆盖 teams 残留表')
  assert.match(compatibilitySource, /relkind = 'r'/, 'compatibility 预检未忽略 Team-First 遗留视图，仍会误判兼容 schema')
  assert.match(compatibilitySource, /FROM information_schema\.columns c/, 'compatibility 预检的 team_id 查询缺少 columns 别名，运行时会触发 SQL 语法错误')
})

it('db bootstrap is memoized per process and resets pool on bootstrap failure', async () => {
  const dbSource = await readFile(DB_FILE, 'utf8')

  assert.match(dbSource, /let bootstrapReady = false/, 'db.ts 未声明 bootstrapReady 状态')
  assert.match(dbSource, /let bootstrapPromise: Promise<void> \| null = null/, 'db.ts 未声明 bootstrapPromise 状态')
  assert.match(dbSource, /async function ensureBootstrapReady\(poolRef: PgPoolType\)/, 'db.ts 缺少 bootstrap 单次化封装')
  assert.match(dbSource, /if \(bootstrapReady\)\s+return/, 'db.ts 未在 bootstrap 完成后快速返回')
  assert.match(dbSource, /if \(!bootstrapPromise\)/, 'db.ts 未复用并发 bootstrap promise')
  assert.match(dbSource, /await bootstrapPromise/, 'db.ts 未等待共享 bootstrap promise')
  assert.match(dbSource, /await resetPool\(poolRef\)/, 'db.ts 未在 bootstrap 失败时重置连接池')
  assert.match(dbSource, /await poolRef\.end\(\)/, 'db.ts 未在 bootstrap 失败时关闭旧连接池')
})

it('repo contains a rollback migration for team-first hard cutover', async () => {
  const source = await readFile(RESTORE_MIGRATION_FILE, 'utf8')

  assert.match(source, /DROP VIEW public\.%I/, '回滚迁移未清理遗留 Team-First 兼容视图')
  assert.match(source, /DROP TRIGGER IF EXISTS %I ON %I\.%I/, '回滚迁移未清理 sync_team_workspace_ids 触发器')
  assert.match(source, /DROP FUNCTION IF EXISTS public\.sync_team_workspace_ids\(\) CASCADE;/, '回滚迁移未清理 sync_team_workspace_ids 桥接函数')
  assert.match(source, /ALTER TABLE public\.teams RENAME TO workspaces;/, '回滚迁移未恢复 teams -> workspaces')
  assert.match(source, /RENAME COLUMN team_id TO workspace_id/, '回滚迁移未恢复 team_id -> workspace_id')
  assert.match(source, /DROP COLUMN team_id CASCADE/, '回滚迁移未处理双列共存场景')
})
