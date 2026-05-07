<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  BillingCycle,
  BillingPlan,
  BillingUsageEvent,
  BillingUsageEventCode,
  BillingUsageEventResult,
  BillingUsageEventsPayload,
  BillingUsageEventSummaryRow,
  PlatformPermission,
  WorkspaceBillingEstimate,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import { BILLING_USAGE_EVENT_CODES } from '~~/shared/types/domain'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

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
    query?: Record<string, string | number | undefined>
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const url = new URL(path, 'http://localhost')
  for (const [key, value] of Object.entries(options.query || {})) {
    if (value === undefined || value === '')
      continue
    url.searchParams.set(key, String(value))
  }

  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(`${url.pathname}${url.search}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0) {
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  }
  return payload.data
}

const permissions = ref<PlatformPermission[]>([])
const workspaces = ref<WorkspaceWithQuota[]>([])
const plans = ref<BillingPlan[]>([])
const estimate = ref<WorkspaceBillingEstimate | null>(null)
const usageEventsPayload = ref<BillingUsageEventsPayload | null>(null)

const loading = ref(true)
const saving = ref(false)
const usageEventsLoading = ref(false)
const createDialogVisible = ref(false)
const editDialogVisible = ref(false)
const errorText = ref('')
const successText = ref('')

const canWritePricing = computed(() =>
  permissions.value.includes('pricing.write'),
)

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

const usageFilterForm = reactive<{
  from: string
  to: string
  workspaceId: string
  actorUserId: string
  eventCode: BillingUsageEventCode | ''
  result: BillingUsageEventResult | ''
  page: number
  pageSize: number
}>({
  from: '',
  to: '',
  workspaceId: '',
  actorUserId: '',
  eventCode: '',
  result: 'success',
  page: 1,
  pageSize: 20,
})

const planPage = ref(1)
const planPageSize = ref(10)

const planColumns = [
  { title: '套餐', dataIndex: 'name', slotName: 'name' },
  {
    title: '基础价',
    dataIndex: 'basePriceCents',
    slotName: 'basePrice',
    width: 120,
  },
  { title: '包含席位', dataIndex: 'includedSeats', width: 100 },
  {
    title: '超额单价',
    dataIndex: 'extraSeatPriceCents',
    slotName: 'extraSeatPrice',
    width: 120,
  },
  { title: 'AI 配额', dataIndex: 'includedAiQuota', width: 100 },
  { title: '状态', dataIndex: 'isActive', slotName: 'status', width: 100 },
  {
    title: '操作',
    dataIndex: 'actions',
    slotName: 'actions',
    width: 120,
    fixed: 'right' as const,
  },
]

const usageSummaryColumns = [
  { title: '工作区', dataIndex: 'workspaceId', slotName: 'workspace' },
  { title: '事件', dataIndex: 'eventCode', slotName: 'eventCode', width: 180 },
  { title: '结果', dataIndex: 'result', slotName: 'result', width: 100 },
  { title: '次数', dataIndex: 'total', width: 90 },
]

const usageDetailColumns = [
  { title: '时间', dataIndex: 'createdAt', slotName: 'createdAt', width: 180 },
  {
    title: '工作区',
    dataIndex: 'workspaceId',
    slotName: 'workspace',
    width: 180,
  },
  { title: '用户', dataIndex: 'actorUserId', slotName: 'actor', width: 180 },
  { title: '事件', dataIndex: 'eventCode', slotName: 'eventCode', width: 180 },
  { title: '结果', dataIndex: 'result', slotName: 'result', width: 100 },
  {
    title: '来源路由',
    dataIndex: 'sourceRoute',
    slotName: 'sourceRoute',
    width: 220,
  },
  { title: '对象', dataIndex: 'object', slotName: 'object', width: 260 },
  { title: 'Meta', dataIndex: 'meta', slotName: 'meta', width: 260 },
]

const pagedPlans = computed(() => {
  const start = (planPage.value - 1) * planPageSize.value
  return plans.value.slice(start, start + planPageSize.value)
})

const usageSummaryRows = computed(
  () => usageEventsPayload.value?.summary || [],
)
const usageEventItems = computed(() => usageEventsPayload.value?.items || [])
const usageEventTotal = computed(() => usageEventsPayload.value?.total || 0)
const usageEventPage = computed(
  () => usageEventsPayload.value?.page || usageFilterForm.page,
)
const usageEventPageSize = computed(
  () => usageEventsPayload.value?.pageSize || usageFilterForm.pageSize,
)

watch([plans, planPageSize], () => {
  const maxPage = Math.max(
    1,
    Math.ceil(plans.value.length / planPageSize.value),
  )
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

function formatCurrencyYuan(value: number | null | undefined): string {
  const amount = Number(value || 0)
  return `${(amount / 100).toFixed(2)} 元`
}

function formatUsageEventCode(value: BillingUsageEventCode): string {
  if (value === 'resource.download')
    return '资源下载'
  if (value === 'resource.favorite.create')
    return '资料收藏'
  if (value === 'ai.topic_proposal.generate')
    return '选题建议生成'
  if (value === 'review.submit')
    return '评审提交'
  if (value === 'review.report.export')
    return '评审报告导出'
  if (value === 'ai.defense.start')
    return '模拟答辩发起'
  return value
}

function formatUsageResult(value: BillingUsageEventResult): string {
  return value === 'success' ? '成功' : '失败'
}

function formatDateTime(value: string | null | undefined): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '-'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return normalized

  return parsed.toLocaleString('zh-CN', {
    hour12: false,
  })
}

function normalizeDateTimeFilterValue(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return ''

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime()))
    return normalized

  return parsed.toISOString()
}

function formatUsageMeta(
  meta: Record<string, unknown> | null | undefined,
): string {
  if (!meta || typeof meta !== 'object')
    return '-'

  const keys = Object.keys(meta)
  if (keys.length === 0)
    return '-'

  try {
    return JSON.stringify(meta)
  }
  catch {
    return '[invalid meta]'
  }
}

function resolveUsageObjectSummary(item: BillingUsageEvent): string {
  const pairs = [
    item.projectId ? `project:${item.projectId}` : '',
    item.projectResourceId ? `projectResource:${item.projectResourceId}` : '',
    item.contestResourceId ? `contestResource:${item.contestResourceId}` : '',
    item.reportId ? `report:${item.reportId}` : '',
    item.contestId ? `contest:${item.contestId}` : '',
    item.trackId ? `track:${item.trackId}` : '',
  ].filter(Boolean)

  return pairs.length > 0 ? pairs.join(' | ') : '-'
}

function resolveWorkspaceLabel(
  workspaceId: string,
  workspaceName?: string,
): string {
  if (workspaceName)
    return `${workspaceName} (${workspaceId})`
  return workspaceId || '-'
}

function usageSummaryRowKey(record: BillingUsageEventSummaryRow): string {
  return `${record.workspaceId}:${record.eventCode}:${record.result}`
}

async function loadContext() {
  const me = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  permissions.value = me.data.user.platformPermissions || []
  workspaces.value = me.data.workspaces
  if (!estimateForm.workspaceId && workspaces.value[0])
    estimateForm.workspaceId = workspaces.value[0].workspace.id
}

async function loadPlans() {
  plans.value = await requestApi<BillingPlan[]>(
    endpoint('/admin/billing/plans'),
    {},
    '套餐列表加载失败。',
  )
  if (!estimateForm.planId && plans.value[0])
    estimateForm.planId = plans.value[0].id
}

async function loadEstimate() {
  if (!estimateForm.workspaceId)
    return
  estimate.value = await requestApi<WorkspaceBillingEstimate>(
    endpoint(`/teams/${estimateForm.workspaceId}/billing/estimate`),
    {},
    '账单估算加载失败。',
  )
}

async function loadUsageEvents() {
  usageEventsLoading.value = true
  try {
    const query: Record<string, string | number> = {
      page: usageFilterForm.page,
      pageSize: usageFilterForm.pageSize,
    }

    const from = normalizeDateTimeFilterValue(usageFilterForm.from)
    const to = normalizeDateTimeFilterValue(usageFilterForm.to)
    const workspaceId = usageFilterForm.workspaceId.trim()
    const actorUserId = usageFilterForm.actorUserId.trim()
    const eventCode = String(usageFilterForm.eventCode || '').trim()
    const result = String(usageFilterForm.result || '').trim()

    if (from)
      query.from = from
    if (to)
      query.to = to
    if (workspaceId)
      query.workspaceId = workspaceId
    if (actorUserId)
      query.actorUserId = actorUserId
    if (eventCode)
      query.eventCode = eventCode
    if (result)
      query.result = result

    usageEventsPayload.value = await requestApi<BillingUsageEventsPayload>(
      endpoint('/admin/billing/usage-events'),
      {
        query,
      },
      '计费行为事件加载失败。',
    )
  }
  catch (error: any) {
    usageEventsPayload.value = null
    errorText.value = String(error?.data?.message || '计费行为事件加载失败。')
  }
  finally {
    usageEventsLoading.value = false
  }
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
    await requestApi<unknown>(
      endpoint('/admin/billing/plans'),
      {
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
      },
      '套餐创建失败。',
    )
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
    await requestApi<unknown>(
      endpoint('/admin/billing/plans'),
      {
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
      },
      '套餐更新失败。',
    )
  }, '套餐已更新。')
  if (!errorText.value)
    editDialogVisible.value = false
}

async function switchWorkspacePlan() {
  if (!estimateForm.workspaceId || !estimateForm.planId)
    return
  await runAction(async () => {
    await requestApi<unknown>(
      endpoint(`/teams/${estimateForm.workspaceId}/billing`),
      {
        method: 'PATCH',
        body: {
          planId: estimateForm.planId,
          billingCycle: estimateForm.billingCycle,
        },
      },
      '工作区套餐切换失败。',
    )
  }, '工作区套餐已切换并重新估算。')
}

async function handleUsageSearch() {
  usageFilterForm.page = 1
  errorText.value = ''
  await loadUsageEvents()
}

async function handleUsageReset() {
  usageFilterForm.from = ''
  usageFilterForm.to = ''
  usageFilterForm.workspaceId = ''
  usageFilterForm.actorUserId = ''
  usageFilterForm.eventCode = ''
  usageFilterForm.result = 'success'
  usageFilterForm.page = 1
  usageFilterForm.pageSize = 20
  errorText.value = ''
  await loadUsageEvents()
}

async function handleUsagePageChange(page: number) {
  usageFilterForm.page = page
  await loadUsageEvents()
}

async function handleUsagePageSizeChange(pageSize: number) {
  usageFilterForm.pageSize = pageSize
  usageFilterForm.page = 1
  await loadUsageEvents()
}

onMounted(async () => {
  loading.value = true
  errorText.value = ''
  try {
    await loadContext()
    if (canWritePricing.value) {
      await Promise.all([loadPlans(), loadEstimate(), loadUsageEvents()])
    }
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin/billing') },
      }, { replace: true })
      return
    }
    errorText.value = resolveAuthDisplayMessage(error, '计费页面加载失败。')
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
          套餐与计费行为
        </h1>
        <p class="text-xs text-slate-500 mt-1">
          管理套餐参数、工作区计费估算，并查看本期计费行为事件汇总与明细。
        </p>
      </div>
    </section>

    <section
      v-if="loading"
      class="p-4 border border-slate-200 rounded-lg bg-white"
    >
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="10" />
      </a-skeleton>
    </section>

    <section
      v-else-if="!canWritePricing"
      class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50"
    >
      403：当前账号没有 `pricing.write` 权限。
    </section>

    <template v-else>
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex gap-2 items-center justify-between">
          <h2 class="text-sm text-slate-900 font-semibold">
            套餐列表
          </h2>
          <a-button
            size="small"
            type="primary"
            @click="createDialogVisible = true"
          >
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
                <p
                  class="text-[10px] text-slate-500 font-mono m-0 mt-1 truncate"
                >
                  planId: {{ record.id }}
                </p>
              </div>
            </template>
            <template #basePrice="{ record }">
              {{ formatCurrencyYuan(record.basePriceCents) }}
            </template>
            <template #extraSeatPrice="{ record }">
              {{ formatCurrencyYuan(record.extraSeatPriceCents) }}/席
            </template>
            <template #status="{ record }">
              <a-tag :color="record.isActive ? 'green' : 'gray'" size="small">
                {{ record.isActive ? "active" : "inactive" }}
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
              @change="(value: number) => (planPage = value)"
              @page-size-change="
                (value: number) => {
                  planPageSize = value;
                  planPage = 1;
                }
              "
            />
          </div>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <h2 class="text-sm text-slate-900 font-semibold">
          工作区费用估算
        </h2>
        <div class="mt-2 gap-2 grid md:grid-cols-4">
          <a-select
            v-model="estimateForm.workspaceId"
            allow-clear
            size="small"
            placeholder="选择工作区"
          >
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
          <a-select
            v-model="estimateForm.planId"
            allow-clear
            size="small"
            placeholder="选择套餐"
          >
            <a-option value="">
              选择套餐
            </a-option>
            <a-option v-for="plan in plans" :key="plan.id" :value="plan.id">
              {{ plan.name }}
            </a-option>
          </a-select>
          <a-select
            v-model="estimateForm.billingCycle"
            size="small"
            placeholder="计费周期"
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
          <div class="flex gap-2 items-center">
            <a-button
              size="small"
              :loading="saving"
              :disabled="!estimateForm.workspaceId"
              @click="loadEstimate"
            >
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

        <div
          v-if="estimate"
          class="text-xs text-slate-700 mt-3 p-3 border border-slate-200 rounded bg-slate-50"
        >
          <p>工作区：{{ estimate.workspaceId }}</p>
          <p>
            套餐：{{ estimate.planCode || "未配置" }}（{{
              estimate.planId || "-"
            }}）
          </p>
          <p>
            席位使用：{{ estimate.seatUsed }} / 包含
            {{ estimate.includedSeats }}，超额 {{ estimate.extraSeats }}
          </p>
          <p>
            基础价：{{
              formatCurrencyYuan(estimate.basePriceCents)
            }}，超额单价：{{ formatCurrencyYuan(estimate.extraSeatPriceCents) }}
          </p>
          <p class="text-slate-900 font-semibold">
            估算金额：{{ estimate.estimatedAmountYuan.toFixed(2) }} 元
          </p>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="flex flex-wrap gap-3 items-start justify-between">
          <div>
            <h2 class="text-sm text-slate-900 font-semibold">
              计费行为事件
            </h2>
            <p class="text-xs text-slate-500 mt-1">
              支持按时间、工作区、用户、事件类型和结果查询，并同时查看汇总与明细。
            </p>
          </div>
          <div class="flex gap-2">
            <a-button
              size="small"
              :disabled="usageEventsLoading"
              @click="handleUsageReset"
            >
              重置筛选
            </a-button>
            <a-button
              size="small"
              type="primary"
              :loading="usageEventsLoading"
              @click="handleUsageSearch"
            >
              查询
            </a-button>
          </div>
        </div>

        <div class="mt-3 gap-3 grid md:grid-cols-2 xl:grid-cols-3">
          <label class="text-xs text-slate-600 space-y-1">
            <span>开始时间</span>
            <input
              v-model="usageFilterForm.from"
              class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded w-full transition focus:border-slate-400"
              type="datetime-local"
            >
          </label>
          <label class="text-xs text-slate-600 space-y-1">
            <span>结束时间</span>
            <input
              v-model="usageFilterForm.to"
              class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded w-full transition focus:border-slate-400"
              type="datetime-local"
            >
          </label>
          <label class="text-xs text-slate-600 space-y-1">
            <span>工作区</span>
            <a-select
              v-model="usageFilterForm.workspaceId"
              allow-clear
              size="small"
              placeholder="全部工作区"
            >
              <a-option value=""> 全部工作区 </a-option>
              <a-option
                v-for="item in workspaces"
                :key="item.workspace.id"
                :value="item.workspace.id"
              >
                {{ item.workspace.name }}（{{ item.workspace.id }}）
              </a-option>
            </a-select>
          </label>
          <label class="text-xs text-slate-600 space-y-1">
            <span>用户 ID</span>
            <input
              v-model="usageFilterForm.actorUserId"
              class="text-sm text-slate-700 px-3 py-2 outline-none border border-slate-200 rounded w-full transition focus:border-slate-400"
              placeholder="按 actorUserId 过滤"
              type="text"
            >
          </label>
          <label class="text-xs text-slate-600 space-y-1">
            <span>事件类型</span>
            <a-select
              v-model="usageFilterForm.eventCode"
              allow-clear
              size="small"
              placeholder="全部事件"
            >
              <a-option value=""> 全部事件 </a-option>
              <a-option
                v-for="code in BILLING_USAGE_EVENT_CODES"
                :key="code"
                :value="code"
              >
                {{ formatUsageEventCode(code) }}
              </a-option>
            </a-select>
          </label>
          <label class="text-xs text-slate-600 space-y-1">
            <span>结果</span>
            <a-select
              v-model="usageFilterForm.result"
              allow-clear
              size="small"
              placeholder="全部结果"
            >
              <a-option value=""> 全部结果 </a-option>
              <a-option value="success"> 成功 </a-option>
              <a-option value="failed"> 失败 </a-option>
            </a-select>
          </label>
        </div>

        <div class="mt-4 space-y-4">
          <div>
            <div class="mb-2 flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-700 font-semibold">
                汇总
              </h3>
              <span class="text-[11px] text-slate-400">
                {{ usageSummaryRows.length }} 行
              </span>
            </div>
            <a-table
              :bordered="{ cell: true }"
              :columns="usageSummaryColumns"
              :data="usageSummaryRows"
              :loading="usageEventsLoading"
              :pagination="false"
              :row-key="usageSummaryRowKey"
              size="small"
            >
              <template #workspace="{ record }">
                <div class="min-w-0">
                  <p class="text-slate-900 m-0 truncate">
                    {{
                      resolveWorkspaceLabel(
                        record.workspaceId,
                        record.workspaceName,
                      )
                    }}
                  </p>
                </div>
              </template>
              <template #eventCode="{ record }">
                <div class="space-y-1">
                  <p class="text-slate-900 m-0">
                    {{ formatUsageEventCode(record.eventCode) }}
                  </p>
                  <p class="text-[10px] text-slate-400 font-mono m-0">
                    {{ record.eventCode }}
                  </p>
                </div>
              </template>
              <template #result="{ record }">
                <a-tag
                  :color="record.result === 'success' ? 'green' : 'red'"
                  size="small"
                >
                  {{ formatUsageResult(record.result) }}
                </a-tag>
              </template>
            </a-table>
          </div>

          <div>
            <div class="mb-2 flex gap-2 items-center justify-between">
              <h3 class="text-xs text-slate-700 font-semibold">
                明细
              </h3>
              <span class="text-[11px] text-slate-400">
                共 {{ usageEventTotal }} 条
              </span>
            </div>
            <a-table
              :bordered="{ cell: true }"
              :columns="usageDetailColumns"
              :data="usageEventItems"
              :loading="usageEventsLoading"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <template #createdAt="{ record }">
                <span class="text-xs text-slate-700">{{
                  formatDateTime(record.createdAt)
                }}</span>
              </template>
              <template #workspace="{ record }">
                <div class="min-w-0">
                  <p class="text-slate-900 m-0 truncate">
                    {{
                      resolveWorkspaceLabel(
                        record.workspaceId,
                        record.workspaceName,
                      )
                    }}
                  </p>
                </div>
              </template>
              <template #actor="{ record }">
                <div class="space-y-1">
                  <p class="text-slate-900 m-0">
                    {{ record.actorUsername || "-" }}
                  </p>
                  <p class="text-[10px] text-slate-400 font-mono m-0">
                    {{ record.actorUserId || "-" }}
                  </p>
                </div>
              </template>
              <template #eventCode="{ record }">
                <div class="space-y-1">
                  <p class="text-slate-900 m-0">
                    {{ formatUsageEventCode(record.eventCode) }}
                  </p>
                  <p class="text-[10px] text-slate-400 font-mono m-0">
                    {{ record.eventCode }}
                  </p>
                </div>
              </template>
              <template #result="{ record }">
                <a-tag
                  :color="record.result === 'success' ? 'green' : 'red'"
                  size="small"
                >
                  {{ formatUsageResult(record.result) }}
                </a-tag>
              </template>
              <template #sourceRoute="{ record }">
                <span class="text-[11px] text-slate-600 font-mono break-all">{{
                  record.sourceRoute || "-"
                }}</span>
              </template>
              <template #object="{ record }">
                <span class="text-[11px] text-slate-600 font-mono break-all">{{
                  resolveUsageObjectSummary(record)
                }}</span>
              </template>
              <template #meta="{ record }">
                <span class="text-[11px] text-slate-600 font-mono break-all">{{
                  formatUsageMeta(record.meta)
                }}</span>
              </template>
            </a-table>
            <div class="mt-3 flex justify-end">
              <a-pagination
                :current="usageEventPage"
                :page-size="usageEventPageSize"
                :page-size-options="[20, 50, 100]"
                :show-total="true"
                :total="usageEventTotal"
                size="small"
                @change="handleUsagePageChange"
                @page-size-change="handleUsagePageSizeChange"
              />
            </div>
          </div>
        </div>
      </section>
    </template>

    <section
      v-if="errorText"
      class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50"
    >
      {{ errorText }}
    </section>
    <section
      v-if="successText"
      class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50"
    >
      {{ successText }}
    </section>

    <a-modal
      v-model:visible="createDialogVisible"
      :footer="false"
      title="新增套餐"
      width="560px"
    >
      <div class="text-[11px] gap-2 grid md:grid-cols-2">
        <a-input
          v-model="createForm.code"
          size="small"
          placeholder="套餐编码（如 team_base）"
        />
        <a-input
          v-model="createForm.name"
          size="small"
          placeholder="套餐名称"
        />
        <a-input-number
          v-model="createForm.basePriceCents"
          size="small"
          :min="0"
          placeholder="基础价（分）"
        />
        <a-input-number
          v-model="createForm.includedSeats"
          size="small"
          :min="0"
          placeholder="包含席位"
        />
        <a-input-number
          v-model="createForm.extraSeatPriceCents"
          size="small"
          :min="0"
          placeholder="超额单价（分）"
        />
        <a-input-number
          v-model="createForm.includedAiQuota"
          size="small"
          :min="0"
          placeholder="包含 AI 配额"
        />
        <div
          class="text-xs text-slate-700 flex gap-2 items-center md:col-span-2"
        >
          <a-switch v-model="createForm.isActive" size="small" />
          <span>是否启用</span>
        </div>
        <a-button
          type="primary"
          size="small"
          class="mt-1 md:col-span-2"
          :loading="saving"
          @click="createPlan"
        >
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
        <a-input
          v-model="editForm.planId"
          size="small"
          class="md:col-span-2"
          disabled
        />
        <a-input v-model="editForm.code" size="small" placeholder="套餐编码" />
        <a-input v-model="editForm.name" size="small" placeholder="套餐名称" />
        <a-input-number
          v-model="editForm.basePriceCents"
          size="small"
          :min="0"
          placeholder="基础价（分）"
        />
        <a-input-number
          v-model="editForm.includedSeats"
          size="small"
          :min="0"
          placeholder="包含席位"
        />
        <a-input-number
          v-model="editForm.extraSeatPriceCents"
          size="small"
          :min="0"
          placeholder="超额单价（分）"
        />
        <a-input-number
          v-model="editForm.includedAiQuota"
          size="small"
          :min="0"
          placeholder="包含 AI 配额"
        />
        <div
          class="text-xs text-slate-700 flex gap-2 items-center md:col-span-2"
        >
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
