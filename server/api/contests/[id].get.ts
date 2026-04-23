import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { getContestDetail } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const contestId = getRouterParam(event, 'id') || ''
  const detail = await withClient(event, async (db) => {
    return getContestDetail(db, {
      contestId,
      includeInternal: false,
    })
  })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('contest not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40401)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
