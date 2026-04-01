import type { FeishuIntegrationConfigInternal } from '~~/server/utils/feishu-integration-store'

const DEFAULT_FEISHU_API_BASE_URL = 'https://open.feishu.cn'
const DEFAULT_GROUP_MEMBER_PAGE_SIZE = 200
const DEFAULT_CONTACT_PAGE_SIZE = 50

interface FeishuApiEnvelope<T> {
  code?: number
  msg?: string
  message?: string
  data?: T
}

interface OAuthAccessTokenData {
  access_token?: string
  user_access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  open_id?: string
  union_id?: string
}

interface UserInfoData {
  name?: string
  en_name?: string
  avatar_url?: string
  open_id?: string
  union_id?: string
  email?: string
  mobile?: string
}

interface ContactUserData {
  user?: {
    user_id?: string
    open_id?: string
    union_id?: string
    name?: string
    en_name?: string
    email?: string
    mobile?: string
    avatar?: {
      avatar_72?: string
      avatar_240?: string
      avatar_origin?: string
    }
  }
}

interface GroupMemberItem {
  member_id?: string
  user_id?: string
  open_id?: string
  union_id?: string
}

interface GroupMembersData {
  has_more?: boolean
  page_token?: string
  items?: GroupMemberItem[]
}

interface DepartmentItem {
  department_id?: string
  open_department_id?: string
  parent_department_id?: string
  open_parent_department_id?: string
  name?: string
  en_name?: string
  i18n_name?: {
    zh_cn?: string
    en_us?: string
  }
}

interface DepartmentChildrenData {
  has_more?: boolean
  page_token?: string
  items?: DepartmentItem[]
}

interface DepartmentUserItem {
  user_id?: string
  open_id?: string
  union_id?: string
  name?: string
  en_name?: string
  email?: string
  mobile?: string
  avatar?: {
    avatar_72?: string
    avatar_240?: string
    avatar_origin?: string
  }
}

interface DepartmentUsersData {
  has_more?: boolean
  page_token?: string
  items?: DepartmentUserItem[]
}

type DepartmentIdType = 'open_department_id' | 'department_id'

interface BitableListRecordsData {
  has_more?: boolean
  page_token?: string
  total?: number
  items?: Array<{
    record_id?: string
    fields?: Record<string, unknown>
  }>
}

interface BitableListAppsData {
  has_more?: boolean
  page_token?: string
  items?: Array<{
    app_token?: string
    name?: string
  }>
}

interface BitableListTablesData {
  has_more?: boolean
  page_token?: string
  items?: Array<{
    table_id?: string
    name?: string
  }>
}

interface BitableListViewsData {
  has_more?: boolean
  page_token?: string
  items?: Array<{
    view_id?: string
    view_name?: string
    name?: string
  }>
}

interface BitableGetRecordData {
  record?: {
    record_id?: string
    fields?: Record<string, unknown>
  }
}

interface FeishuWikiNodeData {
  node?: {
    obj_type?: string
    obj_token?: string
  }
}

interface FeishuImMessageData {
  message_id?: string
}

function normalizeBaseUrl(raw: string): string {
  const value = String(raw || '').trim().replace(/\/+$/g, '')
  return value || DEFAULT_FEISHU_API_BASE_URL
}

function toQueryString(query?: Record<string, string | number | boolean | undefined | null>): string {
  if (!query)
    return ''
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '')
      continue
    searchParams.set(key, String(value))
  }
  const text = searchParams.toString()
  return text ? `?${text}` : ''
}

function toErrorMessage(raw: unknown): string {
  if (raw instanceof Error)
    return raw.message || 'UNKNOWN_FEISHU_ERROR'
  return String(raw || 'UNKNOWN_FEISHU_ERROR')
}

function isFieldValidationError(raw: unknown): boolean {
  const message = toErrorMessage(raw).toLowerCase()
  if (!message)
    return false
  return message.includes('field validation failed')
    || message.includes('invalid param')
    || message.includes('invalid parameter')
    || message.includes('参数')
}

function shouldRetryWithAlternateDepartmentIdType(raw: unknown): boolean {
  const message = toErrorMessage(raw).toLowerCase()
  if (!message)
    return false
  return isFieldValidationError(raw)
    || message.includes('department not exist')
    || message.includes('department is not exist')
    || message.includes('dept authority')
    || message.includes('no dept authority')
    || message.includes('not found')
}

