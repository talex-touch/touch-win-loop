import { sendFeishuChatTextMessage } from '~~/server/services/feishu/client'

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

export function resolveFeishuStartupBuildInfo(input: {
  runtimeVersion?: string
  runtimeCommitSha?: string
}): {
  version: string
  commitSha: string
} {
  const version = toText(input.runtimeVersion)
  const commitSha = toText(input.runtimeCommitSha)
  return {
    version,
    commitSha,
  }
}

export function buildFeishuStartupNotifyMessage(input: {
  version: string
  commitSha: string
  remark?: string
  timestamp: string
  test?: boolean
}): string {
  const lines = [
    input.test ? 'WinLoop 启动通知测试' : 'WinLoop 启动通知',
    `时间：${input.timestamp}`,
    `版本：${input.version}`,
    `Commit：${input.commitSha}`,
  ]
  if (input.remark)
    lines.push(`备注：${input.remark}`)
  return lines.join('\n')
}

export async function sendFeishuStartupNotifyMessage(input: {
  tenantAccessToken: string
  chatId: string
  version: string
  commitSha: string
  remark?: string
  timestamp?: string
  test?: boolean
}): Promise<void> {
  const text = buildFeishuStartupNotifyMessage({
    version: toText(input.version),
    commitSha: toText(input.commitSha),
    remark: toText(input.remark),
    timestamp: toText(input.timestamp) || new Date().toISOString(),
    test: input.test === true,
  })

  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sendFeishuChatTextMessage({
        tenantAccessToken: input.tenantAccessToken,
        chatId: toText(input.chatId),
        text,
      })
      return
    }
    catch (error) {
      if (attempt >= maxAttempts)
        throw error
      await sleep(300 * (2 ** (attempt - 1)))
    }
  }
}
