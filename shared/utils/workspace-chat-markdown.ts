import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'

export type WorkspaceChatMarkdownLinkScheme = 'http' | 'https' | 'mailto' | 'tel' | 'relative'

export interface WorkspaceChatMarkdownTextNode {
  type: 'text'
  value: string
}

export interface WorkspaceChatMarkdownBreakNode {
  type: 'break'
}

export interface WorkspaceChatMarkdownInlineCodeNode {
  type: 'inline_code'
  value: string
}

export interface WorkspaceChatMarkdownStrongNode {
  type: 'strong'
  children: WorkspaceChatMarkdownInlineNode[]
}

export interface WorkspaceChatMarkdownEmphasisNode {
  type: 'emphasis'
  children: WorkspaceChatMarkdownInlineNode[]
}

export interface WorkspaceChatMarkdownDeleteNode {
  type: 'delete'
  children: WorkspaceChatMarkdownInlineNode[]
}

export interface WorkspaceChatMarkdownLinkNode {
  type: 'link'
  url: string
  title: string
  scheme: WorkspaceChatMarkdownLinkScheme
  children: WorkspaceChatMarkdownInlineNode[]
}

export type WorkspaceChatMarkdownInlineNode = WorkspaceChatMarkdownTextNode | WorkspaceChatMarkdownBreakNode | WorkspaceChatMarkdownInlineCodeNode | WorkspaceChatMarkdownStrongNode | WorkspaceChatMarkdownEmphasisNode | WorkspaceChatMarkdownDeleteNode | WorkspaceChatMarkdownLinkNode

export interface WorkspaceChatMarkdownParagraphNode {
  type: 'paragraph'
  children: WorkspaceChatMarkdownInlineNode[]
}

export interface WorkspaceChatMarkdownHeadingNode {
  type: 'heading'
  depth: 1 | 2 | 3 | 4 | 5 | 6
  children: WorkspaceChatMarkdownInlineNode[]
}

export interface WorkspaceChatMarkdownBlockquoteNode {
  type: 'blockquote'
  children: WorkspaceChatMarkdownBlockNode[]
}

export interface WorkspaceChatMarkdownListItemNode {
  checked: boolean | null
  children: WorkspaceChatMarkdownBlockNode[]
}

export interface WorkspaceChatMarkdownListNode {
  type: 'list'
  ordered: boolean
  start: number | null
  items: WorkspaceChatMarkdownListItemNode[]
}

export interface WorkspaceChatMarkdownCodeNode {
  type: 'code'
  lang: string
  value: string
}

export interface WorkspaceChatMarkdownTableRowNode {
  header: boolean
  cells: WorkspaceChatMarkdownInlineNode[][]
}

export interface WorkspaceChatMarkdownTableNode {
  type: 'table'
  align: Array<'left' | 'center' | 'right' | null>
  rows: WorkspaceChatMarkdownTableRowNode[]
}

export interface WorkspaceChatMarkdownThematicBreakNode {
  type: 'thematic_break'
}

export type WorkspaceChatMarkdownBlockNode = WorkspaceChatMarkdownParagraphNode | WorkspaceChatMarkdownHeadingNode | WorkspaceChatMarkdownBlockquoteNode | WorkspaceChatMarkdownListNode | WorkspaceChatMarkdownCodeNode | WorkspaceChatMarkdownTableNode | WorkspaceChatMarkdownThematicBreakNode

export interface WorkspaceChatMarkdownParseSuccess {
  ok: true
  nodes: WorkspaceChatMarkdownBlockNode[]
  fallbackText: string
}

export interface WorkspaceChatMarkdownParseFailure {
  ok: false
  nodes: []
  fallbackText: string
}

export type WorkspaceChatMarkdownParseResult = WorkspaceChatMarkdownParseSuccess | WorkspaceChatMarkdownParseFailure

interface MdastNode {
  type: string
  value?: unknown
  depth?: unknown
  url?: unknown
  title?: unknown
  lang?: unknown
  start?: unknown
  ordered?: unknown
  checked?: unknown
  align?: unknown
  alt?: unknown
  children?: MdastNode[]
}