function hasOwn(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

async function parseEnvelope<T>(response: Response): Promise<FeishuApiEnvelope<T>> {
  try {
    return await response.json() as FeishuApiEnvelope<T>
  }
  catch {
    return {}
  }
}

async function requestFeishu<T>(input: {
  baseUrl: string
  path: string
  method?: 'GET' | 'POST'
  bearerToken?: string
  body?: Record<string, unknown>
  query?: Record<string, string | number | boolean | undefined | null>
}): Promise<T> {
  const method = input.method || 'GET'
  const url = `${normalizeBaseUrl(input.baseUrl)}${input.path}${toQueryString(input.query)}`
  const headers: Record<string, string> = {
    accept: 'application/json',
  }

  if (input.bearerToken)
    headers.authorization = `Bearer ${input.bearerToken}`
  if (method === 'POST')
    headers['content-type'] = 'application/json; charset=utf-8'

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(input.body || {}) : undefined,
  })

  if (!response.ok) {
    const envelope = await parseEnvelope<T>(response)
    const remoteMessage = String(envelope.msg || envelope.message || '')
    const fallbackMessage = `FEISHU_HTTP_${response.status}`
    const baseMessage = remoteMessage || fallbackMessage
    if (baseMessage.toLowerCase().includes('field validation failed'))
      throw new Error(`${baseMessage} (${input.path})`)
    throw new Error(baseMessage)
  }

  const envelope = await parseEnvelope<T>(response)
  const code = Number(envelope.code || 0)
  if (code !== 0) {
    const message = String(envelope.msg || envelope.message || '')
    const fallbackMessage = `FEISHU_API_${code}`
    const baseMessage = message || fallbackMessage
    if (baseMessage.toLowerCase().includes('field validation failed'))
      throw new Error(`${baseMessage} (${input.path})`)
    throw new Error(baseMessage)
  }

  if (hasOwn(envelope, 'data'))
    return (envelope.data || {}) as T

  // Some Feishu APIs (e.g. tenant token) return payload fields at top-level, not inside data.
  const rawEnvelope = envelope as unknown as Record<string, unknown>
  const rawPayload: Record<string, unknown> = {
    ...rawEnvelope,
  }
  delete rawPayload.code
  delete rawPayload.msg
  delete rawPayload.message
  return rawPayload as T
}

function resolveOAuthRedirectUri(config: FeishuIntegrationConfigInternal, requestOrigin = ''): string {
  const explicit = String(config.oauthRedirectUri || '').trim()
  if (explicit)
    return explicit
  const origin = String(requestOrigin || '').trim().replace(/\/+$/g, '')
  if (!origin)
    return ''
  return `${origin}/api/auth/feishu/callback`
}

export interface FeishuOAuthLoginProfile {
  unionId: string
  openId: string
  name: string
  enName: string
  avatarUrl: string
  email: string
  mobile: string
}

export interface FeishuTenantDirectoryDepartment {
  departmentId: string
  name: string
  parentDepartmentId: string | null
}

export interface FeishuTenantDirectory {
  users: FeishuOAuthLoginProfile[]
  departments: FeishuTenantDirectoryDepartment[]
  rootDepartmentId: string
  userDepartmentIds: Record<string, string[]>
  notice?: string
}

export interface FeishuBitableRecord {
  recordId: string
  fields: Record<string, unknown>
}

export function buildFeishuAuthorizeUrl(input: {
  config: FeishuIntegrationConfigInternal
  state: string
  requestOrigin?: string
  redirectUri?: string
}): string {
  const redirectUri = String(input.redirectUri || '').trim() || resolveOAuthRedirectUri(input.config, input.requestOrigin || '')
  if (!redirectUri)
    throw new Error('FEISHU_REDIRECT_URI_REQUIRED')
  if (!input.config.appId)
    throw new Error('FEISHU_APP_ID_REQUIRED')

  const query = toQueryString({
    app_id: input.config.appId,
    redirect_uri: redirectUri,
    state: input.state,
  })
  return `${DEFAULT_FEISHU_API_BASE_URL}/open-apis/authen/v1/authorize${query}`
}

export async function getFeishuTenantAccessToken(config: FeishuIntegrationConfigInternal): Promise<string> {
  if (!config.appId || !config.appSecret)
    throw new Error('FEISHU_APP_CONFIG_INCOMPLETE')
  const data = await requestFeishu<{ tenant_access_token?: string }>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/auth/v3/tenant_access_token/internal',
    method: 'POST',
    body: {
      app_id: config.appId,
      app_secret: config.appSecret,
    },
  })
  const token = String(data.tenant_access_token || '').trim()
  if (!token)
    throw new Error('FEISHU_TENANT_TOKEN_EMPTY')
  return token
}

