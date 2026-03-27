import type { RuleBinding } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { upsertRuleBinding } from '~~/server/utils/rule-store'

interface UpsertRuleBindingBody {
  versionId?: string
  binding?: Partial<RuleBinding> & Pick<RuleBinding, 'ruleId' | 'scopeType' | 'scopeValue'>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<UpsertRuleBindingBody>(event).catch(() => ({} as UpsertRuleBindingBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑规则绑定。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40432)
  }

  const versionId = String(body.versionId || '').trim()
  if (!versionId || !body.binding) {
    setResponseStatus(event, 400)
    return fail('versionId 与 binding 为必填项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40126)
  }

  try {
    const binding = await withTransaction(event, async (db) => {
      return upsertRuleBinding(db, {
        actorUserId: user.id,
        versionId,
        binding: body.binding!,
      })
    })
    return ok<RuleBinding>(binding, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '规则绑定更新失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50126)
  }
})
