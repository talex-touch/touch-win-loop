import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { commitContestImportRows, previewContestImportCsv } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface CommitImportBody {
  csvText?: string
  skipInvalid?: boolean
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CommitImportBody>(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权执行导入提交。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40390)
  }

  const csvText = String(body?.csvText || '')
  if (!csvText.trim()) {
    setResponseStatus(event, 400)
    return fail('csvText 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40090)
  }

  const skipInvalid = body?.skipInvalid !== false

  let payload: { preview: Awaited<ReturnType<typeof previewContestImportCsv>>, commit: Awaited<ReturnType<typeof commitContestImportRows>> }
  try {
    payload = await withTransaction(event, async (db) => {
      const preview = await previewContestImportCsv(db, { csvText })

      if (!skipInvalid && preview.invalidCount > 0) {
        const err = new Error('IMPORT_PREVIEW_CONTAINS_INVALID_ROWS')
        ;(err as Error & { preview?: typeof preview }).preview = preview
        throw err
      }

      const commit = await commitContestImportRows(db, {
        actorUserId: user.id,
        rows: preview.rows,
        skipInvalid,
      })

      return {
        preview,
        commit,
      }
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'IMPORT_PREVIEW_CONTAINS_INVALID_ROWS') {
      setResponseStatus(event, 400)
      return fail(
        '导入预检未通过，请先修复无效行或设置 skipInvalid=true。',
        {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: false,
          attempts: 1,
        },
        40091,
      )
    }
    throw error
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
