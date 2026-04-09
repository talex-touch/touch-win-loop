import type { CasdoorIntegrationConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  readCasdoorIntegrationConfig,
  toPublicCasdoorIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 Casdoor 集成配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  const config = await withClient(event, async (db) => {
    return readCasdoorIntegrationConfig(db)
  })

  return ok<CasdoorIntegrationConfig>(toPublicCasdoorIntegrationConfig(config), {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
