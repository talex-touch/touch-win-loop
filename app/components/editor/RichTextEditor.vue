<script setup lang="ts">
import type { Awareness } from 'y-protocols/awareness'
import type { WorkspaceFontSizePreset } from '~~/shared/types/domain'
import type {
  WorkspaceCollabAwarenessSelectionState,
  WorkspaceCollabSelectionSummary,
} from '~/components/workspace/collab/presence'
import type { RichTextEditorCommand } from '~/components/editor/rich-text-editor-commands'
import { Extension } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import Placeholder from '@tiptap/extension-placeholder'
import { Editor, EditorContent } from '@tiptap/vue-3'
import {
  relativePositionToAbsolutePosition,
  yCursorPlugin,
  ySyncPluginKey,
} from '@tiptap/y-tiptap'
import * as Y from 'yjs'
import { buildRichTextEditorCommands } from '~/components/editor/rich-text-editor-commands'
import { createCollabMarkdownBaseExtensions } from '~~/shared/utils/collab-rich-text-schema'

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

interface SlashCommandRange {
  from: number
  to: number
}

const props = withDefaults(defineProps<{
  doc: Y.Doc | null
  awareness?: Awareness | null
  currentUser?: RichTextEditorCurrentUser | null
  editable?: boolean
  placeholder?: string
  headingLevels?: Array<1 | 2 | 3>
  showToolbar?: boolean
  contentMaxWidth?: number | string
  enableSlashMenu?: boolean
  uiFontSizePreset?: WorkspaceFontSizePreset
  imageUploadHandler?: ((file: File) => Promise<RichTextEditorImageUploadResult>) | null
}>(), {
  awareness: null,
  currentUser: null,
  editable: true,
  placeholder: '输入正文或标题，协作文档会实时同步',
  headingLevels: () => [1, 2, 3],
  showToolbar: true,
  contentMaxWidth: '1040px',
  enableSlashMenu: false,
  uiFontSizePreset: 'md',
  imageUploadHandler: null,
})

const emit = defineEmits<{
  selectionChange: [value: RichTextEditorSelectionChangePayload]
  remotePresenceChange: [value: WorkspaceCollabAwarenessSelectionState[]]
}>()

const editor = shallowRef<Editor | null>(null)
const linkDraft = ref('https://')
const linkInputVisible = ref(false)
const linkInputRef = ref<HTMLInputElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const pendingImageInsertPosition = ref<number | null>(null)
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

const normalizedHeadingLevels = computed<Array<1 | 2 | 3>>(() => {
  const dedupe = new Set<1 | 2 | 3>()
  for (const level of props.headingLevels) {
    if (level === 1 || level === 2 || level === 3)
      dedupe.add(level)
  }

  const levels = [...dedupe].sort((left, right) => left - right)
  return levels.length > 0 ? levels : [1, 2, 3]
})

const commandItems = computed(() => {
  return buildRichTextEditorCommands(normalizedHeadingLevels.value, {
    includeImageCommand: Boolean(props.imageUploadHandler),
  })
})

const toolbarItems = computed(() => {
  return commandItems.value.filter(item => item.toolbarVisible !== false)
})

const selectionToolbarItems = computed(() => {
  const actionWhitelist = new Set<RichTextEditorCommand['action']>([
    'bold',
    'italic',
    'underline',
    'strike',
    'link',
    'code',
  ])
  return commandItems.value.filter(item => actionWhitelist.has(item.action))
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

const editorInlineStyle = computed(() => {
  return {
    '--rich-text-editor-content-max-width': normalizedContentMaxWidth.value,
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
    top: `${selectionToolbarState.top}px`,
    left: `${selectionToolbarState.left}px`,
    '--rich-text-editor-selection-toolbar-height': `${metrics.height}px`,
    '--rich-text-editor-selection-toolbar-padding': `${metrics.padding}px`,
    '--rich-text-editor-selection-toolbar-gap': `${metrics.gap}px`,
    '--rich-text-editor-selection-toolbar-button-size': `${metrics.buttonSize}px`,
    '--rich-text-editor-selection-toolbar-font-size': `${metrics.fontSize}px`,
    '--rich-text-editor-selection-toolbar-icon-size': `${metrics.iconSize}px`,
  }
})

let removeAwarenessListener: (() => void) | null = null

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

function normalizePreviewText(value: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized)
    return ''
  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized
}

function resolveSelectionToolbarMetrics() {
  if (props.uiFontSizePreset === 'xs') {
    return {
      width: 228,
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
      width: 236,
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
      width: 260,
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
      width: 272,
      height: 44,
      padding: 5,
      gap: 6,
      buttonSize: 34,
      fontSize: 12,
      iconSize: 20,
    }
  }

  return {
    width: 248,
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
    selectedTextPreview: normalizePreviewText(String(selectedText || '')),
  }
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
    selectedTextPreview: '',
  }
}

function closeLinkEditor(nextValue = 'https://'): void {
  linkDraft.value = nextValue
  linkInputVisible.value = false
  nextTick(() => {
    syncSelectionToolbar()
  })
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
    || selectionToolbarItems.value.length === 0
  ) {
    return null
  }

  const { selection } = instance.state
  if (selection.empty)
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
}

function syncDerivedState(): void {
  emitSelectionChange()
  emitRemotePresenceChange()
  syncSlashMenu()
  syncSelectionToolbar()
}

