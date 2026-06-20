const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

export const PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'txt',
  'md',
  'markdown',
  'json',
  'jpg',
  'jpeg',
  'png',
  'webp',
] as const

export const PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES = 200 * MB
export const PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH = 20
export const PROJECT_RESOURCE_STORAGE_LIMIT_BYTES = 10 * GB
export const PROJECT_RESOURCE_UPLOAD_CHUNK_SIZE_BYTES = 8 * MB
export const PROJECT_RESOURCE_UPLOAD_SESSION_EXPIRES_IN_HOURS = 24

const SUPPORTED_EXTENSION_SET = new Set<string>(PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS)

export function getFileExtension(fileName: string): string {
  const normalizedName = String(fileName || '').trim().toLowerCase()
  if (!normalizedName)
    return ''

  const dotIndex = normalizedName.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === normalizedName.length - 1)
    return ''

  return normalizedName.slice(dotIndex + 1)
}

export function isProjectResourceUploadFileSupported(fileName: string): boolean {
  const extension = getFileExtension(fileName)
  if (!extension)
    return false
  return SUPPORTED_EXTENSION_SET.has(extension)
}

export function formatFileSize(bytes: number): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  if (safeBytes >= GB)
    return `${(safeBytes / GB).toFixed(2).replace(/\.00$/, '')} GB`
  if (safeBytes >= MB)
    return `${(safeBytes / MB).toFixed(2).replace(/\.00$/, '')} MB`
  if (safeBytes >= KB)
    return `${(safeBytes / KB).toFixed(2).replace(/\.00$/, '')} KB`
  return `${safeBytes} B`
}

export const PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR = PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS
  .map(ext => `.${ext}`)
  .join(',')

export const PROJECT_RESOURCE_UPLOAD_TYPES_LABEL = PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS
  .map(ext => ext.toUpperCase())
  .join(' / ')
