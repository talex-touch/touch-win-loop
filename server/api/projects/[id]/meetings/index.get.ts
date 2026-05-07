import type { ProjectMeetingListPayload } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { buildProjectMeetingRuntimeHealth } from '~~/server/services/meeting/meeting-runtime'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { readEffectiveMeetingRuntimeSettings } from '~~/server/utils/platform-meeting-config-store'
import { getVisibleProjectById } from '~~/server/utils/platform-store'
import { listProjectMeetings } from '~~/server/utils/project-meeting-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const fallbackRuntime = readRuntimeSettings(event)
  const { runtime } = await readEffectiveMeetingRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const projectId = String(getRouterParam(event, 'id') || '').trim()

  if (!projectId) {
    setResponseStatus(event, 400)
    return fail('缺少 projectId。', {
      startedAt,
      provider: fallbackRuntime.ai.provider,
      model: fallbackRuntime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  const meetings = await withClient(event, async (db) => {
    const project = await getVisibleProjectById(db, user, projectId)
    if (!project)
      return null
    return listProjectMeetings(db, {
      projectId,
      limit: 12,
    })
  })

  if (!meetings) {
    setResponseStatus(event, 404)
    return fail('项目不存在或无访问权限。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40492)
  }

  const payload: ProjectMeetingListPayload = {
    items: meetings,
    runtimeHealth: buildProjectMeetingRuntimeHealth(runtime),
  }

  return ok(payload, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
