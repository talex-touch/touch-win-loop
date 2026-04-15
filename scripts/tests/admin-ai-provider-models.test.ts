import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverProviderModels } from '~~/server/services/admin-ai/provider-models'
import { normalizePlatformAiApiKey, normalizePlatformAiBaseURL, resolvePlatformAiRequestBaseURL, resolvePlatformAiTransientApiKey } from '~~/server/utils/platform-ai-base-url'

function okJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

describe('admin-ai provider models', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('newapi 根地址会优先请求 /v1/models', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://newapi.example/v1/models')
        return okJson({ data: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }] })

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await discoverProviderModels({
      scope: 'provider',
      provider: 'newapi',
      baseURL: 'https://newapi.example',
      apiKey: 'test-key',
    })

    expect(items.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://newapi.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    )
  })

  it('base url 会自动规范为根地址，并在请求时补 /v1', () => {
    expect(normalizePlatformAiBaseURL('https://newapi.example/v1', 'newapi')).toBe('https://newapi.example')
    expect(normalizePlatformAiBaseURL('https://newapi.example/v1/models', 'newapi')).toBe('https://newapi.example')
    expect(resolvePlatformAiRequestBaseURL('https://newapi.example', 'newapi')).toBe('https://newapi.example/v1')
  })

  it('会优先使用当前输入的 api key，并自动去掉 bearer 前缀', () => {
    expect(normalizePlatformAiApiKey('Bearer sk-test')).toBe('sk-test')
    expect(resolvePlatformAiTransientApiKey({
      currentApiKey: 'old-key',
      providedApiKey: 'Bearer new-key',
      mode: 'keep',
    })).toBe('new-key')
  })

  it('首个成功响应不是模型列表时会继续尝试下一个端点', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://proxy.example/custom/v1/models') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => {
            throw new Error('invalid json')
          },
          text: async () => '<html>not-json</html>',
        }
      }

      if (url === 'https://proxy.example/custom/models')
        return okJson({ data: [{ id: 'gpt-4.1-mini' }] })

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await discoverProviderModels({
      scope: 'provider',
      provider: 'openai-compatible',
      baseURL: 'https://proxy.example/custom',
      apiKey: 'test-key',
    })

    expect(items.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('newapi 仅使用官方 /v1/models 路径', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://newapi.example/v1/models')
        return okJson({ data: ['gpt-4.1-mini', 'gpt-4.1'] })

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await discoverProviderModels({
      scope: 'provider',
      provider: 'newapi',
      baseURL: 'https://newapi.example',
      apiKey: 'test-key',
    })

    expect(items.map(item => item.model)).toEqual(['gpt-4.1', 'gpt-4.1-mini'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('不会把错误响应里的 success 和 message 误判成模型', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)

      if (url === 'https://proxy.example/v1/models') {
        return okJson({
          success: false,
          message: '无权进行此操作，access token 无效',
        })
      }

      if (url === 'https://proxy.example/models')
        return okJson({ data: [{ id: 'gpt-4.1-mini' }] })

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const items = await discoverProviderModels({
      scope: 'provider',
      provider: 'openai-compatible',
      baseURL: 'https://proxy.example',
      apiKey: 'test-key',
    })

    expect(items.map(item => item.model)).toEqual(['gpt-4.1-mini'])
    expect(items.some(item => item.model === 'success' || item.model === 'message')).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('支持解析 NewAPI 包装过的模型映射结构', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      return okJson({
        success: true,
        data: {
          1: ['gpt-4.1-mini'],
          2: [{ id: 'gpt-4.1', name: 'GPT-4.1' }],
        },
      })
    }))

    const items = await discoverProviderModels({
      scope: 'provider',
      provider: 'newapi',
      baseURL: 'https://newapi.example',
      apiKey: 'test-key',
    })

    expect(items.map(item => item.model)).toEqual(['gpt-4.1', 'gpt-4.1-mini'])
  })
})