function toText(value: unknown): string {
  return String(value || '')
}

function normalizeText(value: unknown): string {
  return toText(value).replace(/\r\n?/g, '\n')
}

function normalizeString(value: unknown): string {
  return toText(value).trim()
}

function normalizeHeadingDepth(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const parsed = Number(value)
  if (parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5 || parsed === 6)
    return parsed
  return 1
}

function normalizeListStart(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
}

function normalizeTableAlign(value: unknown): Array<'left' | 'center' | 'right' | null> {
  if (!Array.isArray(value))
    return []

  return value.map((item) => {
    if (item === 'left' || item === 'center' || item === 'right')
      return item
    return null
  })
}

function sanitizeMarkdownLinkUrl(value: unknown): { url: string, scheme: WorkspaceChatMarkdownLinkScheme } | null {
  const url = normalizeString(value)
  if (!url)
    return null

  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../'))
    return { url, scheme: 'relative' }
  if (/^https?:\/\//iu.test(url))
    return { url, scheme: url.startsWith('https://') ? 'https' : 'http' }
  if (/^mailto:/iu.test(url))
    return { url, scheme: 'mailto' }
  if (/^tel:/iu.test(url))
    return { url, scheme: 'tel' }
  return null
}

function pushInlineNode(
  target: WorkspaceChatMarkdownInlineNode[],
  node: WorkspaceChatMarkdownInlineNode,
): void {
  if (node.type === 'text') {
    const previous = target[target.length - 1]
    if (previous?.type === 'text') {
      previous.value += node.value
      return
    }
  }
  target.push(node)
}

function collectPlainText(node: MdastNode | null | undefined): string {
  if (!node)
    return ''

  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code' || node.type === 'html')
    return toText(node.value)
  if (node.type === 'image') {
    const alt = normalizeString(node.alt)
    const url = normalizeString(node.url)
    if (alt && url)
      return `![${alt}](${url})`
    if (url)
      return `![](${url})`
    return alt
  }
  if (node.type === 'break')
    return '\n'

  return (node.children || []).map(child => collectPlainText(child)).join('')
}

function parseInlineNodes(nodes: MdastNode[] | undefined): WorkspaceChatMarkdownInlineNode[] {
  const result: WorkspaceChatMarkdownInlineNode[] = []

  for (const node of nodes || []) {
    if (!node)
      continue

    if (node.type === 'text') {
      pushInlineNode(result, {
        type: 'text',
        value: toText(node.value),
      })
      continue
    }

    if (node.type === 'break') {
      result.push({ type: 'break' })
      continue
    }

    if (node.type === 'inlineCode') {
      result.push({
        type: 'inline_code',
        value: toText(node.value),
      })
      continue
    }

    if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete') {
      const children = parseInlineNodes(node.children)
      if (children.length === 0) {
        const fallbackText = collectPlainText(node)
        if (fallbackText)
          pushInlineNode(result, { type: 'text', value: fallbackText })
        continue
      }

      result.push({
        type: node.type === 'strong'
          ? 'strong'
          : node.type === 'emphasis'
            ? 'emphasis'
            : 'delete',
        children,
      })
      continue
    }

    if (node.type === 'link') {
      const children = parseInlineNodes(node.children)
      const sanitized = sanitizeMarkdownLinkUrl(node.url)
      if (!sanitized) {
        const fallbackChildren = children.length > 0 ? children : [{ type: 'text', value: collectPlainText(node) }] satisfies WorkspaceChatMarkdownInlineNode[]
        for (const child of fallbackChildren)
          pushInlineNode(result, child)
        continue
      }

      result.push({
        type: 'link',
        url: sanitized.url,
        title: normalizeString(node.title),
        scheme: sanitized.scheme,
        children: children.length > 0
          ? children
          : [{ type: 'text', value: sanitized.url }],
      })
      continue
    }

    if (node.type === 'html' || node.type === 'image') {
      const fallbackText = collectPlainText(node)
      if (fallbackText)
        pushInlineNode(result, { type: 'text', value: fallbackText })
      continue
    }

    const fallbackText = collectPlainText(node)
    if (fallbackText)
      pushInlineNode(result, { type: 'text', value: fallbackText })
  }

  return result
}

