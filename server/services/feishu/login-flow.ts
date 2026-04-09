import type { H3Event } from 'h3'
import type { AuthLoginResult, FeishuIntegrationConfig } from '~~/shared/types/domain'
import { loginWithFeishuProfile } from '~~/server/services/feishu/auth'
import { getFeishuOAuthProfile } from '~~/server/services/feishu/client'
import { getAuthFromEvent, setSessionCookie } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withClient } from '~~/server/utils/db'
import {
  readFeishuIntegrationConfig,
  toPublicFeishuIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

function parseFeishuErrorDetail(raw: string): string {
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

export function resolveFeishuLoginErrorInfo(error: unknown): {
  code: string
  message: string
  boundUserHint?: string
} {
  const raw = error instanceof Error ? error.message : String(error || '')
  const [codeRaw, detailRaw = ''] = String(raw || '').split(':', 2)
  const code = String(codeRaw || '').trim()
  const detail = parseFeishuErrorDetail(detailRaw)

  if (code === 'FEISHU_IDENTITY_ALREADY_BOUND_OTHER_USER') {
    const boundUserHint = maskHint(detail)
    return {
      code,
      message: boundUserHint
        ? `该飞书账号已绑定平台账号（${boundUserHint}），请使用该账号登录或联系管理员解绑。`
        : '该飞书账号已绑定其他平台账号，请使用原账号登录或联系管理员解绑。',
      boundUserHint,
    }
  }
  if (code === 'FEISHU_USER_ALREADY_BOUND_OTHER_IDENTITY')
    return { code, message: '当前账号已绑定其他飞书账号，如需更换请先解绑再重新绑定。' }
  if (code === 'FEISHU_PREFERRED_USER_NOT_FOUND')
    return { code, message: '当前登录会话无效，请重新登录后再绑定飞书账号。' }
  if (code === 'USER_DISABLED')
    return { code, message: '当前账号已被禁用，请联系平台管理员。' }
  if (code === 'AUTH_REGISTRATION_DISABLED')
    return { code, message: '平台暂未开放注册，请联系管理员开通账号或开启注册。' }
  if (code === 'FEISHU_INTEGRATION_DISABLED')
    return { code, message: '飞书登录尚未启用。' }
  if (code === 'FEISHU_APP_CONFIG_INCOMPLETE')
    return { code, message: '飞书应用配置不完整，请联系管理员。' }
  return {
    code,
    message: raw || '飞书登录失败。',
  }
}

export function resolveFeishuLoginErrorMessage(error: unknown): string {
  return resolveFeishuLoginErrorInfo(error).message
}

export async function readFeishuAuthMeta(event: H3Event): Promise<FeishuIntegrationConfig> {
  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })
  return toPublicFeishuIntegrationConfig(config)
}

export async function loginByFeishuOAuthCode(
  event: H3Event,
  code: string,
): Promise<AuthLoginResult> {
  const { runtime } = await readEffectivePlatformRuntimeSettings(event)
  const auth = await getAuthFromEvent(event).catch(() => null)
  const preferredUserId = String(auth?.user?.id || '').trim()

  const config = await withClient(event, async (db) => {
    return readFeishuIntegrationConfig(db)
  })

  if (!config.enabled)
    throw new Error('FEISHU_INTEGRATION_DISABLED')
  if (!config.appId || !config.appSecret)
    throw new Error('FEISHU_APP_CONFIG_INCOMPLETE')

  const profile = await getFeishuOAuthProfile({
    config,
    code,
  })

  const loginResult = await loginWithFeishuProfile(event, profile, {
    preferredUserId: preferredUserId || undefined,
    allowRegistration: runtime.auth.registrationEnabled,
  })
  setSessionCookie(event, loginResult.sessionToken, loginResult.session.expiresAt)

  if (preferredUserId && loginResult.user.id === preferredUserId) {
    await withClient(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: preferredUserId,
        action: 'auth.feishu.bind.self',
        payload: {
          unionId: profile.unionId,
          name: profile.name,
          enName: profile.enName,
          email: profile.email,
          mobile: profile.mobile,
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
