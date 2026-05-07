import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_CHAT_MARKDOWN_UTIL_FILE = resolve(process.cwd(), 'shared/utils/workspace-chat-markdown.ts')

it('工作区聊天 Markdown 解析支持标题、列表、任务列表、代码块、表格与链接', async () => {
  const { parseWorkspaceChatMarkdown } = await import(pathToFileURL(WORKSPACE_CHAT_MARKDOWN_UTIL_FILE).href)
  const input = [
    '# 一级标题',
    '',
    '段落里有 [链接](https://example.com) 与 `inline code`。',
    '',
    '- 普通列表',
    '- [x] 已完成任务',
    '- [ ] 待处理任务',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    '| 列一 | 列二 |',
    '| --- | --- |',
    '| A | B |',
  ].join('\n')

  const result = parseWorkspaceChatMarkdown(input)
  assert.equal(result.ok, true)
  assert.equal(result.nodes[0]?.type, 'heading')
  assert.equal(result.nodes[1]?.type, 'paragraph')
  assert.equal(result.nodes[2]?.type, 'list')
  assert.equal(result.nodes[3]?.type, 'code')
  assert.equal(result.nodes[4]?.type, 'table')

  const paragraph = result.nodes[1]
  assert.equal(paragraph?.type, 'paragraph')
  assert.ok(paragraph.children.some(node => node.type === 'link'), '段落中的链接未保留')
  assert.ok(paragraph.children.some(node => node.type === 'inline_code'), '段落中的行内代码未保留')

  const list = result.nodes[2]
  assert.equal(list?.type, 'list')
  assert.equal(list.items[1]?.checked, true)
  assert.equal(list.items[2]?.checked, false)

  const codeBlock = result.nodes[3]
  assert.equal(codeBlock?.type, 'code')
  assert.equal(codeBlock?.lang, 'ts')
  assert.match(codeBlock?.value || '', /const answer = 42/)

  const table = result.nodes[4]
  assert.equal(table?.type, 'table')
  assert.equal(table.rows.length, 2)
  assert.equal(table.rows[0]?.header, true)
})

it('工作区聊天 Markdown 会将原始 HTML 降级为纯文本，且不完整输入仍能稳定解析', async () => {
  const { parseWorkspaceChatMarkdown } = await import(pathToFileURL(WORKSPACE_CHAT_MARKDOWN_UTIL_FILE).href)
  const input = [
    '<script>alert("xss")</script>',
    '',
    '```ts',
    'const partial = true',
  ].join('\n')

  const result = parseWorkspaceChatMarkdown(input)
  assert.equal(result.ok, true)
  assert.equal(result.nodes[0]?.type, 'paragraph')
  assert.equal(result.nodes[0]?.children[0]?.type, 'text')
  assert.match(result.nodes[0]?.children[0]?.value || '', /<script>alert\("xss"\)<\/script>/)
  assert.equal(result.nodes[1]?.type, 'code')
  assert.match(result.nodes[1]?.value || '', /const partial = true/)
})
