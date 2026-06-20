import type { ResourceCategory, ResourceKnowledgeGovernanceStatus, ResourceQualityIssue } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { checkPlatformPermission } from '~~/server/utils/platform-access'
import { enqueueResourceGovernanceTask, getResourceKnowledgeDetail, getResourceKnowledgeProfileByResourceId, upsertResourceKnowledgeManualOverrides } from '~~/server/utils/resource-knowledge-store'

interface PatchKnowledgeResourceBody {
  predictedCategory?: ResourceCategory | ''
  categoryConfidence?: number
  aiTags?: string[]
  majorTags?: string[]
  stageTags?: string[]
  qualityScore?: number
  valueScore?: number
  hotScore?: number
  qualityIssues?: ResourceQualityIssue[]
  governanceStatus?: ResourceKnowledgeGovernanceStatus
  manualOverrides?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const contestId = String(getRouterParam(event, 'id') || '').trim()
  const resourceId = String(getRouterParam(event, 'resourceId') || '').trim()
  const body = await readBody<PatchKnowledgeResourceBody>(event)

  if (!contestId || !resourceId) {
    setResponseStatus(event, 400)
    return fail('缺少 contestId 或 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 400304)
  }

  const canWrite = await checkPlatformPermission(event, user, 'contest.write')
  if (!canWrite) {
    setResponseStatus(event, 403)
    return fail('当前用户无权修改知识治理画像。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 403304)
  }

  const detail = await withTransaction(event, async (db) => {
    const existingDetail = await getResourceKnowledgeDetail(db, {
      contestId,
      resourceId,
    })
    if (!existingDetail)
      throw new Error('RESOURCE_NOT_FOUND')

    const existingProfile = await getResourceKnowledgeProfileByResourceId(db, {
      contestId,
      resourceId,
    })
    const manualOverrides: Record<string, unknown> = {
      ...(existingProfile?.manualOverrides || {}),
      ...(body?.manualOverrides || {}),
    }
    for (const key of ['predictedCategory', 'categoryConfidence', 'aiTags', 'majorTags', 'stageTags', 'qualityScore', 'valueScore', 'hotScore', 'qualityIssues', 'governanceStatus'] as const) {
      const value = body?.[key]
      if (value !== undefined)
        manualOverrides[key] = value
    }

    await upsertResourceKnowledgeManualOverrides(db, {
      contestId,
      resourceId,
      manualOverrides,
      actorUserId: user.id,
    })
    await enqueueResourceGovernanceTask(db, {
      contestId,
      resourceId,
      taskType: 'profile_analyze',
      actorUserId: user.id,
    })
    await enqueueResourceGovernanceTask(db, {
      contestId,
      resourceId,
      taskType: 'relation_refresh',
      actorUserId: user.id,
    })
    await enqueueResourceGovernanceTask(db, {
      contestId,
      resourceId,
      taskType: 'governance_apply',
      actorUserId: user.id,
    })
    return getResourceKnowledgeDetail(db, {
      contestId,
      resourceId,
    })
  })
    .catch((error) => {
      if (error instanceof Error && error.message === 'RESOURCE_NOT_FOUND')
        return null
      throw error
    })

  if (!detail) {
    setResponseStatus(event, 404)
    return fail('resource not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 404304)
  }

  return ok(detail, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
