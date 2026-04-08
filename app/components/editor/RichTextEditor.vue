<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type { Awareness } from 'y-protocols/awareness'
import type {
  WorkspaceCollabAwarenessSelectionState,
  WorkspaceCollabSelectionSummary,
} from '~/components/workspace/collab/presence'
import Collaboration from '@tiptap/extension-collaboration'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { yCursorPlugin, ySyncPluginKey, relativePositionToAbsolutePosition } from '@tiptap/y-tiptap'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { createCollabMarkdownBaseExtensions } from '~~/shared/utils/collab-rich-text-schema'
import * as Y from 'yjs'

type ToolbarAction
  = 'paragraph'
    | 'heading'
    | 'bold'
    | 'italic'
    | 'strike'
    | 'underline'
    | 'blockquote'
    | 'bulletList'
    | 'orderedList'
    | 'taskList'
    | 'link'
    | 'code'
    | 'codeBlock'
    | 'table'
    | 'horizontalRule'

interface ToolbarItem {
  id: string
  label: string
  action: ToolbarAction
  level?: 1 | 2 | 3
}

interface RichTextEditorCurrentUser {
  id: string
  name: string
  color: string
}

interface RichTextEditorSelectionChangePayload extends WorkspaceCollabSelectionSummary {
  line: number
  column: number
}

const props = withDefaults(defineProps<{
  doc: Y.Doc | null
  awareness?: Awareness | null
  currentUser?: RichTextEditorCurrentUser | null
  editable?: boolean
  placeholder?: string
  headingLevels?: Array<1 | 2 | 3>
}>(), {
  awareness: null,
  currentUser: null,
  editable: true,
  placeholder: '输入正文或标题，协作文档会实时同步',
  headingLevels: () => [1, 2, 3],
})

const emit = defineEmits<{
  'selection-change': [value: RichTextEditorSelectionChangePayload]
  'remote-presence-change': [value: WorkspaceCollabAwarenessSelectionState[]]
}>()

const editor = shallowRef<Editor | null>(null)

const normalizedHeadingLevels = computed<Array<1 | 2 | 3>>(() => {
  const dedupe = new Set<1 | 2 | 3>()
  for (const level of props.headingLevels) {
    if (level === 1 || level === 2 || level === 3)
      dedupe.add(level)
  }

  const levels = [...dedupe].sort((left, right) => left - right)
  return levels.length > 0 ? levels : [1, 2, 3]
})

const toolbarItems = computed<ToolbarItem[]>(() => {
  return [
    {
      id: 'paragraph',
      label: '正文',
      action: 'paragraph',
    },
    ...normalizedHeadingLevels.value.map(level => ({
      id: `heading-${level}`,
      label: `H${level}`,
      action: 'heading' as const,
      level,
    })),
    { id: 'bold', label: '加粗', action: 'bold' },
    { id: 'italic', label: '斜体', action: 'italic' },
    { id: 'strike', label: '删除线', action: 'strike' },
    { id: 'underline', label: '下划线', action: 'underline' },
    { id: 'blockquote', label: '引用', action: 'blockquote' },
    { id: 'bullet-list', label: '无序列表', action: 'bulletList' },
    { id: 'ordered-list', label: '有序列表', action: 'orderedList' },
    { id: 'task-list', label: '任务列表', action: 'taskList' },
    { id: 'link', label: '链接', action: 'link' },
    { id: 'code', label: '行内代码', action: 'code' },
    { id: 'code-block', label: '代码块', action: 'codeBlock' },
    { id: 'table', label: '表格', action: 'table' },
    { id: 'horizontal-rule', label: '分割线', action: 'horizontalRule' },
  ]
})

let removeAwarenessListener: (() => void) | null = null

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizePreviewText(value: string): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized)
    return ''
  return normalized.length > 48 ? `${normalized.slice(0, 48)}…` : normalized
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

function emitSelectionChange(): void {
  const instance = editor.value
  if (!instance) {
    emit('selection-change', defaultSelectionChangePayload())
    return
  }

  const summary = buildSelectionSummary(instance.state.doc, instance.state.selection.anchor, instance.state.selection.head)
  emit('selection-change', {
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
    emit('remote-presence-change', [])
    return
  }

  const syncState = ySyncPluginKey.getState(instance.state)
  const mapping = syncState?.binding?.mapping
  if (!mapping) {
    emit('remote-presence-change', [])
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

  emit('remote-presence-change', remoteStates)
}

function syncDerivedState(): void {
  emitSelectionChange()
  emitRemotePresenceChange()
}

function destroyEditor(): void {
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
    },
    extensions,
    onCreate: syncDerivedState,
    onSelectionUpdate: syncDerivedState,
    onUpdate: syncDerivedState,
    onFocus: syncDerivedState,
    onBlur: syncDerivedState,
    onTransaction: emitRemotePresenceChange,
  })

  syncLocalAwarenessUser()
}

