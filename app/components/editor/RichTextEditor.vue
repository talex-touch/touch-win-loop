<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type {
  AiWorkspaceDocumentAction,
  AiWorkspaceDocumentDraft,
  AiWorkspaceDocumentSelectionRange,
  AiWorkspaceInlineCompletionAcceptResult,
  AiWorkspaceInlineCompletionResult,
  ProjectResourceCommentImageNodeAnchor,
  ProjectResourceCommentTextSelectionAnchor,
  ProjectResourceCommentThread,
  WorkspaceFontSizePreset,
} from '~~/shared/types/domain'
import type { CollabMarkdownHeadingLevel } from '~~/shared/utils/collab-rich-text-schema'
import type { RichTextEditorCommand } from '~/components/editor/rich-text-editor-commands'
import type { RichTextEditorImageNodeActionPayload } from '~/components/editor/rich-text-editor-image-extension'
import type {
  WorkspaceCollabAwarenessSelectionState,
  WorkspaceCollabSelectionSummary,
} from '~/components/workspace/collab/presence'
import type { CollabMarkdownHeadingAnchorItem, CollabMarkdownHeadingItem } from '~/utils/collab-markdown-navigation'
import { Extension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import Placeholder from '@tiptap/extension-placeholder'
import { AllSelection, NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Editor, EditorContent } from '@tiptap/vue-3'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
  yCursorPlugin,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import {
  applyAgentDocDraftToMarkdown,
  computeAgentDocContentHash,
} from '~~/shared/utils/agent-doc'
import {
  parseMarkdownToRichTextDocument,
  readMarkdownFromRichText,
  writeRichTextDocumentToFragment,
} from '~~/shared/utils/collab-markdown-rich-text'
import { COLLAB_NOTES_RESOURCE_LABEL } from '~~/shared/utils/collab-resource'
import {
  COLLAB_MARKDOWN_CODE_LANGUAGES,
  COLLAB_MARKDOWN_HEADING_LEVELS,
  createCollabMarkdownBaseExtensions,
} from '~~/shared/utils/collab-rich-text-schema'
import { buildRichTextEditorCommands } from '~/components/editor/rich-text-editor-commands'
import {
  createRichTextEditorImageExtension,
} from '~/components/editor/rich-text-editor-image-extension'
import {
  canRetainInlineCompletionForContext,
  canStartInlineCompletionForContext,
  shouldCancelInlineCompletionOnBlur,
} from '~/components/editor/rich-text-editor-inline-completion'
import {
  attachCollabMarkdownHeadingAnchors,
  buildCollabMarkdownHeadingSectionRanges,
  resolveCollabMarkdownCollapsedHeadingAncestors,
} from '~/utils/collab-markdown-navigation'

interface RichTextEditorCurrentUser {
  id: string
  name: string
  color: string
}

interface RichTextEditorImageUploadResult {
  src: string
  alt?: string
  title?: string
  resourceId?: string
}

interface RichTextEditorSelectionChangePayload extends WorkspaceCollabSelectionSummary {
  line: number
  column: number
}

interface RichTextEditorInlineCompletionRequestPayload {
  requestKey: string
  selectionRange: AiWorkspaceDocumentSelectionRange
  signal?: AbortSignal
}

interface RichTextEditorInlineCompletionAcceptPayload {
  requestKey: string
  suggestion: string
  selectionRange: AiWorkspaceDocumentSelectionRange
}

interface RichTextEditorOutlineItem {
  pos: number
  level: CollabMarkdownHeadingLevel
  text: string
  nodeSize: number
  occurrence: number
  anchorId: string
}

interface SlashCommandRange {
  from: number
  to: number
}

interface RichTextEditorSearchMatch {
  from: number
  to: number
}

interface RichTextEditorCodeBlockState {
  pos: number
  text: string
  language: string
  top: number
  left: number
}

const props = withDefaults(defineProps<{
  doc: Y.Doc | null
  awareness?: Awareness | null
  currentUser?: RichTextEditorCurrentUser | null
  editable?: boolean
  placeholder?: string
  headingLevels?: CollabMarkdownHeadingLevel[]
  showToolbar?: boolean
  contentMaxWidth?: number | string
  resourceId?: string | null
  enableSlashMenu?: boolean
  uiFontSizePreset?: WorkspaceFontSizePreset
  enableComments?: boolean
  commentThreads?: ProjectResourceCommentThread[]
  activeCommentThreadId?: string
  enableInlineCompletion?: boolean
  inlineCompletionRequestHandler?: ((payload: RichTextEditorInlineCompletionRequestPayload) => Promise<AiWorkspaceInlineCompletionResult | null>) | null
  inlineCompletionAcceptHandler?: ((payload: RichTextEditorInlineCompletionAcceptPayload) => Promise<AiWorkspaceInlineCompletionAcceptResult | null>) | null
  imageUploadHandler?: ((file: File) => Promise<RichTextEditorImageUploadResult>) | null
}>(), {
  awareness: null,
  currentUser: null,
  editable: true,
  placeholder: `输入正文或标题，${COLLAB_NOTES_RESOURCE_LABEL}会实时同步`,
  headingLevels: () => [...COLLAB_MARKDOWN_HEADING_LEVELS],
  showToolbar: true,
  contentMaxWidth: '1040px',
  resourceId: null,
  enableSlashMenu: false,
  uiFontSizePreset: 'md',
  enableComments: false,
  commentThreads: () => [],
  activeCommentThreadId: '',
  enableInlineCompletion: false,
  inlineCompletionRequestHandler: null,
  inlineCompletionAcceptHandler: null,
  imageUploadHandler: null,
})

const emit = defineEmits<{
  selectionChange: [value: RichTextEditorSelectionChangePayload]
  remotePresenceChange: [value: WorkspaceCollabAwarenessSelectionState[]]
  primaryHeadingChange: [value: string]
  outlineChange: [value: CollabMarkdownHeadingAnchorItem[]]
  createCommentFromSelection: [value: ProjectResourceCommentTextSelectionAnchor]
  createCommentFromImage: [value: ProjectResourceCommentImageNodeAnchor]
  openCommentThread: [threadId: string]
  requestImageAction: [value: RichTextEditorImageNodeActionPayload]
}>()

const editor = shallowRef<Editor | null>(null)
const editorScrollRef = ref<HTMLElement | null>(null)
const linkDraft = ref('https://')
const linkInputVisible = ref(false)
const linkInputRef = ref<HTMLInputElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const outlineSearchInputRef = ref<HTMLInputElement | null>(null)
const pendingImageInsertPosition = ref<number | null>(null)
const outlineItems = ref<RichTextEditorOutlineItem[]>([])
const activeOutlineHeadingPos = ref<number | null>(null)
const lastPrimaryHeadingTitle = ref('')
const inlineSearchVisible = ref(false)
const outlineSearchQuery = ref('')
const outlineSearchMatches = ref<RichTextEditorSearchMatch[]>([])
const activeOutlineSearchMatchIndex = ref(0)
const collapsedHeadingPositions = ref<number[]>([])
const lastOutlineSignature = ref('')
const activeCodeBlockState = shallowRef<RichTextEditorCodeBlockState | null>(null)
const codeBlockCopyFeedback = ref(false)
const slashMenuState = reactive({
  visible: false,
  query: '',
  top: 0,
  left: 0,
  rangeFrom: 0,
  rangeTo: 0,
  selectedIndex: 0,
})
const selectionToolbarState = reactive({
  visible: false,
  top: 0,
  left: 0,
})
const headingMenuState = reactive({
  visible: false,
  top: 0,
  left: 0,
})
const inlineCompletionState = reactive({
  suggestionText: '',
  requestKey: '',
  suggestionKey: '',
  loadingRequestKey: '',
  suppressedRequestKey: '',
  suppressedUntil: 0,
  acceptPending: false,
  suspendUntilNextUserInput: false,
  focused: false,
  composing: false,
})
const editorChromePluginKey = new PluginKey('rich-text-editor-navigation')
const searchDecorationPluginKey = new PluginKey('rich-text-editor-search')
const inlineCompletionPluginKey = new PluginKey('rich-text-editor-inline-completion')
let codeBlockCopyTimer: ReturnType<typeof setTimeout> | null = null
let inlineCompletionDebounceTimer: ReturnType<typeof setTimeout> | null = null
let inlineCompletionAbortController: AbortController | null = null
const INLINE_COMPLETION_RETRY_COOLDOWN_MS = 15_000

const normalizedHeadingLevels = computed<CollabMarkdownHeadingLevel[]>(() => {
  const dedupe = new Set<CollabMarkdownHeadingLevel>()
  for (const level of props.headingLevels) {
    if (level >= 1 && level <= 6)
      dedupe.add(level)
  }

  const levels = [...dedupe].sort((left, right) => left - right)
  return levels.length > 0 ? levels : [...COLLAB_MARKDOWN_HEADING_LEVELS]
})

const commandItems = computed(() => {
  return buildRichTextEditorCommands(normalizedHeadingLevels.value, {
    includeImageCommand: Boolean(props.imageUploadHandler),
    includeCommentCommand: props.enableComments,
  })
})

const toolbarItems = computed(() => {
  return commandItems.value.filter(item => item.toolbarVisible !== false)
})

const selectionToolbarInlineItems = computed(() => {
  const actionWhitelist = new Set<RichTextEditorCommand['action']>([
    'bold',
    'italic',
    'underline',
    'strike',
    'link',
    'code',
    'comment',
  ])
  return commandItems.value.filter(item => actionWhitelist.has(item.action))
})

const blockTypeMenuItems = computed(() => {
  return commandItems.value.filter(item => item.action === 'paragraph' || item.action === 'heading')
})

const currentBlockTypeCommand = computed(() => {
  const instance = editor.value
  if (!instance)
    return blockTypeMenuItems.value[0] || null

  for (const item of blockTypeMenuItems.value) {
    if (item.action === 'paragraph' && instance.isActive('paragraph'))
      return item

    if (item.action === 'heading' && item.level && instance.isActive('heading', { level: item.level }))
      return item
  }

  return blockTypeMenuItems.value[0] || null
})

const slashMenuItems = computed(() => {
  const instance = editor.value
  const query = normalizeSearchValue(slashMenuState.query)
  const hasSelection = Boolean(instance && !instance.state.selection.empty)

  return commandItems.value.filter((item) => {
    if (item.group === 'inline' && !hasSelection)
      return false

    if (!query)
      return true

    if (normalizeSearchValue(item.label).includes(query))
      return true

    return (item.keywords || []).some(keyword => normalizeSearchValue(keyword).includes(query))
  })
})

const normalizedContentMaxWidth = computed(() => {
  if (typeof props.contentMaxWidth === 'number' && Number.isFinite(props.contentMaxWidth) && props.contentMaxWidth > 0)
    return `${props.contentMaxWidth}px`

  const normalized = normalizeString(props.contentMaxWidth)
  return normalized || '1040px'
})

const editorTypographyScale = computed(() => {
  if (props.uiFontSizePreset === 'xs')
    return 0.9
  if (props.uiFontSizePreset === 'sm')
    return 0.96
  if (props.uiFontSizePreset === 'lg')
    return 1.08
  if (props.uiFontSizePreset === 'xl')
    return 1.16
  return 1
})

const editorInlineStyle = computed(() => {
  return {
    '--rich-text-editor-content-max-width': normalizedContentMaxWidth.value,
    '--rich-text-editor-font-2xs': `calc(10px * ${editorTypographyScale.value})`,
    '--rich-text-editor-font-xs': `calc(11px * ${editorTypographyScale.value})`,
    '--rich-text-editor-font-sm': `calc(12px * ${editorTypographyScale.value})`,
    '--rich-text-editor-font-md': `calc(13px * ${editorTypographyScale.value})`,
    '--rich-text-editor-font-lg': `calc(14px * ${editorTypographyScale.value})`,
    '--rich-text-editor-body-size': `calc(16px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-1-size': `calc(32px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-2-size': `calc(28px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-3-size': `calc(22px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-4-size': `calc(18px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-5-size': `calc(16px * ${editorTypographyScale.value})`,
    '--rich-text-editor-heading-6-size': `calc(15px * ${editorTypographyScale.value})`,
  }
})

const slashMenuStyle = computed(() => {
  return {
    top: `${slashMenuState.top}px`,
    left: `${slashMenuState.left}px`,
  }
})

const selectionToolbarStyle = computed(() => {
  const metrics = resolveSelectionToolbarMetrics()
  return {
    'top': `${selectionToolbarState.top}px`,
    'left': `${selectionToolbarState.left}px`,
    '--rich-text-editor-selection-toolbar-height': `${metrics.height}px`,
    '--rich-text-editor-selection-toolbar-padding': `${metrics.padding}px`,
    '--rich-text-editor-selection-toolbar-gap': `${metrics.gap}px`,
    '--rich-text-editor-selection-toolbar-button-size': `${metrics.buttonSize}px`,
    '--rich-text-editor-selection-toolbar-font-size': `${metrics.fontSize}px`,
    '--rich-text-editor-selection-toolbar-icon-size': `${metrics.iconSize}px`,
  }
})

const headingMenuStyle = computed(() => {
  return {
    top: `${headingMenuState.top}px`,
    left: `${headingMenuState.left}px`,
  }
})

const codeBlockToolbarStyle = computed(() => {
  if (!activeCodeBlockState.value) {
    return {
      top: '0px',
      left: '0px',
    }
  }

  return {
    top: `${activeCodeBlockState.value.top}px`,
    left: `${activeCodeBlockState.value.left}px`,
  }
})

const codeBlockLanguageOptions = computed(() => {
  const currentLanguage = normalizeString(activeCodeBlockState.value?.language)
  const options: Array<{ value: string, label: string }> = COLLAB_MARKDOWN_CODE_LANGUAGES.map((language) => {
    if (language === 'plaintext')
      return { value: language, label: '纯文本' }
    if (language === 'javascript')
      return { value: language, label: 'JavaScript' }
    if (language === 'typescript')
      return { value: language, label: 'TypeScript' }
    return { value: language, label: language.toUpperCase() }
  })

  if (currentLanguage && !options.some(item => item.value === currentLanguage))
    options.unshift({ value: currentLanguage, label: currentLanguage })

  return options
})

const outlineSearchResultLabel = computed(() => {
  if (!outlineSearchQuery.value)
    return '搜索正文'

  if (outlineSearchMatches.value.length === 0)
    return '0 个结果'

  return `${activeOutlineSearchMatchIndex.value + 1}/${outlineSearchMatches.value.length}`
})

let removeAwarenessListener: (() => void) | null = null
let removeWindowResizeListener: (() => void) | null = null
let removeDocumentPointerDownListener: (() => void) | null = null
let removeDocumentPointerUpListener: (() => void) | null = null
let removeDocumentPointerCancelListener: (() => void) | null = null
let inlineCompletionPointerDownOutsideEditor = false
const commentDecorationPluginKey = new PluginKey('rich-text-editor-comments')

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized || null
}

function normalizeSearchValue(value: unknown): string {
  return normalizeString(value).toLowerCase()
}

function copyTextWithFallback(text: string): boolean {
  if (!import.meta.client || !text)
    return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }

  document.body.removeChild(textarea)
  return copied
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  if (!text)
    return false

  if (import.meta.client && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    }
    catch {
      // ignore clipboard permission errors and fallback to execCommand
    }
  }

  return copyTextWithFallback(text)
}

