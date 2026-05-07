import { setHeader, setResponseStatus } from 'h3'
import { downloadFeishuDriveMedia, getFeishuTenantAccessToken } from '~~/server/services/feishu/client'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function encodeFileName(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
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
    }, 40472)
  }

  const fileToken = normalizeText(getRouterParam(event, 'fileToken'))
  if (!fileToken) {
    setResponseStatus(event, 400)
    return fail('fileToken 不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40172)
  }

  try {
    const config = await withClient(event, db => readFeishuIntegrationConfig(db))
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const media = await downloadFeishuDriveMedia({
      tenantAccessToken,
      fileToken,
    })
    const fileName = normalizeText(getQuery(event).name) || `${fileToken}.bin`

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
    }, 50172)
  }
})
