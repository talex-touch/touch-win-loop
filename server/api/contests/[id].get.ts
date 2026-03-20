import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { getContestDetail, recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const auth = await getAuthFromEvent(event)
  const contestId = getRouterParam(event, 'id') || ''
  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false
  const detail = await withClient(event, async (db) => {
    return getContestDetail(db, {
      contestId,
      includeInternal,
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

  if (includeInternal && auth?.user?.id) {
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: auth.user.id,
        action: 'read.internal.contest_detail',
        contestId,
      })
    })
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
