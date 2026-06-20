import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { getDocumentStorageByChannel } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'
import { normalizeStoragePoolDraft } from '~~/server/utils/storage-service-store'

interface StorageServiceTestBody {
  channelId?: string
  primaryChannelId?: string
  channels?: unknown[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeSecretMode(raw: unknown): 'keep' | 'replace' | 'clear' {
  const normalized = normalizeString(raw)
  if (normalized === 'replace' || normalized === 'clear')
    return normalized
  return 'keep'
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<StorageServiceTestBody>(event).catch(() => ({} as StorageServiceTestBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试存储服务。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403522)
  }

  const { runtime: effectiveRuntime } = await readEffectivePlatformRuntimeSettings(event)
  const existingById = new Map(effectiveRuntime.storage.channels.map(channel => [channel.id, channel]))
  const draftChannels = Array.isArray(body.channels)
    ? body.channels.map((raw) => {
        const draft = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? raw as Record<string, unknown>
          : {}
        const id = normalizeString(draft.id)
        const existing = existingById.get(id)
        const accessKeyMode = normalizeSecretMode(draft.accessKeyMode)
        const secretKeyMode = normalizeSecretMode(draft.secretKeyMode)
        return {
          ...existing,
          ...draft,
          accessKey: accessKeyMode === 'replace'
            ? String(draft.accessKey || '')
            : accessKeyMode === 'clear'
              ? ''
              : existing?.accessKey || '',
          secretKey: secretKeyMode === 'replace'
            ? String(draft.secretKey || '')
            : secretKeyMode === 'clear'
              ? ''
              : existing?.secretKey || '',
        }
      })
    : effectiveRuntime.storage.channels
  const runtime = {
    ...effectiveRuntime,
    storage: normalizeStoragePoolDraft(effectiveRuntime, {
      primaryChannelId: body.primaryChannelId,
      channels: draftChannels,
    }),
  }
  const channelId = String(body.channelId || runtime.storage.primaryChannelId || 'local').trim()
  const storage = getDocumentStorageByChannel(channelId, runtime)
  const channel = runtime.storage.channels.find(item => item.id === storage.channelId)
  const key = `diagnostics/storage-probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`
  const content = Buffer.from(`winloop storage service probe ${new Date().toISOString()}`, 'utf-8')
  let objectCreated = false

  try {
    await storage.putObject({
      key,
      body: content,
      contentType: 'text/plain; charset=utf-8',
    })
    objectCreated = true
    const roundtrip = await storage.getObjectBuffer(key)
    if (!roundtrip.equals(content))
      throw new Error('STORAGE_PROBE_ROUNDTRIP_MISMATCH')
    await storage.deleteObject(key)
    objectCreated = false

    const latencyMs = Date.now() - startedAt
    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.storage.service',
        payload: {
          channelId: storage.channelId,
          provider: storage.provider,
          latencyMs,
        },
      })
    })

    return ok({
      ok: true,
      channelId: storage.channelId,
      channelName: channel?.name || storage.channelId,
      provider: storage.provider,
      bucket: channel?.bucket || '',
      endpoint: channel?.endpoint || '',
      latencyMs,
      detail: '对象存储写入、读取、删除探针通过。',
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (objectCreated)
      await storage.deleteObject(key).catch(() => undefined)
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '存储探针失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400522)
  }
})
