export type RichTextEditorCommandAction
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
    | 'image'

export interface RichTextEditorCommand {
  id: string
  label: string
  action: RichTextEditorCommandAction
  group: 'block' | 'inline'
  level?: 1 | 2 | 3
  keywords?: string[]
  toolbarVisible?: boolean
}

function normalizeHeadingLevels(levels: Array<1 | 2 | 3> | undefined): Array<1 | 2 | 3> {
  const dedupe = new Set<1 | 2 | 3>()
  for (const level of levels || []) {
    if (level === 1 || level === 2 || level === 3)
      dedupe.add(level)
  }

  const normalized = [...dedupe].sort((left, right) => left - right)
  return normalized.length > 0 ? normalized : [1, 2, 3]
}

export function buildRichTextEditorCommands(
  levels: Array<1 | 2 | 3> | undefined,
  options?: {
    includeImageCommand?: boolean
  },
): RichTextEditorCommand[] {
  const normalizedHeadingLevels = normalizeHeadingLevels(levels)
  const commands: RichTextEditorCommand[] = [
    {
      id: 'paragraph',
      label: '正文',
      action: 'paragraph',
      group: 'block',
      keywords: ['text', 'paragraph', 'body'],
    },
    ...normalizedHeadingLevels.map((level) => {
      return {
        id: `heading-${level}`,
        label: `H${level}`,
        action: 'heading' as const,
        group: 'block' as const,
        level,
        keywords: [`title${level}`, 'heading'],
      }
    }),
    { id: 'bold', label: '加粗', action: 'bold', group: 'inline', keywords: ['strong', 'bold'] },
    { id: 'italic', label: '斜体', action: 'italic', group: 'inline', keywords: ['italic', 'emphasis'] },
    { id: 'strike', label: '删除线', action: 'strike', group: 'inline', keywords: ['strike', 'delete'] },
    { id: 'underline', label: '下划线', action: 'underline', group: 'inline', keywords: ['underline'] },
    { id: 'blockquote', label: '引用', action: 'blockquote', group: 'block', keywords: ['quote', 'blockquote'] },
    { id: 'bullet-list', label: '无序列表', action: 'bulletList', group: 'block', keywords: ['ul', 'list', 'bullet'] },
    { id: 'ordered-list', label: '有序列表', action: 'orderedList', group: 'block', keywords: ['ol', 'list', 'ordered'] },
    { id: 'task-list', label: '任务列表', action: 'taskList', group: 'block', keywords: ['task', 'todo', 'checklist'] },
    { id: 'link', label: '链接', action: 'link', group: 'inline', keywords: ['url', 'link'] },
    { id: 'code', label: '行内代码', action: 'code', group: 'inline', keywords: ['inline code', 'code'] },
    { id: 'code-block', label: '代码块', action: 'codeBlock', group: 'block', keywords: ['codeblock', 'snippet'] },
    { id: 'table', label: '表格', action: 'table', group: 'block', keywords: ['table', 'grid'] },
    { id: 'horizontal-rule', label: '分割线', action: 'horizontalRule', group: 'block', keywords: ['rule', 'divider', 'hr'] },
  ]

  if (options?.includeImageCommand) {
    commands.push({
      id: 'image',
      label: '图片上传',
      action: 'image',
      group: 'block',
      keywords: ['image', 'img', 'upload', 'picture'],
      toolbarVisible: false,
    })
  }

  return commands
}
