import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

const source = readFileSync(new URL('../../.github/workflows/winloop-image.yml', import.meta.url), 'utf8')

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
})
