import { getFeishuTenantAccessToken } from '~~/server/services/feishu/client'
import {
  resolveFeishuStartupBuildInfo,
  sendFeishuStartupNotifyMessage,
} from '~~/server/services/feishu/startup-notify'
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

    const { version, commitSha } = resolveFeishuStartupBuildInfo({
      runtimeVersion: runtime.build.version,
      runtimeCommitSha: runtime.build.commitSha,
      fallbackVersion: config.startupFallbackVersion,
      fallbackCommitSha: config.startupFallbackCommitSha,
    })
    if (!version || !commitSha) {
      console.warn('[feishu-startup-notify] version or commit sha is empty, skip.', {
        hasVersion: Boolean(version),
        hasCommitSha: Boolean(commitSha),
      })
      return
    }

    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    await sendFeishuStartupNotifyMessage({
      tenantAccessToken,
      chatId,
      version,
      commitSha,
      remark: toText(config.startupNotifyRemark),
      timestamp: new Date().toISOString(),
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