export async function getFeishuWikiNodeInfo(input: {
  tenantAccessToken: string
  token: string
}): Promise<{ objType: string, objToken: string } | null> {
  const token = String(input.token || '').trim()
  if (!token)
    return null

  const data = await requestFeishu<FeishuWikiNodeData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/wiki/v2/spaces/get_node',
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      token,
    },
  })

  const node = data.node || {}
  const objType = String(node.obj_type || '').trim()
  const objToken = String(node.obj_token || '').trim()
  if (!objType && !objToken)
    return null
  return {
    objType,
    objToken,
  }
}

export async function sendFeishuChatTextMessage(input: {
  tenantAccessToken: string
  chatId: string
  text: string
}): Promise<void> {
  const chatId = String(input.chatId || '').trim()
  const text = String(input.text || '').trim()
  if (!chatId)
    throw new Error('FEISHU_CHAT_ID_REQUIRED')
  if (!text)
    throw new Error('FEISHU_MESSAGE_EMPTY')

  await requestFeishu<FeishuImMessageData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/im/v1/messages',
    method: 'POST',
    bearerToken: input.tenantAccessToken,
    query: {
      receive_id_type: 'chat_id',
    },
    body: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({
        text,
      }),
    },
  })
}

async function exchangeOAuthCode(config: FeishuIntegrationConfigInternal, code: string): Promise<OAuthAccessTokenData> {
  if (!code)
    throw new Error('FEISHU_OAUTH_CODE_REQUIRED')
  if (!config.appId || !config.appSecret)
    throw new Error('FEISHU_APP_CONFIG_INCOMPLETE')

  try {
    return await requestFeishu<OAuthAccessTokenData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: '/open-apis/authen/v2/oauth/token',
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        app_id: config.appId,
        app_secret: config.appSecret,
      },
    })
  }
  catch (error) {
    const message = toErrorMessage(error)
    if (!message.includes('404') && !message.includes('NOT_FOUND'))
      throw error
    return requestFeishu<OAuthAccessTokenData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: '/open-apis/authen/v1/access_token',
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
      },
    })
  }
}

export async function getFeishuOAuthProfile(input: {
  config: FeishuIntegrationConfigInternal
  code: string
}): Promise<FeishuOAuthLoginProfile> {
  const tokenData = await exchangeOAuthCode(input.config, input.code)
  const userAccessToken = String(tokenData.access_token || tokenData.user_access_token || '').trim()
  if (!userAccessToken)
    throw new Error('FEISHU_USER_ACCESS_TOKEN_EMPTY')

  const userInfo = await requestFeishu<UserInfoData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/authen/v1/user_info',
    method: 'GET',
    bearerToken: userAccessToken,
  })

  const unionId = String(userInfo.union_id || tokenData.union_id || '').trim()
  if (!unionId)
    throw new Error('FEISHU_UNION_ID_EMPTY')

  return {
    unionId,
    openId: String(userInfo.open_id || tokenData.open_id || '').trim(),
    name: String(userInfo.name || '').trim(),
    enName: String(userInfo.en_name || '').trim(),
    avatarUrl: String(userInfo.avatar_url || '').trim(),
    email: String(userInfo.email || '').trim(),
    mobile: String(userInfo.mobile || '').trim(),
  }
}

export async function getFeishuUserByUnionId(input: {
  config: FeishuIntegrationConfigInternal
  tenantAccessToken: string
  unionId: string
}): Promise<FeishuOAuthLoginProfile | null> {
  const normalizedUnionId = String(input.unionId || '').trim()
  if (!normalizedUnionId)
    return null

  const data = await requestFeishu<ContactUserData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: `/open-apis/contact/v3/users/${encodeURIComponent(normalizedUnionId)}`,
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      user_id_type: 'union_id',
    },
  }).catch(() => null)

  const user = data?.user
  if (!user)
    return null

  return {
    unionId: String(user.union_id || normalizedUnionId).trim(),
    openId: String(user.open_id || '').trim(),
    name: String(user.name || '').trim(),
    enName: String(user.en_name || '').trim(),
    avatarUrl: String(user.avatar?.avatar_origin || user.avatar?.avatar_240 || user.avatar?.avatar_72 || '').trim(),
    email: String(user.email || '').trim(),
    mobile: String(user.mobile || '').trim(),
  }
}

