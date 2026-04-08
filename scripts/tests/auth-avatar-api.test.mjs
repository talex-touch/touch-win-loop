import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'
import {
  buildManualAuthAvatarPath,
  buildUserAvatarObjectKey,
  isManualAuthAvatarUrl,
  isManualAuthAvatarUrlForUser,
  resolveManualAuthAvatarExtension,
} from '../../shared/utils/user-avatar.ts'
import {
  USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  USER_AVATAR_UPLOAD_TYPES_LABEL,
} from '../../shared/constants/user-avatar-upload.ts'

const AVATAR_POST_FILE = resolve(process.cwd(), 'server/api/auth/avatar.post.ts')
const AVATAR_DELETE_FILE = resolve(process.cwd(), 'server/api/auth/avatar.delete.ts')
const AVATAR_GET_FILE = resolve(process.cwd(), 'server/api/auth/avatar/[userId].get.ts')

it('头像路由与对象 key 约定保持一致', () => {
  const avatarPath = buildManualAuthAvatarPath('user-1', 'png')
  assert.equal(avatarPath, '/auth/avatar/user-1?ext=png')
  assert.equal(buildUserAvatarObjectKey('user-1', 'png'), 'avatars/users/user-1/current.png')
  assert.equal(resolveManualAuthAvatarExtension(avatarPath), 'png')
  assert.equal(isManualAuthAvatarUrl(avatarPath), true)
  assert.equal(isManualAuthAvatarUrlForUser(avatarPath, 'user-1'), true)
  assert.equal(isManualAuthAvatarUrlForUser(avatarPath, 'user-2'), false)
  assert.equal(USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES, 2 * 1024 * 1024)
  assert.equal(USER_AVATAR_UPLOAD_TYPES_LABEL, 'PNG / JPG / JPEG / WEBP')
})

it('头像接口覆盖上传、校验、删除与读取场景', async () => {
  const [postSource, deleteSource, getSource] = await Promise.all([
    readFile(AVATAR_POST_FILE, 'utf8'),
    readFile(AVATAR_DELETE_FILE, 'utf8'),
    readFile(AVATAR_GET_FILE, 'utf8'),
  ])

  assert.match(postSource, /readMultipartFormData\(event\)/, '头像上传接口未读取 multipart/form-data')
  assert.match(postSource, /part\.name === 'file'/, '头像上传接口未固定使用 file 字段')
  assert.match(postSource, /头像格式不支持。支持格式：\$\{USER_AVATAR_UPLOAD_TYPES_LABEL\}。/, '头像上传接口缺少文件类型校验')
  assert.match(postSource, /USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES/, '头像上传接口未校验文件大小上限')
  assert.match(postSource, /setUserAvatarUrl\(db, user\.id, avatarUrl\)/, '头像上传成功后未回写 users.avatar_url')
  assert.match(deleteSource, /setUserAvatarUrl\(db, currentUser\.id, null\)/, '头像删除接口未清空 avatar_url')
  assert.match(deleteSource, /isManualAuthAvatarUrl\(currentUser\.avatarUrl\)/, '头像删除接口未限制手动头像清理')
  assert.match(getSource, /isManualAuthAvatarUrlForUser\(targetUser\.avatarUrl, userId\)/, '头像读取接口未校验目标用户手动头像路由')
  assert.match(getSource, /buildUserAvatarObjectKey\(userId, resolvedExtension\)/, '头像读取接口未按既定对象 key 读取文件')
})
