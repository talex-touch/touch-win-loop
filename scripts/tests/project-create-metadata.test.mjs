import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PLATFORM_STORE_FILE = resolve(process.cwd(), 'server/utils/platform-store.ts')

it('createProject 在无 display 配置时仍写入非空 metadata', async () => {
  const source = await readFile(PLATFORM_STORE_FILE, 'utf8')

  assert.match(source, /const metadata = display \? \{ display \} : \{\}/, 'createProject 在无 display 配置时仍可能写入 null metadata')
  assert.match(source, /JSON\.stringify\(metadata\)/, 'createProject 未固定写入 JSON metadata')
  assert.doesNotMatch(source, /JSON\.stringify\(metadata\) : null/, 'createProject 仍保留 null metadata 回退')
})
