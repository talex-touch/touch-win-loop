#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const BUILT_ENTRY = '.output/server/index.mjs'
const HOST = String(process.env.SMOKE_HOST || '127.0.0.1')
const PORT = Number(process.env.SMOKE_PORT || 4010)
const STARTUP_TIMEOUT_MS = Number(process.env.SMOKE_STARTUP_TIMEOUT_MS || 30000)
const POLL_INTERVAL_MS = 500

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

async function ensureBuildArtifactExists() {
  try {
    await access(BUILT_ENTRY, constants.R_OK)
  }
  catch {
    throw new Error(`未找到构建产物 ${BUILT_ENTRY}，请先执行 pnpm build`)
  }
}

async function waitForHealth(server) {
  const endpoint = `http://${HOST}:${PORT}/api/health`
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let lastError = ''

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`服务进程提前退出，exitCode=${server.exitCode}`)
    }

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
      return
    }
    catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await delay(POLL_INTERVAL_MS)
    }
  }

  throw new Error(`等待 health 超时（${STARTUP_TIMEOUT_MS}ms）：${lastError || 'unknown error'}`)
}

async function stopServer(server) {
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

async function run() {
  assert(Number.isFinite(PORT) && PORT > 0, `SMOKE_PORT 非法：${process.env.SMOKE_PORT || ''}`)
  assert(Number.isFinite(STARTUP_TIMEOUT_MS) && STARTUP_TIMEOUT_MS >= 3000, `SMOKE_STARTUP_TIMEOUT_MS 非法：${process.env.SMOKE_STARTUP_TIMEOUT_MS || ''}`)

  await ensureBuildArtifactExists()

  const server = spawn('node', [BUILT_ENTRY], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST,
      NITRO_PORT: String(PORT),
      NITRO_HOST: HOST,
    },
  })

  try {
    await waitForHealth(server)
    console.log(`[ci-smoke] health check passed: http://${HOST}:${PORT}/api/health`)
  }
  finally {
    await stopServer(server)
  }
}

await run()
