import type { H3Event } from 'h3'
import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import type { AuthLoginResult } from '~~/shared/types/domain'
import { buildAuthLoginResult } from '~~/server/services/auth/login-session'
import { ensureLocalUserByFeishuProfile } from '~~/server/services/feishu/user-provision'
import { withTransaction } from '~~/server/utils/db'

export async function loginWithFeishuProfile(
  event: H3Event,
  profile: FeishuOAuthLoginProfile,
  input: {
    preferredUserId?: string | null
    allowRegistration?: boolean
  } = {},
): Promise<AuthLoginResult & { sessionToken: string }> {
  return withTransaction(event, async (db) => {
    const provisioned = await ensureLocalUserByFeishuProfile(db, profile, {
      preferredUserId: input.preferredUserId,
      allowRegistration: input.allowRegistration,
    })
    return buildAuthLoginResult(db, provisioned.user)
  })
}
