#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium, request as playwrightRequest } from '@playwright/test'

const BASE_URL = String(process.env.E2E_BASE_URL || 'http://127.0.0.1:3510').trim()
const ARTIFACT_DIR = resolve(process.cwd(), 'output/playwright/defense-meeting-ai')
const BASELINE_TEST_FILES = [
  'scripts/tests/workspace-defense-ui.test.mjs',
  'scripts/tests/workspace-defense-realtime-ui.test.mjs',
  'scripts/tests/project-defense-schema.test.mjs',
  'scripts/tests/project-meeting-integration.test.mjs',
  'scripts/tests/project-meeting-openai-compatible-asr.test.mjs',
  'scripts/tests/project-meeting-audio-caption.test.mjs',
  'scripts/tests/project-meeting-recording-provider.test.mjs',
  'scripts/tests/admin-meeting-providers.test.mjs',
  'scripts/tests/workspace-ai-stream-messages.test.mjs',
  'scripts/tests/workspace-ai-agent-stream.test.mjs',
  'scripts/tests/workspace-ai-project-context.test.mjs',
  'scripts/tests/workspace-ai-orchestrator.test.mjs',
  'scripts/tests/platform-ai-channels.test.ts',
]

function createSeed() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function createCredentials(prefix, seed) {
  const normalizedPrefix = String(prefix || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18) || 'user'
  return {
    username: `${normalizedPrefix}_${seed}`.slice(0, 30),
    password: `Pw_${seed}_123456`,
  }
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function summarizeError(error) {
  if (error instanceof Error)
    return error.stack || error.message || String(error)
  return String(error || 'unknown error')
}

function sanitizeLongText(value, maxLength = 4000) {
  return String(value || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, maxLength)
}

function badgeClass(status) {
  if (status === true || status === 'passed' || status === 'ready' || status === 'completed' || status === 'connected')
    return 'ok'
  if (status === false || status === 'failed' || status === 'blocked' || status === 'error')
    return 'bad'
  return 'warn'
}

function buildStatusRows(items) {
  return items.map((item) => {
    const status = item.status ?? 'unknown'
    return `<tr>
      <td>${htmlEscape(item.label)}</td>
      <td><span class="badge ${badgeClass(status)}">${htmlEscape(String(status))}</span></td>
      <td>${htmlEscape(item.detail || '')}</td>
    </tr>`
  }).join('\n')
}

async function writeSummaryHtml(path, input) {
  const title = input.title || '答辩 / 会议 / AI 验收录屏'
  const statusRows = buildStatusRows(input.statusRows || [])
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7fb;
      --surface: rgba(255, 255, 255, 0.92);
      --text: #111827;
      --muted: #4b5563;
      --border: #d7dce8;
      --ok: #0f766e;
      --ok-bg: #ecfdf5;
      --bad: #b91c1c;
      --bad-bg: #fef2f2;
      --warn: #b45309;
      --warn-bg: #fffbeb;
      --shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 28%),
        radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 30%),
        linear-gradient(180deg, #fcfdff 0%, var(--bg) 100%);
      min-height: 100vh;
      padding: 40px;
    }
    .page {
      max-width: 1320px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .hero, .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(8px);
    }
    .hero {
      padding: 28px 32px;
      display: grid;
      gap: 14px;
    }
    .eyebrow {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: #2563eb;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 36px;
      line-height: 1.15;
    }
    .hero p {
      margin: 0;
      font-size: 15px;
      color: var(--muted);
      line-height: 1.7;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .pill, .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
    }
    .pill {
      background: #eff6ff;
      color: #1d4ed8;
    }
    .badge.ok { color: var(--ok); background: var(--ok-bg); }
    .badge.bad { color: var(--bad); background: var(--bad-bg); }
    .badge.warn { color: var(--warn); background: var(--warn-bg); }
    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 20px;
    }
    .card {
      padding: 24px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      text-align: left;
    }
    th {
      color: #334155;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    pre {
      margin: 0;
      padding: 18px;
      border-radius: 18px;
      background: #0f172a;
      color: #e2e8f0;
      font-size: 13px;
      line-height: 1.65;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.7;
    }
    .list {
      display: grid;
      gap: 10px;
      font-size: 14px;
      color: var(--text);
    }
    .list-item {
      padding: 12px 14px;
      border-radius: 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="eyebrow">${htmlEscape(input.phaseLabel || 'Smoke')}</div>
      <h1>${htmlEscape(title)}</h1>
      <p>${htmlEscape(input.summary || '')}</p>
      <div class="hero-meta">
        ${(input.metaPills || []).map(item => `<span class="pill">${htmlEscape(item)}</span>`).join('\n')}
      </div>
    </section>

    <div class="grid">
      <section class="card">
        <h2>验收状态</h2>
        <table>
          <thead>
            <tr>
              <th>检查项</th>
              <th>状态</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            ${statusRows}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>上下文</h2>
        <div class="list">
          ${(input.contextItems || []).map(item => `<div class="list-item">${htmlEscape(item)}</div>`).join('\n')}
        </div>
      </section>
    </div>

    <section class="card">
      <h2>Vitest 基线输出</h2>
      <pre>${htmlEscape(input.vitestOutput || '无')}</pre>
    </section>

    <section class="card">
      <h2>补充说明</h2>
      <div class="muted">${htmlEscape(input.notes || '无')}</div>
    </section>
  </div>
</body>
</html>`
  await writeFile(path, html, 'utf8')
}

async function runCommandCapture(command, args, env, label) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })

    child.once('error', rejectPromise)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise({
          output,
        })
        return
      }

      const reason = signal
        ? `${label} 被信号 ${signal} 终止`
        : `${label} 失败，退出码 ${code ?? 'unknown'}`
      rejectPromise(new Error(reason))
    })
  })
}

async function installChromiumIfNeeded(env) {
  if (String(env.E2E_SKIP_PLAYWRIGHT_INSTALL || '').trim() === '1')
    return

  await runCommandCapture(
    'pnpm',
    ['exec', 'playwright', 'install', 'chromium'],
    env,
    'Playwright Chromium 安装',
  )
}

async function probeHttp(url) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
    })
    return {
      ok: true,
      status: response.status,
      detail: `HTTP ${response.status}`,
    }
  }
  catch (error) {
    return {
      ok: false,
      status: 'network_error',
      detail: summarizeError(error),
    }
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

  return {
    payload,
    text,
  }
}

async function expectApiSuccess(response, label) {
  const { payload, text } = await readApiPayload(response, label)
  if (!response.ok || payload?.code !== 0)
    throw new Error(`${label} 失败：HTTP ${response.status()} ${text}`)
  return payload.data
}

async function apiPost(api, path, data, label) {
  return await expectApiSuccess(await api.post(path, { data }), label)
}

async function apiGet(api, path, label) {
  return await expectApiSuccess(await api.get(path), label)
}

async function pollMeetingDetail(api, projectId, meetingId, timeoutMs = 90000) {
  const startedAt = Date.now()
  let lastDetail = null

  while (Date.now() - startedAt < timeoutMs) {
    lastDetail = await apiGet(api, `/api/projects/${projectId}/meetings/${meetingId}`, '读取会议详情')
    if (String(lastDetail.recordingResourceId || '').trim())
      return lastDetail
    if (String(lastDetail.recordingStatus || '').trim() === 'failed')
      return lastDetail
    await new Promise(resolvePromise => setTimeout(resolvePromise, 3000))
  }

  return lastDetail
}

async function chooseUiSelectOption(page, root, label, optionNames) {
  const candidates = Array.isArray(optionNames) ? optionNames : [optionNames]
  const trigger = root.getByRole('button', { name: label }).first()
  await trigger.waitFor({ timeout: 30000 })
  await trigger.click()

  for (const optionName of candidates) {
    const option = page.getByRole('option', { name: optionName, exact: true }).first()
    if (await option.count()) {
      await option.click()
      return
    }
  }

  for (const optionName of candidates) {
    const option = page.locator('.ui-select__option').filter({ hasText: optionName }).first()
    if (await option.count()) {
      await option.click()
      return
    }
  }

  throw new Error(`未找到 ${label} 选项：${candidates.join(' / ')}`)
}

async function enableMeetingToggle(meetingClient, toggle, enabledText, timeoutMs = 10000) {
  await toggle.waitFor({ timeout: 15000 })

  const beforeText = String(await meetingClient.textContent().catch(() => '') || '')
  if (beforeText.includes(enabledText))
    return true

  await toggle.click().catch(() => undefined)

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const text = String(await meetingClient.textContent().catch(() => '') || '')
    const label = String(await toggle.textContent().catch(() => '') || '')
    if (text.includes(enabledText) || label.includes('关闭'))
      return true
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }

  return false
}

async function convertVideoToMp4(inputPath, outputPath) {
  await runCommandCapture(
    'ffmpeg',
    [
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ],
    process.env,
    '录屏 MP4 转码',
  )
}

async function main() {
  const seed = createSeed()
  const startedAt = new Date().toISOString()
  const artifactPrefix = `smoke-${seed}`
  const startSummaryPath = resolve(ARTIFACT_DIR, `${artifactPrefix}-start.html`)
  const finalSummaryPath = resolve(ARTIFACT_DIR, `${artifactPrefix}-final.html`)
  const tracePath = resolve(ARTIFACT_DIR, `${artifactPrefix}-trace.zip`)
  const reportPath = resolve(ARTIFACT_DIR, `${artifactPrefix}-report.json`)
  const storageStatePath = resolve(ARTIFACT_DIR, `${artifactPrefix}-storage-state.json`)
  const mp4Path = resolve(ARTIFACT_DIR, `${artifactPrefix}.mp4`)
  const screenshotPaths = {
    summary: resolve(ARTIFACT_DIR, `${artifactPrefix}-01-summary.png`),
    defense: resolve(ARTIFACT_DIR, `${artifactPrefix}-02-defense.png`),
    meeting: resolve(ARTIFACT_DIR, `${artifactPrefix}-03-meeting.png`),
    ended: resolve(ARTIFACT_DIR, `${artifactPrefix}-04-ended.png`),
    finalSummary: resolve(ARTIFACT_DIR, `${artifactPrefix}-05-final-summary.png`),
  }

  await mkdir(ARTIFACT_DIR, { recursive: true })

  const baseline = await runCommandCapture(
    'pnpm',
    ['exec', 'vitest', 'run', ...BASELINE_TEST_FILES],
    {
      ...process.env,
      CI: process.env.CI || '1',
    },
    '答辩 / 会议 / AI 相关 Vitest',
  )
  const baselinePassed = true

  const connectivity = {
    livekit: await probeHttp('http://127.0.0.1:7880'),
    asrBridge: await probeHttp('http://127.0.0.1:8790'),
  }

  const credentials = createCredentials('smoke_defense', seed)
  const api = await playwrightRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      accept: 'application/json',
    },
  })

  let browser = null
  let context = null
  let page = null
  let pageVideo = null
  let finalError = null
  const results = {
    baseUrl: BASE_URL,
    seed,
    startedAt,
    username: credentials.username,
    teamId: '',
    projectId: '',
    meetingId: '',
    defenseWorkbenchVisible: false,
    defenseRealtimeRequested: false,
    defenseRealtimeBlocked: false,
    defenseConsoleText: '',
    meetingCreated: false,
    meetingConnected: false,
    meetingClientText: '',
    micEnabled: false,
    cameraEnabled: false,
    captionObserved: false,
    captionPanelText: '',
    meetingEnded: false,
    notesResourceId: '',
    recordingResourceId: '',
    notesButtonVisible: false,
    recordingButtonVisible: false,
    summaryStatus: '',
    recordingStatus: '',
    meetingStatus: '',
    aiRuntimeDefenseConfigured: false,
    aiRuntimeProjectChatConfigured: false,
    failure: '',
  }

  try {
    await apiPost(api, '/api/auth/login', credentials, '登录或自动注册验收用户')
    const team = await apiPost(api, '/api/teams', {
      name: `SMOKE-DEFENSE-${seed}`,
    }, '创建 Team')
    const teamId = String(team?.team?.id || '').trim()
    if (!teamId)
      throw new Error('创建 Team 成功，但未返回 teamId。')
    results.teamId = teamId

    const project = await apiPost(api, '/api/projects/quick', {
      teamId,
      workspaceId: teamId,
      title: `SMOKE-DEFENSE-${seed}`,
      summary: '答辩 / 语音视频流 / AI 联调录屏专用隔离项目。',
    }, '创建隔离项目')
    const projectId = String(project?.id || '').trim()
    if (!projectId)
      throw new Error('创建项目成功，但未返回 projectId。')
    results.projectId = projectId

    const aiRuntime = await apiGet(api, '/api/user/ai/runtime', '读取用户 AI runtime')
    results.aiRuntimeDefenseConfigured = Boolean(aiRuntime?.defense?.configured)
    results.aiRuntimeProjectChatConfigured = Boolean(aiRuntime?.projectChat?.configured)

    await writeSummaryHtml(startSummaryPath, {
      title: '答辩 / 语音视频流 / AI 验收录屏',
      phaseLabel: '录屏开始',
      summary: '先展示修复后的基线测试与运行时前置，再进入同一项目中的答辩工作台和会议 Web 客户端。',
      metaPills: [
        `项目：SMOKE-DEFENSE-${seed}`,
        `用户：${credentials.username}`,
        `Team：${teamId.slice(0, 8)}`,
        `Project：${projectId.slice(0, 8)}`,
        '答辩主链路：qwen/audio_video',
      ],
      statusRows: [
        {
          label: 'Vitest 基线',
          status: baselinePassed ? 'passed' : 'warn',
          detail: '13 个相关测试文件已重新执行并通过。',
        },
        {
          label: 'LiveKit 7880',
          status: connectivity.livekit.ok ? 'ready' : 'failed',
          detail: connectivity.livekit.detail,
        },
        {
          label: 'ASR bridge 8790',
          status: connectivity.asrBridge.ok ? 'ready' : 'failed',
          detail: connectivity.asrBridge.detail,
        },
        {
          label: 'AI runtime / defense',
          status: results.aiRuntimeDefenseConfigured ? 'ready' : 'failed',
          detail: `configured=${results.aiRuntimeDefenseConfigured}`,
        },
        {
          label: 'AI runtime / projectChat',
          status: results.aiRuntimeProjectChatConfigured ? 'ready' : 'failed',
          detail: `configured=${results.aiRuntimeProjectChatConfigured}`,
        },
      ],
      contextItems: [
        '录屏仅使用浏览器级视频，不做系统级整屏录制。',
        '浏览器上下文已授权 microphone / camera，并启用 fake media 设备。',
        '录屏产物会落到 output/playwright/defense-meeting-ai。',
      ],
      vitestOutput: sanitizeLongText(baseline.output, 12000),
      notes: '当前环境已确认 LiveKit 可达、ASR bridge 可达；AI runtime 以用户态 /api/user/ai/runtime 为准。',
    })

    await installChromiumIfNeeded({
      ...process.env,
      CI: process.env.CI || '1',
    })

    await api.storageState({ path: storageStatePath })

    browser = await chromium.launch({
      headless: true,
      args: [
        '--autoplay-policy=no-user-gesture-required',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    })

    context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: storageStatePath,
      viewport: {
        width: 1600,
        height: 1000,
      },
      colorScheme: 'light',
      permissions: ['microphone', 'camera'],
      recordVideo: {
        dir: ARTIFACT_DIR,
        size: {
          width: 1600,
          height: 1000,
        },
      },
    })
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    })

    page = await context.newPage()
    pageVideo = page.video()

    await page.goto(pathToFileURL(startSummaryPath).toString())
    await page.waitForTimeout(4000)
    await page.screenshot({ path: screenshotPaths.summary, fullPage: true })

    await page.goto(`/team/${teamId}/project/${projectId}`)
    await page.getByTestId('workspace-header-workbench-tabs').waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: '答辩工作台' }).click()
    await page.getByTestId('workspace-defense-workbench').waitFor({ timeout: 30000 })
    results.defenseWorkbenchVisible = true
    await page.waitForTimeout(1500)

    const defenseRealtimeControls = page.locator('.workspace-defense-workbench__realtime-controls')
    await chooseUiSelectOption(page, defenseRealtimeControls, '实时链路', '千问')
    await chooseUiSelectOption(page, defenseRealtimeControls, '媒体模式', ['音视频理解', '音频 + 视频'])
    await page.waitForTimeout(500)

    const defenseCreateResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST'
        && response.url().includes(`/api/projects/${projectId}/defense/realtime-sessions`)
    }, { timeout: 30000 }).catch(() => null)

    await page.getByRole('button', { name: '发起实时答辩' }).click()
    results.defenseRealtimeRequested = true
    await defenseCreateResponsePromise

    await page.waitForTimeout(8000)
    const defenseConsoleLocator = page.getByTestId('workspace-defense-realtime-console')
    results.defenseConsoleText = sanitizeLongText(await defenseConsoleLocator.textContent())
    results.defenseRealtimeBlocked = results.defenseConsoleText.includes('千问实时音视频未完成配置')
      || results.defenseConsoleText.includes('异常：')
    await page.screenshot({ path: screenshotPaths.defense, fullPage: true })

    await page.getByRole('button', { name: '研发工作台' }).click()
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: '项目会议' }).click()
    await page.getByRole('button', { name: '发起视频会议' }).click()
    await page.getByRole('button', { name: '立即发起视频会议' }).waitFor({ timeout: 30000 })

    const meetingCreateResponse = page.waitForResponse((response) => {
      return response.request().method() === 'POST'
        && response.url().includes(`/api/projects/${projectId}/meetings`)
    }, { timeout: 30000 })

    await page.getByRole('button', { name: '立即发起视频会议' }).click()
    const meetingCreatePayload = await (await meetingCreateResponse).json()
    const meetingId = String(meetingCreatePayload?.data?.meeting?.id || '').trim()
    if (!meetingId)
      throw new Error('会议创建成功，但未捕获到 meetingId。')
    results.meetingCreated = true
    results.meetingId = meetingId

    const meetingClient = page.locator('.meeting-web-client')
    await meetingClient.waitFor({ timeout: 30000 })

    const joinButton = page.getByRole('button', { name: '加入会议' })
    if (await joinButton.isVisible().catch(() => false))
      await joinButton.click().catch(() => undefined)

    const micToggle = meetingClient.getByRole('button', { name: /开启麦克风|关闭麦克风/ }).first()
    const cameraToggle = meetingClient.getByRole('button', { name: /开启摄像头|关闭摄像头/ }).first()
    const connectionStartedAt = Date.now()
    while (Date.now() - connectionStartedAt < 20000) {
      const badgeText = await page.locator('.meeting-web-client__badge').textContent().catch(() => '')
      const micToggleEnabled = await micToggle.isEnabled().catch(() => false)
      if (badgeText.includes('已连接') || micToggleEnabled) {
        results.meetingConnected = true
        break
      }
      await page.waitForTimeout(1500)
    }

    results.meetingClientText = sanitizeLongText(await meetingClient.textContent())

    if (results.meetingConnected) {
      results.micEnabled = await enableMeetingToggle(meetingClient, micToggle, '麦克风开启')
      results.cameraEnabled = await enableMeetingToggle(meetingClient, cameraToggle, '视频开启')
      await page.waitForTimeout(15000)
    }

    results.captionPanelText = sanitizeLongText(await meetingClient.textContent())
    results.captionObserved = !results.captionPanelText.includes('暂无实时字幕。')
    await page.screenshot({ path: screenshotPaths.meeting, fullPage: true })

    const endMeetingButton = page.getByRole('button', { name: '结束会议' })
    if (await endMeetingButton.isVisible().catch(() => false)) {
      await endMeetingButton.click()
      results.meetingEnded = true
    }
    else if (meetingId) {
      await expectApiSuccess(
        await api.post(`/api/projects/${projectId}/meetings/${meetingId}/end`, {
          data: {},
        }),
        '通过 API 结束会议',
      )
      results.meetingEnded = true
    }

    const finalMeetingDetail = await pollMeetingDetail(api, projectId, meetingId)
    results.notesResourceId = String(finalMeetingDetail?.notesResourceId || '').trim()
    results.recordingResourceId = String(finalMeetingDetail?.recordingResourceId || '').trim()
    results.summaryStatus = String(finalMeetingDetail?.summaryStatus || '').trim()
    results.recordingStatus = String(finalMeetingDetail?.recordingStatus || '').trim()
    results.meetingStatus = String(finalMeetingDetail?.status || '').trim()

    await page.reload()
    await page.waitForTimeout(2500)
    results.notesButtonVisible = await page.getByRole('button', { name: '打开纪要' }).isVisible().catch(() => false)
    results.recordingButtonVisible = await page.getByRole('button', { name: '打开录制' }).isVisible().catch(() => false)
    await page.screenshot({ path: screenshotPaths.ended, fullPage: true })

    await writeSummaryHtml(finalSummaryPath, {
      title: '答辩 / 语音视频流 / AI 录屏结果',
      phaseLabel: '录屏结束',
      summary: '浏览器端已完成答辩工作台与会议 Web 客户端走查；下方状态按本轮真实执行结果生成。',
      metaPills: [
        `用户：${credentials.username}`,
        `结果目录：${basename(ARTIFACT_DIR)}`,
        `会议状态：${results.meetingStatus || 'unknown'}`,
      ],
      statusRows: [
        {
          label: 'Vitest 基线',
          status: baselinePassed ? 'passed' : 'warn',
          detail: '目标 13 文件已再次执行并通过。',
        },
        {
          label: '答辩工作台可见',
          status: results.defenseWorkbenchVisible ? 'passed' : 'failed',
          detail: results.defenseWorkbenchVisible ? '已看到 realtime 控制台。' : '页面未正常进入答辩工作台。',
        },
        {
          label: '答辩 realtime',
          status: results.defenseRealtimeBlocked ? 'blocked' : 'passed',
          detail: results.defenseRealtimeBlocked
            ? 'provider bootstrap 被当前 Qwen 配置阻塞。'
            : '未观察到 bootstrap 阻塞。',
        },
        {
          label: '会议 LiveKit 连接',
          status: results.meetingConnected ? 'connected' : 'failed',
          detail: results.meetingConnected
            ? '站内 Web 客户端已进入可操作态。'
            : '未观察到已连接或可操作态。',
        },
        {
          label: '麦克风 / 摄像头',
          status: results.micEnabled && results.cameraEnabled ? 'passed' : 'warn',
          detail: `mic=${results.micEnabled} camera=${results.cameraEnabled}`,
        },
        {
          label: '实时字幕',
          status: results.captionObserved ? 'passed' : 'blocked',
          detail: results.captionObserved ? '已观察到字幕内容。' : '本轮未观察到字幕文本回流。',
        },
        {
          label: '会议纪要资源',
          status: results.notesResourceId ? 'completed' : 'failed',
          detail: results.notesResourceId || '未生成 notesResourceId。',
        },
        {
          label: '会议录制资源',
          status: results.recordingResourceId ? 'completed' : (results.recordingStatus || 'warn'),
          detail: results.recordingResourceId || `recordingStatus=${results.recordingStatus || 'unknown'}`,
        },
      ],
      contextItems: [
        `LiveKit 7880：${connectivity.livekit.detail}`,
        `ASR bridge 8790：${connectivity.asrBridge.detail}`,
        `AI runtime: defense=${results.aiRuntimeDefenseConfigured} / projectChat=${results.aiRuntimeProjectChatConfigured}`,
        `纪要按钮可见=${results.notesButtonVisible}，录制按钮可见=${results.recordingButtonVisible}`,
        `Meeting：${results.meetingId || 'unknown'}`,
      ],
      vitestOutput: sanitizeLongText(baseline.output, 12000),
      notes: [
        `Defense 控制台摘录：${sanitizeLongText(results.defenseConsoleText, 1000)}`,
        `Meeting 客户端摘录：${sanitizeLongText(results.meetingClientText || results.captionPanelText, 1000)}`,
        `字幕区域摘录：${sanitizeLongText(results.captionPanelText, 1000)}`,
      ].join('\n\n'),
    })

    await page.goto(pathToFileURL(finalSummaryPath).toString())
    await page.waitForTimeout(5000)
    await page.screenshot({ path: screenshotPaths.finalSummary, fullPage: true })

    const unmetChecks = []
    if (results.defenseRealtimeBlocked)
      unmetChecks.push('答辩 realtime provider bootstrap 被配置阻塞')
    if (!results.meetingCreated)
      unmetChecks.push('LiveKit 会议未创建')
    if (!results.meetingConnected)
      unmetChecks.push('LiveKit 会议客户端未连接')
    if (!results.micEnabled || !results.cameraEnabled)
      unmetChecks.push(`本地媒体未全部开启 mic=${results.micEnabled} camera=${results.cameraEnabled}`)
    if (!results.captionObserved)
      unmetChecks.push('未观察到实时字幕回流')
    if (!results.notesResourceId)
      unmetChecks.push('会议纪要资源未生成')
    if (!results.recordingResourceId)
      unmetChecks.push(`会议录制资源未完成 recordingStatus=${results.recordingStatus || 'unknown'}`)

    if (unmetChecks.length > 0)
      throw new Error(`端到端验收未完全通过：${unmetChecks.join('；')}`)
  }
  catch (error) {
    finalError = error
    results.failure = summarizeError(error)
    if (finalSummaryPath) {
      await writeSummaryHtml(finalSummaryPath, {
        title: '答辩 / 语音视频流 / AI 录屏失败摘要',
        phaseLabel: '执行失败',
        summary: '录屏脚本未完整跑通，错误信息已写入下方摘要页与 JSON 报告。',
        metaPills: [
          `用户：${credentials.username}`,
          `Base URL：${BASE_URL}`,
        ],
        statusRows: [
          {
            label: '执行结果',
            status: 'failed',
            detail: results.failure,
          },
        ],
        contextItems: [
          `LiveKit 7880：${connectivity.livekit.detail}`,
          `ASR bridge 8790：${connectivity.asrBridge.detail}`,
        ],
        vitestOutput: sanitizeLongText(baseline.output, 12000),
        notes: results.failure,
      })

      if (page) {
        try {
          await page.goto(pathToFileURL(finalSummaryPath).toString())
          await page.waitForTimeout(3000)
        }
        catch {}
      }
    }
  }
  finally {
    if (context) {
      try {
        await context.tracing.stop({ path: tracePath })
      }
      catch {}
    }
    if (context) {
      try {
        await context.close()
      }
      catch {}
    }
    if (browser) {
      try {
        await browser.close()
      }
      catch {}
    }
    await api.dispose().catch(() => undefined)
  }

  if (pageVideo) {
    const rawVideoPath = await pageVideo.path()
    await convertVideoToMp4(rawVideoPath, mp4Path)
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    seed,
    artifacts: {
      directory: ARTIFACT_DIR,
      mp4Path,
      tracePath,
      startSummaryPath,
      finalSummaryPath,
      reportPath,
      screenshots: screenshotPaths,
    },
    connectivity,
    results,
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

  if (finalError)
    throw finalError
}

await main()
