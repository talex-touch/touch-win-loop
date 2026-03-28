import type {
  AiChatMessage,
  AiChatSession,
  Invitation,
  InvitationWithToken,
  TeamQuota,
  WorkspaceBillingEstimate,
  WorkspaceInvitationSummary,
  WorkspaceMemberManagementSnapshot,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'

export type TeamQuotaResponse = Omit<TeamQuota, 'workspaceId'>
export interface TeamWithQuotaResponse {
  team: WorkspaceWithQuota['workspace']
  quota: TeamQuotaResponse | null
}
export type TeamInvitationResponse = Omit<Invitation, 'workspaceId'>
export type TeamInvitationWithTokenResponse = Omit<InvitationWithToken, 'workspaceId'>
export type TeamInvitationSummaryResponse = Omit<WorkspaceInvitationSummary, 'workspaceId'>
export type TeamMemberManagementSnapshotResponse = Omit<WorkspaceMemberManagementSnapshot, 'workspaceId' | 'invitations'> & {
  invitations: TeamInvitationSummaryResponse[]
}
export type TeamBillingEstimateResponse = Omit<WorkspaceBillingEstimate, 'workspaceId'>
export type TeamChatSessionResponse = Omit<AiChatSession, 'workspaceId'> & { teamId: string }
export type TeamChatMessageResponse = Omit<AiChatMessage, 'workspaceId'> & { teamId: string }

function normalizeTeamId(teamId: string, workspaceId?: string): string {
  return String(teamId || workspaceId || '').trim()
}

export function toTeamQuotaResponse(quota: TeamQuota | null): TeamQuotaResponse | null {
  if (!quota)
    return null
  const { workspaceId: _workspaceId, ...rest } = quota
  return rest
}

export function toTeamWithQuotaResponse(item: WorkspaceWithQuota): TeamWithQuotaResponse {
  return {
    team: item.workspace,
    quota: toTeamQuotaResponse(item.quota),
  }
}

export function toTeamInvitationResponse(invitation: Invitation): TeamInvitationResponse {
  const { workspaceId: _workspaceId, ...rest } = invitation
  return rest
}

export function toTeamInvitationWithTokenResponse(invitation: InvitationWithToken): TeamInvitationWithTokenResponse {
  const { workspaceId: _workspaceId, ...rest } = invitation
  return rest
}

export function toTeamInvitationSummaryResponse(invitation: WorkspaceInvitationSummary): TeamInvitationSummaryResponse {
  const { workspaceId: _workspaceId, ...rest } = invitation
  return rest
}

export function toTeamMemberManagementSnapshotResponse(snapshot: WorkspaceMemberManagementSnapshot): TeamMemberManagementSnapshotResponse {
  const { workspaceId: _workspaceId, invitations, ...rest } = snapshot
  return {
    ...rest,
    invitations: invitations.map(toTeamInvitationSummaryResponse),
  }
}

export function toTeamBillingEstimateResponse(estimate: WorkspaceBillingEstimate): TeamBillingEstimateResponse {
  const { workspaceId: _workspaceId, ...rest } = estimate
  return rest
}

export function toTeamChatSessionResponse(session: AiChatSession): TeamChatSessionResponse {
  const { workspaceId, teamId, ...rest } = session
  return {
    ...rest,
    teamId: normalizeTeamId(String(teamId || ''), workspaceId),
  }
}

export function toTeamChatMessageResponse(message: AiChatMessage): TeamChatMessageResponse {
  const { workspaceId, teamId, ...rest } = message
  return {
    ...rest,
    teamId: normalizeTeamId(String(teamId || ''), workspaceId),
  }
}
