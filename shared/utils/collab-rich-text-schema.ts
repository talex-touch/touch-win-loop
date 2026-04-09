import type { Extensions } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { createLowlight } from 'lowlight'

export const COLLAB_MARKDOWN_HEADING_LEVELS = [1, 2, 3] as const

let cachedCollabMarkdownSchema: ReturnType<typeof getSchema> | null = null
const lowlight = createLowlight()
lowlight.register({
  plaintext,
  bash,
  json,
  javascript,
  typescript,
  html: xml,
  css,
  markdown,
  sql,
})

const CollabMarkdownImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      resourceId: {
        default: null,
        parseHTML: element => element.getAttribute('data-resource-id'),
        renderHTML: (attributes) => {
          const resourceId = String(attributes.resourceId || '').trim()
          return resourceId ? { 'data-resource-id': resourceId } : {}
        },
      },
    }
  },
}).configure({
  allowBase64: false,
  inline: false,
})

export function createCollabMarkdownBaseExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: {
        levels: [...COLLAB_MARKDOWN_HEADING_LEVELS],
      },
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      undoRedo: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      },
    }),
    Underline,
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'plaintext',
      languageClassPrefix: 'language-',
    }),
    CollabMarkdownImage,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Table.configure({
      resizable: false,
      allowTableNodeSelection: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
  ]
}

export function getCollabMarkdownSchema() {
  if (cachedCollabMarkdownSchema)
    return cachedCollabMarkdownSchema

  cachedCollabMarkdownSchema = getSchema(createCollabMarkdownBaseExtensions())
  return cachedCollabMarkdownSchema
}