function applyToolbarItem(item: ToolbarItem): void {
  const instance = editor.value
  if (!instance || !props.editable)
    return

  const chain = instance.chain().focus()
  if (item.action === 'heading' && item.level) {
    chain.toggleHeading({ level: item.level }).run()
    return
  }

  if (item.action === 'paragraph') {
    chain.setParagraph().run()
    return
  }

  if (item.action === 'bold') {
    chain.toggleBold().run()
    return
  }

  if (item.action === 'italic') {
    chain.toggleItalic().run()
    return
  }

  if (item.action === 'strike') {
    chain.toggleStrike().run()
    return
  }

  if (item.action === 'underline') {
    chain.toggleUnderline().run()
    return
  }

  if (item.action === 'blockquote') {
    chain.toggleBlockquote().run()
    return
  }

  if (item.action === 'bulletList') {
    chain.toggleBulletList().run()
    return
  }

  if (item.action === 'orderedList') {
    chain.toggleOrderedList().run()
    return
  }

  if (item.action === 'taskList') {
    chain.toggleTaskList().run()
    return
  }

  if (item.action === 'link') {
    if (instance.isActive('link')) {
      chain.unsetLink().run()
      return
    }

    const href = import.meta.client ? window.prompt('请输入链接地址', 'https://') : ''
    const normalizedHref = normalizeString(href)
    if (!normalizedHref)
      return

    chain.extendMarkRange('link').setLink({ href: normalizedHref }).run()
    return
  }

  if (item.action === 'code') {
    chain.toggleCode().run()
    return
  }

  if (item.action === 'codeBlock') {
    chain.toggleCodeBlock().run()
    return
  }

  if (item.action === 'table') {
    if (instance.isActive('table')) {
      chain.deleteTable().run()
      return
    }

    chain.insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    }).run()
    return
  }

  if (item.action === 'horizontalRule')
    chain.setHorizontalRule().run()
}

function isToolbarItemActive(item: ToolbarItem): boolean {
  const instance = editor.value
  if (!instance)
    return false

  if (item.action === 'heading' && item.level)
    return instance.isActive('heading', { level: item.level })

  if (item.action === 'paragraph')
    return instance.isActive('paragraph')

  if (item.action === 'table')
    return instance.isActive('table')

  return instance.isActive(item.action)
}

watch([() => props.doc, () => props.awareness], ([nextDoc, nextAwareness]) => {
  if (!nextDoc) {
    destroyEditor()
    emit('remote-presence-change', [])
    emit('selection-change', defaultSelectionChangePayload())
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
  <section class="rich-text-editor">
    <div class="rich-text-editor__toolbar">
      <button
        v-for="item in toolbarItems"
        :key="item.id"
        class="rich-text-editor__toolbar-button"
        :class="{ 'rich-text-editor__toolbar-button--active': isToolbarItemActive(item) }"
        type="button"
        :disabled="!editor || !editable"
        @click="applyToolbarItem(item)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="rich-text-editor__surface">
      <div class="rich-text-editor__canvas">
        <EditorContent v-if="editor" :editor="editor" />
        <div v-else class="rich-text-editor__empty">
          文档正在初始化...
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rich-text-editor {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(219, 234, 254, 0.82), transparent 28%),
    linear-gradient(180deg, rgba(244, 247, 252, 0.96) 0%, rgba(240, 244, 250, 0.92) 100%);
}

.rich-text-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e6ebf2;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(14px);
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
    color 0.18s ease,
    box-shadow 0.18s ease;
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
  box-shadow: inset 0 0 0 1px rgba(47, 106, 242, 0.08);
}

.rich-text-editor__toolbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.rich-text-editor__surface {
  overflow: auto;
  flex: 1;
  padding: 18px 20px 24px;
}

.rich-text-editor__canvas {
  width: 100%;
  min-height: 100%;
  padding: 36px 40px 52px;
  border: 1px solid #e5eaf2;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow:
    0 24px 44px rgba(15, 23, 42, 0.05),
    0 2px 8px rgba(15, 23, 42, 0.04);
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
  min-height: 520px;
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

.rich-text-editor__canvas :deep(.tiptap pre) {
  margin: 0;
  padding: 16px 18px;
  border-radius: 16px;
  background: #0f172a;
  color: #e2e8f0;
  overflow-x: auto;
}

.rich-text-editor__canvas :deep(.tiptap pre code) {
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

@media (max-width: 960px) {
  .rich-text-editor__surface {
    padding: 14px 12px 18px;
  }

  .rich-text-editor__canvas {
    padding: 24px 18px 30px;
    border-radius: 18px;
  }

  .rich-text-editor__canvas :deep(.tiptap) {
    min-height: 360px;
  }
}
</style>
