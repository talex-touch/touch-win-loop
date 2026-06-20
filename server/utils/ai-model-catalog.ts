import type { RuntimeSettings } from '~~/server/utils/env'
import type { AiModelCatalog, AiModelGroup, AiModelOption } from '~~/shared/types/domain'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'

export const AUTO_MODEL_GROUP_KEY = 'auto'
export const AUTO_MODEL_ID = 'auto'

interface ParsedCatalogPayload {
  groups?: unknown
}

export interface ResolvedAiModelSelection {
  selectedModelGroup: string
  selectedModelId: string
  provider: string
  model: string
  label: string
}

function toNonEmptyString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeOption(raw: unknown): AiModelOption | null {
  if (!raw || typeof raw !== 'object')
    return null

  const record = raw as Record<string, unknown>
  const provider = toNonEmptyString(record.provider)
  const model = toNonEmptyString(record.model)
  const id = toNonEmptyString(record.id) || (provider && model ? `${provider}:${model}` : '')
  const label = toNonEmptyString(record.label) || model || id

  if (!id || !label)
    return null

  return {
    id,
    label,
    provider: provider || undefined,
    model: model || undefined,
    description: toNonEmptyString(record.description) || undefined,
  }
}

function normalizeGroup(raw: unknown, index: number): AiModelGroup | null {
  if (!raw || typeof raw !== 'object')
    return null

  const record = raw as Record<string, unknown>
  const key = toNonEmptyString(record.key) || `group_${index + 1}`
  if (key.toLowerCase() === AUTO_MODEL_GROUP_KEY)
    return null

  const label = toNonEmptyString(record.label) || key
  const options = Array.isArray(record.options)
    ? record.options
        .map(option => normalizeOption(option))
        .filter((option): option is AiModelOption => Boolean(option))
    : []

  if (options.length === 0)
    return null

  return {
    key,
    label,
    options,
  }
}

function parseConfiguredGroups(modelCatalogJson: string): AiModelGroup[] {
  const raw = modelCatalogJson.trim()
  if (!raw)
    return []

  try {
    const parsed = JSON.parse(raw) as ParsedCatalogPayload | unknown[]
    const groups = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as ParsedCatalogPayload).groups)
        ? (parsed as ParsedCatalogPayload).groups as unknown[]
        : []

    const normalized = groups
      .map((group, index) => normalizeGroup(group, index))
      .filter((group): group is AiModelGroup => Boolean(group))

    return normalized
  }
  catch {
    return []
  }
}

export function createAutoModelGroup(runtime: RuntimeSettings): AiModelGroup {
  const sceneRuntime = resolveAiRuntimeForChannel(runtime, 'project_chat')
  return {
    key: AUTO_MODEL_GROUP_KEY,
    label: '跟随场景',
    options: [
      {
        id: AUTO_MODEL_ID,
        label: '跟随场景',
        provider: sceneRuntime.ai.provider,
        model: sceneRuntime.ai.model,
        description: sceneRuntime.ai.model
          ? `跟随项目聊天场景：${sceneRuntime.ai.model}`
          : '跟随项目聊天场景；当前场景未配置',
      },
    ],
  }
}

export function resolveAiModelCatalog(runtime: RuntimeSettings): AiModelCatalog {
  return {
    groups: [
      createAutoModelGroup(runtime),
      ...parseConfiguredGroups(runtime.ai.modelCatalogJson),
    ],
  }
}

export function resolveAiModelSelection(
  runtime: RuntimeSettings,
  catalog: AiModelCatalog,
  selectedModelGroup?: string,
  selectedModelId?: string,
): ResolvedAiModelSelection {
  const sceneRuntime = resolveAiRuntimeForChannel(runtime, 'project_chat')
  const groupKey = toNonEmptyString(selectedModelGroup) || AUTO_MODEL_GROUP_KEY
  const modelId = toNonEmptyString(selectedModelId) || AUTO_MODEL_ID

  if (groupKey !== AUTO_MODEL_GROUP_KEY) {
    const group = catalog.groups.find(item => item.key === groupKey)
    const option = group?.options.find(item => item.id === modelId)
    if (group && option && option.provider && option.model) {
      return {
        selectedModelGroup: group.key,
        selectedModelId: option.id,
        provider: option.provider,
        model: option.model,
        label: option.label,
      }
    }
  }

  return {
    selectedModelGroup: AUTO_MODEL_GROUP_KEY,
    selectedModelId: AUTO_MODEL_ID,
    provider: sceneRuntime.ai.provider,
    model: sceneRuntime.ai.model,
    label: '跟随场景',
  }
}
