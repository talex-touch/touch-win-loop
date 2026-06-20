import type { JSONContent } from '@tiptap/core'
import type * as Y from 'yjs'
import type { CollabMarkdownHeadingLevel } from './collab-rich-text-schema'
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProsemirrorJSON,
} from '@tiptap/y-tiptap'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfm } from 'micromark-extension-gfm'
import { getCollabMarkdownSchema } from './collab-rich-text-schema'

export interface MarkdownRichTextBlock {
  type: 'paragraph' | 'heading'
  level?: CollabMarkdownHeadingLevel
  text: string
}

export interface MarkdownRichTextImageReference {
  resourceId: string | null
  src: string
  alt: string | null
  title: string | null
}

type MarkdownMarkType = 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'link'

interface MarkdownMark {
  type: MarkdownMarkType
  attrs?: Record<string, unknown>
}

interface MdastNode {
  type: string
  [key: string]: any
}

const collabMarkdownSchema = getCollabMarkdownSchema()
const INTERNAL_RESOURCE_FILE_PATH_PATTERN = /^\/?(?:api\/)?projects\/[^/]+\/resources\/([^/]+)\/(?:file|source)(?:[/?#]|$)/i
const HTML_IMAGE_TAG_PATTERN = /^<img\b[^>]*>$/i
const HTML_ATTRIBUTE_PATTERN = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function normalizeLineBreaks(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized || null
}

function normalizeBlockText(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeadingLevel(value: unknown): CollabMarkdownHeadingLevel {
  const parsed = Number(value)
  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 || parsed === 5 || parsed === 6)
    return parsed
  return 1
}

function normalizeImageWidth(value: unknown): number | null {
  const normalized = normalizeString(value)
  if (!normalized)
    return null

  const matched = normalized.match(/^\s*(\d+)/)
  if (!matched)
    return null

  const parsed = Math.round(Number(matched[1]))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function resolveResourceIdFromImageSrc(src: unknown): string | null {
  const normalized = normalizeString(src)
  if (!normalized)
    return null

  const matched = normalized.match(INTERNAL_RESOURCE_FILE_PATH_PATTERN)
  const resourceId = normalizeString(matched?.[1])
  return resourceId || null
}

function decodeHtmlAttribute(value: string): string {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function encodeHtmlAttribute(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function parseHtmlImageAttributes(value: unknown): {
  src: string
  alt: string | null
  title: string | null
  width: number | null
  resourceId: string | null
} | null {
  const html = String(value || '').trim()
  if (!HTML_IMAGE_TAG_PATTERN.test(html))
    return null

  const attributes = new Map<string, string>()
  for (const matched of html.matchAll(HTML_ATTRIBUTE_PATTERN)) {
    const name = normalizeString(matched[1]).toLowerCase()
    if (!name)
      continue
    const rawValue = matched[2] ?? matched[3] ?? matched[4] ?? ''
    attributes.set(name, decodeHtmlAttribute(String(rawValue || '')))
  }

  const src = normalizeString(attributes.get('src'))
  if (!src)
    return null

  const resourceId = normalizeOptionalString(attributes.get('data-resource-id'))
    || resolveResourceIdFromImageSrc(src)

  return {
    src,
    alt: normalizeOptionalString(attributes.get('alt')),
    title: normalizeOptionalString(attributes.get('title')),
    width: normalizeImageWidth(attributes.get('width')),
    resourceId,
  }
}

function serializeMarkdownImageSyntax(node: MdastNode): string {
  const alt = String(node.alt || '').replace(/\]/g, '\\]')
  const src = normalizeString(node.url)
  const title = normalizeString(node.title)
  if (!src)
    return alt
  if (title)
    return `![${alt}](${src} "${title.replace(/"/g, '\\"')}")`
  return `![${alt}](${src})`
}

function serializeHtmlImageSyntax(node: JSONContent): string {
  const src = normalizeString(node.attrs?.src)
  if (!src)
    return ''

  const attributes = [`src="${encodeHtmlAttribute(src)}"`]
  const alt = normalizeOptionalString(node.attrs?.alt)
  const title = normalizeOptionalString(node.attrs?.title)
  const width = normalizeImageWidth(node.attrs?.width)
  const resourceId = normalizeOptionalString(node.attrs?.resourceId)

  if (alt)
    attributes.push(`alt="${encodeHtmlAttribute(alt)}"`)
  if (title)
    attributes.push(`title="${encodeHtmlAttribute(title)}"`)
  if (width)
    attributes.push(`width="${width}"`)
  if (resourceId)
    attributes.push(`data-resource-id="${encodeHtmlAttribute(resourceId)}"`)

  return `<img ${attributes.join(' ')}>`
}

function createEmptyDocument(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
      },
    ],
  }
}

function cloneMarks(marks: MarkdownMark[]): MarkdownMark[] {
  return marks.map((mark) => {
    return {
      type: mark.type,
      attrs: mark.attrs ? { ...mark.attrs } : undefined,
    }
  })
}

function removeLastMark(marks: MarkdownMark[], type: MarkdownMarkType): MarkdownMark[] {
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    if (marks[index]?.type !== type)
      continue
    return [...marks.slice(0, index), ...marks.slice(index + 1)]
  }
  return marks
}

