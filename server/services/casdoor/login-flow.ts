import type { H3Event } from 'h3'
import type { AuthLoginResult } from '~~/shared/types/domain'
import { loginWithCasdoorProfile } from '~~/server/services/casdoor/auth'
import { exchangeCasdoorOAuthCode } from '~~/server/services/casdoor/client'
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
        ? `该 Casdoor 账号已绑定平台账号（${boundUserHint}），请使用该账号登录或联系管理员处理。`
        : '该 Casdoor 账号已绑定其他平台账号，请使用原账号登录或联系管理员处理。',
      boundUserHint,
    }
  }
  if (code === 'CASDOOR_USER_ALREADY_BOUND_OTHER_IDENTITY')
    return { code, message: '当前平台账号已绑定其他 Casdoor 身份，如需更换请联系管理员处理。' }
  if (code === 'CASDOOR_PREFERRED_USER_NOT_FOUND')
    return { code, message: '当前登录会话无效，请重新登录后再绑定 Casdoor 账号。' }
  if (code === 'USER_DISABLED')
    return { code, message: '当前账号已被禁用，请联系平台管理员。' }
  if (code === 'AUTH_REGISTRATION_DISABLED')
    return { code, message: '平台暂未开放注册，请联系管理员开通账号或开启注册。' }
  if (code === 'CASDOOR_INTEGRATION_DISABLED')
    return { code, message: 'Casdoor 登录尚未启用。' }
  if (code === 'CASDOOR_APP_CONFIG_INCOMPLETE')
    return { code, message: 'Casdoor 集成配置不完整，请前往集成中心补全。' }
  if (code === 'CASDOOR_REDIRECT_URI_REQUIRED')
    return { code, message: 'Casdoor 回调地址未配置，请前往集成中心补全。' }

  return {
    code,
    message: raw || 'Casdoor 登录失败。',
  }
}

export async function loginByCasdoorOAuthCode(
  event: H3Event,
  code: string,
  redirectUri?: string,
): Promise<AuthLoginResult> {
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)
  const auth = await getAuthFromEvent(event).catch(() => null)
  const preferredUserId = String(auth?.user?.id || '').trim()
  const config = await withClient(event, async (db) => {
    return readCasdoorIntegrationConfig(db)
  })

  if (!config.enabled)
    throw new Error('CASDOOR_INTEGRATION_DISABLED')
  if (!config.issuer || !config.clientId || !config.clientSecret)
    throw new Error('CASDOOR_APP_CONFIG_INCOMPLETE')

  const profile = await exchangeCasdoorOAuthCode({
    config,
    code,
    redirectUri,
  })

  const loginResult = await loginWithCasdoorProfile(event, profile, {
    preferredUserId: preferredUserId || undefined,
    allowRegistration: runtime.auth.registrationEnabled,
  })
  setSessionCookie(event, loginResult.sessionToken, loginResult.session.expiresAt)

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
    onboarding: loginResult.onboarding,
  }
}
