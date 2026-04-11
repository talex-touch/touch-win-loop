import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_METAK_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-metak.ts')
const FINAL_REVIEW_WORKBENCH_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewWorkbench.vue')
const FINAL_REVIEW_MATERIALS_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewMaterialsDrawer.vue')
const FINAL_REVIEW_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceFinalReviewSidebar.vue')

it('终审工作台切到独立驾驶舱布局，并挂载左右边缘触发器与覆盖式抽屉', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const finalReviewMaterialsOpen = ref\(false\)/, '项目页缺少终审资料抽屉状态')
  assert.match(source, /const finalReviewAssistantOpen = ref\(false\)/, '项目页缺少终审助手抽屉状态')
  assert.match(source, /const preFinalReviewLeftCollapsed = ref\(false\)/, '项目页缺少进入终审前的左栏折叠快照')
  assert.match(source, /const preFinalReviewRightCollapsed = ref\(false\)/, '项目页缺少进入终审前的右栏折叠快照')
  assert.match(source, /rememberPreFinalReviewWorkbenchState/, '项目页缺少终审进入前的普通工作台快照函数')
  assert.match(source, /restorePreFinalReviewWorkbenchState/, '项目页缺少终审退出时的普通工作台恢复函数')
  assert.match(source, /<main v-if="workbenchMode !== 'final_review'" class="workspace-layout/, '项目页未为普通工作台保留独立分支')
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
  assert.match(updateWorkbenchModeBody, /if \(nextMode === 'final_review'\) \{[\s\S]*workbenchMode\.value = 'final_review'[\s\S]*aiMode\.value = 'dialog_ask'[\s\S]*statusLine\.value = '已切到终审工作台，当前进入终审驾驶舱。'/, '终审工作台切换仍未进入独立驾驶舱语义')
  assert.doesNotMatch(updateWorkbenchModeBody, /ensureWorkflowCanvas\(/, '切到终审工作台时仍会默认打开流程画布')
  assert.doesNotMatch(source, /openFinalReviewFromHeader/, '项目页仍保留旧的终审头部开 flow 入口')
  assert.match(source, /async function openFinalReviewFlowFromWorkbench\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*await ensureWorkflowCanvas\(\)/, '终审“打开流程”动作未切回项目工作台并显式打开 workflow')
  assert.match(source, /async function openProjectSettingsFromFinalReview\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*openSettingsSignal\.value \+= 1/, '终审“打开项目设置”动作未切回项目工作台')
  assert.match(source, /async function openDashboardFromFinalReview\(\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*ensureWorkspaceMainTabOpen\('dashboard'\)/, '终审“打开仪表盘对标”动作未切回项目工作台')
  assert.match(source, /async function openResourceFromFinalReview\(resourceId: string\): Promise<void> \{[\s\S]*await updateWorkbenchMode\('project'\)[\s\S]*await openProjectResourcePreview\(normalizedResourceId\)/, '终审资料抽屉的打开资源动作未回到项目工作台')
})

it('MetaK 的 open_final_review 与 switch_workbench_final_review 已统一切到终审工作台', async () => {
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
  assert.match(workbenchSource, /emit\('openFinalReviewFlow'\)/, '终审驾驶舱缺少显式打开流程动作')
  assert.match(materialsSource, /data-testid="workspace-final-review-materials-drawer"/, '终审资料抽屉缺少测试锚点')
  assert.match(materialsSource, /emit\('openResource', resource\.id\)/, '终审资料抽屉缺少打开资源动作')
  assert.match(materialsSource, /共享链接/, '终审资料抽屉缺少共享链接区块')
  assert.match(sidebarSource, /data-testid="workspace-final-review-sidebar"/, '终审助手抽屉缺少测试锚点')
  assert.match(sidebarSource, /输入终审问题，例如：这份材料还缺哪些证据？/, '终审助手未改成终审语义 placeholder')
  assert.match(sidebarSource, /emit\('sendChat'\)/, '终审助手未接回现有 chat send 事件')
  assert.doesNotMatch(sidebarSource, /chatSessions|update:aiMode/, '终审助手仍暴露普通会话列表或模式切换入口')
})
