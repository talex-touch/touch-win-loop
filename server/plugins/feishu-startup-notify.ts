import {
  getFeishuTenantAccessToken,
  sendFeishuChatTextMessage,
} from '~~/server/services/feishu/client'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'

const FEISHU_STARTUP_NOTIFY_RUNTIME_KEY = Symbol.for('winloop.feishu.startup-notify.runtime.v1')

interface FeishuStartupNotifyRuntimeState {
  booted: boolean
  notifying: boolean
}

function getStartupNotifyRuntimeState(): FeishuStartupNotifyRuntimeState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[FEISHU_STARTUP_NOTIFY_RUNTIME_KEY] as FeishuStartupNotifyRuntimeState | undefined
  if (existing)
    return existing

  const created: FeishuStartupNotifyRuntimeState = {
    booted: false,
    notifying: false,
  }
  globalRef[FEISHU_STARTUP_NOTIFY_RUNTIME_KEY] = created
  return created
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return String(error.message || 'unknown error')
  return String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

function buildStartupMessage(input: {
  version: string
  commitSha: string
  remark: string
  timestamp: string
}): string {
  const lines = [
    'WinLoop 启动通知',
    `时间：${input.timestamp}`,
    `版本：${input.version}`,
    `Commit：${input.commitSha}`,
  ]
  if (input.remark)
    lines.push(`备注：${input.remark}`)
  return lines.join('\n')
}

async function sendWithRetry(input: {
  tenantAccessToken: string
  chatId: string
  text: string
}): Promise<void> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sendFeishuChatTextMessage(input)
      return
    }
    catch (error) {
      if (attempt >= maxAttempts)
        throw error
      await sleep(300 * (2 ** (attempt - 1)))
    }
  }
}

async function runStartupNotify(): Promise<void> {
  const runtimeState = getStartupNotifyRuntimeState()
  if (runtimeState.notifying)
    return

  runtimeState.notifying = true
  try {
    const runtime = readRuntimeSettings()
    const config = await withClient(undefined, async db => readFeishuIntegrationConfig(db))
    if (!config.enabled || !config.startupNotifyEnabled)
      return

    const chatId = toText(config.startupNotifyChatId)
    if (!chatId) {
      console.warn('[feishu-startup-notify] startupNotifyEnabled=true but startupNotifyChatId is empty, skip.')
      return
    }

    const version = toText(runtime.build.version) || toText(config.startupFallbackVersion)
    const commitSha = toText(runtime.build.commitSha) || toText(config.startupFallbackCommitSha)
    if (!version || !commitSha) {
      console.warn('[feishu-startup-notify] version or commit sha is empty, skip.', {
        hasVersion: Boolean(version),
        hasCommitSha: Boolean(commitSha),
      })
      return
    }

    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const text = buildStartupMessage({
      version,
      commitSha,
      remark: toText(config.startupNotifyRemark),
      timestamp: new Date().toISOString(),
    })

    await sendWithRetry({
      tenantAccessToken,
      chatId,
      text,
    })
  }
  catch (error) {
    console.error('[feishu-startup-notify] startup notification failed:', toErrorMessage(error))
  }
  finally {
    runtimeState.notifying = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  const runtimeState = getStartupNotifyRuntimeState()
  if (runtimeState.booted)
    return

  runtimeState.booted = true
  void runStartupNotify()

  nitroApp.hooks.hookOnce('close', () => {
    runtimeState.booted = false
    runtimeState.notifying = false
  })
})
