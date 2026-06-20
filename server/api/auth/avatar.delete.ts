import type { AuthUser } from '~~/shared/types/domain'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { findUserById, setUserAvatarUrl } from '~~/server/utils/platform-store'
import { buildUserAvatarObjectKey, isManualAuthAvatarUrl, listUserAvatarObjectKeys, resolveManualAuthAvatarExtension } from '~~/shared/utils/user-avatar'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const currentUser = await withTransaction(event, async (db) => {
    return findUserById(db, user.id)
  })

  if (!currentUser) {
    return ok<AuthUser>({
      ...user,
      avatarUrl: null,
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  if (!isManualAuthAvatarUrl(currentUser.avatarUrl)) {
    return ok<AuthUser>(currentUser, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  const currentExtension = resolveManualAuthAvatarExtension(currentUser.avatarUrl)
  const currentObjectKey = buildUserAvatarObjectKey(currentUser.id, currentExtension)
  const storage = getDocumentStorage()

  const updatedUser = await withTransaction(event, async (db) => {
    return setUserAvatarUrl(db, currentUser.id, null)
  })

  const deletableObjectKeys = currentObjectKey
    ? [currentObjectKey, ...listUserAvatarObjectKeys(currentUser.id).filter(key => key !== currentObjectKey)]
    : listUserAvatarObjectKeys(currentUser.id)
  await Promise.allSettled(deletableObjectKeys.map(key => storage.deleteObject(key)))

  return ok<AuthUser>(updatedUser || {
    ...currentUser,
    avatarUrl: null,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, '头像已重置。')
})
