import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { estimateWorkspaceBilling, patchWorkspaceBillingAddons } from '~~/server/utils/contest-store'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamBillingEstimateResponse } from '~~/server/utils/team-api-presenter'
import { teamHasWorkspaceRoles } from '~~/server/utils/team-membership-store'

interface PatchWorkspaceBillingAddonBody {
  extraProjectSlots?: number
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchWorkspaceBillingAddonBody>(event)
  const extraProjectSlots = Math.max(0, Math.trunc(Number(body?.extraProjectSlots || 0)))

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40088)
  }

  try {
    const estimate = await withTransaction(event, async (db) => {
      const canManageBilling = await teamHasWorkspaceRoles(db, user, workspaceId, ['owner', 'admin'])
      if (!canManageBilling)
        throw new Error('FORBIDDEN')

      const updated = await patchWorkspaceBillingAddons(db, {
        workspaceId,
        extraProjectSlots,
      })

      if (!updated)
        return estimateWorkspaceBilling(db, { workspaceId })
      return updated
    })

    if (!estimate) {
      setResponseStatus(event, 404)
      return fail('team billing not found', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40488)
    }

    return ok(toTeamBillingEstimateResponse(estimate), {
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
      return fail('当前用户无权修改该 Team 计费附加项。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40388)
    }

    throw error
  }
})
