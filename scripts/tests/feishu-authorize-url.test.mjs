import assert from 'node:assert/strict'
import { it } from 'vitest'
import { buildFeishuAuthorizeUrl } from '../../server/services/feishu/client.ts'

function createConfig(overrides = {}) {
  return {
    enabled: true,
    appId: 'cli_test_app',
    appSecret: '',
    oauthRedirectUri: '',
    eventToken: '',
    eventEncryptKey: '',
    adminGroupIds: [],
    webSdkScriptUrl: '',
    startupNotifyEnabled: false,
    startupNotifyChatId: '',
    startupNotifyRemark: '',
    startupFallbackVersion: '',
    startupFallbackCommitSha: '',
    updatedAt: '',
    updatedByUserId: '',
    ...overrides,
  }
}

it('优先使用显式配置的 OAuth 回调地址', () => {
  const url = buildFeishuAuthorizeUrl({
    config: createConfig({
      oauthRedirectUri: 'https://config.example.com/api/auth/feishu/callback',
    }),
    state: 'state_from_test',
    redirectUri: 'https://runtime.example.com/api/auth/feishu/callback',
    requestOrigin: 'https://request.example.com',
  })

  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://config.example.com/api/auth/feishu/callback')
})

it('未配置显式回调地址时，使用调用方提供的回调地址', () => {
  const url = buildFeishuAuthorizeUrl({
    config: createConfig(),
    state: 'state_from_test',
    redirectUri: 'https://runtime.example.com/api/auth/feishu/callback',
    requestOrigin: 'https://request.example.com',
  })

  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://runtime.example.com/api/auth/feishu/callback')
})

it('显式配置与调用方兜底都缺失时，按请求源推导回调地址', () => {
  const url = buildFeishuAuthorizeUrl({
    config: createConfig(),
    state: 'state_from_test',
    requestOrigin: 'https://request.example.com/',
  })

  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://request.example.com/api/auth/feishu/callback')
})
