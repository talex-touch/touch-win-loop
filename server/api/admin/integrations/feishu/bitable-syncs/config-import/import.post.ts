import type { FeishuBitableSyncConfigImportResult, FeishuBitableSyncConfigPackage } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import {
  fetchFeishuBitableSyncConfigPackageFromUrl,
  importFeishuBitableSyncConfigPackage,
  normalizeFeishuBitableSyncConfigPackage,
} from '~~/server/utils/feishu-bitable-sync-config-package'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ImportConfigBody {
  url?: string
  shareKey?: string
  package?: FeishuBitableSyncConfigPackage | Record<string, unknown>
}

async function resolvePackage(body: ImportConfigBody): Promise<FeishuBitableSyncConfigPackage> {
  const url = String(body.url || '').trim()
  if (url)
    return fetchFeishuBitableSyncConfigPackageFromUrl(url)
  if (body.package)
    return normalizeFeishuBitableSyncConfigPackage(body.package)
  return fetchFeishuBitableSyncConfigPackageFromUrl('')
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<ImportConfigBody>(event).catch(() => ({} as ImportConfigBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权导入飞书同步配置。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  try {
    const pkg = await resolvePackage(body)
    const result = await withTransaction(event, db => importFeishuBitableSyncConfigPackage(db, {
      actorUserId: user.id,
      package: pkg,
      sourceShareKey: body.shareKey,
    }))

    return ok<FeishuBitableSyncConfigImportResult>(result, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '配置包导入失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40196)
  }
})
