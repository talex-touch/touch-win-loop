import { beforeEach, describe, expect, it, vi } from 'vitest'

const setResponseStatus = vi.fn()

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  setResponseStatus,
}))

vi.mock('~~/server/utils/env', () => ({
  readRuntimeSettings: vi.fn(() => ({
    ai: {
      provider: 'mock-provider',
      model: 'mock-model',
    },
  })),
}))

describe('api-handler', () => {
  beforeEach(() => {
    setResponseStatus.mockReset()
  })

  it('defineApiHandler 会注入默认 telemetry 并包装 ok 响应', async () => {
    const { defineApiHandler } = await import('~~/server/utils/api-handler')

    const handler = defineApiHandler(async ({ ok }) => {
      return ok({ message: 'ok' })
    })

    const result = await handler({} as any)
    expect(result.code).toBe(0)
    expect(result.data).toEqual({ message: 'ok' })
    expect(result.meta.provider).toBe('mock-provider')
    expect(result.meta.model).toBe('mock-model')
    expect(result.meta.attempts).toBe(1)
    expect(result.meta.fallbackUsed).toBe(false)
  })

  it('defineApiHandler 的 fail 会透传状态码和 telemetry 覆盖项', async () => {
    const { defineApiHandler } = await import('~~/server/utils/api-handler')

    const handler = defineApiHandler(async ({ fail }) => {
      return fail('denied', 40301, {
        status: 403,
        provider: 'override-provider',
        model: 'override-model',
        attempts: 2,
        fallbackUsed: true,
      })
    })

    const result = await handler({} as any)
    expect(setResponseStatus).toHaveBeenCalledWith({}, 403)
    expect(result.code).toBe(40301)
    expect(result.message).toBe('denied')
    expect(result.meta.provider).toBe('override-provider')
    expect(result.meta.model).toBe('override-model')
    expect(result.meta.attempts).toBe(2)
    expect(result.meta.fallbackUsed).toBe(true)
  })

  it('buildApiTelemetry 支持直接读取 provider/model 形态的 runtime', async () => {
    const { buildApiTelemetry } = await import('~~/server/utils/api-handler')

    const telemetry = buildApiTelemetry({
      provider: 'direct-provider',
      model: 'direct-model',
    }, 1000)

    expect(telemetry.startedAt).toBe(1000)
    expect(telemetry.provider).toBe('direct-provider')
    expect(telemetry.model).toBe('direct-model')
  })
})

describe('team-first', () => {
  beforeEach(() => {
    setResponseStatus.mockReset()
  })

  it('teamFirstApiRemoved 保持 410 兼容响应', async () => {
    const { teamFirstApiRemoved } = await import('~~/server/utils/team-first')

    const event = {} as any
    const result = teamFirstApiRemoved(event)

    expect(setResponseStatus).toHaveBeenCalledWith(event, 410)
    expect(result.code).toBe(41010)
    expect(result.message).toContain('/api/teams/')
    expect(result.meta.provider).toBe('mock-provider')
    expect(result.meta.model).toBe('mock-model')
  })

  it('teamFirstDeprecatedHandler 复用共享 deprecated handler 包装', async () => {
    const { teamFirstDeprecatedHandler } = await import('~~/server/utils/team-first')

    const event = {} as any
    const result = await teamFirstDeprecatedHandler(event)

    expect(setResponseStatus).toHaveBeenCalledWith(event, 410)
    expect(result.code).toBe(41010)
  })
})
