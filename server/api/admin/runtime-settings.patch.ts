import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  getPlatformRuntimeOverrideState,
  normalizePlatformRuntimeOverrides,
  readEffectivePlatformRuntimeSettings,
  readPlatformRuntimeOverrides,
  writePlatformRuntimeOverrides,
} from '~~/server/utils/platform-runtime-config-store'

interface RuntimeSettingsPatchBody {
  auth?: {
    registrationEnabled?: boolean
  }
  feishuScheduler?: {
    enabled?: boolean
    intervalMs?: number
    batchSize?: number
    lockTtlMs?: number
  }
  resourceRecycle?: {
    enabled?: boolean
    intervalMs?: number
    retentionDays?: number
    batchSize?: number
  }
  contest?: {
    autoSeed?: boolean
  }
}

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function toBoolean(raw: unknown, fieldName: string): boolean {
  if (typeof raw === 'boolean')
    return raw
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized))
      return true
    if (['0', 'false', 'no', 'off'].includes(normalized))
      return false
  }
  throw new Error(`${fieldName} 必须为布尔值。`)
}

function toNumber(raw: unknown, fieldName: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value))
    throw new Error(`${fieldName} 必须为有效数字。`)
  return value
}

function clamp(input: number, min: number, max: number, integer = false): number {
  const bounded = Math.max(min, Math.min(max, input))
  return integer ? Math.round(bounded) : bounded
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<RuntimeSettingsPatchBody>(event).catch(() => ({} as RuntimeSettingsPatchBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改运行设置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  try {
    await withTransaction(event, async (db) => {
      const existing = normalizePlatformRuntimeOverrides(await readPlatformRuntimeOverrides(db))
      const next = normalizePlatformRuntimeOverrides(existing)

      const auth = body?.auth && typeof body.auth === 'object'
        ? body.auth as Record<string, unknown>
        : null
      if (auth) {
        const section = { ...(next.auth || {}) }
        if (hasOwn(auth, 'registrationEnabled'))
          section.registrationEnabled = toBoolean(auth.registrationEnabled, 'auth.registrationEnabled')
        next.auth = section
      }

      const feishuScheduler = body?.feishuScheduler && typeof body.feishuScheduler === 'object'
        ? body.feishuScheduler as Record<string, unknown>
        : null
      if (feishuScheduler) {
        const section = { ...(next.feishuScheduler || {}) }
        if (hasOwn(feishuScheduler, 'enabled'))
          section.enabled = toBoolean(feishuScheduler.enabled, 'feishuScheduler.enabled')
        if (hasOwn(feishuScheduler, 'intervalMs'))
          section.intervalMs = clamp(toNumber(feishuScheduler.intervalMs, 'feishuScheduler.intervalMs'), 15_000, 24 * 60 * 60 * 1000, true)
        if (hasOwn(feishuScheduler, 'batchSize'))
          section.batchSize = clamp(toNumber(feishuScheduler.batchSize, 'feishuScheduler.batchSize'), 1, 200, true)
        if (hasOwn(feishuScheduler, 'lockTtlMs'))
          section.lockTtlMs = clamp(toNumber(feishuScheduler.lockTtlMs, 'feishuScheduler.lockTtlMs'), 60_000, 24 * 60 * 60 * 1000, true)
        next.feishuScheduler = section
      }

      const resourceRecycle = body?.resourceRecycle && typeof body.resourceRecycle === 'object'
        ? body.resourceRecycle as Record<string, unknown>
        : null
      if (resourceRecycle) {
        const section = { ...(next.resourceRecycle || {}) }
        if (hasOwn(resourceRecycle, 'enabled'))
          section.enabled = toBoolean(resourceRecycle.enabled, 'resourceRecycle.enabled')
        if (hasOwn(resourceRecycle, 'intervalMs'))
          section.intervalMs = clamp(toNumber(resourceRecycle.intervalMs, 'resourceRecycle.intervalMs'), 60_000, 24 * 60 * 60 * 1000, true)
        if (hasOwn(resourceRecycle, 'retentionDays'))
          section.retentionDays = clamp(toNumber(resourceRecycle.retentionDays, 'resourceRecycle.retentionDays'), 1, 365, true)
        if (hasOwn(resourceRecycle, 'batchSize'))
          section.batchSize = clamp(toNumber(resourceRecycle.batchSize, 'resourceRecycle.batchSize'), 20, 1000, true)
        next.resourceRecycle = section
      }

      const contest = body?.contest && typeof body.contest === 'object'
        ? body.contest as Record<string, unknown>
        : null
      if (contest) {
        const section = { ...(next.contest || {}) }
        if (hasOwn(contest, 'autoSeed'))
          section.autoSeed = toBoolean(contest.autoSeed, 'contest.autoSeed')
        next.contest = section
      }

      next.updatedAt = new Date().toISOString()
      next.updatedByUserId = user.id

      const normalized = normalizePlatformRuntimeOverrides(next)
      await writePlatformRuntimeOverrides(db, normalized)
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'write.admin.runtime.settings',
        payload: {
          hasAuthUpdate: Boolean(auth),
          hasFeishuSchedulerUpdate: Boolean(feishuScheduler),
          hasResourceRecycleUpdate: Boolean(resourceRecycle),
          hasContestUpdate: Boolean(contest),
        },
      })
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    const message = error instanceof Error ? error.message : '运行设置更新失败。'
    return fail(message, {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40068)
  }

  const { runtime, overrides, configSource } = await readEffectivePlatformRuntimeSettings(event)
  return ok({
    auth: {
      registrationEnabled: runtime.auth.registrationEnabled,
    },
    feishuScheduler: {
      enabled: runtime.feishuScheduler.enabled,
      intervalMs: runtime.feishuScheduler.intervalMs,
      batchSize: runtime.feishuScheduler.batchSize,
      lockTtlMs: runtime.feishuScheduler.lockTtlMs,
    },
    resourceRecycle: {
      enabled: runtime.resourceRecycle.enabled,
      intervalMs: runtime.resourceRecycle.intervalMs,
      retentionDays: runtime.resourceRecycle.retentionDays,
      batchSize: runtime.resourceRecycle.batchSize,
    },
    contest: {
      autoSeed: runtime.contest.autoSeed,
    },
    overrideState: getPlatformRuntimeOverrideState(overrides),
    configSource,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
