import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_RESOURCE_DOCUMENT_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-document-store.ts')
const PROJECT_RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')

it('项目图片资源预览不再依赖转换任务', async () => {
  const [documentStoreSource, resourceStoreSource] = await Promise.all([
    readFile(PROJECT_RESOURCE_DOCUMENT_STORE_FILE, 'utf8'),
    readFile(PROJECT_RESOURCE_STORE_FILE, 'utf8'),
  ])

  assert.match(documentStoreSource, /function isImageByNameOrMime\(fileName: string, mimeType: string\): boolean \{/, '预览文档存储缺少图片 MIME 判定')
  assert.match(documentStoreSource, /const isImage = isImageByNameOrMime\(sourceFileName, sourceMimeType\)/, '预览文档创建未识别图片资源')
  assert.match(documentStoreSource, /const previewStatus: ProjectPreviewStatus = isPdf \|\| isImage\s+\? 'succeeded'/, '图片资源创建预览文档时仍未直出成功态')
  assert.match(documentStoreSource, /const previewError = canConvert \|\| isPdf \|\| isImage \? '' : 'UNSUPPORTED_CONVERSION_TYPE'/, '图片资源创建预览文档时仍会写入不支持转换错误')
  assert.match(documentStoreSource, /if \(isPdfByNameOrMime\(document\.sourceFileName, document\.sourceMimeType\) \|\| isImageByNameOrMime\(document\.sourceFileName, document\.sourceMimeType\)\) \{/, '图片资源重新转换时仍未短路为直出预览')
  assert.match(documentStoreSource, /previewObjectKey: normalizeString\(document\.previewObjectKey\) \|\| normalizeString\(document\.sourceObjectKey\) \|\| normalizeString\(document\.objectKey\)/, '旧图片文档未回退到源文件作为预览对象')
  assert.match(documentStoreSource, /previewStatus: 'succeeded'/, '旧图片文档未在读取时归一化为可预览状态')

  assert.match(resourceStoreSource, /const isDirectPreviewImage = sourceType === 'upload'[\s\S]*isImageUploadInput\(resolvedFileName, resolvedMimeType\)/, '资源聚合结果未将上传图片识别为直出预览')
  assert.match(resourceStoreSource, /const normalizedPreviewStatus = isDirectPreviewImage\s+\? 'succeeded'/, '资源聚合结果未将图片预览状态归一化为成功')
  assert.match(resourceStoreSource, /previewError: isDirectPreviewImage \? undefined : \(normalizeString\(row\.preview_error\) \|\| undefined\)/, '资源聚合结果未清空图片预览错误')
})
