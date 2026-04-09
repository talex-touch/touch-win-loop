import { USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS } from '../constants/user-avatar-upload'

const MANUAL_AUTH_AVATAR_PREFIX = '/auth/avatar/'

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim()
}

function normalizePathname(value: string): string {
  const normalizedValue = normalizeText(value)
  if (!normalizedValue)
    return ''

  try {
    return new URL(normalizedValue, 'http://localhost').pathname
  }
  catch {
    return normalizedValue.split('?')[0] || ''
  }
}

function normalizeQueryExtension(value: string | null | undefined): string {
  const normalized = normalizeText(value).toLowerCase()
  return USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS.includes(normalized as typeof USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS[number])
    ? normalized
    : ''
}

function sanitizeStoragePart(value: string): string {
  return normalizeText(value)
    .replace(/[^\w.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown-user'
}

export function buildManualAuthAvatarPath(userId: string, extension: string): string {
  const normalizedUserId = encodeURIComponent(normalizeText(userId))
  const normalizedExtension = normalizeQueryExtension(extension)
  if (!normalizedUserId || !normalizedExtension)
    return ''
  return `${MANUAL_AUTH_AVATAR_PREFIX}${normalizedUserId}?ext=${normalizedExtension}`
}

export function isManualAuthAvatarUrl(value: string | null | undefined): boolean {
  return normalizePathname(normalizeText(value)).startsWith(MANUAL_AUTH_AVATAR_PREFIX)
}

export function resolveManualAuthAvatarExtension(value: string | null | undefined): string {
  const normalizedValue = normalizeText(value)
  if (!normalizedValue)
    return ''

  try {
    const url = new URL(normalizedValue, 'http://localhost')
    return normalizeQueryExtension(url.searchParams.get('ext'))
  }
  catch {
    const search = normalizedValue.includes('?') ? normalizedValue.slice(normalizedValue.indexOf('?') + 1) : ''
    return normalizeQueryExtension(new URLSearchParams(search).get('ext'))
  }
}

export function isManualAuthAvatarUrlForUser(value: string | null | undefined, userId: string): boolean {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId)
    return false
  return normalizePathname(normalizeText(value)) === `${MANUAL_AUTH_AVATAR_PREFIX}${encodeURIComponent(normalizedUserId)}`
}

export function buildUserAvatarObjectKey(userId: string, extension: string): string {
  const normalizedExtension = normalizeQueryExtension(extension)
  if (!normalizedExtension)
    return ''
  return `avatars/users/${sanitizeStoragePart(userId)}/current.${normalizedExtension}`
}

export function listUserAvatarObjectKeys(userId: string): string[] {
  return USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS
    .map(extension => buildUserAvatarObjectKey(userId, extension))
    .filter(Boolean)
}

export function resolveUserAvatarContentType(extension: string): string {
  const normalizedExtension = normalizeQueryExtension(extension)
  if (normalizedExtension === 'jpg' || normalizedExtension === 'jpeg')
    return 'image/jpeg'
  if (normalizedExtension === 'png')
    return 'image/png'
  if (normalizedExtension === 'webp')
    return 'image/webp'
  return 'application/octet-stream'
}
