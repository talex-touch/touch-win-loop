#!/usr/bin/env node

import { resolveSmokeServerOptions, startSmokeServer, stopServer } from './utils/smoke-server.mjs'

async function run() {
  const options = resolveSmokeServerOptions()
  const { server, healthEndpoint } = await startSmokeServer(options)

  try {
    console.log(`[ci-smoke] health check passed: ${healthEndpoint}`)
  }
  finally {
    await stopServer(server)
  }
}

await run()
