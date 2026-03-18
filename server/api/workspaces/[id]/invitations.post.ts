import type { WorkspaceMemberRole } from '~~/shared/types/domain'
import { setResponseStatus } from 'h3'
import { fail, ok } from '~~/server/utils/api'
import { requireAuth } from '~~/server/utils/auth'
import { withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { createInvitation, hasWorkspaceRoles } from '~~/server/utils/platform-store'
import { createSessionToken, hashToken } from '~~/server/utils/security'

interface InvitationBody {
  inviteeUsername?: string
  role?: WorkspaceMemberRole
  collegeCodes?: string[]
  expiresInDays?: number
}

const MANAGE_INVITATION_ROLES: WorkspaceMemberRole[] = ['team_owner', 'team_admin', 'school_admin']
const ALLOWED_ROLES: WorkspaceMemberRole[] = ['team_owner', 'team_admin', 'school_admin', 'college_admin', 'advisor', 'member']

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const { user } = await requireAuth(event)
  const workspaceId = getRouterParam(event, 'id') || ''
  const body = await readBody<InvitationBody>(event)

  if (!workspaceId) {
    setResponseStatus(event, 400)
    return fail('缺少 workspaceId。', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: false,
      attempts: 1,
    }, 40021)
  }

  const role = ALLOWED_ROLES.includes(body?.role as WorkspaceMemberRole)
    ? (body?.role as WorkspaceMemberRole)
    : 'member'

  const inviteeUsername = String(body?.inviteeUsername || '').trim() || null
  const collegeCodes = Array.isArray(body?.collegeCodes)
    ? body!.collegeCodes!.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const expiresInDays = Math.max(1, Math.min(30, Number(body?.expiresInDays || 7)))
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const token = createSessionToken()
  const tokenHash = hashToken(token)

  try {
    const invitation = await withTransaction(event, async (db) => {
      const canManage = await hasWorkspaceRoles(db, user, workspaceId, MANAGE_INVITATION_ROLES)
      if (!canManage)
        throw new Error('FORBIDDEN')

      return createInvitation(db, {
        workspaceId,
        invitedByUserId: user.id,
        tokenHash,
        inviteeUsername,
        role,
        collegeCodes,
        expiresAt,
      })
    })

    return ok({
      ...invitation,
      token,
    }, {
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
      return fail('当前用户无权发送邀请。', {
        startedAt,
        provider: runtime.ai.provider,
        model: runtime.ai.model,
        fallbackUsed: false,
        attempts: 1,
      }, 40321)
    }
    throw error
  }
})
