export interface CasdoorOAuthConfig {
  enabled: boolean
  issuer: string
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
  name?: string
  preferred_username?: string
  email?: string
  picture?: string
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

export function isCasdoorAuthEnabled(config: CasdoorOAuthConfig): boolean {
  return Boolean(
    config.enabled
    && String(config.issuer || '').trim()
    && String(config.clientId || '').trim()
    && String(config.clientSecret || '').trim()
    && String(config.redirectUri || '').trim(),
  )
}

export function buildCasdoorAuthorizeUrl(input: {
  config: CasdoorOAuthConfig
  state: string
  redirectUri?: string
}): string {
  if (!isCasdoorAuthEnabled(input.config))
    throw new Error('CASDOOR_APP_CONFIG_INCOMPLETE')

  const redirectUri = String(input.redirectUri || input.config.redirectUri || '').trim()
  if (!redirectUri)
    throw new Error('CASDOOR_REDIRECT_URI_REQUIRED')

  const issuer = new URL(`${trimTrailingSlash(input.config.issuer)}/`)
  const url = new URL('/login/oauth/authorize', issuer)
  url.searchParams.set('client_id', String(input.config.clientId || '').trim())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', String(input.config.scope || '').trim() || 'openid profile email')
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
  const issuer = new URL(`${trimTrailingSlash(input.config.issuer)}/`)
  const openIdConfigurationResponse = await fetcher(new URL('/.well-known/openid-configuration', issuer))
  const openIdConfiguration = await openIdConfigurationResponse.json() as OpenIdConfiguration
  const tokenEndpoint = ensureField(openIdConfiguration.token_endpoint, 'token_endpoint')
  const userinfoEndpoint = ensureField(openIdConfiguration.userinfo_endpoint, 'userinfo_endpoint')

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
  const preferredUsername = String(userInfo.preferred_username || '').trim()
  const email = String(userInfo.email || '').trim()
  const resolvedName = String(userInfo.name || '').trim() || preferredUsername || email || 'Casdoor User'

  return {
    sub: ensureField(userInfo.sub, 'sub'),
    name: resolvedName,
    ...(preferredUsername ? { preferredUsername } : {}),
    ...(email ? { email } : {}),
    ...(String(userInfo.picture || '').trim() ? { avatarUrl: String(userInfo.picture || '').trim() } : {}),
  }
}
