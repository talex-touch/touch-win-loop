import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectTopicBoard,
  ProjectTopicBoardCandidate,
  ProjectTopicBoardInput,
  TopicProposalCompareMatrixRow,
  TopicProposalDecisionStatus,
  TopicProposalItem,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

interface ProjectTopicBoardRow {
  id: string
  workspace_id: string
  project_id: string
  contest_id: string
  track_id: string
  input_snapshot: unknown
  team_skill_profile: unknown
  compare_matrix: unknown
  board_summary: string
  selected_candidate_id: string
  session_id: string
  status: 'active' | 'archived'
  created_by_user_id: string
  created_at: string
  updated_at: string
}

interface ProjectTopicCandidateRow {
  id: string
  board_id: string
  workspace_id: string
  project_id: string
  candidate_id: string
  sort_order: number
  decision_status: TopicProposalDecisionStatus
  total_score: number
  payload: unknown
  created_at: string
  updated_at: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (!value)
    return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
      return {}
    }
  }
  if (typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

function parseArray<T>(value: unknown, fallback: T[] = []): T[] {
  if (!value)
    return fallback
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as T[] : fallback
    }
    catch {
      return fallback
    }
  }
  return Array.isArray(value) ? value as T[] : fallback
}

const topicProposalDecisionStatusSchema = z.enum(['candidate', 'shortlisted', 'rejected', 'selected'])

const compareScoresSchema = z.object({
  contestFit: z.coerce.number().default(0),
  noveltySimilarity: z.coerce.number().default(0),
  evidenceReadiness: z.coerce.number().default(0),
  trendHeat: z.coerce.number().default(0),
  teamMatch: z.coerce.number().default(0),
  workloadFeasibility: z.coerce.number().default(0),
})

const topicProposalItemSchema = z.object({
  id: z.string().default(''),
  title: z.string().default(''),
  reason: z.string().default(''),
  innovationPoints: z.array(z.coerce.string()).default([]),
  techRouteSteps: z.array(z.coerce.string()).default([]),
  scoringMapping: z.array(z.coerce.string()).default([]),
  risks: z.array(z.coerce.string()).default([]),
  estimatedWorkload: z.string().default(''),
  recommendedTrackId: z.string().default(''),
  recommendedTrackName: z.string().default(''),
  contestFitScore: z.coerce.number().default(0),
  contestFitReasons: z.array(z.coerce.string()).default([]),
  similarAwards: z.array(z.object({
    title: z.string().default(''),
    summary: z.string().default(''),
    year: z.coerce.number().optional(),
    contestId: z.string().optional(),
    contestName: z.string().optional(),
    trackId: z.string().optional(),
    trackName: z.string().optional(),
    similarityScore: z.coerce.number().default(0),
    reason: z.string().optional(),
  })).default([]),
  trendSignals: z.array(z.object({
    label: z.string().default(''),
    summary: z.string().default(''),
    heatScore: z.coerce.number().default(0),
    source: z.enum(['contest_trends', 'internal_resource', 'web_search']).catch('contest_trends'),
    confidence: z.coerce.number().default(0),
  })).default([]),
  requiredSkills: z.array(z.coerce.string()).default([]),
  teamMatchScore: z.coerce.number().default(0),
  teamGapNotes: z.array(z.coerce.string()).default([]),
  evidenceRefs: z.array(z.object({
    title: z.string().default(''),
    summary: z.string().default(''),
    sourceType: z.enum(['project_resource', 'contest_resource', 'contest_trend', 'web_search']).catch('project_resource'),
    sourceLabel: z.string().default(''),
    url: z.string().optional(),
    confidence: z.coerce.number().default(0),
  })).default([]),
  decisionStatus: topicProposalDecisionStatusSchema.catch('candidate'),
  compareScores: compareScoresSchema.default({
    contestFit: 0,
    noveltySimilarity: 0,
    evidenceReadiness: 0,
    trendHeat: 0,
    teamMatch: 0,
    workloadFeasibility: 0,
  }),
  totalScore: z.coerce.number().default(0),
  references: z.array(z.coerce.string()).default([]),
})