function marksEqual(left: MarkdownMark[] | undefined, right: MarkdownMark[] | undefined): boolean {
  const normalizedLeft = left || []
  const normalizedRight = right || []
  if (normalizedLeft.length !== normalizedRight.length)
    return false

  return normalizedLeft.every((mark, index) => {
    const other = normalizedRight[index]
    if (!other || mark.type !== other.type)
      return false
    return JSON.stringify(mark.attrs || {}) === JSON.stringify(other.attrs || {})
  })
}

function appendTextNode(result: JSONContent[], text: string, marks: MarkdownMark[]): void {
  const normalizedText = String(text || '')
  if (!normalizedText)
    return

  const nextMarks = cloneMarks(marks)
  const last = result[result.length - 1]
  if (last?.type === 'text' && marksEqual(last.marks as MarkdownMark[] | undefined, nextMarks))
    last.text = `${String(last.text || '')}${normalizedText}`
  else
    result.push(nextMarks.length > 0 ? { type: 'text', text: normalizedText, marks: nextMarks } : { type: 'text', text: normalizedText })
}

function plainTextFromMdast(node: MdastNode | null | undefined): string {
  if (!node)
    return ''

  if (typeof node.value === 'string')
    return node.value

  if (Array.isArray(node.children))
    return node.children.map((child: MdastNode) => plainTextFromMdast(child)).join('')

  return ''
}

function plainTextFromPmNode(node: JSONContent | null | undefined): string {
  if (!node)
    return ''

  if (typeof node.text === 'string')
    return node.text

  if (!Array.isArray(node.content))
    return ''

  return node.content.map(child => plainTextFromPmNode(child)).join('')
}

function collectPmImageReference(node: JSONContent | null | undefined): MarkdownRichTextImageReference | null {
  if (!node || node.type !== 'image')
    return null

  const src = normalizeString(node.attrs?.src)
  if (!src)
    return null

  return {
    resourceId: normalizeOptionalString(node.attrs?.resourceId) || resolveResourceIdFromImageSrc(src),
    src,
    alt: normalizeOptionalString(node.attrs?.alt),
    title: normalizeOptionalString(node.attrs?.title),
  }
}

function visitPmNode(node: JSONContent | null | undefined, visit: (value: JSONContent) => void): void {
  if (!node || typeof node !== 'object')
    return

  visit(node)
  if (!Array.isArray(node.content))
    return

  for (const child of node.content)
    visitPmNode(child, visit)
}

function normalizeDocumentContent(content: JSONContent[] | undefined): JSONContent[] {
  const normalized = Array.isArray(content)
    ? content.filter(item => Boolean(item && typeof item === 'object'))
    : []
  return normalized.length > 0 ? normalized : [{ type: 'paragraph' }]
}

function normalizeDocument(doc: JSONContent | null | undefined): JSONContent {
  if (!doc || doc.type !== 'doc')
    return createEmptyDocument()

  return {
    type: 'doc',
    content: normalizeDocumentContent(doc.content),
  }
}

