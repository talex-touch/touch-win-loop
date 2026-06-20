import { setHeader, setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { findUserById } from '~~/server/utils/platform-store'
import {
  buildUserAvatarObjectKey,
  isManualAuthAvatarUrlForUser,
  resolveManualAuthAvatarExtension,
  resolveUserAvatarContentType,
} from '~~/shared/utils/user-avatar'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  await requireAuth(event)

  const userId = String(getRouterParam(event, 'userId') || '').trim()
  const requestedExtension = String(getQuery(event).ext || '').trim().toLowerCase()
  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少 userId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  const targetUser = await withTransaction(event, async (db) => {
    return findUserById(db, userId)
  })

  if (!targetUser || !isManualAuthAvatarUrlForUser(targetUser.avatarUrl, userId)) {
    setResponseStatus(event, 404)
    return fail('头像不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40495)
  }

  const resolvedExtension = resolveManualAuthAvatarExtension(targetUser.avatarUrl)
  if (!resolvedExtension || (requestedExtension && requestedExtension !== resolvedExtension)) {
    setResponseStatus(event, 404)
    return fail('头像不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40496)
  }

  const objectKey = buildUserAvatarObjectKey(userId, resolvedExtension)
  const storage = getDocumentStorage()

  try {
    const buffer = await storage.getObjectBuffer(objectKey)
    setHeader(event, 'Content-Type', resolveUserAvatarContentType(resolvedExtension))
    setHeader(event, 'Content-Length', buffer.length)
    setHeader(event, 'Cache-Control', 'private, max-age=300')
    return buffer
  }
  catch {
    setResponseStatus(event, 404)
    return fail('头像不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }
})
