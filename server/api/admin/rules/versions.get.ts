import type { RuleVersion } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listRuleVersions } from '~~/server/utils/rule-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看规则版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40420)
  }

  const statusRaw = String(query.status || '').trim()
  const status = ['draft', 'published'].includes(statusRaw)
    ? statusRaw as RuleVersion['status']
    : undefined
  const limit = Number(query.limit || 50)

  const versions = await withClient(event, async (db) => {
    return listRuleVersions(db, {
      status,
      limit,
    })
  })

  return ok<RuleVersion[]>(versions, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
