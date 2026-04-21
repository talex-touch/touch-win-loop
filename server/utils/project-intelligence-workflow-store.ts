import type { Queryable } from '~~/server/utils/db'
import type {
  AiWorkflowDefinition,
  AiWorkflowDefinitionPayload,
  AiWorkflowRun,
  AiWorkflowRunReviewContext,
  AiWorkflowRunStatus,
  AiWorkflowRunStep,
  AiWorkflowRunStepStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import {
  normalizeAiWorkflowDefinitionPayload,
  normalizeAiWorkflowRunTriggerPayload,
} from '~~/server/services/ai/intelligence-workflow-definition'

interface AiWorkflowDefinitionRow {
  id: string
  workspace_id: string
  project_id: string
  name: string
  description: string
  definition_json: unknown
  created_by_user_id: string
  updated_by_user_id: string
  archived_at: string | null
  created_at: string
  updated_at: string
}

interface AiWorkflowRunRow {
  id: string
  workflow_id: string
  workspace_id: string
  project_id: string
  status: AiWorkflowRunStatus
  trigger_json: unknown
  trigger_payload_json: unknown
  definition_snapshot_json: unknown
  runtime_state_json: unknown
  latest_step_index: number
  created_by_user_id: string
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface AiWorkflowRunStepRow {
  id: string
  run_id: string
  workflow_id: string
  step_id: string
  step_index: number
  step_name: string
  step_type: AiWorkflowRunStep['type']
  status: AiWorkflowRunStepStatus
  tool_key: string
  agent_mode: string
  continue_on_error: boolean
  input_json: unknown
  output_json: unknown
  review_context_json: unknown
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    }
    catch {
      return {}
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function safeNormalizeDefinitionPayload(value: unknown): AiWorkflowDefinitionPayload {
  try {
    return normalizeAiWorkflowDefinitionPayload(value)
  }
  catch {
    return {
      name: '未命名智能工作流',
      description: '',
      trigger: { type: 'manual' },
      contextSources: ['project.settings', 'project.outline', 'resource.selection'],
      toolAllowlist: [],
      steps: [],
    }
  }
}

function normalizeReviewContext(value: unknown): AiWorkflowRunReviewContext | null {
  const source = normalizeRecord(value)
  const kind = normalizeString(source.kind)
  if (kind !== 'project_change_request')
    return null

  const rawIds = Array.isArray(source.changeRequestIds) ? source.changeRequestIds : []
  const changeRequestIds = rawIds.map(item => normalizeString(item)).filter(Boolean)
  if (changeRequestIds.length === 0)
    return null

  return {
    kind: 'project_change_request',
    changeRequestIds,
  }
}

function mapDefinition(row: AiWorkflowDefinitionRow): AiWorkflowDefinition {
  const definition = safeNormalizeDefinitionPayload(row.definition_json)
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    ...definition,
    name: normalizeString(row.name) || definition.name,
    description: normalizeString(row.description) || definition.description,
  }
}

function mapRun(row: AiWorkflowRunRow): AiWorkflowRun {
  const definitionSnapshot = safeNormalizeDefinitionPayload(row.definition_snapshot_json)
  const runtimeState = normalizeRecord(row.runtime_state_json)
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    status: row.status,
    trigger: {
      type: normalizeString(normalizeRecord(row.trigger_json).type) === 'resource.batch' ? 'resource.batch' : 'manual',
    },
    triggerPayload: normalizeAiWorkflowRunTriggerPayload(row.trigger_payload_json),
    definitionSnapshot,
    runtimeState,
    latestStepIndex: Number.isFinite(Number(row.latest_step_index)) ? Number(row.latest_step_index) : -1,
    createdByUserId: row.created_by_user_id,
    errorMessage: normalizeString(row.error_message) || undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRunStep(row: AiWorkflowRunStepRow): AiWorkflowRunStep {
  const input = normalizeRecord(row.input_json)
  const output = normalizeRecord(row.output_json)
  return {
    id: row.id,
    runId: row.run_id,
    workflowId: row.workflow_id,
    stepId: row.step_id,
    stepIndex: Number(row.step_index || 0),
    name: normalizeString(row.step_name) || `步骤 ${Number(row.step_index || 0) + 1}`,
    type: row.step_type,
    status: row.status,
    toolKey: normalizeString(row.tool_key) || undefined,
    agentMode: normalizeString(row.agent_mode) || undefined,
    continueOnError: Boolean(row.continue_on_error),
    input: Object.keys(input).length > 0 ? input : undefined,
    output: Object.keys(output).length > 0 ? output : undefined,
    errorMessage: normalizeString(row.error_message) || undefined,
    reviewContext: normalizeReviewContext(row.review_context_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAiWorkflowDefinitionsByProject(
  db: Queryable,
  projectId: string,
): Promise<AiWorkflowDefinition[]> {
  const result = await db.query<AiWorkflowDefinitionRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      name,
      description,
      definition_json,
      created_by_user_id,
      updated_by_user_id,
      archived_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_definitions
     WHERE project_id = $1
       AND archived_at IS NULL
     ORDER BY updated_at DESC, created_at DESC`,
    [projectId],
  )
  return result.rows.map(mapDefinition)
}

export async function getAiWorkflowDefinitionById(
  db: Queryable,
  input: {
    projectId: string
    workflowId: string
    includeArchived?: boolean
  },
): Promise<AiWorkflowDefinition | null> {
  const result = await db.query<AiWorkflowDefinitionRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      name,
      description,
      definition_json,
      created_by_user_id,
      updated_by_user_id,
      archived_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_definitions
     WHERE project_id = $1
       AND id = $2
       AND ($3::BOOLEAN OR archived_at IS NULL)
     LIMIT 1`,
    [input.projectId, input.workflowId, Boolean(input.includeArchived)],
  )
  const row = result.rows[0]
  return row ? mapDefinition(row) : null
}

export async function saveAiWorkflowDefinition(
  db: Queryable,
  input: {
    workflowId?: string
    workspaceId: string
    projectId: string
    createdByUserId: string
    updatedByUserId: string
    definition: AiWorkflowDefinitionPayload
  },
): Promise<AiWorkflowDefinition> {
  const workflowId = normalizeString(input.workflowId) || randomUUID()
  const definition = normalizeAiWorkflowDefinitionPayload(input.definition)
  const result = await db.query<AiWorkflowDefinitionRow>(
    `INSERT INTO ai_workflow_definitions (
      id,
      workspace_id,
      project_id,
      name,
      description,
      definition_json,
      created_by_user_id,
      updated_by_user_id,
      archived_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7, $8, NULL, NOW(), NOW()
    )
    ON CONFLICT (id) DO UPDATE
      SET workspace_id = EXCLUDED.workspace_id,
          project_id = EXCLUDED.project_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          definition_json = EXCLUDED.definition_json,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          archived_at = NULL,
          updated_at = NOW()
      WHERE ai_workflow_definitions.project_id = EXCLUDED.project_id
    RETURNING
      id,
      workspace_id,
      project_id,
      name,
      description,
      definition_json,
      created_by_user_id,
      updated_by_user_id,
      archived_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      workflowId,
      input.workspaceId,
      input.projectId,
      definition.name,
      definition.description,
      JSON.stringify(definition),
      input.createdByUserId,
      input.updatedByUserId,
    ],
  )
  const row = result.rows[0]
  if (!row)
    throw new Error('WORKFLOW_DEFINITION_SCOPE_CONFLICT')
  return mapDefinition(row)
}

export async function archiveAiWorkflowDefinition(
  db: Queryable,
  input: {
    projectId: string
    workflowId: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE ai_workflow_definitions
        SET archived_at = NOW(),
            updated_at = NOW()
      WHERE project_id = $1
        AND id = $2
        AND archived_at IS NULL`,
    [input.projectId, input.workflowId],
  )
  return Number(result.rowCount || 0) > 0
}

export async function createAiWorkflowRun(
  db: Queryable,
  input: {
    workflowId: string
    workspaceId: string
    projectId: string
    status?: AiWorkflowRunStatus
    trigger: AiWorkflowRun['trigger']
    triggerPayload?: Record<string, unknown>
    definitionSnapshot: AiWorkflowDefinitionPayload
    runtimeState?: Record<string, unknown>
    latestStepIndex?: number
    createdByUserId: string
    errorMessage?: string
    startedAt?: string | null
    completedAt?: string | null
  },
): Promise<AiWorkflowRun> {
  const result = await db.query<AiWorkflowRunRow>(
    `INSERT INTO ai_workflow_runs (
      id,
      workflow_id,
      workspace_id,
      project_id,
      status,
      trigger_json,
      trigger_payload_json,
      definition_snapshot_json,
      runtime_state_json,
      latest_step_index,
      created_by_user_id,
      error_message,
      started_at,
      completed_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7::JSONB, $8::JSONB, $9::JSONB, $10, $11, $12, $13::TIMESTAMPTZ, $14::TIMESTAMPTZ, NOW(), NOW()
    )
    RETURNING
      id,
      workflow_id,
      workspace_id,
      project_id,
      status,
      trigger_json,
      trigger_payload_json,
      definition_snapshot_json,
      runtime_state_json,
      latest_step_index,
      created_by_user_id,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.workflowId,
      input.workspaceId,
      input.projectId,
      input.status || 'pending',
      JSON.stringify(input.trigger || { type: 'manual' }),
      JSON.stringify(normalizeAiWorkflowRunTriggerPayload(input.triggerPayload || {})),
      JSON.stringify(normalizeAiWorkflowDefinitionPayload(input.definitionSnapshot)),
      JSON.stringify(input.runtimeState || {}),
      Number.isFinite(Number(input.latestStepIndex)) ? Number(input.latestStepIndex) : -1,
      input.createdByUserId,
      normalizeString(input.errorMessage),
      input.startedAt || null,
      input.completedAt || null,
    ],
  )
  return mapRun(result.rows[0]!)
}

export async function listAiWorkflowRunSteps(
  db: Queryable,
  runId: string,
): Promise<AiWorkflowRunStep[]> {
  const result = await db.query<AiWorkflowRunStepRow>(
    `SELECT
      id,
      run_id,
      workflow_id,
      step_id,
      step_index,
      step_name,
      step_type,
      status,
      tool_key,
      agent_mode,
      continue_on_error,
      input_json,
      output_json,
      review_context_json,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_run_steps
     WHERE run_id = $1
     ORDER BY step_index ASC, created_at ASC`,
    [runId],
  )
  return result.rows.map(mapRunStep)
}

export async function getAiWorkflowRunById(
  db: Queryable,
  input: {
    projectId: string
    runId: string
    includeSteps?: boolean
  },
): Promise<AiWorkflowRun | null> {
  const result = await db.query<AiWorkflowRunRow>(
    `SELECT
      id,
      workflow_id,
      workspace_id,
      project_id,
      status,
      trigger_json,
      trigger_payload_json,
      definition_snapshot_json,
      runtime_state_json,
      latest_step_index,
      created_by_user_id,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_runs
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, input.runId],
  )
  const row = result.rows[0]
  if (!row)
    return null
  const run = mapRun(row)
  if (input.includeSteps)
    run.steps = await listAiWorkflowRunSteps(db, run.id)
  return run
}

export async function listAiWorkflowRunsByProject(
  db: Queryable,
  input: {
    projectId: string
    workflowId?: string
    limit?: number
    includeSteps?: boolean
  },
): Promise<AiWorkflowRun[]> {
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20)))
  const result = await db.query<AiWorkflowRunRow>(
    `SELECT
      id,
      workflow_id,
      workspace_id,
      project_id,
      status,
      trigger_json,
      trigger_payload_json,
      definition_snapshot_json,
      runtime_state_json,
      latest_step_index,
      created_by_user_id,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_runs
     WHERE project_id = $1
       AND ($2::TEXT = '' OR workflow_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.projectId, normalizeString(input.workflowId), limit],
  )

  const runs = result.rows.map(mapRun)
  if (!input.includeSteps || runs.length === 0)
    return runs

  const stepResult = await db.query<AiWorkflowRunStepRow>(
    `SELECT
      id,
      run_id,
      workflow_id,
      step_id,
      step_index,
      step_name,
      step_type,
      status,
      tool_key,
      agent_mode,
      continue_on_error,
      input_json,
      output_json,
      review_context_json,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT
     FROM ai_workflow_run_steps
     WHERE run_id = ANY($1::TEXT[])
     ORDER BY step_index ASC, created_at ASC`,
    [runs.map(run => run.id)],
  )
  const stepMap = new Map<string, AiWorkflowRunStep[]>()
  for (const row of stepResult.rows) {
    const mapped = mapRunStep(row)
    const list = stepMap.get(mapped.runId) || []
    list.push(mapped)
    stepMap.set(mapped.runId, list)
  }

  for (const run of runs)
    run.steps = stepMap.get(run.id) || []

  return runs
}

export async function saveAiWorkflowRunStep(
  db: Queryable,
  input: {
    runId: string
    workflowId: string
    stepId: string
    stepIndex: number
    name: string
    type: AiWorkflowRunStep['type']
    status?: AiWorkflowRunStepStatus
    toolKey?: string
    agentMode?: string
    continueOnError?: boolean
    input?: Record<string, unknown>
    output?: Record<string, unknown>
    reviewContext?: Record<string, unknown> | null
    errorMessage?: string
    startedAt?: string | null
    completedAt?: string | null
  },
): Promise<AiWorkflowRunStep> {
  const result = await db.query<AiWorkflowRunStepRow>(
    `INSERT INTO ai_workflow_run_steps (
      id,
      run_id,
      workflow_id,
      step_id,
      step_index,
      step_name,
      step_type,
      status,
      tool_key,
      agent_mode,
      continue_on_error,
      input_json,
      output_json,
      review_context_json,
      error_message,
      started_at,
      completed_at,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::JSONB, $13::JSONB, $14::JSONB, $15, $16::TIMESTAMPTZ, $17::TIMESTAMPTZ, NOW(), NOW()
    )
    ON CONFLICT (run_id, step_index) DO UPDATE
      SET workflow_id = EXCLUDED.workflow_id,
          step_id = EXCLUDED.step_id,
          step_name = EXCLUDED.step_name,
          step_type = EXCLUDED.step_type,
          status = EXCLUDED.status,
          tool_key = EXCLUDED.tool_key,
          agent_mode = EXCLUDED.agent_mode,
          continue_on_error = EXCLUDED.continue_on_error,
          input_json = EXCLUDED.input_json,
          output_json = EXCLUDED.output_json,
          review_context_json = EXCLUDED.review_context_json,
          error_message = EXCLUDED.error_message,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          updated_at = NOW()
    RETURNING
      id,
      run_id,
      workflow_id,
      step_id,
      step_index,
      step_name,
      step_type,
      status,
      tool_key,
      agent_mode,
      continue_on_error,
      input_json,
      output_json,
      review_context_json,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.runId,
      input.workflowId,
      input.stepId,
      input.stepIndex,
      normalizeString(input.name),
      input.type,
      input.status || 'pending',
      normalizeString(input.toolKey),
      normalizeString(input.agentMode),
      Boolean(input.continueOnError),
      JSON.stringify(input.input || {}),
      JSON.stringify(input.output || {}),
      JSON.stringify(input.reviewContext || {}),
      normalizeString(input.errorMessage),
      input.startedAt || null,
      input.completedAt || null,
    ],
  )
  return mapRunStep(result.rows[0]!)
}

