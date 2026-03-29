import { ok } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readPlatformAiRuntimeOverrides } from '~~/server/utils/platform-ai-config-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

function parseConnInfo(url: string): { host: string, port: number } {
  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || '',
      port: Number(parsed.port || 0),
    }
  }
  catch {
    return {
      host: '',
      port: 0,
    }
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime, configSource } = await readEffectivePlatformRuntimeSettings(event)
  const aiSource = await withClient(event, async (db) => {
    const overrides = await readPlatformAiRuntimeOverrides(db)
    return overrides.ai && Object.keys(overrides.ai).length > 0 ? 'override' : 'env'
  }).catch(() => 'env' as const)
  const pgConn = parseConnInfo(runtime.pg.url)
  const redisConn = parseConnInfo(runtime.redis.url)

  return ok(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      envPriority: runtime.envPriority,
      ai: {
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        configured: Boolean(runtime.ai.apiKey),
      },
      postgresql: {
        host: pgConn.host,
        port: pgConn.port,
        configured: Boolean(runtime.pg.url),
      },
      redis: {
        host: redisConn.host,
        port: redisConn.port,
        configured: Boolean(runtime.redis.url),
      },
      configSource: {
        ai: aiSource,
        feishuScheduler: configSource.feishuScheduler,
        resourceRecycle: configSource.resourceRecycle,
        contestAutoSeed: configSource.contestAutoSeed,
      },
    },
    {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: !runtime.ai.apiKey,
      attempts: 1,
    },
  )
})
