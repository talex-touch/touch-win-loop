import type { ContestLevel } from '~~/shared/types/domain'
import { filterContests } from '~~/server/data/catalog'
import { ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const query = getQuery(event)

  const keywordQuery = typeof query.keyword === 'string'
    ? query.keyword.split(',').map(item => item.trim()).filter(Boolean)
    : []

  const contests = filterContests({
    q: typeof query.q === 'string' ? query.q : '',
    discipline: typeof query.discipline === 'string' ? query.discipline : '',
    level: (typeof query.level === 'string' ? query.level : '') as ContestLevel | '',
    major: typeof query.major === 'string' ? query.major : '',
    trackType: typeof query.trackType === 'string' ? query.trackType : '',
    keyword: keywordQuery,
  })

  return ok(contests, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
