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
    payload: parseRecord(row.payload) as unknown as TopicProposalItem,
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
    input: parseRecord(row.input_snapshot) as unknown as ProjectTopicBoardInput,
    teamSkillProfile: parseArray<string>(row.team_skill_profile),
    boardSummary: row.board_summary,
    compareMatrix: parseArray<TopicProposalCompareMatrixRow>(row.compare_matrix),
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
      JSON.stringify(input.compareMatrix),
      input.boardSummary,
      normalizeText(input.selectedCandidateId),
      normalizeText(input.sessionId),
      input.createdByUserId,
    ],
  )

  for (const [index, candidate] of input.candidates.entries()) {
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
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB, NOW(), NOW()
      )`,
      [
        randomUUID(),
        boardId,
        input.workspaceId,
        input.projectId,
        candidate.id,
        index,
        candidate.decisionStatus,
        candidate.totalScore,
        JSON.stringify(candidate),
      ],
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
     LIMIT 1`,
    [input.projectId, input.boardId],
  )

  const row = result.rows[0]
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
  const board = await getProjectTopicBoardById(db, {
    projectId: input.projectId,
    boardId: input.boardId,
  })

  if (!board)
    return null

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

  const nextCompareMatrix = board.compareMatrix.map((row) => {
    const candidate = nextCandidates.find(item => item.candidateId === row.candidateId)
    return {
      ...row,
      decisionStatus: candidate?.decisionStatus || row.decisionStatus,
    }
  })

  for (const candidate of nextCandidates) {
    candidate.payload = {
      ...candidate.payload,
      decisionStatus: candidate.decisionStatus,
    }

    await db.query(
      `UPDATE project_topic_candidates
       SET decision_status = $3,
           payload = $4::JSONB,
           updated_at = NOW()
       WHERE board_id = $1
         AND candidate_id = $2`,
      [
        input.boardId,
        candidate.candidateId,
        candidate.decisionStatus,
        JSON.stringify(candidate.payload),
      ],
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
      selectedCandidateId,
      JSON.stringify(nextCompareMatrix),
    ],
  )

  return getProjectTopicBoardById(db, {
    projectId: input.projectId,
    boardId: input.boardId,
  })
}