function normalizePreviewText(value: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized)
    return ''
  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized
}

function normalizeImageUploadPlaceholderName(file: File): string {
  return normalizeString(file.name) || '图片'
}

function createImageUploadId(file: File): string {
  const normalizedName = normalizeImageUploadPlaceholderName(file)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  return `markdown-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${normalizedName || 'asset'}`
}

function normalizeOutlineText(value: string, level: CollabMarkdownHeadingLevel): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized || `H${level}`
}

function normalizeRouteHash(hash: string): string {
  const normalized = normalizeString(hash).replace(/^#/, '')
  if (!normalized)
    return ''

  try {
    return decodeURIComponent(normalized)
  }
  catch {
    return normalized
  }
}

function resolveSelectionToolbarMetrics() {
  if (props.uiFontSizePreset === 'xs') {
    return {
      width: 286,
      height: 36,
      padding: 4,
      gap: 4,
      buttonSize: 28,
      fontSize: 11,
      iconSize: 16,
    }
  }

  if (props.uiFontSizePreset === 'sm') {
    return {
      width: 296,
      height: 38,
      padding: 4,
      gap: 4,
      buttonSize: 30,
      fontSize: 11,
      iconSize: 17,
    }
  }

  if (props.uiFontSizePreset === 'lg') {
    return {
      width: 332,
      height: 42,
      padding: 5,
      gap: 5,
      buttonSize: 32,
      fontSize: 12,
      iconSize: 19,
    }
  }

  if (props.uiFontSizePreset === 'xl') {
    return {
      width: 348,
      height: 44,
      padding: 5,
      gap: 6,
      buttonSize: 34,
      fontSize: 12,
      iconSize: 20,
    }
  }

  return {
    width: 312,
    height: 40,
    padding: 4,
    gap: 5,
    buttonSize: 31,
    fontSize: 12,
    iconSize: 18,
  }
}

function normalizeSelectionPosition(doc: any, position: number): { line: number, column: number } {
  const boundedPosition = Math.max(0, Math.min(Number(position || 0), Number(doc?.content?.size || 0)))
  const textBefore = doc.textBetween(0, boundedPosition, '\n', '\n')
  const lines = String(textBefore || '').split('\n')
  const lastLine = lines[lines.length - 1] || ''
  return {
    line: Math.max(1, lines.length),
    column: Math.max(1, lastLine.length + 1),
  }
}

function buildSelectionSummary(doc: any, anchor: number, head: number): WorkspaceCollabSelectionSummary {
  const anchorPosition = normalizeSelectionPosition(doc, anchor)
  const headPosition = normalizeSelectionPosition(doc, head)
  const from = Math.max(0, Math.min(anchor, head))
  const to = Math.max(0, Math.max(anchor, head))
  const selectedText = doc.textBetween(from, to, '\n', '\n')
  return {
    anchorLine: anchorPosition.line,
    anchorColumn: anchorPosition.column,
    headLine: headPosition.line,
    headColumn: headPosition.column,
    isCollapsed: from === to,
    selectionLength: String(selectedText || '').length,
    selectedText: String(selectedText || ''),
    selectedTextPreview: normalizePreviewText(String(selectedText || '')),
  }
}

function toDocumentSelectionRange(summary: WorkspaceCollabSelectionSummary | null): AiWorkspaceDocumentSelectionRange | null {
  if (!summary)
    return null
  return {
    anchorLine: summary.anchorLine,
    anchorColumn: summary.anchorColumn,
    headLine: summary.headLine,
    headColumn: summary.headColumn,
    isCollapsed: summary.isCollapsed,
    selectionLength: summary.selectionLength,
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function logInlineCompletionDebug(event: string, payload?: Record<string, unknown>): void {
  console.warn('[inline-completion]', {
    event,
    resourceId: normalizeString(props.resourceId),
    requestKey: inlineCompletionState.requestKey || inlineCompletionState.loadingRequestKey || inlineCompletionState.suggestionKey || '',
    ...(payload || {}),
  })
}

function clearInlineCompletionDebounce(): void {
  if (!inlineCompletionDebounceTimer)
    return
  clearTimeout(inlineCompletionDebounceTimer)
  inlineCompletionDebounceTimer = null
}

function abortInlineCompletionRequest(reason = 'abort'): void {
  if (!inlineCompletionAbortController)
    return
  logInlineCompletionDebug('editor-request-abort', {
    reason,
  })
  inlineCompletionAbortController.abort(reason)
  inlineCompletionAbortController = null
}

function refreshInlineCompletionDecorations(): void {
  const instance = editor.value
  if (!instance)
    return
  instance.view.dispatch(instance.state.tr.setMeta(inlineCompletionPluginKey, Date.now()))
}

function cancelInlineCompletionRequest(reason = 'manual-cancel'): void {
  clearInlineCompletionState({
    cancelPendingRequest: true,
    reason,
  })
}

function clearInlineCompletionState(options?: {
  cancelPendingRequest?: boolean
  resetSuspend?: boolean
  reason?: string
}): void {
  const shouldRefreshDecorations = Boolean(
    inlineCompletionState.suggestionText
    || inlineCompletionState.suggestionKey
    || inlineCompletionState.loadingRequestKey,
  )

  if (options?.cancelPendingRequest !== false) {
    clearInlineCompletionDebounce()
    abortInlineCompletionRequest(options?.reason || 'clear-state')
    inlineCompletionState.requestKey = ''
  }

  if (inlineCompletionState.suggestionText || inlineCompletionState.suggestionKey || inlineCompletionState.loadingRequestKey) {
    if (options?.reason) {
      logInlineCompletionDebug('editor-state-cleared', {
        reason: options.reason,
        hadSuggestion: Boolean(inlineCompletionState.suggestionText),
        hadLoading: Boolean(inlineCompletionState.loadingRequestKey),
      })
    }
    inlineCompletionState.suggestionText = ''
    inlineCompletionState.suggestionKey = ''
    inlineCompletionState.loadingRequestKey = ''
  }

  if (options?.resetSuspend)
    inlineCompletionState.suspendUntilNextUserInput = false

  if (options?.resetSuspend) {
    inlineCompletionState.suppressedRequestKey = ''
    inlineCompletionState.suppressedUntil = 0
  }

  if (shouldRefreshDecorations)
    refreshInlineCompletionDecorations()
}

function suppressInlineCompletionRequest(requestKey: string): void {
  inlineCompletionState.suppressedRequestKey = requestKey
  inlineCompletionState.suppressedUntil = Date.now() + INLINE_COMPLETION_RETRY_COOLDOWN_MS
}

function clearInlineCompletionSuppression(): void {
  inlineCompletionState.suppressedRequestKey = ''
  inlineCompletionState.suppressedUntil = 0
}

function isInlineCompletionRequestSuppressed(requestKey: string): boolean {
  if (
    !requestKey
    || inlineCompletionState.suppressedRequestKey !== requestKey
    || inlineCompletionState.suppressedUntil <= 0
  ) {
    return false
  }

  if (inlineCompletionState.suppressedUntil <= Date.now()) {
    clearInlineCompletionSuppression()
    return false
  }

  return true
}

function noteInlineCompletionUserInput(): void {
  if (inlineCompletionState.suspendUntilNextUserInput)
    inlineCompletionState.suspendUntilNextUserInput = false
  clearInlineCompletionSuppression()
}

function isInlineCompletionUserInputKey(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey)
    return false
  if (event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter')
    return true
  return event.key.length === 1
}

function buildInlineCompletionContext(state: any) {
  const selection = state?.selection
  return {
    enabled: Boolean(props.enableInlineCompletion),
    hasRequestHandler: Boolean(props.inlineCompletionRequestHandler),
    hasAcceptHandler: Boolean(props.inlineCompletionAcceptHandler),
    editable: Boolean(props.editable),
    focused: inlineCompletionState.focused,
    composing: inlineCompletionState.composing,
    acceptPending: inlineCompletionState.acceptPending,
    suspendUntilNextUserInput: inlineCompletionState.suspendUntilNextUserInput,
    linkInputVisible: linkInputVisible.value,
    slashMenuVisible: slashMenuState.visible,
    hasCollapsedSelection: Boolean(selection && selection.empty === true),
    inCodeBlock: Boolean(resolveActiveCodeBlock()),
  }
}

function canRetainInlineCompletionState(state: any): boolean {
  return canRetainInlineCompletionForContext(buildInlineCompletionContext(state))
}

function canStartInlineCompletionState(state: any): boolean {
  return canStartInlineCompletionForContext(buildInlineCompletionContext(state))
}

function isInlineCompletionTargetInsideEditor(target: EventTarget | null): boolean {
  const editorDom = editor.value?.view.dom
  return Boolean(editorDom && target instanceof Node && editorDom.contains(target))
}

function setInlineCompletionPointerDownContext(target: EventTarget | null): void {
  if (!inlineCompletionState.focused) {
    inlineCompletionPointerDownOutsideEditor = false
    return
  }

  inlineCompletionPointerDownOutsideEditor = !isInlineCompletionTargetInsideEditor(target)
}

function resetInlineCompletionPointerDownContext(): void {
  inlineCompletionPointerDownOutsideEditor = false
}

function buildInlineCompletionRequestKeyFromState(state: any): string {
  const resourceId = normalizeString(props.resourceId)
  const selection = state?.selection
  if (!resourceId || !selection || selection.empty !== true)
    return ''

  const position = Math.max(0, Number(selection.from || 0))
  const start = Math.max(0, position - 80)
  const end = Math.min(Number(state?.doc?.content?.size || 0), position + 80)
  const contextText = String(state?.doc?.textBetween(start, end, '\n', '\n') || '')
  return `${resourceId}::${position}::${Number(state?.doc?.content?.size || 0)}::${contextText}`
}

function buildInlineCompletionSelectionRangeFromState(state: any): AiWorkspaceDocumentSelectionRange | null {
  const selection = state?.selection
  if (!selection || selection.empty !== true)
    return null
  const summary = buildSelectionSummary(state.doc, selection.anchor, selection.head)
  return toDocumentSelectionRange(summary)
}

function buildInlineCompletionGhostElement(text: string): HTMLElement {
  const container = document.createElement('span')
  container.className = 'rich-text-editor__inline-completion'

  const segments = String(text || '').split('\n')
  segments.forEach((segment, index) => {
    if (index > 0)
      container.appendChild(document.createElement('br'))

    const textNode = document.createElement('span')
    textNode.textContent = segment
    container.appendChild(textNode)
  })

  const hint = document.createElement('span')
  hint.className = 'rich-text-editor__inline-completion-hint'
  hint.setAttribute('aria-hidden', 'true')

  const hintKey = document.createElement('span')
  hintKey.className = 'rich-text-editor__inline-completion-hint-key'
  hintKey.textContent = 'Tab'
  hint.appendChild(hintKey)

  const hintLabel = document.createElement('span')
  hintLabel.className = 'rich-text-editor__inline-completion-hint-label'
  hintLabel.textContent = '接受'
  hint.appendChild(hintLabel)

  container.appendChild(hint)

  return container
}

function buildInlineCompletionLoadingElement(requestKey: string): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'rich-text-editor__inline-completion-loading'
  button.setAttribute('aria-label', '取消自动补齐请求')
  button.title = '取消自动补齐请求'

  const spinner = document.createElement('span')
  spinner.className = 'rich-text-editor__inline-completion-loading-spinner'
  spinner.setAttribute('aria-hidden', 'true')
  button.appendChild(spinner)

  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (
      inlineCompletionState.requestKey === requestKey
      || inlineCompletionState.loadingRequestKey === requestKey
    ) {
      cancelInlineCompletionRequest('loading-button-click')
    }
  })

  return button
}

function buildInlineCompletionDecorations(state: any): DecorationSet {
  if (!props.editable)
    return DecorationSet.empty

  const selection = state?.selection
  if (!selection || selection.empty !== true)
    return DecorationSet.empty

  const currentRequestKey = buildInlineCompletionRequestKeyFromState(state)
  if (!currentRequestKey)
    return DecorationSet.empty

  const decorations: Decoration[] = []
  if (
    inlineCompletionState.suggestionText
    && inlineCompletionState.suggestionKey
    && currentRequestKey === inlineCompletionState.suggestionKey
  ) {
    decorations.push(Decoration.widget(selection.from, () => buildInlineCompletionGhostElement(inlineCompletionState.suggestionText), {
      side: 1,
      ignoreSelection: true,
    }))
  }
  else if (
    inlineCompletionState.loadingRequestKey
    && currentRequestKey === inlineCompletionState.loadingRequestKey
  ) {
    decorations.push(Decoration.widget(selection.from, () => buildInlineCompletionLoadingElement(currentRequestKey), {
      side: 1,
      ignoreSelection: true,
    }))
  }

  return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
}

function createInlineCompletionExtension() {
  return Extension.create({
    name: 'workspace-inline-completion',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: inlineCompletionPluginKey,
          props: {
            decorations: state => buildInlineCompletionDecorations(state),
          },
        }),
      ]
    },
  })
}

