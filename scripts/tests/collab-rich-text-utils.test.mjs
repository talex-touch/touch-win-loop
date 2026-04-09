import assert from 'node:assert/strict'
import { it } from 'vitest'
import * as Y from 'yjs'
import {
  ensureMarkdownCollabDocShape,
  parseMarkdownToRichTextDocument,
  readMarkdownFromRichText,
  serializeRichTextDocumentToMarkdown,
} from '../../shared/utils/collab-markdown-rich-text.ts'

it('增强版 markdown 文档可对标题、强调、引用、列表与链接做 round-trip', () => {
  const input = [
    '# 一级标题',
    '',
    '包含 **加粗**、*斜体*、~~删除线~~、<u>下划线</u> 与 [链接](https://example.com)。',
    '',
    '> 引用内容',
    '',
    '- 无序列表',
    '- 第二项',
    '',
    '1. 有序列表',
    '2. 第二项',
    '',
    '行内代码 `const x = 1`',
  ].join('\n')

  const output = serializeRichTextDocumentToMarkdown(parseMarkdownToRichTextDocument(input))
  assert.match(output, /^# 一级标题$/m)
  assert.match(output, /\*\*加粗\*\*/)
  assert.match(output, /\*斜体\*/)
  assert.match(output, /~~删除线~~/)
  assert.match(output, /<u>下划线<\/u>/)
  assert.match(output, /\[链接\]\(https:\/\/example\.com\)/)
  assert.match(output, /^> 引用内容$/m)
  assert.match(output, /^[*-] 无序列表$/m)
  assert.match(output, /^1\. 有序列表$/m)
  assert.match(output, /`const x = 1`/)
})

it('markdown 标题支持 H1-H6 round-trip', () => {
  const input = [
    '# 一级标题',
    '',
    '## 二级标题',
    '',
    '### 三级标题',
    '',
    '#### 四级标题',
    '',
    '##### 五级标题',
    '',
    '###### 六级标题',
  ].join('\n')

  const output = serializeRichTextDocumentToMarkdown(parseMarkdownToRichTextDocument(input))
  assert.match(output, /^# 一级标题$/m)
  assert.match(output, /^## 二级标题$/m)
  assert.match(output, /^### 三级标题$/m)
  assert.match(output, /^#### 四级标题$/m)
  assert.match(output, /^##### 五级标题$/m)
  assert.match(output, /^###### 六级标题$/m)
})

it('gFM 任务列表、代码块、分割线与表格在 round-trip 后结构不丢失', () => {
  const input = [
    '- [x] 已完成任务',
    '- [ ] 待处理任务',
    '',
    '---',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    '| 列一 | 列二 |',
    '| --- | --- |',
    '| A | B |',
  ].join('\n')

  const documentNode = parseMarkdownToRichTextDocument(input)
  const codeBlock = documentNode.content?.find(node => node?.type === 'codeBlock') || null
  assert.equal(codeBlock?.attrs?.language, 'ts', '代码块语言未保留')

  const output = serializeRichTextDocumentToMarkdown(documentNode)
  assert.match(output, /^[*-] \[x\] 已完成任务$/m)
  assert.match(output, /^[*-] \[ \] 待处理任务$/m)
  assert.match(output, /^(\*\*\*|---)$/m)
  assert.match(output, /```ts[\s\S]*const answer = 42[\s\S]*```/)
  assert.match(output, /\|\s*列一\s*\|\s*列二\s*\|/)
  assert.match(output, /\|\s*-+\s*\|\s*-+\s*\|/)
  assert.match(output, /\|\s*A\s*\|\s*B\s*\|/)
})

it('markdown 图片节点可 round-trip，并对内部项目资源路径回填 resourceId', () => {
  const input = '![架构草图](/api/projects/project-1/resources/resource-9/file "设计稿")'
  const documentNode = parseMarkdownToRichTextDocument(input)
  const imageNode = documentNode.content?.[0] || null

  assert.equal(imageNode?.type, 'image')
  assert.equal(imageNode?.attrs?.src, '/api/projects/project-1/resources/resource-9/file')
  assert.equal(imageNode?.attrs?.alt, '架构草图')
  assert.equal(imageNode?.attrs?.title, '设计稿')
  assert.equal(imageNode?.attrs?.resourceId, 'resource-9')

  const output = serializeRichTextDocumentToMarkdown(documentNode)
  assert.match(output, /!\[架构草图\]\(\/api\/projects\/project-1\/resources\/resource-9\/file "设计稿"\)/)
})

it('markdown 图片尺寸变更后会回退到 html img，并保留 width 与 resourceId', () => {
  const input = '<img src="/api/projects/project-1/resources/resource-12/file" alt="流程图" title="系统流程" width="420" data-resource-id="resource-12">'
  const documentNode = parseMarkdownToRichTextDocument(input)
  const imageNode = documentNode.content?.[0] || null

  assert.equal(imageNode?.type, 'image')
  assert.equal(imageNode?.attrs?.src, '/api/projects/project-1/resources/resource-12/file')
  assert.equal(imageNode?.attrs?.alt, '流程图')
  assert.equal(imageNode?.attrs?.title, '系统流程')
  assert.equal(imageNode?.attrs?.width, 420)
  assert.equal(imageNode?.attrs?.resourceId, 'resource-12')

  const output = serializeRichTextDocumentToMarkdown(documentNode)
  assert.match(output, /<img src="\/api\/projects\/project-1\/resources\/resource-12\/file" alt="流程图" title="系统流程" width="420" data-resource-id="resource-12">/)
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

it('旧 markdown 镜像中的 GFM 能在迁移后保留下划线与表格语义', () => {
  const legacyDoc = new Y.Doc()
  legacyDoc.getText('content').insert(0, [
    '<u>强调</u>',
    '',
    '| 姓名 | 角色 |',
    '| --- | --- |',
    '| Alice | 编辑者 |',
  ].join('\n'))

  ensureMarkdownCollabDocShape(legacyDoc)

  const markdown = readMarkdownFromRichText(legacyDoc)
  assert.match(markdown, /<u>强调<\/u>/)
  assert.match(markdown, /\|\s*姓名\s*\|\s*角色\s*\|/)
  assert.match(markdown, /\|\s*Alice\s*\|\s*编辑者\s*\|/)
})

it('图片、任务列表与表格混排后，markdown 镜像不会丢失结构', () => {
  const input = [
    '![流程图](/api/projects/project-2/resources/resource-3/file)',
    '',
    '- [x] 已插图',
    '- [ ] 待补说明',
    '',
    '| 节点 | 说明 |',
    '| --- | --- |',
    '| A | 起点 |',
  ].join('\n')

  const output = serializeRichTextDocumentToMarkdown(parseMarkdownToRichTextDocument(input))
  assert.match(output, /!\[流程图\]\(\/api\/projects\/project-2\/resources\/resource-3\/file\)/)
  assert.match(output, /^[*-] \[x\] 已插图$/m)
  assert.match(output, /\|\s*节点\s*\|\s*说明\s*\|/)
})
