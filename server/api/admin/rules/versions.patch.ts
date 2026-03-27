import type { RuleVersion } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { publishRuleVersion, rollbackRuleVersion } from '~~/server/utils/rule-store'

interface PatchRuleVersionBody {
  action?: 'publish' | 'rollback'
  versionId?: string
  sourceVersionId?: string
  name?: string
  note?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchRuleVersionBody>(event).catch(() => ({} as PatchRuleVersionBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权发布或回滚规则版本。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40422)
  }

  const action = body.action
  if (!action || !['publish', 'rollback'].includes(action)) {
    setResponseStatus(event, 400)
    return fail('action 仅支持 publish 或 rollback。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40120)
  }

  if (action === 'publish') {
    const versionId = String(body.versionId || '').trim()
    if (!versionId) {
      setResponseStatus(event, 400)
      return fail('versionId 不能为空。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40121)
    }
    const version = await withTransaction(event, async (db) => {
      return publishRuleVersion(db, {
        actorUserId: user.id,
        versionId,
        note: String(body.note || '').trim(),
      })
    })
    if (!version) {
      setResponseStatus(event, 404)
      return fail('规则版本不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40423)
    }
    return ok<RuleVersion>(version, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  const sourceVersionId = String(body.sourceVersionId || body.versionId || '').trim()
  if (!sourceVersionId) {
    setResponseStatus(event, 400)
    return fail('sourceVersionId 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40122)
  }

  try {
    const version = await withTransaction(event, async (db) => {
      return rollbackRuleVersion(db, {
        actorUserId: user.id,
        sourceVersionId,
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
  }
  catch (error) {
    if (error instanceof Error && error.message === 'RULE_VERSION_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('规则版本不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40424)
    }
    throw error
  }
})
