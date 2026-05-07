import type { FeishuBitableSyncConfigImportPreview, FeishuBitableSyncConfigPackage } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  buildFeishuBitableSyncConfigPackageSummary,
  fetchFeishuBitableSyncConfigPackageFromUrl,
  normalizeFeishuBitableSyncConfigPackage,
} from '~~/server/utils/feishu-bitable-sync-config-package'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface PreviewConfigImportBody {
  url?: string
  package?: FeishuBitableSyncConfigPackage | Record<string, unknown>
}

async function resolvePackage(body: PreviewConfigImportBody): Promise<FeishuBitableSyncConfigPackage> {
  if (body.package)
    return normalizeFeishuBitableSyncConfigPackage(body.package)
  return fetchFeishuBitableSyncConfigPackageFromUrl(String(body.url || '').trim())
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PreviewConfigImportBody>(event).catch(() => ({} as PreviewConfigImportBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权预览飞书同步配置导入。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  try {
    const pkg = await resolvePackage(body)
    return ok<FeishuBitableSyncConfigImportPreview>({
      package: pkg,
      summary: buildFeishuBitableSyncConfigPackageSummary(pkg),
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '配置包预览失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40195)
  }
})
