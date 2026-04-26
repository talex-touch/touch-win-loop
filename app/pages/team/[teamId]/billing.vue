<script setup lang="ts">
import type {
  ApiResponse,
  BillingCycle,
  BillingPlan,
  WorkspaceBillingEstimate,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

type TeamBillingOrderStatus = 'pending' | 'paid' | 'cancelled' | 'failed'

interface TeamBillingOrder {
  id: string
  teamId: string
  workspaceId: string
  planId: string
  planCode: string
  planName: string
  billingCycle: BillingCycle
  amountCents: number
  amountYuan: number
  status: TeamBillingOrderStatus
  provider: 'mock'
  estimate: WorkspaceBillingEstimate | null
  createdByUserId?: string | null
  paidAt?: string | null
  createdAt: string
  updatedAt: string
}

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: 'Team 结算',
})

const route = useRoute()
const router = useRouter()
const authApiFetch = useAuthApiFetch()

const teamId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const raw = params.teamId
  return Array.isArray(raw) ? String(raw[0] || '').trim() : String(raw || '').trim()
})

const loading = ref(true)
const paying = ref(false)
const errorText = ref('')
const plans = ref<BillingPlan[]>([])
const estimate = ref<WorkspaceBillingEstimate | null>(null)
const orders = ref<TeamBillingOrder[]>([])
const selectedPlanId = ref('')
const billingCycle = ref<BillingCycle>('monthly')
const completedOrderId = ref('')

const selectedPlan = computed(() => {
  return plans.value.find(plan => plan.id === selectedPlanId.value) || plans.value[0] || null
})

const activePlan = computed(() => {
  const activePlanId = estimate.value?.planId
  return plans.value.find(plan => plan.id === activePlanId) || null
})

const businessPlans = computed(() => plans.value.filter(plan => plan.planTier === 'business_team'))
const personalPlans = computed(() => plans.value.filter(plan => plan.planTier === 'personal_team'))
const highlightedOrderId = computed(() => {
  return normalizeQueryValue(route.query.orderId) || completedOrderId.value
})
const highlightedOrder = computed(() => {
  const orderId = highlightedOrderId.value
  return orders.value.find(order => order.id === orderId) || null
})
const checkoutSuccessVisible = computed(() => {
  return normalizeQueryValue(route.query.checkout) === 'success' || Boolean(completedOrderId.value)
})
const createdCheckoutVisible = computed(() => normalizeQueryValue(route.query.created) === '1')
const selectionPending = computed(() => {
  if (!estimate.value)
    return false
  return selectedPlanId.value !== estimate.value.planId || billingCycle.value !== estimate.value.billingCycle
})

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

function formatMoney(cents: number): string {
  return `¥${(Math.max(0, Number(cents || 0)) / 100).toFixed(2)}`
}

function cycleLabel(cycle: BillingCycle): string {
  if (cycle === 'yearly')
    return '年付'
  if (cycle === 'quarterly')
    return '季付'
  return '月付'
}

