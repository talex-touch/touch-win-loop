export interface SyncPreservationSummaryItem {
  label?: string
  value?: string
  source?: string
  reason?: string
}

export interface SyncPreservationSummarySection {
  key: 'feishu' | 'preserved' | 'fallbacks'
  title: string
  items: SyncPreservationSummaryItem[]
}

type SyncPreservationSummaryPayload = Partial<Record<SyncPreservationSummarySection['key'], SyncPreservationSummaryItem[]>>

function normalizeSummaryItems(value: unknown): SyncPreservationSummaryItem[] {
  if (!Array.isArray(value))
    return []
  return value
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map(item => item as SyncPreservationSummaryItem)
    .filter(item => String(item.label || item.value || item.reason || '').trim())
}

export function syncPreservationSummarySections(payload?: Record<string, unknown> | null): SyncPreservationSummarySection[] {
  const summary = payload?.syncPreservationSummary
  if (!summary || typeof summary !== 'object' || Array.isArray(summary))
    return []
  const source = summary as SyncPreservationSummaryPayload
  return [
    { key: 'feishu' as const, title: 'Feishu 原值', items: normalizeSummaryItems(source.feishu) },
    { key: 'preserved' as const, title: '本地沿用', items: normalizeSummaryItems(source.preserved) },
    { key: 'fallbacks' as const, title: '本地沿用/兜底', items: normalizeSummaryItems(source.fallbacks) },
  ].filter(section => section.items.length > 0)
}

export function syncPreservationSummaryItemText(item: SyncPreservationSummaryItem): string {
  const label = String(item.label || '').trim()
  const value = String(item.value || '').trim()
  const reason = String(item.reason || '').trim()
  const main = [label, value].filter(Boolean).join('：') || '-'
  return reason ? `${main}（${reason}）` : main
}
