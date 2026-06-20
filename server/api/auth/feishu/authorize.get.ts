import { createError, sendRedirect, setResponseStatus } from 'h3'
import { buildFeishuAuthorizeUrl, resolveFeishuOAuthRedirectUri } from '~~/server/services/feishu/client'
import {
  issueFeishuOAuthState,
  persistFeishuOAuthCallback,
  persistFeishuOAuthRedirect,
} from '~~/server/services/feishu/security'
import { fail } from '~~/server/utils/api'
import { resolveServerRequestOrigin, warnIfPublicBaseHostMismatch } from '~~/server/utils/api-url'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'

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

export function resolveRuntimeOAuthRedirectUri(runtime: ReturnType<typeof readRuntimeSettings>): string {
  return resolveFeishuOAuthRedirectUri({
    publicBaseUrl: runtime.onlyOffice.sourceBaseURL,
    apiBaseUrl: runtime.apiBaseUrl,
  })
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
  const redirectUri = config.oauthRedirectUri || resolveRuntimeOAuthRedirectUri(runtime)
  persistFeishuOAuthRedirect(event, redirectTarget)
  persistFeishuOAuthCallback(event, redirectUri)
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
      redirectUri: redirectUri || undefined,
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
