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

const editableRoleSelectOptions = computed(() => props.editableRoleOptions.map(option => ({
  label: option.label,
  value: option.value,
})))
</script>

<template>
  <div class="user-settings-panel user-settings-panel--stack">
    <template v-if="props.currentWorkspace">
      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="user-settings-section-title">
              工作空间成员
            </p>
            <p class="user-settings-copy mt-1">
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
            <UnifiedAvatar
              :name="member.username"
              :src="member.avatarUrl"
              :size="34"
              popover
            >
              <template #popover>
                <div class="user-settings-member-popover">
                  <div class="user-settings-member-popover__header">
                    <UnifiedAvatar :name="member.username" :src="member.avatarUrl" :size="42" />
                    <div class="min-w-0">
                      <p class="user-settings-member-popover__name">
                        {{ member.username }}
                      </p>
                      <p class="user-settings-member-popover__id">
                        {{ member.userId }}
                      </p>
                    </div>
                  </div>
                  <dl class="user-settings-member-popover__detail">
                    <div>
                      <dt>权限</dt>
                      <dd>{{ props.resolveMemberRoleLabel(member) }}</dd>
                    </div>
                    <div>
                      <dt>加入时间</dt>
                      <dd>{{ props.formatDateTime(member.joinedAt) }}</dd>
                    </div>
                    <div>
                      <dt>最近更新</dt>
                      <dd><Time :value="member.updatedAt" /></dd>
                    </div>
                  </dl>
                </div>
              </template>
            </UnifiedAvatar>
            <div class="flex-1 min-w-0">
              <p class="user-settings-name truncate">
                {{ member.username }}
              </p>
              <p class="user-settings-meta mt-1">
                加入时间 {{ props.formatDateTime(member.joinedAt) }} · 最近更新 <Time :value="member.updatedAt" />
              </p>
            </div>
            <div class="user-settings-member-actions">
              <template v-if="props.isRoleEditorVisible(member)">
                <UiSelect
                  :model-value="props.workspaceMemberRoleDrafts[member.userId]"
                  :options="editableRoleSelectOptions"
                  class="user-settings-select user-settings-select--compact"
                  :disabled="props.workspaceMemberRoleSubmittingUserId === member.userId"
                  size="xs"
                  aria-label="空间角色"
                  @change="value => emit('updateWorkspaceMemberRoleDraft', { userId: member.userId, role: value as EditableWorkspaceRole })"
                />
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
            <p class="user-settings-section-title">
              邀请记录
            </p>
            <p class="user-settings-copy mt-1">
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
                <p class="user-settings-name">
                  {{ invitation.inviteeUsername || '任意账号可加入' }}
                </p>
                <span class="user-settings-chip">
                  {{ props.formatWorkspaceRoleLabel(invitation.role) }}
                </span>
                <span class="user-settings-chip user-settings-chip--muted">
                  {{ props.resolveInvitationStatusLabel(invitation) }}
                </span>
              </div>
              <p class="user-settings-meta mt-2">
                邀请人 {{ invitation.invitedByUsername }} · 创建于 {{ props.formatDateTime(invitation.createdAt) }}
              </p>
              <p class="user-settings-meta mt-1">
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
