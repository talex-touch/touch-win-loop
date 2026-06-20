export interface RichTextEditorInlineCompletionContext {
  enabled: boolean
  hasRequestHandler: boolean
  hasAcceptHandler: boolean
  editable: boolean
  focused: boolean
  composing: boolean
  acceptPending: boolean
  suspendUntilNextUserInput: boolean
  linkInputVisible: boolean
  slashMenuVisible: boolean
  hasCollapsedSelection: boolean
  inCodeBlock: boolean
}

export function canRetainInlineCompletionForContext(input: RichTextEditorInlineCompletionContext): boolean {
  return input.enabled
    && input.hasRequestHandler
    && input.hasAcceptHandler
    && input.editable
    && !input.composing
    && !input.acceptPending
    && !input.suspendUntilNextUserInput
    && !input.linkInputVisible
    && !input.slashMenuVisible
    && input.hasCollapsedSelection
    && !input.inCodeBlock
}

export function canStartInlineCompletionForContext(input: RichTextEditorInlineCompletionContext): boolean {
  return input.focused && canRetainInlineCompletionForContext(input)
}

export function shouldCancelInlineCompletionOnBlur(triggeredByOutsidePointerDown: boolean): boolean {
  return triggeredByOutsidePointerDown
}
