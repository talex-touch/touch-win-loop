import * as Y from 'yjs'

export interface MarkdownRichTextBlock {
  type: 'paragraph' | 'heading'
  level?: 1 | 2 | 3
  text: string
}

function normalizeLineBreaks(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function normalizeBlockText(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEmptyParagraphBlock(block: MarkdownRichTextBlock | undefined): boolean {
  return Boolean(block && block.type === 'paragraph' && !normalizeBlockText(block.text))
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 {
  const parsed = Number(value)
  if (parsed === 1 || parsed === 2 || parsed === 3)
    return parsed
  return 1
}

function createParagraphNode(text: string): Y.XmlElement {
  const element = new Y.XmlElement('paragraph')
  const normalizedText = String(text || '')
  if (normalizedText) {
    const textNode = new Y.XmlText()
    textNode.insert(0, normalizedText)
    element.insert(0, [textNode])
  }
  return element
}

function createHeadingNode(level: 1 | 2 | 3, text: string): Y.XmlElement {
  const element = new Y.XmlElement('heading')
  element.setAttribute('level', String(level))
  const normalizedText = String(text || '')
  if (normalizedText) {
    const textNode = new Y.XmlText()
    textNode.insert(0, normalizedText)
    element.insert(0, [textNode])
  }
  return element
}

function readNodeText(node: unknown): string {
  if (node instanceof Y.XmlText)
    return node.toString()

  if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    return node
      .toArray()
      .map(child => readNodeText(child))
      .join('')
  }

  if (typeof node === 'string')
    return node

  return ''
}

export function parseMarkdownToRichTextBlocks(markdown: string): MarkdownRichTextBlock[] {
  const lines = normalizeLineBreaks(markdown).split('\n')
  const blocks: MarkdownRichTextBlock[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0)
      return

    blocks.push({
      type: 'paragraph',
      text: normalizeBlockText(paragraphLines.join(' ')),
    })
    paragraphLines = []
  }

  for (const rawLine of lines) {
    const trimmed = String(rawLine || '').trim()
    if (!trimmed) {
      flushParagraph()
      continue
    }

    const headingPrefixMatch = trimmed.match(/^(#{1,3})\s/)
    const headingPrefix = headingPrefixMatch?.[1] || ''
    const headingText = headingPrefix
      ? normalizeBlockText(trimmed.slice(headingPrefix.length).trim())
      : ''
    if (headingPrefix && headingText) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: normalizeHeadingLevel(headingPrefix.length),
        text: headingText,
      })
      continue
    }

    paragraphLines.push(trimmed)
  }

  flushParagraph()
  return blocks
}

export function serializeRichTextBlocksToMarkdown(blocks: MarkdownRichTextBlock[]): string {
  const normalizedBlocks = [...blocks]

  while (isEmptyParagraphBlock(normalizedBlocks[0]))
    normalizedBlocks.shift()

  while (isEmptyParagraphBlock(normalizedBlocks[normalizedBlocks.length - 1]))
    normalizedBlocks.pop()

  return normalizedBlocks
    .map((block) => {
      const text = normalizeBlockText(block.text)
      if (block.type === 'heading')
        return `${'#'.repeat(normalizeHeadingLevel(block.level))} ${text}`.trimEnd()
      return text
    })
    .join('\n\n')
    .trim()
}

export function readRichTextBlocksFromFragment(fragment: Y.XmlFragment): MarkdownRichTextBlock[] {
  const blocks: MarkdownRichTextBlock[] = []

  for (const child of fragment.toArray()) {
    if (child instanceof Y.XmlText) {
      const text = normalizeBlockText(child.toString())
      if (text)
        blocks.push({ type: 'paragraph', text })
      continue
    }

    if (!(child instanceof Y.XmlElement))
      continue

    const nodeName = String(child.nodeName || '').trim().toLowerCase()
    const text = readNodeText(child)

    if (nodeName === 'heading') {
      blocks.push({
        type: 'heading',
        level: normalizeHeadingLevel(child.getAttribute('level')),
        text,
      })
      continue
    }

    blocks.push({
      type: 'paragraph',
      text,
    })
  }

  return blocks
}

export function writeRichTextBlocksToFragment(fragment: Y.XmlFragment, blocks: MarkdownRichTextBlock[]): void {
  if (fragment.length > 0)
    fragment.delete(0, fragment.length)

  const normalizedBlocks = blocks.length > 0
    ? blocks
    : [{ type: 'paragraph', text: '' } satisfies MarkdownRichTextBlock]

  const nodes = normalizedBlocks.map((block) => {
    if (block.type === 'heading')
      return createHeadingNode(normalizeHeadingLevel(block.level), String(block.text || ''))
    return createParagraphNode(String(block.text || ''))
  })

  fragment.insert(0, nodes)
}

export function readMarkdownFromRichText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('prosemirror')
  return serializeRichTextBlocksToMarkdown(readRichTextBlocksFromFragment(fragment))
}

export function isRichTextFragmentSemanticallyEmpty(fragment: Y.XmlFragment): boolean {
  if (fragment.length === 0)
    return true

  const blocks = readRichTextBlocksFromFragment(fragment)
  if (blocks.length === 0)
    return true

  return blocks.every(block => block.type === 'paragraph' && !normalizeBlockText(block.text))
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
    const blocks = markdownMirror
      ? parseMarkdownToRichTextBlocks(markdownMirror)
      : []
    writeRichTextBlocksToFragment(fragment, blocks)
    migrated = Boolean(markdownMirror) || fragment.length === 0
  }

  const mirrorResult = syncMarkdownMirrorFromRichText(doc)
  return {
    migrated,
    mirrorChanged: mirrorResult.changed,
    markdown: mirrorResult.markdown,
  }
}
