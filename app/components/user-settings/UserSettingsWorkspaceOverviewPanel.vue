<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  currentWorkspace?: WorkspaceWithQuota | null
  workspaceCopyFeedback?: string
  workspaceNameEditing?: boolean
  workspaceNameDraft?: string
  workspaceNameSaving?: boolean
  workspaceNameError?: string
  workspaceNameSuccess?: string
  canSubmitWorkspaceName?: boolean
  canRenameCurrentWorkspace?: boolean
  workspacePlanTierLabel?: string
  workspaceTypeDetailText?: string
  workspaceTypeActionLabel?: string
  workspaceTypeActionHint?: string
  seatSummaryText?: string
  quotaResetCycleText?: string
  seatDetailText?: string
  canInviteWorkspaceMembers?: boolean
  quotaUpdatedAtText?: string
}>(), {
  currentWorkspace: null,
  workspaceCopyFeedback: '',
  workspaceNameEditing: false,
  workspaceNameDraft: '',
  workspaceNameSaving: false,
  workspaceNameError: '',
  workspaceNameSuccess: '',
  canSubmitWorkspaceName: false,
  canRenameCurrentWorkspace: false,
  workspacePlanTierLabel: '',
  workspaceTypeDetailText: '',
  workspaceTypeActionLabel: '',
  workspaceTypeActionHint: '',
  seatSummaryText: '',
  quotaResetCycleText: '',
  seatDetailText: '',
  canInviteWorkspaceMembers: false,
  quotaUpdatedAtText: '',
})

const emit = defineEmits<{
  copyWorkspaceId: []
  updateWorkspaceNameDraft: [value: string]
  cancelWorkspaceNameEdit: []
  saveWorkspaceName: []
  openWorkspaceNameEditor: []
  handleWorkspaceTypeAction: []
  selectMembersTab: []
  openWorkspaceInvitationDialog: []
}>()
</script>