const projectTopicBoardInputSchema = z.object({
  contestId: z.string().default(''),
  trackId: z.string().default(''),
  major: z.string().default(''),
  discipline: z.string().default(''),
  topicType: z.string().default(''),
  expectedDifficulty: z.string().default(''),
  keywords: z.array(z.coerce.string()).default([]),
  teamSkillTags: z.array(z.coerce.string()).default([]),
  candidateCount: z.coerce.number().int().min(3).max(5).catch(3),
  source: z.enum(['workspace_dashboard', 'workspace_sidebar', 'project_create']).catch('workspace_dashboard'),
})

const compareMatrixRowSchema = z.object({
  candidateId: z.string().default(''),
  title: z.string().default(''),
  decisionStatus: topicProposalDecisionStatusSchema.catch('candidate'),
  totalScore: z.coerce.number().default(0),
  rank: z.coerce.number().int().default(0),
  contestFit: z.coerce.number().default(0),
  noveltySimilarity: z.coerce.number().default(0),
  evidenceReadiness: z.coerce.number().default(0),
  trendHeat: z.coerce.number().default(0),
  teamMatch: z.coerce.number().default(0),
  workloadFeasibility: z.coerce.number().default(0),
})

function normalizeTopicProposalDecisionStatus(value: unknown): TopicProposalDecisionStatus {
  const parsed = topicProposalDecisionStatusSchema.safeParse(normalizeText(value))
  return parsed.success ? parsed.data : 'candidate'
}

function createEmptyCompareScores(): TopicProposalItem['compareScores'] {
  return {
    contestFit: 0,
    noveltySimilarity: 0,
    evidenceReadiness: 0,
    trendHeat: 0,
    teamMatch: 0,
    workloadFeasibility: 0,
  }
}

function buildCompareMatrixFromCandidates(candidates: TopicProposalItem[]): TopicProposalCompareMatrixRow[] {
  return candidates.map((candidate, index) => ({
    candidateId: candidate.id,
    title: candidate.title,
    decisionStatus: candidate.decisionStatus,
    totalScore: Number(candidate.totalScore || 0),
    rank: index + 1,
    ...createEmptyCompareScores(),
    ...(candidate.compareScores || {}),
  }))
}

function normalizeCandidatesForPersistence(
  inputCandidates: TopicProposalItem[],
  selectedCandidateId?: string,
): {
  candidates: TopicProposalItem[]
  compareMatrix: TopicProposalCompareMatrixRow[]
  selectedCandidateId: string
} {
  const seenCandidateIds = new Set<string>()
  const requestedSelectedCandidateId = normalizeText(selectedCandidateId)
  let normalizedSelectedCandidateId = ''

  const normalizedCandidates = inputCandidates.map((candidate) => {
    const rawCandidateId = normalizeText(candidate.id)
    let candidateId = rawCandidateId || randomUUID()
    while (seenCandidateIds.has(candidateId))
      candidateId = randomUUID()
    seenCandidateIds.add(candidateId)

    if (!normalizedSelectedCandidateId && requestedSelectedCandidateId && rawCandidateId === requestedSelectedCandidateId)
      normalizedSelectedCandidateId = candidateId

    return {
      ...candidate,
      id: candidateId,
      decisionStatus: normalizeTopicProposalDecisionStatus(candidate.decisionStatus),
      totalScore: Number(candidate.totalScore || 0),
      compareScores: {
        ...createEmptyCompareScores(),
        ...(candidate.compareScores || {}),
      },
    }
  })

  if (!normalizedSelectedCandidateId)
    normalizedSelectedCandidateId = normalizedCandidates.find(candidate => candidate.decisionStatus === 'selected')?.id || ''

  const candidates = normalizedCandidates.map((candidate) => {
    const nextDecisionStatus = normalizedSelectedCandidateId
      ? (candidate.id === normalizedSelectedCandidateId
          ? 'selected'
          : (candidate.decisionStatus === 'selected' ? 'candidate' : candidate.decisionStatus))
      : candidate.decisionStatus
    return {
      ...candidate,
      decisionStatus: nextDecisionStatus,
    }
  })

  return {
    candidates,
    compareMatrix: buildCompareMatrixFromCandidates(candidates),
    selectedCandidateId: normalizedSelectedCandidateId,
  }
}

