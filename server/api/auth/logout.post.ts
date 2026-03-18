import { getCookie } from 'h3'
import { ok } from '~~/server/utils/api'
import { clearSessionCookie, SESSION_COOKIE_NAME } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { revokeSessionByTokenHash } from '~~/server/utils/platform-store'
import { hashToken } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const token = getCookie(event, SESSION_COOKIE_NAME)

  if (token) {
    await withClient(event, async (db) => {
      await revokeSessionByTokenHash(db, hashToken(token))
    })
  }

  clearSessionCookie(event)

  return ok({ success: true }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
