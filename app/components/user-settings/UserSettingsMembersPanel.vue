<script setup lang="ts">
import type { WorkspaceMemberManagementSnapshot, WorkspaceMemberSummary, WorkspaceWithQuota } from '~~/shared/types/domain'

type EditableWorkspaceRole = 'admin' | 'manager' | 'member'

const props = withDefaults(defineProps<{
  currentWorkspace?: WorkspaceWithQuota | null
  memberSummaryText?: string
  canInviteWorkspaceMembers?: boolean
  workspaceMemberLoading?: boolean
  workspaceMemberError?: string
  workspaceMemberActionError?: string
  workspaceMemberActionSuccess?: string
  workspaceMembers?: WorkspaceMemberSummary[]
  workspaceInvitations?: WorkspaceMemberManagementSnapshot['invitations']
  workspaceMemberRoleDrafts?: Record<string, EditableWorkspaceRole>
  workspaceMemberRoleSubmittingUserId?: string
  workspaceInvitationRevokingId?: string
  editableRoleOptions?: Array<{ value: EditableWorkspaceRole, label: string }>
  resolveInitial: (value: string | null | undefined) => string
  formatDateTime: (value: string) => string
  resolveMemberRoleLabel: (member: WorkspaceMemberSummary | null | undefined) => string
  formatWorkspaceRoleLabel: (role: string | null | undefined) => string
  resolveInvitationStatusLabel: (invitation: WorkspaceMemberManagementSnapshot['invitations'][number]) => string
  isRoleEditorVisible: (member: WorkspaceMemberSummary) => boolean
  canSubmitRoleChange: (member: WorkspaceMemberSummary) => boolean
}>(), {
  currentWorkspace: null,
  memberSummaryText: '',
  canInviteWorkspaceMembers: false,
  workspaceMemberLoading: false,
  workspaceMemberError: '',
  workspaceMemberActionError: '',
  workspaceMemberActionSuccess: '',
  workspaceMembers: () => [],
  workspaceInvitations: () => [],
  workspaceMemberRoleDrafts: () => ({}),
  workspaceMemberRoleSubmittingUserId: '',
  workspaceInvitationRevokingId: '',
  editableRoleOptions: () => [],
})

const emit = defineEmits<{
  openWorkspaceInvitationDialog: []
  updateWorkspaceMemberRoleDraft: [payload: { userId: string, role: EditableWorkspaceRole }]
  updateWorkspaceMemberRole: [member: WorkspaceMemberSummary]
  revokeWorkspaceInvitation: [invitationId: string]
}>()
</script>

<template>
  <div class="user-settings-panel user-settings-panel--stack">
    <template v-if="props.currentWorkspace">
      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="text-base text-slate-900 font-semibold">
              工作空间成员
            </p>
            <p class="text-sm text-slate-500 mt-1">
              {{ props.memberSummaryText }}
            </p>
          </div>
          <button
            class="user-settings-btn user-settings-btn--primary"
            :disabled="!props.canInviteWorkspaceMembers"
            @click="emit('openWorkspaceInvitationDialog')"
          >
            发起邀请
          </button>
        </div>

        <p v-if="props.workspaceMemberError" class="user-settings-feedback user-settings-feedback--danger">
          {{ props.workspaceMemberError }}
        </p>
        <p v-if="props.workspaceMemberActionError" class="user-settings-feedback user-settings-feedback--danger">
          {{ props.workspaceMemberActionError }}
        </p>
        <p v-if="props.workspaceMemberActionSuccess" class="user-settings-feedback user-settings-feedback--success">
          {{ props.workspaceMemberActionSuccess }}
        </p>

        <div v-if="props.workspaceMembers.length > 0" class="user-settings-member-list">
          <div
            v-for="member in props.workspaceMembers"
            :key="member.userId"
            class="user-settings-member-item"
          >
            <div class="user-settings-member-avatar">
              {{ props.resolveInitial(member.username) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-900 font-medium truncate">
                {{ member.username }}
              </p>
              <p class="text-xs text-slate-500 mt-1">
                加入时间 {{ props.formatDateTime(member.joinedAt) }}
              </p>
              <p class="text-xs text-slate-500 mt-1">
                当前权限 {{ props.resolveMemberRoleLabel(member) }} · 最近更新 {{ props.formatDateTime(member.updatedAt) }}
              </p>
            </div>
            <div class="user-settings-member-actions">
              <template v-if="props.isRoleEditorVisible(member)">
                <select
                  :value="props.workspaceMemberRoleDrafts[member.userId]"
                  class="user-settings-select user-settings-select--compact"
                  :disabled="props.workspaceMemberRoleSubmittingUserId === member.userId"
                  @change="emit('updateWorkspaceMemberRoleDraft', { userId: member.userId, role: ($event.target as HTMLSelectElement).value as EditableWorkspaceRole })"
                >
                  <option
                    v-for="option in props.editableRoleOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <button
                  class="user-settings-btn user-settings-btn--compact"
                  :disabled="!props.canSubmitRoleChange(member)"
                  @click="emit('updateWorkspaceMemberRole', member)"
                >
                  {{ props.workspaceMemberRoleSubmittingUserId === member.userId ? '保存中...' : '保存' }}
                </button>
              </template>
              <span v-else class="user-settings-chip">
                {{ props.resolveMemberRoleLabel(member) }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="user-settings-empty">
          {{ props.workspaceMemberLoading ? '成员信息加载中...' : '当前工作空间暂无成员记录。' }}
        </div>
      </section>

      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="text-base text-slate-900 font-semibold">
              邀请记录
            </p>
            <p class="text-sm text-slate-500 mt-1">
              展示当前工作空间待接受或已过期的邀请，以及邀请人信息。
            </p>
          </div>
        </div>

        <div v-if="props.workspaceInvitations.length > 0" class="user-settings-record-list">
          <div
            v-for="invitation in props.workspaceInvitations"
            :key="invitation.id"
            class="user-settings-record-item"
          >
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap gap-2 items-center">
                <p class="text-sm text-slate-900 font-semibold">
                  {{ invitation.inviteeUsername || '任意账号可加入' }}
                </p>
                <span class="user-settings-chip">
                  {{ props.formatWorkspaceRoleLabel(invitation.role) }}
                </span>
                <span class="user-settings-chip user-settings-chip--muted">
                  {{ props.resolveInvitationStatusLabel(invitation) }}
                </span>
              </div>
              <p class="text-xs text-slate-500 mt-2">
                邀请人 {{ invitation.invitedByUsername }} · 创建于 {{ props.formatDateTime(invitation.createdAt) }}
              </p>
              <p class="text-xs text-slate-500 mt-1">
                过期时间 {{ props.formatDateTime(invitation.expiresAt) }}
              </p>
            </div>
            <button
              v-if="props.canInviteWorkspaceMembers && !invitation.isExpired"
              class="user-settings-btn user-settings-btn--compact user-settings-btn--danger"
              :disabled="props.workspaceInvitationRevokingId === invitation.id"
              @click="emit('revokeWorkspaceInvitation', invitation.id)"
            >
              {{ props.workspaceInvitationRevokingId === invitation.id ? '撤销中...' : '撤销邀请' }}
            </button>
          </div>
        </div>

        <div v-else class="user-settings-empty">
          当前工作空间暂无邀请记录。
        </div>
      </section>
    </template>

    <div v-else class="user-settings-empty">
      当前账号暂无可见工作空间信息。
    </div>
  </div>
</template>
