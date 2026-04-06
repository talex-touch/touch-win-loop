import assert from 'node:assert/strict'
import { it } from 'vitest'
import * as Y from 'yjs'
import {
  ensureMarkdownCollabDocShape,
  parseMarkdownToRichTextBlocks,
  readMarkdownFromRichText,
  serializeRichTextBlocksToMarkdown,
} from '../../shared/utils/collab-markdown-rich-text.ts'

it('markdown 与富文本块模型可在正文和三级标题范围内双向收敛', () => {
  const cases = [
    {
      input: '',
      expected: '',
    },
    {
      input: '普通正文',
      expected: '普通正文',
    },
    {
      input: '# 一级标题',
      expected: '# 一级标题',
    },
    {
      input: '## 二级标题\n\n正文段落',
      expected: '## 二级标题\n\n正文段落',
    },
    {
      input: '# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n结尾正文',
      expected: '# 一级标题\n\n## 二级标题\n\n### 三级标题\n\n结尾正文',
    },
    {
      input: '# 标题\n\n第一段正文\n第二行会收敛为同一段\n\n### 小节\n\n尾段',
      expected: '# 标题\n\n第一段正文 第二行会收敛为同一段\n\n### 小节\n\n尾段',
    },
  ]

  for (const { input, expected } of cases) {
    const blocks = parseMarkdownToRichTextBlocks(input)
    const output = serializeRichTextBlocksToMarkdown(blocks)
    assert.equal(output, expected)
  }
})

it('旧 markdown 协作文档首次规范化时会补齐 prosemirror 片段并保留 markdown 镜像', () => {
  const legacyDoc = new Y.Doc()
  legacyDoc.getText('content').insert(0, '# 方案标题\n\n正文内容')

  const beforeFragment = legacyDoc.getXmlFragment('prosemirror')
  assert.equal(beforeFragment.length, 0, '旧文档不应预先包含 prosemirror 片段')

  const result = ensureMarkdownCollabDocShape(legacyDoc)

  assert.equal(result.migrated, true)
  assert.equal(result.markdown, '# 方案标题\n\n正文内容')
  assert.equal(legacyDoc.getText('content').toString(), '# 方案标题\n\n正文内容')
  assert.ok(legacyDoc.getXmlFragment('prosemirror').length > 0, '规范化后应写入 prosemirror 片段')
  assert.equal(readMarkdownFromRichText(legacyDoc), '# 方案标题\n\n正文内容')
})

it('不支持的旧 markdown 语法会在一期中降级为普通段落文本', () => {
  const legacyDoc = new Y.Doc()
  legacyDoc.getText('content').insert(0, '- 列表项\n\n#### 四级标题')

  ensureMarkdownCollabDocShape(legacyDoc)

  assert.equal(readMarkdownFromRichText(legacyDoc), '- 列表项\n\n#### 四级标题')
})
