import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const PROJECT_ROUTE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectRoute.ts')
const PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceSidebarLayout.ts')
const PROJECT_HELPERS_FILE = resolve(process.cwd(), 'app/utils/workspace-project-helpers.ts')

it('项目工作区入口已将 route、侧栏布局状态机与纯 helper 拆出页面脚本', async () => {
  const [pageSource, routeSource, sidebarLayoutSource, helperSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(PROJECT_ROUTE_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_HELPERS_FILE, 'utf8'),
  ])

  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectRoute'/, '项目工作区未接入 route composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceSidebarLayout'/, '项目工作区未接入侧栏布局 composable')
  assert.match(pageSource, /from '~\/utils\/workspace-project-helpers'/, '项目工作区未接入共享 helper 模块')
  assert.match(pageSource, /const \{ routeWorkspaceId, routeProjectId, highlightedProjectId, ensureCanonicalWorkspaceProjectRoute \} = useWorkspaceProjectRoute\(\)/, '项目工作区未复用 route 上下文')
  assert.match(pageSource, /const \{[\s\S]*initializeRightSidebarBreakpointTracking,[\s\S]*collapseRightSidebar,[\s\S]*expandRightSidebar,[\s\S]*\} = useWorkspaceSidebarLayout\(\)/, '项目工作区未复用侧栏布局状态机')
  assert.doesNotMatch(pageSource, /function normalizeRouteParam\(/, '项目工作区仍内联 normalizeRouteParam')
  assert.doesNotMatch(pageSource, /function normalizeQueryParam\(/, '项目工作区仍内联 normalizeQueryParam')
  assert.doesNotMatch(pageSource, /function teamDashboardPath\(/, '项目工作区仍内联 teamDashboardPath')
  assert.doesNotMatch(pageSource, /function teamDetailPath\(/, '项目工作区仍内联 teamDetailPath')
  assert.doesNotMatch(pageSource, /function workspaceDetailPath\(/, '项目工作区仍内联 workspaceDetailPath')
  assert.doesNotMatch(pageSource, /async function ensureCanonicalWorkspaceProjectRoute\(/, '项目工作区仍内联 canonical route 逻辑')
  assert.doesNotMatch(pageSource, /function initializeRightSidebarBreakpointTracking\(/, '项目工作区仍内联右侧栏断点状态机')
  assert.doesNotMatch(pageSource, /function collapseRightSidebar\(/, '项目工作区仍内联右侧栏折叠逻辑')
  assert.doesNotMatch(pageSource, /function expandRightSidebar\(/, '项目工作区仍内联右侧栏展开逻辑')
  assert.doesNotMatch(pageSource, /function resolveApiErrorMessage\(/, '项目工作区仍内联 API 错误 helper')
  assert.doesNotMatch(pageSource, /function validateUploadFiles\(/, '项目工作区仍内联上传校验 helper')

  assert.match(routeSource, /export function useWorkspaceProjectRoute\(\)/, '缺少项目工作区 route composable')
  assert.match(routeSource, /export function workspaceDetailPath/, '缺少项目工作区 canonical path helper')
  assert.match(sidebarLayoutSource, /export function useWorkspaceSidebarLayout\(/, '缺少项目工作区侧栏布局 composable')
  assert.match(sidebarLayoutSource, /function initializeRightSidebarBreakpointTracking\(/, '侧栏布局 composable 缺少断点追踪逻辑')
  assert.match(sidebarLayoutSource, /function applySidebarLayoutState\(/, '侧栏布局 composable 缺少布局 hydration 逻辑')

  assert.match(helperSource, /export function createEmptyProjectAdaptationForm/, '缺少项目工作区 adaptation helper')
  assert.match(helperSource, /export function resolveApiErrorMessage/, '缺少项目工作区错误处理 helper')
  assert.match(helperSource, /export function validateUploadFiles/, '缺少项目工作区上传校验 helper')
})
