import type { Pool as PgPoolType, QueryResultRow } from 'pg'

interface TablePresenceRow extends QueryResultRow {
  table_name: string
}

interface ColumnPresenceRow extends QueryResultRow {
  table_name: string
}

const COMPATIBILITY_MISMATCH_MESSAGE = [
  '检测到数据库处于 Team-First hard cutover schema（teams/team_id）或其残留状态。',
  '当前服务代码仍以 workspaces/workspace_id 为唯一有效 schema。',
  '请先执行 scripts/migrations/2026-04-15-restore-workspace-schema-from-team-first.sql，再重启服务。',
].join('')

export async function assertWorkspaceSchemaCompatible(poolRef: PgPoolType): Promise<void> {
  const [tableResult, columnResult] = await Promise.all([
    poolRef.query<TablePresenceRow>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('teams', 'team_members', 'team_billing')`,
    ),
    poolRef.query<ColumnPresenceRow>(
      `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'team_id'
       ORDER BY table_name ASC`,
    ),
  ])

  if (tableResult.rows.length === 0 && columnResult.rows.length === 0)
    return

  const details = [
    tableResult.rows.length > 0
      ? `tables=${tableResult.rows.map(row => row.table_name).join(',')}`
      : '',
    columnResult.rows.length > 0
      ? `team_id_tables=${columnResult.rows.map(row => row.table_name).join(',')}`
      : '',
  ].filter(Boolean)

  throw new Error(`${COMPATIBILITY_MISMATCH_MESSAGE}${details.length > 0 ? ` ${details.join(' ')}` : ''}`)
}