async function listGroupMembersOnce(input: {
  tenantAccessToken: string
  groupId: string
  pageToken?: string
  useFallbackPath?: boolean
}): Promise<GroupMembersData> {
  const path = input.useFallbackPath
    ? `/open-apis/contact/v3/user_groups/${encodeURIComponent(input.groupId)}/members`
    : `/open-apis/contact/v3/group/${encodeURIComponent(input.groupId)}/members`

  return requestFeishu<GroupMembersData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path,
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      page_size: DEFAULT_GROUP_MEMBER_PAGE_SIZE,
      page_token: input.pageToken || '',
      member_id_type: 'union_id',
    },
  })
}

function toMemberUnionId(item: GroupMemberItem): string {
  return String(item?.union_id || item?.member_id || item?.open_id || item?.user_id || '').trim()
}

function toDepartmentId(item: DepartmentItem): string {
  return String(item?.open_department_id || item?.department_id || '').trim()
}

function toDepartmentName(item: DepartmentItem): string {
  return String(item?.name || item?.i18n_name?.zh_cn || item?.en_name || item?.i18n_name?.en_us || '').trim()
}

function toParentDepartmentId(item: DepartmentItem): string | null {
  return String(item?.parent_department_id || item?.open_parent_department_id || '').trim() || null
}

function toProfileFromDepartmentUser(item: DepartmentUserItem): FeishuOAuthLoginProfile | null {
  const unionId = String(item.union_id || '').trim()
  if (!unionId)
    return null
  return {
    unionId,
    openId: String(item.open_id || '').trim(),
    name: String(item.name || '').trim(),
    enName: String(item.en_name || '').trim(),
    avatarUrl: String(item.avatar?.avatar_origin || item.avatar?.avatar_240 || item.avatar?.avatar_72 || '').trim(),
    email: String(item.email || '').trim(),
    mobile: String(item.mobile || '').trim(),
  }
}

export async function listFeishuGroupMemberUnionIds(input: {
  config: FeishuIntegrationConfigInternal
  tenantAccessToken: string
  groupIds: string[]
}): Promise<string[]> {
  const normalizedGroupIds = Array.from(new Set(input.groupIds.map(item => String(item || '').trim()).filter(Boolean)))
  if (normalizedGroupIds.length === 0)
    return []

  const unionIds = new Set<string>()

  for (const groupId of normalizedGroupIds) {
    let pageToken = ''
    let hasMore = true
    let useFallbackPath = false

    while (hasMore) {
      const data = await listGroupMembersOnce({
        tenantAccessToken: input.tenantAccessToken,
        groupId,
        pageToken,
        useFallbackPath,
      }).catch(async (error) => {
        const message = toErrorMessage(error)
        if (useFallbackPath || (!message.includes('404') && !message.includes('NOT_FOUND')))
          throw error
        useFallbackPath = true
        return listGroupMembersOnce({
          tenantAccessToken: input.tenantAccessToken,
          groupId,
          pageToken,
          useFallbackPath,
        })
      })

      for (const item of (data.items || [])) {
        const unionId = toMemberUnionId(item)
        if (unionId)
          unionIds.add(unionId)
      }

      hasMore = Boolean(data.has_more)
      pageToken = String(data.page_token || '').trim()
      if (hasMore && !pageToken)
        hasMore = false
    }
  }

  return [...unionIds]
}

async function listDepartmentChildrenOnce(input: {
  tenantAccessToken: string
  departmentId: string
  departmentIdType: DepartmentIdType
  pageToken?: string
}): Promise<DepartmentChildrenData> {
  return requestFeishu<DepartmentChildrenData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: `/open-apis/contact/v3/departments/${encodeURIComponent(input.departmentId)}/children`,
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      department_id_type: input.departmentIdType,
      page_size: DEFAULT_CONTACT_PAGE_SIZE,
      page_token: input.pageToken || '',
    },
  })
}

async function listDepartmentsByParentOnce(input: {
  tenantAccessToken: string
  parentDepartmentId: string
  departmentIdType: DepartmentIdType
  pageToken?: string
}): Promise<DepartmentChildrenData> {
  return requestFeishu<DepartmentChildrenData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/contact/v3/departments',
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      parent_department_id: input.parentDepartmentId,
      department_id_type: input.departmentIdType,
      fetch_child: false,
      page_size: DEFAULT_CONTACT_PAGE_SIZE,
      page_token: input.pageToken || '',
    },
  })
}