async function runInlineCompletionRequest(requestKey: string): Promise<void> {
  const instance = editor.value
  const requestHandler = props.inlineCompletionRequestHandler
  if (!instance || !requestHandler)
    return

  const selectionRange = buildInlineCompletionSelectionRangeFromState(instance.state)
  if (!selectionRange?.isCollapsed) {
    inlineCompletionState.requestKey = ''
    return
  }

  const controller = new AbortController()
  inlineCompletionAbortController = controller
  inlineCompletionState.loadingRequestKey = requestKey
  logInlineCompletionDebug('editor-request-start', {
    requestKey,
    selectionRange,
  })
  refreshInlineCompletionDecorations()

  try {
    const result = await requestHandler({
      requestKey,
      selectionRange,
      signal: controller.signal,
    })

    if (inlineCompletionAbortController !== controller || inlineCompletionState.requestKey !== requestKey)
      return

    inlineCompletionState.requestKey = ''
    inlineCompletionState.loadingRequestKey = ''
    const suggestion = String(result?.suggestion || '')
    if (!suggestion) {
      logInlineCompletionDebug('editor-request-empty', {
        requestKey,
      })
      suppressInlineCompletionRequest(requestKey)
      clearInlineCompletionState({
        cancelPendingRequest: false,
        reason: 'empty-suggestion',
      })
      return
    }

    if (!canRetainInlineCompletionState(instance.state) || buildInlineCompletionRequestKeyFromState(instance.state) !== requestKey) {
      clearInlineCompletionState({
        cancelPendingRequest: false,
        reason: 'drop-stale-result',
      })
      return
    }

    clearInlineCompletionSuppression()
    inlineCompletionState.suggestionText = suggestion
    inlineCompletionState.suggestionKey = requestKey
    logInlineCompletionDebug('editor-request-success', {
      requestKey,
      suggestionLength: suggestion.length,
    })
    refreshInlineCompletionDecorations()
  }
  catch (error) {
    if (isAbortError(error)) {
      logInlineCompletionDebug('editor-request-cancelled', {
        requestKey,
        reason: controller.signal.reason ?? 'AbortError',
      })
      return
    }
    inlineCompletionState.requestKey = ''
    inlineCompletionState.loadingRequestKey = ''
    logInlineCompletionDebug('editor-request-error', {
      requestKey,
      message: error instanceof Error ? (error.message || error.name || 'UNKNOWN_ERROR') : 'UNKNOWN_ERROR',
    })
    suppressInlineCompletionRequest(requestKey)
    clearInlineCompletionState({
      cancelPendingRequest: false,
      reason: 'request-error',
    })
  }
  finally {
    if (inlineCompletionAbortController === controller)
      inlineCompletionAbortController = null
    if (inlineCompletionState.loadingRequestKey === requestKey) {
      inlineCompletionState.loadingRequestKey = ''
      refreshInlineCompletionDecorations()
    }
  }
}

function syncInlineCompletion(): void {
  const instance = editor.value
  if (!instance) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
      resetSuspend: true,
      reason: 'editor-unavailable',
    })
    return
  }

  const nextRequestKey = buildInlineCompletionRequestKeyFromState(instance.state)
  if (!canRetainInlineCompletionState(instance.state) || !nextRequestKey) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
      reason: 'context-invalid',
    })
    return
  }

  if (isInlineCompletionRequestSuppressed(nextRequestKey))
    return

  const hasMatchingSuggestion = Boolean(
    inlineCompletionState.suggestionText
    && inlineCompletionState.suggestionKey === nextRequestKey,
  )
  const hasMatchingLoadingRequest = inlineCompletionState.loadingRequestKey === nextRequestKey
  const hasMatchingPendingRequest = inlineCompletionState.requestKey === nextRequestKey
  const hasMatchingState = hasMatchingSuggestion || hasMatchingLoadingRequest || hasMatchingPendingRequest
  const hasInlineCompletionState = Boolean(
    inlineCompletionState.suggestionKey
    || inlineCompletionState.loadingRequestKey
    || inlineCompletionState.requestKey,
  )

  if (!hasMatchingState && hasInlineCompletionState) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
      reason: 'request-key-changed',
    })
  }

  if (hasMatchingSuggestion || hasMatchingLoadingRequest || hasMatchingPendingRequest)
    return

  if (!canStartInlineCompletionState(instance.state))
    return

  clearInlineCompletionState({
    cancelPendingRequest: true,
    reason: 'start-new-request',
  })
  inlineCompletionState.requestKey = nextRequestKey
  inlineCompletionDebounceTimer = setTimeout(() => {
    void runInlineCompletionRequest(nextRequestKey)
  }, 600)
}

async function acceptInlineCompletionSuggestion(): Promise<boolean> {
  const instance = editor.value
  const acceptHandler = props.inlineCompletionAcceptHandler
  const suggestion = String(inlineCompletionState.suggestionText || '')
  const suggestionKey = inlineCompletionState.suggestionKey
  if (!instance || !acceptHandler || !suggestion || !suggestionKey || inlineCompletionState.acceptPending)
    return false

  const selectionRange = buildInlineCompletionSelectionRangeFromState(instance.state)
  if (!selectionRange?.isCollapsed)
    return false

  inlineCompletionState.acceptPending = true

  try {
    if (buildInlineCompletionRequestKeyFromState(instance.state) !== suggestionKey) {
      clearInlineCompletionState({
        cancelPendingRequest: true,
      })
      return false
    }

    inlineCompletionState.suspendUntilNextUserInput = true
    clearInlineCompletionState({
      cancelPendingRequest: true,
    })
    instance.chain().focus().insertContent(suggestion).run()
    void acceptHandler({
      requestKey: suggestionKey,
      suggestion,
      selectionRange,
    }).catch(() => undefined)
    return true
  }
  catch {
    return false
  }
  finally {
    inlineCompletionState.acceptPending = false
  }
}

function resolvePrimaryHeadingTitle(): string {
  const instance = editor.value
  if (!instance)
    return ''

  for (let index = 0; index < instance.state.doc.childCount; index += 1) {
    const node = instance.state.doc.child(index)
    const text = normalizeString(node.textContent)
    const isMeaningful = node.type.name === 'image'
      || node.type.name === 'table'
      || node.type.name === 'horizontalRule'
      || Boolean(text)

    if (!isMeaningful)
      continue

    if (node.type.name !== 'heading' || Number(node.attrs?.level) !== 1)
      return ''

    return text
  }

  return ''
}

function emitPrimaryHeadingChange(): void {
  const nextTitle = resolvePrimaryHeadingTitle()
  if (nextTitle === lastPrimaryHeadingTitle.value)
    return
  lastPrimaryHeadingTitle.value = nextTitle
  emit('primaryHeadingChange', nextTitle)
}

function buildCommentSelectionAnchor(): ProjectResourceCommentTextSelectionAnchor | null {
  const instance = editor.value
  const doc = props.doc
  if (!instance || !doc)
    return null

  const { selection } = instance.state
  if (selection.empty)
    return null

  const syncState = ySyncPluginKey.getState(instance.state)
  const mapping = syncState?.binding?.mapping
  if (!mapping)
    return null

  try {
    const fragment = doc.getXmlFragment('prosemirror')
    const anchor = absolutePositionToRelativePosition(selection.anchor, fragment, mapping)
    const head = absolutePositionToRelativePosition(selection.head, fragment, mapping)
    const summary = buildSelectionSummary(instance.state.doc, selection.anchor, selection.head)
    return {
      type: 'text_selection',
      anchor: JSON.parse(JSON.stringify(anchor)),
      head: JSON.parse(JSON.stringify(head)),
      selectedTextPreview: summary.selectedTextPreview,
      headingText: resolvePrimaryHeadingTitle(),
      anchorLine: summary.anchorLine,
      anchorColumn: summary.anchorColumn,
      headLine: summary.headLine,
      headColumn: summary.headColumn,
      selectionLength: summary.selectionLength,
      isCollapsed: summary.isCollapsed,
    }
  }
  catch {
    return null
  }
}

function emitCommentFromSelection(): void {
  const anchor = buildCommentSelectionAnchor()
  if (anchor)
    emit('createCommentFromSelection', anchor)
}

function buildCommentMarker(threadId: string, active: boolean): HTMLElement {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = 'rich-text-editor__comment-marker'
  if (active)
    marker.classList.add('rich-text-editor__comment-marker--active')
  marker.dataset.commentThreadId = threadId
  marker.setAttribute('aria-label', '打开评论线程')
  marker.textContent = '评'
  return marker
}

function resolveCommentThreadSelection(thread: ProjectResourceCommentThread, state: any): { from: number, to: number } | null {
  if (thread.anchor.type !== 'text_selection')
    return null

  const instance = editor.value
  const doc = props.doc
  if (!instance || !doc)
    return null

  const syncState = ySyncPluginKey.getState(state)
  const mapping = syncState?.binding?.mapping
  if (!mapping)
    return null

  try {
    const fragment = doc.getXmlFragment('prosemirror')
    const anchor = relativePositionToAbsolutePosition(
      doc,
      fragment,
      Y.createRelativePositionFromJSON(thread.anchor.anchor),
      mapping,
    )
    const head = relativePositionToAbsolutePosition(
      doc,
      fragment,
      Y.createRelativePositionFromJSON(thread.anchor.head),
      mapping,
    )
    if (anchor === null || head === null)
      return null
    return {
      from: Math.max(0, Math.min(anchor, head)),
      to: Math.max(0, Math.max(anchor, head)),
    }
  }
  catch {
    return null
  }
}

function buildCommentDecorations(state: any): DecorationSet {
  if (!props.enableComments || props.commentThreads.length === 0)
    return DecorationSet.empty

  const decorations: Decoration[] = []
  const activeThreadId = normalizeString(props.activeCommentThreadId)
  for (const thread of props.commentThreads) {
    const selection = resolveCommentThreadSelection(thread, state)
    if (!selection)
      continue

    const active = thread.id === activeThreadId
    if (selection.from < selection.to) {
      decorations.push(Decoration.inline(selection.from, selection.to, {
        'class': active
          ? 'rich-text-editor__comment-selection rich-text-editor__comment-selection--active'
          : 'rich-text-editor__comment-selection',
        'data-comment-thread-id': thread.id,
      }))
    }

    decorations.push(Decoration.widget(selection.to, () => buildCommentMarker(thread.id, active), {
      side: 1,
    }))
  }

  return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
}

function createCommentExtension() {
  return Extension.create({
    name: 'workspace-comment-threads',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentDecorationPluginKey,
          props: {
            decorations: state => buildCommentDecorations(state),
            handleClick(_view, _pos, event) {
              const target = event.target
              if (!(target instanceof HTMLElement))
                return false
              const threadId = normalizeString(target.closest('[data-comment-thread-id]')?.getAttribute('data-comment-thread-id'))
              if (!threadId)
                return false
              emit('openCommentThread', threadId)
              return true
            },
          },
        }),
      ]
    },
  })
}

function buildCursorElement(user: { color?: string, name?: string }): HTMLElement {
  const cursor = document.createElement('span')
  cursor.className = 'rich-text-editor__remote-caret'
  cursor.style.borderColor = normalizeString(user.color) || '#2563eb'

  const label = document.createElement('span')
  label.className = 'rich-text-editor__remote-caret-label'
  label.style.backgroundColor = normalizeString(user.color) || '#2563eb'
  label.textContent = normalizeString(user.name) || '协作者'
  cursor.append(label)
  return cursor
}

function createCollabCursorExtension(awareness: Awareness) {
  return Extension.create({
    name: 'workspace-collab-cursor',
    addProseMirrorPlugins() {
      return [yCursorPlugin(awareness, {
        cursorBuilder: buildCursorElement,
        selectionBuilder: (user) => {
          return {
            class: 'rich-text-editor__remote-selection',
            style: `--collab-selection-color: ${normalizeString(user?.color) || '#2563eb'};`,
          }
        },
      })]
    },
  })
}

function defaultSelectionChangePayload(): RichTextEditorSelectionChangePayload {
  return {
    line: 1,
    column: 1,
    anchorLine: 1,
    anchorColumn: 1,
    headLine: 1,
    headColumn: 1,
    isCollapsed: true,
    selectionLength: 0,
    selectedText: '',
    selectedTextPreview: '',
  }
}

function collectOutlineItemsFromDoc(doc: any): RichTextEditorOutlineItem[] {
  if (!doc)
    return []

  const items: CollabMarkdownHeadingItem[] = []
  doc.descendants((node: any, pos: number) => {
    if (node.type.name !== 'heading')
      return true

    const level = Number(node.attrs?.level)
    if (!Number.isFinite(level) || level < 1 || level > 6)
      return true

    items.push({
      pos,
      level: level as CollabMarkdownHeadingLevel,
      text: normalizeOutlineText(String(node.textContent || ''), level as CollabMarkdownHeadingLevel),
      nodeSize: Math.max(0, Number(node.nodeSize || 0)),
    })
    return true
  })

  return attachCollabMarkdownHeadingAnchors(items, normalizeString(props.resourceId))
}

function collectOutlineItems(): RichTextEditorOutlineItem[] {
  const instance = editor.value
  if (!instance)
    return []
  return collectOutlineItemsFromDoc(instance.state.doc)
}

function syncOutlineHeadingMarkers(): void {
  const instance = editor.value
  if (!instance || !import.meta.client)
    return

  for (const item of outlineItems.value) {
    const headingDom = instance.view.nodeDOM(item.pos)
    if (headingDom instanceof HTMLElement) {
      headingDom.dataset.outlineHeadingPos = String(item.pos)
      if (item.anchorId)
        headingDom.id = item.anchorId
      else
        headingDom.removeAttribute('id')
      headingDom.dataset.headingAnchor = item.anchorId
      headingDom.dataset.headingLevel = String(item.level)
      headingDom.classList.toggle('rich-text-editor__heading--collapsed', collapsedHeadingPositions.value.includes(item.pos))
    }
  }
}

function buildHeadingSectionRanges() {
  const instance = editor.value
  if (!instance)
    return []
  return buildCollabMarkdownHeadingSectionRanges(outlineItems.value, instance.state.doc.content.size)
}

function expandCollapsedHeadingsForPosition(position: number): boolean {
  const currentPositions = new Set(collapsedHeadingPositions.value)
  if (currentPositions.size === 0)
    return false

  const ancestors = resolveCollabMarkdownCollapsedHeadingAncestors(buildHeadingSectionRanges(), position)
    .filter(pos => currentPositions.has(pos))

  if (ancestors.length === 0)
    return false

  collapsedHeadingPositions.value = collapsedHeadingPositions.value.filter(pos => !ancestors.includes(pos))
  return true
}

function toggleCollapsedHeading(position: number): void {
  const normalizedPosition = Math.max(0, Math.trunc(Number(position) || 0))
  const currentPositions = new Set(collapsedHeadingPositions.value)
  if (currentPositions.has(normalizedPosition))
    currentPositions.delete(normalizedPosition)
  else
    currentPositions.add(normalizedPosition)
  collapsedHeadingPositions.value = [...currentPositions].sort((left, right) => left - right)
}

