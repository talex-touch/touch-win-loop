import type { ProjectCollegeBinding } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { patchProjectBindings } from '~~/server/utils/platform-store'
import { teamCanManageProject } from '~~/server/utils/project-access-store'

interface PatchBindingsBody {
  collegeBindings?: ProjectCollegeBinding[]
  advisorUserIds?: string[]
  advisorUsernames?: string[]
  contestIds?: string[]
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = getRouterParam(event, 'id') || ''
  const body = (await readBody<PatchBindingsBody>(event)) || {}

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40051)
  }

  try {
    const project = await withTransaction(event, async (db) => {
      const manageable = await teamCanManageProject(db, user, projectId)
      if (!manageable)
        throw new Error('FORBIDDEN')

      return patchProjectBindings(db, projectId, user.id, {
        collegeBindings: Array.isArray(body?.collegeBindings) ? body.collegeBindings : undefined,
        advisorUserIds: Array.isArray(body?.advisorUserIds) ? body.advisorUserIds : undefined,
        advisorUsernames: Array.isArray(body?.advisorUsernames) ? body.advisorUsernames : undefined,
        contestIds: Array.isArray(body?.contestIds) ? body.contestIds.map(item => String(item || '').trim()).filter(Boolean) : undefined,
      })
    })

    if (!project) {
      setResponseStatus(event, 404)
      return fail('project not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40451)
    }

    return ok(project, {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    })
  }
  catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('当前用户无权修改项目绑定。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40351)
    }

    if (error instanceof Error && error.message === 'TRACK_NOT_FOUND') {
      setResponseStatus(event, 400)
      return fail('目标竞赛没有可用赛道，无法完成绑定。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40052)
    }

    if (error instanceof Error && error.message === 'PROJECT_ADVISOR_LIMIT_EXCEEDED') {
      setResponseStatus(event, 400)
      return fail('每个项目最多只能绑定 3 位指导老师。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40053)
    }

    throw error
  }
})