function mdastInlineToPm(nodes: MdastNode[] | undefined, marks: MarkdownMark[] = []): JSONContent[] {
  if (!Array.isArray(nodes) || nodes.length === 0)
    return []

  const result: JSONContent[] = []
  let activeMarks = cloneMarks(marks)

  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue

    if (node.type === 'html') {
      const htmlTag = normalizeString(node.value).toLowerCase()
      if (htmlTag === '<u>') {
        activeMarks = [...activeMarks, { type: 'underline' }]
        continue
      }
      if (htmlTag === '</u>') {
        activeMarks = removeLastMark(activeMarks, 'underline')
        continue
      }
      appendTextNode(result, String(node.value || ''), activeMarks)
      continue
    }

    if (node.type === 'text') {
      appendTextNode(result, String(node.value || ''), activeMarks)
      continue
    }

    if (node.type === 'inlineCode') {
      appendTextNode(result, String(node.value || ''), [...activeMarks, { type: 'code' }])
      continue
    }

    if (node.type === 'image') {
      appendTextNode(result, serializeMarkdownImageSyntax(node), activeMarks)
      continue
    }

    if (node.type === 'break') {
      result.push({ type: 'hardBreak' })
      continue
    }

    if (node.type === 'strong') {
      result.push(...mdastInlineToPm(node.children, [...activeMarks, { type: 'bold' }]))
      continue
    }

    if (node.type === 'emphasis') {
      result.push(...mdastInlineToPm(node.children, [...activeMarks, { type: 'italic' }]))
      continue
    }

    if (node.type === 'delete') {
      result.push(...mdastInlineToPm(node.children, [...activeMarks, { type: 'strike' }]))
      continue
    }

    if (node.type === 'link') {
      const href = normalizeString(node.url)
      if (!href) {
        result.push(...mdastInlineToPm(node.children, activeMarks))
        continue
      }
      result.push(...mdastInlineToPm(node.children, [
        ...activeMarks,
        {
          type: 'link',
          attrs: {
            href,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        },
      ]))
      continue
    }

    if (Array.isArray(node.children)) {
      result.push(...mdastInlineToPm(node.children, activeMarks))
      continue
    }

    appendTextNode(result, plainTextFromMdast(node), activeMarks)
  }

  return result
}

function mdastListItemToPm(node: MdastNode, listType: 'bulletList' | 'orderedList' | 'taskList'): JSONContent {
  const content = normalizeDocumentContent(mdastBlocksToPm(node.children))
  if (listType === 'taskList') {
    return {
      type: 'taskItem',
      attrs: {
        checked: typeof node.checked === 'boolean' ? node.checked : false,
      },
      content,
    }
  }

  return {
    type: 'listItem',
    content,
  }
}

function mdastTableCellToPm(node: MdastNode, isHeader: boolean): JSONContent {
  const inlineContent = mdastInlineToPm(node.children)
  return {
    type: isHeader ? 'tableHeader' : 'tableCell',
    content: [
      inlineContent.length > 0
        ? { type: 'paragraph', content: inlineContent }
        : { type: 'paragraph' },
    ],
  }
}

function mdastImageToPm(node: MdastNode): JSONContent | null {
  const src = normalizeString(node.url)
  if (!src)
    return null

  return {
    type: 'image',
    attrs: {
      src,
      alt: normalizeOptionalString(node.alt),
      title: normalizeOptionalString(node.title),
      resourceId: resolveResourceIdFromImageSrc(src),
      width: null,
      uploadStatus: null,
      uploadId: null,
    },
  }
}

function paragraphContainsSingleImage(node: MdastNode): boolean {
  if (node?.type !== 'paragraph' || !Array.isArray(node.children))
    return false

  const meaningfulChildren = node.children.filter((child: MdastNode) => {
    if (!child || typeof child !== 'object')
      return false
    if (child.type !== 'text')
      return true
    return Boolean(normalizeString(child.value))
  })

  return meaningfulChildren.length === 1 && meaningfulChildren[0]?.type === 'image'
}

