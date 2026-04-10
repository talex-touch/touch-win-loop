<script setup lang="ts">
import type {
  ProjectInvitationSummary,
  ProjectMemberRole,
  ProjectMemberSummary,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  visible?: boolean
  loading?: boolean
  errorText?: string
  memberList?: ProjectMemberSummary[]
  invitationList?: ProjectInvitationSummary[]
  memberSeatSummary?: string
  canManageProjectMembers?: boolean
  canEditProjectMembers?: boolean
  memberActionText?: string
  memberActionError?: boolean
  memberRoleUpdatingUserId?: string
  memberRemovingUserId?: string
  invitationSubmitting?: boolean
  invitationLink?: string
  invitationFeedbackText?: string
  invitationForm: {
    inviteeUsername: string
    role: ProjectMemberRole
    expiresInDays: number
  }
  roleDraftMap: Record<string, 'manager' | 'editor' | 'viewer'>
  projectInviteRoleOptions?: ProjectMemberRole[]
  canSubmitProjectInvitation?: boolean
  roleLabel: (role: ProjectMemberRole) => string
  canEditMember: (member: { role: ProjectMemberRole }) => boolean
  canRemoveMember: (member: { role: ProjectMemberRole }) => boolean
  invitationStatusLabel: (invitation: ProjectInvitationSummary) => string
  invitationStatusClass: (invitation: ProjectInvitationSummary) => string
}>(), {
  visible: false,
  loading: false,
  errorText: '',
  memberList: () => [],
  invitationList: () => [],
  memberSeatSummary: '未配置',
  canManageProjectMembers: false,
  canEditProjectMembers: false,
  memberActionText: '',
  memberActionError: false,
  memberRoleUpdatingUserId: '',
  memberRemovingUserId: '',
  invitationSubmitting: false,
  invitationLink: '',
  invitationFeedbackText: '',
  projectInviteRoleOptions: () => ['viewer'],
  canSubmitProjectInvitation: false,
})

const emit = defineEmits<{
  close: []
  createInvitation: []
  copyInvitationLink: []
  submitMemberRole: [member: ProjectMemberSummary]
  removeMember: [userId: string]
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value)
      emit('close')
  },
})
</script>

