import type { WorkspaceDisplayPreferencesPatchInput } from '~~/server/utils/workspace-display-preference-store'
import type { WorkspaceDisplayPreferences, WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { isWorkspaceFontSizePreset, isWorkspaceTabSpacingPreset, patchUserWorkspaceDisplayDefaults } from '~~/server/utils/workspace-display-preference-store'

interface PatchWorkspaceDisplayPreferencesBody {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
}

function parsePatchInput(body: PatchWorkspaceDisplayPreferencesBody | null | undefined): WorkspaceDisplayPreferencesPatchInput | null {
  if (!body)
    return null

  const patch: WorkspaceDisplayPreferencesPatchInput = {}
  const hasFontSizePreset = Object.prototype.hasOwnProperty.call(body, 'fontSizePreset')
  const hasTabSpacingPreset = Object.prototype.hasOwnProperty.call(body, 'tabSpacingPreset')
  if (!hasFontSizePreset && !hasTabSpacingPreset)
    return null

  if (hasFontSizePreset) {
    if (body.fontSizePreset === null)
      patch.fontSizePreset = null
    else if (isWorkspaceFontSizePreset(body.fontSizePreset))
      patch.fontSizePreset = body.fontSizePreset
    else
      return null
  }

  if (hasTabSpacingPreset) {
    if (body.tabSpacingPreset === null)
      patch.tabSpacingPreset = null
    else if (isWorkspaceTabSpacingPreset(body.tabSpacingPreset))
      patch.tabSpacingPreset = body.tabSpacingPreset
    else
      return null
  }

  return patch
}

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const body = await readBody<PatchWorkspaceDisplayPreferencesBody>(event)
  const patch = parsePatchInput(body)

  if (!patch) {
    setResponseStatus(event, 400)
    return fail('缺少显示偏好字段，或 fontSizePreset / tabSpacingPreset 不在允许范围内。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40095)
  }

  const preferences = await withTransaction(event, async (db) => {
    return patchUserWorkspaceDisplayDefaults(db, user.id, patch)
  })

  return ok<WorkspaceDisplayPreferences | null>(preferences, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: false,
    attempts: 1,
  })
})
