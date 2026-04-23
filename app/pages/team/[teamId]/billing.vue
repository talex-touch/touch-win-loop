<script setup lang="ts">
import type {
  ApiResponse,
  BillingCycle,
  BillingPlan,
  WorkspaceBillingEstimate,
  WorkspaceBillingOrder,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'

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
const orders = ref<WorkspaceBillingOrder[]>([])
const selectedPlanId = ref('')
const billingCycle = ref<BillingCycle>('monthly')

const selectedPlan = computed(() => {
  return plans.value.find(plan => plan.id === selectedPlanId.value) || plans.value[0] || null
})

const businessPlans = computed(() => plans.value.filter(plan => plan.planTier === 'business_team'))
const personalPlans = computed(() => plans.value.filter(plan => plan.planTier === 'personal_team'))

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
      authApiFetch<ApiResponse<{ orders: WorkspaceBillingOrder[] }>>(`/teams/${id}/billing/orders`),
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
    const response = await authApiFetch<ApiResponse<{ order: WorkspaceBillingOrder, estimate: WorkspaceBillingEstimate }>>(`/teams/${id}/billing/checkout`, {
      method: 'POST',
      body: {
        planId,
        billingCycle: billingCycle.value,
      },
    })
    estimate.value = response.data.estimate
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
          <span>{{ selectedPlan?.name || '未选择套餐' }}</span>
        </div>
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
          <h2>支付记录</h2>
          <span>mock provider</span>
        </div>
        <div v-if="orders.length" class="team-billing-page__orders" data-testid="team-billing-orders">
          <article v-for="order in orders" :key="order.id" class="team-billing-page__order">
            <div>
              <strong>{{ order.planName }}</strong>
              <span>{{ order.id }}</span>
            </div>
            <em>{{ formatMoney(order.amountCents) }}</em>
            <span>{{ order.status === 'paid' ? '已支付' : order.status }}</span>
            <time>{{ order.paidAt || order.createdAt }}</time>
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
}

.team-billing-page__order div {
  display: grid;
  gap: 2px;
}

@media (max-width: 900px) {
  .team-billing-page__grid {
    grid-template-columns: 1fr;
  }
}
</style>
