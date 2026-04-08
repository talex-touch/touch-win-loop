import type { Queryable } from '~~/server/utils/db'
import type { AiChatMessage, AiChatSession, ChatMessage, WorkspaceAiMode } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

const CHAT_SESSION_MODE_SET = new Set<WorkspaceAiMode>([
  'dialog_ask',
  'auto_optimize',
  'issue_discovery',
  'defense',
])

interface AiChatSessionRow {
  id: string
  workspace_id: string
  project_id: string
  mode: string
  created_by_user_id: string
  title: string
  contest_id: string
  track_id: string
  major: string
  message_count: number | string
  last_message_at: string | null
  created_at: string
  updated_at: string
}

interface AiChatMessageRow {
  id: string
  workspace_id: string
  session_id: string
  role: ChatMessage['role']
  content: string
  provider: string
  model: string
  fallback_used: boolean
  metadata: unknown
  created_by_user_id: string
  created_at: string
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
      return {}
    }
    catch {
      return {}
    }
  }
  if (typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

function normalizeProjectId(value: unknown): string {
  return String(value || '').trim()
}

function normalizeChatSessionMode(value: unknown): WorkspaceAiMode {
  const text = String(value || '').trim() as WorkspaceAiMode
  if (CHAT_SESSION_MODE_SET.has(text))
    return text
  return 'dialog_ask'
}

function isStrictScopeSatisfied(
  strictScope: boolean,
  hasModeFilter: boolean,
  normalizedMode: WorkspaceAiMode,
  normalizedProjectId: string,
): boolean {
  if (!strictScope)
    return true
  if (!hasModeFilter)
    return false
  if (normalizedMode === 'dialog_ask')
    return true
  return Boolean(normalizedProjectId)
}

function mapChatSession(row: AiChatSessionRow): AiChatSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id || '',
    mode: normalizeChatSessionMode(row.mode),
    createdByUserId: row.created_by_user_id,
    title: row.title,
    contestId: row.contest_id || '',
    trackId: row.track_id || '',
    major: row.major || '',
    messageCount: Number(row.message_count || 0),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapChatMessage(row: AiChatMessageRow): AiChatMessage {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    fallbackUsed: Boolean(row.fallback_used),
    metadata: toMetadataRecord(row.metadata),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

export async function createAiChatSession(
  db: Queryable,
  input: {
    workspaceId: string
    projectId?: string
    mode?: WorkspaceAiMode
    createdByUserId: string
    title?: string
    contestId?: string
    trackId?: string
    major?: string
  },
): Promise<AiChatSession> {
  const result = await db.query<AiChatSessionRow>(
    `INSERT INTO ai_chat_sessions (
      id,
      workspace_id,
      project_id,
      mode,
      created_by_user_id,
      title,
      contest_id,
      track_id,
      major,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
    )
    RETURNING
      id,
      workspace_id,
      project_id,
      mode,
      created_by_user_id,
      title,
      contest_id,
      track_id,
      major,
      0::INT AS message_count,
      NULL::TEXT AS last_message_at,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.workspaceId,
      normalizeProjectId(input.projectId),
      normalizeChatSessionMode(input.mode),
      input.createdByUserId,
      String(input.title || '').trim() || 'Loopy 对话',
      String(input.contestId || '').trim(),
      String(input.trackId || '').trim(),
      String(input.major || '').trim(),
    ],
  )

  return mapChatSession(result.rows[0]!)
}

export async function listAiChatSessionsByWorkspace(
  db: Queryable,
  input: {
    workspaceId: string
    projectId?: string
    mode?: WorkspaceAiMode
    strictScope?: boolean
    limit?: number
  },
): Promise<AiChatSession[]> {
  const strictScope = Boolean(input.strictScope)
  const hasProjectFilter = input.projectId !== undefined
  const hasModeFilter = input.mode !== undefined
  const normalizedProjectId = hasProjectFilter ? normalizeProjectId(input.projectId) : ''
  const normalizedMode = hasModeFilter ? normalizeChatSessionMode(input.mode) : 'dialog_ask'

  if (!isStrictScopeSatisfied(strictScope, hasModeFilter, normalizedMode, normalizedProjectId))
    return []

  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)))
  const where: string[] = ['s.workspace_id = $1']
  const values: unknown[] = [input.workspaceId]

  if (hasProjectFilter) {
    values.push(normalizedProjectId)
    where.push(`s.project_id = $${values.length}`)
  }

  if (hasModeFilter) {
    values.push(normalizedMode)
    where.push(`s.mode = $${values.length}`)
  }

  values.push(limit)

  const result = await db.query<AiChatSessionRow>(
    `SELECT
      s.id,
      s.workspace_id,
      s.project_id,
      s.mode,
      s.created_by_user_id,
      s.title,
      s.contest_id,
      s.track_id,
      s.major,
      COALESCE(m.message_count, 0)::INT AS message_count,
      m.last_message_at,
      s.created_at::TEXT,
      s.updated_at::TEXT
     FROM ai_chat_sessions s
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE role IN ('user', 'assistant'))::INT AS message_count,
         MAX(created_at)::TEXT AS last_message_at
       FROM ai_chat_messages
       WHERE session_id = s.id
     ) m ON TRUE
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(m.last_message_at, s.updated_at::TEXT) DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(mapChatSession)
}

export async function getAiChatSessionById(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    projectId?: string
    mode?: WorkspaceAiMode
    strictScope?: boolean
  },
): Promise<AiChatSession | null> {
  const strictScope = Boolean(input.strictScope)
  const hasProjectFilter = input.projectId !== undefined
  const hasModeFilter = input.mode !== undefined
  const normalizedProjectId = hasProjectFilter ? normalizeProjectId(input.projectId) : ''
  const normalizedMode = hasModeFilter ? normalizeChatSessionMode(input.mode) : 'dialog_ask'

  if (!isStrictScopeSatisfied(strictScope, hasModeFilter, normalizedMode, normalizedProjectId))
    return null

  const where: string[] = ['s.workspace_id = $1', 's.id = $2']
  const values: unknown[] = [input.workspaceId, input.sessionId]

  if (hasProjectFilter) {
    values.push(normalizedProjectId)
    where.push(`s.project_id = $${values.length}`)
  }

  if (hasModeFilter) {
    values.push(normalizedMode)
    where.push(`s.mode = $${values.length}`)
  }

  const result = await db.query<AiChatSessionRow>(
    `SELECT
      s.id,
      s.workspace_id,
      s.project_id,
      s.mode,
      s.created_by_user_id,
      s.title,
      s.contest_id,
      s.track_id,
      s.major,
      COALESCE(m.message_count, 0)::INT AS message_count,
      m.last_message_at,
      s.created_at::TEXT,
      s.updated_at::TEXT
     FROM ai_chat_sessions s
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE role IN ('user', 'assistant'))::INT AS message_count,
         MAX(created_at)::TEXT AS last_message_at
       FROM ai_chat_messages
       WHERE session_id = s.id
     ) m ON TRUE
     WHERE ${where.join(' AND ')}
     LIMIT 1`,
    values,
  )

  const row = result.rows[0]
  return row ? mapChatSession(row) : null
}

