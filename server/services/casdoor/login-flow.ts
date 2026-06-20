import type { H3Event } from 'h3'
import type { AuthLoginResult } from '~~/shared/types/domain'
import {
  clearExternalAuthOnboarding,
  sanitizeRedirectTarget as sanitizeExternalRedirectTarget,
} from '~~/server/services/auth/external-identity'
import { loginWithCasdoorProfile } from '~~/server/services/casdoor/auth'
import { exchangeCasdoorOAuthCode, isCasdoorAuthEnabled } from '~~/server/services/casdoor/client'
import { getAuthFromEvent, setSessionCookie } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import { readCasdoorIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

function parseErrorDetail(raw: string): string {
  const source = String(raw || '').trim()
  if (!source)
    return ''
  try {
    return decodeURIComponent(source)
  }
  catch {
    return source
  }
}

function maskHint(raw: string): string {
  const source = String(raw || '').trim()
  if (!source)
    return ''
  if (source.length <= 2)
    return `${source[0] || '*'}*`
  return `${source[0]}***${source[source.length - 1]}`
}

export function resolveCasdoorLoginErrorInfo(error: unknown): {
  code: string
  message: string
  boundUserHint?: string
} {
  const raw = error instanceof Error ? error.message : String(error || '')
  const [codeRaw, detailRaw = ''] = String(raw || '').split(':', 2)
  const code = String(codeRaw || '').trim()
  const detail = parseErrorDetail(detailRaw)

  if (code === 'CASDOOR_IDENTITY_ALREADY_BOUND_OTHER_USER') {
    const boundUserHint = maskHint(detail)
    return {
      code,
      message: boundUserHint
        ? `该第三方 OAuth 账号已绑定平台账号（${boundUserHint}），请使用该账号登录或联系管理员处理。`
        : '该第三方 OAuth 账号已绑定其他平台账号，请使用原账号登录或联系管理员处理。',
      boundUserHint,
    }
  }
  if (code === 'CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY')
    return { code, message: '当前平台账号已绑定其他第三方 OAuth 身份，如需更换请联系管理员处理。' }
  if (code === 'CASDOOR_PREFERRED_USER_NOT_FOUND')
    return { code, message: '当前登录会话无效，请重新登录后再绑定第三方 OAuth 账号。' }
  if (code === 'USER_DISABLED')
    return { code, message: '当前账号已被禁用，请联系平台管理员。' }
  if (code === 'AUTH_REGISTRATION_DISABLED')
    return { code, message: '平台暂未开放注册，请联系管理员开通账号或开启注册。' }
  if (code === 'AUTH_ONBOARDING_SECRET_REQUIRED')
    return { code, message: '第三方登录引导配置不完整，请联系管理员。' }
  if (code === 'CASDOOR_INTEGRATION_DISABLED')
    return { code, message: '第三方 OAuth 登录尚未启用。' }
  if (code === 'CASDOOR_APP_CONFIG_INCOMPLETE')
    return { code, message: 'OAuth / OIDC 集成配置不完整，请前往集成中心补全。' }
  if (code === 'CASDOOR_REDIRECT_URI_REQUIRED')
    return { code, message: 'OAuth 回调地址未配置，请前往集成中心补全。' }

  return {
    code,
    message: raw || '第三方 OAuth 登录失败。',
  }
}

export async function loginByCasdoorOAuthCode(
  event: H3Event,
  code: string,
  input: {
    redirectUri?: string
    redirectTarget?: string
  } = {},
): Promise<AuthLoginResult | { needsOnboarding: true, provider: 'casdoor' }> {
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)
  const auth = await getAuthFromEvent(event).catch(() => null)
  const preferredUserId = String(auth?.user?.id || '').trim()
  const config = await withClient(event, async (db) => {
    return readCasdoorIntegrationConfig(db)
  })

  if (!config.enabled)
    throw new Error('CASDOOR_INTEGRATION_DISABLED')
  if (!isCasdoorAuthEnabled(config))
    throw new Error('CASDOOR_APP_CONFIG_INCOMPLETE')

  const profile = await exchangeCasdoorOAuthCode({
    config,
    code,
    redirectUri: input.redirectUri,
  })

  const loginResult = await loginWithCasdoorProfile(event, profile, {
    preferredUserId: preferredUserId || undefined,
    allowRegistration: runtime.auth.registrationEnabled,
    redirectTarget: sanitizeExternalRedirectTarget(input.redirectTarget),
  })
  if ('needsOnboarding' in loginResult)
    return { needsOnboarding: true, provider: 'casdoor' }

  setSessionCookie(event, loginResult.sessionToken, loginResult.session.expiresAt)
  clearExternalAuthOnboarding(event)

  if (preferredUserId && loginResult.user.id === preferredUserId) {
    await withClient(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: preferredUserId,
        action: 'auth.casdoor.bind.self',
        payload: {
          sub: profile.sub,
          name: profile.name,
          preferredUsername: profile.preferredUsername,
          email: profile.email,
        },
      })
    }).catch(() => {})
  }

  return {
    user: loginResult.user,
    session: loginResult.session,
    teams: loginResult.teams,
    workspaces: loginResult.workspaces,
    onboarding: {
      ...loginResult.onboarding,
      needsProfileSetup: false,
      pendingProvider: undefined,
    },
  }
}
