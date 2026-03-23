import type { ProjectSettingsPatchInput } from '~~/server/utils/platform-store'
import type {
  ApproveChangeRequestPayload,
  ResourceAvailability,
  ResourceCategory,
} from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  canManageProject,
  getVisibleProjectById,
  patchProjectContestAdaptation,
  patchProjectSettings,
} from '~~/server/utils/platform-store'
import {
  getAiProjectChangeRequestById,
  markAiProjectChangeRequestApproved,
  markAiProjectChangeRequestFailed,
} from '~~/server/utils/project-ai-store'
import {
  bindLibraryResourceToProject,
  moveProjectResourceToRecycleBin,
  patchProjectResourceMetadata,
  purgeProjectResourceFromRecycleBin,
  restoreProjectResourceFromRecycleBin,
} from '~~/server/utils/project-resource-store'

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }
  return false
}

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'basic_info',
  'timeline',
  'tracks',
  'scoring',
  'past_questions',
  'awarded_works',
  'templates',
  'faq',
  'judge_guidelines',
  'track_details',
  'ai_prompts',
  'submission_examples',
  'policy_notice',
  'compliance',
]

const RESOURCE_AVAILABILITIES: ResourceAvailability[] = [
  'public',
  'login_required',
  'unavailable',
]

function normalizeResourceCategory(value: unknown): ResourceCategory | undefined {
  const text = String(value || '').trim()
  if (!text)
    return undefined
  return RESOURCE_CATEGORIES.includes(text as ResourceCategory)
    ? (text as ResourceCategory)
    : undefined
}

