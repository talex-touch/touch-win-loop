import { setResponseStatus } from 'h3'
import { getFeishuTenantAccessToken } from '~~/server/services/feishu/client'
import {
  resolveFeishuStartupBuildInfo,
  sendFeishuStartupNotifyMessage,
} from '~~/server/services/feishu/startup-notify'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface StartupNotifyTestBody {
  chatId?: string
  remark?: string
  fallbackVersion?: string
  fallbackCommitSha?: string
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试启动通知。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40448)
  }

  const body = await readBody<StartupNotifyTestBody>(event).catch(() => ({} as StartupNotifyTestBody))
  const config = await withClient(event, async db => readFeishuIntegrationConfig(db))
  if (!config.enabled || !config.appId || !config.appSecret) {
    setResponseStatus(event, 400)
    return fail('飞书集成未启用或应用配置不完整，无法发送测试消息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40048)
  }

  const chatId = toText(body.chatId) || toText(config.startupNotifyChatId)
  if (!chatId) {
    setResponseStatus(event, 400)
    return fail('请先填写群 chat_id，再执行测试。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40049)
  }

  const { version, commitSha } = resolveFeishuStartupBuildInfo({
    runtimeVersion: runtime.build.version,
    runtimeCommitSha: runtime.build.commitSha,
    fallbackVersion: toText(body.fallbackVersion) || toText(config.startupFallbackVersion),
    fallbackCommitSha: toText(body.fallbackCommitSha) || toText(config.startupFallbackCommitSha),
  })
  if (!version || !commitSha) {
    setResponseStatus(event, 400)
    return fail('当前缺少版本号或 Commit SHA，无法发送测试消息。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40050)
  }

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    await sendFeishuStartupNotifyMessage({
      tenantAccessToken,
      chatId,
      version,
      commitSha,
      remark: toText(body.remark) || toText(config.startupNotifyRemark),
      timestamp: new Date().toISOString(),
      test: true,
    })

    return ok({
      chatId,
      version,
      commitSha,
      testedAt: new Date().toISOString(),
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || '启动通知测试失败。'), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50248)
  }
})