<template>
  <div class="user-settings-panel">
    <template v-if="props.currentWorkspace">
      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            工作空间 ID
          </p>
          <p class="user-settings-row__desc">
            用于排查、授权配置和成员协作确认。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--overview">
          <div class="user-settings-overview-row">
            <div class="user-settings-overview-row__main">
              <code class="user-settings-overview-code">{{ props.currentWorkspace.workspace.id }}</code>
              <button class="user-settings-icon-btn" title="复制工作空间 UUID" @click="emit('copyWorkspaceId')">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
              </button>
            </div>
            <p v-if="props.workspaceCopyFeedback" class="text-xs text-slate-500">
              {{ props.workspaceCopyFeedback }}
            </p>
          </div>
        </div>
      </div>

      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            工作空间名称
          </p>
          <p class="user-settings-row__desc">
            当前工作空间展示名称。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--overview">
          <div v-if="props.workspaceNameEditing" class="user-settings-overview-row">
            <div class="user-settings-inline-editor">
              <input
                :value="props.workspaceNameDraft"
                type="text"
                class="user-settings-input"
                maxlength="80"
                placeholder="请输入工作空间名称"
                :disabled="props.workspaceNameSaving"
                @input="emit('updateWorkspaceNameDraft', ($event.target as HTMLInputElement).value)"
              >
              <div class="user-settings-overview-actions">
                <button class="user-settings-btn user-settings-btn--compact" :disabled="props.workspaceNameSaving" @click="emit('cancelWorkspaceNameEdit')">
                  取消
                </button>
                <button
                  class="user-settings-btn user-settings-btn--compact user-settings-btn--primary"
                  :disabled="!props.canSubmitWorkspaceName"
                  @click="emit('saveWorkspaceName')"
                >
                  {{ props.workspaceNameSaving ? '保存中...' : '保存名称' }}
                </button>
              </div>
            </div>
            <p v-if="props.workspaceNameError" class="user-settings-feedback user-settings-feedback--danger">
              {{ props.workspaceNameError }}
            </p>
            <p v-if="props.workspaceNameSuccess" class="user-settings-feedback user-settings-feedback--success">
              {{ props.workspaceNameSuccess }}
            </p>
          </div>
          <div v-else class="user-settings-overview-row">
            <div class="user-settings-overview-row__main">
              <div class="user-settings-overview-value-group">
                <span class="user-settings-overview-value">{{ props.currentWorkspace.workspace.name }}</span>
              </div>
              <button
                v-if="props.canRenameCurrentWorkspace"
                class="user-settings-btn user-settings-btn--compact"
                title="编辑工作空间名称"
                @click="emit('openWorkspaceNameEditor')"
              >
                修改
              </button>
            </div>
            <p class="text-sm text-slate-500">
              {{ props.canRenameCurrentWorkspace ? '当前工作空间名称可直接修改。' : '当前工作空间名称仅具备管理权限的成员可修改。' }}
            </p>
            <p v-if="props.workspaceNameError" class="user-settings-feedback user-settings-feedback--danger">
              {{ props.workspaceNameError }}
            </p>
            <p v-if="props.workspaceNameSuccess" class="user-settings-feedback user-settings-feedback--success">
              {{ props.workspaceNameSuccess }}
            </p>
          </div>
        </div>
      </div>

      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            工作空间类型
          </p>
          <p class="user-settings-row__desc">
            Personal / Business 套餐类型。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--overview">
          <div class="user-settings-overview-row">
            <div class="user-settings-overview-row__main">
              <div class="user-settings-overview-value-group">
                <span class="user-settings-overview-value">{{ props.workspacePlanTierLabel }}</span>
                <span class="user-settings-chip">{{ props.workspaceTypeDetailText }}</span>
              </div>
              <button class="user-settings-btn user-settings-btn--compact user-settings-btn--primary" @click="emit('handleWorkspaceTypeAction')">
                {{ props.workspaceTypeActionLabel }}
              </button>
            </div>
            <p class="text-sm text-slate-500">
              {{ props.workspaceTypeActionHint }}
            </p>
          </div>
        </div>
      </div>

      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            工作空间席位管理
          </p>
          <p class="user-settings-row__desc">
            当前工作空间成员席位与协作入口。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--overview">
          <div class="user-settings-overview-row">
            <div class="user-settings-overview-row__main">
              <div class="user-settings-overview-value-group">
                <span class="user-settings-overview-value">{{ props.seatSummaryText }}</span>
                <span class="text-sm text-slate-500">{{ props.quotaResetCycleText }}</span>
              </div>
              <div class="user-settings-overview-actions">
                <button class="user-settings-btn user-settings-btn--compact" @click="emit('selectMembersTab')">
                  查看成员
                </button>
                <button
                  class="user-settings-btn user-settings-btn--compact user-settings-btn--primary"
                  :disabled="!props.canInviteWorkspaceMembers"
                  @click="emit('openWorkspaceInvitationDialog')"
                >
                  发起邀请
                </button>
              </div>
            </div>
            <p class="text-sm text-slate-500">
              {{ props.seatDetailText }}
            </p>
          </div>
        </div>
      </div>

      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            最近更新时间
          </p>
          <p class="user-settings-row__desc">
            最近一次配额同步时间。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--overview">
          <div class="user-settings-overview-row">
            <div class="user-settings-overview-row__main">
              <span class="user-settings-overview-value user-settings-overview-value--secondary">{{ props.quotaUpdatedAtText }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="user-settings-row">
      <div class="user-settings-row__heading">
        <p class="user-settings-row__title">
          当前工作空间
        </p>
        <p class="user-settings-row__desc">
          当前账号暂无可见工作空间信息。
        </p>
      </div>
      <div class="user-settings-row__content user-settings-row__content--start">
        <div class="text-sm text-slate-500">
          当前账号暂无可见工作空间信息。
        </div>
      </div>
    </div>
  </div>
</template>