function mdastBlocksToPm(nodes: MdastNode[] | undefined): JSONContent[] {
  if (!Array.isArray(nodes) || nodes.length === 0)
    return []

  const result: JSONContent[] = []

  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue

    if (node.type === 'paragraph') {
      if (paragraphContainsSingleImage(node)) {
        const imageNode = mdastImageToPm(node.children?.find((child: MdastNode) => child?.type === 'image'))
        if (imageNode)
          result.push(imageNode)
        continue
      }

      const content = mdastInlineToPm(node.children)
      result.push(content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' })
      continue
    }

    if (node.type === 'heading') {
      const depth = Number(node.depth)
      if (depth >= 1 && depth <= 6) {
        const content = mdastInlineToPm(node.children)
        result.push(content.length > 0
          ? { type: 'heading', attrs: { level: depth }, content }
          : { type: 'heading', attrs: { level: depth } })
      }
      else {
        const fallbackText = `${'#'.repeat(Math.max(1, depth || 1))} ${normalizeBlockText(plainTextFromMdast(node))}`.trim()
        result.push(fallbackText ? { type: 'paragraph', content: [{ type: 'text', text: fallbackText }] } : { type: 'paragraph' })
      }
      continue
    }

    if (node.type === 'html') {
      const imageAttrs = parseHtmlImageAttributes(node.value)
      if (imageAttrs) {
        result.push({
          type: 'image',
          attrs: {
            ...imageAttrs,
            uploadStatus: null,
            uploadId: null,
          },
        })
        continue
      }
    }

    if (node.type === 'blockquote') {
      result.push({
        type: 'blockquote',
        content: normalizeDocumentContent(mdastBlocksToPm(node.children)),
      })
      continue
    }

    if (node.type === 'list') {
      const items = Array.isArray(node.children) ? node.children.filter((item: MdastNode) => item?.type === 'listItem') : []
      const isTaskList = items.length > 0 && items.every((item: MdastNode) => typeof item.checked === 'boolean')
      const listType = isTaskList ? 'taskList' : (node.ordered ? 'orderedList' : 'bulletList')
      const children = items.map((item: MdastNode) => mdastListItemToPm(item, listType))
      result.push(listType === 'orderedList'
        ? {
            type: 'orderedList',
            attrs: {
              start: Number.isFinite(Number(node.start)) && Number(node.start) > 0 ? Math.trunc(Number(node.start)) : 1,
            },
            content: children,
          }
        : {
            type: listType,
            content: children,
          })
      continue
    }

    if (node.type === 'code') {
      const text = normalizeLineBreaks(String(node.value || ''))
      result.push(text
        ? {
            type: 'codeBlock',
            attrs: {
              language: normalizeString(node.lang) || null,
            },
            content: [{ type: 'text', text }],
          }
        : {
            type: 'codeBlock',
            attrs: {
              language: normalizeString(node.lang) || null,
            },
          })
      continue
    }

    if (node.type === 'thematicBreak') {
      result.push({ type: 'horizontalRule' })
      continue
    }

    if (node.type === 'table') {
      const rows = Array.isArray(node.children) ? node.children.filter((child: MdastNode) => child?.type === 'tableRow') : []
      const content = rows.map((row: MdastNode, rowIndex: number) => {
        const cells = Array.isArray(row.children) ? row.children.filter((child: MdastNode) => child?.type === 'tableCell') : []
        return {
          type: 'tableRow',
          content: cells.map((cell: MdastNode) => mdastTableCellToPm(cell, rowIndex === 0)),
        } satisfies JSONContent
      })
      result.push({
        type: 'table',
        content,
      })
      continue
    }

    if (node.type === 'image') {
      const imageNode = mdastImageToPm(node)
      if (imageNode)
        result.push(imageNode)
      continue
    }

    const fallbackText = normalizeBlockText(plainTextFromMdast(node))
    result.push(fallbackText ? { type: 'paragraph', content: [{ type: 'text', text: fallbackText }] } : { type: 'paragraph' })
  }

  return result
}

function marksOrder(mark: { type?: string }): number {
  if (mark.type === 'link')
    return 1
  if (mark.type === 'bold')
    return 2
  if (mark.type === 'italic')
    return 3
  if (mark.type === 'strike')
    return 4
  if (mark.type === 'underline')
    return 5
  if (mark.type === 'code')
    return 6
  return 99
}

