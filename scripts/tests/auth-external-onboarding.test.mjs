import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const EXTERNAL_IDENTITY_FILE = resolve(process.cwd(), 'server/services/auth/external-identity.ts')
const FEISHU_AUTH_FILE = resolve(process.cwd(), 'server/services/feishu/auth.ts')
const FEISHU_LOGIN_FLOW_FILE = resolve(process.cwd(), 'server/services/feishu/login-flow.ts')
const FEISHU_CALLBACK_FILE = resolve(process.cwd(), 'server/api/auth/feishu/callback.get.ts')
const FEISHU_WEBSDK_FILE = resolve(process.cwd(), 'server/api/auth/feishu/websdk-login.post.ts')
const CASDOOR_AUTH_FILE = resolve(process.cwd(), 'server/services/casdoor/auth.ts')
const CASDOOR_LOGIN_FLOW_FILE = resolve(process.cwd(), 'server/services/casdoor/login-flow.ts')
const CASDOOR_CALLBACK_FILE = resolve(process.cwd(), 'server/api/auth/casdoor/callback.get.ts')
const PENDING_API_FILE = resolve(process.cwd(), 'server/api/auth/onboarding/pending.get.ts')
const COMPLETE_API_FILE = resolve(process.cwd(), 'server/api/auth/onboarding/complete.post.ts')
const ONBOARDING_PAGE_FILE = resolve(process.cwd(), 'app/pages/auth/onboarding.vue')
const LOGIN_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useLoginPage.ts')
const AUTH_MIDDLEWARE_FILE = resolve(process.cwd(), 'app/middleware/auth.global.ts')
const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')

describe('external auth onboarding contract', () => {
  it('routes new third-party identities into pending onboarding instead of prefixed local usernames', async () => {
    const [externalSource, feishuAuthSource, casdoorAuthSource] = await Promise.all([
      readFile(EXTERNAL_IDENTITY_FILE, 'utf8'),
      readFile(FEISHU_AUTH_FILE, 'utf8'),
      readFile(CASDOOR_AUTH_FILE, 'utf8'),
    ])

    assert.match(externalSource, /EXTERNAL_AUTH_ONBOARDING_COOKIE_NAME/, '统一身份服务缺少 pending onboarding cookie')
    assert.match(externalSource, /persistExternalAuthOnboarding/, '统一身份服务缺少 pending 写入')
    assert.match(externalSource, /signPendingPayload/, 'pending onboarding cookie 必须服务端签名，不能只做编码')
    assert.match(externalSource, /timingSafeEqual/, 'pending onboarding cookie 签名校验应使用恒定时间比较')
    assert.match(externalSource, /completeExternalAuthOnboarding/, '统一身份服务缺少完成引导入口')
    assert.match(externalSource, /bindExternalAuthToExistingUser/, '统一身份服务缺少关联已有账号逻辑')
    assert.doesNotMatch(externalSource, /`fs_/, '统一身份服务不应生成 fs_ 用户名')
    assert.doesNotMatch(externalSource, /`cd_/, '统一身份服务不应生成 cd_ 用户名')

    assert.match(feishuAuthSource, /provider:\s*'feishu'/, '飞书登录未映射到统一 provider')
    assert.match(feishuAuthSource, /loginWithExternalAuthProfile/, '飞书登录未复用统一身份服务')
    assert.doesNotMatch(feishuAuthSource, /ensureLocalUserByFeishuProfile/, '飞书登录不应直接 provision 本地用户')

    assert.match(casdoorAuthSource, /provider:\s*'casdoor'/, 'OAuth 登录未映射到统一 provider')
    assert.match(casdoorAuthSource, /loginWithExternalAuthProfile/, 'OAuth 登录未复用统一身份服务')
    assert.doesNotMatch(casdoorAuthSource, /ensureLocalUserByCasdoorProfile/, 'OAuth 登录不应直接 provision 本地用户')
  })

  it('keeps OAuth callback and Feishu WebSDK behavior onboarding-aware', async () => {
    const [feishuFlow, feishuCallback, feishuWebsdk, casdoorFlow, casdoorCallback, loginComposable] = await Promise.all([
      readFile(FEISHU_LOGIN_FLOW_FILE, 'utf8'),
      readFile(FEISHU_CALLBACK_FILE, 'utf8'),
      readFile(FEISHU_WEBSDK_FILE, 'utf8'),
      readFile(CASDOOR_LOGIN_FLOW_FILE, 'utf8'),
      readFile(CASDOOR_CALLBACK_FILE, 'utf8'),
      readFile(LOGIN_COMPOSABLE_FILE, 'utf8'),
    ])

    assert.match(feishuFlow, /needsOnboarding/, '飞书登录 flow 未返回 onboarding 分支')
    assert.match(feishuCallback, /sendRedirect\(event,\s*'\/auth\/onboarding'/, '飞书 OAuth 回调未跳转引导页')
    assert.match(feishuWebsdk, /needsProfileSetup:\s*true/, '飞书 WebSDK 未返回引导信号')
    assert.match(loginComposable, /result\.onboarding\?\.needsProfileSetup/, '登录页未识别飞书 WebSDK 引导信号')

    assert.match(casdoorFlow, /needsOnboarding/, 'OAuth 登录 flow 未返回 onboarding 分支')
    assert.match(casdoorCallback, /sendRedirect\(event,\s*'\/auth\/onboarding'/, 'OAuth 回调未跳转引导页')
  })

  it('exposes onboarding API, shared types, and route page', async () => {
    const [domainSource, pendingApi, completeApi, pageSource, middlewareSource] = await Promise.all([
      readFile(DOMAIN_FILE, 'utf8'),
      readFile(PENDING_API_FILE, 'utf8'),
      readFile(COMPLETE_API_FILE, 'utf8'),
      readFile(ONBOARDING_PAGE_FILE, 'utf8'),
      readFile(AUTH_MIDDLEWARE_FILE, 'utf8'),
    ])

    assert.match(domainSource, /ExternalAuthProvider/, '共享类型缺少 ExternalAuthProvider')
    assert.match(domainSource, /AuthOnboardingPendingResult/, '共享类型缺少 pending result')
    assert.match(domainSource, /AuthOnboardingCompleteResult/, '共享类型缺少 complete result')
    assert.match(pendingApi, /buildPendingExternalAuthView/, 'pending API 未读取统一 pending 状态')
    assert.match(completeApi, /completeExternalAuthOnboarding/, 'complete API 未调用统一完成逻辑')
    assert.match(completeApi, /setSessionCookie/, 'complete API 完成后必须建立 session')
    assert.match(pageSource, /data-testid="auth-onboarding-page"/, '引导页缺少页面测试标记')
    assert.match(pageSource, /创建新账号/, '引导页缺少创建模式')
    assert.match(pageSource, /关联已有账号/, '引导页缺少关联模式')
    assert.match(pageSource, /\/auth\/onboarding\/complete/, '引导页未调用完成接口')
    assert.match(middlewareSource, /'\/auth\/onboarding'/, '全局路由未放行引导页')
  })
})
