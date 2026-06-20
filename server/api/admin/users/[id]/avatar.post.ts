import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { findUserById, setUserAvatarUrl } from '~~/server/utils/platform-store'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import {
  getUserAvatarFileExtension,
  isUserAvatarUploadFileSupported,
  USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  USER_AVATAR_UPLOAD_TYPES_LABEL,
} from '~~/shared/constants/user-avatar-upload'
import { buildManualAuthAvatarPath, buildUserAvatarObjectKey, listUserAvatarObjectKeys } from '~~/shared/utils/user-avatar'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const userId = String(getRouterParam(event, 'id') || '').trim()

  const canWriteUser = await checkPlatformPermission(event, user, 'user.write')
  if (!canWriteUser) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改用户头像。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40397)
  }

  if (!userId) {
    setResponseStatus(event, 400)
    return fail('缺少用户 ID。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400102)
  }

  const target = await withTransaction(event, db => findUserById(db, userId))
  if (!target) {
    setResponseStatus(event, 404)
    return fail('目标用户不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40497)
  }

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    setResponseStatus(event, 400)
    return fail('缺少头像文件字段 file。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400103)
  }

  const fileName = String(filePart.filename || '').trim()
  const extension = getUserAvatarFileExtension(fileName)
  if (!isUserAvatarUploadFileSupported(fileName) || !extension) {
    setResponseStatus(event, 400)
    return fail(`头像格式不支持。支持格式：${USER_AVATAR_UPLOAD_TYPES_LABEL}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400104)
  }

  const buffer = Buffer.from(filePart.data || Buffer.alloc(0))
  if (!buffer.length) {
    setResponseStatus(event, 400)
    return fail('头像文件不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400105)
  }

  if (buffer.length > USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
    setResponseStatus(event, 400)
    return fail(`头像文件过大，单文件上限 ${formatFileSize(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400106)
  }

  const objectKey = buildUserAvatarObjectKey(userId, extension)
  const avatarUrl = buildManualAuthAvatarPath(userId, extension)
  const staleObjectKeys = listUserAvatarObjectKeys(userId).filter(key => key !== objectKey)
  const storage = getDocumentStorage()

  try {
    await storage.putObject({
      key: objectKey,
      body: buffer,
    })

    const updatedUser = await withTransaction(event, db => setUserAvatarUrl(db, userId, avatarUrl))
    await Promise.allSettled(staleObjectKeys.map(key => storage.deleteObject(key)))

    return ok(updatedUser || { ...target, avatarUrl }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, '头像上传成功。')
  }
  catch (error) {
    await storage.deleteObject(objectKey).catch(() => {})
    throw error
  }
})
