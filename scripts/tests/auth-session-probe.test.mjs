import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAuthRequestErrorInfo,
  resolveAuthDisplayMessage,
  resolveAuthRequestErrorInfo,
} from '../../app/utils/auth-request.ts'

const AUTH_SESSION_FILE = resolve(process.cwd(), 'server/api/auth/session.get.ts')
const AUTH_ME_FILE = resolve(process.cwd(), 'server/api/auth/me.get.ts')
const AUTH_MIDDLEWARE_FILE = resolve(process.cwd(), 'app/middleware/auth.global.ts')
const AUTH_BIND_MIDDLEWARE_FILE = resolve(process.cwd(), 'app/middleware/auth-bind.ts')
const AUTH_BIND_PAGE_FILE = resolve(process.cwd(), 'app/pages/auth/bind.vue')
const LOGIN_PAGE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useLoginPage.ts')
const INVITE_PAGE_FILE = resolve(process.cwd(), 'app/pages/invite/[token].vue')
const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')

describe('auth request utils', () => {
  it('能把 401 / 403 / 5xx / 网络异常映射到正确分类', () => {
    expect(buildAuthRequestErrorInfo({ statusCode: 401, message: '请先登录。' }).isUnauthorized).toBe(true)
    expect(buildAuthRequestErrorInfo({ statusCode: 403, message: '当前账号已被禁用。' }).isForbidden).toBe(true)
    expect(buildAuthRequestErrorInfo({ statusCode: 503, message: '服务暂不可用。' }).isTemporary).toBe(true)
    expect(resolveAuthRequestErrorInfo({ message: 'Failed to fetch' }).isTemporary).toBe(true)
  })

  it('能从错误对象中提取 status、message 与 traceId', () => {
    const info = resolveAuthRequestErrorInfo({
      statusCode: 500,
      data: {
        message: '数据库连接失败。',
        meta: {
          traceId: 'trace_local_123',
        },
      },
    })

    expect(info.statusCode).toBe(500)
    expect(info.message).toBe('数据库连接失败。')
    expect(info.traceId).toBe('trace_local_123')
  })

  it('临时故障默认回退到稳定提示，403 保留原始文案', () => {
    expect(resolveAuthDisplayMessage(
      buildAuthRequestErrorInfo({ statusCode: 503, message: '数据库抖动。' }),
      '登录态校验失败，请稍后重试。',
    )).toBe('登录态校验失败，请稍后重试。')

    expect(resolveAuthDisplayMessage(
      buildAuthRequestErrorInfo({ statusCode: 403, message: '当前账号已被禁用，请联系平台管理员。' }),
      '登录态校验失败，请稍后重试。',
    )).toBe('当前账号已被禁用，请联系平台管理员。')
  })
})

it('session probe 接口保持轻量，只校验会话本身', async () => {
  const source = await readFile(AUTH_SESSION_FILE, 'utf8')

  assert.match(source, /requireAuth\(event\)/, 'session probe 未复用 requireAuth')
  assert.match(source, /authenticated:\s*true/, 'session probe 未返回 authenticated 标记')
  assert.match(source, /userId:\s*user\.id/, 'session probe 未返回 userId')
  assert.match(source, /expiresAt:\s*session\.expiresAt/, 'session probe 未返回 session 过期时间')
  assert.doesNotMatch(source, /teamListUserWorkspaces/, 'session probe 不应加载工作空间聚合数据')
  assert.doesNotMatch(source, /resolvePlatformAccess/, 'session probe 不应加载权限聚合数据')
  assert.doesNotMatch(source, /ensureBootstrapPlatformSuperAdmin/, 'session probe 不应执行 bootstrap admin 逻辑')
})

it('auth me 与 session probe 都会记录 traceId 关联非 401 失败', async () => {
  const [sessionSource, meSource] = await Promise.all([
    readFile(AUTH_SESSION_FILE, 'utf8'),
    readFile(AUTH_ME_FILE, 'utf8'),
  ])

  assert.match(sessionSource, /const traceId = createTraceId\(\)/, 'session probe 未创建 traceId')
  assert.match(sessionSource, /setHeader\(event, 'x-trace-id', traceId\)/, 'session probe 未写入 x-trace-id')
  assert.match(sessionSource, /\[auth\.session\] probe failed/, 'session probe 未记录非 401 失败日志')

  assert.match(meSource, /const traceId = createTraceId\(\)/, 'auth me 未创建 traceId')
  assert.match(meSource, /setHeader\(event, 'x-trace-id', traceId\)/, 'auth me 未写入 x-trace-id')
  assert.match(meSource, /\[auth\.me\] request failed/, 'auth me 未记录非 401 失败日志')
})

