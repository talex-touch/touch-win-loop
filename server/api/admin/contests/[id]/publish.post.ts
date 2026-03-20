import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { publishAdminContest } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = getRouterParam(event, 'id') || ''

  if (!contestId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40064)
  }

  const canPublish = await checkPlatformPermission(event, user, 'contest.publish')
  if (!canPublish) {
    setResponseStatus(event, 403)
    return fail('当前用户无权发布赛事。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40364)
  }

  let patched = null
  try {
    patched = await withTransaction(event, async (db) => {
      return publishAdminContest(db, {
        actorUserId: user.id,
        contestId,
      })
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'PUBLISH_CHECK_FAILED') {
      const publishCheck = (error as Error & {
        publishCheck?: {
          blockers?: Array<{ message?: string }>
        }
      }).publishCheck
      const blockerText = (publishCheck?.blockers || [])
        .map(item => String(item?.message || '').trim())
        .filter(Boolean)
        .join('；')
      setResponseStatus(event, 400)
      return fail(
        blockerText ? `发布校验未通过：${blockerText}` : '发布校验未通过，请先补全阻断项。',
        {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: false,
          attempts: 1,
        },
        40066,
      )
    }
    throw error
  }

  if (!patched) {
    setResponseStatus(event, 404)
    return fail('contest not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40464)
  }

  return ok(patched, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