export async function patchAiWorkflowRun(
  db: Queryable,
  input: {
    projectId: string
    runId: string
    status?: AiWorkflowRunStatus
    latestStepIndex?: number
    runtimeState?: Record<string, unknown>
    errorMessage?: string | null
    startedAt?: string | null
    completedAt?: string | null
  },
): Promise<AiWorkflowRun | null> {
  const current = await getAiWorkflowRunById(db, {
    projectId: input.projectId,
    runId: input.runId,
    includeSteps: false,
  })
  if (!current)
    return null

  const nextStatus = input.status || current.status
  const nextLatestStepIndex = Number.isFinite(Number(input.latestStepIndex))
    ? Number(input.latestStepIndex)
    : current.latestStepIndex
  const nextRuntimeState = input.runtimeState === undefined
    ? (current.runtimeState || {})
    : input.runtimeState
  const nextErrorMessage = input.errorMessage === undefined
    ? normalizeString(current.errorMessage)
    : normalizeString(input.errorMessage)
  const nextStartedAt = input.startedAt === undefined ? current.startedAt || null : input.startedAt
  const nextCompletedAt = input.completedAt === undefined ? current.completedAt || null : input.completedAt

  const result = await db.query<AiWorkflowRunRow>(
    `UPDATE ai_workflow_runs
        SET status = $3,
            latest_step_index = $4,
            runtime_state_json = $5::JSONB,
            error_message = $6,
            started_at = $7::TIMESTAMPTZ,
            completed_at = $8::TIMESTAMPTZ,
            updated_at = NOW()
      WHERE project_id = $1
        AND id = $2
    RETURNING
      id,
      workflow_id,
      workspace_id,
      project_id,
      status,
      trigger_json,
      trigger_payload_json,
      definition_snapshot_json,
      runtime_state_json,
      latest_step_index,
      created_by_user_id,
      error_message,
      started_at::TEXT,
      completed_at::TEXT,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      input.projectId,
      input.runId,
      nextStatus,
      nextLatestStepIndex,
      JSON.stringify(nextRuntimeState || {}),
      nextErrorMessage,
      nextStartedAt || null,
      nextCompletedAt || null,
    ],
  )
  const row = result.rows[0]
  return row ? mapRun(row) : null
}
