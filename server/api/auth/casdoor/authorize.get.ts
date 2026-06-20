import { createError, sendRedirect, setResponseStatus } from 'h3'
import { buildCasdoorAuthorizeUrl, isCasdoorAuthEnabled } from '~~/server/services/casdoor/client'
import {
  issueCasdoorOAuthState,
  persistCasdoorOAuthRedirect,
} from '~~/server/services/casdoor/security'
import { fail } from '~~/server/utils/api'
import { warnIfPublicBaseHostMismatch } from '~~/server/utils/api-url'
import { withClient } from '~~/server/utils/db'
import { readCasdoorIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return '/dashboard'
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return '/dashboard'
  if (redirect.startsWith('/login'))
    return '/dashboard'
  return redirect
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)
  const config = await withClient(event, async (db) => {
    return readCasdoorIntegrationConfig(db)
  })

  if (!config.enabled || !isCasdoorAuthEnabled(config)) {
    setResponseStatus(event, 400)
    return fail('第三方 OAuth 登录尚未启用或配置不完整。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  const state = issueCasdoorOAuthState(event)
  const redirectTarget = sanitizeRedirectTarget(getQuery(event).redirect)
  persistCasdoorOAuthRedirect(event, redirectTarget)
  warnIfPublicBaseHostMismatch({
    event,
    publicBaseUrl: runtime.onlyOffice.sourceBaseURL,
    context: 'auth.casdoor.authorize',
  })

  try {
    const authorizeUrl = await buildCasdoorAuthorizeUrl({
      config,
      state,
    })
    return sendRedirect(event, authorizeUrl, 302)
  }
  catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'casdoor_authorize_url_error',
      message: error instanceof Error ? error.message : 'CASDOOR_AUTHORIZE_URL_BUILD_FAILED',
    })
  }
})