function pmTextToMdast(node: JSONContent): MdastNode[] {
  const text = String(node.text || '')
  if (!text)
    return []

  const marks = Array.isArray(node.marks)
    ? [...node.marks].sort((left, right) => marksOrder(left) - marksOrder(right))
    : []

  const codeMark = marks.find(mark => mark.type === 'code')
  if (codeMark)
    return [{ type: 'inlineCode', value: text }]

  let nodes: MdastNode[] = [{ type: 'text', value: text }]
  for (const mark of marks) {
    if (mark.type === 'bold') {
      nodes = [{ type: 'strong', children: nodes }]
      continue
    }
    if (mark.type === 'italic') {
      nodes = [{ type: 'emphasis', children: nodes }]
      continue
    }
    if (mark.type === 'strike') {
      nodes = [{ type: 'delete', children: nodes }]
      continue
    }
    if (mark.type === 'link') {
      nodes = [{
        type: 'link',
        url: normalizeString(mark.attrs?.href),
        title: null,
        children: nodes,
      }]
      continue
    }
    if (mark.type === 'underline')
      nodes = [{ type: 'html', value: '<u>' }, ...nodes, { type: 'html', value: '</u>' }]
  }

  return nodes
}

function pmInlineToMdast(nodes: JSONContent[] | undefined): MdastNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0)
    return []

  const result: MdastNode[] = []
  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue

    if (node.type === 'text') {
      result.push(...pmTextToMdast(node))
      continue
    }

    if (node.type === 'hardBreak') {
      result.push({ type: 'break' })
      continue
    }

    if (Array.isArray(node.content))
      result.push(...pmInlineToMdast(node.content))
  }

  return result
}

function pmBlocksToMdast(nodes: JSONContent[] | undefined): MdastNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0)
    return []

  const result: MdastNode[] = []

  for (const node of nodes) {
    if (!node || typeof node !== 'object')
      continue

    if (node.type === 'paragraph') {
      result.push({
        type: 'paragraph',
        children: pmInlineToMdast(node.content),
      })
      continue
    }

    if (node.type === 'heading') {
      result.push({
        type: 'heading',
        depth: normalizeHeadingLevel(node.attrs?.level),
        children: pmInlineToMdast(node.content),
      })
      continue
    }

    if (node.type === 'blockquote') {
      result.push({
        type: 'blockquote',
        children: pmBlocksToMdast(node.content),
      })
      continue
    }

    if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList') {
      const ordered = node.type === 'orderedList'
      result.push({
        type: 'list',
        ordered,
        spread: false,
        start: ordered && Number.isFinite(Number(node.attrs?.start)) ? Math.trunc(Number(node.attrs?.start)) : undefined,
        children: Array.isArray(node.content)
          ? node.content.map((item) => {
              return {
                type: 'listItem',
                spread: false,
                checked: node.type === 'taskList' && typeof item.attrs?.checked === 'boolean' ? item.attrs.checked : undefined,
                children: pmBlocksToMdast(item.content),
              }
            })
          : [],
      })
      continue
    }

    if (node.type === 'codeBlock') {
      result.push({
        type: 'code',
        lang: normalizeString(node.attrs?.language) || null,
        meta: null,
        value: plainTextFromPmNode(node),
      })
      continue
    }

    if (node.type === 'horizontalRule') {
      result.push({ type: 'thematicBreak' })
      continue
    }

    if (node.type === 'table') {
      const rows = Array.isArray(node.content) ? node.content : []
      const columnCount = rows[0]?.content?.length || 0
      result.push({
        type: 'table',
        align: Array.from({ length: columnCount }, () => null),
        children: rows.map((row) => {
          return {
            type: 'tableRow',
            children: Array.isArray(row.content)
              ? row.content.map((cell) => {
                  const cellBlocks = Array.isArray(cell.content) ? cell.content : []
                  const firstParagraph = cellBlocks.find(block => block.type === 'paragraph') || cellBlocks[0] || null
                  return {
                    type: 'tableCell',
                    children: firstParagraph?.type === 'paragraph'
                      ? pmInlineToMdast(firstParagraph.content)
                      : [{ type: 'text', value: normalizeBlockText(plainTextFromPmNode(firstParagraph)) }],
                  }
                })
              : [],
          }
        }),
      })
      continue
    }

    if (node.type === 'image') {
      const src = normalizeString(node.attrs?.src)
      if (!src)
        continue

      if (normalizeImageWidth(node.attrs?.width)) {
        result.push({
          type: 'html',
          value: serializeHtmlImageSyntax(node),
        })
        continue
      }

      result.push({
        type: 'paragraph',
        children: [
          {
            type: 'image',
            url: src,
            alt: normalizeOptionalString(node.attrs?.alt) || '',
            title: normalizeOptionalString(node.attrs?.title),
          },
        ],
      })
      continue
    }

    const fallbackText = normalizeBlockText(plainTextFromPmNode(node))
    result.push({
      type: 'paragraph',
      children: fallbackText ? [{ type: 'text', value: fallbackText }] : [],
    })
  }

  return result
}

