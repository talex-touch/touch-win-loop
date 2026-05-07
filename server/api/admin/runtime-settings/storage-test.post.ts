import type { RuntimeSettings } from '~~/server/utils/env'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

interface StorageTestBody {
  storage?: {
    provider?: string
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
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeProvider(value: unknown): 'local' | 's3' | 'minio' {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 's3' || normalized === 'minio')
    return normalized
  return 'local'
}

function normalizeSecretMode(value: unknown): 'keep' | 'replace' | 'clear' {
  const normalized = normalizeString(value)
  if (normalized === 'replace' || normalized === 'clear')
    return normalized
  return 'keep'
}

function applyStorageDraft(runtime: RuntimeSettings, body: StorageTestBody): RuntimeSettings {
  const draft = body.storage && typeof body.storage === 'object' ? body.storage : {}
  const next: RuntimeSettings = {
    ...runtime,
    storage: {
      ...runtime.storage,
    },
  }

  if ('provider' in draft)
    next.storage.provider = normalizeProvider(draft.provider)
  if ('localRoot' in draft)
    next.storage.localRoot = normalizeString(draft.localRoot) || './tmp/document-storage'
  if ('endpoint' in draft)
    next.storage.endpoint = normalizeString(draft.endpoint).replace(/\/+$/g, '')
  if ('region' in draft)
    next.storage.region = normalizeString(draft.region)
  if ('bucket' in draft)
    next.storage.bucket = normalizeString(draft.bucket)
  if ('forcePathStyle' in draft)
    next.storage.forcePathStyle = Boolean(draft.forcePathStyle)

  const accessKeyMode = normalizeSecretMode(draft.accessKeyMode)
  if (accessKeyMode === 'replace')
    next.storage.accessKey = String(draft.accessKey || '')
  if (accessKeyMode === 'clear')
    next.storage.accessKey = ''

  const secretKeyMode = normalizeSecretMode(draft.secretKeyMode)
  if (secretKeyMode === 'replace')
    next.storage.secretKey = String(draft.secretKey || '')
  if (secretKeyMode === 'clear')
    next.storage.secretKey = ''

  return next
}

function listStorageConfigIssues(runtime: RuntimeSettings): string[] {
  const provider = normalizeProvider(runtime.storage.provider)
  const issues: string[] = []
  if (provider === 'local' && !normalizeString(runtime.storage.localRoot))
    issues.push('localRoot 不能为空')
  if ((provider === 's3' || provider === 'minio') && !normalizeString(runtime.storage.bucket))
    issues.push('bucket 不能为空')
  if (provider === 'minio' && !normalizeString(runtime.storage.endpoint))
    issues.push('MinIO endpoint 不能为空')
  return issues
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<StorageTestBody>(event).catch(() => ({} as StorageTestBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试存储配置。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40399)
  }

  const { runtime: effectiveRuntime } = await readEffectivePlatformRuntimeSettings(event)
  const runtime = applyStorageDraft(effectiveRuntime, body)
  const issues = listStorageConfigIssues(runtime)
  if (issues.length > 0) {
    setResponseStatus(event, 400)
    return fail(issues.join('；'), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40069)
  }

  const storage = getDocumentStorage(runtime)
  const key = `diagnostics/storage-probe/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.txt`
  const content = Buffer.from(`winloop storage probe ${new Date().toISOString()}`, 'utf-8')
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
        action: 'test.admin.runtime.storage',
        payload: {
          provider: storage.provider,
          bucket: runtime.storage.bucket,
          latencyMs,
        },
      })
    })

    return ok({
      ok: true,
      provider: storage.provider,
      bucket: runtime.storage.bucket,
      endpoint: runtime.storage.endpoint,
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
    const message = error instanceof Error ? error.message : '存储探针失败。'
    setResponseStatus(event, 400)
    return fail(message, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40070)
  }
})
