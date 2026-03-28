<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  BillingCycle,
  BillingPlan,
  PlatformPermission,
  WorkspaceBillingEstimate,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()

const permissions = ref<PlatformPermission[]>([])
const workspaces = ref<WorkspaceWithQuota[]>([])
const plans = ref<BillingPlan[]>([])
const estimate = ref<WorkspaceBillingEstimate | null>(null)

const loading = ref(true)
const saving = ref(false)
const createDialogVisible = ref(false)
const editDialogVisible = ref(false)
const errorText = ref('')
const successText = ref('')

const canWritePricing = computed(() => permissions.value.includes('pricing.write'))

const createForm = reactive({
  code: '',
  name: '',
  basePriceCents: 0,
  includedSeats: 0,
  extraSeatPriceCents: 0,
  includedAiQuota: 0,
  isActive: true,
})

const editForm = reactive({
  planId: '',
  code: '',
  name: '',
  basePriceCents: 0,
  includedSeats: 0,
  extraSeatPriceCents: 0,
  includedAiQuota: 0,
  isActive: true,
})

const estimateForm = reactive<{
  workspaceId: string
  planId: string
  billingCycle: BillingCycle
}>({
  workspaceId: '',
  planId: '',
  billingCycle: 'monthly',
})

const planPage = ref(1)
const planPageSize = ref(10)

const planColumns = [
  { title: '套餐', dataIndex: 'name', slotName: 'name' },
  { title: '基础价', dataIndex: 'basePriceCents', slotName: 'basePrice', width: 120 },
  { title: '包含席位', dataIndex: 'includedSeats', width: 100 },
  { title: '超额单价', dataIndex: 'extraSeatPriceCents', slotName: 'extraSeatPrice', width: 120 },
  { title: 'AI 配额', dataIndex: 'includedAiQuota', width: 100 },
  { title: '状态', dataIndex: 'isActive', slotName: 'status', width: 100 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 120, fixed: 'right' as const },
]

const pagedPlans = computed(() => {
  const start = (planPage.value - 1) * planPageSize.value
  return plans.value.slice(start, start + planPageSize.value)
})

watch([plans, planPageSize], () => {
  const maxPage = Math.max(1, Math.ceil(plans.value.length / planPageSize.value))
  if (planPage.value > maxPage)
    planPage.value = maxPage
})

function fillEditForm(plan: BillingPlan) {
  editForm.planId = plan.id
  editForm.code = plan.code
  editForm.name = plan.name
  editForm.basePriceCents = plan.basePriceCents
  editForm.includedSeats = plan.includedSeats
  editForm.extraSeatPriceCents = plan.extraSeatPriceCents
  editForm.includedAiQuota = plan.includedAiQuota
  editForm.isActive = plan.isActive
}

function openEditDialog(plan: BillingPlan) {
  fillEditForm(plan)
  editDialogVisible.value = true
}

async function loadContext() {
  const me = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  permissions.value = me.data.user.platformPermissions || []
  workspaces.value = me.data.workspaces
  if (!estimateForm.workspaceId && workspaces.value[0])
    estimateForm.workspaceId = workspaces.value[0].workspace.id
}

async function loadPlans() {
  const response = await $fetch<ApiResponse<BillingPlan[]>>(endpoint('/admin/billing/plans'))
  plans.value = response.data
  if (!estimateForm.planId && plans.value[0])
    estimateForm.planId = plans.value[0].id
}

async function loadEstimate() {
  if (!estimateForm.workspaceId)
    return
  const response = await $fetch<ApiResponse<WorkspaceBillingEstimate>>(endpoint(`/teams/${estimateForm.workspaceId}/billing/estimate`))
  estimate.value = response.data
}

async function runAction(action: () => Promise<void>, message: string) {
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await action()
    successText.value = message
    await Promise.all([loadPlans(), loadEstimate()])
  }
  catch (error: any) {
    successText.value = ''
    errorText.value = String(error?.data?.message || '操作失败。')
  }
  finally {
    saving.value = false
  }
}

