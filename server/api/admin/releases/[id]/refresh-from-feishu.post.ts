import { setResponseStatus } from 'h3'
import { runWorkflow } from '~~/server/services/workflow/workflow-orchestrator'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import {
  getReleaseVersionById,
  listReleaseVersions,
  resolveReleaseVersionRefreshSource,
} from '~~/server/utils/release-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const releaseVersionId = String(getRouterParam(event, 'id') || '').trim()

  if (!releaseVersionId) {
    setResponseStatus(event, 400)
    return fail('缺少 releaseVersionId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40076)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权重新读取飞书同步项。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40376)
  }

  const version = await withClient(event, db => getReleaseVersionById(db, releaseVersionId))
  if (!version) {
    setResponseStatus(event, 404)
    return fail('版本不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40476)
  }

  const refreshSource = resolveReleaseVersionRefreshSource(version)
  if (!refreshSource) {
    setResponseStatus(event, 400)
    return fail('当前版本缺少可重新读取的飞书 syncItemId 或 recordId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40176)
  }

  const summary = await runWorkflow({
    event,
    providerName: 'feishu_bitable',
    syncItemId: refreshSource.syncItemId,
    actorUserId: user.id,
    triggerSource: 'manual',
    mode: 'delta',
    recordIds: [refreshSource.recordId],
  })

  const latestVersion = await withClient(event, async (db) => {
    const items = await listReleaseVersions(db, {
      scopeKind: version.scopeKind,
      scopeId: version.scopeId,
      limit: 1,
    })
    return items[0] || version
  })

  return ok({
    refreshSource,
    summary,
    latestVersionId: latestVersion.id,
  }, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