function createEmptyTopicProposalItem(candidateId: string, decisionStatus: TopicProposalDecisionStatus, totalScore: number): TopicProposalItem {
  return {
    id: candidateId,
    title: '',
    reason: '',
    innovationPoints: [],
    techRouteSteps: [],
    scoringMapping: [],
    risks: [],
    estimatedWorkload: '',
    recommendedTrackId: '',
    recommendedTrackName: '',
    contestFitScore: 0,
    contestFitReasons: [],
    similarAwards: [],
    trendSignals: [],
    requiredSkills: [],
    teamMatchScore: 0,
    teamGapNotes: [],
    evidenceRefs: [],
    decisionStatus,
    compareScores: {
      contestFit: 0,
      noveltySimilarity: 0,
      evidenceReadiness: 0,
      trendHeat: 0,
      teamMatch: 0,
      workloadFeasibility: 0,
    },
    totalScore,
    references: [],
  }
}

function warnInvalidPayload(scope: string, payload: { rowId?: string, boardId?: string, issues: string[] }) {
  console.warn(`[project-topic-board-store] ${scope} 校验失败`, payload)
}

function validateTopicProposalItem(row: ProjectTopicCandidateRow): TopicProposalItem {
  const fallback = createEmptyTopicProposalItem(
    row.candidate_id,
    row.decision_status || 'candidate',
    Number(row.total_score || 0),
  )
  const payload = parseRecord(row.payload)
  const parsed = topicProposalItemSchema.safeParse({
    ...fallback,
    ...payload,
    compareScores: {
      ...fallback.compareScores,
      ...parseRecord(payload.compareScores),
    },
  })

  if (!parsed.success) {
    warnInvalidPayload('candidate_payload', {
      rowId: row.id,
      boardId: row.board_id,
      issues: parsed.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    })
    return fallback
  }

  return {
    ...parsed.data,
    id: normalizeText(parsed.data.id) || fallback.id,
    decisionStatus: row.decision_status,
    totalScore: Number(row.total_score || 0),
  }
}

function validateProjectTopicBoardInput(row: ProjectTopicBoardRow): ProjectTopicBoardInput {
  const parsed = projectTopicBoardInputSchema.safeParse(parseRecord(row.input_snapshot))
  if (!parsed.success) {
    warnInvalidPayload('board_input', {
      rowId: row.id,
      issues: parsed.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    })
    return {
      contestId: '',
      trackId: '',
      major: '',
      discipline: '',
      topicType: '',
      expectedDifficulty: '',
      keywords: [],
      teamSkillTags: [],
      candidateCount: 3,
      source: 'workspace_dashboard',
    }
  }

  return parsed.data
}

function validateCompareMatrixRowArray(row: ProjectTopicBoardRow): TopicProposalCompareMatrixRow[] {
  const parsed = z.array(compareMatrixRowSchema).safeParse(parseArray(row.compare_matrix))
  if (!parsed.success) {
    warnInvalidPayload('compare_matrix', {
      rowId: row.id,
      issues: parsed.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    })
    return []
  }

  return parsed.data
}