function createHeadingFoldToggle(headingPos: number, collapsed: boolean): HTMLElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'rich-text-editor__heading-fold-toggle'
  button.dataset.headingPos = String(headingPos)
  button.setAttribute('aria-label', collapsed ? '展开章节' : '折叠章节')
  button.title = collapsed ? '展开章节' : '折叠章节'
  button.setAttribute('data-testid', 'rich-text-editor-heading-fold-toggle')

  const icon = document.createElement('span')
  icon.className = 'material-symbols-outlined'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = collapsed ? 'chevron_right' : 'expand_more'
  button.append(icon)

  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    toggleCollapsedHeading(headingPos)
  })

  return button
}

function buildSearchMatches(doc: any, query: string): RichTextEditorSearchMatch[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery)
    return []

  const matches: RichTextEditorSearchMatch[] = []
  doc.descendants((node: any, pos: number) => {
    if (!node?.isText || !node.text)
      return true

    const content = String(node.text || '')
    const lowerContent = content.toLowerCase()
    let startIndex = 0
    while (startIndex < lowerContent.length) {
      const matchedIndex = lowerContent.indexOf(normalizedQuery, startIndex)
      if (matchedIndex < 0)
        break

      matches.push({
        from: pos + matchedIndex,
        to: pos + matchedIndex + normalizedQuery.length,
      })
      startIndex = matchedIndex + normalizedQuery.length
    }
    return true
  })

  return matches
}

function syncOutlineSearchMatches(): void {
  const instance = editor.value
  if (!instance) {
    outlineSearchMatches.value = []
    activeOutlineSearchMatchIndex.value = 0
    return
  }

  const matches = buildSearchMatches(instance.state.doc, outlineSearchQuery.value)
  outlineSearchMatches.value = matches
  if (matches.length === 0) {
    activeOutlineSearchMatchIndex.value = 0
    return
  }

  activeOutlineSearchMatchIndex.value = Math.max(0, Math.min(activeOutlineSearchMatchIndex.value, matches.length - 1))
}

function refreshSearchDecorations(): void {
  const instance = editor.value
  if (!instance)
    return
  instance.view.dispatch(instance.state.tr.setMeta(searchDecorationPluginKey, Date.now()))
}

function createSearchExtension() {
  return Extension.create({
    name: 'workspace-document-search',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: searchDecorationPluginKey,
          props: {
            decorations(state) {
              const matches = buildSearchMatches(state.doc, outlineSearchQuery.value)
              if (matches.length === 0)
                return DecorationSet.empty

              const decorations = matches.map((match, index) => {
                return Decoration.inline(match.from, match.to, {
                  class: index === activeOutlineSearchMatchIndex.value
                    ? 'rich-text-editor__search-match rich-text-editor__search-match--active'
                    : 'rich-text-editor__search-match',
                })
              })
              return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
            },
          },
        }),
      ]
    },
  })
}

function refreshEditorChromeDecorations(): void {
  const instance = editor.value
  if (!instance)
    return
  instance.view.dispatch(instance.state.tr.setMeta(editorChromePluginKey, Date.now()))
}

function createEditorChromeExtension() {
  return Extension.create({
    name: 'workspace-editor-chrome',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: editorChromePluginKey,
          props: {
            decorations(state) {
              const headingItems = collectOutlineItemsFromDoc(state.doc)
              if (headingItems.length === 0)
                return DecorationSet.empty

              const collapsedHeadingSet = new Set(collapsedHeadingPositions.value)
              const decorations: Decoration[] = []

              for (const item of headingItems) {
                decorations.push(Decoration.widget(item.pos + 1, () => {
                  return createHeadingFoldToggle(item.pos, collapsedHeadingSet.has(item.pos))
                }, {
                  side: -1,
                }))
              }

              const collapsedRanges = buildCollabMarkdownHeadingSectionRanges(headingItems, state.doc.content.size)
                .filter(range => collapsedHeadingSet.has(range.headingPos))
                .sort((left, right) => left.from - right.from)

              if (collapsedRanges.length > 0) {
                state.doc.forEach((node, offset) => {
                  const position = Math.max(0, offset)
                  const hidden = collapsedRanges.some(range => position >= range.from && position < range.to)
                  if (!hidden)
                    return

                  decorations.push(Decoration.node(position, position + node.nodeSize, {
                    class: 'rich-text-editor__fold-hidden',
                  }))
                })
              }

              return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty
            },
          },
        }),
      ]
    },
  })
}

function resolveActiveOutlineHeading(): number | null {
  const instance = editor.value
  const scroller = editorScrollRef.value
  if (!instance || !scroller || outlineItems.value.length === 0)
    return null

  const scrollerRect = scroller.getBoundingClientRect()
  let activePos: number | null = outlineItems.value[0]?.pos ?? null
  for (const item of outlineItems.value) {
    const headingDom = instance.view.nodeDOM(item.pos)
    if (!(headingDom instanceof HTMLElement))
      continue

    const top = headingDom.getBoundingClientRect().top - scrollerRect.top
    if (top <= 96)
      activePos = item.pos
    else
      break
  }

  return activePos
}

function syncOutlineState(): void {
  outlineItems.value = collectOutlineItems()
  const outlineSignature = JSON.stringify(outlineItems.value.map(item => ({
    id: item.anchorId,
    pos: item.pos,
    level: item.level,
    text: item.text,
  })))
  if (outlineSignature !== lastOutlineSignature.value) {
    lastOutlineSignature.value = outlineSignature
    emit('outlineChange', outlineItems.value.map(item => ({ ...item })))
  }
  nextTick(() => {
    syncOutlineHeadingMarkers()
    syncOutlineActiveHeading()
  })
}

function syncOutlineActiveHeading(): void {
  activeOutlineHeadingPos.value = resolveActiveOutlineHeading()
}

function scrollToOutlineHeading(item: RichTextEditorOutlineItem): void {
  const instance = editor.value
  const scroller = editorScrollRef.value
  if (!instance || !scroller)
    return

  const expanded = expandCollapsedHeadingsForPosition(item.pos)
  if (expanded) {
    nextTick(() => {
      syncOutlineHeadingMarkers()
      scrollToOutlineHeading(item)
    })
    return
  }

  const selectionPosition = Math.min(item.pos + 1, instance.state.doc.content.size)
  instance.chain().focus().setTextSelection(selectionPosition).run()

  nextTick(() => {
    const headingDom = instance.view.nodeDOM(item.pos)
    if (headingDom instanceof HTMLElement) {
      scroller.scrollTo({
        top: Math.max(0, headingDom.offsetTop - 28),
        behavior: 'smooth',
      })
    }
    activeOutlineHeadingPos.value = item.pos
  })
}

function focusOutlineSearchInput(): void {
  nextTick(() => {
    outlineSearchInputRef.value?.focus()
    outlineSearchInputRef.value?.select()
  })
}

function openInlineSearch(): boolean {
  inlineSearchVisible.value = true
  focusOutlineSearchInput()
  return true
}

function closeInlineSearch(options: { keepQuery?: boolean } = {}): void {
  inlineSearchVisible.value = false
  if (!options.keepQuery)
    clearOutlineSearch()
}

function clearOutlineSearch(): void {
  outlineSearchQuery.value = ''
  outlineSearchMatches.value = []
  activeOutlineSearchMatchIndex.value = 0
}

function scrollToDocumentPosition(position: number, behavior: ScrollBehavior = 'smooth'): void {
  const instance = editor.value
  const scroller = editorScrollRef.value
  if (!instance || !scroller)
    return

  const targetPosition = Math.max(0, Math.min(position, instance.state.doc.content.size))
  instance.chain().focus().setTextSelection(targetPosition).run()
  nextTick(() => {
    const coords = instance.view.coordsAtPos(targetPosition)
    const scrollerRect = scroller.getBoundingClientRect()
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + coords.top - scrollerRect.top - 120),
      behavior,
    })
  })
}

function jumpToOutlineSearchMatch(index: number, behavior: ScrollBehavior = 'smooth'): void {
  const matches = outlineSearchMatches.value
  if (matches.length === 0)
    return

  const nextIndex = (index + matches.length) % matches.length
  activeOutlineSearchMatchIndex.value = nextIndex
  refreshSearchDecorations()

  const match = matches[nextIndex]
  if (!match)
    return

  const expanded = expandCollapsedHeadingsForPosition(match.from)
  if (expanded) {
    nextTick(() => {
      syncOutlineHeadingMarkers()
      jumpToOutlineSearchMatch(nextIndex, behavior)
    })
    return
  }

  scrollToDocumentPosition(match.from, behavior)
}

function jumpToNextOutlineSearchMatch(): void {
  if (outlineSearchMatches.value.length === 0)
    return
  jumpToOutlineSearchMatch(activeOutlineSearchMatchIndex.value + 1)
}

function jumpToPreviousOutlineSearchMatch(): void {
  if (outlineSearchMatches.value.length === 0)
    return
  jumpToOutlineSearchMatch(activeOutlineSearchMatchIndex.value - 1)
}

function onOutlineSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (event.shiftKey)
      jumpToPreviousOutlineSearchMatch()
    else
      jumpToNextOutlineSearchMatch()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeInlineSearch()
    editor.value?.commands.focus()
  }
}

function findOutlineItemByAnchorId(anchorId: string): RichTextEditorOutlineItem | null {
  const normalizedAnchorId = normalizeRouteHash(anchorId)
  if (!normalizedAnchorId)
    return null
  return outlineItems.value.find(item => item.anchorId === normalizedAnchorId) || null
}

function scrollToHeadingAnchor(anchorId: string): boolean {
  const item = findOutlineItemByAnchorId(anchorId)
  if (!item)
    return false
  scrollToOutlineHeading(item)
  return true
}

function resolveActiveCodeBlock(): { pos: number, node: any } | null {
  const instance = editor.value
  if (!instance)
    return null

  const { selection } = instance.state
  if (selection instanceof NodeSelection && selection.node?.type?.name === 'codeBlock') {
    return {
      pos: selection.from,
      node: selection.node,
    }
  }

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth)
    if (node.type.name !== 'codeBlock')
      continue

    return {
      pos: selection.$from.before(depth),
      node,
    }
  }

  return null
}

function syncActiveCodeBlockState(): void {
  const instance = editor.value
  const scroller = editorScrollRef.value
  if (!instance || !scroller) {
    activeCodeBlockState.value = null
    return
  }

  const activeCodeBlock = resolveActiveCodeBlock()
  if (!activeCodeBlock) {
    activeCodeBlockState.value = null
    return
  }

  const codeBlockDom = instance.view.nodeDOM(activeCodeBlock.pos)
  if (!(codeBlockDom instanceof HTMLElement)) {
    activeCodeBlockState.value = null
    return
  }

  const scrollerRect = scroller.getBoundingClientRect()
  const codeBlockRect = codeBlockDom.getBoundingClientRect()
  activeCodeBlockState.value = {
    pos: activeCodeBlock.pos,
    text: String(activeCodeBlock.node.textContent || ''),
    language: normalizeString(activeCodeBlock.node.attrs?.language) || 'plaintext',
    top: scroller.scrollTop + codeBlockRect.top - scrollerRect.top + 8,
    left: Math.max(0, scroller.scrollLeft + codeBlockRect.right - scrollerRect.left - 188),
  }
}

function updateActiveCodeBlockLanguage(language: string): void {
  const instance = editor.value
  const activeCodeBlock = activeCodeBlockState.value
  const normalizedLanguage = normalizeString(language)
  if (!instance || !activeCodeBlock || !normalizedLanguage)
    return

  const node = instance.state.doc.nodeAt(activeCodeBlock.pos)
  if (!node || node.type.name !== 'codeBlock')
    return

  instance.view.dispatch(instance.state.tr.setNodeMarkup(activeCodeBlock.pos, undefined, {
    ...node.attrs,
    language: normalizedLanguage,
  }))
}

function onCodeBlockLanguageChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement))
    return
  updateActiveCodeBlockLanguage(target.value)
}

async function copyActiveCodeBlockText(): Promise<void> {
  const activeCodeBlock = activeCodeBlockState.value
  if (!activeCodeBlock?.text)
    return

  const copied = await writeTextToClipboard(activeCodeBlock.text)
  if (!copied)
    return

  codeBlockCopyFeedback.value = true
  if (codeBlockCopyTimer)
    clearTimeout(codeBlockCopyTimer)
  codeBlockCopyTimer = setTimeout(() => {
    codeBlockCopyFeedback.value = false
    codeBlockCopyTimer = null
  }, 1400)
}

function closeLinkEditor(nextValue = 'https://'): void {
  linkDraft.value = nextValue
  linkInputVisible.value = false
  nextTick(() => {
    syncSelectionToolbar()
  })
}

function closeHeadingMenu(): void {
  headingMenuState.visible = false
  headingMenuState.top = 0
  headingMenuState.left = 0
}

function syncHeadingMenuPosition(): void {
  if (!selectionToolbarState.visible || !headingMenuState.visible)
    return

  const metrics = resolveSelectionToolbarMetrics()
  const top = selectionToolbarState.top + metrics.height + 8
  headingMenuState.top = import.meta.client
    ? Math.max(12, Math.min(top, window.innerHeight - 260))
    : top
  headingMenuState.left = selectionToolbarState.left
}

function toggleHeadingMenu(): void {
  if (!selectionToolbarState.visible)
    return

  if (headingMenuState.visible) {
    closeHeadingMenu()
    return
  }

  headingMenuState.visible = true
  syncHeadingMenuPosition()
}

function openLinkEditor(): void {
  const instance = editor.value
  if (!instance || !props.editable)
    return

  const activeHref = normalizeString(instance.getAttributes('link').href)
  linkDraft.value = activeHref || 'https://'
  linkInputVisible.value = true
  closeSelectionToolbar()

  nextTick(() => {
    linkInputRef.value?.focus()
    linkInputRef.value?.select()
  })
}

function submitLinkDraft(): void {
  const instance = editor.value
  if (!instance || !props.editable)
    return

  const normalizedHref = normalizeString(linkDraft.value)
  if (!normalizedHref) {
    closeLinkEditor()
    return
  }

  instance.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run()
  closeLinkEditor()
}

function emitSelectionChange(): void {
  const instance = editor.value
  if (!instance) {
    emit('selectionChange', defaultSelectionChangePayload())
    return
  }

  const summary = buildSelectionSummary(instance.state.doc, instance.state.selection.anchor, instance.state.selection.head)
  emit('selectionChange', {
    line: summary.headLine,
    column: summary.headColumn,
    ...summary,
  })
}

