import type { OAuthProtocolMode } from '~~/shared/types/domain'

export interface CasdoorOAuthConfig {
  enabled: boolean
  protocolMode?: OAuthProtocolMode
  issuer: string
  authorizeEndpoint?: string
  tokenEndpoint?: string
  userinfoEndpoint?: string
  clientId: string
  clientSecret: string
  scope: string
  redirectUri: string
}

export interface CasdoorOAuthLoginProfile {
  sub: string
  name: string
  preferredUsername?: string
  email?: string
  avatarUrl?: string
}

interface OpenIdConfiguration {
  authorization_endpoint?: string
  token_endpoint?: string
  userinfo_endpoint?: string
}

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface UserInfoResponse {
  sub?: string
  id?: string
  user_id?: string
  name?: string
  nickname?: string
  display_name?: string
  preferred_username?: string
  username?: string
  login?: string
  email?: string
  mail?: string
  picture?: string
  avatar?: string
  avatar_url?: string
}

function ensureField(value: string | undefined, field: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    throw new Error(`CASDOOR_RESPONSE_MISSING_${field.toUpperCase()}`)
  return normalized
}

function trimTrailingSlash(value: string): string {
  return String(value || '').trim().replace(/\/+$/g, '')
}

function normalizeProtocolMode(value: OAuthProtocolMode | string | undefined): OAuthProtocolMode {
  return value === 'oauth2_manual' ? 'oauth2_manual' : 'oidc_discovery'
}

function normalizeScope(value: string | undefined): string {
  return String(value || '').trim() || 'openid profile email'
}

function buildIssuerUrl(issuer: string): URL {
  return new URL(`${trimTrailingSlash(issuer)}/`)
}

async function loadOpenIdConfiguration(input: {
  config: CasdoorOAuthConfig
  fetcher: typeof fetch
  optional?: boolean
}): Promise<OpenIdConfiguration | null> {
  const issuer = String(input.config.issuer || '').trim()
  if (!issuer) {
    if (input.optional)
      return null
    throw new Error('CASDOOR_OPENID_CONFIGURATION_ISSUER_REQUIRED')
  }

  try {
    const response = await input.fetcher(new URL('/.well-known/openid-configuration', buildIssuerUrl(issuer)))
    if (!response.ok) {
      if (input.optional)
        return null
      throw new Error('CASDOOR_OPENID_CONFIGURATION_FETCH_FAILED')
    }
    return await response.json() as OpenIdConfiguration
  }
  catch (error) {
    if (input.optional)
      return null
    throw error instanceof Error ? error : new Error('CASDOOR_OPENID_CONFIGURATION_FETCH_FAILED')
  }
}

async function resolveAuthorizeEndpoint(input: {
  config: CasdoorOAuthConfig
  fetcher: typeof fetch
}): Promise<string> {
  if (normalizeProtocolMode(input.config.protocolMode) === 'oauth2_manual')
    return ensureField(input.config.authorizeEndpoint, 'authorize_endpoint')

  const metadata = await loadOpenIdConfiguration({
    config: input.config,
    fetcher: input.fetcher,
    optional: true,
  })
  const discovered = String(metadata?.authorization_endpoint || '').trim()
  if (discovered)
    return discovered
  return new URL('/login/oauth/authorize', buildIssuerUrl(input.config.issuer)).toString()
}

async function resolveTokenAndUserInfoEndpoints(input: {
  config: CasdoorOAuthConfig
  fetcher: typeof fetch
}): Promise<{
  tokenEndpoint: string
  userinfoEndpoint: string
}> {
  if (normalizeProtocolMode(input.config.protocolMode) === 'oauth2_manual') {
    return {
      tokenEndpoint: ensureField(input.config.tokenEndpoint, 'token_endpoint'),
      userinfoEndpoint: ensureField(input.config.userinfoEndpoint, 'userinfo_endpoint'),
    }
  }

  const metadata = await loadOpenIdConfiguration({
    config: input.config,
    fetcher: input.fetcher,
  })
  return {
    tokenEndpoint: ensureField(metadata?.token_endpoint, 'token_endpoint'),
    userinfoEndpoint: ensureField(metadata?.userinfo_endpoint, 'userinfo_endpoint'),
  }
}

