import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const PROJECT_ROUTE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectRoute.ts')
const PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceSidebarLayout.ts')
const PROJECT_HELPERS_FILE = resolve(process.cwd(), 'app/utils/workspace-project-helpers.ts')
const PROJECT_SHELL_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')
const PROJECT_RESOURCES_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectResources.ts')
const PROJECT_MEETINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectMeetings.ts')
const PROJECT_COMMENTS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectComments.ts')
const PROJECT_AI_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectAi.ts')
const PROJECT_SETTINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectSettings.ts')

it('项目工作区入口已将 route、侧栏布局、领域状态机与纯 helper 拆出页面脚本', async () => {
  const [
    pageSource,
    routeSource,
    sidebarLayoutSource,
    helperSource,
    shellSource,
    resourcesSource,
    meetingsSource,
    commentsSource,
    aiSource,
    settingsSource,
  ] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(PROJECT_ROUTE_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_SIDEBAR_LAYOUT_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_HELPERS_FILE, 'utf8'),
    readFile(PROJECT_SHELL_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_RESOURCES_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_MEETINGS_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_COMMENTS_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_AI_COMPOSABLE_FILE, 'utf8'),
    readFile(PROJECT_SETTINGS_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectRoute'/, '项目工作区未接入 route composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceSidebarLayout'/, '项目工作区未接入侧栏布局 composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectShell'/, '项目工作区未接入 shell composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectResources'/, '项目工作区未接入 resources composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectMeetings'/, '项目工作区未接入 meetings composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectComments'/, '项目工作区未接入 comments composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectAi'/, '项目工作区未接入 ai composable')
  assert.match(pageSource, /from '~\/composables\/useWorkspaceProjectSettings'/, '项目工作区未接入 settings composable')
  assert.match(pageSource, /from '~\/utils\/workspace-project-helpers'/, '项目工作区未接入共享 helper 模块')
  assert.match(pageSource, /const \{ routeWorkspaceId, routeProjectId, highlightedProjectId, ensureCanonicalWorkspaceProjectRoute \} = useWorkspaceProjectRoute\(\)/, '项目工作区未复用 route 上下文')
  assert.match(pageSource, /const \{[\s\S]*askTopicBoardConfirm,[\s\S]*askDeviceRestoreConfirm,[\s\S]*\} = useWorkspaceProjectShell\(\)/, '项目工作区未复用 shell 组合逻辑')
  assert.match(pageSource, /const \{[\s\S]*resources,[\s\S]*previewStatusPayload,[\s\S]*projectResourceSharesLoading,[\s\S]*\} = useWorkspaceProjectResources\(\)/, '项目工作区未复用资源状态 composable')
  assert.match(pageSource, /const \{[\s\S]*projectMeetings,[\s\S]*loadProjectMeetings,[\s\S]*handleMeetingRealtimeEnvelope,[\s\S]*\} = useWorkspaceProjectMeetings\(/, '项目工作区未复用会议状态 composable')
  assert.match(pageSource, /const \{[\s\S]*markdownCommentThreads,[\s\S]*loadMarkdownCommentThreads,[\s\S]*reopenMarkdownCommentThread,[\s\S]*\} = useWorkspaceProjectComments\(/, '项目工作区未复用评论状态 composable')
  assert.match(pageSource, /const \{[\s\S]*topicBoardDraft,[\s\S]*chatMessages,[\s\S]*resetChatState,[\s\S]*\} = useWorkspaceProjectAi\(\)/, '项目工作区未复用 AI 状态 composable')
  assert.match(pageSource, /const \{[\s\S]*projectSettingsLoading,[\s\S]*projectSettingsDraftServerRevision,[\s\S]*\} = useWorkspaceProjectSettings\(\)/, '项目工作区未复用 settings 状态 composable')
  assert.match(pageSource, /const \{[\s\S]*initializeRightSidebarBreakpointTracking,[\s\S]*collapseRightSidebar,[\s\S]*expandRightSidebar,[\s\S]*\} = useWorkspaceSidebarLayout\(\)/, '项目工作区未复用侧栏布局状态机')
  assert.match(pageSource, /async function removeProjectResources\(resourceIds: string\[\]\)/, '项目工作区缺少批量删除资源处理')
  assert.match(pageSource, /@remove-project-resources="removeProjectResources"/, '项目工作区未接入左栏批量删除事件')
  assert.doesNotMatch(pageSource, /function normalizeRouteParam\(/, '项目工作区仍内联 normalizeRouteParam')
  assert.doesNotMatch(pageSource, /function normalizeQueryParam\(/, '项目工作区仍内联 normalizeQueryParam')
  assert.doesNotMatch(pageSource, /function teamDashboardPath\(/, '项目工作区仍内联 teamDashboardPath')
  assert.doesNotMatch(pageSource, /function teamDetailPath\(/, '项目工作区仍内联 teamDetailPath')
  assert.doesNotMatch(pageSource, /function workspaceDetailPath\(/, '项目工作区仍内联 workspaceDetailPath')
  assert.doesNotMatch(pageSource, /async function ensureCanonicalWorkspaceProjectRoute\(/, '项目工作区仍内联 canonical route 逻辑')
  assert.doesNotMatch(pageSource, /function initializeRightSidebarBreakpointTracking\(/, '项目工作区仍内联右侧栏断点状态机')
  assert.doesNotMatch(pageSource, /function collapseRightSidebar\(/, '项目工作区仍内联右侧栏折叠逻辑')
  assert.doesNotMatch(pageSource, /function expandRightSidebar\(/, '项目工作区仍内联右侧栏展开逻辑')
  assert.doesNotMatch(pageSource, /function createProjectMeeting\(/, '项目工作区仍内联会议创建状态机')
  assert.doesNotMatch(pageSource, /function loadProjectMeetingDetail\(/, '项目工作区仍内联会议详情状态机')
  assert.doesNotMatch(pageSource, /function loadMarkdownCommentThreads\(/, '项目工作区仍内联评论线程状态机')
  assert.doesNotMatch(pageSource, /function replyMarkdownCommentThread\(/, '项目工作区仍内联评论回复状态机')
  assert.doesNotMatch(pageSource, /function resolveApiErrorMessage\(/, '项目工作区仍内联 API 错误 helper')
  assert.doesNotMatch(pageSource, /function validateUploadFiles\(/, '项目工作区仍内联上传校验 helper')

  assert.match(routeSource, /export function useWorkspaceProjectRoute\(\)/, '缺少项目工作区 route composable')
  assert.match(routeSource, /export function workspaceDetailPath/, '缺少项目工作区 canonical path helper')
  assert.match(sidebarLayoutSource, /export function useWorkspaceSidebarLayout\(/, '缺少项目工作区侧栏布局 composable')
  assert.match(sidebarLayoutSource, /const leftSidebarCollapsed = ref\(true\)/, '项目工作区左栏默认未收起')
  assert.match(sidebarLayoutSource, /const rightSidebarUserCollapsed = ref\(true\)/, '项目工作区右栏默认未收起')
  assert.match(sidebarLayoutSource, /function initializeRightSidebarBreakpointTracking\(/, '侧栏布局 composable 缺少断点追踪逻辑')
  assert.match(sidebarLayoutSource, /function applySidebarLayoutState\(/, '侧栏布局 composable 缺少布局 hydration 逻辑')
  assert.match(shellSource, /export function useWorkspaceProjectShell\(/, '缺少项目工作区 shell composable')
  assert.match(shellSource, /leftSidebarCollapsed: true,\s+rightSidebarCollapsed: true,/, '项目工作区默认视图状态未将双侧边栏设为收起')
  assert.match(resourcesSource, /export function useWorkspaceProjectResources\(/, '缺少项目工作区 resources composable')
  assert.match(meetingsSource, /export function useWorkspaceProjectMeetings\(/, '缺少项目工作区 meetings composable')
  assert.match(commentsSource, /export function useWorkspaceProjectComments\(/, '缺少项目工作区 comments composable')
  assert.match(aiSource, /export function useWorkspaceProjectAi\(/, '缺少项目工作区 ai composable')
  assert.match(settingsSource, /export function useWorkspaceProjectSettings\(/, '缺少项目工作区 settings composable')

  assert.match(helperSource, /export function createEmptyProjectAdaptationForm/, '缺少项目工作区 adaptation helper')
  assert.match(helperSource, /export function resolveApiErrorMessage/, '缺少项目工作区错误处理 helper')
  assert.match(helperSource, /export function validateUploadFiles/, '缺少项目工作区上传校验 helper')
})
