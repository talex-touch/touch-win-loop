import type { AuthUser } from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { setResponseStatus } from 'h3'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { setUserAvatarUrl } from '~~/server/utils/platform-store'
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

  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    setResponseStatus(event, 400)
    return fail('请求体为空，请使用 multipart/form-data 上传头像。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const filePart = parts.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    setResponseStatus(event, 400)
    return fail('缺少头像文件字段 file。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40096)
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
    }, 40097)
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
    }, 40098)
  }

  if (buffer.length > USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
    setResponseStatus(event, 400)
    return fail(`头像文件过大，单文件上限 ${formatFileSize(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES)}。`, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  const objectKey = buildUserAvatarObjectKey(user.id, extension)
  const avatarUrl = buildManualAuthAvatarPath(user.id, extension)
  const staleObjectKeys = listUserAvatarObjectKeys(user.id).filter(key => key !== objectKey)
  const storage = getDocumentStorage()

  try {
    await storage.putObject({
      key: objectKey,
      body: buffer,
    })

    const updatedUser = await withTransaction(event, async (db) => {
      return setUserAvatarUrl(db, user.id, avatarUrl)
    })

    await Promise.allSettled(staleObjectKeys.map(key => storage.deleteObject(key)))

    return ok<AuthUser>(updatedUser || {
      ...user,
      avatarUrl,
    }, {
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
