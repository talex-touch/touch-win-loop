import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const CONTEST_STORE_FILE = resolve(process.cwd(), 'server/utils/contest-store.ts')
const PUBLIC_PLANS_API_FILE = resolve(process.cwd(), 'server/api/billing/plans.get.ts')
const CHECKOUT_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/billing/checkout.post.ts')
const ORDERS_API_FILE = resolve(process.cwd(), 'server/api/teams/[id]/billing/orders.get.ts')
const BILLING_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/billing.vue')
const SWITCH_ENTRY_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceSwitchEntry.vue')
const TEAM_INDEX_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/index.vue')

it('Business Team 结算具备 mock order 持久化与用户侧 API', async () => {
  const [schema, store, plansApi, checkoutApi, ordersApi] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(CONTEST_STORE_FILE, 'utf8'),
    readFile(PUBLIC_PLANS_API_FILE, 'utf8'),
    readFile(CHECKOUT_API_FILE, 'utf8'),
    readFile(ORDERS_API_FILE, 'utf8'),
  ])

  assert.match(schema, /CREATE TABLE IF NOT EXISTS workspace_billing_orders/, '缺少 workspace_billing_orders 表')
  assert.match(schema, /provider TEXT NOT NULL DEFAULT 'mock'/, '订单表未固定 mock provider')
  assert.match(store, /createWorkspaceBillingMockCheckout/, '计费 store 缺少 mock checkout')
  assert.match(store, /setWorkspaceBillingPlan/, 'mock checkout 未更新 workspace_billing')
  assert.match(store, /listWorkspaceBillingOrders/, '计费 store 缺少订单列表')
  assert.match(plansApi, /listBillingPlans\(db, false\)/, '用户侧套餐 API 未只返回启用套餐')
  assert.match(checkoutApi, /createWorkspaceBillingMockCheckout/, 'checkout API 未接入 mock 支付')
  assert.match(ordersApi, /listWorkspaceBillingOrders/, '订单 API 未返回 Team 结算记录')
})

it('创建 Business Team 与 Team 结算页接入模拟支付闭环', async () => {
  const [billingPage, switchEntry, teamIndex] = await Promise.all([
    readFile(BILLING_PAGE_FILE, 'utf8'),
    readFile(SWITCH_ENTRY_FILE, 'utf8'),
    readFile(TEAM_INDEX_FILE, 'utf8'),
  ])

  assert.match(switchEntry, /data-testid="workspace-create-business-checkout"/, '创建 Team 弹窗缺少套餐与结算选择')
  assert.match(switchEntry, /\/billing\/plans/, '创建 Team 弹窗未加载用户侧套餐')
  assert.match(switchEntry, /\/teams\/\$\{response\.data\.team\.id\}\/billing\/checkout/, '创建 Team 弹窗未在创建后触发 mock checkout')
  assert.match(billingPage, /data-testid="team-billing-plan-catalog"/, 'Team 结算页缺少套餐目录')
  assert.match(billingPage, /data-testid="team-billing-mock-pay-button"/, 'Team 结算页缺少模拟支付按钮')
  assert.match(billingPage, /data-testid="team-billing-orders"/, 'Team 结算页缺少订单记录')
  assert.match(teamIndex, /\/team\/\$\{activeWorkspaceId\.value\}\/billing/, 'Team 首页缺少用户侧结算入口')
})
