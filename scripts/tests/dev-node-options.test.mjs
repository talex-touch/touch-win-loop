import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { stripSentryServerPreload } from '../utils/dev-node-options.mjs'

describe('stripSentryServerPreload', () => {
  it('移除开发态 sentry preload 并保留其他 NODE_OPTIONS', () => {
    const result = stripSentryServerPreload('--max-old-space-size=8192 --import ./.nuxt/dev/sentry.server.config.mjs')

    assert.deepEqual(result.removed, ['./.nuxt/dev/sentry.server.config.mjs'])
    assert.equal(result.nodeOptions, '--max-old-space-size=8192')
  })

  it('支持等号和引号形式的 import 参数', () => {
    const result = stripSentryServerPreload('--trace-warnings --import="/tmp/.nuxt/dev/sentry.server.config.mjs"')

    assert.deepEqual(result.removed, ['/tmp/.nuxt/dev/sentry.server.config.mjs'])
    assert.equal(result.nodeOptions, '--trace-warnings')
  })

  it('没有 sentry preload 时保持原值', () => {
    const result = stripSentryServerPreload('--max-old-space-size=8192 --trace-warnings')

    assert.deepEqual(result.removed, [])
    assert.equal(result.nodeOptions, '--max-old-space-size=8192 --trace-warnings')
  })
})
