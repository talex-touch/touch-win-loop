import type { FeishuOAuthLoginProfile } from '~~/server/services/feishu/client'
import type { FeishuDirectorySearchResult, FeishuDirectoryUserCandidate } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { getFeishuDirectorySnapshot } from '~~/server/services/feishu/directory-cache'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  listFeishuContestAdminDirectory,
  listFeishuUserIdsByUnionIds,
  listUsersByIds,
  readFeishuIntegrationConfig,
} from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function normalizeKeyword(raw: unknown): string {
  return toText(raw).toLowerCase()
}

function toBoolean(raw: unknown): boolean {
  const normalized = toText(raw).toLowerCase()
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return toText(error.message) || 'UNKNOWN_ERROR'
  return toText(error) || 'UNKNOWN_ERROR'
}

function isPermissionRelatedMessage(message: string): boolean {
  const normalized = toText(message).toLowerCase()
  if (!normalized)
    return false
  return normalized.includes('permission')
    || normalized.includes('forbidden')
    || normalized.includes('scope')
    || normalized.includes('access denied')
    || normalized.includes('insufficient')
    || normalized.includes('not allowed')
    || normalized.includes('no_access')
    || normalized.includes('99991663')
    || normalized.includes('权限')
    || normalized.includes('无权限')
}

function buildFeishuPermissionHint(): string {
  return '请在飞书开放平台为当前应用补齐通讯录读取权限（部门、部门用户、按 union_id 查用户），并在企业管理后台完成重新授权后再点击“刷新候选”。'
}

function toUniqueArray(items: string[]): string[] {
  return [...new Set(items.map(item => toText(item)).filter(Boolean))]
}

function includesKeyword(profile: FeishuOAuthLoginProfile, keyword: string): boolean {
  if (!keyword)
    return true
  const haystacks = [
    profile.unionId,
    profile.name,
    profile.enName,
    profile.email,
    profile.mobile,
  ].map(item => toText(item).toLowerCase())
  return haystacks.some(item => item.includes(keyword))
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权搜索飞书成员。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40417)
  }

  const keyword = normalizeKeyword(getQuery(event).keyword)
  const limit = Math.max(1, Math.min(100, Number(getQuery(event).limit || 20)))
  const forceRefresh = toBoolean(getQuery(event).refresh)

  const [config, contestAdmins] = await Promise.all([
    withClient(event, async db => readFeishuIntegrationConfig(db)),
    withClient(event, async db => listFeishuContestAdminDirectory(db)),
  ])
  const contestAdminSet = new Set(contestAdmins.map(item => item.userId))

  const payload: FeishuDirectorySearchResult = {
    items: [],
    notice: '',
    source: undefined,
    fromCache: false,
    fetchedAt: '',
    cacheExpiresAt: '',
    totalMembers: 0,
    permissionHint: '',
  }

  if (!config.enabled) {
    payload.notice = '飞书集成未启用，无法搜索飞书成员。'
    return ok<FeishuDirectorySearchResult>(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  if (!config.appId || !config.appSecret) {
    payload.notice = '飞书 App 配置不完整（appId/appSecret 缺失）。'
    return ok<FeishuDirectorySearchResult>(payload, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  try {
    const directorySnapshot = await getFeishuDirectorySnapshot({
      config,
      forceRefresh,
      maxUsers: 5000,
    })
    const profiles = directorySnapshot.users
    payload.source = directorySnapshot.source
    payload.fromCache = directorySnapshot.fromCache
    payload.fetchedAt = directorySnapshot.fetchedAt
    payload.cacheExpiresAt = directorySnapshot.cacheExpiresAt
    payload.totalMembers = directorySnapshot.users.length
    payload.permissionHint = isPermissionRelatedMessage(directorySnapshot.notice)
      ? buildFeishuPermissionHint()
      : ''

    const matchedProfiles = profiles.filter(profile => includesKeyword(profile, keyword))
    const matchedUnionIds = matchedProfiles.map(profile => profile.unionId)
    const unionToUserId = await withClient(event, async db => listFeishuUserIdsByUnionIds(db, matchedUnionIds))
    const userIds = toUniqueArray(matchedUnionIds.map(unionId => unionToUserId.get(unionId) || ''))
    const userMap = await withClient(event, async db => listUsersByIds(db, userIds))

    const items = matchedProfiles.map((profile): FeishuDirectoryUserCandidate => {
      const userId = unionToUserId.get(profile.unionId) || null
      const localUser = userId ? userMap.get(userId) : null
      return {
        unionId: profile.unionId,
        name: toText(profile.name) || toText(profile.enName) || toText(localUser?.username),
        enName: toText(profile.enName),
        email: toText(profile.email),
        mobile: toText(profile.mobile),
        userId,
        username: toText(localUser?.username) || null,
        hasContestAdmin: userId ? contestAdminSet.has(userId) : false,
      }
    })

    payload.items = items
      .sort((left, right) => {
        if (left.hasContestAdmin !== right.hasContestAdmin)
          return left.hasContestAdmin ? -1 : 1
        if (Boolean(left.userId) !== Boolean(right.userId))
          return left.userId ? -1 : 1
        return left.unionId.localeCompare(right.unionId)
      })
      .slice(0, limit)
    const sourceLabel = directorySnapshot.source === 'tenant' ? '飞书全员目录' : '管理员组目录'
    const cacheLabel = directorySnapshot.fromCache ? '（缓存）' : ''
    const sourceNotice = `${sourceLabel}${cacheLabel}，总成员 ${directorySnapshot.users.length} 人。`
    payload.notice = directorySnapshot.notice
      ? `${directorySnapshot.notice} ${sourceNotice}`
      : sourceNotice
  }
  catch (error) {
    const message = toErrorMessage(error)
    payload.items = []
    payload.notice = `搜索飞书成员失败：${message}`
    payload.permissionHint = isPermissionRelatedMessage(message)
      ? buildFeishuPermissionHint()
      : ''
  }

  return ok<FeishuDirectorySearchResult>(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
