import type { Queryable } from '~~/server/utils/db'
import type { PlatformAiProviderConfig } from '~~/server/utils/platform-ai-channels'

interface ProviderUsageRow {
  provider_key: string
  total_messages: number | string
  last_at: string | null
}

export interface PlatformAiProviderUsageStat {
  providerId: string
  totalConsumed: number
  lastTriggeredAt: string | null
}

function normalizeProviderKey(value: string): string {
  return String(value || '').trim().toLowerCase()
}

export async function aggregatePlatformAiProviderUsage(
  db: Queryable,
  providers: PlatformAiProviderConfig[],
): Promise<PlatformAiProviderUsageStat[]> {
  const providerKeys = Array.from(
    new Set(
      providers
        .map(item => normalizeProviderKey(item.provider))
        .filter(Boolean),
    ),
  )

  if (providerKeys.length === 0) {
    return providers.map(item => ({
      providerId: item.id,
      totalConsumed: 0,
      lastTriggeredAt: null,
    }))
  }

  const result = await db.query<ProviderUsageRow>(
    `SELECT
      LOWER(TRIM(provider)) AS provider_key,
      COUNT(*)::INT AS total_messages,
      MAX(created_at)::TEXT AS last_at
     FROM ai_chat_messages
     WHERE LOWER(TRIM(provider)) = ANY($1::TEXT[])
     GROUP BY LOWER(TRIM(provider))`,
    [providerKeys],
  )

  const statsMap = new Map<string, { totalConsumed: number, lastTriggeredAt: string | null }>()
  for (const row of result.rows) {
    const key = normalizeProviderKey(row.provider_key)
    if (!key)
      continue
    statsMap.set(key, {
      totalConsumed: Number(row.total_messages || 0),
      lastTriggeredAt: row.last_at || null,
    })
  }

  return providers.map((item) => {
    const stat = statsMap.get(normalizeProviderKey(item.provider))
    return {
      providerId: item.id,
      totalConsumed: stat?.totalConsumed || 0,
      lastTriggeredAt: stat?.lastTriggeredAt || null,
    }
  })
}
