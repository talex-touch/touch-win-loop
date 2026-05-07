import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectResourceCommentAnchor,
  ProjectResourceCommentMessage,
  ProjectResourceCommentThread,
  ProjectResourceCommentThreadStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface CommentThreadRow {
  id: string
  project_id: string
  resource_id: string
  anchor_type: string
  anchor_json: Record<string, unknown> | string | null
  summary_text: string
  status: string
  resolved_by_user_id: string | null
  resolved_at: string | null
  created_by_user_id: string
  created_by_username: string | null
  created_by_avatar_url: string | null
  resolved_by_username: string | null
  created_at: string
  updated_at: string
}

interface CommentMessageRow {
  id: string
  project_id: string
  resource_id: string
  thread_id: string
  body: string
  created_by_user_id: string
  created_by_username: string | null
  created_by_avatar_url: string | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      return normalizeRecord(JSON.parse(value))
    }
    catch {
      return {}
    }
  }
  return normalizeRecord(value)
}

function normalizeCommentThreadStatus(value: unknown): ProjectResourceCommentThreadStatus {
  return normalizeString(value).toLowerCase() === 'resolved' ? 'resolved' : 'open'
}

function normalizeCommentAnchor(value: unknown): ProjectResourceCommentAnchor {
  const source = parseJsonRecord(value)
  if (normalizeString(source.type) === 'image_node') {
    return {
      type: 'image_node',
      resourceId: normalizeString(source.resourceId) || null,
      src: normalizeString(source.src),
      alt: normalizeString(source.alt) || null,
      title: normalizeString(source.title) || null,
    }
  }

  return {
    type: 'text_selection',
    anchor: normalizeRecord(source.anchor),
    head: normalizeRecord(source.head),
    selectedTextPreview: normalizeString(source.selectedTextPreview),
    headingText: normalizeString(source.headingText),
    anchorLine: Math.max(1, Math.trunc(Number(source.anchorLine) || 1)),
    anchorColumn: Math.max(1, Math.trunc(Number(source.anchorColumn) || 1)),
    headLine: Math.max(1, Math.trunc(Number(source.headLine) || 1)),
    headColumn: Math.max(1, Math.trunc(Number(source.headColumn) || 1)),
    selectionLength: Math.max(0, Math.trunc(Number(source.selectionLength) || 0)),
    isCollapsed: Boolean(source.isCollapsed),
  }
}

function serializeCommentAnchor(anchor: ProjectResourceCommentAnchor): string {
  return JSON.stringify(anchor)
}

function summarizeAnchor(anchor: ProjectResourceCommentAnchor): string {
  if (anchor.type === 'image_node')
    return normalizeString(anchor.title) || normalizeString(anchor.alt) || '图片评论'
  return normalizeString(anchor.selectedTextPreview) || normalizeString(anchor.headingText) || '文本评论'
}

function toCommentMessage(row: CommentMessageRow): ProjectResourceCommentMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    resourceId: row.resource_id,
    threadId: row.thread_id,
    body: normalizeString(row.body),
    createdByUserId: row.created_by_user_id,
    createdByUsername: row.created_by_username,
    createdByAvatarUrl: row.created_by_avatar_url,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function toCommentThread(row: CommentThreadRow, messages: ProjectResourceCommentMessage[]): ProjectResourceCommentThread {
  return {
    id: row.id,
    projectId: row.project_id,
    resourceId: row.resource_id,
    status: normalizeCommentThreadStatus(row.status),
    anchorType: normalizeString(row.anchor_type) === 'image_node' ? 'image_node' : 'text_selection',
    anchor: normalizeCommentAnchor(row.anchor_json),
    summaryText: normalizeString(row.summary_text),
    createdByUserId: row.created_by_user_id,
    createdByUsername: row.created_by_username,
    createdByAvatarUrl: row.created_by_avatar_url,
    resolvedByUserId: normalizeString(row.resolved_by_user_id) || null,
    resolvedByUsername: row.resolved_by_username,
    resolvedAt: normalizeString(row.resolved_at) || null,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
    messages,
  }
}

