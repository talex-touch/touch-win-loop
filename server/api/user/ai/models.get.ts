import type { AiModelCatalog } from '~~/shared/types/domain'
import { resolveAiModelCatalog } from '~~/server/utils/ai-model-catalog'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  await requireAuth(event)

  const catalog = resolveAiModelCatalog(runtime)

  return ok<AiModelCatalog>(catalog, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
