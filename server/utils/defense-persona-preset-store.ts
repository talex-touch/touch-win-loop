import type { Queryable } from '~~/server/utils/db'
import type {
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefensePersonaPreset,
  RubricDimension,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'

interface DefensePersonaPresetRow {
  id: string
  external_id: string
  contest_external_id: string
  track_external_id: string | null
  sync_item_id: string | null
  judge_type: AiDefensePersonaJudgeType
  name: string
  summary: string
  system_prompt: string
  focus_json: unknown
  scoring_json: unknown
  enabled: boolean
  sort_order: number | string
  metadata: unknown
  created_by_user_id: string
  updated_by_user_id: string
  created_at: string
  updated_at: string
}

type DefensePersonaImportDraft = Omit<
  AiDefensePersona,
  'id' | 'projectId' | 'createdByUserId' | 'updatedByUserId' | 'createdAt' | 'updatedAt'
>

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
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeString(item))
      .filter(Boolean)
  }

  const text = normalizeString(value)
  if (!text)
    return []

  return text
    .split(/[|,，、;；\n]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function normalizeRubricDimensions(value: unknown): RubricDimension[] {
  const arrayValue = Array.isArray(value)
    ? value
    : (() => {
        const text = normalizeString(value)
        if (!text)
          return []
        try {
          const parsed = JSON.parse(text)
          return Array.isArray(parsed) ? parsed : []
        }
        catch {
          return []
        }
      })()

  if (!Array.isArray(arrayValue))
    return []

  const next: RubricDimension[] = []
  for (const item of arrayValue) {
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

function mapDefensePersonaPreset(row: DefensePersonaPresetRow): AiDefensePersonaPreset {
  return {
    id: row.id,
    externalId: normalizeString(row.external_id),
    contestExternalId: normalizeString(row.contest_external_id),
    trackExternalId: normalizeString(row.track_external_id) || null,
    syncItemId: normalizeString(row.sync_item_id) || null,
    judgeType: row.judge_type,
    name: normalizeString(row.name),
    summary: normalizeString(row.summary),
    systemPrompt: normalizeString(row.system_prompt),
    focusAreas: normalizeStringArray(row.focus_json),
    scoringRubric: normalizeRubricDimensions(row.scoring_json),
    enabled: Boolean(row.enabled),
    sortOrder: Math.max(0, Math.trunc(toNumber(row.sort_order, 0))),
    metadata: normalizeRecord(row.metadata),
    createdByUserId: normalizeString(row.created_by_user_id),
    updatedByUserId: normalizeString(row.updated_by_user_id),
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

function sortDefensePersonaPresets(left: AiDefensePersonaPreset, right: AiDefensePersonaPreset): number {
  if (left.sortOrder !== right.sortOrder)
    return left.sortOrder - right.sortOrder
  return left.name.localeCompare(right.name, 'zh-CN')
}

export function pickDefensePersonaPresetsForImport(input: {
  presets: AiDefensePersonaPreset[]
  trackExternalId?: string | null
}): AiDefensePersonaPreset[] {
  const trackExternalId = normalizeString(input.trackExternalId)
  const presets = [...input.presets].sort(sortDefensePersonaPresets)
  if (!trackExternalId)
    return presets.filter(item => !normalizeString(item.trackExternalId))

  const trackScoped = presets.filter(item => normalizeString(item.trackExternalId) === trackExternalId)
  if (trackScoped.length > 0)
    return trackScoped

  return presets.filter(item => !normalizeString(item.trackExternalId))
}

export function buildDefensePersonaImportDraftsFromPresets(input: {
  presets: AiDefensePersonaPreset[]
  sourceContestId: string
  sourceTrackId?: string | null
}): DefensePersonaImportDraft[] {
  const sourceContestId = normalizeString(input.sourceContestId)
  const sourceTrackId = normalizeString(input.sourceTrackId) || null
  return [...input.presets]
    .sort(sortDefensePersonaPresets)
    .map((item) => {
      return {
        sourceContestId,
        sourceTrackId,
        sourceTemplateKey: `preset:${item.externalId}`,
        judgeType: item.judgeType,
        name: item.name,
        summary: item.summary,
        systemPrompt: item.systemPrompt,
        focusAreas: [...item.focusAreas],
        scoringRubric: [...item.scoringRubric],
        enabled: item.enabled,
        sortOrder: item.sortOrder,
        isCustomized: false,
      }
    })
}

export async function getDefensePersonaPresetByExternalId(
  db: Queryable,
  input: {
    externalId: string
  },
): Promise<AiDefensePersonaPreset | null> {
  const externalId = normalizeString(input.externalId)
  if (!externalId)
    return null

  const result = await db.query<DefensePersonaPresetRow>(
    `SELECT
      id,
      external_id,
      contest_external_id,
      track_external_id,
      sync_item_id,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM defense_persona_presets
     WHERE external_id = $1
     LIMIT 1`,
    [externalId],
  )

  return result.rows[0] ? mapDefensePersonaPreset(result.rows[0]) : null
}

export async function listDefensePersonaPresetsByContestExternalId(
  db: Queryable,
  input: {
    contestExternalId: string
  },
): Promise<AiDefensePersonaPreset[]> {
  const contestExternalId = normalizeString(input.contestExternalId)
  if (!contestExternalId)
    return []

  const result = await db.query<DefensePersonaPresetRow>(
    `SELECT
      id,
      external_id,
      contest_external_id,
      track_external_id,
      sync_item_id,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT
     FROM defense_persona_presets
     WHERE contest_external_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [contestExternalId],
  )

  return result.rows.map(mapDefensePersonaPreset)
}

export async function upsertDefensePersonaPreset(
  db: Queryable,
  input: {
    actorUserId: string
    syncItemId?: string | null
    externalId: string
    contestExternalId: string
    trackExternalId?: string | null
    judgeType: AiDefensePersonaJudgeType
    name: string
    summary?: string
    systemPrompt: string
    focusAreas?: string[]
    scoringRubric?: RubricDimension[]
    enabled?: boolean
    sortOrder?: number
    metadata?: Record<string, unknown>
  },
): Promise<{ preset: AiDefensePersonaPreset, existed: boolean }> {
  const externalId = normalizeString(input.externalId)
  const existing = await getDefensePersonaPresetByExternalId(db, {
    externalId,
  })
  const id = existing?.id || randomUUID()

  const result = await db.query<DefensePersonaPresetRow>(
    `INSERT INTO defense_persona_presets (
      id,
      external_id,
      contest_external_id,
      track_external_id,
      sync_item_id,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10::JSONB, $11::JSONB, $12, $13, $14::JSONB,
      $15, $15, NOW(), NOW()
    )
    ON CONFLICT (external_id)
    DO UPDATE SET
      contest_external_id = EXCLUDED.contest_external_id,
      track_external_id = EXCLUDED.track_external_id,
      sync_item_id = EXCLUDED.sync_item_id,
      judge_type = EXCLUDED.judge_type,
      name = EXCLUDED.name,
      summary = EXCLUDED.summary,
      system_prompt = EXCLUDED.system_prompt,
      focus_json = EXCLUDED.focus_json,
      scoring_json = EXCLUDED.scoring_json,
      enabled = EXCLUDED.enabled,
      sort_order = EXCLUDED.sort_order,
      metadata = EXCLUDED.metadata,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()
    RETURNING
      id,
      external_id,
      contest_external_id,
      track_external_id,
      sync_item_id,
      judge_type,
      name,
      summary,
      system_prompt,
      focus_json,
      scoring_json,
      enabled,
      sort_order,
      metadata,
      created_by_user_id,
      updated_by_user_id,
      created_at::TEXT,
      updated_at::TEXT`,
    [
      id,
      externalId,
      normalizeString(input.contestExternalId),
      normalizeString(input.trackExternalId),
      normalizeString(input.syncItemId),
      input.judgeType,
      normalizeString(input.name),
      normalizeString(input.summary),
      normalizeString(input.systemPrompt),
      JSON.stringify(normalizeStringArray(input.focusAreas)),
      JSON.stringify(input.scoringRubric || []),
      input.enabled !== false,
      Math.max(0, Math.trunc(toNumber(input.sortOrder, 0))),
      JSON.stringify(normalizeRecord(input.metadata)),
      normalizeString(input.actorUserId),
    ],
  )

  return {
    preset: mapDefensePersonaPreset(result.rows[0]!),
    existed: Boolean(existing),
  }
}
