#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { parse } from 'dotenv'

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    mode: {
      type: 'string',
    },
  },
})

const cwd = process.cwd()
const mode = String(values.mode || process.env.NODE_ENV || '').trim()

function normalizeText(value) {
  return String(value || '').trim()
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized)
      return normalized
  }
  return ''
}

function getActiveEnvFiles(currentMode) {
  if (currentMode === 'production')
    return ['.env', '.env.prod', '.env.local']
  if (currentMode === 'development')
    return ['.env', '.env.dev', '.env.local']
  return ['.env', '.env.dev', '.env.prod', '.env.local']
}

function loadEnv(currentMode) {
  const merged = {}
  for (const fileName of getActiveEnvFiles(currentMode)) {
    const filePath = resolve(cwd, fileName)
    if (!existsSync(filePath))
      continue
    Object.assign(merged, parse(readFileSync(filePath)))
  }
  return merged
}

const mergedEnv = loadEnv(mode)

function resolveEnvValue(name, fallback = '') {
  return process.env[name] ?? mergedEnv[name] ?? fallback
}

function resolveGitOutput(command) {
  try {
    return String(execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }) || '').trim()
  }
  catch {
    return ''
  }
}

function resolveBuildVersion() {
  const fromEnv = firstNonEmpty(
    resolveEnvValue('WINLOOP_BUILD_VERSION', ''),
    resolveEnvValue('BUILD_VERSION', ''),
  )
  if (fromEnv)
    return fromEnv

  const described = resolveGitOutput('git describe --tags --always --dirty')
  if (described)
    return described

  const commitSha = resolveGitOutput('git rev-parse HEAD')
  if (commitSha)
    return `local-${commitSha.slice(0, 7)}`

  return ''
}

function resolveSentryRelease() {
  return firstNonEmpty(
    resolveEnvValue('WINLOOP_SENTRY_RELEASE', ''),
    resolveBuildVersion(),
  )
}

function resolveTracesSampleRateState() {
  const raw = normalizeText(resolveEnvValue('WINLOOP_SENTRY_TRACES_SAMPLE_RATE', '0.1'))
  const parsed = Number(raw)
  if (!raw)
    return { label: '0.1 (default)', valid: true }
  if (!Number.isFinite(parsed))
    return { label: `${raw} (invalid)`, valid: false }
  const normalized = Math.max(0, Math.min(1, parsed))
  return {
    label: String(normalized === parsed ? parsed : `${parsed} -> ${normalized}`),
    valid: true,
  }
}

