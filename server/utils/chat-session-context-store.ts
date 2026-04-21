import type {
  AiChatSessionContextSnapshot,
  AiChatSessionRunState,
  AiWorkspaceDocumentSelectionRange,
  WorkspaceAiAssistantPreset,
  WorkspaceAiMode,
  WorkspaceContextualAssistantKey,
} from '~~/shared/types/domain'
import type { Queryable } from '~~/server/utils/db'

interface AiChatSessionContextRow {
  session_id: string
  workspace_id: string
  project_id: string
  mode: string
  context_json: unknown
  run_state_json: unknown
  last_checkpoint_ref: string
  last_error: string
  updated_at: string
  last_active_at: string
}

export interface AiChatSessionContextRecord {
  sessionId: string
  workspaceId: string
  projectId: string
  mode: WorkspaceAiMode
  contextSnapshot: AiChatSessionContextSnapshot | null
  runState: AiChatSessionRunState
  lastCheckpointRef?: string
  lastError?: string
  updatedAt: string
  lastActiveAt: string
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeMode(value: unknown): WorkspaceAiMode {
  const text = toText(value) as WorkspaceAiMode
  if (
    text === 'dialog_ask'
    || text === 'auto_optimize'
    || text === 'issue_discovery'
    || text === 'defense'
    || text === 'document_assist'
    || text === 'contextual_agent'
  ) {
    return text
  }
  return 'dialog_ask'
}

function normalizeRecord(value: unknown): Record<string, unknown> {
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

function normalizeSelectionRange(value: unknown): AiWorkspaceDocumentSelectionRange | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const source = value as Record<string, unknown>
  const anchorLine = Number(source.anchorLine)
  const anchorColumn = Number(source.anchorColumn)
  const headLine = Number(source.headLine)
  const headColumn = Number(source.headColumn)
  const selectionLength = Number(source.selectionLength)
  if (![anchorLine, anchorColumn, headLine, headColumn, selectionLength].every(Number.isFinite))
    return null
  return {
    anchorLine,
    anchorColumn,
    headLine,
    headColumn,
    selectionLength,
    isCollapsed: Boolean(source.isCollapsed),
  }
}

export function normalizeAiChatSessionContextSnapshot(value: unknown): AiChatSessionContextSnapshot | null {
  const source = normalizeRecord(value)
  if (Object.keys(source).length === 0)
    return null

  const snapshot: AiChatSessionContextSnapshot = {
    resourceId: toText(source.resourceId),
    resourceTitle: toText(source.resourceTitle),
    previewMode: toText(source.previewMode),
    contextualAssistantKey: toText(source.contextualAssistantKey) as WorkspaceContextualAssistantKey | '',
    assistantPreset: (toText(source.assistantPreset) || 'default') as WorkspaceAiAssistantPreset,
    assistantLabel: toText(source.assistantLabel),
    selectionText: toText(source.selectionText),
    selectionRange: normalizeSelectionRange(source.selectionRange),
    activeTabId: toText(source.activeTabId),
    resourcePurpose: toText(source.resourcePurpose) as AiChatSessionContextSnapshot['resourcePurpose'],
    requestedAgentAction: toText(source.requestedAgentAction) as AiChatSessionContextSnapshot['requestedAgentAction'],
    workflowSnapshot: source.workflowSnapshot && typeof source.workflowSnapshot === 'object' && !Array.isArray(source.workflowSnapshot)
      ? source.workflowSnapshot as AiChatSessionContextSnapshot['workflowSnapshot']
      : null,
    sceneHash: toText(source.sceneHash),
    sceneSourceFormat: toText(source.sceneSourceFormat) as AiChatSessionContextSnapshot['sceneSourceFormat'],
    sceneSourceText: toText(source.sceneSourceText),
    updatedAt: toText(source.updatedAt) || undefined,
  }

  return Object.values(snapshot).some(value => {
    if (typeof value === 'string')
      return Boolean(value)
    return value != null
  })
    ? snapshot
    : null
}

export function normalizeAiChatSessionRunState(value: unknown): AiChatSessionRunState {
  const source = normalizeRecord(value)
  const status = toText(source.status)
  return {
    status: status === 'running' || status === 'interrupted' || status === 'completed' || status === 'failed'
      ? status
      : 'idle',
    lastEventSeq: Number.isFinite(Number(source.lastEventSeq)) ? Number(source.lastEventSeq) : undefined,
    lastCheckpointRef: toText(source.lastCheckpointRef) || undefined,
    lastError: toText(source.lastError) || undefined,
    degraded: typeof source.degraded === 'boolean' ? source.degraded : undefined,
    degradedReason: toText(source.degradedReason) || undefined,
    resumeAvailable: typeof source.resumeAvailable === 'boolean' ? source.resumeAvailable : undefined,
    updatedAt: toText(source.updatedAt) || undefined,
  }
}

function mergeContextSnapshot(
  current: AiChatSessionContextSnapshot | null,
  next?: Partial<AiChatSessionContextSnapshot>,
): AiChatSessionContextSnapshot | null {
  if (!next)
    return current
  const merged = {
    ...(current || {}),
    ...next,
  }
  return normalizeAiChatSessionContextSnapshot(merged)
}

function mergeRunState(current: AiChatSessionRunState, next?: Partial<AiChatSessionRunState>): AiChatSessionRunState {
  if (!next)
    return current
  return normalizeAiChatSessionRunState({
    ...current,
    ...next,
  })
}

function mapContextRow(row: AiChatSessionContextRow): AiChatSessionContextRecord {
  return {
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id || '',
    mode: normalizeMode(row.mode),
    contextSnapshot: normalizeAiChatSessionContextSnapshot(row.context_json),
    runState: normalizeAiChatSessionRunState({
      ...normalizeRecord(row.run_state_json),
      lastCheckpointRef: toText(row.last_checkpoint_ref) || normalizeRecord(row.run_state_json).lastCheckpointRef,
      lastError: toText(row.last_error) || normalizeRecord(row.run_state_json).lastError,
      updatedAt: row.updated_at,
    }),
    lastCheckpointRef: toText(row.last_checkpoint_ref) || undefined,
    lastError: toText(row.last_error) || undefined,
    updatedAt: row.updated_at,
    lastActiveAt: row.last_active_at,
  }
}

export async function getAiChatSessionContext(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
  },
): Promise<AiChatSessionContextRecord | null> {
  const result = await db.query<AiChatSessionContextRow>(
    `SELECT
      session_id,
      workspace_id,
      project_id,
      mode,
      context_json,
      run_state_json,
      last_checkpoint_ref,
      last_error,
      updated_at::TEXT,
      last_active_at::TEXT
     FROM ai_chat_session_context
     WHERE workspace_id = $1
       AND session_id = $2
     LIMIT 1`,
    [input.workspaceId, input.sessionId],
  )
  const row = result.rows[0]
  return row ? mapContextRow(row) : null
}

