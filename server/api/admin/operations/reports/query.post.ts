import type { AdminReportQuery } from '~~/shared/types/admin-operations'
import { setResponseStatus } from 'h3'
import { queryAdminOperationsReport } from '~~/server/utils/admin-operations-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查询运营报表。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403417)
  }

  try {
    const body = await readBody<AdminReportQuery>(event)
    const payload = await withClient(event, async db => queryAdminOperationsReport(db, body, event))

    return ok(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    const message = String(error?.message || '')
    if (message === 'ADMIN_REPORT_DATASET_NOT_SUPPORTED') {
      setResponseStatus(event, 400)
      return fail('不支持的报表数据集。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 400417)
    }

    throw error
  }
})