async function listDepartmentUsersOnce(input: {
  tenantAccessToken: string
  departmentId: string
  departmentIdType: DepartmentIdType
  pageToken?: string
}): Promise<DepartmentUsersData> {
  return requestFeishu<DepartmentUsersData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/contact/v3/users',
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      department_id: input.departmentId,
      department_id_type: input.departmentIdType,
      user_id_type: 'union_id',
      page_size: DEFAULT_CONTACT_PAGE_SIZE,
      page_token: input.pageToken || '',
    },
  })
}

async function listDepartmentUsersWithFallback(input: {
  tenantAccessToken: string
  departmentId: string
  pageToken?: string
}): Promise<DepartmentUsersData> {
  const normalizedDepartmentId = String(input.departmentId || '').trim()
  const preferredType: DepartmentIdType = normalizedDepartmentId === '0'
    ? 'department_id'
    : 'open_department_id'
  const alternateType: DepartmentIdType = preferredType === 'department_id'
    ? 'open_department_id'
    : 'department_id'

  try {
    return await listDepartmentUsersOnce({
      ...input,
      departmentIdType: preferredType,
    })
  }
  catch (error) {
    if (!shouldRetryWithAlternateDepartmentIdType(error))
      throw error
    return listDepartmentUsersOnce({
      ...input,
      departmentIdType: alternateType,
    })
  }
}

async function listUsersDirectlyOnce(input: {
  tenantAccessToken: string
  pageToken?: string
}): Promise<DepartmentUsersData> {
  return requestFeishu<DepartmentUsersData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: '/open-apis/contact/v3/users',
    method: 'GET',
    bearerToken: input.tenantAccessToken,
    query: {
      user_id_type: 'union_id',
      page_size: DEFAULT_CONTACT_PAGE_SIZE,
      page_token: input.pageToken || '',
    },
  })
}

async function listFeishuUsersDirectlyByPaging(input: {
  tenantAccessToken: string
  maxUsers: number
}): Promise<FeishuOAuthLoginProfile[]> {
  const users = new Map<string, FeishuOAuthLoginProfile>()
  let pageToken = ''
  let hasMore = true

  while (hasMore && users.size < input.maxUsers) {
    const data = await listUsersDirectlyOnce({
      tenantAccessToken: input.tenantAccessToken,
      pageToken,
    })

    for (const item of (data.items || [])) {
      const profile = toProfileFromDepartmentUser(item)
      if (!profile)
        continue
      if (!users.has(profile.unionId))
        users.set(profile.unionId, profile)
    }

    hasMore = Boolean(data.has_more)
    pageToken = String(data.page_token || '').trim()
    if (hasMore && !pageToken)
      hasMore = false
  }

  return [...users.values()]
}

function appendProfilesToMap(
  target: Map<string, FeishuOAuthLoginProfile>,
  profiles: FeishuOAuthLoginProfile[],
): void {
  for (const profile of profiles) {
    if (!profile?.unionId || target.has(profile.unionId))
      continue
    target.set(profile.unionId, profile)
  }
}

function appendUserDepartmentId(
  target: Map<string, Set<string>>,
  unionId: string,
  departmentId: string,
): void {
  const normalizedUnionId = String(unionId || '').trim()
  const normalizedDepartmentId = String(departmentId || '').trim()
  if (!normalizedUnionId || !normalizedDepartmentId)
    return

  let bucket = target.get(normalizedUnionId)
  if (!bucket) {
    bucket = new Set<string>()
    target.set(normalizedUnionId, bucket)
  }
  bucket.add(normalizedDepartmentId)
}

function upsertDepartment(
  target: Map<string, FeishuTenantDirectoryDepartment>,
  input: {
    departmentId: string
    name?: string
    parentDepartmentId?: string | null
  },
): void {
  const departmentId = String(input.departmentId || '').trim()
  if (!departmentId)
    return

  const previous = target.get(departmentId)
  target.set(departmentId, {
    departmentId,
    name: String(input.name || previous?.name || '').trim() || departmentId,
    parentDepartmentId: input.parentDepartmentId === undefined
      ? (previous?.parentDepartmentId ?? null)
      : (String(input.parentDepartmentId || '').trim() || null),
  })
}

