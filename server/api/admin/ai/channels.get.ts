import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { aggregatePlatformAiModels, getPlatformAiChannelDefinitions, resolvePlatformAiRegistry } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ChannelRow {
  route: string
  calls: number | string
  units: number | string
  last_at: string | null
}

interface TotalRow {
  total_calls: number | string
  total_units: number | string
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
    return fail('当前用户无权查看 AI channels。', {
      startedAt,
      provider: runtime.ai.provider,
      model: '',
      fallbackUsed: false,
      attempts: 1,
    }, 40396)
  }

  const registry = resolvePlatformAiRegistry(runtime)
  const providerModelItems = aggregatePlatformAiModels(runtime)
  const payload = await withClient(event, async (db) => {
    const itemsResult = await db.query<ChannelRow>(
      `SELECT
        route,
        COUNT(*)::INT AS calls,
        COALESCE(SUM(units), 0)::INT AS units,
        MAX(created_at)::TEXT AS last_at
       FROM ai_usage_ledger
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
       GROUP BY route
       ORDER BY units DESC, calls DESC, route ASC`,
      [days],
    )

    const totalResult = await db.query<TotalRow>(
      `SELECT
        COUNT(*)::INT AS total_calls,
        COALESCE(SUM(units), 0)::INT AS total_units
       FROM ai_usage_ledger
       WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')`,
      [days],
    )

    return {
      days,
      totalCalls: Number(totalResult.rows[0]?.total_calls || 0),
      totalUnits: Number(totalResult.rows[0]?.total_units || 0),
      items: itemsResult.rows.map(row => ({
        route: row.route,
        calls: Number(row.calls || 0),
        units: Number(row.units || 0),
        lastAt: row.last_at,
      })),
      channelItems: registry.channels,
      channelDefinitions: getPlatformAiChannelDefinitions(),
      providers: registry.providers.map(item => ({
        id: item.id,
        name: item.name,
        adapter: item.adapter,
        provider: item.provider,
        enabled: item.enabled,
        apiKeyConfigured: Boolean(item.apiKey),
        models: item.models,
      })),
      providerModelItems,
    }
  })

  await withTransaction(event, async (db) => {
    await recordContestAuditLog(db, {
      actorUserId: user.id,
      action: 'read.admin.ai.channels',
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
