import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { stripSentryServerPreload } from './utils/dev-node-options.mjs'
import { buildNuxtDevelopmentEnv } from './utils/dev-runtime-env.mjs'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDir = dirname(currentFilePath)
const nuxtCliPath = resolve(currentDir, '../node_modules/nuxt/bin/nuxt.mjs')

const { nodeOptions, removed } = stripSentryServerPreload(process.env.NODE_OPTIONS)
const env = buildNuxtDevelopmentEnv(process.env, process.cwd())

if (nodeOptions)
  env.NODE_OPTIONS = nodeOptions
else
  delete env.NODE_OPTIONS

if (removed.length > 0) {
  console.warn(
    `[dev] 已移除 NODE_OPTIONS 中的 Sentry 预加载：${removed.join(', ')}。开发态下该 preload 会引用不存在的 Nuxt server bundle。`,
  )
}

const child = spawn(process.execPath, [nuxtCliPath, 'dev', ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