function mapCandidateRow(row: ProjectTopicCandidateRow): ProjectTopicBoardCandidate {
  return {
    id: row.id,
    boardId: row.board_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    candidateId: row.candidate_id,
    sortOrder: Number(row.sort_order || 0),
    decisionStatus: row.decision_status,
    totalScore: Number(row.total_score || 0),
    payload: validateTopicProposalItem(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBoardRow(row: ProjectTopicBoardRow, candidates: ProjectTopicBoardCandidate[]): ProjectTopicBoard {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    contestId: row.contest_id,
    trackId: row.track_id,
    input: validateProjectTopicBoardInput(row),
    teamSkillProfile: parseArray<string>(row.team_skill_profile),
    boardSummary: row.board_summary,
    compareMatrix: validateCompareMatrixRowArray(row),
    selectedCandidateId: normalizeText(row.selected_candidate_id) || undefined,
    sessionId: normalizeText(row.session_id) || undefined,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    candidates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function listCandidatesByBoardIds(db: Queryable, boardIds: string[]): Promise<Map<string, ProjectTopicBoardCandidate[]>> {
  const normalized = boardIds.map(item => normalizeText(item)).filter(Boolean)
  const resultMap = new Map<string, ProjectTopicBoardCandidate[]>()
  if (normalized.length === 0)
    return resultMap

  const result = await db.query<ProjectTopicCandidateRow>(
    `SELECT
      id,
      board_id,
      workspace_id,
      project_id,
      candidate_id,
      sort_order,
      decision_status,
      total_score,
      payload,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_topic_candidates
     WHERE board_id = ANY($1::TEXT[])
     ORDER BY sort_order ASC, created_at ASC`,
    [normalized],
  )

  for (const row of result.rows) {
    const item = mapCandidateRow(row)
    const existing = resultMap.get(item.boardId)
    if (existing)
      existing.push(item)
    else
      resultMap.set(item.boardId, [item])
  }

  return resultMap
}

async function getBoardRowsByProject(
  db: Queryable,
  projectId: string,
  limit: number,
): Promise<ProjectTopicBoardRow[]> {
  const result = await db.query<ProjectTopicBoardRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      input_snapshot,
      team_skill_profile,
      compare_matrix,
      board_summary,
      selected_candidate_id,
      session_id,
      status,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_topic_boards
     WHERE project_id = $1
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $2`,
    [projectId, limit],
  )

  return result.rows
}

async function getBoardRowById(
  db: Queryable,
  input: {
    projectId: string
    boardId: string
    forUpdate?: boolean
  },
): Promise<ProjectTopicBoardRow | null> {
  const result = await db.query<ProjectTopicBoardRow>(
    `SELECT
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      input_snapshot,
      team_skill_profile,
      compare_matrix,
      board_summary,
      selected_candidate_id,
      session_id,
      status,
      created_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_topic_boards
     WHERE project_id = $1
       AND id = $2
     LIMIT 1
     ${input.forUpdate ? 'FOR UPDATE' : ''}`,
    [input.projectId, input.boardId],
  )

  return result.rows[0] || null
}

async function listCandidateRowsByBoardId(
  db: Queryable,
  input: {
    boardId: string
    forUpdate?: boolean
  },
): Promise<ProjectTopicCandidateRow[]> {
  const result = await db.query<ProjectTopicCandidateRow>(
    `SELECT
      id,
      board_id,
      workspace_id,
      project_id,
      candidate_id,
      sort_order,
      decision_status,
      total_score,
      payload,
      created_at::TEXT,
      updated_at::TEXT
     FROM project_topic_candidates
     WHERE board_id = $1
     ORDER BY sort_order ASC, created_at ASC
     ${input.forUpdate ? 'FOR UPDATE' : ''}`,
    [input.boardId],
  )

  return result.rows
}

export async function createProjectTopicBoardWithCandidates(
  db: Queryable,
  input: {
    workspaceId: string
    projectId: string
    contestId: string
    trackId: string
    boardInput: ProjectTopicBoardInput
    teamSkillProfile: string[]
    compareMatrix: TopicProposalCompareMatrixRow[]
    boardSummary: string
    selectedCandidateId?: string
    sessionId?: string
    createdByUserId: string
    candidates: TopicProposalItem[]
  },
): Promise<ProjectTopicBoard> {
  const boardId = randomUUID()
  const prepared = normalizeCandidatesForPersistence(input.candidates, input.selectedCandidateId)

  await db.query(
    `SELECT id
     FROM projects
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [input.projectId],
  )

  await db.query(
    `UPDATE project_topic_boards
     SET status = 'archived',
         updated_at = NOW()
     WHERE project_id = $1
       AND status = 'active'`,
    [input.projectId],
  )

  await db.query(
    `INSERT INTO project_topic_boards (
      id,
      workspace_id,
      project_id,
      contest_id,
      track_id,
      input_snapshot,
      team_skill_profile,
      compare_matrix,
      board_summary,
      selected_candidate_id,
      session_id,
      status,
      created_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6::JSONB, $7::TEXT[], $8::JSONB, $9, $10, $11, 'active', $12, NOW(), NOW()
    )`,
    [
      boardId,
      input.workspaceId,
      input.projectId,
      input.contestId,
      input.trackId,
      JSON.stringify(input.boardInput),
      input.teamSkillProfile,
      JSON.stringify(prepared.compareMatrix),
      input.boardSummary,
      prepared.selectedCandidateId,
      normalizeText(input.sessionId),
      input.createdByUserId,
    ],
  )

  if (prepared.candidates.length > 0) {
    const values: unknown[] = []
    const placeholders: string[] = []
    let parameterIndex = 1

    for (const [index, candidate] of prepared.candidates.entries()) {
      placeholders.push(`($${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}::JSONB, NOW(), NOW())`)
      values.push(
        randomUUID(),
        boardId,
        input.workspaceId,
        input.projectId,
        candidate.id,
        index,
        candidate.decisionStatus,
        candidate.totalScore,
        JSON.stringify(candidate),
      )
    }

    await db.query(
      `INSERT INTO project_topic_candidates (
        id,
        board_id,
        workspace_id,
        project_id,
        candidate_id,
        sort_order,
        decision_status,
        total_score,
        payload,
        created_at,
        updated_at
      ) VALUES ${placeholders.join(', ')}`,
      values,
    )
  }

  const created = await getProjectTopicBoardById(db, {
    projectId: input.projectId,
    boardId,
  })

  if (!created)
    throw new Error('PROJECT_TOPIC_BOARD_CREATE_FAILED')

  return created
}

export async function getProjectTopicBoardById(
  db: Queryable,
  input: {
    projectId: string
    boardId: string
  },
): Promise<ProjectTopicBoard | null> {
  const row = await getBoardRowById(db, input)
  if (!row)
    return null

  const candidatesByBoardId = await listCandidatesByBoardIds(db, [row.id])
  return mapBoardRow(row, candidatesByBoardId.get(row.id) || [])
}

export async function getLatestProjectTopicBoard(
  db: Queryable,
  projectId: string,
): Promise<ProjectTopicBoard | null> {
  const rows = await getBoardRowsByProject(db, projectId, 1)
  if (rows.length === 0)
    return null

  const candidatesByBoardId = await listCandidatesByBoardIds(db, [rows[0]!.id])
  return mapBoardRow(rows[0]!, candidatesByBoardId.get(rows[0]!.id) || [])
}

export async function listProjectTopicBoardsByProject(
  db: Queryable,
  input: {
    projectId: string
    limit?: number
  },
): Promise<ProjectTopicBoard[]> {
  const rows = await getBoardRowsByProject(db, input.projectId, Math.max(1, Math.min(10, Number(input.limit || 5))))
  const boardIds = rows.map(item => item.id)
  const candidatesByBoardId = await listCandidatesByBoardIds(db, boardIds)
  return rows.map(row => mapBoardRow(row, candidatesByBoardId.get(row.id) || []))
}

export async function patchProjectTopicBoard(
  db: Queryable,
  input: {
    projectId: string
    boardId: string
    selectedCandidateId?: string
    boardSummary?: string
    candidateUpdates?: Array<{
      candidateId: string
      decisionStatus?: TopicProposalDecisionStatus
    }>
  },
): Promise<ProjectTopicBoard | null> {
  const boardRow = await getBoardRowById(db, {
    projectId: input.projectId,
    boardId: input.boardId,
    forUpdate: true,
  })
  if (!boardRow)
    return null

  const candidateRows = await listCandidateRowsByBoardId(db, {
    boardId: input.boardId,
    forUpdate: true,
  })
  const board = mapBoardRow(boardRow, candidateRows.map(mapCandidateRow))

  const nextCandidates = board.candidates.map(candidate => ({
    ...candidate,
    payload: {
      ...candidate.payload,
    },
  }))

  const updateMap = new Map<string, TopicProposalDecisionStatus>()
  for (const item of input.candidateUpdates || []) {
    const candidateId = normalizeText(item.candidateId)
    if (!candidateId || !item.decisionStatus)
      continue
    updateMap.set(candidateId, item.decisionStatus)
  }

  const selectedCandidateId = normalizeText(input.selectedCandidateId || board.selectedCandidateId)
  if (selectedCandidateId && !nextCandidates.some(item => item.candidateId === selectedCandidateId))
    throw new Error('PROJECT_TOPIC_CANDIDATE_NOT_FOUND')

  for (const candidate of nextCandidates) {
    const nextStatus = updateMap.get(candidate.candidateId)
    if (nextStatus)
      candidate.decisionStatus = nextStatus
  }

  if (selectedCandidateId) {
    for (const candidate of nextCandidates) {
      if (candidate.candidateId === selectedCandidateId) {
        candidate.decisionStatus = 'selected'
      }
      else if (candidate.decisionStatus === 'selected') {
        candidate.decisionStatus = 'candidate'
      }
    }
  }

  const normalized = normalizeCandidatesForPersistence(
    nextCandidates.map(candidate => ({
      ...candidate.payload,
      id: candidate.candidateId,
      decisionStatus: candidate.decisionStatus,
      totalScore: candidate.totalScore,
    })),
    selectedCandidateId,
  )
  const nextCompareMatrix = normalized.compareMatrix
  const normalizedCandidateMap = new Map(normalized.candidates.map(candidate => [candidate.id, candidate]))
  const currentCandidates = new Map(board.candidates.map(item => [item.candidateId, item]))
  const changedCandidates = nextCandidates.flatMap((candidate) => {
    const normalizedCandidate = normalizedCandidateMap.get(candidate.candidateId)
    if (!normalizedCandidate)
      return []

    const nextPayload = JSON.stringify({
      ...normalizedCandidate,
      decisionStatus: normalizedCandidate.decisionStatus,
    })
    const current = currentCandidates.get(candidate.candidateId)
    const currentPayload = current
      ? JSON.stringify({
          ...current.payload,
          decisionStatus: current.decisionStatus,
        })
      : ''

    if (
      current
      && current.decisionStatus === candidate.decisionStatus
      && currentPayload === nextPayload
    ) {
      return []
    }

    return [{
      candidateId: candidate.candidateId,
      decisionStatus: normalizedCandidate.decisionStatus,
      payload: nextPayload,
    }]
  })

  if (changedCandidates.length > 0) {
    const values: unknown[] = [input.boardId]
    const placeholders: string[] = []
    let parameterIndex = 2

    for (const candidate of changedCandidates) {
      placeholders.push(`($${parameterIndex++}, $${parameterIndex++}, $${parameterIndex++}::JSONB)`)
      values.push(candidate.candidateId, candidate.decisionStatus, candidate.payload)
    }

    await db.query(
      `UPDATE project_topic_candidates AS target
       SET decision_status = source.decision_status,
           payload = source.payload,
           updated_at = NOW()
       FROM (
         VALUES ${placeholders.join(', ')}
       ) AS source(candidate_id, decision_status, payload)
       WHERE target.board_id = $1
         AND target.candidate_id = source.candidate_id`,
      values,
    )
  }

  await db.query(
    `UPDATE project_topic_boards
     SET board_summary = $3,
         selected_candidate_id = $4,
         compare_matrix = $5::JSONB,
         updated_at = NOW()
     WHERE project_id = $1
       AND id = $2`,
    [
      input.projectId,
      input.boardId,
      input.boardSummary === undefined ? board.boardSummary : input.boardSummary,
      normalized.selectedCandidateId,
      JSON.stringify(nextCompareMatrix),
    ],
  )

  return getProjectTopicBoardById(db, {
    projectId: input.projectId,
    boardId: input.boardId,
  })
}
