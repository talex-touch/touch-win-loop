import type { RuleDefinition } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { upsertRuleDefinition } from '~~/server/utils/rule-store'

interface UpsertRuleDefinitionBody {
  versionId?: string
  definition?: Partial<RuleDefinition> & Pick<RuleDefinition, 'code' | 'name' | 'category' | 'severity' | 'assert' | 'messageTemplate'>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<UpsertRuleDefinitionBody>(event).catch(() => ({} as UpsertRuleDefinitionBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权编辑规则定义。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40427)
  }

  const versionId = String(body.versionId || '').trim()
  if (!versionId || !body.definition) {
    setResponseStatus(event, 400)
    return fail('versionId 与 definition 为必填项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40123)
  }

  try {
    const definition = await withTransaction(event, async (db) => {
      return upsertRuleDefinition(db, {
        actorUserId: user.id,
        versionId,
        definition: body.definition!,
      })
    })
    return ok<RuleDefinition>(definition, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '规则定义保存失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50123)
  }
})
