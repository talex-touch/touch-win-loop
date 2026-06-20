import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')

it('project_resources 插入语句保持 summary/content/metadata 占位符对齐', async () => {
  const source = await readFile(STORE_FILE, 'utf8')

  assert.match(
    source,
    /VALUES \(\s+\$1, \$2, \$3, \$4, 'library', 'binary', \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14::JSONB, 'active', \$15, \$15, \$16, \$16\s+\)/,
    '系统库资源插入语句的 summary/content/metadata 占位符顺序错误',
  )

  assert.match(
    source,
    /VALUES \(\s+\$1, \$2, \$3, \$4, 'upload', 'binary', NULL, \$5, \$6, \$7, \$8, \$9, \$10, \$11, '', \$12::JSONB, 'active', \$13, \$13, \$14, \$14\s+\)/,
    '上传资源插入语句的 summary/content/metadata 占位符顺序错误',
  )

  assert.match(
    source,
    /VALUES \(\s+\$1, \$2, \$3, \$4, 'collab', \$5, NULL, \$6, \$7, \$8, \$9, \$10, \$11, \$12, '', \$13::JSONB, 'active', \$14, \$14, \$15, \$15\s+\)/,
    '协作资源插入语句的 summary/content/metadata 占位符顺序错误',
  )

  assert.match(
    source,
    /VALUES \(\s+\$1, \$2, \$3, \$4, \$5, 'binary', \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15::JSONB, 'active', \$16, \$16, \$17, \$17\s+\)/,
    '资源复制插入语句的 summary/content/metadata 占位符顺序错误',
  )
})
