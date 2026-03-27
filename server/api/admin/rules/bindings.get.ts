import type { RuleBinding } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { listRuleBindings, resolveRuleVersionId } from '~~/server/utils/rule-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看规则绑定。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40429)
  }

  const expectedVersionId = String(query.versionId || '').trim()
  const versionId = await withClient(event, async (db) => {
    return resolveRuleVersionId(db, {
      versionId: expectedVersionId || undefined,
      fallbackPublished: !expectedVersionId,
    })
  })
  if (!versionId) {
    setResponseStatus(event, 404)
    return fail('未找到可用规则版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40430)
  }

  const bindings = await withClient(event, async (db) => {
    return listRuleBindings(db, { versionId })
  })

  return ok<RuleBinding[]>(bindings, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
