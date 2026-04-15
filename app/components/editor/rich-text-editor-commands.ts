import type { CollabMarkdownHeadingLevel } from '~~/shared/utils/collab-rich-text-schema'

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
    | 'comment'
    | 'aiSummarize'
    | 'aiRewrite'
    | 'aiExpand'
    | 'aiCompleteContext'
    | 'aiRestructure'
    | 'aiContinue'

export interface RichTextEditorCommand {
  id: string
  label: string
  icon?: string
  action: RichTextEditorCommandAction
  group: 'block' | 'inline'
  level?: CollabMarkdownHeadingLevel
  keywords?: string[]
  toolbarVisible?: boolean
}

function normalizeHeadingLevels(levels: CollabMarkdownHeadingLevel[] | undefined): CollabMarkdownHeadingLevel[] {
  const dedupe = new Set<CollabMarkdownHeadingLevel>()
  for (const level of levels || []) {
    if (level >= 1 && level <= 6)
      dedupe.add(level)
  }

  const normalized = [...dedupe].sort((left, right) => left - right)
  return normalized.length > 0 ? normalized : [1, 2, 3, 4, 5, 6]
}

function resolveHeadingIcon(level: CollabMarkdownHeadingLevel): string {
  if (level === 1)
    return 'looks_one'
  if (level === 2)
    return 'looks_two'
  if (level === 3)
    return 'looks_3'
  if (level === 4)
    return 'looks_4'
  if (level === 5)
    return 'looks_5'
  return 'looks_6'
}

export function buildRichTextEditorCommands(
  levels: CollabMarkdownHeadingLevel[] | undefined,
  options?: {
    includeImageCommand?: boolean
    includeCommentCommand?: boolean
    includeDocumentAssistCommands?: boolean
  },
): RichTextEditorCommand[] {
  const normalizedHeadingLevels = normalizeHeadingLevels(levels)
  const commands: RichTextEditorCommand[] = [
    {
      id: 'paragraph',
      label: '正文',
      icon: 'article',
      action: 'paragraph',
      group: 'block',
      keywords: ['text', 'paragraph', 'body'],
    },
    ...normalizedHeadingLevels.map((level) => {
      return {
        id: `heading-${level}`,
        label: `H${level}`,
        icon: resolveHeadingIcon(level),
        action: 'heading' as const,
        group: 'block' as const,
        level,
        keywords: [`title${level}`, 'heading'],
      }
    }),
    { id: 'bold', label: '加粗', icon: 'format_bold', action: 'bold', group: 'inline', keywords: ['strong', 'bold'] },
    { id: 'italic', label: '斜体', icon: 'format_italic', action: 'italic', group: 'inline', keywords: ['italic', 'emphasis'] },
    { id: 'strike', label: '删除线', icon: 'format_strikethrough', action: 'strike', group: 'inline', keywords: ['strike', 'delete'] },
    { id: 'underline', label: '下划线', icon: 'format_underlined', action: 'underline', group: 'inline', keywords: ['underline'] },
    { id: 'blockquote', label: '引用', icon: 'format_quote', action: 'blockquote', group: 'block', keywords: ['quote', 'blockquote'] },
    { id: 'bullet-list', label: '无序列表', icon: 'format_list_bulleted', action: 'bulletList', group: 'block', keywords: ['ul', 'list', 'bullet'] },
    { id: 'ordered-list', label: '有序列表', icon: 'format_list_numbered', action: 'orderedList', group: 'block', keywords: ['ol', 'list', 'ordered'] },
    { id: 'task-list', label: '任务列表', icon: 'checklist', action: 'taskList', group: 'block', keywords: ['task', 'todo', 'checklist'] },
    { id: 'link', label: '链接', icon: 'link', action: 'link', group: 'inline', keywords: ['url', 'link'] },
    { id: 'code', label: '行内代码', icon: 'code', action: 'code', group: 'inline', keywords: ['inline code', 'code'] },
    { id: 'code-block', label: '代码块', icon: 'terminal', action: 'codeBlock', group: 'block', keywords: ['codeblock', 'snippet'] },
    { id: 'table', label: '表格', icon: 'table_chart', action: 'table', group: 'block', keywords: ['table', 'grid'] },
    { id: 'horizontal-rule', label: '分割线', icon: 'horizontal_rule', action: 'horizontalRule', group: 'block', keywords: ['rule', 'divider', 'hr'] },
  ]

  if (options?.includeImageCommand) {
    commands.push({
      id: 'image',
      label: '图片上传',
      icon: 'image',
      action: 'image',
      group: 'block',
      keywords: ['image', 'img', 'upload', 'picture'],
      toolbarVisible: false,
    })
  }

  if (options?.includeCommentCommand) {
    commands.push({
      id: 'comment',
      label: '评论',
      icon: 'add_comment',
      action: 'comment',
      group: 'inline',
      keywords: ['comment', 'review', 'discussion'],
      toolbarVisible: false,
    })
  }

  if (options?.includeDocumentAssistCommands) {
    commands.push(
      {
        id: 'ai-summarize',
        label: '总结选区',
        icon: 'short_text',
        action: 'aiSummarize',
        group: 'inline',
        keywords: ['ai', 'summary', 'summarize'],
        toolbarVisible: false,
      },
      {
        id: 'ai-rewrite',
        label: '润写选区',
        icon: 'edit_note',
        action: 'aiRewrite',
        group: 'inline',
        keywords: ['ai', 'rewrite', 'polish'],
        toolbarVisible: false,
      },
      {
        id: 'ai-expand',
        label: '扩写选区',
        icon: 'open_in_full',
        action: 'aiExpand',
        group: 'inline',
        keywords: ['ai', 'expand', 'extend'],
        toolbarVisible: false,
      },
      {
        id: 'ai-complete-context',
        label: '补全上下文',
        icon: 'library_add',
        action: 'aiCompleteContext',
        group: 'inline',
        keywords: ['ai', 'context', 'complete'],
        toolbarVisible: false,
      },
      {
        id: 'ai-restructure',
        label: '整理结构',
        icon: 'account_tree',
        action: 'aiRestructure',
        group: 'block',
        keywords: ['ai', 'restructure', 'outline'],
        toolbarVisible: false,
      },
      {
        id: 'ai-continue',
        label: '续写当前位置',
        icon: 'auto_awesome',
        action: 'aiContinue',
        group: 'block',
        keywords: ['ai', 'continue', 'expand'],
        toolbarVisible: false,
      },
    )
  }

  return commands
}