function richTextDocumentToBlocks(documentNode: JSONContent): MarkdownRichTextBlock[] {
  const doc = normalizeDocument(documentNode)
  return normalizeDocumentContent(doc.content).map((node) => {
    if (node.type === 'heading') {
      return {
        type: 'heading',
        level: normalizeHeadingLevel(node.attrs?.level),
        text: normalizeBlockText(plainTextFromPmNode(node)),
      }
    }

    return {
      type: 'paragraph',
      text: normalizeBlockText(plainTextFromPmNode(node)),
    }
  })
}

function blocksToDocument(blocks: MarkdownRichTextBlock[]): JSONContent {
  const content = blocks.map((block) => {
    if (block.type === 'heading') {
      const text = normalizeString(block.text)
      return text
        ? { type: 'heading', attrs: { level: normalizeHeadingLevel(block.level) }, content: [{ type: 'text', text }] }
        : { type: 'heading', attrs: { level: normalizeHeadingLevel(block.level) } }
    }

    const text = normalizeString(block.text)
    return text
      ? { type: 'paragraph', content: [{ type: 'text', text }] }
      : { type: 'paragraph' }
  })

  return normalizeDocument({
    type: 'doc',
    content,
  })
}

export function parseMarkdownToRichTextDocument(markdown: string): JSONContent {
  const tree = fromMarkdown(normalizeLineBreaks(markdown), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MdastNode

  return normalizeDocument({
    type: 'doc',
    content: mdastBlocksToPm(Array.isArray(tree.children) ? tree.children : []),
  })
}

export function serializeRichTextDocumentToMarkdown(documentNode: JSONContent): string {
  const normalized = normalizeDocument(documentNode)
  const markdown = toMarkdown({
    type: 'root',
    children: pmBlocksToMdast(normalized.content),
  } as any, {
    extensions: [gfmToMarkdown()],
  })

  return normalizeLineBreaks(markdown).trim()
}

export function parseMarkdownToRichTextBlocks(markdown: string): MarkdownRichTextBlock[] {
  return richTextDocumentToBlocks(parseMarkdownToRichTextDocument(markdown))
}

export function serializeRichTextBlocksToMarkdown(blocks: MarkdownRichTextBlock[]): string {
  return serializeRichTextDocumentToMarkdown(blocksToDocument(blocks))
}

function isMeaningfulTopLevelBlock(block: JSONContent | null | undefined): boolean {
  if (!block || typeof block !== 'object')
    return false

  if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'blockquote' || block.type === 'codeBlock')
    return Boolean(normalizeBlockText(plainTextFromPmNode(block)))

  if (block.type === 'horizontalRule' || block.type === 'image' || block.type === 'table')
    return true

  if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList')
    return Boolean(normalizeBlockText(plainTextFromPmNode(block)))

  return Boolean(normalizeBlockText(plainTextFromPmNode(block)))
}

export function extractPrimaryHeadingFromRichTextDocument(documentNode: JSONContent | null | undefined): string {
  const normalized = normalizeDocument(documentNode)
  for (const block of normalized.content || []) {
    if (!isMeaningfulTopLevelBlock(block))
      continue

    if (block?.type !== 'heading')
      return ''

    const level = normalizeHeadingLevel(block.attrs?.level)
    if (level !== 1)
      return ''

    const text = normalizeBlockText(plainTextFromPmNode(block))
    return text || ''
  }

  return ''
}

