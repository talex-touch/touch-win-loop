import type { AnalyticsEventInput, AnalyticsTrackedEvent } from '~~/shared/types/analytics'
import { setResponseStatus } from 'h3'
import { trackAnalyticsEvent } from '~~/server/utils/analytics-store'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = ((await readBody<AnalyticsEventInput>(event)) || {}) as AnalyticsEventInput

  const payload: AnalyticsEventInput = {
    workspaceId: String(body.workspaceId || '').trim(),
    projectId: String(body.projectId || '').trim(),
    eventType: body.eventType,
    eventName: String(body.eventName || '').trim(),
    pageKey: String(body.pageKey || '').trim(),
    entityType: body.entityType,
    entityId: String(body.entityId || '').trim(),
    payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {},
  }

  if (!payload.eventName || !payload.pageKey) {
    setResponseStatus(event, 400)
    return fail('eventName 与 pageKey 为必填字段。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40001)
  }

  try {
    const tracked = await withClient(event, db => trackAnalyticsEvent(db, {
      user,
      payload,
    }))

    return ok<AnalyticsTrackedEvent>(tracked, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && ['ANALYTICS_PROJECT_FORBIDDEN', 'ANALYTICS_WORKSPACE_FORBIDDEN'].includes(error.message)) {
      setResponseStatus(event, 403)
      return fail('当前用户无权写入该分析事件。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40301)
    }
    throw error
  }
})
