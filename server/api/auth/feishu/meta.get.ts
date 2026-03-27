import type { FeishuIntegrationConfig } from '~~/shared/types/domain'
import { readFeishuAuthMeta } from '~~/server/services/feishu/login-flow'
import { ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const meta = await readFeishuAuthMeta(event)

  return ok<FeishuIntegrationConfig>(meta, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