function emitRemotePresenceChange(): void {
  const instance = editor.value
  const awareness = props.awareness
  const doc = props.doc
  if (!instance || !awareness || !doc) {
    emit('remotePresenceChange', [])
    return
  }

  const syncState = ySyncPluginKey.getState(instance.state)
  const mapping = syncState?.binding?.mapping
  if (!mapping) {
    emit('remotePresenceChange', [])
    return
  }

  const fragment = doc.getXmlFragment('prosemirror')
  const remoteStates: WorkspaceCollabAwarenessSelectionState[] = []
  awareness.getStates().forEach((state, awarenessClientId) => {
    if (awarenessClientId === awareness.clientID)
      return

    const userId = normalizeString(state?.user?.id || state?.user?.userId)
    if (!userId)
      return

    const anchorRelativePosition = state?.cursor?.anchor
    const headRelativePosition = state?.cursor?.head
    if (!anchorRelativePosition || !headRelativePosition) {
      remoteStates.push({
        awarenessClientId,
        userId,
        selection: null,
      })
      return
    }

    try {
      const anchor = relativePositionToAbsolutePosition(
        doc,
        fragment,
        Y.createRelativePositionFromJSON(anchorRelativePosition),
        mapping,
      )
      const head = relativePositionToAbsolutePosition(
        doc,
        fragment,
        Y.createRelativePositionFromJSON(headRelativePosition),
        mapping,
      )
      if (anchor === null || head === null) {
        remoteStates.push({
          awarenessClientId,
          userId,
          selection: null,
        })
        return
      }

      remoteStates.push({
        awarenessClientId,
        userId,
        selection: buildSelectionSummary(instance.state.doc, anchor, head),
      })
    }
    catch {
      remoteStates.push({
        awarenessClientId,
        userId,
        selection: null,
      })
    }
  })

  emit('remotePresenceChange', remoteStates)
}

function closeSlashMenu(): void {
  slashMenuState.visible = false
  slashMenuState.query = ''
  slashMenuState.top = 0
  slashMenuState.left = 0
  slashMenuState.rangeFrom = 0
  slashMenuState.rangeTo = 0
  slashMenuState.selectedIndex = 0
}

function closeSelectionToolbar(): void {
  selectionToolbarState.visible = false
  selectionToolbarState.top = 0
  selectionToolbarState.left = 0
  closeHeadingMenu()
}

function resolveSlashCommandTrigger() {
  const instance = editor.value
  if (!instance || !props.editable || !props.enableSlashMenu || linkInputVisible.value)
    return null

  const { selection } = instance.state
  if (!selection.empty)
    return null

  const parent = selection.$from.parent
  if (!parent || parent.type.name === 'codeBlock')
    return null

  const textBefore = parent.textBetween(0, selection.$from.parentOffset, '\n', '\n')
  const matched = textBefore.match(/(?:^|\s)\/([^\s/]*)$/)
  if (!matched)
    return null

  const slashIndex = textBefore.lastIndexOf('/')
  if (slashIndex < 0)
    return null

  const query = String(matched[1] || '')
  const from = selection.from - (textBefore.length - slashIndex)
  const to = selection.from
  const coords = instance.view.coordsAtPos(selection.from)
  const left = import.meta.client ? Math.max(12, Math.min(coords.left, window.innerWidth - 280)) : coords.left
  const top = import.meta.client ? Math.max(12, Math.min(coords.bottom + 8, window.innerHeight - 240)) : coords.bottom + 8

  return {
    query,
    from,
    to,
    left,
    top,
  }
}

function syncSlashMenu(): void {
  const trigger = resolveSlashCommandTrigger()
  if (!trigger) {
    closeSlashMenu()
    return
  }

  const shouldResetIndex = slashMenuState.query !== trigger.query
  slashMenuState.visible = true
  slashMenuState.query = trigger.query
  slashMenuState.rangeFrom = trigger.from
  slashMenuState.rangeTo = trigger.to
  slashMenuState.left = trigger.left
  slashMenuState.top = trigger.top
  if (shouldResetIndex)
    slashMenuState.selectedIndex = 0
}

function resolveSelectionToolbarTrigger() {
  const instance = editor.value
  if (
    !instance
    || !props.editable
    || linkInputVisible.value
    || slashMenuState.visible
    || selectionToolbarInlineItems.value.length === 0
  ) {
    return null
  }

  const { selection } = instance.state
  if (selection.empty)
    return null

  if (resolveActiveCodeBlock())
    return null

  const selectedText = String(instance.state.doc.textBetween(selection.from, selection.to, '\n', '\n') || '')
  if (!selectedText)
    return null

  const start = instance.view.coordsAtPos(selection.from)
  const end = instance.view.coordsAtPos(selection.to)
  const metrics = resolveSelectionToolbarMetrics()
  const menuWidth = metrics.width
  const menuHeight = metrics.height
  const centerX = (Math.min(start.left, end.left) + Math.max(start.right, end.right)) / 2
  const left = import.meta.client
    ? Math.max(12, Math.min(centerX - menuWidth / 2, window.innerWidth - menuWidth - 12))
    : centerX - menuWidth / 2
  const preferredAbove = Math.min(start.top, end.top) - menuHeight - 12
  const preferredBelow = Math.max(start.bottom, end.bottom) + 12
  const top = import.meta.client
    ? preferredAbove >= 12
      ? preferredAbove
      : Math.max(12, Math.min(preferredBelow, window.innerHeight - menuHeight - 12))
    : preferredAbove

  return {
    left,
    top,
  }
}

function syncSelectionToolbar(): void {
  const trigger = resolveSelectionToolbarTrigger()
  if (!trigger) {
    closeSelectionToolbar()
    return
  }

  selectionToolbarState.visible = true
  selectionToolbarState.left = trigger.left
  selectionToolbarState.top = trigger.top
  if (headingMenuState.visible)
    syncHeadingMenuPosition()
}

function syncDerivedState(): void {
  emitSelectionChange()
  emitRemotePresenceChange()
  emitPrimaryHeadingChange()
  syncSlashMenu()
  syncSelectionToolbar()
  syncOutlineState()
  syncOutlineSearchMatches()
  syncActiveCodeBlockState()
  syncInlineCompletion()
}

function destroyEditor(): void {
  closeLinkEditor()
  closeSlashMenu()
  closeSelectionToolbar()
  resetInlineCompletionPointerDownContext()
  clearInlineCompletionState({
    cancelPendingRequest: true,
    resetSuspend: true,
  })
  inlineCompletionState.focused = false
  inlineCompletionState.composing = false
  inlineCompletionState.acceptPending = false
  removeAwarenessListener?.()
  removeAwarenessListener = null
  if (codeBlockCopyTimer) {
    clearTimeout(codeBlockCopyTimer)
    codeBlockCopyTimer = null
  }
  if (!editor.value)
    return
  editor.value.destroy()
  editor.value = null
  outlineItems.value = []
  activeOutlineHeadingPos.value = null
  lastPrimaryHeadingTitle.value = ''
  inlineSearchVisible.value = false
  outlineSearchMatches.value = []
  activeOutlineSearchMatchIndex.value = 0
  activeCodeBlockState.value = null
  codeBlockCopyFeedback.value = false
}

function bindAwarenessListener(awareness: Awareness | null): void {
  removeAwarenessListener?.()
  removeAwarenessListener = null
  if (!awareness)
    return

  const handleAwarenessChange = () => {
    emitRemotePresenceChange()
  }

  awareness.on('change', handleAwarenessChange)
  removeAwarenessListener = () => {
    awareness.off('change', handleAwarenessChange)
    removeAwarenessListener = null
  }
}

function syncLocalAwarenessUser(): void {
  const awareness = props.awareness
  if (!awareness)
    return

  const currentUser = props.currentUser
  const userId = normalizeString(currentUser?.id)
  const username = normalizeString(currentUser?.name)
  if (!userId || !username) {
    awareness.setLocalStateField('user', null)
    return
  }

  awareness.setLocalStateField('user', {
    id: userId,
    userId,
    name: username,
    color: normalizeString(currentUser?.color) || '#2563eb',
  })
}

function isImageFile(file: File | null | undefined): file is File {
  return Boolean(file && normalizeString(file.type).startsWith('image/'))
}

function normalizeImageUploadResult(result: RichTextEditorImageUploadResult, file: File) {
  const src = normalizeString(result?.src)
  if (!src)
    return null

  const fallbackText = normalizeString(result?.title) || normalizeString(result?.alt) || normalizeString(file.name) || '图片'
  return {
    src,
    alt: normalizeOptionalString(result?.alt) || fallbackText,
    title: normalizeOptionalString(result?.title),
    resourceId: normalizeOptionalString(result?.resourceId),
    width: null,
    uploadStatus: null,
    uploadId: null,
  }
}

function findImageNodeByUploadId(uploadId: string): { pos: number, node: any } | null {
  const instance = editor.value
  if (!instance || !uploadId)
    return null

  let matched: { pos: number, node: any } | null = null
  instance.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image')
      return true

    if (normalizeString(node.attrs?.uploadId) !== uploadId)
      return true

    matched = { pos, node }
    return false
  })

  return matched
}

function findImageNodeByCommentAnchor(anchor: ProjectResourceCommentImageNodeAnchor): { pos: number, node: any } | null {
  const instance = editor.value
  if (!instance)
    return null

  const resourceId = normalizeString(anchor.resourceId)
  const src = normalizeString(anchor.src)
  let matched: { pos: number, node: any } | null = null
  instance.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image')
      return true

    const nodeResourceId = normalizeString(node.attrs?.resourceId)
    const nodeSrc = normalizeString(node.attrs?.src)
    if ((resourceId && nodeResourceId === resourceId) || (src && nodeSrc === src)) {
      matched = { pos, node }
      return false
    }
    return true
  })
  return matched
}

function resolveImageCommentThreads(attrs: Record<string, unknown>): Array<{ id: string }> {
  const resourceId = normalizeString(attrs.resourceId)
  const src = normalizeString(attrs.src)
  if (!resourceId && !src)
    return []

  return props.commentThreads
    .filter((thread) => {
      if (thread.anchor.type !== 'image_node')
        return false
      const threadResourceId = normalizeString(thread.anchor.resourceId)
      const threadSrc = normalizeString(thread.anchor.src)
      return (resourceId && threadResourceId === resourceId) || (src && threadSrc === src)
    })
    .map(thread => ({ id: thread.id }))
}

function insertUploadingImagePlaceholder(file: File, position?: number | null): { uploadId: string, nextPosition: number | null } | null {
  const instance = editor.value
  if (!instance || !props.editable)
    return null

  const uploadId = createImageUploadId(file)
  const placeholderName = normalizeImageUploadPlaceholderName(file)
  const anchorPosition = Number.isInteger(Number(position)) ? Math.max(0, Math.trunc(Number(position))) : null

  if (anchorPosition !== null) {
    instance
      .chain()
      .focus()
      .setTextSelection(anchorPosition)
      .insertContent({
        type: 'image',
        attrs: {
          src: null,
          alt: placeholderName,
          title: placeholderName,
          resourceId: null,
          width: null,
          uploadStatus: 'uploading',
          uploadId,
        },
      })
      .run()
  }
  else {
    instance
      .chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          src: null,
          alt: placeholderName,
          title: placeholderName,
          resourceId: null,
          width: null,
          uploadStatus: 'uploading',
          uploadId,
        },
      })
      .run()
  }

  return {
    uploadId,
    nextPosition: editor.value?.state.selection.from ?? null,
  }
}

function replaceUploadingImagePlaceholder(uploadId: string, attrs: Record<string, unknown>): boolean {
  const instance = editor.value
  const matched = findImageNodeByUploadId(uploadId)
  if (!instance || !matched)
    return false

  instance.view.dispatch(instance.state.tr.setNodeMarkup(matched.pos, undefined, {
    ...matched.node.attrs,
    ...attrs,
    uploadStatus: null,
    uploadId: null,
  }))
  return true
}

function removeUploadingImagePlaceholder(uploadId: string): boolean {
  const instance = editor.value
  const matched = findImageNodeByUploadId(uploadId)
  if (!instance || !matched)
    return false

  instance.view.dispatch(instance.state.tr.deleteRange(matched.pos, matched.pos + matched.node.nodeSize))
  return true
}

async function uploadImagesAt(files: File[], position?: number | null): Promise<boolean> {
  const instance = editor.value
  const imageUploadHandler = props.imageUploadHandler
  if (!instance || !props.editable || !imageUploadHandler)
    return false

  const imageFiles = files.filter(isImageFile)
  if (imageFiles.length === 0)
    return false

  let anchorPosition = Number.isInteger(Number(position)) ? Math.max(0, Math.trunc(Number(position))) : null
  const pendingUploads: Array<{ file: File, uploadId: string }> = []

  for (const file of imageFiles) {
    const placeholder = insertUploadingImagePlaceholder(file, anchorPosition)
    if (!placeholder)
      continue

    pendingUploads.push({
      file,
      uploadId: placeholder.uploadId,
    })
    anchorPosition = placeholder.nextPosition
  }

  if (pendingUploads.length === 0)
    return false

  for (const { file, uploadId } of pendingUploads) {
    try {
      const uploaded = await imageUploadHandler(file)
      const attrs = normalizeImageUploadResult(uploaded, file)
      if (!attrs) {
        removeUploadingImagePlaceholder(uploadId)
        continue
      }

      replaceUploadingImagePlaceholder(uploadId, attrs)
    }
    catch {
      removeUploadingImagePlaceholder(uploadId)
      // 上传状态由外层页面统一提示
    }
  }

  return true
}

function refreshCommentDecorations(): void {
  const instance = editor.value
  if (!instance)
    return
  instance.view.dispatch(instance.state.tr.setMeta(commentDecorationPluginKey, Date.now()))
}

function scrollToCommentThread(threadId: string): void {
  const normalizedThreadId = normalizeString(threadId)
  const instance = editor.value
  if (!instance || !normalizedThreadId)
    return

  const thread = props.commentThreads.find(item => item.id === normalizedThreadId)
  if (!thread)
    return

  if (thread.anchor.type === 'image_node') {
    const matched = findImageNodeByCommentAnchor(thread.anchor)
    if (!matched)
      return
    const expanded = expandCollapsedHeadingsForPosition(matched.pos)
    if (expanded) {
      nextTick(() => {
        syncOutlineHeadingMarkers()
        scrollToCommentThread(threadId)
      })
      return
    }
    instance.chain().focus().setNodeSelection(matched.pos).run()
    nextTick(() => {
      const targetNode = instance.view.nodeDOM(matched.pos)
      if (targetNode instanceof HTMLElement) {
        targetNode.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    })
    return
  }

  const selection = resolveCommentThreadSelection(thread, instance.state)
  if (!selection)
    return

  const expanded = expandCollapsedHeadingsForPosition(selection.from)
  if (expanded) {
    nextTick(() => {
      syncOutlineHeadingMarkers()
      scrollToCommentThread(threadId)
    })
    return
  }

  instance.chain().focus().setTextSelection(selection.from).run()
  nextTick(() => {
    const scroller = editorScrollRef.value
    if (scroller) {
      const scrollerRect = scroller.getBoundingClientRect()
      const start = instance.view.coordsAtPos(selection.from)
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + start.top - scrollerRect.top - 120),
        behavior: 'smooth',
      })
    }
  })
}

