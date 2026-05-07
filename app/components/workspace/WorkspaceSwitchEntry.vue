<script setup lang="ts">
import type {
  ApiResponse,
  BillingCycle,
  BillingPlan,
  WorkspaceBillingEstimate,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

interface CreateWorkspaceResponse {
  team: WorkspaceWithQuota['workspace']
  quota: WorkspaceWithQuota['quota']
}

interface CreateWorkspaceCheckoutResponse {
  order: {
    id: string
  }
  estimate: WorkspaceBillingEstimate
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
const router = useRouter()

const switchRootRef = ref<HTMLElement | null>(null)
const popupVisible = ref(false)
const createDialogVisible = ref(false)
const creatingWorkspace = ref(false)
const createWorkspaceName = ref('')
const createError = ref('')
const createPlanError = ref('')
const internalWorkspaceOptions = ref<WorkspaceWithQuota[]>([])
const billingPlans = ref<BillingPlan[]>([])
const billingPlansLoading = ref(false)
const createSelectedPlanId = ref('')
const createBillingCycle = ref<BillingCycle>('monthly')

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

function formatPlanPrice(cents: number): string {
  return `¥${(Math.max(0, Number(cents || 0)) / 100).toFixed(2)}`
}

function cycleLabel(cycle: BillingCycle): string {
  if (cycle === 'yearly')
    return '年付'
  if (cycle === 'quarterly')
    return '季付'
  return '月付'
}

const selectedCreatePlan = computed(() => {
  return billingPlans.value.find(plan => plan.id === createSelectedPlanId.value) || billingPlans.value[0] || null
})

const canSubmitCreateWorkspace = computed(() => {
  return Boolean(createWorkspaceName.value.trim() && createSelectedPlanId.value && !billingPlansLoading.value)
})

function upsertWorkspaceOption(option: WorkspaceWithQuota) {
  const filtered = internalWorkspaceOptions.value.filter(item => item.workspace.id !== option.workspace.id)
  internalWorkspaceOptions.value = [option, ...filtered]
}

function openPopup() {
  popupVisible.value = true
  createError.value = ''
  createPlanError.value = ''
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
  createPlanError.value = ''
  createDialogVisible.value = true
  void loadBillingPlans()
}

function closeCreateDialog() {
  if (creatingWorkspace.value)
    return
  createDialogVisible.value = false
  createError.value = ''
  createPlanError.value = ''
}

async function submitCreateWorkspace() {
  const normalizedName = createWorkspaceName.value.trim()
  if (!normalizedName) {
    createError.value = '请输入空间名称。'
    return
  }
  if (billingPlansLoading.value) {
    createError.value = '套餐仍在加载，请稍后再创建。'
    return
  }

  const selectedPlanId = createSelectedPlanId.value
  if (!selectedPlanId) {
    createError.value = createPlanError.value || '请选择一个可用套餐。'
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

    const checkoutResponse = await authApiFetch<ApiResponse<CreateWorkspaceCheckoutResponse>>(`/teams/${response.data.team.id}/billing/checkout`, {
      method: 'POST',
      body: {
        planId: selectedPlanId,
        billingCycle: createBillingCycle.value,
      },
    })

    const workspaceOption: WorkspaceWithQuota = {
      workspace: response.data.team,
      quota: response.data.quota
        ? {
            ...response.data.quota,
            workspaceId: response.data.team.id,
            planTier: checkoutResponse.data.estimate.planTier,
            resetCycle: checkoutResponse.data.estimate.billingCycle,
            seatLimit: Math.max(checkoutResponse.data.estimate.includedSeats, checkoutResponse.data.estimate.seatUsed),
            aiQuotaTotal: checkoutResponse.data.estimate.aiQuotaTotal,
          }
        : null,
    }

    upsertWorkspaceOption(workspaceOption)
    writeActiveWorkspacePreference(workspaceOption.workspace.id)
    createWorkspaceName.value = ''
    createDialogVisible.value = false
    popupVisible.value = false
    emit('workspaceCreated', workspaceOption)
    await router.push({
      path: `/team/${workspaceOption.workspace.id}/billing`,
      query: {
        checkout: 'success',
        orderId: checkoutResponse.data.order.id,
        created: '1',
      },
    })
  }
  catch (error: any) {
    createError.value = String(error?.data?.message || '创建项目空间失败，请稍后重试。')
  }
  finally {
    creatingWorkspace.value = false
  }
}

async function loadBillingPlans(): Promise<void> {
  if (billingPlansLoading.value || billingPlans.value.length > 0)
    return
  billingPlansLoading.value = true
  createPlanError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<BillingPlan[]>>('/billing/plans')
    billingPlans.value = response.data || []
    createSelectedPlanId.value = billingPlans.value.find(plan => plan.planTier === 'business_team')?.id
      || billingPlans.value[0]?.id
      || ''
    if (!createSelectedPlanId.value)
      createPlanError.value = '当前没有可用套餐，请稍后再试或联系管理员。'
  }
  catch {
    billingPlans.value = []
    createSelectedPlanId.value = ''
    createPlanError.value = '套餐加载失败，请稍后再试。'
  }
  finally {
    billingPlansLoading.value = false
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

      <div class="space-y-2" data-testid="workspace-create-business-checkout">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-700 font-medium">套餐</span>
          <span class="text-[0.6875rem] text-slate-500">模拟支付</span>
        </div>
        <p v-if="billingPlansLoading" class="text-xs text-slate-500">
          正在加载套餐...
        </p>
        <p v-else-if="createPlanError" class="text-xs text-rose-600">
          {{ createPlanError }}
        </p>
        <div v-else class="gap-2 grid">
          <button
            v-for="plan in billingPlans"
            :key="plan.id"
            type="button"
            class="px-3 py-2 text-left border rounded-lg transition-colors"
            :class="createSelectedPlanId === plan.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'"
            @click="createSelectedPlanId = plan.id"
          >
            <span class="text-[0.6875rem] text-slate-500">{{ plan.planTier === 'business_team' ? 'Business' : 'Personal' }}</span>
            <strong class="text-sm text-slate-900 mt-0.5 block">{{ plan.name }}</strong>
            <span class="text-xs text-slate-500">{{ formatPlanPrice(plan.basePriceCents) }} / {{ cycleLabel(createBillingCycle) }} · 席位 {{ plan.includedSeats }} · AI {{ plan.includedAiQuota }}</span>
          </button>
        </div>
        <div class="flex gap-1.5">
          <button
            v-for="cycle in ['monthly', 'quarterly', 'yearly']"
            :key="cycle"
            type="button"
            class="text-xs px-2.5 py-1 border rounded-full"
            :class="createBillingCycle === cycle ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'"
            @click="createBillingCycle = cycle as BillingCycle"
          >
            {{ cycleLabel(cycle as BillingCycle) }}
          </button>
        </div>
        <p v-if="selectedCreatePlan" class="text-[0.6875rem] text-slate-500">
          点击创建后会自动进入结算确认，并由 mock provider 立即支付成功。
        </p>
      </div>

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
          :disabled="!canSubmitCreateWorkspace"
          data-testid="workspace-create-submit-button"
          @click="submitCreateWorkspace"
        >
          创建并完成结算
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
