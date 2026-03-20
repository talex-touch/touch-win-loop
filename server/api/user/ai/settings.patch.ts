import type { UserAiSettings } from '~~/shared/types/domain'
import { resolveAiModelCatalog, resolveAiModelSelection } from '~~/server/utils/ai-model-catalog'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import {
  deleteUserAiMemories,
  getUserAiSettings,
  upsertUserAiSettings,
} from '~~/server/utils/user-ai-store'

interface PatchUserAiSettingsBody {
  memoryEnabled?: boolean
  pilotEnabled?: boolean
  reasoningEnabled?: boolean
  networkEnabled?: boolean
  temperature?: number
  selectedModelGroup?: string
  selectedModelId?: string
}

function normalizeTemperature(raw: unknown, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.max(0, Math.min(1, parsed))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchUserAiSettingsBody>(event)
  const modelCatalog = resolveAiModelCatalog(runtime)

  const settings = await withTransaction(event, async (db) => {
    const current = await getUserAiSettings(db, user.id)

    const merged: UserAiSettings = {
      memoryEnabled: typeof body?.memoryEnabled === 'boolean' ? body.memoryEnabled : current.memoryEnabled,
      pilotEnabled: typeof body?.pilotEnabled === 'boolean' ? body.pilotEnabled : current.pilotEnabled,
      reasoningEnabled: typeof body?.reasoningEnabled === 'boolean' ? body.reasoningEnabled : current.reasoningEnabled,
      networkEnabled: typeof body?.networkEnabled === 'boolean' ? body.networkEnabled : current.networkEnabled,
      temperature: normalizeTemperature(body?.temperature, current.temperature),
      selectedModelGroup: String(body?.selectedModelGroup || current.selectedModelGroup || '').trim(),
      selectedModelId: String(body?.selectedModelId || current.selectedModelId || '').trim(),
    }

    const selectedModel = resolveAiModelSelection(
      runtime,
      modelCatalog,
      merged.selectedModelGroup,
      merged.selectedModelId,
    )
    merged.selectedModelGroup = selectedModel.selectedModelGroup
    merged.selectedModelId = selectedModel.selectedModelId

    const saved = await upsertUserAiSettings(db, {
      userId: user.id,
      settings: merged,
    })

    if (current.memoryEnabled && !saved.memoryEnabled)
      await deleteUserAiMemories(db, user.id)

    return saved
  })

  return ok<UserAiSettings>(settings, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
