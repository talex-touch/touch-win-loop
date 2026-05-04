import type { FeishuBitableSyncConfigImportPreview } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { buildFeishuBitableSyncConfigPackageSummary } from '~~/server/utils/feishu-bitable-sync-config-package'
import { getActiveFeishuBitableSyncConfigShareByKey } from '~~/server/utils/feishu-bitable-sync-config-share-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const shareKey = String(getRouterParam(event, 'shareKey') || '').trim()

  if (!shareKey) {
    setResponseStatus(event, 400)
    return fail('配置包分享 key 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40190)
  }

  const share = await withClient(event, db => getActiveFeishuBitableSyncConfigShareByKey(db, shareKey))
  if (!share) {
    setResponseStatus(event, 404)
    return fail('配置包分享不存在、已过期或已撤销。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40490)
  }

  return ok<FeishuBitableSyncConfigImportPreview>({
    package: share.package,
    summary: buildFeishuBitableSyncConfigPackageSummary(share.package),
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
