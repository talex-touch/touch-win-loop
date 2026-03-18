import { setResponseStatus } from 'h3'
import { findContestById, findRubricByTrackId } from '~~/server/data/catalog'
import { fail, ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const contestId = getRouterParam(event, 'id') || ''
  const contest = findContestById(contestId)

  if (!contest) {
    setResponseStatus(event, 404)
    return fail('contest not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40401)
  }

  return ok({
    ...contest,
    rubrics: contest.tracks
      .map(track => findRubricByTrackId(track.id))
      .filter(Boolean),
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