async function ensureProjectMarkdownResource(db: Queryable, input: { projectId: string, resourceId: string }): Promise<void> {
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM project_resources
     WHERE project_id = $1
       AND id = $2
       AND status = 'active'
       AND source = 'collab'
       AND resource_kind = 'markdown'
     LIMIT 1`,
    [input.projectId, input.resourceId],
  )

  if (!result.rows[0])
    throw new Error('RESOURCE_NOT_FOUND')
}

async function getThreadRows(db: Queryable, input: { projectId: string, resourceId: string, threadId?: string }): Promise<CommentThreadRow[]> {
  const values: unknown[] = [input.projectId, input.resourceId]
  const where: string[] = [
    'thread.project_id = $1',
    'thread.resource_id = $2',
  ]

  if (input.threadId) {
    values.push(input.threadId)
    where.push(`thread.id = $${values.length}`)
  }

  const result = await db.query<CommentThreadRow>(
    `SELECT
      thread.id,
      thread.project_id,
      thread.resource_id,
      thread.anchor_type,
      thread.anchor_json,
      thread.summary_text,
      thread.status,
      thread.resolved_by_user_id,
      thread.resolved_at::TEXT,
      thread.created_by_user_id,
      creator.username AS created_by_username,
      creator.avatar_url AS created_by_avatar_url,
      resolver.username AS resolved_by_username,
      thread.created_at::TEXT,
      thread.updated_at::TEXT
     FROM project_resource_comment_threads thread
     JOIN users creator
       ON creator.id = thread.created_by_user_id
     LEFT JOIN users resolver
       ON resolver.id = thread.resolved_by_user_id
     WHERE ${where.join(' AND ')}
     ORDER BY thread.updated_at DESC, thread.created_at DESC`,
    values,
  )

  return result.rows
}

async function getMessageRows(db: Queryable, input: { threadIds: string[] }): Promise<CommentMessageRow[]> {
  if (input.threadIds.length === 0)
    return []

  const result = await db.query<CommentMessageRow>(
    `SELECT
      message.id,
      message.project_id,
      message.resource_id,
      message.thread_id,
      message.body,
      message.created_by_user_id,
      creator.username AS created_by_username,
      creator.avatar_url AS created_by_avatar_url,
      message.created_at::TEXT,
      message.updated_at::TEXT
     FROM project_resource_comment_messages message
     JOIN users creator
       ON creator.id = message.created_by_user_id
     WHERE message.thread_id = ANY($1::TEXT[])
     ORDER BY message.created_at ASC`,
    [input.threadIds],
  )

  return result.rows
}

async function loadThreads(db: Queryable, input: { projectId: string, resourceId: string, threadId?: string }): Promise<ProjectResourceCommentThread[]> {
  const threadRows = await getThreadRows(db, input)
  if (threadRows.length === 0)
    return []

  const messageRows = await getMessageRows(db, { threadIds: threadRows.map(row => row.id) })
  const messagesByThreadId = new Map<string, ProjectResourceCommentMessage[]>()
  for (const row of messageRows) {
    const existing = messagesByThreadId.get(row.thread_id)
    const message = toCommentMessage(row)
    if (existing) {
      existing.push(message)
      continue
    }
    messagesByThreadId.set(row.thread_id, [message])
  }

  return threadRows.map(row => toCommentThread(row, messagesByThreadId.get(row.id) || []))
}

export async function listProjectResourceCommentThreads(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
  },
): Promise<ProjectResourceCommentThread[]> {
  await ensureProjectMarkdownResource(db, input)
  return loadThreads(db, input)
}

export async function createProjectResourceCommentThread(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    actorUserId: string
    anchor: ProjectResourceCommentAnchor
    body: string
  },
): Promise<ProjectResourceCommentThread> {
  await ensureProjectMarkdownResource(db, input)

  const body = normalizeString(input.body)
  if (!body)
    throw new Error('COMMENT_BODY_REQUIRED')

  const threadId = randomUUID()
  const messageId = randomUUID()
  const now = new Date().toISOString()
  const normalizedAnchor = normalizeCommentAnchor(input.anchor)
  const summaryText = summarizeAnchor(normalizedAnchor)

  await db.query(
    `INSERT INTO project_resource_comment_threads (
      id,
      project_id,
      resource_id,
      anchor_type,
      anchor_json,
      summary_text,
      status,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5::JSONB, $6, 'open', $7, $8, $8
    )`,
    [
      threadId,
      input.projectId,
      input.resourceId,
      normalizedAnchor.type,
      serializeCommentAnchor(normalizedAnchor),
      summaryText,
      input.actorUserId,
      now,
    ],
  )

  await db.query(
    `INSERT INTO project_resource_comment_messages (
      id,
      project_id,
      resource_id,
      thread_id,
      body,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $7
    )`,
    [
      messageId,
      input.projectId,
      input.resourceId,
      threadId,
      body,
      input.actorUserId,
      now,
    ],
  )

  const thread = await loadThreads(db, {
    projectId: input.projectId,
    resourceId: input.resourceId,
    threadId,
  })
  if (!thread[0])
    throw new Error('COMMENT_THREAD_NOT_FOUND')
  return thread[0]
}

export async function appendProjectResourceCommentMessage(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    threadId: string
    actorUserId: string
    body: string
  },
): Promise<ProjectResourceCommentThread> {
  await ensureProjectMarkdownResource(db, input)

  const body = normalizeString(input.body)
  if (!body)
    throw new Error('COMMENT_BODY_REQUIRED')

  const now = new Date().toISOString()
  const updated = await db.query<{ id: string }>(
    `UPDATE project_resource_comment_threads
     SET updated_at = $4
     WHERE project_id = $1
       AND resource_id = $2
       AND id = $3
     RETURNING id`,
    [input.projectId, input.resourceId, input.threadId, now],
  )

  if (!updated.rows[0])
    throw new Error('COMMENT_THREAD_NOT_FOUND')

  await db.query(
    `INSERT INTO project_resource_comment_messages (
      id,
      project_id,
      resource_id,
      thread_id,
      body,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $7
    )`,
    [
      randomUUID(),
      input.projectId,
      input.resourceId,
      input.threadId,
      body,
      input.actorUserId,
      now,
    ],
  )

  const thread = await loadThreads(db, input)
  if (!thread[0])
    throw new Error('COMMENT_THREAD_NOT_FOUND')
  return thread[0]
}

async function updateThreadStatus(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    threadId: string
    actorUserId: string
    status: ProjectResourceCommentThreadStatus
  },
): Promise<ProjectResourceCommentThread> {
  await ensureProjectMarkdownResource(db, input)

  const now = new Date().toISOString()
  const result = await db.query<{ id: string }>(
    `UPDATE project_resource_comment_threads
     SET status = $5,
         resolved_by_user_id = CASE WHEN $5 = 'resolved' THEN $4 ELSE NULL END,
         resolved_at = CASE WHEN $5 = 'resolved' THEN $6::TIMESTAMPTZ ELSE NULL END,
         updated_at = $6
     WHERE project_id = $1
       AND resource_id = $2
       AND id = $3
     RETURNING id`,
    [input.projectId, input.resourceId, input.threadId, input.actorUserId, input.status, now],
  )

  if (!result.rows[0])
    throw new Error('COMMENT_THREAD_NOT_FOUND')

  const thread = await loadThreads(db, input)
  if (!thread[0])
    throw new Error('COMMENT_THREAD_NOT_FOUND')
  return thread[0]
}

export async function resolveProjectResourceCommentThread(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    threadId: string
    actorUserId: string
  },
): Promise<ProjectResourceCommentThread> {
  return updateThreadStatus(db, {
    ...input,
    status: 'resolved',
  })
}

export async function reopenProjectResourceCommentThread(
  db: Queryable,
  input: {
    projectId: string
    resourceId: string
    threadId: string
    actorUserId: string
  },
): Promise<ProjectResourceCommentThread> {
  return updateThreadStatus(db, {
    ...input,
    status: 'open',
  })
}
