#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { Pool } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')

const jiti = createJiti(import.meta.url, {
  alias: {
    '~~': rootDir,
  },
})

const { loadWinloopEnv } = jiti(resolve(rootDir, 'config/env.ts'))
loadWinloopEnv(rootDir, process.env.NODE_ENV)

const pgUrl = String(process.env.WINLOOP_PG_URL || '').trim()
if (!pgUrl) {
  console.error('缺少 WINLOOP_PG_URL，无法执行。请先在 .env.local/.env.dev 中配置数据库连接。')
  process.exit(1)
}

const {
  ensureContestLibrarySeeded,
  listCatalogContestIds,
  resetCatalogContestSeedState,
} = jiti(resolve(rootDir, 'server/utils/contest-store.ts'))

const action = String(process.argv[2] || 'help').trim().toLowerCase()

function printUsage() {
  console.log('用法：node scripts/contest-library.mjs <seed|clean|status>')
}

async function run() {
  if (!['seed', 'clean', 'status'].includes(action)) {
    printUsage()
    process.exit(action ? 1 : 0)
  }

  const pool = new Pool({
    connectionString: pgUrl,
  })

  try {
    if (action === 'seed') {
      const actorUserId = String(process.env.WINLOOP_SEED_ACTOR_USER_ID || '').trim() || undefined
      await ensureContestLibrarySeeded(pool, {
        actorUserId,
        forceSeed: true,
      })
      console.log('catalog 赛事 seed 执行完成（幂等）。')
      return
    }

    if (action === 'clean') {
      const output = await resetCatalogContestSeedState(pool)
      console.log(`catalog 赛事清理完成，共处理 ${output.deletedContestIds.length} 个内置 contest id。`)
      return
    }

    const catalogIds = listCatalogContestIds()
    const countResult = await pool.query(
      'SELECT COUNT(*)::TEXT AS count FROM contests WHERE id = ANY($1::TEXT[])',
      [catalogIds],
    )
    const flagResult = await pool.query(
      'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
      ['contest_library_seeded_v2'],
    )

    const catalogCount = Number(countResult.rows[0]?.count || '0')
    const migrationFlag = flagResult.rows[0]?.value || '0'

    console.log(`catalog 赛事数量：${catalogCount}`)
    console.log(`seed 迁移标记：${migrationFlag === '1' ? '已写入' : '未写入'}`)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`执行失败：${message}`)
    if (message.includes('does not exist')) {
      console.error('提示：请先启动服务完成数据库初始化，再执行该命令。')
    }
    process.exit(1)
  }
  finally {
    await pool.end()
  }
}

await run()