export async function listAiChatMessagesBySession(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    projectId?: string
    mode?: WorkspaceAiMode
    strictScope?: boolean
    limit?: number
  },
): Promise<AiChatMessage[]> {
  const strictScope = Boolean(input.strictScope)
  const hasProjectFilter = input.projectId !== undefined
  const hasModeFilter = input.mode !== undefined
  const normalizedProjectId = hasProjectFilter ? normalizeProjectId(input.projectId) : ''
  const normalizedMode = hasModeFilter ? normalizeChatSessionMode(input.mode) : 'dialog_ask'

  if (!isStrictScopeSatisfied(strictScope, hasModeFilter, normalizedMode, normalizedProjectId))
    return []

  const limit = Math.max(1, Math.min(500, Number(input.limit || 200)))
  const where: string[] = [
    'm.workspace_id = $1',
    'm.session_id = $2',
  ]
  const values: unknown[] = [input.workspaceId, input.sessionId]

  if (hasProjectFilter) {
    values.push(normalizedProjectId)
    where.push(`s.project_id = $${values.length}`)
  }

  if (hasModeFilter) {
    values.push(normalizedMode)
    where.push(`s.mode = $${values.length}`)
  }

  values.push(limit)

  const result = await db.query<AiChatMessageRow>(
    `SELECT
      m.id,
      m.workspace_id,
      m.session_id,
      m.role,
      m.content,
      m.provider,
      m.model,
      m.fallback_used,
      m.metadata,
      m.created_by_user_id,
      m.created_at::TEXT
     FROM ai_chat_messages m
     JOIN ai_chat_sessions s
       ON s.id = m.session_id
      AND s.workspace_id = m.workspace_id
     WHERE ${where.join(' AND ')}
     ORDER BY m.created_at ASC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(mapChatMessage)
}

export async function appendAiChatMessage(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    role: ChatMessage['role']
    content: string
    provider: string
    model: string
    fallbackUsed: boolean
    metadata?: Record<string, unknown>
    createdByUserId: string
  },
): Promise<AiChatMessage> {
  const result = await db.query<AiChatMessageRow>(
    `INSERT INTO ai_chat_messages (
      id,
      workspace_id,
      session_id,
      role,
      content,
      provider,
      model,
      fallback_used,
      metadata,
      created_by_user_id,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, $10, NOW()
    )
    RETURNING
      id,
      workspace_id,
      session_id,
      role,
      content,
      provider,
      model,
      fallback_used,
      metadata,
      created_by_user_id,
      created_at::TEXT`,
    [
      randomUUID(),
      input.workspaceId,
      input.sessionId,
      input.role,
      input.content,
      input.provider,
      input.model,
      input.fallbackUsed,
      JSON.stringify(input.metadata || {}),
      input.createdByUserId,
    ],
  )

  await db.query(
    `UPDATE ai_chat_sessions
     SET updated_at = NOW()
     WHERE id = $1
       AND workspace_id = $2`,
    [input.sessionId, input.workspaceId],
  )

  return mapChatMessage(result.rows[0]!)
}

export async function patchAiChatSessionContext(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    projectId?: string
    mode?: WorkspaceAiMode
    contestId?: string
    trackId?: string
    major?: string
    title?: string
  },
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = [input.sessionId, input.workspaceId]

  const addSet = (field: string, value: unknown) => {
    values.push(value)
    sets.push(`${field} = $${values.length}`)
  }

  if (input.title !== undefined) {
    const title = String(input.title || '').trim()
    if (title)
      addSet('title', title)
  }

  if (input.projectId !== undefined)
    addSet('project_id', normalizeProjectId(input.projectId))

  if (input.mode !== undefined)
    addSet('mode', normalizeChatSessionMode(input.mode))

  if (input.contestId !== undefined)
    addSet('contest_id', String(input.contestId || '').trim())
  if (input.trackId !== undefined)
    addSet('track_id', String(input.trackId || '').trim())
  if (input.major !== undefined)
    addSet('major', String(input.major || '').trim())

  if (sets.length === 0)
    return

  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE ai_chat_sessions
     SET ${sets.join(', ')}
     WHERE id = $1
       AND workspace_id = $2`,
    values,
  )
}
