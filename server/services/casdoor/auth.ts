import type { H3Event } from 'h3'
import type { CasdoorOAuthLoginProfile } from '~~/server/services/casdoor/client'
import type { AuthLoginResult } from '~~/shared/types/domain'
import { buildAuthLoginResult } from '~~/server/services/auth/login-session'
import { ensureLocalUserByCasdoorProfile } from '~~/server/services/casdoor/user-provision'
import { withTransaction } from '~~/server/utils/db'

export async function loginWithCasdoorProfile(
  event: H3Event,
  profile: CasdoorOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
  } = {},
): Promise<AuthLoginResult & { sessionToken: string }> {
  return withTransaction(event, async (db) => {
    const provisioned = await ensureLocalUserByCasdoorProfile(db, profile, {
      preferredUserId: input.preferredUserId,
      allowRegistration: input.allowRegistration,
    })
    return buildAuthLoginResult(db, provisioned.user)
  })
}
