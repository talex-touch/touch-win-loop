function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function sanitizeUrl(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '#'

  if (/^(?:https?:|mailto:|tel:)/i.test(normalized))
    return normalized
  if (normalized.startsWith('/'))
    return normalized
  return '#'
}

function renderInline(text: string): string {
  const placeholders: string[] = []
  let html = escapeHtml(text)

  html = html.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const index = placeholders.push(`<code>${escapeHtml(code)}</code>`) - 1
    return `@@INLINE_CODE_${index}@@`
  })

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const href = escapeAttribute(sanitizeUrl(url))
    return `<a href="${href}" target="_blank" rel="noreferrer noopener">${renderInline(label)}</a>`
  })

  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>')

  return html.replace(/@@INLINE_CODE_(\d+)@@/g, (_, indexText: string) => {
    return placeholders[Number(indexText)] || ''
  })
}

function extractListLineContent(line: string, ordered: boolean): string | null {
  const pattern = ordered
    ? /^\s*\d+\.\s+/
    : /^\s*[-*+]\s+/
  const prefix = line.match(pattern)?.[0] || ''
  if (!prefix)
    return null
  return line.slice(prefix.length)
}

function isListLine(line: string): boolean {
  return extractListLineContent(line, true) !== null || extractListLineContent(line, false) !== null
}

function consumeList(lines: string[], startIndex: number): { html: string, nextIndex: number } {
  const firstLine = lines[startIndex] || ''
  const ordered = extractListLineContent(firstLine, true) !== null
  const items: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const currentLine = lines[index] || ''
    const content = extractListLineContent(currentLine, ordered)
    if (content === null)
      break
    items.push(`<li>${renderInline(content)}</li>`)
    index += 1
  }

  const tag = ordered ? 'ol' : 'ul'
  return {
    html: `<${tag}>${items.join('')}</${tag}>`,
    nextIndex: index,
  }
}

function consumeBlockquote(lines: string[], startIndex: number): { html: string, nextIndex: number } {
  const rows: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const currentLine = lines[index] || ''
    if (!/^\s*>\s?/.test(currentLine))
      break
    rows.push(currentLine.replace(/^\s*>\s?/, ''))
    index += 1
  }

  return {
    html: `<blockquote>${rows.map(item => renderInline(item)).join('<br>')}</blockquote>`,
    nextIndex: index,
  }
}

function consumeCodeFence(lines: string[], startIndex: number): { html: string, nextIndex: number } {
  const opener = lines[startIndex] || ''
  const language = opener.replace(/^\s*```/, '').trim()
  const codeLines: string[] = []
  let index = startIndex + 1

  while (index < lines.length) {
    const currentLine = lines[index] || ''
    if (/^\s*```/.test(currentLine)) {
      index += 1
      break
    }
    codeLines.push(currentLine)
    index += 1
  }

  const languageAttr = language
    ? ` data-language="${escapeAttribute(language)}"`
    : ''

  return {
    html: `<pre${languageAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    nextIndex: index,
  }
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const blocks: string[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length === 0)
      return
    blocks.push(`<p>${paragraphLines.map(item => renderInline(item)).join('<br>')}</p>`)
    paragraphLines = []
  }

  let index = 0
  while (index < lines.length) {
    const line = lines[index] || ''
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      index += 1
      continue
    }

    if (/^\s*```/.test(line)) {
      flushParagraph()
      const block = consumeCodeFence(lines, index)
      blocks.push(block.html)
      index = block.nextIndex
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph()
      const block = consumeBlockquote(lines, index)
      blocks.push(block.html)
      index = block.nextIndex
      continue
    }

    if (isListLine(line)) {
      flushParagraph()
      const block = consumeList(lines, index)
      blocks.push(block.html)
      index = block.nextIndex
      continue
    }

    const headingPrefix = trimmed.match(/^(#{1,6})\s+/)?.[0] || ''
    if (headingPrefix) {
      flushParagraph()
      const level = Math.min(6, headingPrefix.trim().length)
      const content = trimmed.slice(headingPrefix.length)
      blocks.push(`<h${level}>${renderInline(content)}</h${level}>`)
      index += 1
      continue
    }

    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
      flushParagraph()
      blocks.push('<hr>')
      index += 1
      continue
    }

    paragraphLines.push(trimmed)
    index += 1
  }

  flushParagraph()
  if (blocks.length === 0)
    return '<p>开始输入 Markdown 内容，右侧会实时渲染。</p>'

  return blocks.join('\n')
}
