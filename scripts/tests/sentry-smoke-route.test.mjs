import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const source = readFileSync(new URL('../../server/api/admin/sentry/smoke.post.ts', import.meta.url), 'utf8')

describe('sentry smoke route', () => {
  it('仅在 staging 环境开放', () => {
    assert.match(source, /const environment = resolveSentryEnvironment\(\)/)
    assert.match(source, /if \(environment !== 'staging'\)/)
    assert.match(source, /setResponseStatus\(event,\s*404\)/)
  })

  it('要求内部权限并校验 Sentry SDK 已初始化', () => {
    assert.match(source, /requireAuth\(event\)/)
    assert.match(source, /checkPlatformPermission\(event,\s*user,\s*'contest\.read_internal'\)/)
    assert.match(source, /!Sentry\.getClient\(\)/)
    assert.match(source, /setResponseStatus\(event,\s*412\)/)
  })

  it('支持 nitro 与 worker 两种 smoke 目标', () => {
    assert.match(source, /target\?: 'nitro' \| 'worker'/)
    assert.match(source, /captureServerException\(new Error\(`\[sentry-smoke\] worker trace=\$\{traceId\}`\),/)
    assert.match(source, /throw new Error\(`\[sentry-smoke\] nitro trace=\$\{traceId\}`\)/)
  })

  it('通过响应头返回 trace id 便于验收对照', () => {
    assert.match(source, /setHeader\(event,\s*'x-trace-id',\s*traceId\)/)
  })

  it('返回实际生效的 sentry release 与 environment', () => {
    assert.match(source, /const environment = resolveSentryEnvironment\(\)/)
    assert.match(source, /const release = resolveSentryRelease\(runtime\.build\.version\)/)
    assert.match(source, /release,\s+environment,\s+captured: true/)
  })
})