function toUserDepartmentIdsRecord(source: Map<string, Set<string>>): Record<string, string[]> {
  return Object.fromEntries(
    [...source.entries()].map(([unionId, departmentIds]) => [unionId, [...departmentIds].sort()]),
  )
}

async function listFeishuTenantDirectoryByDepartments(input: {
  tenantAccessToken: string
  maxUsers: number
  rootDepartmentId: string
}): Promise<{
  users: FeishuOAuthLoginProfile[]
  departments: FeishuTenantDirectoryDepartment[]
  userDepartmentIds: Record<string, string[]>
}> {
  const queue: string[] = [input.rootDepartmentId]
  const visited = new Set<string>()
  const users = new Map<string, FeishuOAuthLoginProfile>()
  const departments = new Map<string, FeishuTenantDirectoryDepartment>()
  const userDepartmentIds = new Map<string, Set<string>>()

  upsertDepartment(departments, {
    departmentId: input.rootDepartmentId,
    name: '飞书组织',
    parentDepartmentId: null,
  })

  while (queue.length > 0 && users.size < input.maxUsers) {
    const departmentId = String(queue.shift() || '').trim()
    if (!departmentId || visited.has(departmentId))
      continue
    visited.add(departmentId)

    let userPageToken = ''
    let userHasMore = true
    while (userHasMore && users.size < input.maxUsers) {
      const data = await listDepartmentUsersWithFallback({
        tenantAccessToken: input.tenantAccessToken,
        departmentId,
        pageToken: userPageToken,
      })

      for (const item of (data.items || [])) {
        const profile = toProfileFromDepartmentUser(item)
        if (!profile)
          continue
        if (!users.has(profile.unionId))
          users.set(profile.unionId, profile)
        appendUserDepartmentId(userDepartmentIds, profile.unionId, departmentId)
      }

      userHasMore = Boolean(data.has_more)
      userPageToken = String(data.page_token || '').trim()
      if (userHasMore && !userPageToken)
        userHasMore = false
    }

    let childPageToken = ''
    let childHasMore = true
    while (childHasMore) {
      const data = await listDepartmentChildrenWithFallback({
        tenantAccessToken: input.tenantAccessToken,
        departmentId,
        pageToken: childPageToken,
      })

      for (const item of (data.items || [])) {
        const childDepartmentId = toDepartmentId(item)
        if (childDepartmentId) {
          upsertDepartment(departments, {
            departmentId: childDepartmentId,
            name: toDepartmentName(item),
            parentDepartmentId: toParentDepartmentId(item) || departmentId,
          })
        }
        if (childDepartmentId && !visited.has(childDepartmentId))
          queue.push(childDepartmentId)
      }

      childHasMore = Boolean(data.has_more)
      childPageToken = String(data.page_token || '').trim()
      if (childHasMore && !childPageToken)
        childHasMore = false
    }
  }

  return {
    users: [...users.values()],
    departments: [...departments.values()],
    userDepartmentIds: toUserDepartmentIdsRecord(userDepartmentIds),
  }
}

async function listDepartmentChildrenWithFallback(input: {
  tenantAccessToken: string
  departmentId: string
  pageToken?: string
}): Promise<DepartmentChildrenData> {
  const normalizedDepartmentId = String(input.departmentId || '').trim()
  const preferredType: DepartmentIdType = normalizedDepartmentId === '0'
    ? 'department_id'
    : 'open_department_id'
  const alternateType: DepartmentIdType = preferredType === 'department_id'
    ? 'open_department_id'
    : 'department_id'

  if (normalizedDepartmentId === '0') {
    try {
      return await listDepartmentsByParentOnce({
        tenantAccessToken: input.tenantAccessToken,
        parentDepartmentId: normalizedDepartmentId,
        departmentIdType: preferredType,
        pageToken: input.pageToken,
      })
    }
    catch (error) {
      if (!shouldRetryWithAlternateDepartmentIdType(error))
        throw error
      return listDepartmentsByParentOnce({
        tenantAccessToken: input.tenantAccessToken,
        parentDepartmentId: normalizedDepartmentId,
        departmentIdType: alternateType,
        pageToken: input.pageToken,
      })
    }
  }

  try {
    return await listDepartmentChildrenOnce({
      ...input,
      departmentIdType: preferredType,
    })
  }
  catch (error) {
    if (!shouldRetryWithAlternateDepartmentIdType(error))
      throw error
    return listDepartmentChildrenOnce({
      ...input,
      departmentIdType: alternateType,
    })
  }
}

