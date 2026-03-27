import type { H3Event } from 'h3'
import type { FeishuAdminGroupReconcileResult } from '~~/shared/types/domain'
import {
  getFeishuTenantAccessToken,
  getFeishuUserByUnionId,
  listFeishuGroupMemberUnionIds,
} from '~~/server/services/feishu/client'
import { ensureLocalUserByFeishuProfile } from '~~/server/services/feishu/user-provision'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  buildDefaultReconcileResult,
  ensurePlatformRole,
  listFeishuContestAdminUsers,
  listFeishuUserIdsByUnionIds,
  readFeishuIntegrationConfig,
  revokePlatformRole,
} from '~~/server/utils/feishu-integration-store'

function buildFallbackProfile(unionId: string) {
  const tail = String(unionId || '').slice(-6)
  return {
    unionId,
    openId: '',
    name: `Feishu_${tail}`,
    enName: `feishu_${tail}`,
    avatarUrl: '',
    email: '',
    mobile: '',
  }
}

export async function reconcileFeishuAdminGroups(
  event: H3Event,
): Promise<FeishuAdminGroupReconcileResult> {
  const config = await withClient(event, async db => readFeishuIntegrationConfig(db))
  const groupIds = [...config.adminGroupIds]
  const emptyResult = buildDefaultReconcileResult({ groupIds })

  if (!config.enabled)
    return emptyResult
  if (!config.appId || !config.appSecret)
    throw new Error('FEISHU_APP_CONFIG_INCOMPLETE')
  if (groupIds.length === 0)
    return emptyResult

  const tenantAccessToken = await getFeishuTenantAccessToken(config)
  const unionIds = await listFeishuGroupMemberUnionIds({
    config,
    tenantAccessToken,
    groupIds,
  })
  const normalizedUnionIds = Array.from(new Set(unionIds.map(item => String(item || '').trim()).filter(Boolean)))

  const unionToExistingUserId = await withClient(event, async (db) => {
    return listFeishuUserIdsByUnionIds(db, normalizedUnionIds)
  })

  const missingUnionIds = normalizedUnionIds.filter(unionId => !unionToExistingUserId.has(unionId))
  const missingProfiles = new Map<string, {
    unionId: string
    openId: string
    name: string
    enName: string
    avatarUrl: string
    email: string
    mobile: string
  }>()

  for (const unionId of missingUnionIds) {
    const fetched = await getFeishuUserByUnionId({
      config,
      tenantAccessToken,
      unionId,
    }).catch(() => null)
    missingProfiles.set(unionId, fetched || buildFallbackProfile(unionId))
  }

  return withTransaction(event, async (db) => {
    const result: FeishuAdminGroupReconcileResult = {
      synchronizedAt: new Date().toISOString(),
      groupIds,
      totalGroupMembers: normalizedUnionIds.length,
      createdUsers: 0,
      grantedContestAdmin: 0,
      revokedContestAdmin: 0,
      skippedMembers: 0,
    }

    const finalUnionToUserId = await listFeishuUserIdsByUnionIds(db, normalizedUnionIds)

    for (const unionId of normalizedUnionIds) {
      let userId = finalUnionToUserId.get(unionId) || ''

      if (!userId) {
        const profile = missingProfiles.get(unionId) || buildFallbackProfile(unionId)
        try {
          const provisioned = await ensureLocalUserByFeishuProfile(db, profile)
          userId = provisioned.user.id
          finalUnionToUserId.set(unionId, userId)
          if (provisioned.created)
            result.createdUsers += 1
        }
        catch {
          result.skippedMembers += 1
          continue
        }
      }

      const granted = await ensurePlatformRole(db, {
        userId,
        role: 'contest_admin',
      })
      if (granted)
        result.grantedContestAdmin += 1
    }

    const existingContestAdmins = await listFeishuContestAdminUsers(db)
    const unionSet = new Set(normalizedUnionIds)
    for (const item of existingContestAdmins) {
      if (unionSet.has(item.unionId))
        continue
      const revoked = await revokePlatformRole(db, {
        userId: item.userId,
        role: 'contest_admin',
      })
      if (revoked)
        result.revokedContestAdmin += 1
    }

    return result
  })
}
