import type { Queryable } from '~~/server/utils/db'
import type { UserAiMemoryItem, UserAiSettings } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { AUTO_MODEL_GROUP_KEY, AUTO_MODEL_ID } from '~~/server/utils/ai-model-catalog'

interface UserAiSettingsRow {
  user_id: string
  memory_enabled: boolean
  pilot_enabled: boolean
  reasoning_enabled: boolean
  network_enabled: boolean
  temperature: number | string
  selected_model_group: string
  selected_model_id: string
  updated_at: string
}

interface UserAiMemoryRow {
  id: string
  user_id: string
  memory_text: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const DEFAULT_TEMPERATURE = 0.2

export function defaultUserAiSettings(): UserAiSettings {
  return {
    memoryEnabled: true,
    pilotEnabled: false,
    reasoningEnabled: false,
    networkEnabled: false,
    temperature: DEFAULT_TEMPERATURE,
    selectedModelGroup: AUTO_MODEL_GROUP_KEY,
    selectedModelId: AUTO_MODEL_ID,
  }
}

function normalizeTemperature(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return DEFAULT_TEMPERATURE
  return Math.max(0, Math.min(1, parsed))
}

function mapSettingsRow(row: UserAiSettingsRow): UserAiSettings {
  return {
    memoryEnabled: Boolean(row.memory_enabled),
    pilotEnabled: Boolean(row.pilot_enabled),
    reasoningEnabled: Boolean(row.reasoning_enabled),
    networkEnabled: Boolean(row.network_enabled),
    temperature: normalizeTemperature(row.temperature),
    selectedModelGroup: String(row.selected_model_group || AUTO_MODEL_GROUP_KEY),
    selectedModelId: String(row.selected_model_id || AUTO_MODEL_ID),
    updatedAt: row.updated_at,
  }
}

function mapMemoryRow(row: UserAiMemoryRow): UserAiMemoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    memoryText: row.memory_text,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }
}

export async function getUserAiSettings(db: Queryable, userId: string): Promise<UserAiSettings> {
  const result = await db.query<UserAiSettingsRow>(
    `SELECT
      user_id,
      memory_enabled,
      pilot_enabled,
      reasoning_enabled,
      network_enabled,
      temperature,
      selected_model_group,
      selected_model_id,
      updated_at::TEXT
     FROM user_ai_settings
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  )

  const row = result.rows[0]
  if (!row)
    return defaultUserAiSettings()

  return mapSettingsRow(row)
}

export async function upsertUserAiSettings(
  db: Queryable,
  input: {
    userId: string
    settings: UserAiSettings
  },
): Promise<UserAiSettings> {
  const result = await db.query<UserAiSettingsRow>(
    `INSERT INTO user_ai_settings (
      user_id,
      memory_enabled,
      pilot_enabled,
      reasoning_enabled,
      network_enabled,
      temperature,
      selected_model_group,
      selected_model_id,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      memory_enabled = EXCLUDED.memory_enabled,
      pilot_enabled = EXCLUDED.pilot_enabled,
      reasoning_enabled = EXCLUDED.reasoning_enabled,
      network_enabled = EXCLUDED.network_enabled,
      temperature = EXCLUDED.temperature,
      selected_model_group = EXCLUDED.selected_model_group,
      selected_model_id = EXCLUDED.selected_model_id,
      updated_at = NOW()
    RETURNING
      user_id,
      memory_enabled,
      pilot_enabled,
      reasoning_enabled,
      network_enabled,
      temperature,
      selected_model_group,
      selected_model_id,
      updated_at::TEXT`,
    [
      input.userId,
      input.settings.memoryEnabled,
      input.settings.pilotEnabled,
      input.settings.reasoningEnabled,
      input.settings.networkEnabled,
      normalizeTemperature(input.settings.temperature),
      input.settings.selectedModelGroup,
      input.settings.selectedModelId,
    ],
  )

  return mapSettingsRow(result.rows[0]!)
}

export async function deleteUserAiMemories(db: Queryable, userId: string): Promise<number> {
  const result = await db.query<{ deleted: number | string }>(
    `WITH deleted_rows AS (
      DELETE FROM user_ai_memories
      WHERE user_id = $1
      RETURNING id
    )
    SELECT COUNT(*)::INT AS deleted
    FROM deleted_rows`,
    [userId],
  )

  return Number(result.rows[0]?.deleted || 0)
}

export async function appendUserAiMemory(
  db: Queryable,
  input: {
    userId: string
    memoryText: string
    metadata?: Record<string, unknown>
  },
): Promise<UserAiMemoryItem | null> {
  const text = String(input.memoryText || '').trim()
  if (!text)
    return null

  const result = await db.query<UserAiMemoryRow>(
    `INSERT INTO user_ai_memories (
      id,
      user_id,
      memory_text,
      metadata,
      created_at
    ) VALUES ($1, $2, $3, $4::JSONB, NOW())
    RETURNING
      id,
      user_id,
      memory_text,
      metadata,
      created_at::TEXT`,
    [
      randomUUID(),
      input.userId,
      text,
      JSON.stringify(input.metadata || {}),
    ],
  )

  return mapMemoryRow(result.rows[0]!)
}
