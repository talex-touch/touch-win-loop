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
  assert.match(layoutSource, /const \{[\s\S]*adminRouteTabs,[\s\S]*activeRouteTabId,[\s\S]*restoreAdminRouteTabs,[\s\S]*appendRouteTab,[\s\S]*openRouteTab,[\s\S]*closeRouteTab,[\s\S]*closeTabsToLeft,[\s\S]*closeTabsToRight,[\s\S]*closeOtherTabs,[\s\S]*closeAllTabs,[\s\S]*\} = useAdminRouteTabs\(/, 'admin 布局未复用完整的 route tabs 状态机')
  assert.match(layoutSource, /<UiContextMenu[\s\S]*test-id="admin-route-tab-context-menu"/, 'admin tabs 未挂载统一右键菜单')
  assert.match(layoutSource, /function handleRouteTabContextMenuFromPointer\(tabId: string, event: MouseEvent\)/, 'admin tabs 缺少右键菜单入口')
  assert.match(layoutSource, /case 'closeAll':[\s\S]*await closeAllTabs\(\)/, 'admin tabs 右键菜单缺少关闭全部操作')
  assert.doesNotMatch(layoutSource, /function normalizeAdminRoutePath\(/, 'admin 布局仍内联 route path 归一化逻辑')
  assert.doesNotMatch(layoutSource, /function restoreAdminRouteTabs\(/, 'admin 布局仍内联 route tab 持久化逻辑')
  assert.doesNotMatch(layoutSource, /function appendRouteTab\(/, 'admin 布局仍内联 route tab 追加逻辑')

  assert.match(composableSource, /export function useAdminRouteTabs\(/, '缺少 admin route tabs composable')
  assert.match(composableSource, /function normalizeAdminRoutePath\(/, 'admin route tabs composable 缺少 path 归一化逻辑')
  assert.match(composableSource, /function restoreAdminRouteTabs\(/, 'admin route tabs composable 缺少本地恢复逻辑')
  assert.match(composableSource, /function buildNormalizedAdminRouteTabs\(/, 'admin route tabs composable 缺少去重归一化 helper')
  assert.match(composableSource, /async function closeTabsToLeft\(tabId: string\)/, 'admin route tabs composable 缺少关闭左侧标签能力')
  assert.match(composableSource, /async function closeTabsToRight\(tabId: string\)/, 'admin route tabs composable 缺少关闭右侧标签能力')
  assert.match(composableSource, /async function closeOtherTabs\(tabId: string\)/, 'admin route tabs composable 缺少关闭其他标签能力')
  assert.match(composableSource, /async function closeAllTabs\(\)/, 'admin route tabs composable 缺少关闭全部标签能力')
})
