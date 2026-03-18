import type { AuthMeResult } from '~~/shared/types/domain'
import { ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { listUserWorkspaces } from '~~/server/utils/platform-store'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const workspaces = await withClient(event, async (db) => {
    return listUserWorkspaces(db, user.id)
  })

  const data: AuthMeResult = {
    user,
    workspaces,
    onboarding: {
      needCreateTeam: workspaces.every(item => item.workspace.type !== 'team'),
    },
  }

  return ok(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
