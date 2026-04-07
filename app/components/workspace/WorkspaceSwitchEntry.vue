<script setup lang="ts">
import type { ApiResponse, WorkspaceWithQuota } from '~~/shared/types/domain'

interface CreateWorkspaceResponse {
  team: WorkspaceWithQuota['workspace']
  quota: WorkspaceWithQuota['quota']
}

const props = withDefaults(defineProps<{
  mode?: 'link' | 'select'
  label?: string
  icon?: string
  to?: string
  modelValue?: string
  workspaceOptions?: WorkspaceWithQuota[]
  showQuota?: boolean
}>(), {
  mode: 'link',
  label: '项目台',
  icon: 'workspaces',
  to: '/team',
  modelValue: '',
  workspaceOptions: () => [],
  showQuota: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'workspaceCreated': [value: WorkspaceWithQuota]
}>()

const authApiFetch = useAuthApiFetch()

const popupVisible = ref(false)
const createDialogVisible = ref(false)
const creatingWorkspace = ref(false)
const createWorkspaceName = ref('')
const createError = ref('')
const internalWorkspaceOptions = ref<WorkspaceWithQuota[]>([])

const currentWorkspace = computed(() => {
  return internalWorkspaceOptions.value.find(item => item.workspace.id === props.modelValue)
    || internalWorkspaceOptions.value[0]
    || null
})

watch(
  () => props.workspaceOptions,
  (value) => {
    internalWorkspaceOptions.value = [...(value || [])]
  },
  { immediate: true },
)

function workspaceTypeLabel(type: WorkspaceWithQuota['workspace']['type']) {
  if (type === 'personal')
    return '个人空间'
  return 'Team 空间'
}

function upsertWorkspaceOption(option: WorkspaceWithQuota) {
  const filtered = internalWorkspaceOptions.value.filter(item => item.workspace.id !== option.workspace.id)
  internalWorkspaceOptions.value = [option, ...filtered]
}

function onPopupVisibleChange(value: boolean) {
  popupVisible.value = value
  if (value)
    createError.value = ''
}

function selectWorkspace(workspaceId: string) {
  const normalizedId = String(workspaceId || '').trim()
  if (!normalizedId)
    return

  popupVisible.value = false
  emit('update:modelValue', normalizedId)
}

function openCreateDialog() {
  popupVisible.value = false
  createError.value = ''
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingWorkspace.value)
    return
  createDialogVisible.value = false
  createError.value = ''
}

async function submitCreateWorkspace() {
  const normalizedName = createWorkspaceName.value.trim()
  if (!normalizedName) {
    createError.value = '请输入空间名称。'
    return
  }

  creatingWorkspace.value = true
  createError.value = ''

  try {
    const response = await authApiFetch<ApiResponse<CreateWorkspaceResponse>>('/teams', {
      method: 'POST',
      body: {
        name: normalizedName,
      },
    })

    const workspaceOption: WorkspaceWithQuota = {
      workspace: response.data.team,
      quota: response.data.quota
        ? {
            ...response.data.quota,
            workspaceId: response.data.team.id,
          }
        : null,
    }

    upsertWorkspaceOption(workspaceOption)
    createWorkspaceName.value = ''
    createDialogVisible.value = false
    popupVisible.value = false
    emit('workspaceCreated', workspaceOption)
    emit('update:modelValue', workspaceOption.workspace.id)
  }
  catch (error: any) {
    createError.value = String(error?.data?.message || '创建项目空间失败，请稍后重试。')
  }
  finally {
    creatingWorkspace.value = false
  }
}
</script>

<template>
  <NuxtLink
    v-if="props.mode === 'link'"
    :to="props.to"
    class="text-slate-500 mt-4 px-3 py-2 flex gap-3 transition-colors items-center hover:text-slate-900"
  >
    <span class="material-symbols-outlined">{{ props.icon }}</span>
    <span class="text-sm font-medium">{{ props.label }}</span>
  </NuxtLink>

  <a-trigger
    v-else
    trigger="click"
    position="bottom"
    :popup-visible="popupVisible"
    :unmount-on-close="false"
    @popup-visible-change="onPopupVisibleChange"
  >
    <button
      type="button"
      class="group mt-3.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-left transition-colors hover:border-blue-200"
    >
      <div class="flex h-full items-center gap-2.5">
        <div class="flex-1 min-w-0">
          <p class="truncate text-[14px] font-semibold text-slate-900">
            {{ currentWorkspace?.workspace.name || '选择项目空间' }}
          </p>
        </div>
        <span class="material-symbols-outlined text-[20px] text-slate-400 transition-transform group-hover:text-slate-600">expand_more</span>
      </div>
    </button>

    <template #content>
      <div class="w-[280px] rounded-xl border border-slate-200 bg-white p-2.5">
        <div class="border-b border-slate-100 px-0.5 pb-2">
          <p class="text-[13px] font-semibold text-slate-900">
            项目空间
          </p>
        </div>

        <div class="max-h-60 space-y-1.5 overflow-y-auto py-2">
          <button
            v-for="item in internalWorkspaceOptions"
            :key="item.workspace.id"
            type="button"
            class="w-full rounded-lg border px-3 py-2 text-left transition-colors"
            :class="item.workspace.id === props.modelValue
              ? 'border-blue-200 bg-blue-50'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'"
            @click="selectWorkspace(item.workspace.id)"
          >
            <div class="min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-[13px] font-semibold text-slate-900">
                  {{ item.workspace.name }}
                </p>
                <span class="shrink-0 text-[10px] text-slate-500">
                  {{ workspaceTypeLabel(item.workspace.type) }}
                </span>
              </div>
              <p v-if="props.showQuota && item.quota" class="mt-0.5 text-[10px] text-slate-500">
                席位 {{ item.quota.seatUsed }}/{{ item.quota.seatLimit }} · AI {{ item.quota.aiQuotaUsed }}/{{ item.quota.aiQuotaTotal }}
              </p>
            </div>
          </button>

          <div
            v-if="internalWorkspaceOptions.length === 0"
            class="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center"
          >
            <p class="text-[13px] font-medium text-slate-700">
              还没有可用空间
            </p>
            <p class="mt-1 text-[11px] text-slate-500">
              先创建一个项目空间，再进入协作。
            </p>
          </div>
        </div>

        <div class="border-t border-slate-100 pt-2">
          <button
            type="button"
            class="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
            @click="openCreateDialog"
          >
            创建新的项目空间
          </button>
        </div>
      </div>
    </template>
  </a-trigger>

  <a-modal
    v-model:visible="createDialogVisible"
    title="创建新的项目空间"
    width="400px"
    :footer="false"
    :mask-closable="!creatingWorkspace"
    @cancel="closeCreateDialog"
  >
    <div class="space-y-2.5">
      <label class="block space-y-2">
        <span class="text-sm font-medium text-slate-700">空间名称</span>
        <input
          v-model="createWorkspaceName"
          type="text"
          maxlength="64"
          class="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-blue-400"
          placeholder="例如：talexds Studio"
          @keydown.enter.prevent="submitCreateWorkspace"
        >
      </label>

      <p v-if="createError" class="text-xs text-rose-600">
        {{ createError }}
      </p>

      <div class="flex gap-2 justify-end">
        <a-button size="small" :disabled="creatingWorkspace" @click="closeCreateDialog">
          取消
        </a-button>
        <a-button
          size="small"
          type="primary"
          :loading="creatingWorkspace"
          :disabled="!createWorkspaceName.trim()"
          @click="submitCreateWorkspace"
        >
          创建
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
