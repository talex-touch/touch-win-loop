import type { AdminReportQuery } from '~~/shared/types/admin-operations'
import { setHeader, setResponseStatus } from 'h3'
import { exportAdminOperationsReportCsv, exportAdminOperationsReportPdf } from '~~/server/utils/admin-operations-store'
import { fail } from '~~/server/utils/api'
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
    return fail('当前用户无权导出运营报表。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403418)
  }

  try {
    const query = getQuery(event)
    const format = String(query.format || '').trim().toLowerCase() === 'pdf' ? 'pdf' : 'csv'
    const disposition = String(query.disposition || '').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment'
    const body = await readBody<AdminReportQuery>(event)
    if (format === 'pdf') {
      const exported = await withClient(event, async db => exportAdminOperationsReportPdf(db, body, event))
      setHeader(event, 'Content-Type', 'application/pdf')
      setHeader(event, 'Content-Disposition', `${disposition}; filename="${exported.fileName}"`)
      return exported.pdf
    }

    const exported = await withClient(event, async db => exportAdminOperationsReportCsv(db, body, event))
    setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${exported.fileName}"`)
    return exported.csv
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
      }, 400418)
    }

    throw error
  }
})
