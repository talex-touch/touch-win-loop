import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildNuxtDevelopmentEnv, resolveDevelopmentServerEnv } from '../utils/dev-runtime-env.mjs'

const tempDirs = []

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'winloop-dev-env-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('dev runtime env', () => {
  it('会从 .env.dev 读取开发态 host 与 port', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, '.env.dev'), 'WINLOOP_DEV_HOST=127.0.0.1\nWINLOOP_DEV_PORT=3510\n', 'utf8')

    const resolved = resolveDevelopmentServerEnv({}, dir)

    expect(resolved).toEqual({
      host: '127.0.0.1',
      port: 3510,
    })
  })

  it('会把开发态地址映射到 Nuxt 进程变量', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, '.env.dev'), 'WINLOOP_DEV_HOST=0.0.0.0\nWINLOOP_DEV_PORT=3510\n', 'utf8')

    const env = buildNuxtDevelopmentEnv({}, dir)

    expect(env.HOST).toBe('0.0.0.0')
    expect(env.PORT).toBe('3510')
    expect(env.NUXT_HOST).toBe('0.0.0.0')
    expect(env.NUXT_PORT).toBe('3510')
  })

  it('优先使用当前 shell 显式传入的开发态变量', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, '.env.dev'), 'WINLOOP_DEV_HOST=127.0.0.1\nWINLOOP_DEV_PORT=3510\n', 'utf8')

    const resolved = resolveDevelopmentServerEnv({
      WINLOOP_DEV_HOST: 'localhost',
      WINLOOP_DEV_PORT: '3520',
    }, dir)

    expect(resolved).toEqual({
      host: 'localhost',
      port: 3520,
    })
  })

  it('缺少开发态端口契约时会直接报错', async () => {
    const dir = await createTempDir()
    await writeFile(join(dir, '.env.dev'), 'WINLOOP_DEV_HOST=127.0.0.1\n', 'utf8')

    expect(() => resolveDevelopmentServerEnv({}, dir)).toThrow(/WINLOOP_DEV_PORT/)
  })
})