export async function upsertAiChatSessionContext(
  db: Queryable,
  input: {
    workspaceId: string
    sessionId: string
    projectId?: string
    mode?: WorkspaceAiMode
    contextSnapshot?: Partial<AiChatSessionContextSnapshot>
    runState?: Partial<AiChatSessionRunState>
    lastCheckpointRef?: string | null
    lastError?: string | null
    touchActiveAt?: boolean
  },
): Promise<AiChatSessionContextRecord> {
  const current = await getAiChatSessionContext(db, {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
  })

  const nextContext = mergeContextSnapshot(current?.contextSnapshot || null, input.contextSnapshot)
  const nextRunState = mergeRunState(
    current?.runState || { status: 'idle', resumeAvailable: false },
    input.runState,
  )
  const lastCheckpointRef = input.lastCheckpointRef === undefined
    ? (current?.lastCheckpointRef || '')
    : toText(input.lastCheckpointRef)
  const lastError = input.lastError === undefined
    ? (current?.lastError || '')
    : toText(input.lastError)

  const result = await db.query<AiChatSessionContextRow>(
    `INSERT INTO ai_chat_session_context (
      session_id,
      workspace_id,
      project_id,
      mode,
      context_json,
      run_state_json,
      last_checkpoint_ref,
      last_error,
      created_at,
      updated_at,
      last_active_at
    ) VALUES (
      $1, $2, $3, $4, $5::JSONB, $6::JSONB, $7, $8, NOW(), NOW(), NOW()
    )
    ON CONFLICT (session_id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          project_id = EXCLUDED.project_id,
          mode = EXCLUDED.mode,
          context_json = EXCLUDED.context_json,
          run_state_json = EXCLUDED.run_state_json,
          last_checkpoint_ref = EXCLUDED.last_checkpoint_ref,
          last_error = EXCLUDED.last_error,
          updated_at = NOW(),
          last_active_at = CASE
            WHEN $9::BOOLEAN THEN NOW()
            ELSE ai_chat_session_context.last_active_at
          END
    RETURNING
      session_id,
      workspace_id,
      project_id,
      mode,
      context_json,
      run_state_json,
      last_checkpoint_ref,
      last_error,
      updated_at::TEXT,
      last_active_at::TEXT`,
    [
      input.sessionId,
      input.workspaceId,
      toText(input.projectId || current?.projectId),
      normalizeMode(input.mode || current?.mode),
      JSON.stringify(nextContext || {}),
      JSON.stringify({
        ...nextRunState,
        lastCheckpointRef: lastCheckpointRef || undefined,
        lastError: lastError || undefined,
      }),
      lastCheckpointRef,
      lastError,
      input.touchActiveAt !== false,
    ],
  )

  return mapContextRow(result.rows[0]!)
}
