#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
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

function printUsage() {
  console.log('用法：node scripts/db-migrate.mjs <sql-file> [migration-key] [--force] [--no-mark]')
}

function parseArgs(argv) {
  const flags = new Set()
  const positionals = []

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h')
      return { help: true, flags, positionals }
    if (arg.startsWith('--'))
      flags.add(arg)
    else
      positionals.push(arg)
  }

  return {
    help: false,
    flags,
    positionals,
  }
}

function resolveMigrationFile(rawPath) {
  return rawPath.startsWith('/')
    ? rawPath
    : resolve(rootDir, rawPath)
}

function resolveMigrationKey(filePath, rawKey) {
  const normalized = String(rawKey || '').trim()
  if (normalized)
    return normalized
  return basename(filePath).replace(/\.sql$/i, '')
}

const parsedArgs = parseArgs(process.argv.slice(2))
if (parsedArgs.help) {
  printUsage()
  process.exit(0)
}

const sqlFileArg = String(parsedArgs.positionals[0] || '').trim()
if (!sqlFileArg) {
  printUsage()
  process.exit(1)
}

const sqlFilePath = resolveMigrationFile(sqlFileArg)
const migrationKey = resolveMigrationKey(sqlFilePath, parsedArgs.positionals[1])
const shouldForce = parsedArgs.flags.has('--force')
const shouldMark = !parsedArgs.flags.has('--no-mark')
const pgUrl = String(process.env.WINLOOP_PG_URL || '').trim()

if (!pgUrl) {
  console.error('缺少 WINLOOP_PG_URL，无法执行迁移。请先配置数据库连接。')
  process.exit(1)
}

const pool = new Pool({
  connectionString: pgUrl,
})

async function ensureMigrationMeta(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function run() {
  const client = await pool.connect()

  try {
    await ensureMigrationMeta(client)

    if (shouldMark && !shouldForce) {
      const existing = await client.query(
        'SELECT value FROM migrations_meta WHERE key = $1 LIMIT 1',
        [migrationKey],
      )
      if (existing.rows[0]?.value === '1') {
        console.log(`迁移已执行，跳过：${migrationKey}`)
        return
      }
    }

    const sql = await readFile(sqlFilePath, 'utf8')
    const result = await client.query(sql)
    const lastResult = Array.isArray(result) ? result[result.length - 1] : result

    if (lastResult?.command === 'SELECT' && Array.isArray(lastResult.rows) && lastResult.rows.length > 0) {
      console.error(`迁移校验未通过：${migrationKey}`)
      console.error(JSON.stringify(lastResult.rows, null, 2))
      process.exitCode = 1
      return
    }

    if (shouldMark) {
      await client.query(
        `INSERT INTO migrations_meta (key, value, updated_at)
         VALUES ($1, '1', NOW())
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = EXCLUDED.updated_at`,
        [migrationKey],
      )
    }

    console.log(`迁移执行完成：${migrationKey}`)
  }
  finally {
    client.release()
    await pool.end()
  }
}

await run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`迁移执行失败：${message}`)
  process.exit(1)
})
