import type { H3Event } from 'h3'
import { createError, sendRedirect, setResponseStatus } from 'h3'
import { buildFeishuAuthorizeUrl } from '~~/server/services/feishu/client'
import {
  issueFeishuOAuthState,
  persistFeishuOAuthRedirect,
} from '~~/server/services/feishu/security'
import { fail } from '~~/server/utils/api'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'

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

function getFirstHeaderValue(rawValue: string | string[] | undefined): string {
  const first = Array.isArray(rawValue) ? (rawValue[0] || '') : (rawValue || '')
  return String(first).split(',')[0]?.trim() || ''
}

function resolveRequestOrigin(event: H3Event): string {
  const req = event.node?.req
  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto'])
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host'])
  const host = forwardedHost || getFirstHeaderValue(req.headers.host)
  if (!host)
    return ''

  const socket = req.socket as { encrypted?: boolean } | undefined
  const protocol = forwardedProto
    ? forwardedProto.toLowerCase()
    : (socket?.encrypted ? 'https' : 'http')
  const normalizedProtocol = protocol === 'https' ? 'https' : 'http'
  try {
    return new URL(`${normalizedProtocol}://${host}`).origin
  }
  catch {
    return ''
  }
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

  let authorizeUrl = ''
  try {
    authorizeUrl = buildFeishuAuthorizeUrl({
      config,
      state,
      requestOrigin: resolveRequestOrigin(event),
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
