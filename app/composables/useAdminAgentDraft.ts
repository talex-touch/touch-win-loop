import type { AdminDraftModule } from '~~/shared/types/domain'

interface AdminAgentDraftEntry {
  contestId: string
  module: AdminDraftModule
  title: string
  summary: string
  payload: Record<string, unknown>
  updatedAt: string
}

type DraftState = Record<string, AdminAgentDraftEntry>

const STORAGE_KEY = 'winloop.admin.agent.drafts.v1'

function toStorageKey(contestId: string, module: AdminDraftModule): string {
  return `${contestId}:${module}`
}

function normalizeDraftState(source: unknown): DraftState {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return {}

  const result: DraftState = {}
  const entries = Object.entries(source as Record<string, unknown>)

  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      continue

    const item = value as Partial<AdminAgentDraftEntry>
    const contestId = String(item.contestId || '').trim()
    const module = item.module as AdminDraftModule

    if (!contestId || !module)
      continue

    result[key] = {
      contestId,
      module,
      title: String(item.title || '').trim(),
      summary: String(item.summary || '').trim(),
      payload: item.payload && typeof item.payload === 'object' && !Array.isArray(item.payload)
        ? item.payload as Record<string, unknown>
        : {},
      updatedAt: String(item.updatedAt || new Date().toISOString()),
    }
  }

  return result
}

export function useAdminAgentDraft() {
  const drafts = useState<DraftState>('admin-agent-draft-state', () => ({}))
  const loaded = useState<boolean>('admin-agent-draft-loaded', () => false)

  const ensureLoaded = () => {
    if (!import.meta.client || loaded.value)
      return

    loaded.value = true
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return

    try {
      const parsed = JSON.parse(raw)
      drafts.value = normalizeDraftState(parsed)
    }
    catch {
      drafts.value = {}
    }
  }

  const persist = () => {
    if (!import.meta.client)
      return

    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.value))
  }

  const getDraft = (contestId: string, module: AdminDraftModule): AdminAgentDraftEntry | null => {
    ensureLoaded()
    const key = toStorageKey(String(contestId || '').trim(), module)
    return drafts.value[key] || null
  }

  const listDrafts = (contestId: string): AdminAgentDraftEntry[] => {
    ensureLoaded()
    const normalizedContestId = String(contestId || '').trim()
    if (!normalizedContestId)
      return []

    return Object.values(drafts.value)
      .filter(item => item.contestId === normalizedContestId)
      .sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1)
  }

  const setDraft = (
    contestId: string,
    module: AdminDraftModule,
    payload: Record<string, unknown>,
    meta: { title?: string, summary?: string } = {},
  ): AdminAgentDraftEntry | null => {
    ensureLoaded()
    const normalizedContestId = String(contestId || '').trim()
    if (!normalizedContestId)
      return null

    const next: AdminAgentDraftEntry = {
      contestId: normalizedContestId,
      module,
      title: String(meta.title || '').trim() || 'AI 草稿',
      summary: String(meta.summary || '').trim(),
      payload,
      updatedAt: new Date().toISOString(),
    }

    drafts.value = {
      ...drafts.value,
      [toStorageKey(normalizedContestId, module)]: next,
    }
    persist()
    return next
  }

  const clearDraft = (contestId: string, module: AdminDraftModule): void => {
    ensureLoaded()
    const key = toStorageKey(String(contestId || '').trim(), module)
    if (!drafts.value[key])
      return

    const next = { ...drafts.value }
    delete next[key]
    drafts.value = next
    persist()
  }

  const clearContestDrafts = (contestId: string): void => {
    ensureLoaded()
    const normalizedContestId = String(contestId || '').trim()
    if (!normalizedContestId)
      return

    const next: DraftState = {}
    for (const [key, value] of Object.entries(drafts.value)) {
      if (value.contestId !== normalizedContestId)
        next[key] = value
    }
    drafts.value = next
    persist()
  }

  return {
    getDraft,
    listDrafts,
    setDraft,
    clearDraft,
    clearContestDrafts,
  }
}
