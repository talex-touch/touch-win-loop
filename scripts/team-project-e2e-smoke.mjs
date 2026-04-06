#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import { resolveSmokeServerOptions, startSmokeServer, stopServer } from './utils/smoke-server.mjs'

function runCommand(command, args, env, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(undefined)
        return
      }

      const reason = signal
        ? `${label} 被信号 ${signal} 终止`
        : `${label} 失败，退出码 ${code ?? 'unknown'}`
      reject(new Error(reason))
    })
  })
}

async function installChromiumIfNeeded(env) {
  if (String(env.E2E_SKIP_PLAYWRIGHT_INSTALL || '').trim() === '1')
    return

  await runCommand(
    'pnpm',
    ['exec', 'playwright', 'install', 'chromium'],
    env,
    'Playwright Chromium 安装',
  )
}

async function run() {
  const pgUrl = String(process.env.WINLOOP_PG_URL || '').trim()
  if (!pgUrl) {
    throw new Error('未检测到 WINLOOP_PG_URL。Team -> Project E2E smoke 依赖可写 PostgreSQL，请先显式导出该环境变量后再执行。')
  }

  const options = resolveSmokeServerOptions(process.env)
  const artifactDir = 'output/playwright/team-project-e2e'
  await mkdir(artifactDir, { recursive: true })

  const smokeServer = await startSmokeServer(options)

  try {
    console.log(`[team-project-e2e] server ready: ${smokeServer.healthEndpoint}`)

    const sharedEnv = {
      ...process.env,
      CI: process.env.CI || '1',
      E2E_BASE_URL: options.baseURL,
    }

    await installChromiumIfNeeded(sharedEnv)

    await runCommand(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        'scripts/tests/team-project-e2e.smoke.spec.mjs',
        '--workers=1',
        '--reporter=line',
        '--output',
        artifactDir,
      ],
      sharedEnv,
      'Team -> Project E2E smoke',
    )
  }
  finally {
    await stopServer(smokeServer.server)
  }
}

await run()
