import type { ContestLevel } from '~~/shared/types/domain'
import { defineApiHandler } from '~~/server/utils/api-handler'
import { getAuthFromEvent } from '~~/server/utils/auth'
import { listContestLibrary } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineApiHandler(async ({ event, ok }) => {
  const query = getQuery(event)
  const auth = await getAuthFromEvent(event)

  const keywordQuery = typeof query.keyword === 'string'
    ? query.keyword.split(',').map(item => item.trim()).filter(Boolean)
    : []

  const includeInternal = auth?.user
    ? Boolean(auth.user.isPlatformAdmin || await checkPlatformPermission(event, auth.user, 'contest.read_internal'))
    : false

  const contestResult = await withClient(event, async (db) => {
    return listContestLibrary(db, {
      includeInternal,
      q: typeof query.q === 'string' ? query.q : '',
      discipline: typeof query.discipline === 'string' ? query.discipline : '',
      level: (typeof query.level === 'string' ? query.level : '') as ContestLevel | '',
      major: typeof query.major === 'string' ? query.major : '',
      trackType: typeof query.trackType === 'string' ? query.trackType : '',
      keyword: keywordQuery,
      deliverableType: typeof query.deliverableType === 'string' ? query.deliverableType : '',
      timelineStatus: typeof query.timelineStatus === 'string' ? query.timelineStatus : '',
      sort: typeof query.sort === 'string' ? query.sort : '',
      page: Number(query.page || 1),
      pageSize: Number(query.pageSize || 20),
    })
  })

  return {
    ...ok(contestResult.items),
    pagination: {
      total: contestResult.total,
      page: contestResult.page,
      pageSize: contestResult.pageSize,
    },
  }
})
