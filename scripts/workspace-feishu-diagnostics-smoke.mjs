#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { resolveSmokeServerOptions, startSmokeServer, stopServer } from './utils/smoke-server.mjs'

const DEFAULT_ARTIFACT_DIR = 'output/playwright/workspace-feishu-diagnostics'
const DEFAULT_PASSWORD = 'codex123456'
const REQUIRED_PANEL_TEXTS = ['健康诊断', '最近同步', '自动登录', '审计日志']
const REQUIRED_SNAPSHOT_KEYS = ['diagnosticSummary', 'memberSyncSummary', 'autoLoginSummary', 'auditLogs']

function assert(condition, message) {
  if (!condition)
    throw new Error(message)
}

function normalizeBaseURL(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '')
  if (!normalized)
    return ''

  const url = new URL(normalized)
  return url.toString().replace(/\/+$/, '')
}

function createCredentials() {
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return {
    username: `pw_feishu_${seed}`.slice(0, 30),
    password: DEFAULT_PASSWORD,
  }
}

async function readApiPayload(response, label) {
  const text = await response.text()
  let payload = null

  try {
    payload = JSON.parse(text)
  }
  catch {
    throw new Error(`${label} 返回了非 JSON 响应：${text.slice(0, 500)}`)
  }

  assert(response.ok(), `${label} HTTP ${response.status()}：${text.slice(0, 500)}`)
  assert(payload?.code === 0, `${label} code 非 0：${text.slice(0, 500)}`)
  return payload.data
}

function resolveWorkspaceId(authData) {
  const workspaces = Array.isArray(authData?.workspaces) ? authData.workspaces : []
  const teams = Array.isArray(authData?.teams) ? authData.teams : []
  const ownerUserId = String(authData?.user?.id || '').trim()
  const personal = workspaces.find(item => item?.workspace?.type === 'personal' && item?.workspace?.ownerUserId === ownerUserId)

  return String(
    personal?.workspace?.id
    || workspaces[0]?.workspace?.id
    || teams[0]?.team?.id
    || '',
  ).trim()
}

async function launchBrowser() {
  const headless = String(process.env.FEISHU_DIAGNOSTICS_SMOKE_HEADLESS || '1') !== '0'
  const channel = String(process.env.FEISHU_DIAGNOSTICS_SMOKE_CHROME_CHANNEL || 'chrome').trim()

  if (channel) {
    try {
      return await chromium.launch({ headless, channel })
    }
    catch (error) {
      console.warn(`[workspace-feishu-diagnostics] Chrome channel ${channel} 启动失败，回退 Playwright Chromium：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return chromium.launch({ headless })
}

async function maybeStartServer() {
  const explicitBaseURL = normalizeBaseURL(process.env.E2E_BASE_URL || process.env.FEISHU_DIAGNOSTICS_SMOKE_BASE_URL)
  if (explicitBaseURL) {
    return {
      baseURL: explicitBaseURL,
      server: null,
      healthEndpoint: '',
    }
  }

  const options = resolveSmokeServerOptions(process.env)
  const smokeServer = await startSmokeServer(options)
  return {
    baseURL: options.baseURL,
    server: smokeServer.server,
    healthEndpoint: smokeServer.healthEndpoint,
  }
}

async function openThirdPartyPanel(page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined)
  await page.waitForTimeout(1500)

  const settingsButton = page.locator('button[title="个人设置"]').first()
  await settingsButton.waitFor({ state: 'visible', timeout: 25000 })
  await settingsButton.click({ force: true })
  await page.waitForTimeout(800)

  if (await page.locator('.user-settings-nav').count() === 0) {
    await settingsButton.evaluate((element) => {
      if (element instanceof HTMLElement)
        element.click()
    })
  }

  await page.locator('.user-settings-nav').waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('button.user-settings-tab').filter({ hasText: '第三方平台' }).click()
  await page.locator('[data-testid="user-settings-third-party-platforms-panel"]').waitFor({ state: 'visible', timeout: 20000 })
}

async function run() {
  const artifactDir = String(process.env.FEISHU_DIAGNOSTICS_SMOKE_ARTIFACT_DIR || DEFAULT_ARTIFACT_DIR).trim()
  await mkdir(artifactDir, { recursive: true })

  const runtime = await maybeStartServer()
  let browser = null

  try {
    if (runtime.healthEndpoint)
      console.log(`[workspace-feishu-diagnostics] server ready: ${runtime.healthEndpoint}`)
    else
      console.log(`[workspace-feishu-diagnostics] using server: ${runtime.baseURL}`)

    browser = await launchBrowser()
    const context = await browser.newContext({
      baseURL: runtime.baseURL,
      viewport: { width: 1440, height: 980 },
    })
    const page = await context.newPage()
    const browserEvents = []

    page.on('pageerror', (error) => {
      browserEvents.push({ type: 'pageerror', text: error.message.slice(0, 300) })
    })
    page.on('response', (response) => {
      if (response.status() >= 500)
        browserEvents.push({ type: 'http', status: response.status(), url: response.url() })
    })

    const credentials = createCredentials()
    const authData = await readApiPayload(
      await page.request.post('/api/auth/login', { data: credentials }),
      `登录用户 ${credentials.username}`,
    )
    const workspaceId = resolveWorkspaceId(authData)
    assert(workspaceId, '登录结果未返回可用 workspaceId')

    await openThirdPartyPanel(page)

    const panel = page.locator('[data-testid="user-settings-third-party-platforms-panel"]')
    const panelText = await panel.textContent() || ''
    for (const text of REQUIRED_PANEL_TEXTS)
      assert(panelText.includes(text), `第三方平台面板缺少文案：${text}`)

    const snapshot = await readApiPayload(
      await page.request.get(`/api/teams/${workspaceId}/integrations/feishu`),
      '读取飞书第三方平台 snapshot',
    )
    for (const key of REQUIRED_SNAPSHOT_KEYS)
      assert(Object.hasOwn(snapshot || {}, key), `飞书 snapshot 缺少字段：${key}`)

    await page.screenshot({
      path: `${artifactDir}/third-party-panel.png`,
      fullPage: true,
    })

    assert(browserEvents.length === 0, `浏览器检测到服务端错误：${JSON.stringify(browserEvents.slice(0, 5))}`)

    console.log(JSON.stringify({
      ok: true,
      baseURL: runtime.baseURL,
      username: credentials.username,
      workspaceId,
      panel: {
        health: panelText.includes('健康诊断'),
        sync: panelText.includes('最近同步'),
        autoLogin: panelText.includes('自动登录'),
        audit: panelText.includes('审计日志'),
      },
      snapshotKeys: REQUIRED_SNAPSHOT_KEYS,
      screenshot: `${artifactDir}/third-party-panel.png`,
    }, null, 2))
  }
  catch (error) {
    console.error(`[workspace-feishu-diagnostics] failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
  finally {
    if (browser)
      await browser.close()
    if (runtime.server)
      await stopServer(runtime.server)
  }
}

await run()