async function createPlan() {
  await runAction(async () => {
    await $fetch(endpoint('/admin/billing/plans'), {
      method: 'POST',
      body: {
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        basePriceCents: Number(createForm.basePriceCents || 0),
        includedSeats: Number(createForm.includedSeats || 0),
        extraSeatPriceCents: Number(createForm.extraSeatPriceCents || 0),
        includedAiQuota: Number(createForm.includedAiQuota || 0),
        isActive: createForm.isActive,
      },
    })
    createForm.code = ''
    createForm.name = ''
    createForm.basePriceCents = 0
    createForm.includedSeats = 0
    createForm.extraSeatPriceCents = 0
    createForm.includedAiQuota = 0
    createForm.isActive = true
  }, '套餐已创建。')
  if (!errorText.value)
    createDialogVisible.value = false
}

async function patchPlan() {
  await runAction(async () => {
    await $fetch(endpoint('/admin/billing/plans'), {
      method: 'PATCH',
      body: {
        planId: editForm.planId,
        code: editForm.code.trim(),
        name: editForm.name.trim(),
        basePriceCents: Number(editForm.basePriceCents || 0),
        includedSeats: Number(editForm.includedSeats || 0),
        extraSeatPriceCents: Number(editForm.extraSeatPriceCents || 0),
        includedAiQuota: Number(editForm.includedAiQuota || 0),
        isActive: editForm.isActive,
      },
    })
  }, '套餐已更新。')
  if (!errorText.value)
    editDialogVisible.value = false
}

