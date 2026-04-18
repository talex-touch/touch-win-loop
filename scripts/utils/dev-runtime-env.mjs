import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd, env } from 'node:process'
import { parse } from 'dotenv'

const DEV_ENV_FILES = ['.env', '.env.dev', '.env.local']

export function loadDevelopmentEnv(rootDir = cwd(), targetEnv = env) {
  const merged = {}

  for (const fileName of DEV_ENV_FILES) {
    const filePath = resolve(rootDir, fileName)
    if (!existsSync(filePath))
      continue

    Object.assign(merged, parse(readFileSync(filePath)))
  }

  for (const [key, value] of Object.entries(merged)) {
    if (targetEnv[key] === undefined)
      targetEnv[key] = value
  }

  return merged
}

function readRequiredText(name, targetEnv) {
  const value = String(targetEnv[name] || '').trim()
  if (!value)
    throw new Error(`[dev] 缺少 ${name}。请在 ".env.dev" 或当前 shell 中显式配置开发态地址。`)
  return value
}

function readRequiredPort(targetEnv) {
  const raw = String(targetEnv.WINLOOP_DEV_PORT || '').trim()
  if (!raw)
    throw new Error('[dev] 缺少 WINLOOP_DEV_PORT。请在 ".env.dev" 或当前 shell 中显式配置开发态端口。')

  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`[dev] WINLOOP_DEV_PORT 非法：${raw}`)
  return port
}

export function resolveDevelopmentServerEnv(targetEnv = env, rootDir = cwd()) {
  loadDevelopmentEnv(rootDir, targetEnv)

  return {
    host: readRequiredText('WINLOOP_DEV_HOST', targetEnv),
    port: readRequiredPort(targetEnv),
  }
}

export function buildNuxtDevelopmentEnv(targetEnv = env, rootDir = cwd()) {
  const nextEnv = {
    ...targetEnv,
  }
  const { host, port } = resolveDevelopmentServerEnv(nextEnv, rootDir)

  nextEnv.HOST = host
  nextEnv.PORT = String(port)
  nextEnv.NUXT_HOST = host
  nextEnv.NUXT_PORT = String(port)

  return nextEnv
}
