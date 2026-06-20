import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { aggregatePlatformAiModels } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ModelRow {
  provider: string
  model: string
  messages: number | string
  fallback_messages: number | string
  last_at: string | null
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const query = getQuery(event)
  const days = Math.max(1, Math.min(30, Number(query.days || 7)))

  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查看 AI models。', {
      startedAt,
      provider: runtime.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  const payload = await withClient(event, async (db) => {
    const catalogItems = aggregatePlatformAiModels(runtime)
    const result = await db.query<ModelRow>(
      `SELECT
        provider,
        model,
        COUNT(*)::INT AS messages,
        SUM(CASE WHEN fallback_used = TRUE THEN 1 ELSE 0 END)::INT AS fallback_messages,
        MAX(created_at)::TEXT AS last_at
       FROM ai_chat_messages
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
       GROUP BY provider, model
       ORDER BY messages DESC, provider ASC, model ASC`,
      [days],
    )

    const items = result.rows.map((row) => {
      const messages = Number(row.messages || 0)
      const fallbackMessages = Number(row.fallback_messages || 0)
      return {
        provider: row.provider,
        model: row.model || '-',
        messages,
        fallbackMessages,
        fallbackRate: messages > 0 ? Number((fallbackMessages / messages).toFixed(4)) : 0,
        lastAt: row.last_at,
      }
    })

    return {
      days,
      totalMessages: items.reduce((sum, item) => sum + item.messages, 0),
      items,
      totalCatalogModels: catalogItems.length,
      catalogItems,
    }
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.models',
      payload: {
        days,
      },
    })
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: '',
    fallbackUsed: false,
    attempts: 1,
  })
})