function normalizeResourceAvailability(value: unknown): ResourceAvailability | undefined {
  const text = String(value || '').trim()
  if (!text)
    return undefined
  return RESOURCE_AVAILABILITIES.includes(text as ResourceAvailability)
    ? (text as ResourceAvailability)
    : undefined
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()
  const changeId = String(getRouterParam(event, 'changeId') || '').trim()
  const body = await readBody<ApproveChangeRequestPayload>(event)
    .catch(() => ({} as ApproveChangeRequestPayload))
  const destructiveConfirm = normalizeBoolean(body.destructiveConfirm)

  if (!projectId || !changeId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId 或 changeId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  const updated = await withTransaction(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      throw new Error('PROJECT_NOT_FOUND')

    const manageable = await canManageProject(db, user, projectId)
    if (!manageable)
      throw new Error('FORBIDDEN')

    const change = await getAiProjectChangeRequestById(db, {
      projectId,
      changeId,
    })
    if (!change)
      throw new Error('CHANGE_NOT_FOUND')
    if (change.status !== 'pending')
      throw new Error('CHANGE_NOT_PENDING')

    if (change.destructive && !destructiveConfirm)
      throw new Error('DESTRUCTIVE_CONFIRM_REQUIRED')

    const payload = change.payload || {}
    let executedResult: Record<string, unknown> = {}

    try {
      if (change.changeType === 'settings_common_patch') {
        const common: ProjectSettingsPatchInput['common'] = {}
        if (payload.title !== undefined)
          common.title = String(payload.title || '')
        if (payload.summary !== undefined)
          common.summary = String(payload.summary || '')
        if (payload.problemStatement !== undefined)
          common.problemStatement = String(payload.problemStatement || '')
        if (payload.innovationPoints !== undefined)
          common.innovationPoints = normalizeStringArray(payload.innovationPoints)
        if (payload.techRouteSteps !== undefined)
          common.techRouteSteps = normalizeStringArray(payload.techRouteSteps)
        if (payload.scoringMapping !== undefined)
          common.scoringMapping = normalizeStringArray(payload.scoringMapping)
        if (payload.risks !== undefined)
          common.risks = normalizeStringArray(payload.risks)
        if (payload.deliverables !== undefined)
          common.deliverables = normalizeStringArray(payload.deliverables)
        const snapshot = await patchProjectSettings(db, user, projectId, { common })
        executedResult = {
          changeType: change.changeType,
          snapshotUpdated: Boolean(snapshot),
        }
      }
      else if (change.changeType === 'contest_bindings_replace') {
        const contestBindings = Array.isArray(payload.contestBindings)
          ? payload.contestBindings
              .map((item, index) => {
                const source = (item || {}) as Record<string, unknown>
                return {
                  contestId: String(source.contestId || '').trim(),
                  trackId: String(source.trackId || '').trim(),
                  sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : index,
                }
              })
              .filter(item => item.contestId && item.trackId)
          : []
        const snapshot = await patchProjectSettings(db, user, projectId, {
          contestBindings,
          currentContestId: String(payload.currentContestId || '').trim(),
        })
        executedResult = {
          changeType: change.changeType,
          bindingCount: contestBindings.length,
          snapshotUpdated: Boolean(snapshot),
        }
      }
      else if (change.changeType === 'adaptation_patch') {
        const contestId = String(payload.contestId || '').trim()
        if (!contestId)
          throw new Error('CONTEST_ID_REQUIRED')
        const snapshot = await patchProjectContestAdaptation(db, user, projectId, contestId, {
          problemStatement: payload.problemStatement !== undefined ? String(payload.problemStatement || '') : undefined,
          innovationPoints: payload.innovationPoints !== undefined ? normalizeStringArray(payload.innovationPoints) : undefined,
          techRouteSteps: payload.techRouteSteps !== undefined ? normalizeStringArray(payload.techRouteSteps) : undefined,
          scoringMapping: payload.scoringMapping !== undefined ? normalizeStringArray(payload.scoringMapping) : undefined,
          risks: payload.risks !== undefined ? normalizeStringArray(payload.risks) : undefined,
          deliverables: payload.deliverables !== undefined ? normalizeStringArray(payload.deliverables) : undefined,
          summary: payload.summary !== undefined ? String(payload.summary || '') : undefined,
        })
        executedResult = {
          changeType: change.changeType,
          contestId,
          snapshotUpdated: Boolean(snapshot),
        }
      }
      else if (change.changeType === 'resource_bind_library') {
        const resourceId = String(payload.resourceId || '').trim()
        if (!resourceId)
          throw new Error('RESOURCE_ID_REQUIRED')
        const resource = await bindLibraryResourceToProject(db, {
          projectId,
          resourceId,
          actorUserId: user.id,
        })
        executedResult = {
          changeType: change.changeType,
          resourceId: resource.id,
        }
      }
      else if (change.changeType === 'resource_update_metadata') {
        const resourceId = String(payload.resourceId || '').trim()
        if (!resourceId)
          throw new Error('RESOURCE_ID_REQUIRED')
        const category = payload.category !== undefined ? normalizeResourceCategory(payload.category) : undefined
        const availability = payload.availability !== undefined ? normalizeResourceAvailability(payload.availability) : undefined
        if (payload.category !== undefined && !category)
          throw new Error('INVALID_RESOURCE_CATEGORY')
        if (payload.availability !== undefined && !availability)
          throw new Error('INVALID_RESOURCE_AVAILABILITY')
        const resource = await patchProjectResourceMetadata(db, {
          projectId,
          resourceId,
          actorUserId: user.id,
          title: payload.title !== undefined ? String(payload.title || '') : undefined,
          summary: payload.summary !== undefined ? String(payload.summary || '') : undefined,
          category,
          availability,
        })
        executedResult = {
          changeType: change.changeType,
          resourceId: resource.id,
        }
      }
      else if (change.changeType === 'resource_archive') {
        const resourceId = String(payload.resourceId || '').trim()
        if (!resourceId)
          throw new Error('RESOURCE_ID_REQUIRED')
        const removed = await moveProjectResourceToRecycleBin(db, {
          projectId,
          resourceId,
          actorUserId: user.id,
        })
        executedResult = {
          changeType: change.changeType,
          resourceId: removed.resourceId,
        }
      }
      else if (change.changeType === 'resource_restore') {
        const resourceId = String(payload.resourceId || '').trim()
        if (!resourceId)
          throw new Error('RESOURCE_ID_REQUIRED')
        const restored = await restoreProjectResourceFromRecycleBin(db, {
          projectId,
          resourceId,
          actorUserId: user.id,
        })
        executedResult = {
          changeType: change.changeType,
          resourceId: restored.id,
        }
      }
      else if (change.changeType === 'resource_purge') {
        const resourceId = String(payload.resourceId || '').trim()
        if (!resourceId)
          throw new Error('RESOURCE_ID_REQUIRED')
        const purged = await purgeProjectResourceFromRecycleBin(db, {
          projectId,
          resourceId,
        })
        executedResult = {
          changeType: change.changeType,
          resourceId: purged.resourceId,
        }
      }
      else {
        throw new Error('UNSUPPORTED_CHANGE_TYPE')
      }

      const approved = await markAiProjectChangeRequestApproved(db, {
        projectId,
        changeId,
        actorUserId: user.id,
        executedResult,
      })
      if (!approved)
        throw new Error('CHANGE_NOT_FOUND')
      return approved
    }
    catch (error) {
      const reason = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      await markAiProjectChangeRequestFailed(db, {
        projectId,
        changeId,
        failedReason: reason,
      }).catch(() => undefined)
      throw error
    }
  }).catch((error) => {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      setResponseStatus(event, 404)
      return null
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return 'FORBIDDEN'
    }
    if (error instanceof Error && error.message === 'CHANGE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return 'CHANGE_NOT_FOUND'
    }
    if (error instanceof Error && error.message === 'CHANGE_NOT_PENDING') {
      setResponseStatus(event, 409)
      return 'CHANGE_NOT_PENDING'
    }
    if (error instanceof Error && error.message === 'DESTRUCTIVE_CONFIRM_REQUIRED') {
      setResponseStatus(event, 409)
      return 'DESTRUCTIVE_CONFIRM_REQUIRED'
    }
    if (error instanceof Error && error.message === 'CONTEST_ID_REQUIRED') {
      setResponseStatus(event, 400)
      return 'CONTEST_ID_REQUIRED'
    }
    if (error instanceof Error && error.message === 'RESOURCE_ID_REQUIRED') {
      setResponseStatus(event, 400)
      return 'RESOURCE_ID_REQUIRED'
    }
    if (error instanceof Error && error.message === 'INVALID_RESOURCE_CATEGORY') {
      setResponseStatus(event, 400)
      return 'INVALID_RESOURCE_CATEGORY'
    }
    if (error instanceof Error && error.message === 'INVALID_RESOURCE_AVAILABILITY') {
      setResponseStatus(event, 400)
      return 'INVALID_RESOURCE_AVAILABILITY'
    }
    if (error instanceof Error && error.message === 'UNSUPPORTED_CHANGE_TYPE') {
      setResponseStatus(event, 422)
      return 'UNSUPPORTED_CHANGE_TYPE'
    }
    throw error
  })

  if (!updated) {
    return fail('project not found', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40498)
  }

  if (updated === 'FORBIDDEN') {
    return fail('当前用户无权审批该变更。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40398)
  }

  if (updated === 'CHANGE_NOT_FOUND') {
    return fail('变更请求不存在。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40499)
  }

  if (updated === 'CHANGE_NOT_PENDING') {
    return fail('变更请求已被处理，请刷新列表。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40998)
  }

  if (updated === 'DESTRUCTIVE_CONFIRM_REQUIRED') {
    return fail('该变更为破坏性操作，需二次确认。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40999)
  }

  if (updated === 'CONTEST_ID_REQUIRED') {
    return fail('适配稿变更缺少 contestId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40099)
  }

  if (updated === 'RESOURCE_ID_REQUIRED') {
    return fail('资源变更缺少 resourceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40100)
  }

  if (updated === 'INVALID_RESOURCE_CATEGORY') {
    return fail('资源分类不合法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40101)
  }

  if (updated === 'INVALID_RESOURCE_AVAILABILITY') {
    return fail('资源可见性不合法。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40102)
  }

  if (updated === 'UNSUPPORTED_CHANGE_TYPE') {
    return fail('暂不支持的 AI 变更类型。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 42298)
  }

  return ok(updated, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
