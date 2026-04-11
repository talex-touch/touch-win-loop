import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  attachCollabMarkdownHeadingAnchors,
  buildCollabMarkdownHeadingAnchorId,
  buildCollabMarkdownHeadingSectionRanges,
  normalizeCollabMarkdownHeadingSlug,
  resolveCollabMarkdownCollapsedHeadingAncestors,
} from '../../app/utils/collab-markdown-navigation.ts'

it('标题锚点会按资源、slug 与重名序号生成稳定 id', () => {
  const slug = normalizeCollabMarkdownHeadingSlug('项目 目标 / 2026')
  assert.equal(slug, '项目-目标-2026')

  const anchorId = buildCollabMarkdownHeadingAnchorId('resource-1', '项目 目标 / 2026', 2)
  assert.equal(anchorId, 'md-resource-1-项目-目标-2026-2')

  const items = attachCollabMarkdownHeadingAnchors([
    { pos: 0, level: 1, text: '项目目标', nodeSize: 8 },
    { pos: 12, level: 2, text: '项目目标', nodeSize: 8 },
    { pos: 24, level: 2, text: '实现路径', nodeSize: 8 },
  ], 'resource-1')

  assert.equal(items[0]?.anchorId, 'md-resource-1-项目目标-1')
  assert.equal(items[1]?.anchorId, 'md-resource-1-项目目标-2')
  assert.equal(items[2]?.anchorId, 'md-resource-1-实现路径-1')
})

it('章节折叠范围会按 heading 层级边界计算，并能找出需展开的祖先章节', () => {
  const items = [
    { pos: 0, level: 1, text: '一', nodeSize: 5 },
    { pos: 10, level: 2, text: '二', nodeSize: 5 },
    { pos: 20, level: 3, text: '三', nodeSize: 5 },
    { pos: 35, level: 2, text: '四', nodeSize: 5 },
    { pos: 50, level: 1, text: '五', nodeSize: 5 },
  ]

  const ranges = buildCollabMarkdownHeadingSectionRanges(items, 70)
  assert.deepEqual(ranges, [
    { headingPos: 0, from: 5, to: 50 },
    { headingPos: 10, from: 15, to: 35 },
    { headingPos: 20, from: 25, to: 35 },
    { headingPos: 35, from: 40, to: 50 },
    { headingPos: 50, from: 55, to: 70 },
  ])

  const ancestors = resolveCollabMarkdownCollapsedHeadingAncestors(ranges, 28)
  assert.deepEqual(ancestors, [0, 10, 20])
})
