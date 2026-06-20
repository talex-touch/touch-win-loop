<script setup lang="ts">
import type { ProjectMemberRole } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  visible?: boolean
  workspaceCanManageMembers?: boolean
  workspaceInvitationSubmitting?: boolean
  workspaceInviteProjectLabel?: string
  workspaceInvitationLink?: string
  workspaceInvitationError?: string
  workspaceInviteUnavailableMessage?: string
  canSubmitWorkspaceInvitation?: boolean
  inviteeUsername?: string
  inviteRole?: ProjectMemberRole
  inviteExpiresInDays?: number
  workspaceInviteRoleOptions?: ProjectMemberRole[]
  workspaceRoleLabel: (role: ProjectMemberRole) => string
}>(), {
  visible: false,
  workspaceCanManageMembers: false,
  workspaceInvitationSubmitting: false,
  workspaceInviteProjectLabel: '',
  workspaceInvitationLink: '',
  workspaceInvitationError: '',
  workspaceInviteUnavailableMessage: '',
  canSubmitWorkspaceInvitation: false,
  inviteeUsername: '',
  inviteRole: 'viewer',
  inviteExpiresInDays: 7,
  workspaceInviteRoleOptions: () => [],
})

const emit = defineEmits<{
  close: []
  copyLink: []
  submitInvitation: []
  updateInviteeUsername: [value: string]
  updateInviteRole: [value: ProjectMemberRole]
  updateInviteExpiresInDays: [value: number]
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value)
      emit('close')
  },
})

const inviteRoleSelectOptions = computed(() => {
  return props.workspaceInviteRoleOptions.map(role => ({
    label: props.workspaceRoleLabel(role),
    value: role,
  }))
})

const inviteExpiryOptions = [
  { label: '1 天', value: 1 },
  { label: '3 天', value: 3 },
  { label: '7 天', value: 7 },
  { label: '14 天', value: 14 },
  { label: '30 天', value: 30 },
]
</script>

<template>
  <a-modal
    v-model:visible="modelVisible"
    title="邀请协作者"
    data-testid="project-invite-modal"
    width="560px"
    :footer="false"
    :esc-to-close="true"
    :mask-closable="true"
    @cancel="emit('close')"
  >
    <div class="space-y-3">
      <div class="text-[11px] text-slate-500 p-2 border border-slate-200 rounded bg-slate-50">
        <p class="m-0">
          接受邀请后会先加入当前空间，再加入当前项目。
        </p>
        <p class="m-0 mt-1">
          {{ props.workspaceInviteProjectLabel }}
        </p>
        <p class="m-0 mt-1">
          留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入。
        </p>
      </div>

      <template v-if="props.workspaceCanManageMembers">
        <label class="text-[11px] text-slate-600 block space-y-1">
          <span class="block">邀请用户名（可选）</span>
          <input
            :value="props.inviteeUsername"
            data-testid="project-invite-username-input"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
            placeholder="留空则生成可多人加入的通用邀请"
            @input="emit('updateInviteeUsername', ($event.target as HTMLInputElement).value)"
          >
        </label>

        <div class="gap-2 grid grid-cols-2">
          <label class="text-[11px] text-slate-600 block space-y-1">
            <span class="block">项目角色</span>
            <UiSelect
              :model-value="props.inviteRole"
              :options="inviteRoleSelectOptions"
              data-testid="project-invite-role-select"
              size="sm"
              aria-label="项目角色"
              @change="value => emit('updateInviteRole', value as ProjectMemberRole)"
            />
          </label>

          <label class="text-[11px] text-slate-600 block space-y-1">
            <span class="block">有效期</span>
            <UiSelect
              :model-value="props.inviteExpiresInDays"
              :options="inviteExpiryOptions"
              data-testid="project-invite-expiry-select"
              size="sm"
              aria-label="有效期"
              @change="value => emit('updateInviteExpiresInDays', Number(value || 7))"
            />
          </label>
        </div>

        <div v-if="props.workspaceInvitationLink" class="text-[11px] text-slate-600 px-2.5 py-2 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-700 font-semibold">
            最新邀请链接
          </p>
          <p class="mt-1 break-all" data-testid="project-invite-link">
            {{ props.workspaceInvitationLink }}
          </p>
          <button
            data-testid="project-invite-copy-link-button"
            class="text-[11px] font-semibold mt-2 px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50"
            type="button"
            @click="emit('copyLink')"
          >
            复制邀请链接
          </button>
        </div>

        <div v-if="props.workspaceInvitationSubmitting" class="text-[11px] text-blue-700 px-2.5 py-2 border border-blue-200 rounded bg-blue-50">
          正在生成邀请链接，请稍候...
        </div>

        <div v-else-if="props.workspaceInvitationError" class="text-[11px] text-rose-700 px-2.5 py-2 border border-rose-200 rounded bg-rose-50">
          {{ props.workspaceInvitationError }}
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="emit('close')">
            关闭
          </a-button>
          <a-button
            size="small"
            type="primary"
            data-testid="project-invite-submit-button"
            :loading="props.workspaceInvitationSubmitting"
            :disabled="!props.canSubmitWorkspaceInvitation"
            @click="emit('submitInvitation')"
          >
            生成邀请链接
          </a-button>
        </div>
      </template>

      <template v-else>
        <p class="text-[11px] text-amber-700 px-2.5 py-2 border border-amber-200 rounded bg-amber-50">
          {{ props.workspaceInviteUnavailableMessage }}
        </p>
        <div class="flex justify-end">
          <a-button size="small" @click="emit('close')">
            关闭
          </a-button>
        </div>
      </template>
    </div>
  </a-modal>
</template>
