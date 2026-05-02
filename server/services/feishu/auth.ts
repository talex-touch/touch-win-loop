import type { H3Event } from 'h3'
import type { ExternalAuthLoginResult } from '~~/server/services/auth/external-identity'
import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import { loginWithExternalAuthProfile } from '~~/server/services/auth/external-identity'

export async function loginWithFeishuProfile(
  event: H3Event,
  profile: FeishuOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
    redirectTarget?: string
  } = {},
): Promise<ExternalAuthLoginResult> {
  return loginWithExternalAuthProfile(event, {
    provider: 'feishu',
    providerUserId: profile.unionId,
    displayName: profile.enName || profile.name || profile.email,
    preferredUsername: profile.enName || profile.name || profile.email,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    mobile: profile.mobile,
    rawProfile: {
      unionId: profile.unionId,
      openId: profile.openId,
      name: profile.name,
      enName: profile.enName,
      avatarUrl: profile.avatarUrl,
      email: profile.email,
      mobile: profile.mobile,
    },
  }, input)
}
