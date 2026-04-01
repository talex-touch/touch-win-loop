import type { FeishuIntegrationConfigInternal } from '~~/server/utils/feishu-integration-store'
import type {
  FeishuOAuthLoginProfile,
  FeishuTenantDirectory,
  FeishuTenantDirectoryDepartment,
} from './client'
import {
  getFeishuTenantAccessToken,
  getFeishuUserByUnionId,
  listFeishuGroupMemberUnionIds,
  listFeishuTenantDirectory,
} from './client'

const FEISHU_DIRECTORY_CACHE_KEY = Symbol.for('winloop.feishu.directory.cache.v2')
const DEFAULT_DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_MAX_DIRECTORY_USERS = 3000

type DirectorySource = 'tenant' | 'group_fallback'

interface FeishuDirectorySnapshotCached {
  users: FeishuOAuthLoginProfile[]
  departments: FeishuTenantDirectoryDepartment[]
  rootDepartmentId: string
  userDepartmentIds: Record<string, string[]>
  source: DirectorySource
  notice: string
  fetchedAt: string
}

interface FeishuDirectorySnapshotResponse extends FeishuDirectorySnapshotCached {
  fromCache: boolean
  cacheExpiresAt: string
}

interface FeishuDirectoryCacheEntry {
  expiresAt: number
  value: FeishuDirectorySnapshotCached
}

interface FeishuDirectoryCacheState {
  entries: Map<string, FeishuDirectoryCacheEntry>
  inflight: Map<string, Promise<FeishuDirectorySnapshotCached>>
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return toText(error.message) || 'UNKNOWN_ERROR'
  return toText(error) || 'UNKNOWN_ERROR'
}

function toUnionId(profile: FeishuOAuthLoginProfile): string {
  return toText(profile.unionId)
}

function toUniqueProfiles(items: FeishuOAuthLoginProfile[]): FeishuOAuthLoginProfile[] {
  const seen = new Set<string>()
  const result: FeishuOAuthLoginProfile[] = []
  for (const item of items) {
    const unionId = toUnionId(item)
    if (!unionId || seen.has(unionId))
      continue
    seen.add(unionId)
    result.push({
      unionId,
      openId: toText(item.openId),
      name: toText(item.name),
      enName: toText(item.enName),
      avatarUrl: toText(item.avatarUrl),
      email: toText(item.email),
      mobile: toText(item.mobile),
    })
  }
  return result
}

function toUniqueDepartments(items: FeishuTenantDirectoryDepartment[]): FeishuTenantDirectoryDepartment[] {
  const seen = new Set<string>()
  const result: FeishuTenantDirectoryDepartment[] = []
  for (const item of items) {
    const departmentId = toText(item.departmentId)
    if (!departmentId || seen.has(departmentId))
      continue
    seen.add(departmentId)
    result.push({
      departmentId,
      name: toText(item.name) || departmentId,
      parentDepartmentId: toText(item.parentDepartmentId) || null,
    })
  }
  return result
}

function toUserDepartmentIdsRecord(source: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(source || {}).map(([unionId, departmentIds]) => [
      toText(unionId),
      [...new Set((departmentIds || []).map(item => toText(item)).filter(Boolean))].sort(),
    ]).filter(([unionId]) => Boolean(unionId)),
  )
}

function getDirectoryCacheState(): FeishuDirectoryCacheState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[FEISHU_DIRECTORY_CACHE_KEY] as FeishuDirectoryCacheState | undefined
  if (existing)
    return existing

  const created: FeishuDirectoryCacheState = {
    entries: new Map(),
    inflight: new Map(),
  }
  globalRef[FEISHU_DIRECTORY_CACHE_KEY] = created
  return created
}

function buildDirectoryCacheKey(config: FeishuIntegrationConfigInternal): string {
  const appId = toText(config.appId)
  const groupIds = [...new Set((config.adminGroupIds || []).map(item => toText(item)).filter(Boolean))].sort()
  return `${appId}::${groupIds.join(',')}`
}

function resolveTtlMs(value: FeishuDirectorySnapshotCached, defaultTtlMs: number): number {
  const hasFailureNotice = toText(value.notice).includes('失败')
  if (hasFailureNotice && value.users.length === 0)
    return 15_000
  return defaultTtlMs
}

function toFallbackProfile(unionId: string): FeishuOAuthLoginProfile {
  return {
    unionId,
    openId: '',
    name: '',
    enName: '',
    avatarUrl: '',
    email: '',
    mobile: '',
  }
}

function toFallbackDirectory(users: FeishuOAuthLoginProfile[]): Pick<FeishuTenantDirectory, 'users' | 'departments' | 'rootDepartmentId' | 'userDepartmentIds'> {
  return {
    users,
    departments: [],
    rootDepartmentId: '',
    userDepartmentIds: {},
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.min(16, Number(concurrency || 1)))
  const results = Array.from({ length: items.length }) as R[]
  let cursor = 0

  await Promise.all(Array.from({ length: Math.min(safeConcurrency, items.length) }).map(async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length)
        return
      results[index] = await mapper(items[index]!, index)
    }
  }))

  return results
}

