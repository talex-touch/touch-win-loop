import type {
  WorkspaceFeishuSourceSearchResponse,
  WorkspaceFeishuSourceSearchResult,
  WorkspaceIntegrationConnection,
} from '~~/shared/types/domain'
import type {
  NormalizedWorkspaceFeishuImportSource,
  WorkspaceFeishuImportSourceInput,
} from '~~/shared/utils/workspace-feishu-integration'
import { setResponseStatus } from 'h3'
import {
  listFeishuBitableApps,
  listFeishuBitableTables,
  listFeishuBitableViews,
} from '~~/server/services/feishu/client'
import { getWorkspaceFeishuMarketplaceTenantAccessToken } from '~~/server/services/feishu/workspace-auth'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readFeishuIntegrationConfig } from '~~/server/utils/feishu-integration-store'
import { teamHasWorkspaceMembership } from '~~/server/utils/team-membership-store'
import {
  getFeishuWorkspaceIntegrationSnapshot,
  markFeishuWorkspaceConnectionTokenHealth,
} from '~~/server/utils/workspace-integration-store'
import {
  formatWorkspaceFeishuResourceTitle,
  normalizeWorkspaceFeishuImportSources,
  parseWorkspaceFeishuSourceUrl,
} from '~~/shared/utils/workspace-feishu-integration'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return String(error.message || '飞书资源搜索失败').trim() || '飞书资源搜索失败'
  return String(error || '飞书资源搜索失败').trim() || '飞书资源搜索失败'
}

function toTokenHealth(error: unknown): 'missing_app_ticket' | 'missing_tenant_key' | 'tenant_token_failed' {
  const message = error instanceof Error ? error.message : String(error || '')
  if (message === 'FEISHU_MARKETPLACE_APP_TICKET_MISSING')
    return 'missing_app_ticket'
  if (message === 'FEISHU_WORKSPACE_TENANT_KEY_MISSING')
    return 'missing_tenant_key'
  return 'tenant_token_failed'
}

function connectionStatusPayload(input: {
  connected: boolean
  connection?: WorkspaceIntegrationConnection | null
}): Pick<WorkspaceFeishuSourceSearchResponse, 'connected' | 'connectionStatus' | 'tokenHealth'> {
  return {
    connected: input.connected,
    connectionStatus: input.connection?.status || '',
    tokenHealth: String(input.connection?.capabilities?.tokenHealth || '').trim(),
  }
}

function normalizeSearchMode(value: unknown): 'linked' | 'remote' | 'resolve' {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'remote' || normalized === 'resolve')
    return normalized
  return 'linked'
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function toSearchResult(source: NormalizedWorkspaceFeishuImportSource): WorkspaceFeishuSourceSearchResult {
  return {
    type: source.type,
    token: source.token,
    title: formatWorkspaceFeishuResourceTitle(source),
    originalUrl: source.originalUrl,
    fileName: source.fileName || undefined,
    mimeType: source.mimeType || undefined,
    updatedAt: source.updatedAt || undefined,
    metadata: source.metadata,
  }
}

function normalizeParsedSource(raw: unknown): NormalizedWorkspaceFeishuImportSource | null {
  const sources = normalizeWorkspaceFeishuImportSources([raw as WorkspaceFeishuImportSourceInput])
  return sources[0] || null
}

function looksLikeFeishuUrl(value: string): boolean {
  const normalized = value.toLowerCase()
  return normalized.includes('feishu.cn/')
    || normalized.includes('larksuite.com/')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://')
}

function buildLinkedSources(input: {
  externalResources: Awaited<ReturnType<typeof getFeishuWorkspaceIntegrationSnapshot>>['externalResources']
  query: string
}): WorkspaceFeishuSourceSearchResult[] {
  return input.externalResources
    .map(ref => ({
      type: ref.externalType,
      token: ref.externalToken,
      title: String(ref.metadata.sourceTitle || ref.externalToken),
      originalUrl: ref.externalUrl,
      updatedAt: ref.updatedAt,
      metadata: ref.metadata,
      linkedResourceId: ref.resourceId || null,
      lastImportStatus: ref.lastImportStatus,
    }))
    .filter((source) => {
      if (!input.query)
        return true
      const haystack = `${source.title} ${source.token} ${source.originalUrl}`.toLowerCase()
      return haystack.includes(input.query.toLowerCase())
    })
}

async function expandBitableSource(input: {
  tenantAccessToken: string
  source: NormalizedWorkspaceFeishuImportSource
  limit?: number
}): Promise<WorkspaceFeishuSourceSearchResult[]> {
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20)))
  const metadata = normalizeRecord(input.source.metadata)
  const appToken = normalizeString(metadata.appToken) || input.source.token
  const tableId = normalizeString(metadata.tableId)
  const viewId = normalizeString(metadata.viewId)

  if (!appToken)
    return []

  if (!tableId) {
    const tables = await listFeishuBitableTables({
      tenantAccessToken: input.tenantAccessToken,
      appToken,
    })
    return tables.slice(0, limit).map((table) => {
      return toSearchResult({
        ...input.source,
        token: appToken,
        title: `${formatWorkspaceFeishuResourceTitle(input.source)} / ${table.name}`,
        metadata: {
          ...metadata,
          appToken,
          tableId: table.tableId,
          tableName: table.name,
        },
      })
    })
  }

  const views = viewId
    ? []
    : await listFeishuBitableViews({
        tenantAccessToken: input.tenantAccessToken,
        appToken,
        tableId,
      }).catch(() => [])

  return [
    toSearchResult({
      ...input.source,
      token: appToken,
      metadata: {
        ...metadata,
        appToken,
        tableId,
        viewId,
        viewOptions: views.slice(0, 20),
      },
    }),
  ]
}

