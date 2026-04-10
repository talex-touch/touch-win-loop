<script setup lang="ts">
import type { ProjectInvitationSummary, ProjectMemberRole, ProjectMemberSummary, WorkspaceType } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  workspaceName?: string
  workspaceType?: WorkspaceType | ''
  workspaceMembers?: ProjectMemberSummary[]
  workspaceInvitations?: ProjectInvitationSummary[]
  workspaceMemberManagementLoading?: boolean
  workspaceCanManageMembers?: boolean
  workspaceCanEditMembers?: boolean
  workspaceMemberRoleUpdatingUserId?: string
  workspaceMemberRemovingUserId?: string
  workspaceInvitationRevokingId?: string
  workspaceCanManageBillingSeats?: boolean
  workspaceSeatUsed?: number
  workspaceSeatLimit?: number | null
  workspaceSupportsSeatAdd?: boolean
  workspaceInvitationSubmitting?: boolean
  workspaceMemberRoleDraftMap?: Record<string, ProjectMemberRole>
  projectRoleOptions?: ProjectMemberRole[]
  workspaceTypeLabel: (value: WorkspaceType | '') => string
  workspaceMemberRoleSummary: (member: ProjectMemberSummary) => string
  workspaceInvitationStatusLabel: (invitation: ProjectInvitationSummary) => string
  workspaceInvitationStatusBadgeClass: (invitation: ProjectInvitationSummary) => string
  workspaceInvitationScopeLabel: (invitation: ProjectInvitationSummary) => string
  workspaceRoleLabel: (role: ProjectMemberRole) => string
  canRemoveWorkspaceMember: (member: ProjectMemberSummary) => boolean
  formatDateTime: (value: string) => string
}>(), {
  workspaceName: '',
  workspaceType: '',
  workspaceMembers: () => [],
  workspaceInvitations: () => [],
  workspaceMemberManagementLoading: false,
  workspaceCanManageMembers: false,
  workspaceCanEditMembers: false,
  workspaceMemberRoleUpdatingUserId: '',
  workspaceMemberRemovingUserId: '',
  workspaceInvitationRevokingId: '',
  workspaceCanManageBillingSeats: false,
  workspaceSeatUsed: 0,
  workspaceSeatLimit: null,
  workspaceSupportsSeatAdd: false,
  workspaceInvitationSubmitting: false,
  workspaceMemberRoleDraftMap: () => ({}),
  projectRoleOptions: () => ['manager', 'editor', 'viewer'],
})

const emit = defineEmits<{
  openWorkspaceInviteModal: []
  reloadWorkspaceMemberManagement: []
  openWorkspaceSeatModal: []
  updateWorkspaceMemberRoleDraft: [payload: { userId: string, role: ProjectMemberRole }]
  submitWorkspaceMemberRole: [member: ProjectMemberSummary]
  removeWorkspaceMember: [member: ProjectMemberSummary]
  revokeWorkspaceInvitation: [invitationId: string]
}>()

const normalizedWorkspaceSeatUsed = computed(() => {
  return Math.max(0, Math.trunc(Number(props.workspaceSeatUsed || 0)))
})

const normalizedWorkspaceSeatLimit = computed<number | null>(() => {
  const raw = Number(props.workspaceSeatLimit)
  if (!Number.isFinite(raw) || raw <= 0)
    return null
  return Math.max(1, Math.trunc(raw))
})