function mapUserInfoToProfile(userInfo: UserInfoResponse): CasdoorOAuthLoginProfile {
  const sub = String(userInfo.sub || userInfo.id || userInfo.user_id || '').trim()
  const preferredUsername = String(userInfo.preferred_username || userInfo.username || userInfo.login || '').trim()
  const email = String(userInfo.email || userInfo.mail || '').trim()
  const avatarUrl = String(userInfo.picture || userInfo.avatar_url || userInfo.avatar || '').trim()
  const resolvedName = String(userInfo.name || userInfo.nickname || userInfo.display_name || '').trim()
    || preferredUsername
    || email
    || 'OAuth User'

  return {
    sub: ensureField(sub, 'sub'),
    name: resolvedName,
    ...(preferredUsername ? { preferredUsername } : {}),
    ...(email ? { email } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  }
}

export function isCasdoorAuthEnabled(config: CasdoorOAuthConfig): boolean {
  if (!config.enabled)
    return false

  const hasBaseConfig = Boolean(
    String(config.clientId || '').trim()
    && String(config.clientSecret || '').trim()
    && String(config.redirectUri || '').trim(),
  )
  if (!hasBaseConfig)
    return false

  if (normalizeProtocolMode(config.protocolMode) === 'oauth2_manual') {
    return Boolean(
      String(config.authorizeEndpoint || '').trim()
      && String(config.tokenEndpoint || '').trim()
      && String(config.userinfoEndpoint || '').trim(),
    )
  }

  return Boolean(String(config.issuer || '').trim())
}

export async function buildCasdoorAuthorizeUrl(input: {
  config: CasdoorOAuthConfig
  state: string
  redirectUri?: string
  fetcher?: typeof fetch
}): Promise<string> {
  if (!isCasdoorAuthEnabled(input.config))
    throw new Error('CASDOOR_APP_CONFIG_INCOMPLETE')

  const redirectUri = String(input.redirectUri || input.config.redirectUri || '').trim()
  if (!redirectUri)
    throw new Error('CASDOOR_REDIRECT_URI_REQUIRED')

  const fetcher = input.fetcher || fetch
  const authorizeEndpoint = await resolveAuthorizeEndpoint({
    config: input.config,
    fetcher,
  })
  const url = new URL(authorizeEndpoint)
  url.searchParams.set('client_id', String(input.config.clientId || '').trim())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', normalizeScope(input.config.scope))
  url.searchParams.set('state', String(input.state || '').trim())
  return url.toString()
}

export async function exchangeCasdoorOAuthCode(input: {
  config: CasdoorOAuthConfig
  code: string
  redirectUri?: string
  fetcher?: typeof fetch
}): Promise<CasdoorOAuthLoginProfile> {
  if (!isCasdoorAuthEnabled(input.config))
    throw new Error('CASDOOR_APP_CONFIG_INCOMPLETE')

  const redirectUri = String(input.redirectUri || input.config.redirectUri || '').trim()
  if (!redirectUri)
    throw new Error('CASDOOR_REDIRECT_URI_REQUIRED')

  const fetcher = input.fetcher || fetch
  const { tokenEndpoint, userinfoEndpoint } = await resolveTokenAndUserInfoEndpoints({
    config: input.config,
    fetcher,
  })

  const tokenResponse = await fetcher(tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: String(input.config.clientId || '').trim(),
      client_secret: String(input.config.clientSecret || '').trim(),
      code: String(input.code || '').trim(),
      redirect_uri: redirectUri,
    }),
  })
  const tokenPayload = await tokenResponse.json() as TokenResponse

  if (!tokenPayload.access_token) {
    throw new Error(
      String(tokenPayload.error_description || tokenPayload.error || 'CASDOOR_TOKEN_EXCHANGE_FAILED').trim(),
    )
  }

  const userInfoResponse = await fetcher(userinfoEndpoint, {
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
  })
  const userInfo = await userInfoResponse.json() as UserInfoResponse
  return mapUserInfoToProfile(userInfo)
}