<template>
  <a-modal
    v-model:visible="modelVisible"
    title="成员管理"
    data-testid="team-project-members-modal"
    width="680px"
    :footer="false"
    :esc-to-close="true"
    :mask-closable="true"
    @cancel="emit('close')"
  >
    <div class="space-y-4">
      <div class="gap-2 grid grid-cols-3">
        <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
          <div class="text-xs text-slate-500">
            当前成员
          </div>
          <div class="text-sm text-slate-900 font-semibold mt-1">
            {{ memberList.length }} 人
          </div>
        </div>
        <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
          <div class="text-xs text-slate-500">
            邀请记录
          </div>
          <div class="text-sm text-slate-900 font-semibold mt-1">
            {{ invitationList.length }} 条
          </div>
        </div>
        <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
          <div class="text-xs text-slate-500">
            项目席位
          </div>
          <div class="text-sm text-slate-900 font-semibold mt-1">
            {{ memberSeatSummary }}
          </div>
        </div>
      </div>

      <section class="space-y-3">
        <div class="flex gap-2 items-center justify-between">
          <div class="text-xs text-slate-500 font-medium">
            创建邀请链接
          </div>
          <span class="text-xs text-slate-400">
            留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入
          </span>
        </div>

        <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50/80 space-y-3">
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">邀请用户名（可选）</span>
            <input
              v-model="invitationForm.inviteeUsername"
              data-testid="team-project-invite-username-input"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              placeholder="留空则生成可多人加入的通用邀请链接"
            >
          </label>

          <div class="gap-2 grid grid-cols-2">
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">项目角色</span>
              <select
                v-model="invitationForm.role"
                data-testid="team-project-invite-role-select"
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              >
                <option
                  v-for="role in projectInviteRoleOptions"
                  :key="`team-project-role-option-${role}`"
                  :value="role"
                >
                  {{ roleLabel(role) }}
                </option>
              </select>
            </label>

            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">有效期</span>
              <select
                v-model.number="invitationForm.expiresInDays"
                data-testid="team-project-invite-expiry-select"
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              >
                <option :value="1">
                  1 天
                </option>
                <option :value="3">
                  3 天
                </option>
                <option :value="7">
                  7 天
                </option>
                <option :value="14">
                  14 天
                </option>
                <option :value="30">
                  30 天
                </option>
              </select>
            </label>
          </div>

          <div
            v-if="invitationLink"
            class="p-3 border border-slate-200 rounded-2xl bg-white"
          >
            <div class="text-xs text-slate-500">
              最新邀请链接
            </div>
            <div
              data-testid="team-project-invite-link"
              class="text-xs text-slate-700 mt-2 break-all"
            >
              {{ invitationLink }}
            </div>
            <div class="mt-3 flex justify-end">
              <a-button
                size="small"
                data-testid="team-project-invite-copy-link-button"
                @click="emit('copyInvitationLink')"
              >
                复制邀请链接
              </a-button>
            </div>
          </div>

          <div
            v-if="invitationFeedbackText"
            class="text-xs px-3 py-2 rounded-xl"
            :class="invitationLink ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
          >
            {{ invitationFeedbackText }}
          </div>

          <div class="flex justify-end">
            <a-button
              size="small"
              type="primary"
              data-testid="team-project-invite-submit-button"
              :loading="invitationSubmitting"
              :disabled="!canSubmitProjectInvitation"
              @click="emit('createInvitation')"
            >
              生成邀请链接
            </a-button>
          </div>
        </div>
      </section>

      <div
        v-if="loading"
        class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
      >
        正在加载成员信息...
      </div>

      <div
        v-else-if="errorText"
        class="text-xs text-rose-600 p-4 border border-rose-200 rounded-2xl bg-rose-50"
      >
        {{ errorText }}
      </div>

      <template v-else>
        <section class="space-y-2">
          <div class="flex gap-2 items-center justify-between">
            <div class="text-xs text-slate-500 font-medium">
              当前成员
            </div>
            <span
              v-if="canEditProjectMembers"
              class="text-xs text-slate-400"
            >
              可直接调整成员项目角色
            </span>
          </div>
          <div
            v-if="memberActionText"
            class="text-xs px-3 py-2 rounded-xl"
            :class="memberActionError ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'"
          >
            {{ memberActionText }}
          </div>
          <div
            v-if="memberList.length === 0"
            class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
          >
            当前项目还没有成员记录。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="member in memberList"
              :key="member.userId"
              class="p-3 border border-slate-200 rounded-2xl bg-white"
            >
              <div class="flex gap-3 items-start justify-between">
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-slate-900 font-semibold">
                    {{ member.username }}
                  </div>
                  <div class="text-xs text-slate-500 mt-2">
                    添加人：{{ member.addedByUsername }} · 更新时间：{{ member.updatedAt }}
                  </div>
                </div>

                <div
                  v-if="canEditMember(member)"
                  class="flex shrink-0 gap-2 items-center"
                >
                  <select
                    v-model="roleDraftMap[member.userId]"
                    data-testid="team-project-member-role-select"
                    class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-7 focus:border-blue-500"
                  >
                    <option
                      v-for="role in ['manager', 'editor', 'viewer']"
                      :key="`team-project-member-role-${member.userId}-${role}`"
                      :value="role"
                    >
                      {{ roleLabel(role) }}
                    </option>
                  </select>
                  <button
                    data-testid="team-project-member-role-update-button"
                    class="text-xs text-slate-700 font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="memberRoleUpdatingUserId === member.userId || memberRemovingUserId === member.userId"
                    @click="emit('submitMemberRole', member)"
                  >
                    {{ memberRoleUpdatingUserId === member.userId ? '更新中...' : '更新权限' }}
                  </button>
                  <button
                    v-if="canRemoveMember(member)"
                    data-testid="team-project-member-remove-button"
                    class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="memberRoleUpdatingUserId === member.userId || memberRemovingUserId === member.userId"
                    @click="emit('removeMember', member.userId)"
                  >
                    {{ memberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                  </button>
                </div>

                <span
                  v-else
                  class="text-xs text-slate-700 font-semibold px-2 py-1 rounded-full bg-slate-100 shrink-0"
                >
                  {{ roleLabel(member.role) }}
                </span>
              </div>
              <div
                v-if="!canEditMember(member) && canRemoveMember(member)"
                class="mt-3 flex justify-end"
              >
                <button
                  data-testid="team-project-member-remove-button"
                  class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  :disabled="memberRoleUpdatingUserId === member.userId || memberRemovingUserId === member.userId"
                  @click="emit('removeMember', member.userId)"
                >
                  {{ memberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-2">
          <div class="text-xs text-slate-500 font-medium">
            邀请记录
          </div>
          <div
            v-if="invitationList.length === 0"
            class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
          >
            当前没有未处理的邀请记录。
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="invitation in invitationList"
              :key="invitation.id"
              class="p-3 border border-slate-200 rounded-2xl bg-white"
            >
              <div class="flex gap-2 items-center justify-between">
                <div class="text-sm text-slate-900 font-semibold">
                  {{ invitation.inviteeUsername || '通用邀请链接' }}
                </div>
                <span
                  class="text-xs font-semibold px-2 py-1 border rounded-full"
                  :class="invitationStatusClass(invitation)"
                >
                  {{ invitationStatusLabel(invitation) }}
                </span>
              </div>
              <div class="text-xs text-slate-500 mt-2">
                发起人：{{ invitation.invitedByUsername }} · 过期时间：{{ invitation.expiresAt }}
              </div>
            </div>
          </div>
        </section>
      </template>

      <div class="flex justify-end">
        <a-button size="small" @click="emit('close')">
          关闭
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
