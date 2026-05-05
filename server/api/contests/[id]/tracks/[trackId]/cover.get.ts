import { setHeader, setResponseStatus } from 'h3'
import { downloadFeishuDriveMedia, getFeishuTenantAccessToken } from '~~/server/services/feishu/client'
import { fail } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'

function encodeFileName(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function extractFeishuAttachmentToken(value: unknown): string {
  const text = normalizeText(value)
  if (!text)
    return ''
  const match = text.match(/(?:^|\/)api\/admin\/integrations\/feishu\/bitable\/attachments\/([^/?#]+)/)
  if (!match?.[1])
    return ''
  try {
    return decodeURIComponent(match[1])
  }
  catch {
    return match[1]
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const contestId = normalizeText(getRouterParam(event, 'id'))
  const trackId = normalizeText(getRouterParam(event, 'trackId'))

  if (!contestId || !trackId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 trackId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  const row = await withClient(event, async (db) => {
    const result = await db.query<{ cover_image_url: string }>(
      `SELECT contest_tracks.cover_image_url
       FROM contest_tracks
       JOIN contests
         ON contests.id = contest_tracks.contest_id
       WHERE contests.id = $1
         AND contest_tracks.id = $2
         AND contests.status = 'published'
         AND contests.visibility = 'public'
         AND contest_tracks.status = 'published'
         AND EXISTS (
           SELECT 1
           FROM release_versions rv
           WHERE rv.scope_kind = 'contest'
             AND rv.status = 'published'
             AND rv.live_entity_id = contests.id
         )
       LIMIT 1`,
      [contestId, trackId],
    )
    return result.rows[0] || null
  })

  if (!row) {
    setResponseStatus(event, 404)
    return fail('赛道封面不存在或不可公开访问。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  const fileToken = extractFeishuAttachmentToken(row.cover_image_url)
  if (!fileToken) {
    setResponseStatus(event, 404)
    return fail('赛道封面不是可代理的飞书附件。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  try {
    const config = await withClient(event, db => readFeishuIntegrationConfig(db))
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const media = await downloadFeishuDriveMedia({
      tenantAccessToken,
      fileToken,
    })
    if (!media.contentType.startsWith('image/')) {
      setResponseStatus(event, 415)
      return fail('赛道封面附件不是图片。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 41597)
    }

    const name = normalizeText(getQuery(event).name) || `${trackId}-cover`
    setHeader(event, 'Content-Type', media.contentType)
    setHeader(event, 'Content-Length', media.buffer.length)
    setHeader(event, 'Content-Disposition', media.contentDisposition || `inline; filename*=UTF-8''${encodeFileName(name)}`)
    setHeader(event, 'Cache-Control', 'public, max-age=300')

    return media.buffer
  }
  catch (error) {
    setResponseStatus(event, 502)
    return fail(error instanceof Error ? error.message : '赛道封面预览失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50197)
  }
})
