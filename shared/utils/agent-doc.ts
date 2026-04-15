import type {
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentSelectionRange,
} from '~~/shared/types/domain'

export type AgentDocDraftApplyFailureReason
  = 'INVALID_RANGE'
    | 'HASH_MISMATCH'
    | 'SELECTION_MISMATCH'
    | 'CURSOR_MISMATCH'
    | 'UNSUPPORTED_APPLY_MODE'

function normalizeLineBreaks(value: string): string {
  return String(value || '').replace(/\r\n?/g, '\n')
}

function buildLineOffsets(text: string): number[] {
  const offsets = [0]
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n')
      offsets.push(index + 1)
  }
  return offsets
}

function resolveIndexFromLineColumn(text: string, line: number, column: number): number | null {
  const offsets = buildLineOffsets(text)
  const normalizedLine = Math.trunc(Number(line || 0))
  const normalizedColumn = Math.trunc(Number(column || 0))
  if (normalizedLine < 1 || normalizedLine > offsets.length || normalizedColumn < 1)
    return null

  const lineStart = offsets[normalizedLine - 1] || 0
  const nextLineStart = offsets[normalizedLine] ?? text.length
  const lineEnd = normalizedLine < offsets.length ? Math.max(lineStart, nextLineStart - 1) : text.length
  const maxColumn = Math.max(1, lineEnd - lineStart + 1)
  if (normalizedColumn > maxColumn + 1)
    return null

  return Math.max(lineStart, Math.min(lineStart + normalizedColumn - 1, text.length))
}

export function computeAgentDocContentHash(value: string): string {
  const normalized = normalizeLineBreaks(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildAgentDocDraftKey(draft: Pick<
  AiWorkspaceDocumentDraft,
  'resourceId' | 'baseDocumentHash' | 'action' | 'applyMode' | 'proposedText'
>): string {
  return [
    draft.resourceId,
    draft.baseDocumentHash,
    draft.action,
    draft.applyMode,
    computeAgentDocContentHash(draft.proposedText),
  ].join('::')
}

export function resolveAgentDocSelectionIndices(
  markdown: string,
  selectionRange: AiWorkspaceDocumentSelectionRange | null | undefined,
): { from: number, to: number } | null {
  if (!selectionRange)
    return null

  const normalizedMarkdown = normalizeLineBreaks(markdown)
  const anchorIndex = resolveIndexFromLineColumn(
    normalizedMarkdown,
    selectionRange.anchorLine,
    selectionRange.anchorColumn,
  )
  const headIndex = resolveIndexFromLineColumn(
    normalizedMarkdown,
    selectionRange.headLine,
    selectionRange.headColumn,
  )

  if (anchorIndex === null || headIndex === null)
    return null

  return {
    from: Math.min(anchorIndex, headIndex),
    to: Math.max(anchorIndex, headIndex),
  }
}

export function extractAgentDocSelectionText(
  markdown: string,
  selectionRange: AiWorkspaceDocumentSelectionRange | null | undefined,
): string {
  const indices = resolveAgentDocSelectionIndices(markdown, selectionRange)
  if (!indices)
    return ''
  return normalizeLineBreaks(markdown).slice(indices.from, indices.to)
}

export function applyAgentDocDraftToMarkdown(
  markdown: string,
  draft: AiWorkspaceDocumentDraft,
):
  | { ok: true, markdown: string }
  | { ok: false, reason: AgentDocDraftApplyFailureReason } {
  const normalizedMarkdown = normalizeLineBreaks(markdown)
  const normalizedOriginalText = normalizeLineBreaks(draft.originalText)
  const normalizedProposedText = normalizeLineBreaks(draft.proposedText)

  if (computeAgentDocContentHash(normalizedMarkdown) !== String(draft.baseDocumentHash || '').trim())
    return { ok: false, reason: 'HASH_MISMATCH' }

  if (draft.applyMode === 'replace_document') {
    return {
      ok: true,
      markdown: normalizedProposedText,
    }
  }

  const indices = resolveAgentDocSelectionIndices(normalizedMarkdown, draft.selectionRange)
  if (!indices)
    return { ok: false, reason: 'INVALID_RANGE' }

  const currentSelectionText = normalizedMarkdown.slice(indices.from, indices.to)
  if (draft.applyMode === 'replace_selection') {
    if (indices.from === indices.to || currentSelectionText !== normalizedOriginalText)
      return { ok: false, reason: 'SELECTION_MISMATCH' }

    return {
      ok: true,
      markdown: `${normalizedMarkdown.slice(0, indices.from)}${normalizedProposedText}${normalizedMarkdown.slice(indices.to)}`,
    }
  }

  if (draft.applyMode === 'insert_after_selection') {
    if (indices.from === indices.to || currentSelectionText !== normalizedOriginalText)
      return { ok: false, reason: 'SELECTION_MISMATCH' }

    return {
      ok: true,
      markdown: `${normalizedMarkdown.slice(0, indices.to)}${normalizedProposedText}${normalizedMarkdown.slice(indices.to)}`,
    }
  }

  if (draft.applyMode === 'insert_at_cursor') {
    if (indices.from !== indices.to)
      return { ok: false, reason: 'CURSOR_MISMATCH' }

    return {
      ok: true,
      markdown: `${normalizedMarkdown.slice(0, indices.from)}${normalizedProposedText}${normalizedMarkdown.slice(indices.from)}`,
    }
  }

  return { ok: false, reason: 'UNSUPPORTED_APPLY_MODE' }
}
