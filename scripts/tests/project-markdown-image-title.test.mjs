import assert from 'node:assert/strict'
import { beforeAll, it, vi } from 'vitest'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {
      apiBaseUrl: '/api',
      appBaseUrl: '',
    },
    onlyOffice: {},
  }),
}))

let isGenericEmbeddedImageTitleCandidate
let resolveEmbeddedMarkdownImageUploadTitle

beforeAll(async () => {
  const module = await import('../../server/utils/project-resource-store.ts')
  isGenericEmbeddedImageTitleCandidate = module.isGenericEmbeddedImageTitleCandidate
  resolveEmbeddedMarkdownImageUploadTitle = module.resolveEmbeddedMarkdownImageUploadTitle
})

it('markdown 图片标题优先取原文件名去后缀', () => {
  const title = resolveEmbeddedMarkdownImageUploadTitle({
    fileName: '系统架构图.png',
    hostResourceTitle: '协作文档 1',
    existingTitles: [],
  })

  assert.equal(title, '系统架构图')
})

it('泛化图片文件名会回退到文档标题加三位序号', () => {
  const title = resolveEmbeddedMarkdownImageUploadTitle({
    fileName: 'image.png',
    hostResourceTitle: '需求说明',
    existingTitles: [],
  })

  assert.equal(title, '需求说明 - 图片 001')
})

it('同一文档下重复原始文件名会追加递增序号', () => {
  const title = resolveEmbeddedMarkdownImageUploadTitle({
    fileName: '界面草图.png',
    hostResourceTitle: '方案沉淀',
    existingTitles: ['界面草图', '界面草图 2'],
  })

  assert.equal(title, '界面草图 3')
})

it('同一文档下泛化图片文件名会沿用三位序号递增', () => {
  const title = resolveEmbeddedMarkdownImageUploadTitle({
    fileName: 'screenshot.png',
    hostResourceTitle: '方案沉淀',
    existingTitles: ['方案沉淀 - 图片 001', '方案沉淀 - 图片 002'],
  })

  assert.equal(title, '方案沉淀 - 图片 003')
})

it('泛化图片名识别会过滤常见截图与剪贴板文件名', () => {
  assert.equal(isGenericEmbeddedImageTitleCandidate('image'), true)
  assert.equal(isGenericEmbeddedImageTitleCandidate('snipaste_2026'), true)
  assert.equal(isGenericEmbeddedImageTitleCandidate('wechat-image-12'), true)
  assert.equal(isGenericEmbeddedImageTitleCandidate('界面草图'), false)
})
