import type { WorkspaceDisplayPreferencesPatchInput } from '~~/server/utils/workspace-display-preference-store'
import type { WorkspaceDisplayPreferenceSnapshot, WorkspaceFontSizePreset, WorkspaceTabSpacingPreset } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { isWorkspaceFontSizePreset, isWorkspaceTabSpacingPreset, patchUserWorkspaceDisplayOverride } from '~~/server/utils/workspace-display-preference-store'
import { normalizeWorkspaceLeftSidebarWidth, normalizeWorkspaceRightSidebarWidth } from '~~/shared/utils/workspace-layout'

interface PatchWorkspaceDisplayPreferencesBody {
  fontSizePreset?: WorkspaceFontSizePreset | null
  tabSpacingPreset?: WorkspaceTabSpacingPreset | null
  leftSidebarWidth?: number | null
  rightSidebarWidth?: number | null
}

const INVALID_WIDTH = Symbol('invalid-width')

function parseWorkspaceSidebarWidth(
  value: unknown,
  normalizer: (value: unknown) => number,
): number | null | typeof INVALID_WIDTH {
  if (value === null)
    return null
  const normalized = Number(value)
  if (!Number.isFinite(normalized))
    return INVALID_WIDTH
  return normalizer(normalized)
}

function parsePatchInput(body: PatchWorkspaceDisplayPreferencesBody | null | undefined): WorkspaceDisplayPreferencesPatchInput | null {
  if (!body)
    return null

  const patch: WorkspaceDisplayPreferencesPatchInput = {}
  const hasFontSizePreset = Object.prototype.hasOwnProperty.call(body, 'fontSizePreset')
  const hasTabSpacingPreset = Object.prototype.hasOwnProperty.call(body, 'tabSpacingPreset')
  const hasLeftSidebarWidth = Object.prototype.hasOwnProperty.call(body, 'leftSidebarWidth')
  const hasRightSidebarWidth = Object.prototype.hasOwnProperty.call(body, 'rightSidebarWidth')
  if (!hasFontSizePreset && !hasTabSpacingPreset && !hasLeftSidebarWidth && !hasRightSidebarWidth)
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

  if (hasLeftSidebarWidth) {
    const width = parseWorkspaceSidebarWidth(body.leftSidebarWidth, normalizeWorkspaceLeftSidebarWidth)
    if (width === INVALID_WIDTH)
      return null
    patch.leftSidebarWidth = width
  }

  if (hasRightSidebarWidth) {
    const width = parseWorkspaceSidebarWidth(body.rightSidebarWidth, normalizeWorkspaceRightSidebarWidth)
    if (width === INVALID_WIDTH)
      return null
    patch.rightSidebarWidth = width
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
    return fail('缺少 teamId，或 fontSizePreset / tabSpacingPreset / leftSidebarWidth / rightSidebarWidth 不在允许范围内。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40097)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      return patchUserWorkspaceDisplayOverride(db, user, workspaceId, patch)
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
      return fail('当前用户无权修改该工作空间的个人显示覆盖。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40396)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('Team 不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40496)
    }

    throw error
  }
})
