import type {
  BillingUsageEventCode,
  BillingUsageEventResult,
  BillingUsageEventsPayload,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import {
  listBillingUsageEvents,
  summarizeBillingUsageEvents,
} from '~~/server/utils/billing-usage-store'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { BILLING_USAGE_EVENT_CODES } from '~~/shared/types/domain'

const BILLING_USAGE_RESULTS: BillingUsageEventResult[] = ['success', 'failed']

function toText(value: unknown): string {
  return String(value || '').trim()
}

function parseEventCode(value: unknown): BillingUsageEventCode | null {
  const normalized = toText(value) as BillingUsageEventCode
  return BILLING_USAGE_EVENT_CODES.includes(normalized) ? normalized : null
}

function parseResult(value: unknown): BillingUsageEventResult | null {
  const normalized = toText(value) as BillingUsageEventResult
  return BILLING_USAGE_RESULTS.includes(normalized) ? normalized : null
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0)
    return fallback
  return Math.trunc(parsed)
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const canWritePricing = await checkPlatformPermission(event, user, 'pricing.write')

  if (!canWritePricing) {
    setResponseStatus(event, 403)
    return fail('当前用户无权访问计费行为事件。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403125)
  }

  const query = getQuery(event)
  const filters = {
    from: toText(query.from) || null,
    to: toText(query.to) || null,
    workspaceId: toText(query.workspaceId) || null,
    actorUserId: toText(query.actorUserId) || null,
    eventCode: parseEventCode(query.eventCode),
    result: parseResult(query.result),
  }
  const page = parsePositiveInt(query.page, 1)
  const pageSize = parsePositiveInt(query.pageSize, 20)

  const payload = await withClient(event, async (db): Promise<BillingUsageEventsPayload> => {
    const [listResult, summary] = await Promise.all([
      listBillingUsageEvents(db, {
        ...filters,
        page,
        pageSize,
      }),
      summarizeBillingUsageEvents(db, filters, {
        successOnly: !filters.result,
      }),
    ])

    return {
      items: listResult.items,
      summary,
      total: listResult.total,
      page: listResult.page,
      pageSize: listResult.pageSize,
    }
  })

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
