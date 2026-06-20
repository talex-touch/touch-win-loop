<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  BillingCycle,
  BillingPlan,
  PlatformPermission,
  WorkspaceBillingEstimate,
} from '~~/shared/types/domain'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

interface OrgRow {
  workspaceId: string
  name: string
  owner: string
  memberCount: number
  seatUsed: number
  seatLimit: number
  aiQuotaUsed: number
  aiQuotaTotal: number
  billingCycle: BillingCycle
  planId: string
  planCode: string
  planName: string
  updatedAt: string
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const loading = ref(true)
const errorText = ref('')
const successText = ref('')
const billingDialogVisible = ref(false)
const rows = ref<OrgRow[]>([])
const plans = ref<BillingPlan[]>([])
const permissions = ref<PlatformPermission[]>([])
const savingWorkspaceId = ref('')
const activeWorkspaceId = ref('')
const planDraft = ref<Record<string, string>>({})
const cycleDraft = ref<Record<string, BillingCycle>>({})
const estimateMap = ref<Record<string, WorkspaceBillingEstimate>>({})
const page = ref(1)
const pageSize = ref(10)

const columns = [
  { title: '组织', dataIndex: 'name', slotName: 'workspace', width: 240 },
  { title: '负责人', dataIndex: 'owner', width: 120 },
  { title: '成员数', dataIndex: 'memberCount', width: 90 },
  { title: '席位', dataIndex: 'seats', slotName: 'seats', width: 120 },
  { title: 'AI 配额', dataIndex: 'aiQuota', slotName: 'aiQuota', width: 130 },
  { title: '当前套餐', dataIndex: 'planName', slotName: 'plan', width: 180 },
  { title: '计费周期', dataIndex: 'billingCycle', width: 120 },
  { title: '更新时间', dataIndex: 'updatedAt', slotName: 'updatedAt', width: 160 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 280, fixed: 'right' as const },
]

function formatDate(value: string): string {
  return value?.replace('T', ' ').slice(0, 16) || '-'
}

const canWritePricing = computed(() => permissions.value.includes('pricing.write'))
const selectedWorkspace = computed(() => {
  return rows.value.find(item => item.workspaceId === activeWorkspaceId.value) || null
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

watch([rows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(rows.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

function hydrateDrafts() {
  const codeToPlanId = new Map(plans.value.map(item => [item.code, item.id]))
  for (const item of rows.value) {
    const fallbackPlanId = item.planId || codeToPlanId.get(item.planCode) || ''
    planDraft.value[item.workspaceId] = fallbackPlanId
    cycleDraft.value[item.workspaceId] = item.billingCycle
  }
}

async function loadPermissions() {
  const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  permissions.value = response.data.user.platformPermissions || []
}

async function loadOrganizations() {
  rows.value = await requestApi<OrgRow[]>(endpoint('/admin/organizations'), {}, '组织列表加载失败。')
  page.value = 1
  hydrateDrafts()
}

async function loadPlans() {
  if (!canWritePricing.value)
    return
  const data = await requestApi<BillingPlan[]>(endpoint('/admin/billing/plans'), {}, '套餐列表加载失败。')
  plans.value = data.filter((item: BillingPlan) => item.isActive)
  hydrateDrafts()
}

async function switchPlan(workspaceId: string) {
  const planId = planDraft.value[workspaceId] || ''
  const billingCycle = cycleDraft.value[workspaceId] || 'monthly'
  if (!planId) {
    errorText.value = '请先选择套餐。'
    return
  }

  savingWorkspaceId.value = workspaceId
  errorText.value = ''
  successText.value = ''
  try {
    estimateMap.value[workspaceId] = await requestApi<WorkspaceBillingEstimate>(
      endpoint(`/admin/organizations/${workspaceId}/billing`),
      {
        method: 'PATCH',
        body: {
          planId,
          billingCycle,
        },
      },
      '套餐切换失败。',
    )
    successText.value = '组织套餐切换成功，已完成费用估算。'
    await loadOrganizations()
  }
  catch (error: any) {
    successText.value = ''
    errorText.value = String(error?.data?.message || '套餐切换失败。')
  }
  finally {
    savingWorkspaceId.value = ''
  }
}

function openBillingDialog(workspaceId: string) {
  activeWorkspaceId.value = workspaceId
  billingDialogVisible.value = true
}

async function submitBillingDialog() {
  if (!activeWorkspaceId.value)
    return
  await switchPlan(activeWorkspaceId.value)
  if (!errorText.value)
    billingDialogVisible.value = false
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await loadPermissions()
    await loadOrganizations()
    await loadPlans()
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    rows.value = []
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin/organizations') },
      }, { replace: true })
      return
    }
    errorText.value = resolveAuthDisplayMessage(error, '组织数据加载失败。')
  }
  finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <template v-else>
      <section class="p-3 border border-slate-200 bg-white">
        <a-table
          :bordered="{ cell: true }"
          :columns="columns"
          :data="pagedRows"
          :pagination="false"
          row-key="workspaceId"
          size="small"
        >
          <template #workspace="{ record }">
            <div class="min-w-0">
              <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                {{ record.name }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate">
                {{ record.workspaceId }}
              </p>
            </div>
          </template>

          <template #seats="{ record }">
            <span>
              <strong>{{ record.seatUsed }}</strong> / {{ record.seatLimit }}
            </span>
          </template>

          <template #aiQuota="{ record }">
            <span>
              <strong>{{ record.aiQuotaUsed }}</strong> / {{ record.aiQuotaTotal }}
            </span>
          </template>

          <template #plan="{ record }">
            <span>{{ record.planName }}（{{ record.planCode }}）</span>
          </template>

          <template #updatedAt="{ record }">
            <span class="text-[10px] text-slate-500">{{ formatDate(record.updatedAt) }}</span>
          </template>

          <template #actions="{ record }">
            <div v-if="canWritePricing" class="flex items-center justify-end">
              <a-button size="mini" @click="openBillingDialog(record.workspaceId)">
                编辑计费
              </a-button>
            </div>
            <div v-else class="text-[10px] text-slate-400">
              无 pricing.write
            </div>
          </template>
        </a-table>

        <div class="mt-3 flex justify-end">
          <a-pagination
            :current="page"
            :page-size="pageSize"
            :page-size-options="[10, 20, 50]"
            :show-total="true"
            :total="rows.length"
            size="small"
            @change="(value: number) => page = value"
            @page-size-change="(value: number) => { pageSize = value; page = 1 }"
          />
        </div>
      </section>

      <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        {{ errorText }}
      </section>
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>

      <a-modal
        v-model:visible="billingDialogVisible"
        :footer="false"
        title="组织计费设置"
        width="520px"
      >
        <div v-if="selectedWorkspace" class="text-[11px] space-y-3">
          <div class="text-[10px] text-slate-600 p-2 border border-slate-200 bg-slate-50">
            <p class="text-[11px] text-slate-900 font-bold m-0">
              {{ selectedWorkspace.name }}
            </p>
            <p class="font-mono m-0 mt-1">
              {{ selectedWorkspace.workspaceId }}
            </p>
            <p class="m-0 mt-1">
              当前席位：{{ selectedWorkspace.seatUsed }} / {{ selectedWorkspace.seatLimit }}
            </p>
          </div>

          <div class="gap-2 grid md:grid-cols-2">
            <a-select
              v-model="planDraft[selectedWorkspace.workspaceId]"
              allow-clear
              size="small"
              placeholder="选择套餐"
            >
              <a-option
                v-for="plan in plans"
                :key="plan.id"
                :value="plan.id"
              >
                {{ plan.name }}
              </a-option>
            </a-select>
            <a-select
              v-model="cycleDraft[selectedWorkspace.workspaceId]"
              size="small"
            >
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
          </div>

          <div v-if="estimateMap[selectedWorkspace.workspaceId]" class="text-[10px] text-slate-600 p-2 border border-slate-200 rounded bg-slate-50">
            估算金额：¥{{ estimateMap[selectedWorkspace.workspaceId]?.estimatedAmountYuan?.toFixed(2) || '0.00' }}
          </div>

          <a-button
            long
            size="small"
            type="primary"
            :disabled="!planDraft[selectedWorkspace.workspaceId]"
            :loading="savingWorkspaceId === selectedWorkspace.workspaceId"
            @click="submitBillingDialog"
          >
            保存并估算
          </a-button>
        </div>
      </a-modal>
    </template>
  </div>
</template>
