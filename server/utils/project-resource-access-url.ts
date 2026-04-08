import {
  createProjectResourceAccessToken,
} from '~~/server/services/document/project-resource-access-token'
import {
  buildOnlyOfficeSourceApiEndpoint,
  buildServerApiEndpoint,
} from '~~/server/utils/api-url'
import { appendQueryParam } from '~~/shared/utils/api-url'

export interface ProjectResourceSignedUrls {
  previewUrl: string
  previewUrlExpiresAt: string
  sourceDownloadUrl: string
  sourceDownloadUrlExpiresAt: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

export function buildProjectResourceSignedUrls(input: {
  projectId: string
  resourceId: string
  ttlSeconds?: number
}): ProjectResourceSignedUrls {
  const projectId = normalizeString(input.projectId)
  const resourceId = normalizeString(input.resourceId)
  const unsignedSourceDownloadUrl = buildServerApiEndpoint(`/projects/${projectId}/resources/${resourceId}/source`)
  const unsignedPreviewUrl = buildServerApiEndpoint(`/projects/${projectId}/resources/${resourceId}/preview`)

  try {
    const sourceToken = createProjectResourceAccessToken({
      projectId,
      resourceId,
      kind: 'source',
      ttlSeconds: input.ttlSeconds,
    })
    const previewToken = createProjectResourceAccessToken({
      projectId,
      resourceId,
      kind: 'preview',
      ttlSeconds: input.ttlSeconds,
    })

    const sourceDownloadUrl = appendQueryParam(
      unsignedSourceDownloadUrl,
      'token',
      sourceToken.token,
    )
    const previewUrl = appendQueryParam(
      unsignedPreviewUrl,
      'token',
      previewToken.token,
    )

    return {
      previewUrl,
      previewUrlExpiresAt: previewToken.expiresAt,
      sourceDownloadUrl,
      sourceDownloadUrlExpiresAt: sourceToken.expiresAt,
    }
  }
  catch (error) {
    if (!(error instanceof Error) || error.message !== 'ONLYOFFICE_JWT_SECRET_NOT_CONFIGURED')
      throw error

    return {
      previewUrl: unsignedPreviewUrl,
      previewUrlExpiresAt: '',
      sourceDownloadUrl: unsignedSourceDownloadUrl,
      sourceDownloadUrlExpiresAt: '',
    }
  }
}

export function buildOnlyOfficeProjectSourceUrl(input: {
  projectId: string
  resourceId: string
  ttlSeconds?: number
}): { url: string, expiresAt: string } {
  const projectId = normalizeString(input.projectId)
  const resourceId = normalizeString(input.resourceId)
  const token = createProjectResourceAccessToken({
    projectId,
    resourceId,
    kind: 'source',
    ttlSeconds: input.ttlSeconds,
  })
  const url = appendQueryParam(
    buildOnlyOfficeSourceApiEndpoint(`/projects/${projectId}/resources/${resourceId}/source`),
    'token',
    token.token,
  )
  return {
    url,
    expiresAt: token.expiresAt,
  }
}
