import { listResources } from '~~/server/data/catalog'
import { ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const query = getQuery(event)

  const resources = listResources().filter((resource) => {
    if (typeof query.contestId === 'string' && query.contestId && resource.contestId !== query.contestId)
      return false

    if (typeof query.type === 'string' && query.type && resource.type !== query.type)
      return false

    if (typeof query.year === 'string' && query.year && resource.year !== Number(query.year))
      return false

    return true
  })

  return ok(resources, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