function destroyEditor(): void {
  closeLinkEditor()
  closeSlashMenu()
  closeSelectionToolbar()
  removeAwarenessListener?.()
  removeAwarenessListener = null
  if (!editor.value)
    return
  editor.value.destroy()
  editor.value = null
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
  }
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
  let inserted = false

  for (const file of imageFiles) {
    try {
      const uploaded = await imageUploadHandler(file)
      const attrs = normalizeImageUploadResult(uploaded, file)
      if (!attrs)
        continue

      const currentEditor = editor.value
      if (!currentEditor)
        break

      if (anchorPosition !== null) {
        const boundedPosition = Math.max(0, Math.min(anchorPosition, currentEditor.state.doc.content.size))
        currentEditor
          .chain()
          .focus()
          .setTextSelection(boundedPosition)
          .insertContent({
            type: 'image',
            attrs,
          })
          .run()
      }
      else {
        currentEditor
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs,
          })
          .run()
      }

      anchorPosition = currentEditor.state.selection.from
      inserted = true
    }
    catch {
      // 上传状态由外层页面统一提示
    }
  }

  return inserted
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
    return
  }

  prepareCommandSelection(replaceRange)

  const chain = instance.chain().focus()
  if (command.action === 'heading' && command.level) {
    chain.toggleHeading({ level: command.level }).run()
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

function handleEditorPaste(_view: unknown, event: ClipboardEvent): boolean {
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

function createEditor(doc: Y.Doc, awareness: Awareness | null): void {
  if (!import.meta.client)
    return

  destroyEditor()
  bindAwarenessListener(awareness)

  const extensions = [
    ...createCollabMarkdownBaseExtensions(),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
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

  editor.value = new Editor({
    element: document.createElement('div'),
    editable: props.editable,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'rich-text-editor__prosemirror',
      },
      handleKeyDown: handleEditorKeyDown,
      handlePaste: handleEditorPaste,
      handleDrop: handleEditorDrop,
    },
    extensions,
    onCreate: syncDerivedState,
    onSelectionUpdate: syncDerivedState,
    onUpdate: syncDerivedState,
    onFocus: syncDerivedState,
    onBlur: () => {
      emitSelectionChange()
      emitRemotePresenceChange()
      closeSlashMenu()
      closeSelectionToolbar()
    },
    onTransaction: syncDerivedState,
  })

  syncLocalAwarenessUser()
}

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
    emit('remotePresenceChange', [])
    emit('selectionChange', defaultSelectionChangePayload())
    return
  }

  createEditor(nextDoc, nextAwareness)
}, { immediate: true })

watch(() => props.editable, (editable) => {
  editor.value?.setEditable(Boolean(editable))
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

watch(() => props.currentUser, () => {
  syncLocalAwarenessUser()
}, { deep: true })

onBeforeUnmount(() => {
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
      <div class="rich-text-editor__canvas">
        <EditorContent v-if="editor" :editor="editor" />
        <div v-else class="rich-text-editor__empty">
          文档正在初始化...
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
          v-for="item in selectionToolbarItems"
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
            <span class="rich-text-editor__slash-menu-label">
              {{ item.label }}
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
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #fff;
}

.rich-text-editor__canvas {
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 0 18px;
  background: transparent;
}

.rich-text-editor__empty {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 13px;
}

.rich-text-editor__canvas :deep(.tiptap) {
  width: 100%;
  max-width: var(--rich-text-editor-content-max-width);
  min-height: 520px;
  margin: 0 auto;
  outline: none;
  color: #0f172a;
  font-size: 16px;
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
.rich-text-editor__canvas :deep(.tiptap h3) {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.rich-text-editor__canvas :deep(.tiptap h1) {
  font-size: 32px;
  line-height: 1.28;
}

.rich-text-editor__canvas :deep(.tiptap h2) {
  font-size: 24px;
  line-height: 1.36;
}

.rich-text-editor__canvas :deep(.tiptap h3) {
  font-size: 20px;
  line-height: 1.42;
}

.rich-text-editor__canvas :deep(.tiptap blockquote) {
  margin: 0;
  padding-left: 16px;
  border-left: 3px solid #cbd5e1;
  color: #475569;
}

.rich-text-editor__canvas :deep(.tiptap ul),
.rich-text-editor__canvas :deep(.tiptap ol) {
  margin: 0;
  padding-left: 22px;
}

.rich-text-editor__canvas :deep(.tiptap img) {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  border-radius: 14px;
}

.rich-text-editor__canvas :deep(.tiptap pre) {
  margin: 0;
  padding: 16px 18px;
  border: 1px solid #0f172a;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
  overflow-x: auto;
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
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
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
  background: #fff;
  overflow-x: auto;
}

.rich-text-editor__selection-toolbar-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--rich-text-editor-selection-toolbar-button-size, 31px);
  height: var(--rich-text-editor-selection-toolbar-button-size, 31px);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #475569;
  font-size: var(--rich-text-editor-selection-toolbar-font-size, 12px);
  font-weight: 600;
}

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

.rich-text-editor__slash-menu {
  position: fixed;
  z-index: 4000;
  width: 260px;
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

.rich-text-editor__slash-menu-label {
  font-size: 13px;
  font-weight: 600;
}

.rich-text-editor__slash-menu-meta {
  color: #94a3b8;
  font-size: 11px;
}

.rich-text-editor__slash-menu-empty {
  padding: 12px;
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 960px) {
  .rich-text-editor__canvas {
    padding: 0 14px;
  }

  .rich-text-editor__canvas :deep(.tiptap) {
    min-height: 360px;
  }
}
</style>
