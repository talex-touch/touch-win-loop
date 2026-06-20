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

  it('镜像发布必须等待匹配 CI 全绿，不再允许 dev 分支 smoke-only 准入', () => {
    assert.match(source, /if \(run\.conclusion === 'success'\) \{\s*core\.setOutput\('should_publish', 'true'\);/)
    assert.match(source, /Skip image publish because CI concluded as/)
    assert.doesNotMatch(source, /const allowSmokeOnlyGate = branch === 'dev'/)
    assert.doesNotMatch(source, /GET \/repos\/\{owner\}\/\{repo\}\/actions\/runs\/\{run_id\}\/jobs/)
    assert.doesNotMatch(source, /smokeJob\?\.conclusion === 'success'/)
  })

  it('cI 中的 smoke 不再依赖 lint 和 typecheck 完成', () => {
    assert.match(ciSource, /smoke:\s+runs-on: ubuntu-latest\s+timeout-minutes: 30\s+steps:/)
    assert.doesNotMatch(ciSource, /smoke:[\s\S]*?needs:[\s\S]*?- lint[\s\S]*?- typecheck/)
  })
})
