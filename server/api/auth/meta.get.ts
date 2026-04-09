import type { AuthLoginMeta } from '~~/shared/types/domain'
import { isCasdoorAuthEnabled } from '~~/server/services/casdoor/client'
import { readFeishuAuthMeta } from '~~/server/services/feishu/login-flow'
import { ok } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readCasdoorIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const [{ runtime }, feishuMeta, casdoorConfig] = await Promise.all([
    readEffectivePlatformRuntimeSettings(event),
    readFeishuAuthMeta(event),
    withClient(event, async (db) => {
      return readCasdoorIntegrationConfig(db)
    }),
  ])

  return ok<AuthLoginMeta>({
    registrationEnabled: runtime.auth.registrationEnabled,
    feishu: feishuMeta,
    casdoor: {
      enabled: isCasdoorAuthEnabled(casdoorConfig),
    },
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
