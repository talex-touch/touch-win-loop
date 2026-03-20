import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  completeContestSyncRun,
  createContestSyncRun,
  executeContestSyncImport,
  getContestSyncSourceById,
} from '~~/server/utils/contest-sync-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface SyncRunBody {
  sourceUrl?: string
}

function assertCsvUrl(sourceUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  }
  catch {
    throw new Error('SOURCE_URL_INVALID')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('SOURCE_URL_INVALID')
}

async function fetchCsvText(sourceUrl: string): Promise<string> {
  assertCsvUrl(sourceUrl)
  const response = await fetch(sourceUrl, {
    method: 'GET',
    headers: {
      accept: 'text/csv,text/plain,*/*',
    },
  })

  if (!response.ok)
    throw new Error(`SOURCE_FETCH_FAILED:${response.status}`)

  return response.text()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const sourceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<SyncRunBody>(event).catch(() => ({} as SyncRunBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权触发同步任务。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40394)
  }

  if (!sourceId) {
    setResponseStatus(event, 400)
    return fail('sourceId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const source = await withClient(event, async (db) => {
    return getContestSyncSourceById(db, sourceId)
  })

  if (!source) {
    setResponseStatus(event, 404)
    return fail('同步数据源不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  if (!source.isActive) {
    setResponseStatus(event, 400)
    return fail('该数据源已停用，无法触发同步。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
  }

  const runId = await withClient(event, async (db) => {
    return createContestSyncRun(db, {
      sourceId,
      createdByUserId: user.id,
    })
  })

  const sourceUrl = String(body?.sourceUrl || source.sourceUrl || '').trim()

  try {
    const csvText = await fetchCsvText(sourceUrl)
    const run = await withTransaction(event, async (db) => {
      return executeContestSyncImport(db, {
        runId,
        sourceId,
        actorUserId: user.id,
        csvText,
      })
    })

    return ok(run, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'UNKNOWN_ERROR'

    await withClient(event, async (db) => {
      await completeContestSyncRun(db, {
        runId,
        sourceId,
        status: 'failed',
        errorCount: 1,
        errorMessage,
      })
    })

    if (errorMessage === 'SOURCE_URL_INVALID')
      setResponseStatus(event, 400)
    else if (errorMessage.startsWith('SOURCE_FETCH_FAILED'))
      setResponseStatus(event, 502)
    else
      setResponseStatus(event, 500)
    return fail(`同步任务执行失败：${errorMessage}`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, errorMessage === 'SOURCE_URL_INVALID' ? 40097 : 50095)
  }
})
