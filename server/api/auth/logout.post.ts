import { ok } from '~~/server/utils/api'
import { clearSessionCookie, readSessionToken } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { revokeSessionByTokenHash } from '~~/server/utils/platform-store'
import { hashToken } from '~~/server/utils/security'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const token = readSessionToken(event)

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
