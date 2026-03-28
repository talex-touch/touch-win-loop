import type { FeishuBitableTableMeta, FeishuBitableViewMeta } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import {
  getFeishuTenantAccessToken,
  listFeishuBitableTables,
  listFeishuBitableViews,
} from '~~/server/services/feishu/client'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { checkPlatformPermission } from '~~/server/utils/platform-access'

interface SourceViewsPayload {
  tables: FeishuBitableTableMeta[]
  views: FeishuBitableViewMeta[]
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权查询飞书多维表/视图。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40433)
  }

  const appToken = toText(getRouterParam(event, 'appToken'))
  const tableId = toText(getRouterParam(event, 'tableId'))
  if (!appToken || !tableId) {
    setResponseStatus(event, 400)
    return fail('缺少 appToken 或 tableId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40133)
  }

  const config = await withClient(event, async db => readFeishuIntegrationConfig(db))
  if (!config.enabled || !config.appId || !config.appSecret) {
    return ok<SourceViewsPayload>({
      tables: [],
      views: [],
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }

  try {
    const tenantAccessToken = await getFeishuTenantAccessToken(config)
    const [tables, views] = await Promise.all([
      listFeishuBitableTables({
        tenantAccessToken,
        appToken,
      }),
      listFeishuBitableViews({
        tenantAccessToken,
        appToken,
        tableId,
      }),
    ])
    return ok<SourceViewsPayload>({
      tables: tables.map(item => ({
        tableId: item.tableId,
        name: item.name,
      })),
      views: views.map(item => ({
        viewId: item.viewId,
        name: item.name,
      })),
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    setResponseStatus(event, 400)
    return fail(error instanceof Error ? error.message : '查询飞书多维视图失败。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 50433)
  }
})
