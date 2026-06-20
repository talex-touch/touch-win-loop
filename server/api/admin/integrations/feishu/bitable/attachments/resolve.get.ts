import { setHeader, setResponseStatus } from 'h3'
import { resolveFeishuBitableMappedAttachmentReference } from '~~/server/services/feishu/bitable-sync'
import { downloadFeishuDriveMedia } from '~~/server/services/feishu/client'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function encodeFileName(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function isSafeMappedAttachmentTargetKey(value: string): boolean {
  return /^[\w.:-]+$/.test(value)
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canRead = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canRead) {
    setResponseStatus(event, 403)
    return fail('当前用户无权预览飞书附件。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40473)
  }

  const query = getQuery(event)
  const syncItemId = normalizeText(query.syncItemId)
  const recordId = normalizeText(query.recordId)
  const targetKey = normalizeText(query.targetKey)
  const name = normalizeText(query.name)
  if (!syncItemId || !recordId || !targetKey) {
    setResponseStatus(event, 400)
    return fail('syncItemId、recordId 与 targetKey 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40173)
  }
  if (!isSafeMappedAttachmentTargetKey(targetKey)) {
    setResponseStatus(event, 400)
    return fail('targetKey 格式不合法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40174)
  }

  try {
    const attachment = await resolveFeishuBitableMappedAttachmentReference(event, {
      syncItemId,
      recordId,
      targetKey,
      fileName: name,
    })
    if (!attachment) {
      setResponseStatus(event, 404)
      return fail('未找到可预览的飞书附件。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40474)
    }

    const media = await downloadFeishuDriveMedia({
      tenantAccessToken: attachment.tenantAccessToken,
      fileToken: attachment.fileToken,
    })
    const fileName = attachment.fileName || name || `${attachment.fileToken}.bin`

    setHeader(event, 'Content-Type', media.contentType)
    setHeader(event, 'Content-Length', media.buffer.length)
    setHeader(event, 'Content-Disposition', media.contentDisposition || `inline; filename*=UTF-8''${encodeFileName(fileName)}`)
    setHeader(event, 'Cache-Control', 'private, max-age=300')

    return media.buffer
  }
  catch (error) {
    setResponseStatus(event, 502)
    return fail(error instanceof Error ? error.message : '飞书附件预览失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50173)
  }
})
