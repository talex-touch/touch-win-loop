import type { FeishuBitableSourceConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ResolveBody {
  input?: string
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function extractByRegex(text: string, pattern: RegExp): string {
  const hit = text.match(pattern)
  return toText(hit?.[1] || '')
}

function resolveSourceFromInput(raw: string): FeishuBitableSourceConfig {
  const text = toText(raw)
  if (!text)
    return { appToken: '', tableId: '', viewId: '' }

  let appToken = extractByRegex(text, /app[_-]?token\s*[:=]\s*(\w+)/i)
  if (!appToken)
    appToken = extractByRegex(text, /\/base\/(\w+)/i)
  if (!appToken)
    appToken = extractByRegex(text, /\/apps\/(\w+)/i)

  let tableId = extractByRegex(text, /table[_-]?id\s*[:=]\s*(\w+)/i)
  if (!tableId)
    tableId = extractByRegex(text, /\b(tbl\w+)\b/i)

  let viewId = extractByRegex(text, /view[_-]?id\s*[:=]\s*(\w+)/i)
  if (!viewId)
    viewId = extractByRegex(text, /\b(view\w+)\b/i)

  return {
    appToken: toText(appToken),
    tableId: toText(tableId),
    viewId: toText(viewId),
    sourceUrl: text.includes('http://') || text.includes('https://') ? text : '',
  }
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<ResolveBody>(event).catch(() => ({} as ResolveBody))

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权解析飞书多维来源。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40432)
  }

  const source = resolveSourceFromInput(toText(body.input))
  if (!source.appToken && !source.tableId) {
    setResponseStatus(event, 400)
    return fail('未识别到 appToken/tableId，请粘贴飞书多维链接或标识。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40132)
  }

  return ok<FeishuBitableSourceConfig>(source, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
