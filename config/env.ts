import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { parse } from 'dotenv'

const ENV_FILES = ['.env', '.env.dev', '.env.prod', '.env.local'] as const

export type EnvFileName = (typeof ENV_FILES)[number]

let cachedRootDir = ''
let cachedMode = ''
let cachedMerged: Record<string, string> | null = null

function getActiveEnvFiles(mode = process.env.NODE_ENV): EnvFileName[] {
  if (mode === 'production')
    return ['.env', '.env.prod', '.env.local']
  if (mode === 'development')
    return ['.env', '.env.dev', '.env.local']
  return [...ENV_FILES]
}

export function getEnvPriorityOrder(mode = process.env.NODE_ENV): EnvFileName[] {
  return [...getActiveEnvFiles(mode)].reverse() as EnvFileName[]
}

export function loadWinloopEnv(rootDir = process.cwd(), mode = process.env.NODE_ENV): Record<string, string> {
  if (cachedMerged && cachedRootDir === rootDir && cachedMode === mode)
    return cachedMerged

  const merged: Record<string, string> = {}
  const activeEnvFiles = getActiveEnvFiles(mode)

  for (const fileName of activeEnvFiles) {
    const filePath = resolve(rootDir, fileName)
    if (!existsSync(filePath))
      continue

    const parsed = parse(readFileSync(filePath))
    Object.assign(merged, parsed)
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined)
      process.env[key] = value
  }

  cachedRootDir = rootDir
  cachedMode = mode || ''
  cachedMerged = merged
  return merged
}

export function resolveEnvValue(name: string, fallback = ''): string {
  const merged = loadWinloopEnv()
  return process.env[name] ?? merged[name] ?? fallback
}

export function resolveEnvNumber(name: string, fallback: number): number {
  const raw = resolveEnvValue(name, String(fallback)).trim()
  const parsed = Number(raw)
  if (!Number.isFinite(parsed))
    return fallback
  return parsed
}

export function resolveEnvBoolean(name: string, fallback: boolean): boolean {
  const raw = resolveEnvValue(name, fallback ? 'true' : 'false').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(raw))
    return true
  if (['0', 'false', 'no', 'off'].includes(raw))
    return false
  return fallback
}
