import type { Queryable } from '~~/server/utils/db'
import type {
  AiDefenseAttachment,
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefenseScorecard,
  AiDefenseSessionState,
  AiDefenseStage,
  AiDefenseSummary,
  AiDefenseSummaryStatus,
  AiDefenseSummaryType,
  AiDefenseTurn,
  RubricDimension,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface ProjectDefensePersonaRow {
  id: string
  project_id: string
  source_contest_id: string | null
  source_track_id: string | null
  source_template_key: string
  judge_type: AiDefensePersonaJudgeType
  name: string
  summary: string
  system_prompt: string
  focus_json: unknown
  scoring_json: unknown
  enabled: boolean
  sort_order: number | string
  is_customized: boolean
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

interface ProjectDefenseSessionStateRow {
  session_id: string
  project_id: string
  workspace_id: string
  current_stage: AiDefenseStage
  turn_count: number | string
  selected_persona_ids_json: unknown
  summary_status: AiDefenseSummaryStatus
  summary_resource_id: string | null
  linked_meeting_id: string | null
  last_input_mode: AiDefenseSessionState['lastInputMode']
  last_context_pack_json: unknown
  last_scorecard_json: unknown
  created_at: string
  updated_at: string
}

interface ProjectDefenseTurnRow {
  id: string
  session_id: string
  project_id: string
  stage: AiDefenseStage
  turn_index: number | string
  persona_id: string | null
  judge_type: AiDefensePersonaJudgeType
  judge_name: string
  question: string
  comment: string
  follow_up: string
  score: number | string
  evidence_json: unknown
  attachment_json: unknown
  metadata_json: unknown
  created_at: string
}

interface ProjectDefenseSummaryRow {
  id: string
  session_id: string
  project_id: string
  summary_type: AiDefenseSummaryType
  turn_index: number | string | null
  status: AiDefenseSummaryStatus
  summary_json: unknown
  markdown: string
  resource_id: string | null
  created_by_user_id: string
  created_at: string
  updated_at: string
  session_title?: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return fallback
  return parsed
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value
    .map(item => normalizeString(item))
    .filter(Boolean)
}

function normalizeRubricDimensions(value: unknown): RubricDimension[] {
  if (!Array.isArray(value))
    return []

  const next: RubricDimension[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue

    const record = item as Record<string, unknown>
    const key = normalizeString(record.key)
    const name = normalizeString(record.name)
    const description = normalizeString(record.description)
    if (!key || !name || !description)
      continue

    const weight = Number(record.weight)
    next.push({
      key,
      name,
      description,
      weight: Number.isFinite(weight) ? weight : undefined,
      scoringPoint: normalizeString(record.scoringPoint),
      deductionPoint: normalizeString(record.deductionPoint),
      evidenceRequirement: normalizeString(record.evidenceRequirement),
    })
  }
  return next
}

function normalizeScorecard(value: unknown): AiDefenseScorecard | null {
  const record = normalizeRecord(value)
  if (Object.keys(record).length === 0)
    return null

  return {
    technical: Math.max(0, Math.min(100, toNumber(record.technical, 0))),
    business: Math.max(0, Math.min(100, toNumber(record.business, 0))),
    expression: Math.max(0, Math.min(100, toNumber(record.expression, 0))),
    total: Math.max(0, Math.min(100, toNumber(record.total, 0))),
    summary: normalizeString(record.summary),
    materialGaps: normalizeStringArray(record.materialGaps),
    actionItems: normalizeStringArray(record.actionItems),
  }
}

function normalizeAttachmentArray(value: unknown): AiDefenseAttachment[] {
  if (!Array.isArray(value))
    return []

  const next: AiDefenseAttachment[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue
    const record = item as Record<string, unknown>
    const kind = normalizeString(record.kind) as AiDefenseAttachment['kind']
    if (!kind)
      continue
    next.push({
      id: normalizeString(record.id) || undefined,
      kind,
      resourceId: normalizeString(record.resourceId) || undefined,
      name: normalizeString(record.name) || undefined,
      page: record.page === null ? null : Number.isFinite(Number(record.page)) ? Number(record.page) : undefined,
      caption: normalizeString(record.caption) || undefined,
      metadata: normalizeRecord(record.metadata),
    })
  }
  return next
}

function mapPersona(row: ProjectDefensePersonaRow): AiDefensePersona {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceContestId: normalizeString(row.source_contest_id) || null,
    sourceTrackId: normalizeString(row.source_track_id) || null,
    sourceTemplateKey: normalizeString(row.source_template_key) || undefined,
    judgeType: row.judge_type,
    name: normalizeString(row.name),
    summary: normalizeString(row.summary),
    systemPrompt: normalizeString(row.system_prompt),
    focusAreas: normalizeStringArray(row.focus_json),
    scoringRubric: normalizeRubricDimensions(row.scoring_json),
    enabled: Boolean(row.enabled),
    sortOrder: Math.max(0, Math.trunc(toNumber(row.sort_order, 0))),
    isCustomized: Boolean(row.is_customized),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSessionState(row: ProjectDefenseSessionStateRow): AiDefenseSessionState {
  return {
    sessionId: row.session_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    currentStage: row.current_stage,
    turnCount: Math.max(0, Math.trunc(toNumber(row.turn_count, 0))),
    selectedPersonaIds: normalizeStringArray(row.selected_persona_ids_json),
    summaryStatus: row.summary_status,
    summaryResourceId: normalizeString(row.summary_resource_id) || null,
    linkedMeetingId: normalizeString(row.linked_meeting_id) || null,
    lastInputMode: row.last_input_mode,
    lastContextPack: normalizeRecord(row.last_context_pack_json),
    lastScorecard: normalizeScorecard(row.last_scorecard_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapTurn(row: ProjectDefenseTurnRow): AiDefenseTurn {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    stage: row.stage,
    turnIndex: Math.max(1, Math.trunc(toNumber(row.turn_index, 1))),
    personaId: normalizeString(row.persona_id) || null,
    judgeType: row.judge_type,
    judgeName: normalizeString(row.judge_name),
    question: normalizeString(row.question),
    comment: normalizeString(row.comment),
    followUp: normalizeString(row.follow_up),
    score: Math.max(0, Math.min(100, toNumber(row.score, 0))),
    evidenceRefs: Array.isArray(row.evidence_json) ? row.evidence_json as AiDefenseTurn['evidenceRefs'] : [],
    attachments: normalizeAttachmentArray(row.attachment_json),
    metadata: normalizeRecord(row.metadata_json),
    createdAt: row.created_at,
  }
}

function mapSummary(row: ProjectDefenseSummaryRow): AiDefenseSummary {
  const summaryJson = normalizeRecord(row.summary_json)

  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    summaryType: row.summary_type,
    turnIndex: row.turn_index === null ? null : Math.max(1, Math.trunc(toNumber(row.turn_index, 1))),
    status: row.status,
    summary: normalizeString(summaryJson.summary),
    strengths: normalizeStringArray(summaryJson.strengths),
    risks: normalizeStringArray(summaryJson.risks),
    actionItems: normalizeStringArray(summaryJson.actionItems),
    evidenceGaps: normalizeStringArray(summaryJson.evidenceGaps),
    markdown: normalizeString(row.markdown),
    resourceId: normalizeString(row.resource_id) || null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const PERSONA_SELECT = `
  SELECT
    id,
    project_id,
    source_contest_id,
    source_track_id,
    source_template_key,
    judge_type,
    name,
    summary,
    system_prompt,
    focus_json,
    scoring_json,
    enabled,
    sort_order,
    is_customized,
    created_by_user_id,
    updated_by_user_id,
    created_at::TEXT,
    updated_at::TEXT
  FROM project_defense_personas`

export async function listProjectDefensePersonas(
  db: Queryable,
  input: {
    projectId: string
    enabledOnly?: boolean
  },
): Promise<AiDefensePersona[]> {
  const where = ['project_id = $1']
  const values: unknown[] = [input.projectId]
  if (input.enabledOnly)
    where.push('enabled = TRUE')

  const result = await db.query<ProjectDefensePersonaRow>(
    `${PERSONA_SELECT}
     WHERE ${where.join(' AND ')}
     ORDER BY sort_order ASC, created_at ASC`,
    values,
  )

  return result.rows.map(mapPersona)
}

export async function getProjectDefensePersonaById(
  db: Queryable,
  input: {
    projectId: string
    personaId: string
  },
): Promise<AiDefensePersona | null> {
  const result = await db.query<ProjectDefensePersonaRow>(
    `${PERSONA_SELECT}
     WHERE project_id = $1
       AND id = $2
     LIMIT 1`,
    [input.projectId, input.personaId],
  )

  return result.rows[0] ? mapPersona(result.rows[0]) : null
}

export async function listProjectDefensePersonasByIds(
  db: Queryable,
  input: {
    projectId: string
    personaIds: string[]
  },
): Promise<AiDefensePersona[]> {
  if (input.personaIds.length === 0)
    return []

  const result = await db.query<ProjectDefensePersonaRow>(
    `${PERSONA_SELECT}
     WHERE project_id = $1
       AND id = ANY($2::TEXT[])
     ORDER BY sort_order ASC, created_at ASC`,
    [input.projectId, input.personaIds],
  )

  const ordered = new Map(result.rows.map(row => [row.id, mapPersona(row)]))
  return input.personaIds
    .map(id => ordered.get(id))
    .filter((item): item is AiDefensePersona => Boolean(item))
}

export async function createProjectDefensePersona(
  db: Queryable,
  input: {
    projectId: string
    sourceContestId?: string | null
    sourceTrackId?: string | null
    sourceTemplateKey?: string
    judgeType: AiDefensePersonaJudgeType
    name: string
    summary: string
    systemPrompt: string
    focusAreas?: string[]
    scoringRubric?: RubricDimension[]
    enabled?: boolean
    sortOrder?: number
    isCustomized?: boolean
    actorUserId: string
  },
): Promise<AiDefensePersona> {
  const id = randomUUID()
  const result = await db.query<ProjectDefensePersonaRow>(
    `INSERT INTO project_defense_personas (
      id,
      project_id,
      source_contest_id,
      source_track_id,
      source_template_key,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      is_customized,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, $11::JSONB, $12, $13, $14, $15, $15, NOW(), NOW()
    )
    RETURNING
      id,
      project_id,
      source_contest_id,
      source_track_id,
      source_template_key,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      is_customized,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      id,
      input.projectId,
      normalizeString(input.sourceContestId) || null,
      normalizeString(input.sourceTrackId) || null,
      normalizeString(input.sourceTemplateKey),
      input.judgeType,
      normalizeString(input.name),
      normalizeString(input.summary),
      normalizeString(input.systemPrompt),
      JSON.stringify((input.focusAreas || []).map(item => normalizeString(item)).filter(Boolean)),
      JSON.stringify(input.scoringRubric || []),
      input.enabled !== false,
      Math.max(0, Math.trunc(toNumber(input.sortOrder, 0))),
      input.isCustomized !== false,
      input.actorUserId,
    ],
  )

  return mapPersona(result.rows[0]!)
}

export async function patchProjectDefensePersona(
  db: Queryable,
  input: {
    projectId: string
    personaId: string
    actorUserId: string
    patch: {
      judgeType?: AiDefensePersonaJudgeType
      name?: string
      summary?: string
      systemPrompt?: string
      focusAreas?: string[]
      scoringRubric?: RubricDimension[]
      enabled?: boolean
      sortOrder?: number
      isCustomized?: boolean
      sourceTemplateKey?: string
      sourceContestId?: string | null
      sourceTrackId?: string | null
    }
  },
): Promise<AiDefensePersona | null> {
  const sets: string[] = []
  const values: unknown[] = [input.projectId, input.personaId]

  const addSet = (field: string, value: unknown) => {
    values.push(value)
    sets.push(`${field} = $${values.length}`)
  }

  if (input.patch.judgeType !== undefined)
    addSet('judge_type', input.patch.judgeType)
  if (input.patch.name !== undefined)
    addSet('name', normalizeString(input.patch.name))
  if (input.patch.summary !== undefined)
    addSet('summary', normalizeString(input.patch.summary))
  if (input.patch.systemPrompt !== undefined)
    addSet('system_prompt', normalizeString(input.patch.systemPrompt))
  if (input.patch.focusAreas !== undefined)
    addSet('focus_json', JSON.stringify(input.patch.focusAreas.map(item => normalizeString(item)).filter(Boolean)))
  if (input.patch.scoringRubric !== undefined)
    addSet('scoring_json', JSON.stringify(input.patch.scoringRubric))
  if (input.patch.enabled !== undefined)
    addSet('enabled', input.patch.enabled)
  if (input.patch.sortOrder !== undefined)
    addSet('sort_order', Math.max(0, Math.trunc(toNumber(input.patch.sortOrder, 0))))
  if (input.patch.isCustomized !== undefined)
    addSet('is_customized', input.patch.isCustomized)
  if (input.patch.sourceTemplateKey !== undefined)
    addSet('source_template_key', normalizeString(input.patch.sourceTemplateKey))
  if (input.patch.sourceContestId !== undefined)
    addSet('source_contest_id', normalizeString(input.patch.sourceContestId) || null)
  if (input.patch.sourceTrackId !== undefined)
    addSet('source_track_id', normalizeString(input.patch.sourceTrackId) || null)

  if (sets.length === 0)
    return getProjectDefensePersonaById(db, { projectId: input.projectId, personaId: input.personaId })

  addSet('updated_by_user_id', input.actorUserId)
  sets.push('updated_at = NOW()')

  await db.query(
    `UPDATE project_defense_personas
     SET ${sets.join(', ')}
     WHERE project_id = $1
       AND id = $2`,
    values,
  )

  return getProjectDefensePersonaById(db, { projectId: input.projectId, personaId: input.personaId })
}

export async function deleteProjectDefensePersona(
  db: Queryable,
  input: {
    projectId: string
    personaId: string
  },
): Promise<void> {
  await db.query(
    `DELETE FROM project_defense_personas
     WHERE project_id = $1
       AND id = $2`,
    [input.projectId, input.personaId],
  )
}

export async function getProjectDefenseSessionState(
  db: Queryable,
  input: {
    sessionId: string
  },
): Promise<AiDefenseSessionState | null> {
  const result = await db.query<ProjectDefenseSessionStateRow>(
    `SELECT
      session_id,
      project_id,
      workspace_id,
      current_stage,
      turn_count,
      selected_persona_ids_json,
      summary_status,
      summary_resource_id,
      linked_meeting_id,
      last_input_mode,
      last_context_pack_json,
      last_scorecard_json,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_defense_session_state
     WHERE session_id = $1
     LIMIT 1`,
    [input.sessionId],
  )

  return result.rows[0] ? mapSessionState(result.rows[0]) : null
}

export async function upsertProjectDefenseSessionState(
  db: Queryable,
  input: {
    sessionId: string
    projectId: string
    workspaceId: string
    currentStage: AiDefenseStage
    turnCount: number
    selectedPersonaIds?: string[]
    summaryStatus?: AiDefenseSummaryStatus
    summaryResourceId?: string | null
    linkedMeetingId?: string | null
    lastInputMode?: AiDefenseSessionState['lastInputMode']
    lastContextPack?: Record<string, unknown>
    lastScorecard?: AiDefenseScorecard | null
  },
): Promise<AiDefenseSessionState> {
  const result = await db.query<ProjectDefenseSessionStateRow>(
    `INSERT INTO project_defense_session_state (
      session_id,
      project_id,
      workspace_id,
      current_stage,
      turn_count,
      selected_persona_ids_json,
      summary_status,
      summary_resource_id,
      linked_meeting_id,
      last_input_mode,
      last_context_pack_json,
      last_scorecard_json,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7, $8, $9, $10, $11::JSONB, $12::JSONB, NOW(), NOW()
    )
    ON CONFLICT (session_id) DO UPDATE
    SET project_id = EXCLUDED.project_id,
        workspace_id = EXCLUDED.workspace_id,
        current_stage = EXCLUDED.current_stage,
        turn_count = EXCLUDED.turn_count,
        selected_persona_ids_json = EXCLUDED.selected_persona_ids_json,
        summary_status = EXCLUDED.summary_status,
        summary_resource_id = EXCLUDED.summary_resource_id,
        linked_meeting_id = EXCLUDED.linked_meeting_id,
        last_input_mode = EXCLUDED.last_input_mode,
        last_context_pack_json = EXCLUDED.last_context_pack_json,
        last_scorecard_json = EXCLUDED.last_scorecard_json,
        updated_at = NOW()
    RETURNING
      session_id,
      project_id,
      workspace_id,
      current_stage,
      turn_count,
      selected_persona_ids_json,
      summary_status,
      summary_resource_id,
      linked_meeting_id,
      last_input_mode,
      last_context_pack_json,
      last_scorecard_json,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      input.sessionId,
      input.projectId,
      input.workspaceId,
      input.currentStage,
      Math.max(0, Math.trunc(toNumber(input.turnCount, 0))),
      JSON.stringify((input.selectedPersonaIds || []).map(item => normalizeString(item)).filter(Boolean)),
      input.summaryStatus || 'idle',
      normalizeString(input.summaryResourceId) || null,
      normalizeString(input.linkedMeetingId) || null,
      input.lastInputMode || 'text',
      JSON.stringify(input.lastContextPack || {}),
      JSON.stringify(input.lastScorecard || {}),
    ],
  )

  return mapSessionState(result.rows[0]!)
}

export async function createProjectDefenseTurns(
  db: Queryable,
  input: {
    sessionId: string
    projectId: string
    stage: AiDefenseStage
    turnIndex: number
    turns: Array<{
      personaId?: string | null
      judgeType?: AiDefensePersonaJudgeType
      judgeName: string
      question: string
      comment: string
      followUp: string
      score: number
      evidenceRefs?: AiDefenseTurn['evidenceRefs']
      attachments?: AiDefenseAttachment[]
      metadata?: Record<string, unknown>
    }>
  },
): Promise<AiDefenseTurn[]> {
  const created: AiDefenseTurn[] = []
  for (const item of input.turns) {
    const result = await db.query<ProjectDefenseTurnRow>(
      `INSERT INTO project_defense_turns (
        id,
        session_id,
        project_id,
        stage,
        turn_index,
        persona_id,
        judge_type,
        judge_name,
        question,
        comment,
        follow_up,
        score,
        evidence_json,
        attachment_json,
        metadata_json,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::JSONB, $14::JSONB, $15::JSONB, NOW()
      )
      RETURNING
        id,
        session_id,
        project_id,
        stage,
        turn_index,
        persona_id,
        judge_type,
        judge_name,
        question,
        comment,
        follow_up,
        score,
        evidence_json,
        attachment_json,
        metadata_json,
        created_at::TEXT`,
      [
        randomUUID(),
        input.sessionId,
        input.projectId,
        input.stage,
        Math.max(1, Math.trunc(toNumber(input.turnIndex, 1))),
        normalizeString(item.personaId) || null,
        item.judgeType || 'custom',
        normalizeString(item.judgeName),
        normalizeString(item.question),
        normalizeString(item.comment),
        normalizeString(item.followUp),
        Math.max(0, Math.min(100, toNumber(item.score, 0))),
        JSON.stringify(item.evidenceRefs || []),
        JSON.stringify(item.attachments || []),
        JSON.stringify(item.metadata || {}),
      ],
    )
    created.push(mapTurn(result.rows[0]!))
  }

  return created
}

export async function listProjectDefenseTurnsBySession(
  db: Queryable,
  input: {
    sessionId: string
  },
): Promise<AiDefenseTurn[]> {
  const result = await db.query<ProjectDefenseTurnRow>(
    `SELECT
      id,
      session_id,
      project_id,
      stage,
      turn_index,
      persona_id,
      judge_type,
      judge_name,
      question,
      comment,
      follow_up,
      score,
      evidence_json,
      attachment_json,
      metadata_json,
      created_at::TEXT
     FROM project_defense_turns
     WHERE session_id = $1
     ORDER BY turn_index ASC, created_at ASC`,
    [input.sessionId],
  )

  return result.rows.map(mapTurn)
}

async function getProjectDefenseSummaryRecord(
  db: Queryable,
  input: {
    sessionId: string
    summaryType: AiDefenseSummaryType
    turnIndex?: number | null
  },
): Promise<ProjectDefenseSummaryRow | null> {
  const values: unknown[] = [input.sessionId, input.summaryType]
  let turnClause = 'AND turn_index IS NULL'

  if (input.turnIndex !== undefined && input.turnIndex !== null) {
    values.push(Math.max(1, Math.trunc(toNumber(input.turnIndex, 1))))
    turnClause = `AND turn_index = $${values.length}`
  }

  const result = await db.query<ProjectDefenseSummaryRow>(
    `SELECT
      id,
      session_id,
      project_id,
      summary_type,
      turn_index,
      status,
      summary_json,
      markdown,
      resource_id,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_defense_summaries
     WHERE session_id = $1
       AND summary_type = $2
       ${turnClause}
     ORDER BY updated_at DESC
     LIMIT 1`,
    values,
  )

  return result.rows[0] || null
}

export async function upsertProjectDefenseSummary(
  db: Queryable,
  input: {
    sessionId: string
    projectId: string
    summaryType: AiDefenseSummaryType
    turnIndex?: number | null
    status: AiDefenseSummaryStatus
    summary: string
    strengths?: string[]
    risks?: string[]
    actionItems?: string[]
    evidenceGaps?: string[]
    markdown: string
    resourceId?: string | null
    actorUserId: string
  },
): Promise<AiDefenseSummary> {
  const existing = await getProjectDefenseSummaryRecord(db, {
    sessionId: input.sessionId,
    summaryType: input.summaryType,
    turnIndex: input.turnIndex,
  })

  const payload = {
    summary: normalizeString(input.summary),
    strengths: (input.strengths || []).map(item => normalizeString(item)).filter(Boolean),
    risks: (input.risks || []).map(item => normalizeString(item)).filter(Boolean),
    actionItems: (input.actionItems || []).map(item => normalizeString(item)).filter(Boolean),
    evidenceGaps: (input.evidenceGaps || []).map(item => normalizeString(item)).filter(Boolean),
  }

  if (existing) {
    const result = await db.query<ProjectDefenseSummaryRow>(
      `UPDATE project_defense_summaries
       SET status = $4,
           summary_json = $5::JSONB,
           markdown = $6,
           resource_id = $7,
           created_by_user_id = $8,
           updated_at = NOW()
       WHERE id = $1
         AND session_id = $2
         AND project_id = $3
       RETURNING
         id,
         session_id,
         project_id,
         summary_type,
         turn_index,
         status,
         summary_json,
         markdown,
         resource_id,
         created_by_user_id,
         created_at::TEXT,
         updated_at::TEXT`,
      [
        existing.id,
        input.sessionId,
        input.projectId,
        input.status,
        JSON.stringify(payload),
        normalizeString(input.markdown),
        normalizeString(input.resourceId) || null,
        input.actorUserId,
      ],
    )
    return mapSummary(result.rows[0]!)
  }

  const result = await db.query<ProjectDefenseSummaryRow>(
    `INSERT INTO project_defense_summaries (
      id,
      session_id,
      project_id,
      summary_type,
      turn_index,
      status,
      summary_json,
      markdown,
      resource_id,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7::JSONB, $8, $9, $10, NOW(), NOW()
    )
    RETURNING
      id,
      session_id,
      project_id,
      summary_type,
      turn_index,
      status,
      summary_json,
      markdown,
      resource_id,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      randomUUID(),
      input.sessionId,
      input.projectId,
      input.summaryType,
      input.turnIndex === undefined ? null : input.turnIndex,
      input.status,
      JSON.stringify(payload),
      normalizeString(input.markdown),
      normalizeString(input.resourceId) || null,
      input.actorUserId,
    ],
  )

  return mapSummary(result.rows[0]!)
}

export async function getLatestProjectDefenseSummary(
  db: Queryable,
  input: {
    sessionId: string
    summaryType?: AiDefenseSummaryType
  },
): Promise<AiDefenseSummary | null> {
  const where = ['session_id = $1']
  const values: unknown[] = [input.sessionId]
  if (input.summaryType) {
    values.push(input.summaryType)
    where.push(`summary_type = $${values.length}`)
  }

  const result = await db.query<ProjectDefenseSummaryRow>(
    `SELECT
      id,
      session_id,
      project_id,
      summary_type,
      turn_index,
      status,
      summary_json,
      markdown,
      resource_id,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_defense_summaries
     WHERE ${where.join(' AND ')}
     ORDER BY updated_at DESC
     LIMIT 1`,
    values,
  )

  return result.rows[0] ? mapSummary(result.rows[0]) : null
}

export async function listProjectDefenseLatestSessionSummaries(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<Array<{ summary: AiDefenseSummary, sessionTitle: string }>> {
  const limit = Math.max(1, Math.min(50, Math.trunc(toNumber(input.limit, 20))))
  const result = await db.query<ProjectDefenseSummaryRow>(
    `SELECT
      s.id,
      s.session_id,
      s.project_id,
      s.summary_type,
      s.turn_index,
      s.status,
      s.summary_json,
      s.markdown,
      s.resource_id,
      s.created_by_user_id,
      s.created_at::TEXT,
      s.updated_at::TEXT,
      c.title AS session_title
     FROM project_defense_summaries s
     JOIN ai_chat_sessions c
       ON c.id = s.session_id
     WHERE s.project_id = $1
       AND s.summary_type = 'session'
     ORDER BY s.updated_at DESC
     LIMIT $2`,
    [input.projectId, limit],
  )

  return result.rows.map(row => ({
    summary: mapSummary(row),
    sessionTitle: normalizeString(row.session_title) || 'Loopy 答辩会话',
  }))
}
