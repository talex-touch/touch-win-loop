import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

export const BUILT_ENTRY = '.output/server/index.mjs'
export const BUILT_SENTRY_PRELOAD = './.output/server/sentry.server.config.mjs'
export const DEFAULT_SMOKE_HOST = '127.0.0.1'
export const DEFAULT_SMOKE_PORT = 4010
export const DEFAULT_STARTUP_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 500

export function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

export function resolveSmokeServerOptions(env = process.env) {
  const host = String(env.SMOKE_HOST || DEFAULT_SMOKE_HOST)
  const port = Number(env.SMOKE_PORT || DEFAULT_SMOKE_PORT)
  const startupTimeoutMs = Number(env.SMOKE_STARTUP_TIMEOUT_MS || DEFAULT_STARTUP_TIMEOUT_MS)

  assert(Number.isFinite(port) && port > 0, `SMOKE_PORT 非法：${env.SMOKE_PORT || ''}`)
  assert(Number.isFinite(startupTimeoutMs) && startupTimeoutMs >= 3000, `SMOKE_STARTUP_TIMEOUT_MS 非法：${env.SMOKE_STARTUP_TIMEOUT_MS || ''}`)

  return {
    host,
    port,
    startupTimeoutMs,
    builtEntry: BUILT_ENTRY,
    baseURL: `http://${host}:${port}`,
  }
}

export async function ensureBuildArtifactExists(entry = BUILT_ENTRY) {
  try {
    await access(entry, constants.R_OK)
    await access(BUILT_SENTRY_PRELOAD, constants.R_OK)
  }
  catch {
    throw new Error(`未找到构建产物 ${entry} 或 ${BUILT_SENTRY_PRELOAD}，请先执行 pnpm build`)
  }
}

export function startBuiltServer(options = resolveSmokeServerOptions()) {
  return spawn('node', ['--import', BUILT_SENTRY_PRELOAD, options.builtEntry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      WINLOOP_DISABLE_BACKGROUND_WORKERS: '1',
      PORT: String(options.port),
      HOST: options.host,
      NITRO_PORT: String(options.port),
      NITRO_HOST: options.host,
    },
  })
}

export async function waitForHealth(server, options = resolveSmokeServerOptions()) {
  const endpoint = `${options.baseURL}/api/health`
  const deadline = Date.now() + options.startupTimeoutMs
  let lastError = ''

  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(`服务进程提前退出，exitCode=${server.exitCode}`)

    try {
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json' },
      })
      if (!response.ok) {
        lastError = `health 返回 HTTP ${response.status}`
        await delay(POLL_INTERVAL_MS)
        continue
      }

      const payload = await response.json()
      assert(payload && typeof payload === 'object', 'health 响应体不是 JSON 对象')
      assert(payload.code === 0, 'health 响应 code 非 0')
      assert(payload.data?.status === 'ok', 'health 响应 data.status 不是 ok')
      return endpoint
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(POLL_INTERVAL_MS)
    }
  }

  throw new Error(`等待 health 超时（${options.startupTimeoutMs}ms）：${lastError || 'unknown error'}`)
}

export async function stopServer(server) {
  if (server.exitCode !== null)
    return

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      server.kill('SIGKILL')
    }, 5000)

    server.once('exit', () => {
      clearTimeout(timeout)
      resolve(undefined)
    })

    server.kill('SIGTERM')
  })
}

export async function startSmokeServer(options = resolveSmokeServerOptions()) {
  await ensureBuildArtifactExists(options.builtEntry)

  const server = startBuiltServer(options)

  try {
    const healthEndpoint = await waitForHealth(server, options)
    return {
      server,
      options,
      healthEndpoint,
    }
  }
  catch (error) {
    await stopServer(server)
    throw error
  }
}
