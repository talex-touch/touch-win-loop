import type { CanvasLibraryAssetKind } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { buildCanvasLibraryAssetPayload } from '~~/server/utils/canvas-library-store'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toStringMap(parts: Awaited<ReturnType<typeof readMultipartFormData>>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const part of parts || []) {
    if (!part.name || part.filename)
      continue
    map[part.name] = (part.data || Buffer.alloc(0)).toString('utf-8')
  }
  return map
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWrite = user.isPlatformAdmin || await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权上传画布资源库素材。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  const parts = await readMultipartFormData(event)
  const filePart = (parts || []).find(part => part.name === 'file' && part.filename)
  if (!filePart) {
    setResponseStatus(event, 400)
    return fail('缺少 file 文件字段。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  const fields = toStringMap(parts)
  const fileName = normalizeString(filePart.filename) || 'asset.bin'
  const mimeType = normalizeString(filePart.type) || 'application/octet-stream'
  const buffer = Buffer.from(filePart.data || Buffer.alloc(0))
  const assetKind = (normalizeString(fields.assetKind) || 'image') as CanvasLibraryAssetKind
  const objectKey = buildDocumentObjectKey('canvas-library', fileName)
  const storage = getDocumentStorage()
  await storage.putObject({
    key: objectKey,
    body: buffer,
    contentType: mimeType,
  })

  const payload = buildCanvasLibraryAssetPayload({
    objectKey,
    fileName,
    mimeType,
    size: buffer.length,
    assetKind,
    width: Number(fields.width || 0),
    height: Number(fields.height || 0),
    metadata: normalizeString(fields.metadata) ? JSON.parse(fields.metadata) as Record<string, unknown> : undefined,
    viewportRect: normalizeString(fields.viewportRect) ? JSON.parse(fields.viewportRect) as Record<string, unknown> : undefined,
    cornerRadius: Number(fields.cornerRadius || 0),
    presetKeys: normalizeString(fields.presetKeys)
      ? normalizeString(fields.presetKeys).split(',').map(item => item.trim()).filter(Boolean)
      : [],
    maskPath: fields.maskPath,
  })

  return ok({
    assetKind,
    payload,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