function parseBlockNodes(nodes: MdastNode[] | undefined): WorkspaceChatMarkdownBlockNode[] {
  const result: WorkspaceChatMarkdownBlockNode[] = []

  for (const node of nodes || []) {
    if (!node)
      continue

    if (node.type === 'paragraph') {
      const children = parseInlineNodes(node.children)
      if (children.length > 0)
        result.push({ type: 'paragraph', children })
      continue
    }

    if (node.type === 'heading') {
      const children = parseInlineNodes(node.children)
      if (children.length > 0) {
        result.push({
          type: 'heading',
          depth: normalizeHeadingDepth(node.depth),
          children,
        })
      }
      continue
    }

    if (node.type === 'blockquote') {
      const children = parseBlockNodes(node.children)
      if (children.length > 0)
        result.push({ type: 'blockquote', children })
      continue
    }

    if (node.type === 'list') {
      const items = (node.children || [])
        .filter(child => child?.type === 'listItem')
        .map((item) => {
          const children = parseBlockNodes(item.children)
          return {
            checked: typeof item.checked === 'boolean' ? item.checked : null,
            children: children.length > 0
              ? children
              : (() => {
                  const fallbackText = collectPlainText(item)
                  if (!fallbackText)
                    return []
                  return [{
                    type: 'paragraph',
                    children: [{ type: 'text', value: fallbackText }],
                  }] satisfies WorkspaceChatMarkdownBlockNode[]
                })(),
          }
        })
        .filter(item => item.children.length > 0)

      if (items.length > 0) {
        result.push({
          type: 'list',
          ordered: Boolean(node.ordered),
          start: normalizeListStart(node.start),
          items,
        })
      }
      continue
    }

    if (node.type === 'code') {
      result.push({
        type: 'code',
        lang: normalizeString(node.lang),
        value: normalizeText(node.value),
      })
      continue
    }

    if (node.type === 'table') {
      const rows = (node.children || [])
        .filter(child => child?.type === 'tableRow')
        .map((row, index) => ({
          header: index === 0,
          cells: (row.children || [])
            .filter(cell => cell?.type === 'tableCell')
            .map((cell) => {
              const children = parseInlineNodes(cell.children)
              if (children.length > 0)
                return children
              const fallbackText = collectPlainText(cell)
              return fallbackText
                ? [{ type: 'text', value: fallbackText }] satisfies WorkspaceChatMarkdownInlineNode[]
                : []
            }),
        }))
        .filter(row => row.cells.length > 0)

      if (rows.length > 0) {
        result.push({
          type: 'table',
          align: normalizeTableAlign(node.align),
          rows,
        })
      }
      continue
    }

    if (node.type === 'thematicBreak') {
      result.push({ type: 'thematic_break' })
      continue
    }

    if (node.type === 'html') {
      const fallbackText = collectPlainText(node)
      if (fallbackText) {
        result.push({
          type: 'paragraph',
          children: [{ type: 'text', value: fallbackText }],
        })
      }
      continue
    }

    const fallbackText = collectPlainText(node)
    if (fallbackText) {
      result.push({
        type: 'paragraph',
        children: [{ type: 'text', value: fallbackText }],
      })
    }
  }

  return result
}

export function parseWorkspaceChatMarkdown(markdown: string): WorkspaceChatMarkdownParseResult {
  const fallbackText = normalizeText(markdown)

  try {
    const tree = fromMarkdown(fallbackText, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }) as MdastNode
    const nodes = parseBlockNodes(tree.children)

    return {
      ok: true,
      nodes,
      fallbackText,
    }
  }
  catch {
    return {
      ok: false,
      nodes: [],
      fallbackText,
    }
  }
}
