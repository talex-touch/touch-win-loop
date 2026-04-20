import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_PROJECT_AI_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectAi.ts')
const WORKSPACE_METAK_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-metak.ts')
const FINAL_REVIEW_WORKBENCH_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewWorkbench.vue')
const FINAL_REVIEW_MATERIALS_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewMaterialsDrawer.vue')
const FINAL_REVIEW_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewSidebar.vue')
const PROJECT_WORKSPACE_VIEW_STORE_FILE = resolve(process.cwd(), 'server/utils/project-workspace-view-store.ts')
const PROJECT_WORKSPACE_VIEW_STORE_MODULE = pathToFileURL(PROJECT_WORKSPACE_VIEW_STORE_FILE).href

it('服务端视图状态归一化会保留终审工作台模式', async () => {
  const { normalizeProjectWorkspaceViewStatePayload } = await import(PROJECT_WORKSPACE_VIEW_STORE_MODULE)

  assert.equal(
    normalizeProjectWorkspaceViewStatePayload({ workbenchMode: 'final_review' }).workbenchMode,
    'final_review',
    '服务端 view-state 仍会把 final_review 降级成 project',
  )
  assert.equal(
    normalizeProjectWorkspaceViewStatePayload({ workbenchMode: 'unknown' }).workbenchMode,
    'project',
    '未知工作台模式不应污染历史 payload',
  )
})

