import type { Queryable } from '~~/server/utils/db'
import type { AiChatMessage, AiChatSession, ChatMessage } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface AiChatSessionRow {
  id: string
  workspace_id: string
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
  created_by_user_id: string
  created_at: string
}

function mapChatSession(row: AiChatSessionRow): AiChatSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
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
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  }
}

export async function createAiChatSession(
  db: Queryable,
  input: {
    workspaceId: string
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
      created_by_user_id,
      title,
      contest_id,
      track_id,
      major,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
    )
    RETURNING
      id,
      workspace_id,
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
      input.createdByUserId,
      String(input.title || '').trim() || 'AI 对话',
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
    limit?: number
  },
): Promise<AiChatSession[]> {
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)))
  const result = await db.query<AiChatSessionRow>(
    `SELECT
      s.id,
      s.workspace_id,
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
         COUNT(*)::INT AS message_count,
         MAX(created_at)::TEXT AS last_message_at
       FROM ai_chat_messages
       WHERE session_id = s.id
     ) m ON TRUE
     WHERE s.workspace_id = $1
     ORDER BY COALESCE(m.last_message_at, s.updated_at::TEXT) DESC
     LIMIT $2`,
    [input.workspaceId, limit],
  )

  return result.rows.map(mapChatSession)
}

export async function getAiChatSessionById(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
  },
): Promise<AiChatSession | null> {
  const result = await db.query<AiChatSessionRow>(
    `SELECT
      s.id,
      s.workspace_id,
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
         COUNT(*)::INT AS message_count,
         MAX(created_at)::TEXT AS last_message_at
       FROM ai_chat_messages
       WHERE session_id = s.id
     ) m ON TRUE
     WHERE s.workspace_id = $1
       AND s.id = $2
     LIMIT 1`,
    [input.workspaceId, input.sessionId],
  )

  const row = result.rows[0]
  return row ? mapChatSession(row) : null
}

export async function listAiChatMessagesBySession(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    limit?: number
  },
): Promise<AiChatMessage[]> {
  const limit = Math.max(1, Math.min(500, Number(input.limit || 200)))
  const result = await db.query<AiChatMessageRow>(
    `SELECT
      id,
      workspace_id,
      session_id,
      role,
      content,
      provider,
      model,
      fallback_used,
      created_by_user_id,
      created_at::TEXT
     FROM ai_chat_messages
     WHERE workspace_id = $1
       AND session_id = $2
     ORDER BY created_at ASC
     LIMIT $3`,
    [input.workspaceId, input.sessionId, limit],
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
      created_by_user_id,
      created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
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
