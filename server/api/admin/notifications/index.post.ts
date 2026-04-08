import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { publishPlatformAnnouncement } from '~~/server/utils/notification-store'

interface PublishNotificationBody {
  scope?: 'global' | 'workspace'
  workspaceId?: string
  title?: string
  summary?: string
  body?: string
  actionUrl?: string
  effectiveAt?: string
  expiresAt?: string
}

function normalizeDateTime(value: unknown): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return ''
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    throw new Error('时间格式不合法。')
  return parsed.toISOString()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PublishNotificationBody>(event).catch(() => ({} as PublishNotificationBody))
  const canWrite = await checkPlatformPermission(event, user, 'contest.write')

  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权发布平台通知。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40391)
  }

  const scope = body?.scope === 'workspace' ? 'workspace' : 'global'
  const title = String(body?.title || '').trim()
  const summary = String(body?.summary || '').trim()
  const content = String(body?.body || '').trim()
  if (!title || !content) {
    setResponseStatus(event, 400)
    return fail('标题和正文不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40093)
  }

  try {
    const effectiveAt = normalizeDateTime(body?.effectiveAt)
    const expiresAt = normalizeDateTime(body?.expiresAt)
    if (effectiveAt && expiresAt && new Date(expiresAt).getTime() <= new Date(effectiveAt).getTime())
      throw new Error('失效时间必须晚于生效时间。')

    const deliveredCount = await withTransaction(event, async (db) => {
      return publishPlatformAnnouncement(db, {
        actorUser: user,
        scope,
        workspaceId: String(body?.workspaceId || '').trim() || null,
        title,
        summary,
        body: content,
        actionUrl: String(body?.actionUrl || '').trim() || null,
        effectiveAt: effectiveAt || null,
        expiresAt: expiresAt || null,
      })
    })

    return ok({ deliveredCount }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '平台通知发布失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40094)
  }
})
