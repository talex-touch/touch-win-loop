import type { RuleVersion } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { createRuleVersion } from '~~/server/utils/rule-store'

interface CreateRuleVersionBody {
  name?: string
  note?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateRuleVersionBody>(event).catch(() => ({} as CreateRuleVersionBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权创建规则版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40421)
  }

  const version = await withTransaction(event, async (db) => {
    return createRuleVersion(db, {
      actorUserId: user.id,
      name: String(body.name || '').trim(),
      note: String(body.note || '').trim(),
    })
  })

  return ok<RuleVersion>(version, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