function formatDateTime(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'

  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function orderStatusLabel(status: TeamBillingOrder['status']): string {
  if (status === 'paid')
    return '已支付'
  if (status === 'pending')
    return '待支付'
  if (status === 'cancelled')
    return '已取消'
  if (status === 'failed')
    return '失败'
  return status
}

async function loadBilling(): Promise<void> {
  const id = teamId.value
  if (!id)
    return
  loading.value = true
  errorText.value = ''
  try {
    const [plansResponse, estimateResponse, ordersResponse] = await Promise.all([
      authApiFetch<ApiResponse<BillingPlan[]>>('/billing/plans'),
      authApiFetch<ApiResponse<WorkspaceBillingEstimate>>(`/teams/${id}/billing/estimate`),
      authApiFetch<ApiResponse<{ orders: TeamBillingOrder[] }>>(`/teams/${id}/billing/orders`),
    ])
    plans.value = plansResponse.data || []
    estimate.value = estimateResponse.data || null
    orders.value = ordersResponse.data?.orders || []
    selectedPlanId.value = estimate.value?.planId
      || businessPlans.value[0]?.id
      || personalPlans.value[0]?.id
      || plans.value[0]?.id
      || ''
    billingCycle.value = estimate.value?.billingCycle || 'monthly'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '结算信息加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function mockPay(): Promise<void> {
  const id = teamId.value
  const planId = selectedPlanId.value
  if (!id || !planId)
    return
  paying.value = true
  errorText.value = ''
  try {
    const response = await authApiFetch<ApiResponse<{ order: TeamBillingOrder, estimate: WorkspaceBillingEstimate }>>(`/teams/${id}/billing/checkout`, {
      method: 'POST',
      body: {
        planId,
        billingCycle: billingCycle.value,
      },
    })
    estimate.value = response.data.estimate
    selectedPlanId.value = response.data.estimate.planId || planId
    billingCycle.value = response.data.estimate.billingCycle
    completedOrderId.value = response.data.order.id
    orders.value = [response.data.order, ...orders.value.filter(order => order.id !== response.data.order.id)]
    Message.success('模拟支付成功，Business Team 已生效。')
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '模拟支付失败，请重试。')
  }
  finally {
    paying.value = false
  }
}

onMounted(() => {
  void loadBilling()
})
</script>

<template>
  <main class="team-billing-page">
    <header class="team-billing-page__header">
      <div>
        <p class="team-billing-page__eyebrow">
          Business Team
        </p>
        <h1>Team 结算</h1>
        <p>选择套餐、确认席位与项目费用，当前使用 mock provider，点击支付即成功。</p>
      </div>
      <a-button @click="router.push(`/team/${teamId}`)">
        返回项目台
      </a-button>
    </header>

    <div v-if="loading" class="team-billing-page__state">
      正在加载结算信息...
    </div>
    <div v-else class="team-billing-page__grid">
      <section
        v-if="checkoutSuccessVisible"
        class="team-billing-page__panel team-billing-page__panel--wide team-billing-page__success"
        data-testid="team-billing-success-state"
      >
        <div>
          <span class="material-symbols-outlined">check_circle</span>
        </div>
        <div class="team-billing-page__success-copy">
          <p class="team-billing-page__eyebrow">
            {{ createdCheckoutVisible ? 'Team 已创建' : '支付完成' }}
          </p>
          <h2>Business Team 已立即生效</h2>
          <p>
            mock provider 已确认支付，当前套餐、席位和 AI 配额已同步到 Team 结算状态。
          </p>
          <dl>
            <div><dt>收据</dt><dd>{{ highlightedOrder?.id || highlightedOrderId || '同步中' }}</dd></div>
            <div><dt>支付时间</dt><dd>{{ formatDateTime(highlightedOrder?.paidAt || highlightedOrder?.createdAt) }}</dd></div>
            <div><dt>支付通道</dt><dd>mock provider</dd></div>
          </dl>
        </div>
        <div class="team-billing-page__success-actions">
          <a-button
            type="primary"
            data-testid="team-billing-next-create-project"
            @click="router.push(`/team/${teamId}?create=1`)"
          >
            新建项目
          </a-button>
          <a-button @click="router.push(`/team/${teamId}`)">
            返回项目台
          </a-button>
        </div>
      </section>

      <section
        v-if="estimate"
        class="team-billing-page__panel team-billing-page__panel--wide"
        data-testid="team-billing-active-plan"
      >
        <div class="team-billing-page__panel-header">
          <h2>当前生效</h2>
          <span>{{ estimate.updatedAt ? `更新于 ${formatDateTime(estimate.updatedAt)}` : '已同步' }}</span>
        </div>
        <div class="team-billing-page__active-summary">
          <div>
            <p>生效套餐</p>
            <strong>{{ activePlan?.name || estimate.planCode || '未配置套餐' }}</strong>
          </div>
          <div>
            <p>计费周期</p>
            <strong>{{ cycleLabel(estimate.billingCycle) }}</strong>
          </div>
          <div>
            <p>当前金额</p>
            <strong>{{ formatMoney(estimate.estimatedAmountCents) }}</strong>
          </div>
          <div>
            <p>配额</p>
            <strong>席位 {{ estimate.seatUsed }}/{{ Math.max(estimate.includedSeats, estimate.seatUsed) }} · AI {{ estimate.aiQuotaTotal }}</strong>
          </div>
        </div>
        <p v-if="selectionPending" class="team-billing-page__pending">
          你已选择新的套餐或周期，但尚未支付；点击“模拟支付并启用”后才会更新当前生效状态。
        </p>
      </section>

      <section class="team-billing-page__panel">
        <div class="team-billing-page__panel-header">
          <h2>套餐</h2>
          <span>{{ plans.length }} 个可用套餐</span>
        </div>
        <div class="team-billing-page__plans" data-testid="team-billing-plan-catalog">
          <button
            v-for="plan in plans"
            :key="plan.id"
            type="button"
            class="team-billing-page__plan"
            :class="{ 'team-billing-page__plan--active': selectedPlanId === plan.id }"
            @click="selectedPlanId = plan.id"
          >
            <span>{{ plan.planTier === 'business_team' ? 'Business' : 'Personal' }}</span>
            <strong>{{ plan.name }}</strong>
            <em>{{ formatMoney(plan.basePriceCents) }} / {{ cycleLabel(billingCycle) }}</em>
            <small>席位 {{ plan.includedSeats }} · AI {{ plan.includedAiQuota }} · 项目{{ plan.projectsUnlimited ? '不限量' : plan.includedProjects }}</small>
          </button>
        </div>
      </section>

      <section class="team-billing-page__panel">
        <div class="team-billing-page__panel-header">
          <h2>结算确认</h2>
          <span>{{ selectionPending ? '待支付生效' : '当前已生效' }}</span>
        </div>
        <p class="team-billing-page__selection">
          {{ selectedPlan?.name || '未选择套餐' }} / {{ cycleLabel(billingCycle) }}
        </p>
        <div class="team-billing-page__cycle">
          <button
            v-for="cycle in ['monthly', 'quarterly', 'yearly']"
            :key="cycle"
            type="button"
            :class="{ 'team-billing-page__cycle-button--active': billingCycle === cycle }"
            class="team-billing-page__cycle-button"
            @click="billingCycle = cycle as BillingCycle"
          >
            {{ cycleLabel(cycle as BillingCycle) }}
          </button>
        </div>
        <dl v-if="estimate" class="team-billing-page__estimate" data-testid="team-billing-estimate">
          <div><dt>当前席位</dt><dd>{{ estimate.seatUsed }}/{{ Math.max(estimate.includedSeats, estimate.seatUsed) }}</dd></div>
          <div><dt>项目席位</dt><dd>{{ estimate.projectSeatUsedTotal }}/{{ estimate.projectSeatLimitTotal }}</dd></div>
          <div><dt>计费项目席位</dt><dd>{{ estimate.chargedProjectSeatsTotal }}</dd></div>
          <div><dt>AI 配额</dt><dd>{{ estimate.aiQuotaTotal }}</dd></div>
          <div><dt>预估金额</dt><dd>{{ formatMoney(estimate.estimatedAmountCents) }}</dd></div>
        </dl>
        <p v-if="errorText" class="team-billing-page__error">
          {{ errorText }}
        </p>
        <a-button
          type="primary"
          size="large"
          :loading="paying"
          :disabled="!selectedPlanId"
          data-testid="team-billing-mock-pay-button"
          @click="mockPay"
        >
          模拟支付并启用
        </a-button>
      </section>

      <section class="team-billing-page__panel team-billing-page__panel--wide">
        <div class="team-billing-page__panel-header">
          <h2>收据与支付记录</h2>
          <span>mock provider</span>
        </div>
        <div v-if="orders.length" class="team-billing-page__orders" data-testid="team-billing-orders">
          <article
            v-for="order in orders"
            :key="order.id"
            class="team-billing-page__order"
            :class="{ 'team-billing-page__order--highlight': order.id === highlightedOrderId }"
          >
            <div>
              <strong>{{ order.planName }}</strong>
              <span>{{ order.id }}</span>
            </div>
            <em>{{ formatMoney(order.amountCents) }}</em>
            <span>{{ cycleLabel(order.billingCycle) }}</span>
            <span>{{ order.provider }} provider</span>
            <span>{{ orderStatusLabel(order.status) }}</span>
            <time>{{ formatDateTime(order.paidAt || order.createdAt) }}</time>
          </article>
        </div>
        <p v-else class="team-billing-page__empty">
          暂无支付记录。完成一次模拟支付后会生成收据记录。
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.team-billing-page {
  display: grid;
  gap: 18px;
  padding: 24px;
  color: #0f172a;
}

.team-billing-page__header,
.team-billing-page__panel,
.team-billing-page__state {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.team-billing-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
}

.team-billing-page__header h1 {
  margin: 4px 0;
  font-size: 24px;
}

.team-billing-page__header p,
.team-billing-page__empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.team-billing-page__eyebrow {
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.team-billing-page__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 16px;
}

.team-billing-page__panel {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.team-billing-page__panel--wide {
  grid-column: 1 / -1;
}

.team-billing-page__success {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border-color: #bbf7d0;
  background: #f0fdf4;
}

.team-billing-page__success .material-symbols-outlined {
  color: #16a34a;
  font-size: 32px;
}

.team-billing-page__success-copy {
  display: grid;
  gap: 8px;
}

.team-billing-page__success-copy h2,
.team-billing-page__success-copy p {
  margin: 0;
}

.team-billing-page__success-copy h2 {
  font-size: 18px;
}

.team-billing-page__success-copy dl {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 0;
}

.team-billing-page__success-copy dl div {
  display: flex;
  gap: 6px;
}

.team-billing-page__success-copy dt {
  color: #64748b;
  font-size: 12px;
}

.team-billing-page__success-copy dd {
  margin: 0;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
}

.team-billing-page__success-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.team-billing-page__panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.team-billing-page__panel-header h2 {
  margin: 0;
  font-size: 16px;
}

.team-billing-page__panel-header span {
  color: #64748b;
  font-size: 12px;
}

.team-billing-page__plans {
  display: grid;
  gap: 10px;
}

.team-billing-page__active-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.team-billing-page__active-summary div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.team-billing-page__active-summary p,
.team-billing-page__selection,
.team-billing-page__pending {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.team-billing-page__active-summary strong {
  color: #0f172a;
  font-size: 13px;
}

.team-billing-page__pending {
  color: #b45309;
}

.team-billing-page__plan {
  display: grid;
  gap: 6px;
  padding: 14px;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.team-billing-page__plan--active {
  border-color: #2563eb;
  background: #eff6ff;
}

.team-billing-page__plan span,
.team-billing-page__plan small,
.team-billing-page__order span,
.team-billing-page__order time {
  color: #64748b;
  font-size: 12px;
}

.team-billing-page__plan strong {
  font-size: 16px;
}

.team-billing-page__plan em,
.team-billing-page__order em {
  color: #0f172a;
  font-style: normal;
  font-weight: 700;
}

.team-billing-page__cycle {
  display: flex;
  gap: 8px;
}

.team-billing-page__cycle-button {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
}

.team-billing-page__cycle-button--active {
  color: #1d4ed8;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.team-billing-page__estimate {
  display: grid;
  gap: 8px;
  margin: 0;
}

.team-billing-page__estimate div,
.team-billing-page__order {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.team-billing-page__estimate dt {
  color: #64748b;
  font-size: 13px;
}

.team-billing-page__estimate dd {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.team-billing-page__error {
  margin: 0;
  color: #dc2626;
  font-size: 12px;
}

.team-billing-page__state {
  padding: 48px;
  color: #64748b;
  text-align: center;
}

.team-billing-page__orders {
  display: grid;
  gap: 8px;
}

.team-billing-page__order {
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  flex-wrap: wrap;
}

.team-billing-page__order div {
  display: grid;
  gap: 2px;
}

.team-billing-page__order--highlight {
  border-color: #22c55e;
  background: #f0fdf4;
}

@media (max-width: 900px) {
  .team-billing-page__grid {
    grid-template-columns: 1fr;
  }

  .team-billing-page__success,
  .team-billing-page__active-summary {
    grid-template-columns: 1fr;
  }

  .team-billing-page__success-actions {
    justify-content: flex-start;
  }
}
</style>