async function switchWorkspacePlan() {
  if (!estimateForm.workspaceId || !estimateForm.planId)
    return
  await runAction(async () => {
    await $fetch(endpoint(`/teams/${estimateForm.workspaceId}/billing`), {
      method: 'PATCH',
      body: {
        planId: estimateForm.planId,
        billingCycle: estimateForm.billingCycle,
      },
    })
  }, '工作区套餐已切换并重新估算。')
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await loadContext()
    if (canWritePricing.value) {
      await loadPlans()
      await loadEstimate()
    }
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '计费页面加载失败。')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div>
        <h1 class="text-lg text-slate-900 font-semibold">
          套餐与席位计费
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          管理套餐参数并按 `seat_used` 实时估算工作区费用（V1 不接支付）。
        </p>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="!canWritePricing" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      403：当前账号没有 pricing.write 权限。
    </section>

    <template v-else>
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex gap-2 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            套餐列表
          </h2>
          <a-button size="small" type="primary" @click="createDialogVisible = true">
            新增套餐
          </a-button>
        </div>
        <div class="mt-3">
          <a-table
            :bordered="{ cell: true }"
            :columns="planColumns"
            :data="pagedPlans"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #name="{ record }">
              <div class="min-w-0">
                <p class="text-slate-900 font-semibold m-0 truncate">
                  {{ record.name }}（{{ record.code }}）
                </p>
                <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                  planId: {{ record.id }}
                </p>
              </div>
            </template>
            <template #basePrice="{ record }">
              {{ (record.basePriceCents / 100).toFixed(2) }} 元
            </template>
            <template #extraSeatPrice="{ record }">
              {{ (record.extraSeatPriceCents / 100).toFixed(2) }} 元/席
            </template>
            <template #status="{ record }">
              <a-tag :color="record.isActive ? 'green' : 'gray'" size="small">
                {{ record.isActive ? 'active' : 'inactive' }}
              </a-tag>
            </template>
            <template #actions="{ record }">
              <a-button size="mini" @click="openEditDialog(record)">
                编辑
              </a-button>
            </template>
          </a-table>
          <div class="mt-3 flex justify-end">
            <a-pagination
              :current="planPage"
              :page-size="planPageSize"
              :page-size-options="[10, 20, 50]"
              :show-total="true"
              :total="plans.length"
              size="small"
              @change="(value: number) => planPage = value"
              @page-size-change="(value: number) => { planPageSize = value; planPage = 1 }"
            />
          </div>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <h2 class="text-sm text-slate-900 font-semibold">
          工作区费用估算
        </h2>
        <div class="mt-2 gap-2 grid md:grid-cols-4">
          <a-select v-model="estimateForm.workspaceId" allow-clear size="small" placeholder="选择工作区">
            <a-option value="">
              选择工作区
            </a-option>
            <a-option
              v-for="item in workspaces"
              :key="item.workspace.id"
              :value="item.workspace.id"
            >
              {{ item.workspace.name }}（{{ item.workspace.id }}）
            </a-option>
          </a-select>
          <a-select v-model="estimateForm.planId" allow-clear size="small" placeholder="选择套餐">
            <a-option value="">
              选择套餐
            </a-option>
            <a-option v-for="plan in plans" :key="plan.id" :value="plan.id">
              {{ plan.name }}
            </a-option>
          </a-select>
          <a-select v-model="estimateForm.billingCycle" size="small" placeholder="计费周期">
            <a-option value="monthly">
              monthly
            </a-option>
            <a-option value="quarterly">
              quarterly
            </a-option>
            <a-option value="yearly">
              yearly
            </a-option>
          </a-select>
          <div class="flex gap-2 items-center">
            <a-button size="small" :loading="saving" :disabled="!estimateForm.workspaceId" @click="loadEstimate">
              仅估算
            </a-button>
            <a-button
              type="primary"
              size="small"
              :loading="saving"
              :disabled="!estimateForm.workspaceId || !estimateForm.planId"
              @click="switchWorkspacePlan"
            >
              切换并估算
            </a-button>
          </div>
        </div>

        <div v-if="estimate" class="text-xs text-slate-700 mt-3 p-3 border border-slate-200 rounded bg-slate-50">
          <p>工作区：{{ estimate.workspaceId }}</p>
          <p>套餐：{{ estimate.planCode || '未配置' }}（{{ estimate.planId || '-' }}）</p>
          <p>席位使用：{{ estimate.seatUsed }} / 包含 {{ estimate.includedSeats }}，超额 {{ estimate.extraSeats }}</p>
          <p>基础价：{{ (estimate.basePriceCents / 100).toFixed(2) }} 元，超额单价：{{ (estimate.extraSeatPriceCents / 100).toFixed(2) }} 元</p>
          <p class="text-slate-900 font-semibold">
            估算金额：{{ estimate.estimatedAmountYuan.toFixed(2) }} 元
          </p>
        </div>
      </section>
    </template>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>

    <a-modal
      v-model:visible="createDialogVisible"
      :footer="false"
      title="新增套餐"
      width="560px"
    >
      <div class="text-[11px] gap-2 grid md:grid-cols-2">
        <a-input v-model="createForm.code" size="small" placeholder="套餐编码（如 team_base）" />
        <a-input v-model="createForm.name" size="small" placeholder="套餐名称" />
        <a-input-number v-model="createForm.basePriceCents" size="small" :min="0" placeholder="基础价（分）" />
        <a-input-number v-model="createForm.includedSeats" size="small" :min="0" placeholder="包含席位" />
        <a-input-number v-model="createForm.extraSeatPriceCents" size="small" :min="0" placeholder="超额单价（分）" />
        <a-input-number v-model="createForm.includedAiQuota" size="small" :min="0" placeholder="包含 AI 配额" />
        <div class="text-xs text-slate-700 flex gap-2 items-center md:col-span-2">
          <a-switch v-model="createForm.isActive" size="small" />
          <span>是否启用</span>
        </div>
        <a-button type="primary" size="small" class="mt-1 md:col-span-2" :loading="saving" @click="createPlan">
          新增套餐
        </a-button>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="editDialogVisible"
      :footer="false"
      title="编辑套餐"
      width="560px"
    >
      <div class="text-[11px] gap-2 grid md:grid-cols-2">
        <a-input v-model="editForm.planId" size="small" class="md:col-span-2" disabled />
        <a-input v-model="editForm.code" size="small" placeholder="套餐编码" />
        <a-input v-model="editForm.name" size="small" placeholder="套餐名称" />
        <a-input-number v-model="editForm.basePriceCents" size="small" :min="0" placeholder="基础价（分）" />
        <a-input-number v-model="editForm.includedSeats" size="small" :min="0" placeholder="包含席位" />
        <a-input-number v-model="editForm.extraSeatPriceCents" size="small" :min="0" placeholder="超额单价（分）" />
        <a-input-number v-model="editForm.includedAiQuota" size="small" :min="0" placeholder="包含 AI 配额" />
        <div class="text-xs text-slate-700 flex gap-2 items-center md:col-span-2">
          <a-switch v-model="editForm.isActive" size="small" />
          <span>是否启用</span>
        </div>
        <a-button
          type="primary"
          size="small"
          class="mt-1 md:col-span-2"
          :loading="saving"
          :disabled="!editForm.planId"
          @click="patchPlan"
        >
          保存套餐
        </a-button>
      </div>
    </a-modal>
  </div>
</template>