export async function listFeishuTenantDirectory(input: {
  tenantAccessToken: string
  maxUsers?: number
  rootDepartmentId?: string
}): Promise<FeishuTenantDirectory> {
  const rootDepartmentId = String(input.rootDepartmentId || '0').trim() || '0'
  const maxUsers = Math.max(50, Math.min(20_000, Number(input.maxUsers || 3000)))
  const users = new Map<string, FeishuOAuthLoginProfile>()
  let departments: FeishuTenantDirectoryDepartment[] = [{
    departmentId: rootDepartmentId,
    name: '飞书组织',
    parentDepartmentId: null,
  }]
  let userDepartmentIds: Record<string, string[]> = {}
  let directUsersError: unknown = null
  let departmentDirectoryError: unknown = null
  let notice = ''

  try {
    const directUsers = await listFeishuUsersDirectlyByPaging({
      tenantAccessToken: input.tenantAccessToken,
      maxUsers,
    })
    appendProfilesToMap(users, directUsers)
  }
  catch (error) {
    directUsersError = error
  }

  try {
    const directory = await listFeishuTenantDirectoryByDepartments({
      tenantAccessToken: input.tenantAccessToken,
      maxUsers,
      rootDepartmentId,
    })
    appendProfilesToMap(users, directory.users)
    departments = directory.departments
    userDepartmentIds = directory.userDepartmentIds
  }
  catch (error) {
    departmentDirectoryError = error
    notice = `部门树加载失败：${toErrorMessage(error)}`
    if (!users.size)
      throw error
  }

  if (!users.size && directUsersError) {
    if (departmentDirectoryError)
      throw departmentDirectoryError
    throw directUsersError
  }

  return {
    users: [...users.values()],
    departments,
    rootDepartmentId,
    userDepartmentIds,
    notice,
  }
}

export async function listFeishuTenantUsers(input: {
  tenantAccessToken: string
  maxUsers?: number
  rootDepartmentId?: string
}): Promise<FeishuOAuthLoginProfile[]> {
  const directory = await listFeishuTenantDirectory(input)
  return directory.users
}

export async function listFeishuBitableRecords(input: {
  tenantAccessToken: string
  appToken: string
  tableId: string
  viewId?: string
}): Promise<FeishuBitableRecord[]> {
  const appToken = String(input.appToken || '').trim()
  const tableId = String(input.tableId || '').trim()
  if (!appToken || !tableId)
    return []

  const records: FeishuBitableRecord[] = []
  let pageToken = ''
  let hasMore = true

  while (hasMore) {
    const data = await requestFeishu<BitableListRecordsData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      method: 'GET',
      bearerToken: input.tenantAccessToken,
      query: {
        page_size: 500,
        page_token: pageToken || '',
        view_id: String(input.viewId || '').trim(),
      },
    })

    for (const item of (data.items || [])) {
      const recordId = String(item.record_id || '').trim()
      if (!recordId)
        continue
      records.push({
        recordId,
        fields: item.fields || {},
      })
    }

    hasMore = Boolean(data.has_more)
    pageToken = String(data.page_token || '').trim()
    if (hasMore && !pageToken)
      hasMore = false
  }

  return records
}

export async function getFeishuBitableRecordById(input: {
  tenantAccessToken: string
  appToken: string
  tableId: string
  recordId: string
}): Promise<FeishuBitableRecord | null> {
  const appToken = String(input.appToken || '').trim()
  const tableId = String(input.tableId || '').trim()
  const recordId = String(input.recordId || '').trim()
  if (!appToken || !tableId || !recordId)
    return null

  const data = await requestFeishu<BitableGetRecordData>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`,
    method: 'GET',
    bearerToken: input.tenantAccessToken,
  }).catch(() => null)

  const record = data?.record
  const normalizedId = String(record?.record_id || '').trim()
  if (!normalizedId)
    return null

  return {
    recordId: normalizedId,
    fields: record?.fields || {},
  }
}

export async function listFeishuBitableRecordsByIds(input: {
  tenantAccessToken: string
  appToken: string
  tableId: string
  recordIds: string[]
}): Promise<FeishuBitableRecord[]> {
  const recordIds = [...new Set((input.recordIds || []).map(item => String(item || '').trim()).filter(Boolean))]
  if (!recordIds.length)
    return []

  const records: FeishuBitableRecord[] = []
  for (const recordId of recordIds) {
    const record = await getFeishuBitableRecordById({
      tenantAccessToken: input.tenantAccessToken,
      appToken: input.appToken,
      tableId: input.tableId,
      recordId,
    })
    if (record)
      records.push(record)
  }
  return records
}

export async function batchUpdateFeishuBitableRecords(input: {
  tenantAccessToken: string
  appToken: string
  tableId: string
  records: Array<{ recordId: string, fields: Record<string, unknown> }>
}): Promise<void> {
  const appToken = String(input.appToken || '').trim()
  const tableId = String(input.tableId || '').trim()
  if (!appToken || !tableId)
    return

  const records = (input.records || [])
    .map(item => ({
      record_id: String(item.recordId || '').trim(),
      fields: item.fields || {},
    }))
    .filter(item => Boolean(item.record_id))
  if (!records.length)
    return

  await requestFeishu<Record<string, unknown>>({
    baseUrl: DEFAULT_FEISHU_API_BASE_URL,
    path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_update`,
    method: 'POST',
    bearerToken: input.tenantAccessToken,
    body: {
      records,
    },
  })
}