async function searchRemoteBitableSources(input: {
  tenantAccessToken: string
  query: string
}): Promise<WorkspaceFeishuSourceSearchResult[]> {
  const apps = await listFeishuBitableApps({
    tenantAccessToken: input.tenantAccessToken,
    keyword: input.query,
    limit: 10,
  })
  const results: WorkspaceFeishuSourceSearchResult[] = []
  for (const app of apps) {
    if (results.length >= 20)
      break
    const baseSource: NormalizedWorkspaceFeishuImportSource = {
      type: 'feishu_bitable',
      token: app.appToken,
      title: app.name,
      content: '',
      originalUrl: '',
      versionHash: '',
      updatedAt: '',
      mimeType: '',
      fileName: '',
      metadata: {
        appToken: app.appToken,
        appName: app.name,
      },
    }
    const tableResults = await expandBitableSource({
      tenantAccessToken: input.tenantAccessToken,
      source: baseSource,
      limit: 20 - results.length,
    }).catch(() => [])
    results.push(...tableResults)
  }
  return results
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const queryParams = getQuery(event)
  const mode = normalizeSearchMode(queryParams.mode)
  const query = String(queryParams.q || '').trim()
  const url = String(queryParams.url || '').trim()

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    }, 40101)
  }

  try {
    const preflight = await withClient(event, async (db) => {
      const canAccess = await teamHasWorkspaceMembership(db, user, workspaceId)
      if (!canAccess)
        throw new Error('FORBIDDEN')
      const snapshot = await getFeishuWorkspaceIntegrationSnapshot(db, workspaceId)
      const platformConfig = await readFeishuIntegrationConfig(db)
      return {
        snapshot,
        platformConfig,
      }
    })
    const base = connectionStatusPayload(preflight.snapshot)

    if (mode === 'linked') {
      return ok<WorkspaceFeishuSourceSearchResponse>({
        ...base,
        sources: buildLinkedSources({
          externalResources: preflight.snapshot.externalResources,
          query,
        }),
        diagnosticCode: 'ok',
        diagnosticMessage: '',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    const parsedUrl = mode === 'resolve' || looksLikeFeishuUrl(query)
      ? parseWorkspaceFeishuSourceUrl(url || query)
      : null
    const parsedSource = parsedUrl?.parseStatus === 'matched' ? normalizeParsedSource(parsedUrl) : null
    if (parsedUrl && parsedUrl.parseStatus !== 'matched') {
      return ok<WorkspaceFeishuSourceSearchResponse>({
        ...base,
        sources: [],
        diagnosticCode: parsedUrl.parseStatus === 'invalid' ? 'invalid_feishu_url' : 'unsupported_feishu_url',
        diagnosticMessage: parsedUrl.parseMessage,
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    const needsTenantToken = mode === 'remote'
      || parsedSource?.type === 'feishu_bitable'
    if (needsTenantToken && (!preflight.snapshot.connected || !preflight.snapshot.connection)) {
      return ok<WorkspaceFeishuSourceSearchResponse>({
        ...base,
        sources: parsedSource ? [toSearchResult(parsedSource)] : [],
        diagnosticCode: 'feishu_workspace_not_connected',
        diagnosticMessage: '当前工作空间尚未连接飞书。',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    let tenantAccessToken = ''
    if (needsTenantToken) {
      try {
        tenantAccessToken = await getWorkspaceFeishuMarketplaceTenantAccessToken({
          config: preflight.platformConfig,
          connection: preflight.snapshot.connection,
        })
      }
      catch (error) {
        const tokenHealth = toTokenHealth(error)
        const message = toErrorMessage(error)
        await withClient(event, async (db) => {
          await markFeishuWorkspaceConnectionTokenHealth(db, {
            workspaceId,
            status: 'needs_reauth',
            tokenHealth,
            lastError: message,
            actorUserId: user.id,
          })
        })
        return ok<WorkspaceFeishuSourceSearchResponse>({
          ...base,
          tokenHealth,
          sources: parsedSource ? [toSearchResult(parsedSource)] : [],
          diagnosticCode: tokenHealth,
          diagnosticMessage: message,
        }, {
          startedAt,
          provider: runtime.ai.provider,
          model: runtime.ai.model,
        })
      }
    }

    if (parsedSource) {
      const sources = parsedSource.type === 'feishu_bitable'
        ? await expandBitableSource({
            tenantAccessToken,
            source: parsedSource,
          })
        : [toSearchResult(parsedSource)]
      return ok<WorkspaceFeishuSourceSearchResponse>({
        ...base,
        sources,
        diagnosticCode: 'ok',
        diagnosticMessage: '',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    if (!query) {
      return ok<WorkspaceFeishuSourceSearchResponse>({
        ...base,
        sources: [],
        diagnosticCode: 'empty_query',
        diagnosticMessage: '请输入飞书资源关键词或链接。',
      }, {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      })
    }

    const sources = await searchRemoteBitableSources({
      tenantAccessToken,
      query,
    })
    return ok<WorkspaceFeishuSourceSearchResponse>({
      ...base,
      sources,
      diagnosticCode: 'ok',
      diagnosticMessage: '',
    }, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权搜索飞书数据源。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
      }, 40401)
    }
    throw error
  }
})
