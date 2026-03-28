import type { FeishuAuthUnbindResult } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  getFeishuAuthBindStatusByUserId,
  unbindFeishuAuthByUserId,
} from '~~/server/utils/feishu-integration-store'

interface UnbindBody {
  confirmText?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<UnbindBody>(event).catch(() => ({} as UnbindBody))
  const confirmText = String(body.confirmText || '').trim().toUpperCase()

  if (confirmText !== 'UNBIND') {
    setResponseStatus(event, 400)
    return fail('请输入确认口令 UNBIND 后再执行解绑。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40111)
  }

  const result = await withTransaction(event, async (db) => {
    const statusBefore = await getFeishuAuthBindStatusByUserId(db, user.id)
    const unbindResult = await unbindFeishuAuthByUserId(db, user.id)

    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'auth.feishu.unbind.self',
      payload: {
        statusBefore,
        removedCount: unbindResult.removedCount,
        removedUnionIds: unbindResult.removedUnionIds,
      },
    })

    return unbindResult
  })

  return ok<FeishuAuthUnbindResult>(result, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