const workspaceCanAddSeat = computed(() => {
  return props.workspaceSupportsSeatAdd && props.workspaceCanManageBillingSeats
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white" data-testid="project-collab-panel">
      <div class="mb-3 flex flex-wrap gap-3 items-start justify-between">
        <div class="flex gap-3 items-center">
          <span class="material-symbols-outlined text-xl text-blue-600">group</span>
          <div>
            <h3 class="text-xs text-slate-700 font-semibold">
              项目协作管理
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              所属 Team：{{ props.workspaceName || '当前 Team' }} · {{ props.workspaceTypeLabel(props.workspaceType) }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 items-center">
          <button
            data-testid="project-collab-open-invite-button"
            class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            :disabled="!props.workspaceCanManageMembers || props.workspaceInvitationSubmitting"
            @click="emit('openWorkspaceInviteModal')"
          >
            {{ props.workspaceInvitationSubmitting ? '生成中...' : '生成邀请链接' }}
          </button>
          <button
            class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            :disabled="props.workspaceMemberManagementLoading"
            @click="emit('reloadWorkspaceMemberManagement')"
          >
            刷新
          </button>
        </div>
      </div>

      <div class="mb-3">
        <article class="p-3 border border-slate-200 rounded bg-slate-50/60">
          <p class="text-xs text-slate-600 font-semibold">
            项目席位概览
          </p>
          <p class="text-sm text-slate-800 font-bold mt-1">
            {{ normalizedWorkspaceSeatUsed }} / {{ normalizedWorkspaceSeatLimit ?? '--' }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            每个项目最多支持 15 个协作席位，接受邀请时会同时加入当前空间与项目。
          </p>

          <div class="mt-2 flex flex-wrap gap-2 items-center">
            <button
              v-if="workspaceCanAddSeat"
              class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700"
              type="button"
              @click="emit('openWorkspaceSeatModal')"
            >
              调整项目席位
            </button>
            <span
              v-else
              class="text-xs text-slate-600 px-2.5 py-1 border border-slate-200 rounded bg-slate-100"
            >
              仅具备项目管理权限的成员可调整席位
            </span>
          </div>
        </article>
      </div>

      <div v-if="props.workspaceMemberManagementLoading" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
        正在加载项目协作成员...
      </div>

      <template v-else>
        <div class="gap-3 grid grid-cols-1 xl:grid-cols-[1.2fr,1fr]">
          <section class="border border-slate-200 rounded bg-slate-50/40">
            <div class="text-xs text-slate-600 font-semibold px-3 py-2 border-b border-slate-200 bg-white">
              项目成员（{{ props.workspaceMembers.length }}）
            </div>

            <div v-if="props.workspaceMembers.length === 0" class="text-xs text-slate-500 px-3 py-3">
              当前项目暂无成员记录。
            </div>

            <div v-else class="divide-slate-200 divide-y" data-testid="project-member-list">
              <article
                v-for="member in props.workspaceMembers"
                :key="member.userId"
                data-testid="project-member-item"
                :data-user-id="member.userId"
                :data-username="member.username"
                class="px-3 py-2.5"
              >
                <div class="flex flex-wrap gap-2 items-center justify-between">
                  <p class="text-xs text-slate-800 font-semibold">
                    {{ member.username }}
                  </p>
                  <p class="text-xs text-slate-500">
                    {{ props.formatDateTime(member.createdAt) }}
                  </p>
                </div>
                <p class="text-xs text-slate-600 mt-1" data-testid="project-member-role-summary">
                  {{ props.workspaceMemberRoleSummary(member) }}
                </p>
                <p v-if="member.addedByUsername" class="text-xs text-slate-500 mt-1">
                  添加人：{{ member.addedByUsername }}
                </p>
                <div
                  v-if="props.workspaceCanEditMembers && member.role !== 'owner'"
                  class="mt-2 flex flex-wrap gap-2 items-center"
                >
                  <select
                    :value="props.workspaceMemberRoleDraftMap[member.userId]"
                    data-testid="project-member-role-select"
                    class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-7 focus:border-blue-500"
                    @change="emit('updateWorkspaceMemberRoleDraft', { userId: member.userId, role: ($event.target as HTMLSelectElement).value as ProjectMemberRole })"
                  >
                    <option
                      v-for="role in props.projectRoleOptions"
                      :key="`member-role-option-${member.userId}-${role}`"
                      :value="role"
                    >
                      {{ props.workspaceRoleLabel(role) }}
                    </option>
                  </select>
                  <button
                    data-testid="project-member-role-update-button"
                    class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="props.workspaceMemberRoleUpdatingUserId === member.userId || props.workspaceMemberRemovingUserId === member.userId"
                    @click="emit('submitWorkspaceMemberRole', member)"
                  >
                    {{ props.workspaceMemberRoleUpdatingUserId === member.userId ? '更新中...' : '更新项目角色' }}
                  </button>
                </div>
                <div
                  v-if="props.canRemoveWorkspaceMember(member)"
                  class="mt-2 flex flex-wrap gap-2 items-center"
                >
                  <button
                    data-testid="project-member-remove-button"
                    class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="props.workspaceMemberRoleUpdatingUserId === member.userId || props.workspaceMemberRemovingUserId === member.userId"
                    @click="emit('removeWorkspaceMember', member)"
                  >
                    {{ props.workspaceMemberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section>
            <div class="border border-slate-200 rounded bg-white">
              <div class="text-xs text-slate-600 font-semibold px-3 py-2 border-b border-slate-200 bg-slate-50">
                待处理邀请（{{ props.workspaceInvitations.length }}）
              </div>

              <div v-if="props.workspaceInvitations.length === 0" class="text-xs text-slate-500 px-3 py-3">
                暂无待处理邀请。
              </div>

              <div v-else class="divide-slate-200 divide-y" data-testid="project-invitation-list">
                <article
                  v-for="invitation in props.workspaceInvitations"
                  :key="invitation.id"
                  data-testid="project-invitation-item"
                  :data-invitation-id="invitation.id"
                  class="px-3 py-2.5"
                >
                  <div class="flex flex-wrap gap-2 items-center justify-between">
                    <p class="text-xs text-slate-800 font-semibold">
                      {{ invitation.inviteeUsername || '通用邀请（未绑定用户）' }}
                    </p>
                    <span
                      class="text-xs font-semibold px-2 py-0.5 border rounded-full"
                      :class="props.workspaceInvitationStatusBadgeClass(invitation)"
                    >
                      {{ props.workspaceInvitationStatusLabel(invitation) }}
                    </span>
                  </div>
                  <p class="text-xs text-slate-600 mt-1">
                    {{ props.workspaceRoleLabel(invitation.projectRole || 'viewer') }} · 发起人 {{ invitation.invitedByUsername }}
                  </p>
                  <p class="text-xs text-slate-500 mt-1">
                    {{ props.workspaceInvitationScopeLabel(invitation) }}
                  </p>
                  <p class="text-xs text-slate-500 mt-1">
                    过期时间：{{ props.formatDateTime(invitation.expiresAt) }}
                  </p>
                  <button
                    v-if="props.workspaceCanManageMembers && !invitation.acceptedAt && !invitation.isExpired"
                    class="text-xs text-rose-600 font-semibold mt-2 px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="props.workspaceInvitationRevokingId === invitation.id"
                    @click="emit('revokeWorkspaceInvitation', invitation.id)"
                  >
                    {{ props.workspaceInvitationRevokingId === invitation.id ? '撤销中...' : '撤销邀请' }}
                  </button>
                </article>
              </div>
            </div>
          </section>
        </div>
      </template>
    </section>
  </div>
</template>