export function collectImageReferencesFromRichTextDocument(documentNode: JSONContent | null | undefined): MarkdownRichTextImageReference[] {
  const normalized = normalizeDocument(documentNode)
  const result: MarkdownRichTextImageReference[] = []
  visitPmNode(normalized, (node) => {
    const reference = collectPmImageReference(node)
    if (reference)
      result.push(reference)
  })
  return result
}

export function readRichTextDocumentFromFragment(fragment: Y.XmlFragment): JSONContent {
  if (fragment.length === 0)
    return createEmptyDocument()

  return normalizeDocument(yXmlFragmentToProsemirrorJSON(fragment) as JSONContent)
}

export function readRichTextBlocksFromFragment(fragment: Y.XmlFragment): MarkdownRichTextBlock[] {
  return richTextDocumentToBlocks(readRichTextDocumentFromFragment(fragment))
}

export function extractPrimaryHeadingFromFragment(fragment: Y.XmlFragment): string {
  return extractPrimaryHeadingFromRichTextDocument(readRichTextDocumentFromFragment(fragment))
}

export function collectImageReferencesFromFragment(fragment: Y.XmlFragment): MarkdownRichTextImageReference[] {
  return collectImageReferencesFromRichTextDocument(readRichTextDocumentFromFragment(fragment))
}

export function writeRichTextDocumentToFragment(fragment: Y.XmlFragment, documentNode: JSONContent): void {
  if (fragment.length > 0)
    fragment.delete(0, fragment.length)
  prosemirrorJSONToYXmlFragment(collabMarkdownSchema, normalizeDocument(documentNode), fragment)
}

export function writeRichTextBlocksToFragment(fragment: Y.XmlFragment, blocks: MarkdownRichTextBlock[]): void {
  writeRichTextDocumentToFragment(fragment, blocksToDocument(blocks))
}

export function readMarkdownFromRichText(doc: Y.Doc): string {
  return serializeRichTextDocumentToMarkdown(readRichTextDocumentFromFragment(doc.getXmlFragment('prosemirror')))
}

export function extractPrimaryHeadingFromMarkdown(markdown: string): string {
  return extractPrimaryHeadingFromRichTextDocument(parseMarkdownToRichTextDocument(markdown))
}

export function collectImageReferencesFromMarkdown(markdown: string): MarkdownRichTextImageReference[] {
  return collectImageReferencesFromRichTextDocument(parseMarkdownToRichTextDocument(markdown))
}

export function extractPrimaryHeadingFromCollabDoc(doc: Y.Doc): string {
  return extractPrimaryHeadingFromFragment(doc.getXmlFragment('prosemirror'))
}

export function collectImageReferencesFromCollabDoc(doc: Y.Doc): MarkdownRichTextImageReference[] {
  return collectImageReferencesFromFragment(doc.getXmlFragment('prosemirror'))
}

export function isRichTextFragmentSemanticallyEmpty(fragment: Y.XmlFragment): boolean {
  if (fragment.length === 0)
    return true
  return !readMarkdownFromRichText(fragment.doc as Y.Doc)
}

export function syncMarkdownMirrorFromRichText(doc: Y.Doc): { changed: boolean, markdown: string } {
  const markdown = readMarkdownFromRichText(doc)
  const text = doc.getText('content')
  if (text.toString() === markdown)
    return { changed: false, markdown }

  text.delete(0, text.length)
  if (markdown)
    text.insert(0, markdown)
  return { changed: true, markdown }
}

export function ensureMarkdownCollabDocShape(doc: Y.Doc): {
  migrated: boolean
  mirrorChanged: boolean
  markdown: string
} {
  const text = doc.getText('content')
  const fragment = doc.getXmlFragment('prosemirror')
  const markdownMirror = normalizeLineBreaks(text.toString()).trim()
  let migrated = false

  if (isRichTextFragmentSemanticallyEmpty(fragment)) {
    writeRichTextDocumentToFragment(fragment, parseMarkdownToRichTextDocument(markdownMirror))
    migrated = Boolean(markdownMirror) || fragment.length === 0
  }

  const mirrorResult = syncMarkdownMirrorFromRichText(doc)
  return {
    migrated,
    mirrorChanged: mirrorResult.changed,
    markdown: mirrorResult.markdown,
  }
}
