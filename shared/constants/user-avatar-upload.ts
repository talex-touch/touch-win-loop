const KB = 1024
const MB = KB * 1024

export const USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const

export const USER_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES = 2 * MB

const SUPPORTED_EXTENSION_SET = new Set<string>(USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS)

export function getUserAvatarFileExtension(fileName: string): string {
  const normalizedName = String(fileName || '').trim().toLowerCase()
  if (!normalizedName)
    return ''

  const dotIndex = normalizedName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === normalizedName.length - 1)
    return ''

  return normalizedName.slice(dotIndex + 1)
}

export function isUserAvatarUploadFileSupported(fileName: string): boolean {
  const extension = getUserAvatarFileExtension(fileName)
  if (!extension)
    return false
  return SUPPORTED_EXTENSION_SET.has(extension)
}

export const USER_AVATAR_UPLOAD_ACCEPT_ATTR = USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS
  .map(ext => `.${ext}`)
  .join(',')

export const USER_AVATAR_UPLOAD_TYPES_LABEL = USER_AVATAR_UPLOAD_SUPPORTED_EXTENSIONS
  .map(ext => ext.toUpperCase())
  .join(' / ')
