import type { FeishuBitableSourceConfig } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import {
  getFeishuTenantAccessToken,
  getFeishuWikiNodeInfo,
} from '~~/server/services/feishu/client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { extractFeishuWikiNodeToken, resolveFeishuBitableSourceInput } from '~~/server/utils/feishu-bitable-source'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface ResolveBody {
  input?: string
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
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

  const inputText = toText(body.input)
  const source = resolveFeishuBitableSourceInput(inputText) as FeishuBitableSourceConfig
  const wikiNodeToken = extractFeishuWikiNodeToken(inputText)

  if (wikiNodeToken && !source.appToken) {
    const config = await withClient(event, async db => readFeishuIntegrationConfig(db))
    if (!config.enabled || !config.appId || !config.appSecret) {
      setResponseStatus(event, 400)
      return fail('当前识别到飞书 Wiki 链接，但系统尚未配置可用的飞书读权限，无法自动反查多维主库。请改为打开多维表格页面后粘贴地址，或手动填写。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40135)
    }

    try {
      const tenantAccessToken = await getFeishuTenantAccessToken(config)
      const wikiNode = await getFeishuWikiNodeInfo({
        tenantAccessToken,
        token: wikiNodeToken,
      })

      if (wikiNode?.objType && wikiNode.objType !== 'bitable') {
        setResponseStatus(event, 400)
        return fail(`当前 Wiki 链接指向的是 ${wikiNode.objType}，不是飞书多维表格。请打开实际多维表格页面后再粘贴地址。`, {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
          fallbackUsed: false,
          attempts: 1,
        }, 40134)
      }

      if (wikiNode?.objToken)
        source.appToken = wikiNode.objToken
    }
    catch (error) {
      setResponseStatus(event, 400)
      return fail(error instanceof Error ? `Wiki 链接解析失败：${error.message}` : 'Wiki 链接解析失败。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 50434)
    }
  }

  if (!source.appToken && !source.tableId) {
    setResponseStatus(event, 400)
    return fail('未识别到 appToken/tableId。若你粘贴的是 Wiki 或飞书文档链接，请先打开实际多维表格页面后再粘贴，或改用手动填写。', {
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
