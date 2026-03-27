import type { FeishuIntegrationConfigInternal } from '~~/server/utils/feishu-integration-store'

const DEFAULT_FEISHU_API_BASE_URL = 'https://open.feishu.cn'
const DEFAULT_PAGE_SIZE = 200

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

interface BitableListRecordsData {
  has_more?: boolean
  page_token?: string
  total?: number
  items?: Array<{
    record_id?: string
    fields?: Record<string, unknown>
  }>
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
    throw new Error(remoteMessage || `FEISHU_HTTP_${response.status}`)
  }

  const envelope = await parseEnvelope<T>(response)
  const code = Number(envelope.code || 0)
  if (code !== 0) {
    const message = String(envelope.msg || envelope.message || '')
    throw new Error(message || `FEISHU_API_${code}`)
  }

  return (envelope.data || {}) as T
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
      page_size: DEFAULT_PAGE_SIZE,
      page_token: input.pageToken || '',
      member_id_type: 'union_id',
    },
  })
}

function toMemberUnionId(item: GroupMemberItem): string {
  return String(item?.union_id || item?.member_id || item?.open_id || item?.user_id || '').trim()
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
