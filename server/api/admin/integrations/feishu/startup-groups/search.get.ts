import type { FeishuChatCandidate } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import {
  getFeishuChatById,
  getFeishuTenantAccessToken,
  searchFeishuChats,
} from '~~/server/services/feishu/client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function mergeChatCandidates(items: Array<FeishuChatCandidate | null | undefined>): FeishuChatCandidate[] {
  const seen = new Set<string>()
  const result: FeishuChatCandidate[] = []
  for (const item of items) {
    const chatId = toText(item?.chatId)
    if (!chatId || seen.has(chatId))
      continue
    seen.add(chatId)
    result.push(item as FeishuChatCandidate)
  }
  return result
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canAssign = await checkPlatformPermission(event, user, 'role.assign')
  if (!canAssign) {
    setResponseStatus(event, 403)
    return fail('当前用户无权搜索飞书群。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40447)
  }

  const keyword = toText(getQuery(event).keyword)
  const chatId = toText(getQuery(event).chatId)
  const limit = Math.max(1, Math.min(50, Number(getQuery(event).limit || 20)))
  const config = await withClient(event, async db => readFeishuIntegrationConfig(db))

  if (!config.appId || !config.appSecret) {
    return ok<FeishuChatCandidate[]>([], {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const [matches, selectedChat] = await Promise.all([
      searchFeishuChats({
        tenantAccessToken,
        keyword,
        limit,
      }),
      chatId
        ? getFeishuChatById({
            tenantAccessToken,
            chatId,
          }).catch(() => null)
        : Promise.resolve(null),
    ])

    return ok<FeishuChatCandidate[]>(mergeChatCandidates([selectedChat, ...matches]), {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '检索飞书群失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50447)
  }
})
