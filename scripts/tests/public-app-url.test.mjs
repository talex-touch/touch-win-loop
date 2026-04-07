import { describe, expect, it } from 'vitest'
import { resolveUserFacingUrlByAppBase } from '../../shared/utils/api-url'

describe('resolveUserFacingUrlByAppBase', () => {
  it('优先使用绝对公开域名生成邀请链接', () => {
    expect(resolveUserFacingUrlByAppBase('https://wl-local.tagzxia.com', '/invite/token-123'))
      .toBe('https://wl-local.tagzxia.com/invite/token-123')
  })

  it('支持相对公开基址并回落到当前 origin', () => {
    expect(resolveUserFacingUrlByAppBase('/winloop', '/invite/token-123', 'https://demo.local'))
      .toBe('https://demo.local/winloop/invite/token-123')
  })

  it('未配置公开基址时回落到当前 origin', () => {
    expect(resolveUserFacingUrlByAppBase('', '/invite/token-123', 'https://demo.local'))
      .toBe('https://demo.local/invite/token-123')
  })

  it('保留已经是绝对地址的分享链接', () => {
    expect(resolveUserFacingUrlByAppBase('https://wl-local.tagzxia.com', 'https://cdn.example.com/share/abc'))
      .toBe('https://cdn.example.com/share/abc')
  })
})