function writeMarkdownToCollabDocument(doc: Y.Doc, markdown: string): boolean {
  try {
    doc.transact(() => {
      writeRichTextDocumentToFragment(doc.getXmlFragment('prosemirror'), parseMarkdownToRichTextDocument(markdown))
      syncMarkdownMirrorFromRichText(doc)
    })
    return true
  }
  catch {
    return false
  }
}

function applyDocumentDraft(draft: AiWorkspaceDocumentDraft): boolean {
  const doc = props.doc
  if (!doc || !props.editable)
    return false

  try {
    const currentMarkdown = readMarkdownFromRichText(doc)
    const result = applyAgentDocDraftToMarkdown(currentMarkdown, draft)
    if (!result.ok)
      return false
    return writeMarkdownToCollabDocument(doc, result.markdown)
  }
  catch {
    return false
  }
}

function applyDocumentAssistResult(input: { action: AiWorkspaceDocumentAction, text: string }): boolean {
  const instance = editor.value
  const text = String(input.text || '').trim()
  const doc = props.doc
  if (!instance || !doc || !props.editable || !text)
    return false

  const summary = buildSelectionSummary(instance.state.doc, instance.state.selection.anchor, instance.state.selection.head)
  const selectionRange = toDocumentSelectionRange(summary)
  const currentMarkdown = readMarkdownFromRichText(doc)
  const replaceSelectionActions = new Set<AiWorkspaceDocumentAction>(['rewrite', 'expand', 'complete_context', 'restructure'])
  const applyMode = input.action === 'continue'
    ? 'insert_at_cursor'
    : (input.action === 'summarize'
        ? (summary.isCollapsed ? 'insert_at_cursor' : 'insert_after_selection')
        : (summary.isCollapsed ? 'replace_document' : 'replace_selection'))
  const originalText = summary.isCollapsed ? '' : String(summary.selectedText || '')

  return applyDocumentDraft({
    action: input.action,
    title: '',
    summary: '',
    resourceId: normalizeString(props.resourceId),
    resourceTitle: '',
    selectionText: originalText,
    selectionRange,
    applyMode: replaceSelectionActions.has(input.action)
      ? (summary.isCollapsed ? 'replace_document' : 'replace_selection')
      : applyMode,
    baseDocumentHash: computeAgentDocContentHash(currentMarkdown),
    originalText,
    proposedText: text,
  })
}

function openImagePicker(position?: number | null): void {
  if (!props.editable || !props.imageUploadHandler)
    return

  pendingImageInsertPosition.value = Number.isInteger(Number(position)) ? Math.trunc(Number(position)) : null
  nextTick(() => {
    if (!imageInputRef.value)
      return
    imageInputRef.value.value = ''
    imageInputRef.value.click()
  })
}

async function onImageInputChange(event: Event): Promise<void> {
  const target = event.target
  if (!(target instanceof HTMLInputElement))
    return

  const files = Array.from(target.files || []).filter(isImageFile)
  target.value = ''
  if (files.length === 0)
    return

  await uploadImagesAt(files, pendingImageInsertPosition.value)
  pendingImageInsertPosition.value = null
}

function prepareCommandSelection(range?: SlashCommandRange): void {
  const instance = editor.value
  if (!instance)
    return

  if (!range || range.to <= range.from) {
    instance.chain().focus().run()
    return
  }

  instance
    .chain()
    .focus()
    .deleteRange(range)
    .setTextSelection(range.from)
    .run()
}

function executeCommand(command: RichTextEditorCommand, options?: { replaceRange?: SlashCommandRange }): void {
  const instance = editor.value
  if (!instance || !props.editable)
    return

  const replaceRange = options?.replaceRange
  const shouldCloseSlashMenu = Boolean(replaceRange)

  if (command.action === 'image') {
    prepareCommandSelection(replaceRange)
    openImagePicker(replaceRange?.from ?? instance.state.selection.from)
    closeSlashMenu()
    closeHeadingMenu()
    return
  }

  if (command.action === 'comment') {
    emitCommentFromSelection()
    closeSlashMenu()
    closeHeadingMenu()
    return
  }

  prepareCommandSelection(replaceRange)

  const chain = instance.chain().focus()
  if (command.action === 'heading' && command.level) {
    chain.setHeading({ level: command.level }).run()
  }
  else if (command.action === 'paragraph') {
    chain.setParagraph().run()
  }
  else if (command.action === 'bold') {
    chain.toggleBold().run()
  }
  else if (command.action === 'italic') {
    chain.toggleItalic().run()
  }
  else if (command.action === 'strike') {
    chain.toggleStrike().run()
  }
  else if (command.action === 'underline') {
    chain.toggleUnderline().run()
  }
  else if (command.action === 'blockquote') {
    chain.toggleBlockquote().run()
  }
  else if (command.action === 'bulletList') {
    chain.toggleBulletList().run()
  }
  else if (command.action === 'orderedList') {
    chain.toggleOrderedList().run()
  }
  else if (command.action === 'taskList') {
    chain.toggleTaskList().run()
  }
  else if (command.action === 'link') {
    if (instance.isActive('link')) {
      chain.unsetLink().run()
      closeLinkEditor()
    }
    else {
      openLinkEditor()
    }
  }
  else if (command.action === 'code') {
    chain.toggleCode().run()
  }
  else if (command.action === 'codeBlock') {
    if (instance.isActive('codeBlock'))
      chain.clearNodes().run()
    else
      chain.setCodeBlock({ language: 'plaintext' }).run()
  }
  else if (command.action === 'table') {
    if (instance.isActive('table')) {
      chain.deleteTable().run()
    }
    else {
      chain.insertTable({
        rows: 3,
        cols: 3,
        withHeaderRow: true,
      }).run()
    }
  }
  else if (command.action === 'horizontalRule') {
    chain.setHorizontalRule().run()
  }

  closeHeadingMenu()
  if (shouldCloseSlashMenu)
    closeSlashMenu()
}

function isToolbarItemActive(item: RichTextEditorCommand): boolean {
  const instance = editor.value
  if (!instance)
    return false

  if (item.action === 'heading' && item.level)
    return instance.isActive('heading', { level: item.level })

  if (item.action === 'paragraph')
    return instance.isActive('paragraph')

  if (item.action === 'table')
    return instance.isActive('table')

  if (item.action === 'horizontalRule')
    return false

  return instance.isActive(item.action)
}

function handleEditorKeyDown(_view: unknown, event: KeyboardEvent): boolean {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a') {
    const instance = editor.value
    if (!instance)
      return false

    event.preventDefault()
    instance.view.dispatch(instance.state.tr.setSelection(new AllSelection(instance.state.doc)))
    return true
  }

  if (
    event.key === 'Tab'
    && !event.shiftKey
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && inlineCompletionState.suggestionText
    && inlineCompletionState.suggestionKey
  ) {
    event.preventDefault()
    void acceptInlineCompletionSuggestion()
    return true
  }

  if (isInlineCompletionUserInputKey(event))
    noteInlineCompletionUserInput()

  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openInlineSearch()
    return true
  }

  if (headingMenuState.visible && event.key === 'Escape') {
    event.preventDefault()
    closeHeadingMenu()
    return true
  }

  if (!slashMenuState.visible)
    return false

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSlashMenu()
    return true
  }

  if (slashMenuItems.value.length === 0)
    return false

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    slashMenuState.selectedIndex = (slashMenuState.selectedIndex + 1) % slashMenuItems.value.length
    return true
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    slashMenuState.selectedIndex = (slashMenuState.selectedIndex - 1 + slashMenuItems.value.length) % slashMenuItems.value.length
    return true
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const command = slashMenuItems.value[slashMenuState.selectedIndex] || slashMenuItems.value[0]
    if (command) {
      executeCommand(command, {
        replaceRange: {
          from: slashMenuState.rangeFrom,
          to: slashMenuState.rangeTo,
        },
      })
    }
    return true
  }

  return false
}

function handleEditorTextInput(): boolean {
  noteInlineCompletionUserInput()
  return false
}

function handleEditorPaste(_view: unknown, event: ClipboardEvent): boolean {
  noteInlineCompletionUserInput()
  if (!props.editable || !props.imageUploadHandler)
    return false

  const files = Array.from(event.clipboardData?.items || [])
    .map(item => item.kind === 'file' ? item.getAsFile() : null)
    .filter(isImageFile)

  if (files.length === 0)
    return false

  const position = editor.value?.state.selection.from ?? null
  event.preventDefault()
  void uploadImagesAt(files, position)
  return true
}

function handleEditorDrop(view: any, event: DragEvent): boolean {
  noteInlineCompletionUserInput()
  if (!props.editable || !props.imageUploadHandler)
    return false

  const files = Array.from(event.dataTransfer?.files || []).filter(isImageFile)
  if (files.length === 0)
    return false

  const coordinates = typeof view?.posAtCoords === 'function'
    ? view.posAtCoords({ left: event.clientX, top: event.clientY })
    : null
  const position = Number.isInteger(Number(coordinates?.pos))
    ? Math.trunc(Number(coordinates.pos))
    : (editor.value?.state.selection.from ?? null)

  event.preventDefault()
  void uploadImagesAt(files, position)
  return true
}

function onEditorCompositionStart(): boolean {
  inlineCompletionState.composing = true
  clearInlineCompletionState({
    cancelPendingRequest: true,
    reason: 'composition-start',
  })
  return false
}

function onEditorCompositionEnd(): boolean {
  inlineCompletionState.composing = false
  noteInlineCompletionUserInput()
  syncInlineCompletion()
  return false
}

function handleDocumentPointerDown(event: PointerEvent): void {
  setInlineCompletionPointerDownContext(event.target)
}

function handleDocumentPointerUp(): void {
  resetInlineCompletionPointerDownContext()
}

function createEditor(doc: Y.Doc, awareness: Awareness | null): void {
  if (!import.meta.client)
    return

  destroyEditor()
  bindAwarenessListener(awareness)

  const baseExtensions = createCollabMarkdownBaseExtensions()
    .filter(extension => normalizeString((extension as any)?.name) !== 'image')

  const extensions = [
    ...baseExtensions,
    createRichTextEditorImageExtension({
      getImageCommentThreads: attrs => resolveImageCommentThreads(attrs),
      getActiveCommentThreadId: () => props.activeCommentThreadId,
      onOpenCommentThread: threadId => emit('openCommentThread', threadId),
      onCreateCommentFromImage: anchor => emit('createCommentFromImage', anchor),
      onRequestImageAction: payload => emit('requestImageAction', payload),
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    createEditorChromeExtension(),
    createSearchExtension(),
    Gapcursor,
    Dropcursor.configure({
      color: '#2f6af2',
      width: 2,
    }),
    Collaboration.configure({
      document: doc,
      field: 'prosemirror',
    }),
  ]

  if (awareness)
    extensions.push(createCollabCursorExtension(awareness))
  if (props.enableComments)
    extensions.push(createCommentExtension())
  if (props.enableInlineCompletion)
    extensions.push(createInlineCompletionExtension())

  editor.value = new Editor({
    element: document.createElement('div'),
    editable: props.editable,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'rich-text-editor__prosemirror',
      },
      handleKeyDown: handleEditorKeyDown,
      handleTextInput: handleEditorTextInput,
      handlePaste: handleEditorPaste,
      handleDrop: handleEditorDrop,
      handleDOMEvents: {
        compositionstart: () => onEditorCompositionStart(),
        compositionend: () => onEditorCompositionEnd(),
      },
    },
    extensions,
    onCreate: () => {
      inlineCompletionState.focused = false
      syncDerivedState()
    },
    onSelectionUpdate: syncDerivedState,
    onUpdate: syncDerivedState,
    onFocus: () => {
      resetInlineCompletionPointerDownContext()
      inlineCompletionState.focused = true
      syncDerivedState()
    },
    onBlur: () => {
      const shouldCancelOnBlur = shouldCancelInlineCompletionOnBlur(inlineCompletionPointerDownOutsideEditor)
      logInlineCompletionDebug('editor-blur', {
        shouldCancelOnBlur,
        outsidePointerDown: inlineCompletionPointerDownOutsideEditor,
      })
      resetInlineCompletionPointerDownContext()
      inlineCompletionState.focused = false
      inlineCompletionState.composing = false
      if (shouldCancelOnBlur) {
        clearInlineCompletionState({
          cancelPendingRequest: true,
          reason: 'blur-outside',
        })
      }
      emitSelectionChange()
      emitRemotePresenceChange()
      closeSlashMenu()
      closeSelectionToolbar()
    },
    onTransaction: syncDerivedState,
  })

  syncLocalAwarenessUser()
}

function onEditorScroll(): void {
  syncOutlineActiveHeading()
  syncActiveCodeBlockState()
  if (selectionToolbarState.visible)
    syncSelectionToolbar()
  if (slashMenuState.visible)
    syncSlashMenu()
  if (headingMenuState.visible)
    syncHeadingMenuPosition()
}

function handleViewportResize(): void {
  syncOutlineActiveHeading()
  syncActiveCodeBlockState()
  if (selectionToolbarState.visible)
    syncSelectionToolbar()
  if (slashMenuState.visible)
    syncSlashMenu()
  if (headingMenuState.visible)
    syncHeadingMenuPosition()
}

defineExpose({
  applyDocumentDraft,
  applyDocumentAssistResult,
  openInlineSearch,
  scrollToCommentThread,
  scrollToHeadingAnchor,
})

watch(slashMenuItems, (items) => {
  if (items.length === 0) {
    slashMenuState.selectedIndex = 0
    return
  }

  if (slashMenuState.selectedIndex >= items.length)
    slashMenuState.selectedIndex = 0
}, { deep: true })