async function loadDirectorySnapshotFromRemote(input: {
  config: FeishuIntegrationConfigInternal
  maxUsers: number
}): Promise<FeishuDirectorySnapshotCached> {
  const tenantAccessToken = await getFeishuTenantAccessToken(input.config)
  const fetchedAt = new Date().toISOString()

  try {
    const tenantDirectory = await listFeishuTenantDirectory({
      tenantAccessToken,
      maxUsers: input.maxUsers,
    })
    const normalizedTenantUsers = toUniqueProfiles(tenantDirectory.users)
    if (normalizedTenantUsers.length > 0) {
      return {
        users: normalizedTenantUsers,
        departments: toUniqueDepartments(tenantDirectory.departments),
        rootDepartmentId: toText(tenantDirectory.rootDepartmentId),
        userDepartmentIds: toUserDepartmentIdsRecord(tenantDirectory.userDepartmentIds),
        source: 'tenant',
        notice: '',
        fetchedAt,
      }
    }
  }
  catch (error) {
    const message = toErrorMessage(error)
    if (!input.config.adminGroupIds.length) {
      return {
        users: [],
        departments: [],
        rootDepartmentId: '',
        userDepartmentIds: {},
        source: 'tenant',
        notice: `飞书全员目录检索失败：${message}`,
        fetchedAt,
      }
    }

    const fallbackUsers = await loadDirectorySnapshotFromAdminGroups({
      config: input.config,
      tenantAccessToken,
    })
    return {
      ...toFallbackDirectory(fallbackUsers),
      source: 'group_fallback',
      notice: `全员目录不可用，已降级为管理员组目录：${message}`,
      fetchedAt,
    }
  }

  if (input.config.adminGroupIds.length) {
    const fallbackUsers = await loadDirectorySnapshotFromAdminGroups({
      config: input.config,
      tenantAccessToken,
    })
    return {
      ...toFallbackDirectory(fallbackUsers),
      source: 'group_fallback',
      notice: '全员目录为空，已降级为管理员组目录。',
      fetchedAt,
    }
  }

  return {
    users: [],
    departments: [],
    rootDepartmentId: '',
    userDepartmentIds: {},
    source: 'tenant',
    notice: '飞书目录为空，请检查应用权限或目录可见范围。',
    fetchedAt,
  }
}

async function loadDirectorySnapshotFromAdminGroups(input: {
  config: FeishuIntegrationConfigInternal
  tenantAccessToken: string
}): Promise<FeishuOAuthLoginProfile[]> {
  const groupUnionIds = await listFeishuGroupMemberUnionIds({
    config: input.config,
    tenantAccessToken: input.tenantAccessToken,
    groupIds: input.config.adminGroupIds,
  })
  const unionIds = [...new Set(groupUnionIds.map(item => toText(item)).filter(Boolean))]
  if (!unionIds.length)
    return []

  const profiles = await mapWithConcurrency(unionIds, 8, async (unionId) => {
    const profile = await getFeishuUserByUnionId({
      config: input.config,
      tenantAccessToken: input.tenantAccessToken,
      unionId,
    }).catch(() => null)
    return profile || toFallbackProfile(unionId)
  })
  return toUniqueProfiles(profiles)
}

export async function getFeishuDirectorySnapshot(input: {
  config: FeishuIntegrationConfigInternal
  forceRefresh?: boolean
  maxUsers?: number
  ttlMs?: number
}): Promise<FeishuDirectorySnapshotResponse> {
  const forceRefresh = Boolean(input.forceRefresh)
  const ttlMs = Math.max(60_000, Math.min(60 * 60 * 1000, Number(input.ttlMs || DEFAULT_DIRECTORY_CACHE_TTL_MS)))
  const maxUsers = Math.max(100, Math.min(20_000, Number(input.maxUsers || DEFAULT_MAX_DIRECTORY_USERS)))
  const cacheKey = buildDirectoryCacheKey(input.config)
  const state = getDirectoryCacheState()
  const now = Date.now()
  const cached = state.entries.get(cacheKey)

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return {
      ...cached.value,
      fromCache: true,
      cacheExpiresAt: new Date(cached.expiresAt).toISOString(),
    }
  }

  const active = state.inflight.get(cacheKey)
  if (active) {
    const value = await active
    const expiresAt = Date.now() + resolveTtlMs(value, ttlMs)
    state.entries.set(cacheKey, {
      expiresAt,
      value,
    })
    return {
      ...value,
      fromCache: false,
      cacheExpiresAt: new Date(expiresAt).toISOString(),
    }
  }

  const promise = loadDirectorySnapshotFromRemote({
    config: input.config,
    maxUsers,
  }).finally(() => {
    state.inflight.delete(cacheKey)
  })
  state.inflight.set(cacheKey, promise)

  const value = await promise
  const expiresAt = Date.now() + resolveTtlMs(value, ttlMs)
  state.entries.set(cacheKey, {
    expiresAt,
    value,
  })
  return {
    ...value,
    fromCache: false,
    cacheExpiresAt: new Date(expiresAt).toISOString(),
  }
}
