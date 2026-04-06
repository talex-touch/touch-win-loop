import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { toTeamMemberManagementSnapshotResponse } from '~~/server/utils/team-api-presenter'
import { teamGetWorkspaceMemberManagementSnapshot, teamPatchWorkspaceMemberRole } from '~~/server/utils/team-membership-store'

type PatchableWorkspaceRole = 'admin' | 'manager' | 'member'

interface PatchWorkspaceMemberRoleBody {
  role?: PatchableWorkspaceRole
}

const ALLOWED_ROLES: PatchableWorkspaceRole[] = ['admin', 'manager', 'member']

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)

  const workspaceId = String(getRouterParam(event, 'id') || '').trim()
  const targetUserId = String(getRouterParam(event, 'userId') || '').trim()
  const body = await readBody<PatchWorkspaceMemberRoleBody>(event)

  const roleCandidate = body?.role
  const role: PatchableWorkspaceRole | null = roleCandidate && ALLOWED_ROLES.includes(roleCandidate)
    ? roleCandidate
    : null

  if (!workspaceId || !targetUserId || !role) {
    setResponseStatus(event, 400)
    return fail('缺少 teamId、targetUserId 或 role（仅支持 admin/manager/member）。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40092)
  }

  try {
    const snapshot = await withTransaction(event, async (db) => {
      const updated = await teamPatchWorkspaceMemberRole(db, {
        workspaceId,
        actorUser: user,
        targetUserId,
        role,
      })

      if (!updated)
        throw new Error('WORKSPACE_MEMBER_NOT_FOUND')

      return teamGetWorkspaceMemberManagementSnapshot(db, workspaceId)
    })

    return ok(toTeamMemberManagementSnapshotResponse(snapshot), {
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
      return fail('当前用户无权修改该 Team 成员角色。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40392)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_MEMBER_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('目标成员不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40492)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      setResponseStatus(event, 404)
      return fail('Team 不存在。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40493)
    }

    if (error instanceof Error && error.message === 'WORKSPACE_OWNER_IMMUTABLE') {
      setResponseStatus(event, 409)
      return fail('owner 角色不可由他人变更。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40992)
    }

    if (error instanceof Error && error.message === 'PERSONAL_WORKSPACE_SECONDARY_ROLE_FORBIDDEN') {
      setResponseStatus(event, 403)
      return fail('个人项目台不支持 admin 或 manager 空间角色。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40393)
    }

    throw error
  }
})