watch([() => props.doc, () => props.awareness], ([nextDoc, nextAwareness]) => {
  if (!nextDoc) {
    destroyEditor()
    lastOutlineSignature.value = ''
    emit('outlineChange', [])
    emit('remotePresenceChange', [])
    emit('selectionChange', defaultSelectionChangePayload())
    return
  }

  createEditor(nextDoc, nextAwareness)
}, { immediate: true })

watch(() => props.editable, (editable) => {
  editor.value?.setEditable(Boolean(editable))
  inlineCompletionState.focused = Boolean(editable && editor.value?.isFocused)
  if (!editable) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
      resetSuspend: true,
    })
  }
  syncDerivedState()
})

watch(normalizedHeadingLevels, () => {
  if (!props.doc)
    return
  createEditor(props.doc, props.awareness)
})

watch(() => props.placeholder, () => {
  if (!props.doc)
    return
  createEditor(props.doc, props.awareness)
})

watch(() => props.resourceId, () => {
  clearInlineCompletionState({
    cancelPendingRequest: true,
    resetSuspend: true,
  })
  syncOutlineState()
  syncInlineCompletion()
})

watch(() => props.enableComments, () => {
  if (!props.doc)
    return
  createEditor(props.doc, props.awareness)
})

watch(() => props.enableInlineCompletion, () => {
  clearInlineCompletionState({
    cancelPendingRequest: true,
    resetSuspend: true,
  })
  if (!props.doc)
    return
  createEditor(props.doc, props.awareness)
})

watch([() => props.inlineCompletionRequestHandler, () => props.inlineCompletionAcceptHandler], () => {
  clearInlineCompletionState({
    cancelPendingRequest: true,
    resetSuspend: true,
  })
  syncInlineCompletion()
})

watch(() => props.currentUser, () => {
  syncLocalAwarenessUser()
}, { deep: true })

watch(outlineSearchQuery, () => {
  syncOutlineSearchMatches()
  refreshSearchDecorations()
})

watch(collapsedHeadingPositions, () => {
  refreshEditorChromeDecorations()
  nextTick(() => {
    syncOutlineHeadingMarkers()
    syncOutlineActiveHeading()
    syncActiveCodeBlockState()
  })
}, { deep: true })

watch(() => props.commentThreads, () => {
  refreshCommentDecorations()
}, { deep: true })

watch(() => props.activeCommentThreadId, (threadId) => {
  refreshCommentDecorations()
  if (!threadId)
    return
  nextTick(() => {
    scrollToCommentThread(threadId)
  })
})

watch(linkInputVisible, (visible) => {
  if (visible) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
    })
    return
  }

  syncInlineCompletion()
})

watch(() => slashMenuState.visible, (visible) => {
  if (visible) {
    clearInlineCompletionState({
      cancelPendingRequest: true,
    })
    return
  }

  syncInlineCompletion()
})

onMounted(() => {
  if (!import.meta.client)
    return

  window.addEventListener('resize', handleViewportResize)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('pointerup', handleDocumentPointerUp, true)
  document.addEventListener('pointercancel', handleDocumentPointerUp, true)
  removeWindowResizeListener = () => {
    window.removeEventListener('resize', handleViewportResize)
    removeWindowResizeListener = null
  }
  removeDocumentPointerDownListener = () => {
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
    removeDocumentPointerDownListener = null
  }
  removeDocumentPointerUpListener = () => {
    document.removeEventListener('pointerup', handleDocumentPointerUp, true)
    removeDocumentPointerUpListener = null
  }
  removeDocumentPointerCancelListener = () => {
    document.removeEventListener('pointercancel', handleDocumentPointerUp, true)
    removeDocumentPointerCancelListener = null
  }
})

onBeforeUnmount(() => {
  removeWindowResizeListener?.()
  removeDocumentPointerDownListener?.()
  removeDocumentPointerUpListener?.()
  removeDocumentPointerCancelListener?.()
  destroyEditor()
})
</script>

<template>
  <section class="rich-text-editor" :style="editorInlineStyle">
    <div v-if="showToolbar" class="rich-text-editor__toolbar">
      <button
        v-for="item in toolbarItems"
        :key="item.id"
        class="rich-text-editor__toolbar-button"
        :class="{ 'rich-text-editor__toolbar-button--active': isToolbarItemActive(item) }"
        type="button"
        :disabled="!editor || !editable"
        @click="executeCommand(item)"
      >
        {{ item.label }}
      </button>
    </div>

    <form
      v-if="linkInputVisible"
      class="rich-text-editor__link-form"
      :class="{ 'rich-text-editor__link-form--floating': !showToolbar }"
      @submit.prevent="submitLinkDraft"
    >
      <input
        ref="linkInputRef"
        v-model="linkDraft"
        class="rich-text-editor__link-input"
        type="url"
        inputmode="url"
        placeholder="https://"
        @keydown.esc.prevent="closeLinkEditor()"
      >
      <button
        class="rich-text-editor__link-action rich-text-editor__link-action--primary"
        type="submit"
      >
        应用
      </button>
      <button
        class="rich-text-editor__link-action"
        type="button"
        @click="closeLinkEditor()"
      >
        取消
      </button>
    </form>

    <div class="rich-text-editor__surface">
      <div
        v-if="inlineSearchVisible"
        class="rich-text-editor__inline-search"
        data-testid="rich-text-editor-inline-search"
      >
        <label class="sr-only" for="rich-text-editor-inline-search-input">文内搜索</label>
        <div class="rich-text-editor__inline-search-main">
          <div class="rich-text-editor__inline-search-input-wrap">
            <span class="rich-text-editor__inline-search-icon material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              id="rich-text-editor-inline-search-input"
              ref="outlineSearchInputRef"
              v-model="outlineSearchQuery"
              class="rich-text-editor__inline-search-input"
              type="search"
              inputmode="search"
              placeholder="搜索正文"
              data-testid="rich-text-editor-search-input"
              @keydown="onOutlineSearchKeydown"
            >
            <button
              v-if="outlineSearchQuery"
              type="button"
              class="rich-text-editor__inline-search-clear"
              aria-label="清空搜索"
              @click="clearOutlineSearch()"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="rich-text-editor__inline-search-meta">
            <span class="rich-text-editor__inline-search-count">{{ outlineSearchResultLabel }}</span>
            <div class="rich-text-editor__inline-search-actions">
              <button
                type="button"
                class="rich-text-editor__inline-search-action"
                aria-label="上一条结果"
                :disabled="outlineSearchMatches.length === 0"
                @click="jumpToPreviousOutlineSearchMatch()"
              >
                <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_up</span>
              </button>
              <button
                type="button"
                class="rich-text-editor__inline-search-action"
                aria-label="下一条结果"
                :disabled="outlineSearchMatches.length === 0"
                @click="jumpToNextOutlineSearchMatch()"
              >
                <span class="material-symbols-outlined" aria-hidden="true">keyboard_arrow_down</span>
              </button>
              <button
                type="button"
                class="rich-text-editor__inline-search-action"
                aria-label="关闭搜索"
                @click="closeInlineSearch()"
              >
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        ref="editorScrollRef"
        class="rich-text-editor__scroller"
        @scroll.passive="onEditorScroll"
      >
        <div class="rich-text-editor__canvas">
          <div
            v-if="activeCodeBlockState"
            class="rich-text-editor__code-block-toolbar"
            :style="codeBlockToolbarStyle"
            data-testid="rich-text-editor-code-block-toolbar"
          >
            <label class="sr-only" for="rich-text-editor-code-block-language">代码块语言</label>
            <select
              id="rich-text-editor-code-block-language"
              class="rich-text-editor__code-block-language"
              :value="activeCodeBlockState.language"
              :disabled="!editable"
              @change="onCodeBlockLanguageChange"
            >
              <option
                v-for="option in codeBlockLanguageOptions"
                :key="`code-language-${option.value}`"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>

            <button
              type="button"
              class="rich-text-editor__code-block-copy"
              :aria-label="codeBlockCopyFeedback ? '代码已复制' : '复制代码'"
              :title="codeBlockCopyFeedback ? '代码已复制' : '复制代码'"
              @click="copyActiveCodeBlockText()"
            >
              <span class="material-symbols-outlined" aria-hidden="true">
                {{ codeBlockCopyFeedback ? 'check' : 'content_copy' }}
              </span>
            </button>
          </div>

          <EditorContent v-if="editor" :editor="editor" />
          <div v-else class="rich-text-editor__empty">
            文档正在初始化...
          </div>
        </div>
      </div>
    </div>

    <input
      ref="imageInputRef"
      class="sr-only"
      type="file"
      accept="image/*"
      multiple
      @change="onImageInputChange"
    >

    <Teleport to="body">
      <div
        v-if="selectionToolbarState.visible"
        class="rich-text-editor__selection-toolbar"
        :style="selectionToolbarStyle"
        data-testid="rich-text-editor-selection-toolbar"
      >
        <button
          class="rich-text-editor__selection-toolbar-heading"
          :class="{ 'rich-text-editor__selection-toolbar-heading--active': headingMenuState.visible || (currentBlockTypeCommand?.action === 'heading') }"
          type="button"
          :aria-label="`切换块级标题，当前为 ${currentBlockTypeCommand?.label || '正文'}`"
          @mousedown.prevent
          @click="toggleHeadingMenu()"
        >
          <span class="rich-text-editor__selection-toolbar-icon material-symbols-outlined" aria-hidden="true">
            title
          </span>
          <span class="rich-text-editor__selection-toolbar-heading-label">
            {{ currentBlockTypeCommand?.label || '正文' }}
          </span>
          <span class="rich-text-editor__selection-toolbar-chevron material-symbols-outlined" aria-hidden="true">
            keyboard_arrow_down
          </span>
        </button>

        <button
          v-for="item in selectionToolbarInlineItems"
          :key="`selection-${item.id}`"
          class="rich-text-editor__selection-toolbar-button"
          :class="{ 'rich-text-editor__selection-toolbar-button--active': isToolbarItemActive(item) }"
          type="button"
          :title="item.label"
          :aria-label="item.label"
          @mousedown.prevent
          @click="executeCommand(item)"
        >
          <span
            v-if="item.icon"
            class="rich-text-editor__selection-toolbar-icon material-symbols-outlined"
            aria-hidden="true"
          >
            {{ item.icon }}
          </span>
          <span class="sr-only">{{ item.label }}</span>
        </button>
      </div>

      <div
        v-if="headingMenuState.visible"
        class="rich-text-editor__heading-menu"
        :style="headingMenuStyle"
        data-testid="rich-text-editor-heading-menu"
      >
        <button
          v-for="item in blockTypeMenuItems"
          :key="`heading-${item.id}`"
          class="rich-text-editor__heading-menu-item"
          :class="{ 'rich-text-editor__heading-menu-item--active': isToolbarItemActive(item) }"
          type="button"
          @mousedown.prevent
          @click="executeCommand(item)"
        >
          <span
            v-if="item.icon"
            class="rich-text-editor__heading-menu-icon material-symbols-outlined"
            aria-hidden="true"
          >
            {{ item.icon }}
          </span>
          <span class="rich-text-editor__heading-menu-label">
            {{ item.label }}
          </span>
          <span
            v-if="isToolbarItemActive(item)"
            class="rich-text-editor__heading-menu-check material-symbols-outlined"
            aria-hidden="true"
          >
            check
          </span>
        </button>
      </div>

      <div
        v-if="slashMenuState.visible"
        class="rich-text-editor__slash-menu"
        :style="slashMenuStyle"
        data-testid="rich-text-editor-slash-menu"
      >
        <template v-if="slashMenuItems.length > 0">
          <button
            v-for="(item, index) in slashMenuItems"
            :key="`slash-${item.id}`"
            class="rich-text-editor__slash-menu-item"
            :class="{ 'rich-text-editor__slash-menu-item--active': index === slashMenuState.selectedIndex }"
            type="button"
            @mousedown.prevent
            @click="executeCommand(item, { replaceRange: { from: slashMenuState.rangeFrom, to: slashMenuState.rangeTo } })"
          >
            <span class="rich-text-editor__slash-menu-main">
              <span
                v-if="item.icon"
                class="rich-text-editor__slash-menu-icon material-symbols-outlined"
                aria-hidden="true"
              >
                {{ item.icon }}
              </span>
              <span class="rich-text-editor__slash-menu-label">
                {{ item.label }}
              </span>
            </span>
            <span class="rich-text-editor__slash-menu-meta">
              {{ item.group === 'inline' ? '行内' : '块级' }}
            </span>
          </button>
        </template>
        <div v-else class="rich-text-editor__slash-menu-empty">
          未找到匹配命令
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.rich-text-editor {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: #fff;
}

.rich-text-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e6ebf2;
  background: #fff;
}

.rich-text-editor__toolbar-button {
  min-width: 44px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.rich-text-editor__toolbar-button:hover:enabled {
  border-color: #bfccde;
  background: #f8fbff;
  color: #0f172a;
}

.rich-text-editor__toolbar-button--active {
  border-color: #cfe0ff;
  background: #edf4ff;
  color: #1d4ed8;
}

.rich-text-editor__toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.rich-text-editor__link-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 16px;
  border-bottom: 1px solid #e6ebf2;
  background: #fff;
}

.rich-text-editor__link-form--floating {
  position: sticky;
  top: 0;
  z-index: 15;
}

.rich-text-editor__link-input {
  min-width: 0;
  flex: 1 1 220px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
  outline: none;
}

.rich-text-editor__link-input:focus {
  border-color: #93c5fd;
  box-shadow: 0 0 0 3px rgba(147, 197, 253, 0.2);
}

.rich-text-editor__link-action {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.rich-text-editor__link-action--primary {
  border-color: #cfe0ff;
  background: #edf4ff;
  color: #1d4ed8;
}

.rich-text-editor__surface {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
  align-items: stretch;
  background: #fff;
}

.rich-text-editor__inline-search {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 16;
  width: min(360px, calc(100% - 36px));
  border: 1px solid rgba(219, 227, 239, 0.92);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.rich-text-editor__inline-search-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.rich-text-editor__inline-search-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 8px;
  border: 1px solid #dbe3ef;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.96);
}

.rich-text-editor__inline-search-icon {
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
}

.rich-text-editor__inline-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: #0f172a;
  font-size: 13px;
  outline: none;
}

.rich-text-editor__inline-search-input::-webkit-search-cancel-button {
  display: none;
}

.rich-text-editor__inline-search-clear,
.rich-text-editor__inline-search-action {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
}

.rich-text-editor__inline-search-clear:hover,
.rich-text-editor__inline-search-action:hover:enabled {
  background: #f8fafc;
  color: #0f172a;
}

