import type { ResourceAvailability, ResourceCategory } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { listAllResources } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const query = getQuery(event)
  const auth = await getAuthFromEvent(event)
  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false
  const category = typeof query.category === 'string' ? query.category as ResourceCategory : ''
  const availability = typeof query.availability === 'string' ? query.availability as ResourceAvailability : ''

  const resources = await withClient(event, async (db) => {
    return listAllResources(db, {
      includeInternal,
      contestId: typeof query.contestId === 'string' ? query.contestId : '',
      category,
      year: typeof query.year === 'string' && query.year ? Number(query.year) : undefined,
      availability,
      type: typeof query.type === 'string' ? query.type : '',
    })
  })

  return ok(resources, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
