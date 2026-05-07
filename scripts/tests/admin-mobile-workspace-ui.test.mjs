import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ADMIN_LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const ADMIN_SUBNAV_FILE = resolve(process.cwd(), 'app/components/admin/AdminSubnav.vue')
const CONTEST_WORKSPACE_TABS_FILE = resolve(process.cwd(), 'app/components/admin/ContestWorkspaceTabs.vue')
const ADMIN_CONTEST_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/admin/contests/[id].vue')

it('admin 移动端侧栏在切页后自动收起且不撑出主布局', async () => {
  const source = await readFile(ADMIN_LAYOUT_FILE, 'utf8')

  assert.match(source, /watch\(\(\) => route\.fullPath,[\s\S]*closeMobileSidebarIfNeeded\(\)/, 'admin 布局切页后未收起移动端侧栏')
  assert.match(source, /\.admin-shell \{[\s\S]*max-width: 100vw;[\s\S]*overflow: hidden;/, 'admin shell 未限制视口宽度')
  assert.match(source, /\.admin-layout \{[\s\S]*width: 100%;[\s\S]*min-width: 0;/, 'admin layout 缺少移动端收缩约束')
  assert.match(source, /\.admin-main-layout \{[\s\S]*min-width: 0;/, 'admin 主内容布局缺少 min-width 约束')
  assert.match(source, /@media \(max-width: 960px\) \{[\s\S]*\.admin-sider \{[\s\S]*position: fixed !important;[\s\S]*transform: translateX\(-104%\);/, 'admin 移动端侧栏未作为抽屉脱离主布局')
})

it('admin 子导航在手机上支持摘要按钮展开并随路由切换收起', async () => {
  const source = await readFile(ADMIN_SUBNAV_FILE, 'utf8')

  assert.match(source, /const mobileExpanded = ref\(false\)/, 'AdminSubnav 缺少移动端展开状态')
  assert.match(source, /const activeLabel = computed\(/, 'AdminSubnav 缺少当前项摘要')
  assert.match(source, /watch\(\(\) => route\.fullPath,[\s\S]*closeMobileExpanded\(\)/, 'AdminSubnav 切页后未收起移动端面板')
  assert.match(source, /class="admin-subnav-mobile-trigger"/, 'AdminSubnav 缺少移动端展开触发器')
  assert.match(source, /:aria-expanded="mobileExpanded \? 'true' : 'false'"/, 'AdminSubnav 缺少可访问展开状态')
  assert.match(source, /@media \(max-width: 640px\) \{[\s\S]*\.admin-subnav-tabs \{[\s\S]*display: none;[\s\S]*\.admin-subnav-tabs\.is-mobile-expanded \{[\s\S]*display: block;/, 'AdminSubnav 手机端未收起 tabs 面板')
  assert.match(source, /:deep\(\.wl-pill-tabs\) \{[\s\S]*grid-template-columns: 1fr;/, 'AdminSubnav 手机端 tabs 未改为单列避免横向溢出')
})

it('竞赛工作区 tabs 在手机上可收起展开并覆盖全部模块', async () => {
  const [tabsSource, workspaceSource] = await Promise.all([
    readFile(CONTEST_WORKSPACE_TABS_FILE, 'utf8'),
    readFile(ADMIN_CONTEST_WORKSPACE_FILE, 'utf8'),
  ])

  assert.match(tabsSource, /const mobileExpanded = ref\(false\)/, 'ContestWorkspaceTabs 缺少移动端展开状态')
  assert.match(tabsSource, /const activeLabel = computed\(/, 'ContestWorkspaceTabs 缺少当前模块摘要')
  assert.match(tabsSource, /watch\(\(\) => route\.fullPath,[\s\S]*closeMobileExpanded\(\)/, 'ContestWorkspaceTabs 切页后未收起移动端面板')
  assert.match(tabsSource, /class="contest-workspace-tabs-mobile-trigger"/, 'ContestWorkspaceTabs 缺少移动端展开触发器')
  assert.match(tabsSource, /key: 'releases'[\s\S]*to: `\/admin\/contests\/\$\{id\}\/releases`/, 'ContestWorkspaceTabs 缺少版本发布模块')
  assert.match(tabsSource, /key: 'knowledge'[\s\S]*to: `\/admin\/contests\/\$\{id\}\/knowledge`/, 'ContestWorkspaceTabs 缺少知识库治理模块')
  assert.match(tabsSource, /@media \(max-width: 640px\) \{[\s\S]*\.contest-workspace-tabs-panel \{[\s\S]*display: none;[\s\S]*\.contest-workspace-tabs-panel\.is-mobile-expanded \{[\s\S]*display: block;/, 'ContestWorkspaceTabs 手机端未收起 tabs 面板')
  assert.match(tabsSource, /:deep\(\.wl-pill-tab\) \{[\s\S]*width: 100%;[\s\S]*justify-content: flex-start;/, 'ContestWorkspaceTabs 手机端 tab 未铺满单列')
  assert.match(workspaceSource, /<ContestWorkspaceTabs class="mt-3" :contest-id="contestId" \/>/, '竞赛工作区父页未复用统一 tabs 组件')
  assert.doesNotMatch(workspaceSource, /v-for="item in workspaceModules"/, '竞赛工作区父页仍保留第二套模块按钮')
})
