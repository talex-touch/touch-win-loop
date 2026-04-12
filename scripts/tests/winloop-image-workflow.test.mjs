import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const source = readFileSync(new URL('../../.github/workflows/winloop-image.yml', import.meta.url), 'utf8')
const ciSource = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')

describe('winloop image workflow sentry config', () => {
  it('通过 BuildKit secret 传递 SENTRY_AUTH_TOKEN', () => {
    assert.match(source, /secrets:\s*\|\s*sentry_auth_token=\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/)
    assert.doesNotMatch(source, /id=sentry_auth_token,env=SENTRY_AUTH_TOKEN/)
  })

  it('继续显式注入 Sentry build args', () => {
    assert.match(source, /WINLOOP_SENTRY_ORG=\$\{\{\s*secrets\.WINLOOP_SENTRY_ORG\s*\}\}/)
    assert.match(source, /WINLOOP_SENTRY_PROJECT=\$\{\{\s*secrets\.WINLOOP_SENTRY_PROJECT\s*\}\}/)
    assert.match(source, /WINLOOP_SENTRY_RELEASE=\$\{\{\s*steps\.build_meta\.outputs\.build_version\s*\}\}/)
  })

  it('dev 分支允许以 build_and_smoke 作为镜像发布准入条件', () => {
    assert.match(source, /const allowSmokeOnlyGate = branch === 'dev'/)
    assert.match(source, /GET \/repos\/\{owner\}\/\{repo\}\/actions\/runs\/\{run_id\}\/jobs/)
    assert.match(source, /const buildAndSmokeJob = jobs\.find\(job => job\.name === 'build_and_smoke'\)/)
    assert.match(source, /if \(buildAndSmokeJob\?\.conclusion === 'success'\)/)
  })

  it('CI 中的 build_and_smoke 不再依赖 lint 和 typecheck 完成', () => {
    assert.match(ciSource, /build_and_smoke:\s+runs-on: ubuntu-latest\s+timeout-minutes: 30\s+steps:/s)
    assert.doesNotMatch(ciSource, /build_and_smoke:[\s\S]*?needs:\s*[\s\S]*?- lint[\s\S]*?- typecheck/s)
  })
})
