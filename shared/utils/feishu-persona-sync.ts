export const PERSONA_SLOT_FIELD_KEYS = ['persona1', 'persona2', 'persona3', 'persona4', 'persona5'] as const

export type FeishuPersonaSlotFieldKey = typeof PERSONA_SLOT_FIELD_KEYS[number]

export interface FeishuPersonaSyncDraft {
  externalId: string
  sourceExternalId: string
  contestExternalId: string
  object: string
  slotIndex: number
  name: string
  summary: string
  systemPrompt: string
  sortOrder: number
  metadata: Record<string, unknown>
}

function normalizeText(raw: unknown): string {
  return String(raw || '').trim()
}

export function normalizeFeishuPersonaPrompt(raw: unknown): string {
  if (Array.isArray(raw)) {
    return raw
      .map(item => normalizeFeishuPersonaPrompt(item))
      .filter(Boolean)
      .join(' ')
      .trim()
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    return normalizeFeishuPersonaPrompt(record.text ?? record.name ?? record.url ?? '')
  }
  return normalizeText(raw)
}

export function buildFeishuPersonaSyncDrafts(input: {
  sourceExternalId: string
  contestExternalId: string
  object: string
  personaTexts: unknown[]
  recordId: string
  recordIndex: number
}): FeishuPersonaSyncDraft[] {
  const sourceExternalId = normalizeText(input.sourceExternalId)
  const contestExternalId = normalizeText(input.contestExternalId)
  const object = normalizeText(input.object)
  const recordId = normalizeText(input.recordId)
  const recordIndex = Math.max(0, Math.trunc(Number(input.recordIndex) || 0))
  if (!sourceExternalId || !contestExternalId || !object)
    return []

  const drafts: FeishuPersonaSyncDraft[] = []
  for (const [index, rawPrompt] of input.personaTexts.entries()) {
    const slotIndex = index + 1
    const systemPrompt = normalizeFeishuPersonaPrompt(rawPrompt)
    if (!systemPrompt)
      continue

    drafts.push({
      externalId: `${sourceExternalId}:${slotIndex}`,
      sourceExternalId,
      contestExternalId,
      object,
      slotIndex,
      name: `${object} · 人设${slotIndex}`,
      summary: summarizeFeishuPersonaPrompt(systemPrompt),
      systemPrompt,
      sortOrder: recordIndex * 10 + slotIndex,
      metadata: {
        source: 'feishu_bitable',
        recordId,
        sourceExternalId,
        slotIndex,
        object,
      },
    })
  }

  return drafts
}

export function summarizeFeishuPersonaPrompt(raw: unknown, maxLength = 120): string {
  const text = normalizeText(raw).replace(/\s+/g, ' ')
  if (!text)
    return ''
  if (text.length <= maxLength)
    return text
  return `${text.slice(0, Math.max(0, maxLength)).trimEnd()}...`
}

export function countFeishuPersonaFilledSlots(personaTexts: unknown[]): number {
  return personaTexts
    .map(item => normalizeFeishuPersonaPrompt(item))
    .filter(Boolean)
    .length
}

export function summarizeFeishuPersonaRowResult(input: {
  createdCount: number
  updatedCount: number
  skippedCount: number
}): string {
  const createdCount = Math.max(0, Math.trunc(Number(input.createdCount) || 0))
  const updatedCount = Math.max(0, Math.trunc(Number(input.updatedCount) || 0))
  const skippedCount = Math.max(0, Math.trunc(Number(input.skippedCount) || 0))
  const total = createdCount + updatedCount + skippedCount
  if (total <= 0)
    return ''
  return `本行拆分 ${total} 个人设：新增 ${createdCount}，更新 ${updatedCount}，跳过 ${skippedCount}。`
}

export function pickFeishuPersonaAggregateStatus(input: {
  createdCount: number
  updatedCount: number
  skippedCount: number
}): 'created' | 'updated' | 'skipped' {
  if (Number(input.updatedCount) > 0)
    return 'updated'
  if (Number(input.createdCount) > 0)
    return 'created'
  return 'skipped'
}

export function computeFeishuPersonaStaleExternalIds(input: {
  existingExternalIds: string[]
  activeExternalIds: string[]
}): string[] {
  const active = new Set(
    input.activeExternalIds
      .map(item => normalizeText(item))
      .filter(Boolean),
  )

  return [...new Set(
    input.existingExternalIds
      .map(item => normalizeText(item))
      .filter(Boolean),
  )].filter(item => !active.has(item))
}