function readPackageJson() {
  const filePath = resolve(cwd, 'package.json')
  if (!existsSync(filePath))
    return {}
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function hasFile(filePath) {
  return existsSync(resolve(cwd, filePath))
}

function formatState(ready) {
  return ready ? 'ready' : 'missing'
}

function printSection(title, lines) {
  console.log(`\n[winloop-sentry] ${title}`)
  for (const line of lines)
    console.log(`- ${line}`)
}

const packageJson = readPackageJson()
const sentryDependency = firstNonEmpty(
  packageJson.dependencies?.['@sentry/nuxt'],
  packageJson.devDependencies?.['@sentry/nuxt'],
)
const startScript = normalizeText(packageJson.scripts?.start)
const nuxtConfigText = hasFile('nuxt.config.ts')
  ? readFileSync(resolve(cwd, 'nuxt.config.ts'), 'utf8')
  : ''

const codeChecks = [
  {
    label: '@sentry/nuxt 依赖',
    ready: Boolean(sentryDependency),
    detail: sentryDependency || '未检测到',
  },
  {
    label: 'client config',
    ready: hasFile('sentry.client.config.ts'),
    detail: 'sentry.client.config.ts',
  },
  {
    label: 'server config',
    ready: hasFile('sentry.server.config.ts'),
    detail: 'sentry.server.config.ts',
  },
  {
    label: 'server helper',
    ready: hasFile('server/utils/sentry.ts'),
    detail: 'server/utils/sentry.ts',
  },
  {
    label: 'start preload',
    ready: startScript.includes('sentry.server.config.mjs'),
    detail: startScript || '未配置',
  },
  {
    label: 'client hidden sourcemap',
    ready: /sourcemap\s*:\s*\{[\s\S]*client\s*:\s*['"]hidden['"]/.test(nuxtConfigText),
    detail: 'nuxt.config.ts',
  },
]

const runtimeDsn = normalizeText(resolveEnvValue('WINLOOP_SENTRY_DSN', ''))
const runtimeEnvironment = normalizeText(resolveEnvValue('WINLOOP_SENTRY_ENVIRONMENT', '')).toLowerCase()
const runtimeEnvironmentReady = ['staging', 'production'].includes(runtimeEnvironment)
const tracesSampleRate = resolveTracesSampleRateState()
const runtimeRelease = resolveSentryRelease()

const runtimeChecks = [
  {
    label: 'WINLOOP_SENTRY_DSN',
    ready: Boolean(runtimeDsn),
    detail: runtimeDsn ? '[set]' : '[missing]',
  },
  {
    label: 'WINLOOP_SENTRY_ENVIRONMENT',
    ready: runtimeEnvironmentReady,
    detail: runtimeEnvironmentReady ? runtimeEnvironment : '[missing or invalid]',
  },
  {
    label: 'WINLOOP_SENTRY_TRACES_SAMPLE_RATE',
    ready: tracesSampleRate.valid,
    detail: tracesSampleRate.label,
  },
  {
    label: 'WINLOOP_SENTRY_RELEASE',
    ready: true,
    detail: runtimeRelease || '[empty]',
  },
]

const buildChecks = [
  {
    label: 'SENTRY_AUTH_TOKEN',
    ready: Boolean(normalizeText(resolveEnvValue('SENTRY_AUTH_TOKEN', ''))),
    detail: normalizeText(resolveEnvValue('SENTRY_AUTH_TOKEN', '')) ? '[set]' : '[missing]',
  },
  {
    label: 'WINLOOP_SENTRY_ORG',
    ready: Boolean(normalizeText(resolveEnvValue('WINLOOP_SENTRY_ORG', ''))),
    detail: normalizeText(resolveEnvValue('WINLOOP_SENTRY_ORG', '')) ? '[set]' : '[missing]',
  },
  {
    label: 'WINLOOP_SENTRY_PROJECT',
    ready: Boolean(normalizeText(resolveEnvValue('WINLOOP_SENTRY_PROJECT', ''))),
    detail: normalizeText(resolveEnvValue('WINLOOP_SENTRY_PROJECT', '')) ? '[set]' : '[missing]',
  },
]

const codeReady = codeChecks.every(item => item.ready)
const runtimeReady = runtimeChecks[0].ready && runtimeChecks[1].ready && runtimeChecks[2].ready
const buildReady = buildChecks.every(item => item.ready)

printSection(`代码接入 (${formatState(codeReady)})`, codeChecks.map(item => `${item.label}: ${item.ready ? 'ok' : 'missing'} (${item.detail})`))
printSection(`运行期环境 (${formatState(runtimeReady)})`, [
  `mode: ${mode || '[unset]'}`,
  ...runtimeChecks.map(item => `${item.label}: ${item.ready ? 'ok' : 'missing'} (${item.detail})`),
])
printSection(`构建期环境 (${formatState(buildReady)})`, buildChecks.map(item => `${item.label}: ${item.ready ? 'ok' : 'missing'} (${item.detail})`))

const conclusion = []

if (!codeReady) {
  conclusion.push('结论: 仓库里的 Sentry 代码接入仍不完整，先补齐代码项再做环境验收。')
}
else if (!runtimeReady && !buildReady) {
  conclusion.push('结论: 代码已接入，但当前 shell/.env 既不能启用运行期上报，也不能上传 source map。')
}
else if (!runtimeReady) {
  conclusion.push('结论: 代码已接入，但当前 shell/.env 还不能启用运行期上报。')
}
else if (!buildReady) {
  conclusion.push('结论: 运行期上报已具备，source map 上传仍未就绪。')
}
else {
  conclusion.push('结论: 当前 shell/.env 已具备 staging 验收前置条件，可以继续做浏览器/Nitro/worker 三条验收。')
}

if (!runtimeChecks[0].ready || !runtimeChecks[1].ready) {
  conclusion.push('下一步: 在 staging / production 分别补齐 WINLOOP_SENTRY_DSN 与 WINLOOP_SENTRY_ENVIRONMENT。')
}

if (!buildReady) {
  conclusion.push('下一步: 在 GitHub Actions 可见范围内补齐 SENTRY_AUTH_TOKEN、WINLOOP_SENTRY_ORG、WINLOOP_SENTRY_PROJECT。')
}

if (runtimeReady && buildReady) {
  conclusion.push('下一步: 触发 staging 镜像构建，确认日志不再出现 Source map upload disabled warning。')
}

printSection('结论', conclusion)
