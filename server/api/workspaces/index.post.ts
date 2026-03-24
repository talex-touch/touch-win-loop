import type { TeamProfile } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createTeamWorkspace } from '~~/server/utils/platform-store'

interface CreateWorkspaceBody {
  name?: string
  teamProfile?: TeamProfile | null
  seatLimit?: number
  aiQuotaTotal?: number
  resetCycle?: string
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<CreateWorkspaceBody>(event)

  const name = String(body?.name || '').trim()
  if (!name) {
    setResponseStatus(event, 400)
    return fail('Team 名称不能为空。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40010)
  }

  const workspace = await withTransaction(event, async (db) => {
    return createTeamWorkspace(db, {
      ownerUserId: user.id,
      name,
      teamProfile: body?.teamProfile || null,
      seatLimit: Number(body?.seatLimit || 20),
      aiQuotaTotal: Number(body?.aiQuotaTotal || 1000),
      resetCycle: String(body?.resetCycle || 'monthly'),
    })
  })

  return ok(workspace, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
