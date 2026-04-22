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

const switchRootRef = ref<HTMLElement | null>(null)
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

function openPopup() {
  popupVisible.value = true
  createError.value = ''
}

function closePopup() {
  popupVisible.value = false
}

function togglePopup() {
  if (popupVisible.value) {
    closePopup()
    return
  }
  openPopup()
}

function onDocumentClick(event: MouseEvent) {
  if (!popupVisible.value)
    return

  const target = event.target
  if (!(target instanceof Node))
    return

  if (switchRootRef.value?.contains(target))
    return

  closePopup()
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    closePopup()
}

function selectWorkspace(workspaceId: string) {
  const normalizedId = String(workspaceId || '').trim()
  if (!normalizedId)
    return

  closePopup()
  emit('update:modelValue', normalizedId)
}

function openCreateDialog() {
  closePopup()
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

onMounted(() => {
  if (!import.meta.client)
    return

  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return

  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <NuxtLink
    v-if="props.mode === 'link'"
    :to="props.to"
    class="text-slate-700 mt-0 px-3 py-2 border border-slate-200 rounded-xl bg-white flex gap-2 transition-colors items-center hover:text-slate-900 hover:border-blue-200 hover:bg-blue-50/40"
  >
    <BrandLogo
      v-if="props.icon === 'brand-mark'"
      variant="mark"
      class="shrink-0"
      style="--winloop-brand-mark-size: 20px;"
    />
    <span v-else class="material-symbols-outlined">{{ props.icon }}</span>
    <span class="text-[0.9375rem] font-semibold">{{ props.label }}</span>
  </NuxtLink>

  <div v-else ref="switchRootRef" class="mt-0 w-full relative">
    <button
      type="button"
      class="group px-3 text-left border border-slate-200 rounded-xl bg-white h-11 w-full transition-all hover:border-blue-200 hover:bg-blue-50/40"
      @click="togglePopup"
    >
      <div class="flex gap-2 h-full items-center">
        <div class="flex-1 min-w-0">
          <p class="text-[1rem] text-slate-900 font-semibold truncate">
            {{ currentWorkspace?.workspace.name || '选择项目空间' }}
          </p>
        </div>
        <span class="material-symbols-outlined text-[1rem] text-slate-400 transition-transform group-hover:text-slate-600">expand_more</span>
      </div>
    </button>

    <div
      v-if="popupVisible"
      class="p-2.5 border border-slate-200 rounded-xl bg-white w-full shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)] z-30"
      style="position: absolute; left: 0; right: 0; bottom: calc(100% + 8px);"
    >
      <div class="px-0.5 pb-2.5 border-b border-slate-100">
        <p class="text-[0.875rem] text-slate-900 font-semibold">
          项目空间
        </p>
      </div>

      <div class="py-2.5 max-h-60 overflow-y-auto space-y-1.5">
        <button
          v-for="item in internalWorkspaceOptions"
          :key="item.workspace.id"
          type="button"
          class="px-3 py-2 text-left border rounded-lg w-full transition-colors"
          :class="item.workspace.id === props.modelValue
            ? 'border-blue-200 bg-blue-50/80'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'"
          @click="selectWorkspace(item.workspace.id)"
        >
          <div class="min-w-0">
            <div class="flex gap-2 items-center justify-between">
              <p class="text-[0.875rem] text-slate-900 font-semibold truncate">
                {{ item.workspace.name }}
              </p>
              <span class="text-[0.6875rem] text-slate-500 shrink-0">
                {{ workspaceTypeLabel(item.workspace.type) }}
              </span>
            </div>
            <p v-if="props.showQuota && item.quota" class="text-[0.6875rem] text-slate-500 mt-0.5">
              席位 {{ item.quota.seatUsed }}/{{ item.quota.seatLimit }} · AI {{ item.quota.aiQuotaUsed }}/{{ item.quota.aiQuotaTotal }}
            </p>
          </div>
        </button>

        <div
          v-if="internalWorkspaceOptions.length === 0"
          class="px-0.5 pb-2.5 border-b border-slate-100"
        >
          <p class="text-[0.875rem] text-slate-700 font-medium">
            还没有可用空间
          </p>
          <p class="text-[0.75rem] text-slate-500 mt-1">
            先创建一个项目空间，再进入协作。
          </p>
        </div>
      </div>

      <div class="pt-2.5 border-t border-slate-100">
        <button
          type="button"
          class="text-[0.875rem] text-slate-700 font-medium border border-slate-200 rounded-lg bg-slate-50 h-9 w-full transition-colors hover:border-slate-300 hover:bg-slate-100"
          @click="openCreateDialog"
        >
          创建新的项目空间
        </button>
      </div>
    </div>
  </div>

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
        <span class="text-sm text-slate-700 font-medium">空间名称</span>
        <input
          v-model="createWorkspaceName"
          type="text"
          maxlength="64"
          class="text-sm text-slate-900 px-3 outline-none border border-slate-200 rounded-lg bg-white h-9 w-full transition-colors focus:border-blue-400"
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
