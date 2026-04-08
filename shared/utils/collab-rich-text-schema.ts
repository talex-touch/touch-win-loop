import type { Extensions } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Table } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'

export const COLLAB_MARKDOWN_HEADING_LEVELS = [1, 2, 3] as const

let cachedCollabMarkdownSchema: ReturnType<typeof getSchema> | null = null

export function createCollabMarkdownBaseExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: {
        levels: [...COLLAB_MARKDOWN_HEADING_LEVELS],
      },
      dropcursor: false,
      gapcursor: false,
      undoRedo: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
      },
    }),
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
