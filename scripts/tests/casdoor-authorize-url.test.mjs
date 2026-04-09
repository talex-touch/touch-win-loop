import assert from 'node:assert/strict'
import { it } from 'vitest'
import { buildCasdoorAuthorizeUrl, isCasdoorAuthEnabled } from '../../server/services/casdoor/client.ts'

function createConfig(overrides = {}) {
  return {
    enabled: true,
    issuer: 'https://casdoor.example.com',
    clientId: 'cli_test_client',
    clientSecret: 'cli_test_secret',
    scope: 'openid profile email',
    redirectUri: 'https://app.example.com/api/auth/casdoor/callback',
    ...overrides,
  }
}

it('可识别已完整配置的 Casdoor OAuth', () => {
  assert.equal(isCasdoorAuthEnabled(createConfig()), true)
  assert.equal(isCasdoorAuthEnabled(createConfig({ clientSecret: '' })), false)
  assert.equal(isCasdoorAuthEnabled(createConfig({ redirectUri: '' })), false)
})

it('构造 Casdoor OAuth 授权地址时会带上标准参数', () => {
  const url = buildCasdoorAuthorizeUrl({
    config: createConfig(),
    state: 'state_from_test',
  })

  const parsed = new URL(url)
  assert.equal(parsed.origin, 'https://casdoor.example.com')
  assert.equal(parsed.pathname, '/login/oauth/authorize')
  assert.equal(parsed.searchParams.get('client_id'), 'cli_test_client')
  assert.equal(parsed.searchParams.get('response_type'), 'code')
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://app.example.com/api/auth/casdoor/callback')
  assert.equal(parsed.searchParams.get('scope'), 'openid profile email')
  assert.equal(parsed.searchParams.get('state'), 'state_from_test')
})

it('显式传入 redirectUri 时优先覆盖配置值', () => {
  const url = buildCasdoorAuthorizeUrl({
    config: createConfig({
      redirectUri: 'https://config.example.com/api/auth/casdoor/callback',
    }),
    state: 'override_redirect',
    redirectUri: 'https://runtime.example.com/api/auth/casdoor/callback',
  })

  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://runtime.example.com/api/auth/casdoor/callback')
})
