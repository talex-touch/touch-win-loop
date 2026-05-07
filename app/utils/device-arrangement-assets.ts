import type { ApiResponse, Resource } from '~~/shared/types/domain'

interface DeviceArrangementScreenshotUploadResult {
  resources?: Resource[]
}

interface UploadDeviceArrangementScreenshotInput {
  endpoint: (path: string) => string
  projectId: string
  parentResourceId?: string
  file: File
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export async function uploadDeviceArrangementScreenshotAsset(
  input: UploadDeviceArrangementScreenshotInput,
): Promise<string> {
  const projectId = normalizeString(input.projectId)
  const parentResourceId = normalizeString(input.parentResourceId)
  if (!projectId)
    return ''

  const formData = new FormData()
  formData.set('category', 'templates')
  formData.set('accessLevel', 'login_required')
  formData.set('title', input.file.name || 'device-arrangement-screenshot')
  if (parentResourceId)
    formData.set('parentResourceId', parentResourceId)
  formData.append('file', input.file)

  const response = await fetch(input.endpoint(`/projects/${projectId}/resources/upload`), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const result = await response.json().catch(() => null) as ApiResponse<DeviceArrangementScreenshotUploadResult> | null
  if (!response.ok || !result || result.code !== 0)
    throw new Error(String(result?.message || '截图上传失败。'))

  const resourceId = normalizeString(result.data?.resources?.[0]?.id)
  return resourceId
    ? input.endpoint(`/projects/${projectId}/resources/${resourceId}/file`)
    : ''
}
