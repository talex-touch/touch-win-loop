import { buildOnlyOfficeUserFacingErrorMessage } from '~~/shared/constants/onlyoffice'
import type {
  ProjectInvitationSummary,
  ProjectMemberRole,
  ProjectResourceShare,
  ResourcePreviewStatus,
  WorkspaceType,
} from '~~/shared/types/domain'

export function previewStatusLabel(status: ResourcePreviewStatus | ''): string {
  if (status === 'queued')
    return '排队中'
  if (status === 'converting')
    return '转换中'
  if (status === 'finalizing')
    return '收尾处理中'
  if (status === 'succeeded')
    return '已完成'
  if (status === 'failed')
    return '转换失败'
  return '等待中'
}

export function formatEtaSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds || 0)))
  if (safe <= 0)
    return '即将完成'
  if (safe < 60)
    return `约 ${safe} 秒`
  const minutes = Math.ceil(safe / 60)
  if (minutes < 60)
    return `约 ${minutes} 分钟`
  const hours = Math.ceil(minutes / 60)
  return `约 ${hours} 小时`
}

export function previewErrorMessage(rawMessage: string): string {
  const normalized = String(rawMessage || '').trim()
  if (!normalized)
    return ''
  if (normalized.startsWith('ONLYOFFICE_CONVERT_'))
    return buildOnlyOfficeUserFacingErrorMessage(normalized)
  return normalized
}

export function workspaceTypeLabel(value: WorkspaceType | ''): string {
  if (value === 'personal')
    return '个人项目台'
  if (value === 'team')
    return 'Team 项目台'
  return '项目台'
}

export function workspaceRoleLabel(role: ProjectMemberRole): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  return '查看者'
}

export function workspaceInvitationStatus(invitation: ProjectInvitationSummary): 'pending' | 'expired' | 'accepted' {
  if (String(invitation.acceptedAt || '').trim())
    return 'accepted'
  if (invitation.isExpired)
    return 'expired'
  return 'pending'
}

export function workspaceInvitationStatusLabel(invitation: ProjectInvitationSummary): string {
  const status = workspaceInvitationStatus(invitation)
  if (status === 'accepted')
    return '已接受'
  if (status === 'expired')
    return '已过期'
  return '待接受'
}

export function workspaceInvitationStatusBadgeClass(invitation: ProjectInvitationSummary): string {
  const status = workspaceInvitationStatus(invitation)
  if (status === 'accepted')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'expired')
    return 'border-rose-200 bg-rose-50 text-rose-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

export function workspaceInvitationScopeLabel(invitation: ProjectInvitationSummary): string {
  const projectTitle = String(invitation.projectTitle || '').trim()
  const roleLabel = workspaceRoleLabel(invitation.projectRole || 'viewer')
  if (projectTitle)
    return `加入项目：${projectTitle} · 项目角色：${roleLabel}`
  return `项目角色：${roleLabel}`
}

export function formatDateTime(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'

  const date = new Date(normalized)
  if (!Number.isFinite(date.getTime()))
    return normalized

  return date.toLocaleString('zh-CN', { hour12: false })
}

export function shareVisibilityLabel(value: string): string {
  if (value === 'workspace')
    return '组织内成员可见'
  return '公开可见'
}

export function getShareStatus(share: ProjectResourceShare): 'active' | 'expired' | 'revoked' {
  if (String(share.revokedAt || '').trim())
    return 'revoked'

  const expiresAtMs = new Date(String(share.expiresAt || '')).getTime()
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now())
    return 'expired'
  return 'active'
}

export function shareStatusLabel(share: ProjectResourceShare): string {
  const status = getShareStatus(share)
  if (status === 'revoked')
    return '已失效'
  if (status === 'expired')
    return '已过期'
  return '生效中'
}

export function shareStatusBadgeClass(share: ProjectResourceShare): string {
  const status = getShareStatus(share)
  if (status === 'revoked')
    return 'text-rose-600 border-rose-200 bg-rose-50'
  if (status === 'expired')
    return 'text-amber-700 border-amber-200 bg-amber-50'
  return 'text-emerald-700 border-emerald-200 bg-emerald-50'
}
