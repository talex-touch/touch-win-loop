import type {
  PlatformAiClientType,
  ProjectKnowledgeEmbeddingApiStyle,
} from '~~/shared/types/domain'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizePlatformAiClientType(
  value: unknown,
  fallback: PlatformAiClientType = 'langchain',
): PlatformAiClientType {
  const normalized = normalizeText(value)
  if (normalized === 'bailian-native' || normalized === 'coze-sdk')
    return normalized
  return fallback
}

export function normalizeProjectKnowledgeEmbeddingApiStyle(
  value: unknown,
  fallback: ProjectKnowledgeEmbeddingApiStyle = 'openai-compatible-text',
): ProjectKnowledgeEmbeddingApiStyle {
  return normalizeText(value) === 'bailian-multimodal'
    ? 'bailian-multimodal'
    : fallback
}
