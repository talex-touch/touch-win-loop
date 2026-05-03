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

it('admin 布局支持桌面侧栏折叠与移动端抽屉导航', async () => {
  const layoutSource = await readFile(ADMIN_LAYOUT_FILE, 'utf8')

  assert.match(layoutSource, /ADMIN_MOBILE_MEDIA_QUERY = '\(max-width: 960px\)'/, 'admin 布局缺少移动端断点常量')
  assert.match(layoutSource, /ADMIN_SIDER_COLLAPSED_WIDTH = 78/, 'admin 布局缺少桌面侧栏折叠宽度')
  assert.match(layoutSource, /const desktopSidebarCollapsed = ref\(false\)/, 'admin 布局缺少桌面侧栏折叠状态')
  assert.match(layoutSource, /const mobileSidebarOpen = ref\(false\)/, 'admin 布局缺少移动端侧栏打开状态')
  assert.match(layoutSource, /const adminSiderWidth = computed\(\(\) => desktopSidebarCollapsed\.value \? ADMIN_SIDER_COLLAPSED_WIDTH : ADMIN_SIDER_EXPANDED_WIDTH\)/, 'admin 布局未通过 computed 驱动侧栏宽度')
  assert.match(layoutSource, /function toggleDesktopSidebar\(\)/, 'admin 布局缺少桌面侧栏折叠切换函数')
  assert.match(layoutSource, /function toggleMobileSidebar\(\)/, 'admin 布局缺少移动端侧栏切换函数')
  assert.match(layoutSource, /function closeMobileSidebarIfNeeded\(\)/, 'admin 布局缺少移动端路由切换自动收起逻辑')
  assert.match(layoutSource, /class="admin-sider-toggle admin-sider-toggle--desktop"/, 'admin 侧栏缺少桌面折叠按钮')
  assert.match(layoutSource, /class="admin-sider-toggle admin-sider-toggle--mobile"/, 'admin 侧栏缺少移动端关闭按钮')
  assert.match(layoutSource, /class="admin-mobile-menu-btn"/, 'admin header 缺少移动端打开侧栏按钮')
  assert.match(layoutSource, /class="admin-mobile-sider-mask"/, 'admin 布局缺少移动端侧栏遮罩')
  assert.match(layoutSource, /<span class="admin-menu-label">\{\{ item\.label \}\}<\/span>/, 'admin 菜单标签未包裹为可在折叠态隐藏的元素')
  assert.match(layoutSource, /@media \(max-width: 960px\) \{[\s\S]*\.admin-sider \{[\s\S]*position: fixed !important;[\s\S]*transform: translateX\(-104%\);/, 'admin 移动端侧栏未切换为抽屉定位')
  assert.match(layoutSource, /\.admin-sider\.is-mobile-open \{[\s\S]*transform: translateX\(0\);/, 'admin 移动端侧栏缺少打开态位移')
  assert.match(layoutSource, /\.admin-shell\.is-sidebar-collapsed \.admin-menu-label,[\s\S]*display: none;/, 'admin 桌面折叠态未隐藏菜单文字')
})
