import type { WorkspaceDisplayPreferencesPatchInput } from '~~/server/utils/workspace-display-preference-store'
import type { WorkspaceDisplayPreferenceSnapshot, WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { isWorkspaceFontSizePreset, isWorkspaceTabSpacingPreset, patchWorkspaceDisplayDefault } from '~~/server/utils/workspace-display-preference-store'

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
  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const body = await readBody<PatchWorkspaceDisplayPreferencesBody>(event)
  const patch = parsePatchInput(body)

  if (!workspaceId || !patch) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId，或 fontSizePreset / tabSpacingPreset 不在允许范围内。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40098)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      return patchWorkspaceDisplayDefault(db, user, workspaceId, patch)
    })

    return ok<WorkspaceDisplayPreferenceSnapshot>(snapshot, {
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
      return fail('当前用户无权修改该 Team 的团队默认显示偏好。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40397)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('Team 不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40497)
    }

    if (error instanceof Error && error.message === 'TEAM_WORKSPACE_DISPLAY_DEFAULT_UNSUPPORTED') {
      setResponseStatus(event, 400)
      return fail('个人工作区不支持团队默认显示偏好。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40099)
    }

    throw error
  }
})