it('终审工作台切到独立驾驶舱布局，并挂载左右边缘触发器与覆盖式抽屉', async () => {
  const [source, composableSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_PROJECT_AI_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(composableSource, /const finalReviewMaterialsOpen = ref\(false\)/, '终审资料抽屉状态未沉淀到 AI composable')
  assert.match(composableSource, /const finalReviewAssistantOpen = ref\(false\)/, '终审助手抽屉状态未沉淀到 AI composable')
  assert.match(composableSource, /const preFinalReviewLeftCollapsed = ref\(false\)/, '进入终审前的左栏折叠快照未沉淀到 AI composable')
  assert.match(composableSource, /const preFinalReviewRightCollapsed = ref\(false\)/, '进入终审前的右栏折叠快照未沉淀到 AI composable')
  assert.match(source, /const \{[\s\S]*finalReviewMaterialsOpen,[\s\S]*finalReviewAssistantOpen,[\s\S]*preFinalReviewLeftCollapsed,[\s\S]*preFinalReviewRightCollapsed,[\s\S]*\} = useWorkspaceProjectAi\(\)/, '项目页未消费终审抽屉与布局快照状态')
  assert.match(source, /rememberPreFinalReviewWorkbenchState/, '项目页缺少终审进入前的普通工作台快照函数')
  assert.match(source, /restorePreFinalReviewWorkbenchState/, '项目页缺少终审退出时的普通工作台恢复函数')
  assert.match(source, /data-testid="workspace-scene-shell"/, '项目页缺少统一工作台场景壳子')
  assert.match(source, /<Transition[\s\S]*:name="workbenchSceneTransitionName"[\s\S]*mode="out-in"/, '项目页未给工作台场景接入轮播过渡')
  assert.match(source, /<main[\s\S]*v-if="displayedWorkbenchMode !== 'final_review'"[\s\S]*class="workspace-workbench-scene workspace-layout/, '项目页未为普通工作台保留独立分支')
  assert.match(source, /data-testid="workspace-final-review-layout"/, '项目页缺少终审驾驶舱主容器测试锚点')
  assert.match(source, /data-testid="workspace-final-review-materials-trigger"/, '项目页缺少终审资料边缘触发器')
  assert.match(source, /data-testid="workspace-final-review-assistant-trigger"/, '项目页缺少终审助手边缘触发器')
  assert.match(source, /<WorkspaceFinalReviewWorkbench/, '项目页未挂载终审驾驶舱主区组件')
  assert.match(source, /<WorkspaceFinalReviewMaterialsDrawer/, '项目页未挂载终审资料抽屉组件')
  assert.match(source, /<WorkspaceFinalReviewSidebar/, '项目页未挂载终审助手抽屉组件')
  assert.match(source, /\.workspace-final-review-shell\s*\{/, '项目页缺少终审驾驶舱壳子样式')
  assert.match(source, /\.workspace-final-review-edge\s*\{/, '项目页缺少终审边缘触发器样式')
})

it('终审 readiness、风险和证据缺口只基于现有前端真实数据推导', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const finalReviewActiveShares = computed\(\(\) => \{\s+return projectResourceShares\.value\.filter/, '终审共享数未基于 projectResourceShares 推导')
  assert.match(source, /const finalReviewOpenIssues = computed\(\(\) => \{[\s\S]*projectIssues\.value[\s\S]*item\.severity === 'critical' \|\| item\.severity === 'high'/, '终审风险面板未基于 projectIssues 推导高优先级问题')
  assert.match(source, /const finalReviewEvidenceGaps = computed\(\(\) => \{[\s\S]*mappingRows\.value\.reduce/, '终审证据缺口未基于 mappingRows\.supportingNote 推导')
  assert.match(source, /const finalReviewChecklistItems = computed<FinalReviewChecklistItem\[\]>\(\(\) => \{[\s\S]*Boolean\(selectedContest\.value\) && Boolean\(selectedTrack\.value\)[\s\S]*mappingRows\.value\.length > 0[\s\S]*selectedResources\.value\.length > 0[\s\S]*normalizeString\(formState\.title\)[\s\S]*normalizeString\(formState\.problemStatement\)[\s\S]*normalizeString\(formState\.summary\)[\s\S]*Boolean\(latestIssueReport\.value\)[\s\S]*projectIssues\.value\.some\(item => item\.severity === 'critical' && item\.status === 'open'\)[\s\S]*finalReviewActiveShares\.value\.length > 0/, '终审审查清单未覆盖既定的真实数据规则')
  assert.match(source, /const finalReviewReadinessPercent = computed\(\(\) => \{/, '项目页缺少终审 readiness 进度推导')
})

it('终审工作台只在显式动作时打开流程，并可回到项目工作台打开设置或仪表盘', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const updateWorkbenchModeMatch = source.match(/async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\) \{([\s\S]*?)\n\}\n\nfunction updateWorkspaceAiMode/)

  assert.ok(updateWorkbenchModeMatch, '项目页缺少可供断言的 updateWorkbenchMode 函数体')
  const updateWorkbenchModeBody = updateWorkbenchModeMatch[1]

  assert.match(source, /async function updateWorkbenchMode\(nextMode: WorkspaceWorkbenchMode\)/, '项目页缺少终审工作台切换入口')
  assert.match(updateWorkbenchModeBody, /if \(workbenchSwitchPhase\.value !== 'idle'\)\s+return[\s\S]*workbenchSwitchTargetMode\.value = nextMode[\s\S]*if \(nextMode === 'final_review'\) \{[\s\S]*workbenchMode\.value = 'final_review'[\s\S]*aiMode\.value = 'dialog_ask'[\s\S]*statusLine\.value = '已切到终审工作台，当前进入终审驾驶舱。'[\s\S]*await runWorkbenchSwitchLoadingSequence\(\)[\s\S]*workbenchSwitchPhase\.value = 'animating'[\s\S]*displayedWorkbenchMode\.value = nextMode/, '终审工作台切换未接入加载条后轮播的两段式编排')
  assert.doesNotMatch(updateWorkbenchModeBody, /ensureWorkflowCanvas\(/, '切到终审工作台时仍会默认打开流程画布')
  assert.match(source, /async function refreshFinalReviewContext\(\): Promise<void> \{[\s\S]*loadProjectResources\(\),[\s\S]*loadProjectResourceShares\(\),[\s\S]*loadProjectIssues\(\),[\s\S]*loadProjectSettings\(contestId\),[\s\S]*loadSelectedContestDetail\(contestId\)[\s\S]*Promise\.allSettled\(tasks\)/, '项目页缺少终审上下文轻量刷新编排')
  assert.match(source, /if \(nextValue === 'final_review'\)\s+void refreshFinalReviewContext\(\)/, '进入终审工作台时未触发终审上下文刷新')
  assert.match(source, /function openMaterialsDrawerFromFinalReview\(\): void \{[\s\S]*finalReviewMaterialsOpen\.value = true[\s\S]*void refreshFinalReviewContext\(\)/, '终审工作台内部打开资料抽屉时未刷新终审上下文')
  assert.match(source, /function toggleFinalReviewMaterialsDrawerFromFinalReview\(\): void \{[\s\S]*finalReviewMaterialsOpen\.value = !finalReviewMaterialsOpen\.value[\s\S]*if \(finalReviewMaterialsOpen\.value\)\s+void refreshFinalReviewContext\(\)/, '终审边缘资料抽屉打开时未刷新终审上下文')
  assert.match(source, /const projectIssuesLoadedProjectId = ref\(''\)/, '项目页缺少 issue 已加载项目标记，无法区分首载与后台刷新')
  assert.match(source, /async function loadProjectIssues\(\) \{[\s\S]*const sameProjectRefresh = projectIssuesLoadedProjectId\.value === projectId[\s\S]*projectIssuesLoadedProjectId\.value = projectId[\s\S]*if \(activeProjectId\.value === projectId && !sameProjectRefresh\) \{[\s\S]*projectIssueReports\.value = \[\][\s\S]*projectIssues\.value = \[\]/, 'issue 后台刷新失败仍可能清空同项目已有风险数据')
  assert.doesNotMatch(source, /openFinalReviewFromHeader/, '项目页仍保留旧的终审头部开 flow 入口')
  assert.match(source, /async function openFinalReviewFlowFromWorkbench\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*await ensureWorkflowCanvas\(\)/, '终审“打开流程”动作未切回项目工作台并显式打开 workflow')
  assert.match(source, /async function openProjectSettingsFromFinalReview\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*openSettingsSignal\.value \+= 1/, '终审“打开项目设置”动作未切回项目工作台')
  assert.match(source, /async function openDashboardFromFinalReview\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*ensureWorkspaceMainTabOpen\('dashboard'\)/, '终审“打开仪表盘对标”动作未切回项目工作台')
  assert.match(source, /async function openResourceFromFinalReview\(resourceId: string\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*await openProjectResourcePreview\(normalizedResourceId\)/, '终审资料抽屉的打开资源动作未回到项目工作台')
})

it('metaK 的 open_final_review 与 switch_workbench_final_review 已统一切到终审工作台', async () => {
  const [workspaceSource, metakSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(WORKSPACE_METAK_UTIL_FILE, 'utf8'),
  ])

  assert.match(metakSource, /open_final_review/, 'MetaK action id 缺少 open_final_review')
  assert.match(metakSource, /switch_workbench_final_review/, 'MetaK action id 缺少 switch_workbench_final_review')
  assert.match(workspaceSource, /case 'open_final_review':[\s\S]*await updateWorkbenchMode\('final_review'\)/, 'MetaK open_final_review 未切到终审工作台')
  assert.match(workspaceSource, /case 'switch_workbench_final_review':[\s\S]*await updateWorkbenchMode\('final_review'\)/, 'MetaK switch_workbench_final_review 未切到终审工作台')
})

it('终审主区、资料抽屉和终审助手组件已按新语义拆出', async () => {
  const [workbenchSource, materialsSource, sidebarSource] = await Promise.all([
    readFile(FINAL_REVIEW_WORKBENCH_FILE, 'utf8'),
    readFile(FINAL_REVIEW_MATERIALS_FILE, 'utf8'),
    readFile(FINAL_REVIEW_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(workbenchSource, /data-testid="workspace-final-review-workbench"/, '终审驾驶舱主区缺少测试锚点')
  assert.match(workbenchSource, /data-testid="workspace-final-review-checklist"/, '终审驾驶舱缺少审查清单锚点')
  assert.match(workbenchSource, /data-testid="workspace-final-review-risk-panel"/, '终审驾驶舱缺少风险面板锚点')
  assert.match(workbenchSource, /data-testid="workspace-final-review-actions"/, '终审驾驶舱缺少终审动作锚点')
  assert.match(workbenchSource, /已关联到研发工作台的送审资料。/, '终审驾驶舱资料统计文案未切到研发工作台')
  assert.match(workbenchSource, /emit\('openFinalReviewFlow'\)/, '终审驾驶舱缺少显式打开流程动作')
  assert.match(materialsSource, /data-testid="workspace-final-review-materials-drawer"/, '终审资料抽屉缺少测试锚点')
  assert.match(materialsSource, /emit\('openResource', resource\.id\)/, '终审资料抽屉缺少打开资源动作')
  assert.match(materialsSource, /共享链接/, '终审资料抽屉缺少共享链接区块')
  assert.match(sidebarSource, /data-testid="workspace-final-review-sidebar"/, '终审助手抽屉缺少测试锚点')
  assert.match(sidebarSource, /输入终审问题，例如：这份材料还缺哪些证据？/, '终审助手未改成终审语义 placeholder')
  assert.match(sidebarSource, /可先在研发工作台生成寻疑结果。/, '终审助手未引用新的研发工作台文案')
  assert.match(sidebarSource, /emit\('sendChat'\)/, '终审助手未接回现有 chat send 事件')
  assert.match(sidebarSource, /aiEnabled\?: boolean/, '终审助手缺少 AI 可用态入参')
  assert.match(sidebarSource, /aiDisabledReason\?: string/, '终审助手缺少 AI 禁用原因入参')
  assert.match(sidebarSource, /:disabled="!props\.aiEnabled"/, '终审助手输入框未在 AI 未配置时禁用')
  assert.match(sidebarSource, /props\.aiDisabledReason \|\| '当前 AI 未配置，已禁用终审助手。请先在后台完成模型与密钥配置。'/, '终审助手未展示 AI 未配置原因')
  assert.match(sidebarSource, /:disabled="props\.chatLoading \|\| !props\.aiEnabled"/, '终审助手发送按钮未在 AI 未配置时禁用')
  assert.doesNotMatch(sidebarSource, /chatSessions|update:aiMode/, '终审助手仍暴露普通会话列表或模式切换入口')
})

it('终审资料抽屉在已有数据时只显示轻量 refreshing，不再用 loading 替换主列表', async () => {
  const [workspaceSource, materialsSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(FINAL_REVIEW_MATERIALS_FILE, 'utf8'),
  ])

  assert.match(materialsSource, /resourcesRefreshing\?: boolean/, '终审资料抽屉缺少资料后台刷新态入参')
  assert.match(materialsSource, /sharesRefreshing\?: boolean/, '终审资料抽屉缺少共享链接后台刷新态入参')
  assert.match(materialsSource, /workspace-final-review-materials-drawer__refreshing/, '终审资料抽屉缺少轻量刷新提示')
  assert.match(workspaceSource, /const projectResourceSharesFirstLoadLoading = computed\(\(\) => \{/, '项目页缺少终审共享链接首屏加载态计算')
  assert.match(workspaceSource, /const projectResourceSharesRefreshing = computed\(\(\) => \{/, '项目页缺少终审共享链接后台刷新态计算')
  assert.match(workspaceSource, /:resources-loading="projectResourcesFirstLoadLoading"/, '项目页未向终审资料抽屉透传资料首屏 loading')
  assert.match(workspaceSource, /:resources-refreshing="projectResourcesRefreshing"/, '项目页未向终审资料抽屉透传资料 refreshing')
  assert.match(workspaceSource, /:shares-loading="projectResourceSharesFirstLoadLoading"/, '项目页未向终审资料抽屉透传共享首屏 loading')
  assert.match(workspaceSource, /:shares-refreshing="projectResourceSharesRefreshing"/, '项目页未向终审资料抽屉透传共享 refreshing')
  assert.match(workspaceSource, /<WorkspaceFinalReviewSidebar[\s\S]*:ai-enabled="currentAiModeAvailable"[\s\S]*:ai-disabled-reason="currentAiDisabledReason"/, '项目页未向终审助手透传 AI 可用态')
})
