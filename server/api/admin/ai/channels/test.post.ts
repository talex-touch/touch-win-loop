import type { PlatformAiChannelKey } from '~~/server/utils/platform-ai-channels'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { setResponseStatus } from 'h3'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { recordContestAuditLog } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { resolveAiRuntimeForChannel } from '~~/server/utils/platform-ai-channels'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'

interface ChannelTestBody {
  channelKey?: PlatformAiChannelKey
  message?: string
}

const DEFAULT_CHANNEL: PlatformAiChannelKey = 'project_chat'

function resolveChannelKey(raw: unknown): PlatformAiChannelKey {
  const text = String(raw || '').trim() as PlatformAiChannelKey
  const allowed: PlatformAiChannelKey[] = [
    'contest_filter',
    'project_chat',
    'topic_proposal',
    'defense',
    'workspace_dialog_ask',
    'workspace_auto_optimize',
    'workspace_issue_discovery',
    'admin_general',
    'admin_publish_assistant',
  ]
  return allowed.includes(text) ? text : DEFAULT_CHANNEL
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string')
    return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const { runtime } = await readEffectiveRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canReadInternal = await checkPlatformPermission(event, user, 'contest.read_internal')
  if (!canReadInternal) {
    setResponseStatus(event, 403)
    return fail('当前用户无权测试 AI Channel。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40393)
  }

  const body = await readBody<ChannelTestBody>(event).catch(() => ({} as ChannelTestBody))
  const channelKey = resolveChannelKey(body.channelKey)
  const testMessage = String(body.message || '').trim() || '请回复“CHANNEL_OK”，并附带一句简短诊断说明。'

  const resolved = resolveAiRuntimeForChannel(runtime, channelKey)
  if (!resolved.ai.apiKey || resolved.ai.provider === 'mock') {
    setResponseStatus(event, 400)
    return fail('该场景未配置可用模型（API Key 缺失或 provider=mock）。', {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: true,
      attempts: 1,
    }, 40098)
  }

  try {
    const model = createChatModel({
      ...resolved.ai,
      maxRetries: 0,
      temperature: Math.min(1, Math.max(0, Number(resolved.ai.temperature ?? 0.2))),
    })

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', [
        '你是 AI 场景测试助手。',
        '只需输出一段简洁文本，说明当前模型可用。',
        resolved.prompt ? `[场景提示词]\n${resolved.prompt}` : '',
      ].filter(Boolean).join('\n\n')],
      ['human', '{message}'],
    ])

    const promptValue = await prompt.invoke({
      message: testMessage,
    })
    const output = await model.invoke(promptValue)
    const reply = extractMessageText(output.content) || '（模型返回为空）'

    await withTransaction(event, async (db) => {
      await recordContestAuditLog(db, {
        actorUserId: user.id,
        action: 'test.admin.ai.channel',
        payload: {
          channelKey,
          providerId: resolved.provider?.id || null,
          provider: resolved.ai.provider,
          model: resolved.ai.model,
          usedFallback: resolved.usedFallback,
          latencyMs: Date.now() - startedAt,
        },
      })
    })

    return ok({
      channelKey,
      channelLabel: resolved.channel.label,
      providerId: resolved.provider?.id || '',
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      usedFallback: resolved.usedFallback,
      promptConfigured: Boolean(String(resolved.prompt || '').trim()),
      responsePreview: reply.slice(0, 300),
      latencyMs: Date.now() - startedAt,
    }, {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error: any) {
    setResponseStatus(event, 502)
    return fail(String(error?.message || 'Channel 场景测试失败。'), {
      startedAt,
      provider: resolved.ai.provider,
      model: resolved.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50298)
  }
})