.rich-text-editor__inline-search-action:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.rich-text-editor__inline-search-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rich-text-editor__inline-search-count {
  color: #94a3b8;
  font-size: var(--rich-text-editor-font-xs);
  line-height: 1;
}

.rich-text-editor__inline-search-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rich-text-editor__scroller {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: #fff;
}

.rich-text-editor__canvas {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 0 8px;
  background: transparent;
}

.rich-text-editor__empty {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: var(--rich-text-editor-font-md);
}

.rich-text-editor__canvas :deep(.tiptap) {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--rich-text-editor-content-max-width);
  min-height: 520px;
  margin: 0 auto;
  padding: calc(var(--wl-ws-space-6, 24px) - 2px) var(--wl-ws-space-6, 24px) calc(var(--wl-ws-space-6, 24px) * 2.66);
  outline: none;
  color: #0f172a;
  font-size: var(--rich-text-editor-body-size);
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.rich-text-editor__canvas :deep(.tiptap p) {
  margin: 0;
}

.rich-text-editor__canvas :deep(.tiptap p.is-editor-empty:first-child::before) {
  float: left;
  height: 0;
  color: #94a3b8;
  content: attr(data-placeholder);
  pointer-events: none;
}

.rich-text-editor__canvas :deep(.tiptap h1),
.rich-text-editor__canvas :deep(.tiptap h2),
.rich-text-editor__canvas :deep(.tiptap h3),
.rich-text-editor__canvas :deep(.tiptap h4),
.rich-text-editor__canvas :deep(.tiptap h5),
.rich-text-editor__canvas :deep(.tiptap h6) {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
  letter-spacing: -0.02em;
  scroll-margin-top: 28px;
}

.rich-text-editor__canvas :deep(.tiptap h1) {
  font-size: var(--rich-text-editor-heading-1-size);
  line-height: 1.28;
}

.rich-text-editor__canvas :deep(.tiptap h2) {
  font-size: var(--rich-text-editor-heading-2-size);
  line-height: 1.34;
}

.rich-text-editor__canvas :deep(.tiptap h3) {
  font-size: var(--rich-text-editor-heading-3-size);
  line-height: 1.4;
}

.rich-text-editor__canvas :deep(.tiptap h4) {
  font-size: var(--rich-text-editor-heading-4-size);
  line-height: 1.48;
}

.rich-text-editor__canvas :deep(.tiptap h5) {
  font-size: var(--rich-text-editor-heading-5-size);
  line-height: 1.55;
}

.rich-text-editor__canvas :deep(.tiptap h6) {
  font-size: var(--rich-text-editor-heading-6-size);
  line-height: 1.55;
  color: #334155;
}

.rich-text-editor__canvas :deep(.tiptap blockquote) {
  margin: 0;
  padding-left: var(--wl-ws-space-4, 16px);
  border-left: 3px solid #cbd5e1;
  color: #475569;
}

.rich-text-editor__canvas :deep(.tiptap ul),
.rich-text-editor__canvas :deep(.tiptap ol) {
  margin: 0;
  padding-left: 22px;
}

.rich-text-editor__canvas :deep(.tiptap pre) {
  margin: 0;
  padding: 48px 18px 16px;
  border: 1px solid #0f172a;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  overflow-x: auto;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__heading-fold-toggle) {
  display: inline-flex;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  margin-left: -28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #94a3b8;
  vertical-align: middle;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__heading-fold-toggle:hover) {
  background: #f8fafc;
  color: #0f172a;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__fold-hidden) {
  display: none;
}

.rich-text-editor__canvas :deep(.tiptap pre code) {
  display: block;
  background: transparent;
  color: inherit;
  padding: 0;
}

.rich-text-editor__canvas :deep(.tiptap code) {
  padding: 0.15em 0.42em;
  border-radius: 0.45em;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 0.92em;
}

.rich-text-editor__canvas :deep(.tiptap .hljs-comment),
.rich-text-editor__canvas :deep(.tiptap .hljs-quote) {
  color: #94a3b8;
}

.rich-text-editor__canvas :deep(.tiptap .hljs-keyword),
.rich-text-editor__canvas :deep(.tiptap .hljs-selector-tag),
.rich-text-editor__canvas :deep(.tiptap .hljs-literal),
.rich-text-editor__canvas :deep(.tiptap .hljs-title),
.rich-text-editor__canvas :deep(.tiptap .hljs-section),
.rich-text-editor__canvas :deep(.tiptap .hljs-doctag),
.rich-text-editor__canvas :deep(.tiptap .hljs-type),
.rich-text-editor__canvas :deep(.tiptap .hljs-name),
.rich-text-editor__canvas :deep(.tiptap .hljs-strong) {
  color: #93c5fd;
}

.rich-text-editor__canvas :deep(.tiptap .hljs-string),
.rich-text-editor__canvas :deep(.tiptap .hljs-attr),
.rich-text-editor__canvas :deep(.tiptap .hljs-template-variable),
.rich-text-editor__canvas :deep(.tiptap .hljs-symbol),
.rich-text-editor__canvas :deep(.tiptap .hljs-bullet) {
  color: #86efac;
}

.rich-text-editor__canvas :deep(.tiptap .hljs-number),
.rich-text-editor__canvas :deep(.tiptap .hljs-regexp),
.rich-text-editor__canvas :deep(.tiptap .hljs-link) {
  color: #fbbf24;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__search-match) {
  border-radius: 4px;
  background: rgba(250, 204, 21, 0.2);
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__search-match--active) {
  background: rgba(250, 204, 21, 0.36);
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion) {
  display: inline;
  color: rgba(100, 116, 139, 0.7);
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-hint) {
  display: inline-flex;
  margin-left: 8px;
  align-items: center;
  gap: 4px;
  vertical-align: text-bottom;
  opacity: 0.68;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-hint-key) {
  display: inline-flex;
  min-width: 28px;
  height: 20px;
  padding: 0 7px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 6px;
  background: rgba(248, 250, 252, 0.48);
  color: rgba(71, 85, 105, 0.7);
  font-size: var(--rich-text-editor-font-2xs);
  font-weight: 500;
  line-height: 1;
  letter-spacing: 0.02em;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-hint-label) {
  color: rgba(100, 116, 139, 0.58);
  font-size: var(--rich-text-editor-font-xs);
  font-weight: 400;
  line-height: 1;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-loading) {
  display: inline-flex;
  width: 18px;
  height: 18px;
  margin-left: 6px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  vertical-align: text-bottom;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-loading:hover) {
  background: rgba(226, 232, 240, 0.8);
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-loading:focus-visible) {
  outline: 2px solid rgba(37, 99, 235, 0.28);
  outline-offset: 1px;
}

.rich-text-editor__canvas :deep(.tiptap .rich-text-editor__inline-completion-loading-spinner) {
  width: 12px;
  height: 12px;
  border: 1.5px solid rgba(148, 163, 184, 0.45);
  border-top-color: #2563eb;
  border-radius: 999px;
  animation: rich-text-editor-inline-completion-spin 0.8s linear infinite;
}

.rich-text-editor__canvas :deep(.tiptap hr) {
  border: none;
  border-top: 1px solid #dbe3ef;
}

.rich-text-editor__canvas :deep(.tiptap table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.rich-text-editor__canvas :deep(.tiptap th),
.rich-text-editor__canvas :deep(.tiptap td) {
  padding: 10px 12px;
  border: 1px solid #dbe3ef;
  vertical-align: top;
}

.rich-text-editor__canvas :deep(.tiptap th) {
  background: #f8fafc;
  font-weight: 700;
  text-align: left;
}

.rich-text-editor__canvas :deep(.tiptap a) {
  color: #1d4ed8;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.rich-text-editor__canvas :deep(.tiptap > * + *) {
  margin-top: 18px;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-node) {
  position: relative;
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 0;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-frame) {
  position: relative;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #f8fafc;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-node--selected .rich-text-editor__image-frame) {
  border-color: #93c5fd;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-node--comment-active .rich-text-editor__image-frame) {
  border-color: #f59e0b;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-element) {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder) {
  display: flex;
  min-width: 220px;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(226, 232, 240, 0.9), rgba(241, 245, 249, 0.95));
  color: #475569;
  text-align: center;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder-actions) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder-action) {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder-icon) {
  font-size: 28px;
  line-height: 1;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder-title) {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-placeholder-meta) {
  max-width: 100%;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-resize-handle) {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 52px;
  border: none;
  border-radius: 999px;
  background: #1d4ed8;
  transform: translateY(-50%);
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-resize-handle--left) {
  left: 8px;
  cursor: ew-resize;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-comment-badge) {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid rgba(245, 158, 11, 0.24);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-comment-badge--active) {
  border-color: #f59e0b;
  background: #fffbeb;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-action-bar) {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(219, 227, 239, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-action-button) {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #334155;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-action-button:hover) {
  border-color: #dbe3ef;
  background: #f8fafc;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-action-button--danger) {
  color: #b91c1c;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-meta-editor) {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 12px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(219, 227, 239, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-meta-input) {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #0f172a;
  font-size: 12px;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-meta-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-meta-button) {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-meta-button--primary) {
  border-color: #cfe0ff;
  background: #edf4ff;
  color: #1d4ed8;
}

.rich-text-editor__canvas :deep(.rich-text-editor__comment-selection) {
  background: rgba(245, 158, 11, 0.16);
  border-bottom: 1px solid rgba(245, 158, 11, 0.42);
  cursor: pointer;
}

.rich-text-editor__canvas :deep(.rich-text-editor__comment-selection--active) {
  background: rgba(245, 158, 11, 0.24);
}

.rich-text-editor__canvas :deep(.rich-text-editor__comment-marker) {
  display: inline-flex;
  width: 20px;
  height: 20px;
  margin-left: 4px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 999px;
  background: #fffbeb;
  color: #b45309;
  font-size: var(--rich-text-editor-font-xs);
  font-weight: 700;
  vertical-align: middle;
}

.rich-text-editor__canvas :deep(.rich-text-editor__comment-marker--active) {
  border-color: #f59e0b;
  background: #fef3c7;
}

.rich-text-editor__canvas :deep(.rich-text-editor__image-resize-handle--right) {
  right: 8px;
  cursor: ew-resize;
}

.rich-text-editor__canvas :deep(.rich-text-editor__remote-selection) {
  background: color-mix(in srgb, var(--collab-selection-color) 18%, transparent);
}

.rich-text-editor__canvas :deep(.rich-text-editor__remote-caret) {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  border-left: 2px solid #2563eb;
  border-right: 2px solid transparent;
  pointer-events: none;
}

.rich-text-editor__canvas :deep(.rich-text-editor__remote-caret-label) {
  position: absolute;
  top: -1.55em;
  left: -1px;
  border-radius: 999px;
  padding: 2px 8px;
  color: #fff;
  font-size: var(--rich-text-editor-font-xs);
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.rich-text-editor__code-block-toolbar {
  position: absolute;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.96);
}

.rich-text-editor__code-block-language {
  height: 28px;
  min-width: 108px;
  padding: 0 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  font-size: 12px;
  outline: none;
}

.rich-text-editor__code-block-copy {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #cbd5e1;
}

.rich-text-editor__code-block-copy:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.rich-text-editor__selection-toolbar {
  position: fixed;
  z-index: 4000;
  display: flex;
  flex-wrap: nowrap;
  gap: var(--rich-text-editor-selection-toolbar-gap, 5px);
  align-items: center;
  width: max-content;
  max-width: calc(100vw - 24px);
  padding: var(--rich-text-editor-selection-toolbar-padding, 4px);
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  overflow-x: auto;
}

.rich-text-editor__selection-toolbar-heading,
.rich-text-editor__selection-toolbar-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  height: var(--rich-text-editor-selection-toolbar-button-size, 31px);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font-size: var(--rich-text-editor-selection-toolbar-font-size, 12px);
  font-weight: 600;
}

.rich-text-editor__selection-toolbar-button {
  width: var(--rich-text-editor-selection-toolbar-button-size, 31px);
}

.rich-text-editor__selection-toolbar-heading {
  gap: 4px;
  padding: 0 10px;
}

.rich-text-editor__selection-toolbar-heading:hover,
.rich-text-editor__selection-toolbar-heading--active,
.rich-text-editor__selection-toolbar-button:hover,
.rich-text-editor__selection-toolbar-button--active {
  border-color: #dbe3ef;
  background: #f8fafc;
  color: #0f172a;
}

.rich-text-editor__selection-toolbar-icon {
  font-size: var(--rich-text-editor-selection-toolbar-icon-size, 18px);
  line-height: 1;
}

.rich-text-editor__selection-toolbar-heading-label {
  line-height: 1;
}

.rich-text-editor__selection-toolbar-chevron {
  font-size: 15px;
  line-height: 1;
}

.rich-text-editor__heading-menu {
  position: fixed;
  z-index: 4000;
  display: flex;
  min-width: 168px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  background: #fff;
}

.rich-text-editor__heading-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: #0f172a;
  text-align: left;
}

.rich-text-editor__heading-menu-item:hover,
.rich-text-editor__heading-menu-item--active {
  background: #f8fafc;
}

.rich-text-editor__heading-menu-icon,
.rich-text-editor__heading-menu-check {
  font-size: 16px;
  line-height: 1;
}

.rich-text-editor__heading-menu-label {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
}

.rich-text-editor__slash-menu {
  position: fixed;
  z-index: 4000;
  width: 280px;
  overflow: hidden;
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  background: #fff;
}

.rich-text-editor__slash-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: #0f172a;
  text-align: left;
}

.rich-text-editor__slash-menu-item:hover,
.rich-text-editor__slash-menu-item--active {
  background: #f8fafc;
}

.rich-text-editor__slash-menu-main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.rich-text-editor__slash-menu-icon {
  font-size: 17px;
  line-height: 1;
}

.rich-text-editor__slash-menu-label {
  font-size: 13px;
  font-weight: 600;
}

.rich-text-editor__slash-menu-meta {
  color: #94a3b8;
  font-size: var(--rich-text-editor-font-xs);
}

.rich-text-editor__slash-menu-empty {
  padding: 12px;
  color: #64748b;
  font-size: 12px;
}

:global(body.rich-text-editor--image-resizing) {
  cursor: ew-resize;
}

@keyframes rich-text-editor-inline-completion-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .rich-text-editor__inline-search {
    top: 14px;
    right: 14px;
    width: calc(100% - 28px);
  }

  .rich-text-editor__canvas :deep(.tiptap) {
    min-height: 360px;
    padding: 18px 16px 48px;
  }
}
</style>
