import { setResponseStatus } from 'h3'
import { invalidateDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  normalizePlatformRuntimeOverrides,
  readEffectivePlatformRuntimeSettings,
  readPlatformRuntimeOverrides,
  writePlatformRuntimeOverrides,
} from '~~/server/utils/platform-runtime-config-store'
import { buildStorageServiceOverview, normalizeStoragePoolDraft } from '~~/server/utils/storage-service-store'

interface StorageChannelDraft {
  id?: string
  name?: string
  provider?: string
  enabled?: boolean
  priority?: number
  capacityBytes?: number
  watermarkPercent?: number
  localRoot?: string
  endpoint?: string
  region?: string
  bucket?: string
  accessKey?: string
  accessKeyMode?: 'keep' | 'replace' | 'clear'
  secretKey?: string
  secretKeyMode?: 'keep' | 'replace' | 'clear'
  forcePathStyle?: boolean
}

interface StorageServicePatchBody {
  primaryChannelId?: string
  channels?: StorageChannelDraft[]
}

function normalizeSecretMode(raw: unknown): 'keep' | 'replace' | 'clear' {
  const normalized = String(raw || '').trim()
  if (normalized === 'replace' || normalized === 'clear')
    return normalized
  return 'keep'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<StorageServicePatchBody>(event).catch(() => ({} as StorageServicePatchBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改存储服务。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403521)
  }

  try {
    await withTransaction(event, async (db) => {
      const existing = normalizePlatformRuntimeOverrides(await readPlatformRuntimeOverrides(db))
      const { runtime } = await readEffectivePlatformRuntimeSettings(event)
      const existingById = new Map(runtime.storage.channels.map(channel => [channel.id, channel]))
      const draftChannels = Array.isArray(body.channels)
        ? body.channels.map((draft) => {
            const id = String(draft.id || '').trim()
            const existingChannel = existingById.get(id)
            const accessKeyMode = normalizeSecretMode(draft.accessKeyMode)
            const secretKeyMode = normalizeSecretMode(draft.secretKeyMode)
            return {
              ...existingChannel,
              ...draft,
              accessKey: accessKeyMode === 'replace'
                ? String(draft.accessKey || '')
                : accessKeyMode === 'clear'
                  ? ''
                  : existingChannel?.accessKey || '',
              secretKey: secretKeyMode === 'replace'
                ? String(draft.secretKey || '')
                : secretKeyMode === 'clear'
                  ? ''
                  : existingChannel?.secretKey || '',
            }
          })
        : runtime.storage.channels
      const nextStorage = normalizeStoragePoolDraft(runtime, {
        primaryChannelId: body.primaryChannelId,
        channels: draftChannels,
      })

      const next = normalizePlatformRuntimeOverrides({
        ...existing,
        storage: {
          ...nextStorage,
        },
        updatedAt: new Date().toISOString(),
        updatedByUserId: user.id,
      })
      await writePlatformRuntimeOverrides(db, next)
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'write.admin.storage.service',
        payload: {
          primaryChannelId: nextStorage.primaryChannelId,
          channelCount: nextStorage.channels.length,
          enabledChannelCount: nextStorage.channels.filter(channel => channel.enabled).length,
        },
      })
    })
    invalidateDocumentStorage()
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '存储服务保存失败。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400521)
  }

  const { runtime, overrides, configSource } = await readEffectivePlatformRuntimeSettings(event)
  const payload = await withClient(event, db => buildStorageServiceOverview(db, {
    runtime,
    configSource: configSource.storage,
    updatedAt: String(overrides.updatedAt || ''),
    updatedByUserId: String(overrides.updatedByUserId || ''),
  }))

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, '存储服务已保存。')
})
