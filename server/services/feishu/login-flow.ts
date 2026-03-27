import type { H3Event } from 'h3'
import type { AuthLoginResult, FeishuIntegrationConfig } from '~~/shared/types/domain'
import { loginWithFeishuProfile } from '~~/server/services/feishu/auth'
import { getFeishuOAuthProfile } from '~~/server/services/feishu/client'
import { setSessionCookie } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import {
  readFeishuIntegrationConfig,
  toPublicFeishuIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'

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

  const loginResult = await loginWithFeishuProfile(event, profile)
  setSessionCookie(event, loginResult.sessionToken, loginResult.session.expiresAt)

  return {
    user: loginResult.user,
    session: loginResult.session,
    teams: loginResult.teams,
    workspaces: loginResult.workspaces,
    onboarding: loginResult.onboarding,
  }
}
