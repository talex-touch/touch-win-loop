<script setup lang="ts">
import type { Doc as YDoc } from 'yjs'
import Collaboration from '@tiptap/extension-collaboration'
import Document from '@tiptap/extension-document'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { Editor, EditorContent } from '@tiptap/vue-3'

type ToolbarAction = 'paragraph' | 'heading'

interface ToolbarItem {
  id: string
  label: string
  action: ToolbarAction
  level?: 1 | 2 | 3
}

const props = withDefaults(defineProps<{
  doc: YDoc | null
  editable?: boolean
  placeholder?: string
  headingLevels?: Array<1 | 2 | 3>
}>(), {
  editable: true,
  placeholder: '输入内容，使用正文或标题组织你的文档',
  headingLevels: () => [1, 2, 3],
})

const editor = shallowRef<Editor | null>(null)
const activeToolbarId = ref('paragraph')

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
  ]
})

function syncActiveToolbar(): void {
  const instance = editor.value
  if (!instance) {
    activeToolbarId.value = 'paragraph'
  }
  else {
    for (const level of normalizedHeadingLevels.value) {
      if (instance.isActive('heading', { level })) {
        activeToolbarId.value = `heading-${level}`
        return
      }
    }

    activeToolbarId.value = 'paragraph'
  }
}

function touchEditorState(): void {
  syncActiveToolbar()
}

function destroyEditor(): void {
  if (!editor.value)
    return
  editor.value.destroy()
  editor.value = null
}

function createEditor(doc: YDoc): void {
  if (!import.meta.client)
    return

  destroyEditor()

  editor.value = new Editor({
    element: document.createElement('div'),
    editable: props.editable,
    autofocus: false,
    editorProps: {
      attributes: {
        class: 'rich-text-editor__prosemirror',
      },
    },
    extensions: [
      Document,
      Paragraph,
      Text,
      Heading.configure({
        levels: normalizedHeadingLevels.value,
      }),
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
    ],
    onCreate: touchEditorState,
    onSelectionUpdate: touchEditorState,
    onUpdate: touchEditorState,
    onFocus: touchEditorState,
    onBlur: touchEditorState,
  })
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

  chain.setParagraph().run()
}

watch(() => props.doc, (nextDoc) => {
  if (!nextDoc) {
    destroyEditor()
    return
  }

  createEditor(nextDoc)
}, { immediate: true })

watch(() => props.editable, (editable) => {
  editor.value?.setEditable(Boolean(editable))
  touchEditorState()
})

watch(normalizedHeadingLevels, () => {
  if (!props.doc)
    return
  createEditor(props.doc)
})

watch(() => props.placeholder, () => {
  if (!props.doc)
    return
  createEditor(props.doc)
})

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
        :class="{ 'rich-text-editor__toolbar-button--active': activeToolbarId === item.id }"
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
  background: linear-gradient(180deg, rgba(244, 247, 252, 0.96) 0%, rgba(240, 244, 250, 0.92) 100%);
}

.rich-text-editor__toolbar {
  display: flex;
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
  padding: 28px 20px 36px;
}

.rich-text-editor__canvas {
  width: min(880px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 40px 48px 56px;
  border: 1px solid #e5eaf2;
  border-radius: 22px;
  background: #fff;
  box-shadow:
    0 24px 44px rgba(15, 23, 42, 0.06),
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

.rich-text-editor__canvas :deep(.tiptap > * + *) {
  margin-top: 18px;
}

@media (max-width: 960px) {
  .rich-text-editor__surface {
    padding: 18px 12px 24px;
  }

  .rich-text-editor__canvas {
    padding: 28px 20px 36px;
    border-radius: 18px;
  }

  .rich-text-editor__canvas :deep(.tiptap) {
    min-height: 360px;
  }
}
</style>
