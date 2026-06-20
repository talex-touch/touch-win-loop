import type { H3Event } from 'h3'
import type { ExternalAuthLoginResult } from '~~/server/services/auth/external-identity'
import type { CasdoorOAuthLoginProfile } from '~~/server/services/casdoor/client'
import { loginWithExternalAuthProfile } from '~~/server/services/auth/external-identity'

export async function loginWithCasdoorProfile(
  event: H3Event,
  profile: CasdoorOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
    redirectTarget?: string
  } = {},
): Promise<ExternalAuthLoginResult> {
  return loginWithExternalAuthProfile(event, {
    provider: 'casdoor',
    providerUserId: profile.sub,
    displayName: profile.name || profile.preferredUsername || profile.email,
    preferredUsername: profile.preferredUsername || profile.name || profile.email,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    rawProfile: {
      sub: profile.sub,
      name: profile.name,
      preferredUsername: profile.preferredUsername,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
    },
  }, input)
}
