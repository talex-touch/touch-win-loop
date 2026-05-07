import { setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { findUserById, setUserAvatarUrl } from '~~/server/utils/platform-store'
import { buildUserAvatarObjectKey, isManualAuthAvatarUrl, listUserAvatarObjectKeys, resolveManualAuthAvatarExtension } from '~~/shared/utils/user-avatar'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()

  const canWriteUser = await checkPlatformPermission(event, user, 'user.write')
  if (!canWriteUser) {
    setResponseStatus(event, 403)
    return fail('当前用户无权清除用户头像。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400107)
  }

  const currentUser = await withTransaction(event, db => findUserById(db, userId))
  if (!currentUser) {
    setResponseStatus(event, 404)
    return fail('目标用户不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  const currentExtension = isManualAuthAvatarUrl(currentUser.avatarUrl)
    ? resolveManualAuthAvatarExtension(currentUser.avatarUrl)
    : ''
  const currentObjectKey = currentExtension ? buildUserAvatarObjectKey(currentUser.id, currentExtension) : ''
  const deletableObjectKeys = currentObjectKey
    ? [currentObjectKey, ...listUserAvatarObjectKeys(currentUser.id).filter(key => key !== currentObjectKey)]
    : listUserAvatarObjectKeys(currentUser.id)

  const updatedUser = await withTransaction(event, db => setUserAvatarUrl(db, currentUser.id, null))
  const storage = getDocumentStorage()
  await Promise.allSettled(deletableObjectKeys.map(key => storage.deleteObject(key)))

  return ok(updatedUser || {
    ...currentUser,
    avatarUrl: null,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  }, '头像已清除。')
})
