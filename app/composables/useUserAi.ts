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

export function useUserAiApi() {
  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)

  async function loadSettings(): Promise<UserAiSettings> {
    const response = await $fetch<ApiResponse<UserAiSettings>>(endpoint('/user/ai/settings'))
    return normalizeSettings(response.data)
  }

  async function patchSettings(payload: PatchUserAiSettingsPayload): Promise<UserAiSettings> {
    const response = await $fetch<ApiResponse<UserAiSettings>>(endpoint('/user/ai/settings'), {
      method: 'PATCH',
      body: payload,
    })
    return normalizeSettings(response.data)
  }

  async function loadModelCatalog(): Promise<AiModelCatalog> {
    const response = await $fetch<ApiResponse<AiModelCatalog>>(endpoint('/user/ai/models'))
    return normalizeCatalog(response.data)
  }

  return {
    loadSettings,
    patchSettings,
    loadModelCatalog,
  }
}