export async function listFeishuBitableApps(input: {
  tenantAccessToken: string
  keyword?: string
  limit?: number
}): Promise<Array<{ appToken: string, name: string }>> {
  const keyword = String(input.keyword || '').trim()
  const limit = Math.max(1, Math.min(100, Number(input.limit || 20)))
  let pageToken = ''
  let hasMore = true
  const apps: Array<{ appToken: string, name: string }> = []

  while (hasMore && apps.length < limit) {
    const data = await requestFeishu<BitableListAppsData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: '/open-apis/bitable/v1/apps',
      method: 'GET',
      bearerToken: input.tenantAccessToken,
      query: {
        page_size: 100,
        page_token: pageToken || '',
      },
    })

    for (const item of (data.items || [])) {
      const appToken = String(item.app_token || '').trim()
      const name = String(item.name || '').trim()
      if (!appToken)
        continue
      if (keyword && !(`${appToken} ${name}`.toLowerCase().includes(keyword.toLowerCase())))
        continue
      apps.push({
        appToken,
        name: name || appToken,
      })
      if (apps.length >= limit)
        break
    }

    hasMore = Boolean(data.has_more)
    pageToken = String(data.page_token || '').trim()
    if (hasMore && !pageToken)
      hasMore = false
  }

  return apps
}

export async function listFeishuBitableTables(input: {
  tenantAccessToken: string
  appToken: string
}): Promise<Array<{ tableId: string, name: string }>> {
  const appToken = String(input.appToken || '').trim()
  if (!appToken)
    return []
  let pageToken = ''
  let hasMore = true
  const tables: Array<{ tableId: string, name: string }> = []

  while (hasMore) {
    const data = await requestFeishu<BitableListTablesData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
      method: 'GET',
      bearerToken: input.tenantAccessToken,
      query: {
        page_size: 200,
        page_token: pageToken || '',
      },
    })

    for (const item of (data.items || [])) {
      const tableId = String(item.table_id || '').trim()
      if (!tableId)
        continue
      tables.push({
        tableId,
        name: String(item.name || '').trim() || tableId,
      })
    }

    hasMore = Boolean(data.has_more)
    pageToken = String(data.page_token || '').trim()
    if (hasMore && !pageToken)
      hasMore = false
  }

  return tables
}

export async function listFeishuBitableViews(input: {
  tenantAccessToken: string
  appToken: string
  tableId: string
}): Promise<Array<{ viewId: string, name: string }>> {
  const appToken = String(input.appToken || '').trim()
  const tableId = String(input.tableId || '').trim()
  if (!appToken || !tableId)
    return []
  let pageToken = ''
  let hasMore = true
  const views: Array<{ viewId: string, name: string }> = []

  while (hasMore) {
    const data = await requestFeishu<BitableListViewsData>({
      baseUrl: DEFAULT_FEISHU_API_BASE_URL,
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`,
      method: 'GET',
      bearerToken: input.tenantAccessToken,
      query: {
        page_size: 200,
        page_token: pageToken || '',
      },
    })

    for (const item of (data.items || [])) {
      const viewId = String(item.view_id || '').trim()
      if (!viewId)
        continue
      views.push({
        viewId,
        name: String(item.view_name || item.name || '').trim() || viewId,
      })
    }

    hasMore = Boolean(data.has_more)
    pageToken = String(data.page_token || '').trim()
    if (hasMore && !pageToken)
      hasMore = false
  }

  return views
}