it('前端守卫与登录页已改为使用轻量 session probe', async () => {
  const [middlewareSource, bindMiddlewareSource, bindPageSource, loginSource, inviteSource] = await Promise.all([
    readFile(AUTH_MIDDLEWARE_FILE, 'utf8'),
    readFile(AUTH_BIND_MIDDLEWARE_FILE, 'utf8'),
    readFile(AUTH_BIND_PAGE_FILE, 'utf8'),
    readFile(LOGIN_PAGE_COMPOSABLE_FILE, 'utf8'),
    readFile(INVITE_PAGE_FILE, 'utf8'),
  ])

  assert.match(middlewareSource, /endpoint\('\/auth\/session'\)/, '路由守卫未改用 /auth/session')
  assert.match(middlewareSource, /const authProbeUrl = import\.meta\.server[\s\S]*new URL\(String\(authEndpoint\), useRequestURL\(\)\)\.toString\(\)/, '路由守卫未在服务端把 session probe URL 绝对化')
  assert.doesNotMatch(middlewareSource, /endpoint\('\/auth\/me'\)/, '路由守卫不应继续使用 /auth/me 探测登录态')
  assert.match(middlewareSource, /fetch\(authProbeUrl, \{/, '路由守卫未使用绝对化后的 session probe URL')
  assert.match(middlewareSource, /authState !== 'unauthorized'/, '路由守卫未收敛为仅 401 才跳登录')
  assert.match(middlewareSource, /logAuthProbeDegraded/, '路由守卫未记录 session probe 降级日志')

  assert.match(bindMiddlewareSource, /endpoint\('\/auth\/session'\)/, '账号绑定 middleware 未改用 /auth/session')
  assert.match(bindMiddlewareSource, /fetch\(authProbeUrl, \{/, '账号绑定 middleware 未使用绝对化后的 session probe URL')
  assert.match(bindMiddlewareSource, /path:\s*'\/login'/, '账号绑定 middleware 未在 401 时跳转登录页')
  assert.match(bindPageSource, /middleware:\s*'auth-bind'/, '账号绑定页未挂载专用 middleware')

  assert.match(loginSource, /authApiFetch<ApiResponse<AuthSessionProbeResult>>\('\/auth\/session'\)/, '登录页未改用 /auth/session')
  assert.match(loginSource, /if \(sessionState === 'unauthenticated'\)\s+await tryFeishuAutoLogin\(\)/, '登录页未限制为仅 401 才自动发起飞书登录')
  assert.doesNotMatch(loginSource, /authApiFetch<ApiResponse<AuthMeResult>>\('\/auth\/me'\)/, '登录页不应继续使用 /auth/me 探测登录态')
  assert.doesNotMatch(loginSource, /startFeishuOAuthRedirect/, '登录页不应在飞书自动登录失败后继续跳飞书 OAuth')
  assert.match(loginSource, /飞书自动登录未完成，请改用账号密码登录。/, '登录页缺少飞书自动登录失败回退文案')

  assert.match(inviteSource, /authApiFetch<ApiResponse<AuthSessionProbeResult>>\('\/auth\/session'\)/, '邀请页未改用 /auth/session 检测登录态')
})

it('项目工作区登录态加载只在 401 时跳登录，其他异常保留当前页', async () => {
  const source = await readFile(PROJECT_WORKSPACE_FILE, 'utf8')

  assert.match(source, /const info = resolveAuthRequestErrorInfo\(error\)/, '项目工作区未分类鉴权错误')
  assert.match(source, /if \(!info\.isUnauthorized\)/, '项目工作区未将非 401 从登录跳转中剥离')
  assert.match(source, /statusLine\.value = resolveAuthDisplayMessage\(error, '登录态校验失败，请稍后重试。'\)/, '项目工作区未保留非 401 错误提示')
})
