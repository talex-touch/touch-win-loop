import type { FeishuBitableAppMeta } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getFeishuTenantAccessToken, listFeishuBitableApps } from '~~/server/services/feishu/client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权检索飞书多维数据源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40431)
  }

  const keyword = String(getQuery(event).keyword || '').trim()
  const limit = Math.max(1, Math.min(100, Number(getQuery(event).limit || 20)))
  const config = await withClient(event, async db => readFeishuIntegrationConfig(db))
  if (!config.enabled || !config.appId || !config.appSecret) {
    return ok<FeishuBitableAppMeta[]>([], {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const apps = await listFeishuBitableApps({
      tenantAccessToken,
      keyword,
      limit,
    })
    return ok<FeishuBitableAppMeta[]>(apps.map(item => ({
      appToken: item.appToken,
      name: item.name,
    })), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '检索飞书多维数据源失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50431)
  }
})
