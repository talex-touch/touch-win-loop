import { createError, sendRedirect, setResponseStatus } from 'h3'
import { buildFeishuAuthorizeUrl } from '~~/server/services/feishu/client'
import {
  issueFeishuOAuthState,
  persistFeishuOAuthRedirect,
} from '~~/server/services/feishu/security'
import { fail } from '~~/server/utils/api'
import { resolveServerRequestOrigin, warnIfPublicBaseHostMismatch } from '~~/server/utils/api-url'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { buildApiEndpoint, extractApiBasePathPrefix, isHttpUrl } from '~~/shared/utils/api-url'

function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return ''
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return ''
  if (redirect.startsWith('/login'))
    return ''
  return redirect
}

function resolveRuntimeOAuthRedirectUri(runtime: ReturnType<typeof readRuntimeSettings>): string {
  const publicBaseUrl = String(runtime.onlyOffice.sourceBaseURL || '').trim()
  if (!isHttpUrl(publicBaseUrl))
    return ''

  const apiBasePathPrefix = extractApiBasePathPrefix(runtime.apiBaseUrl) || '/'
  const apiCallbackPath = buildApiEndpoint(apiBasePathPrefix, '/auth/feishu/callback')
  const redirectUri = buildApiEndpoint(publicBaseUrl, apiCallbackPath)
  return isHttpUrl(redirectUri) ? redirectUri : ''
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)

  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })

  if (!config.enabled || !config.appId) {
    setResponseStatus(event, 400)
    return fail('飞书登录尚未启用。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const state = issueFeishuOAuthState(event)
  const redirectTarget = sanitizeRedirectTarget(getQuery(event).redirect)
  persistFeishuOAuthRedirect(event, redirectTarget)
  warnIfPublicBaseHostMismatch({
    event,
    publicBaseUrl: runtime.onlyOffice.sourceBaseURL,
    context: 'auth.feishu.authorize',
  })

  let authorizeUrl = ''
  try {
    authorizeUrl = buildFeishuAuthorizeUrl({
      config,
      state,
      redirectUri: resolveRuntimeOAuthRedirectUri(runtime) || undefined,
      requestOrigin: resolveServerRequestOrigin(event),
    })
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'feishu_authorize_url_error',
      message: error instanceof Error ? error.message : 'FEISHU_AUTHORIZE_URL_BUILD_FAILED',
    })
  }

  return sendRedirect(event, authorizeUrl, 302)
})
