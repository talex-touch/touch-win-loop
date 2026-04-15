import type { MockupDeviceCategory, MockupDeviceModelStatus } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listMockupDeviceModels } from '~~/server/utils/mockup-device-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canRead = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 Mockup 型号目录。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40601)
  }

  const query = getQuery(event)
  const items = await withClient(event, async (db) => {
    return listMockupDeviceModels(db, {
      status: normalizeString(query.status) as MockupDeviceModelStatus,
      category: normalizeString(query.category) as MockupDeviceCategory,
      search: normalizeString(query.search),
    })
  })

  return ok(items, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
