import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ADMIN_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const ADMIN_ROUTE_TABS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useAdminRouteTabs.ts')

it('admin 布局已将路由标签状态与持久化逻辑抽到 composable', async () => {
  const [layoutSource, composableSource] = await Promise.all([
    readFile(ADMIN_LAYOUT_FILE, 'utf8'),
    readFile(ADMIN_ROUTE_TABS_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(layoutSource, /from '~\/composables\/useAdminRouteTabs'/, 'admin 布局未接入 route tabs composable')
  assert.match(layoutSource, /to: '\/admin\/canvas-library', label: '画布资源库'/, 'admin 主侧栏缺少画布资源库入口')
  assert.doesNotMatch(layoutSource, /to: '\/admin\/mockups', label: 'Mockup 专项'/, 'admin 主侧栏不应再保留独立 Mockup 专项入口')
  assert.match(layoutSource, /const \{[\s\S]*adminRouteTabs,[\s\S]*activeRouteTabId,[\s\S]*restoreAdminRouteTabs,[\s\S]*appendRouteTab,[\s\S]*openRouteTab,[\s\S]*closeRouteTab,[\s\S]*\} = useAdminRouteTabs\(/, 'admin 布局未复用 route tabs 状态机')
  assert.doesNotMatch(layoutSource, /function normalizeAdminRoutePath\(/, 'admin 布局仍内联 route path 归一化逻辑')
  assert.doesNotMatch(layoutSource, /function restoreAdminRouteTabs\(/, 'admin 布局仍内联 route tab 持久化逻辑')
  assert.doesNotMatch(layoutSource, /function appendRouteTab\(/, 'admin 布局仍内联 route tab 追加逻辑')

  assert.match(composableSource, /export function useAdminRouteTabs\(/, '缺少 admin route tabs composable')
  assert.match(composableSource, /function normalizeAdminRoutePath\(/, 'admin route tabs composable 缺少 path 归一化逻辑')
  assert.match(composableSource, /function restoreAdminRouteTabs\(/, 'admin route tabs composable 缺少本地恢复逻辑')
})
