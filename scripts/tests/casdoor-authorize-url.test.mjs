import assert from 'node:assert/strict'
import { it } from 'vitest'
import { buildCasdoorAuthorizeUrl, isCasdoorAuthEnabled } from '../../server/services/casdoor/client.ts'

function createConfig(overrides = {}) {
  return {
    enabled: true,
    protocolMode: 'oidc_discovery',
    issuer: 'https://casdoor.example.com',
    authorizeEndpoint: '',
    tokenEndpoint: '',
    userinfoEndpoint: '',
    clientId: 'cli_test_client',
    clientSecret: 'cli_test_secret',
    scope: 'openid profile email',
    redirectUri: 'https://app.example.com/api/auth/oauth/callback',
    ...overrides,
  }
}

it('可识别已完整配置的第三方 OAuth / OIDC', () => {
  assert.equal(isCasdoorAuthEnabled(createConfig()), true)
  assert.equal(isCasdoorAuthEnabled(createConfig({ clientSecret: '' })), false)
  assert.equal(isCasdoorAuthEnabled(createConfig({ redirectUri: '' })), false)
  assert.equal(isCasdoorAuthEnabled(createConfig({
    protocolMode: 'oauth2_manual',
    issuer: '',
    authorizeEndpoint: 'https://accounts.example.com/oauth2/authorize',
    tokenEndpoint: 'https://accounts.example.com/oauth2/token',
    userinfoEndpoint: 'https://accounts.example.com/oauth2/userinfo',
  })), true)
})

it('构造 OAuth / OIDC 授权地址时会带上标准参数', async () => {
  const url = await buildCasdoorAuthorizeUrl({
    config: createConfig(),
    state: 'state_from_test',
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        authorization_endpoint: 'https://casdoor.example.com/oidc/authorize',
      }),
    }),
  })

  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://casdoor.example.com')
  assert.equal(parsed.pathname, '/oidc/authorize')
  assert.equal(parsed.searchParams.get('client_id'), 'cli_test_client')
  assert.equal(parsed.searchParams.get('response_type'), 'code')
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://app.example.com/api/auth/oauth/callback')
  assert.equal(parsed.searchParams.get('scope'), 'openid profile email')
  assert.equal(parsed.searchParams.get('state'), 'state_from_test')
})

it('显式传入 redirectUri 时优先覆盖配置值', async () => {
  const url = await buildCasdoorAuthorizeUrl({
    config: createConfig({
      redirectUri: 'https://config.example.com/api/auth/oauth/callback',
    }),
    state: 'override_redirect',
    redirectUri: 'https://runtime.example.com/api/auth/oauth/callback',
    fetcher: async () => ({
      ok: true,
      json: async () => ({}),
    }),
  })

  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://runtime.example.com/api/auth/oauth/callback')
})

it('手动端点模式直接使用配置的 authorize endpoint', async () => {
  const url = await buildCasdoorAuthorizeUrl({
    config: createConfig({
      protocolMode: 'oauth2_manual',
      issuer: '',
      authorizeEndpoint: 'https://accounts.example.com/oauth2/authorize',
      tokenEndpoint: 'https://accounts.example.com/oauth2/token',
      userinfoEndpoint: 'https://accounts.example.com/oauth2/userinfo',
    }),
    state: 'manual_state',
  })

  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://accounts.example.com')
  assert.equal(parsed.pathname, '/oauth2/authorize')
  assert.equal(parsed.searchParams.get('state'), 'manual_state')
  assert.equal(parsed.searchParams.get('client_id'), 'cli_test_client')
})
