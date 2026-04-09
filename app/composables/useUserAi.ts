import type {
  AiModelCatalog,
  ApiResponse,
  UserAiSettings,
} from '~~/shared/types/domain'

export interface PatchUserAiSettingsPayload {
  memoryEnabled?: boolean
  pilotEnabled?: boolean
  reasoningEnabled?: boolean
  networkEnabled?: boolean
  temperature?: number
  selectedModelGroup?: string
  selectedModelId?: string
}

export function defaultUserAiSettings(): UserAiSettings {
  return {
    memoryEnabled: true,
    pilotEnabled: false,
    reasoningEnabled: false,
    networkEnabled: false,
    temperature: 0.2,
    selectedModelGroup: 'auto',
    selectedModelId: 'auto',
  }
}

export function defaultAiModelCatalog(): AiModelCatalog {
  return {
    groups: [
      {
        key: 'auto',
        label: 'Auto',
        options: [
          {
            id: 'auto',
            label: 'Auto',
          },
        ],
      },
    ],
  }
}

function normalizeTemperature(raw: unknown, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed))
    return fallback
  return Math.max(0, Math.min(1, parsed))
}

function normalizeSettings(input: UserAiSettings | null | undefined): UserAiSettings {
  const defaults = defaultUserAiSettings()
  if (!input)
    return defaults

  return {
    memoryEnabled: typeof input.memoryEnabled === 'boolean' ? input.memoryEnabled : defaults.memoryEnabled,
    pilotEnabled: typeof input.pilotEnabled === 'boolean' ? input.pilotEnabled : defaults.pilotEnabled,
    reasoningEnabled: typeof input.reasoningEnabled === 'boolean' ? input.reasoningEnabled : defaults.reasoningEnabled,
    networkEnabled: typeof input.networkEnabled === 'boolean' ? input.networkEnabled : defaults.networkEnabled,
    temperature: normalizeTemperature(input.temperature, defaults.temperature),
    selectedModelGroup: String(input.selectedModelGroup || defaults.selectedModelGroup),
    selectedModelId: String(input.selectedModelId || defaults.selectedModelId),
    updatedAt: input.updatedAt,
  }
}

function normalizeCatalog(input: AiModelCatalog | null | undefined): AiModelCatalog {
  const fallback = defaultAiModelCatalog()
  if (!input || !Array.isArray(input.groups) || input.groups.length === 0)
    return fallback

  const hasAuto = input.groups.some(group => group.key === 'auto')
  if (hasAuto)
    return input

  return {
    groups: [fallback.groups[0]!, ...input.groups],
  }
}

async function parseApiResponse<T>(response: Response, fallbackMessage: string): Promise<ApiResponse<T>> {
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw new Error(String(payload?.message || fallbackMessage))
  return payload
}

export function useUserAiApi() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  async function loadSettings(): Promise<UserAiSettings> {
    const response = await fetch(String(endpoint('/user/ai/settings')), {
      credentials: 'include',
    })
    const payload = await parseApiResponse<UserAiSettings>(response, 'AI 设置加载失败。')
    return normalizeSettings(payload.data)
  }

  async function patchSettings(payload: PatchUserAiSettingsPayload): Promise<UserAiSettings> {
    const response = await fetch(String(endpoint('/user/ai/settings')), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const result = await parseApiResponse<UserAiSettings>(response, 'AI 设置保存失败。')
    return normalizeSettings(result.data)
  }

  async function loadModelCatalog(): Promise<AiModelCatalog> {
    const response = await fetch(String(endpoint('/user/ai/models')), {
      credentials: 'include',
    })
    const payload = await parseApiResponse<AiModelCatalog>(response, '模型目录加载失败。')
    return normalizeCatalog(payload.data)
  }

  return {
    loadSettings,
    patchSettings,
    loadModelCatalog,
  }
}
