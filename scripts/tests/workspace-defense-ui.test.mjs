import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_PROJECT_AI_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectAi.ts')
const DEFENSE_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDefenseSidebar.vue')
const DEFENSE_WORKBENCH_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDefenseWorkbench.vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const DEFENSE_SESSION_DETAIL_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/sessions/[sessionId].get.ts')
const DEFENSE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-defense-store.ts')

it('答辩工作台切到独立三段式布局，并脱离左栏模块与主区 tabs', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')
  const defenseBranchMatch = source.match(/<template v-else>[\s\S]*?<\/template>\s*<div\s+class="workspace-right-dock"/)

  assert.match(source, /data-testid="workspace-scene-shell"/, '项目页缺少工作台场景壳子')
  assert.match(source, /<Transition[\s\S]*:name="workbenchSceneTransitionName"[\s\S]*mode="out-in"/, '项目页未将工作台切换接入统一场景轮播过渡')
  assert.match(source, /:data-testid="displayedWorkbenchMode === 'defense' \? 'workspace-defense-layout' : 'workspace-project-layout'"/, '项目页缺少答辩工作台布局测试锚点')
  assert.match(source, /<section class="workspace-defense-shell flex flex-1 min-h-0 min-w-0 overflow-hidden">/, '项目页未挂载独立答辩壳子')
  assert.match(source, /<WorkspaceDefenseSidebar/, '项目页未挂载答辩左栏')
  assert.match(source, /<WorkspaceDefenseWorkbench/, '项目页未挂载答辩驾驶舱主区')
  assert.ok(defenseBranchMatch, '项目页缺少可断言的答辩工作台分支')

  const defenseBranch = defenseBranchMatch[0]
  assert.doesNotMatch(defenseBranch, /<WorkspaceLeftSidebar\b/, '答辩工作台仍在挂载研发左侧栏')
  assert.doesNotMatch(defenseBranch, /<WorkspaceMainPanel\b/, '答辩工作台仍在挂载研发主区')
  assert.doesNotMatch(defenseBranch, /WorkspaceMainPanelChrome|WorkspaceTabStrip/, '答辩工作台仍依赖主区 tabs chrome')
  assert.match(source, /:defense-session-meta="defenseSessionMetaSnapshot"/, '项目页未向答辩工作台透传会话 meta 快照')
  assert.match(source, /:defense-session-state="defenseSessionStateSnapshot"/, '项目页未向答辩工作台透传会话 state 快照')
  assert.match(source, /\.workspace-defense-shell\s*\{/, '项目页缺少答辩工作台壳子样式')
  assert.match(source, /\.workspace-defense-shell__sidebar\s*\{/, '项目页缺少答辩左栏布局样式')
  assert.match(source, /\.workspace-defense-shell__stage\s*\{/, '项目页缺少答辩主区布局样式')
})

it('答辩会话状态在 composable 和项目页内保留完整 state/meta，并复用到三处界面', async () => {
  const [projectAiSource, workspaceSource, rightSidebarSource] = await Promise.all([
    readFile(WORKSPACE_PROJECT_AI_FILE, 'utf8'),
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(projectAiSource, /const defenseSessionMeta = ref<AiChatSession \| null>\(null\)/, '项目 AI composable 缺少答辩会话 meta 状态')
  assert.match(projectAiSource, /const defenseSessionState = ref<AiDefenseSessionState \| null>\(null\)/, '项目 AI composable 缺少答辩会话 state 状态')
  assert.match(projectAiSource, /const defenseTurns = ref<AiDefenseTurn\[\]>\(\[\]\)/, '项目 AI composable 缺少答辩 turn 历史状态')
  assert.match(workspaceSource, /const defenseSessionMetaSnapshot = computed\(\(\) => \{/, '项目页缺少答辩会话 meta 快照')
  assert.match(workspaceSource, /const defenseSessionStateSnapshot = computed<AiDefenseSessionState \| null>\(\(\) => \{/, '项目页缺少答辩会话 state 快照')
  assert.match(workspaceSource, /defenseSessionMeta\.value = detail\.session \|\| null/, 'loadDefenseSessionDetail 未同步保存答辩会话 meta')
  assert.match(workspaceSource, /defenseSessionState\.value = detail\.state \|\| null/, 'loadDefenseSessionDetail 未同步保存答辩会话 state')
  assert.match(workspaceSource, /defenseTurns\.value = detail\.turns \|\| \[\]/, 'loadDefenseSessionDetail 未同步保存答辩 turn 历史')
  assert.match(workspaceSource, /defenseRounds\.value = detail\.latestRounds \|\| \[\]/, 'loadDefenseSessionDetail 未直接复用后端 latestRounds')
  assert.match(workspaceSource, /<WorkspaceDefenseSidebar[\s\S]*:session-meta="defenseSessionMetaSnapshot"[\s\S]*:session-state="defenseSessionStateSnapshot"/, '答辩左栏未复用统一答辩会话状态')
  assert.match(workspaceSource, /<WorkspaceDefenseWorkbench[\s\S]*:contest="selectedContest"[\s\S]*:contest-timelines="defenseContestTimelines"[\s\S]*:session-meta="defenseSessionMetaSnapshot"[\s\S]*:session-state="defenseSessionStateSnapshot"[\s\S]*:personas="defensePersonas"[\s\S]*:turns="defenseTurns"/, '答辩主区未接入比赛 timeline、persona 和 turn 历史')
  assert.match(workspaceSource, /<WorkspaceRightSidebar[\s\S]*:workbench-mode="displayedWorkbenchMode"[\s\S]*:defense-session-meta="defenseSessionMetaSnapshot"[\s\S]*:defense-session-state="defenseSessionStateSnapshot"/, 'AgentDef 右栏未复用统一答辩会话状态')
  assert.match(rightSidebarSource, /defenseSessionMeta\?: AiChatSession \| null/, '右栏缺少答辩会话 meta 入参')
  assert.match(rightSidebarSource, /defenseSessionState\?: AiDefenseSessionState \| null/, '右栏缺少答辩会话 state 入参')
})

it('答辩明细接口会直接返回 latestRounds，避免主面板重复裁剪最新轮次', async () => {
  const [detailSource, storeSource] = await Promise.all([
    readFile(DEFENSE_SESSION_DETAIL_FILE, 'utf8'),
    readFile(DEFENSE_STORE_FILE, 'utf8'),
  ])

  assert.match(storeSource, /export function buildDefenseJudgeRoundsFromTurns\(/, 'defense store 缺少 turn -> latestRounds 映射工具')
  assert.match(detailSource, /latestRounds: buildDefenseJudgeRoundsFromTurns\(turns, \{[\s\S]*turnIndex: state\?\.turnCount \|\| null,[\s\S]*\}\)/, '答辩明细接口未直接返回 latestRounds')
})

it('答辩左栏固定为概述加评委列表，且保持只读状态导向', async () => {
  const source = await readFile(DEFENSE_SIDEBAR_FILE, 'utf8')

  assert.match(source, /data-testid="workspace-defense-sidebar"/, '答辩左栏缺少测试锚点')
  assert.match(source, /data-testid="workspace-defense-sidebar-overview"/, '答辩左栏缺少概述区锚点')
  assert.match(source, /data-testid="workspace-defense-persona-list"/, '答辩左栏缺少评委列表锚点')
  assert.match(source, /答辩概述/, '答辩左栏缺少概述标题')
  assert.match(source, /评委列表/, '答辩左栏缺少评委列表标题')
  assert.match(source, /resolvePersonaBadge/, '答辩左栏未根据当前轮次或启用态生成评委状态标识')
  assert.match(source, /当前项目还没有答辩评委人设。可在右侧 AgentDef 导入比赛预设或新建评委。/, '答辩左栏空态文案未切到 AgentDef 语义')
  assert.doesNotMatch(source, /defineEmits/, '答辩左栏不应承载编辑动作')
})

it('答辩主区切成无 tabs 的比赛状态驾驶舱，并提供主动作入口', async () => {
  const source = await readFile(DEFENSE_WORKBENCH_FILE, 'utf8')

  assert.match(source, /data-testid="workspace-defense-workbench"/, '答辩主区缺少测试锚点')
  assert.match(source, /data-testid="workspace-defense-actions"/, '答辩主区缺少动作区锚点')
  assert.match(source, /data-testid="workspace-defense-status-panel"/, '答辩主区缺少比赛状态面板锚点')
  assert.match(source, /data-testid="workspace-defense-persona-stage"/, '答辩主区缺少答辩席状态锚点')
  assert.match(source, /data-testid="workspace-defense-scorecard"/, '答辩主区缺少评分卡锚点')
  assert.match(source, /data-testid="workspace-defense-rounds"/, '答辩主区缺少轮次时间线锚点')
  assert.match(source, /data-testid="workspace-defense-summary"/, '答辩主区缺少总结锚点')
  assert.match(source, /比赛状态驾驶舱/, '答辩主区未切成驾驶舱语义')
  assert.match(source, /比赛时钟/, '答辩主区未接入比赛时钟区块')
  assert.match(source, /答辩席状态/, '答辩主区未接入答辩席状态区块')
  assert.match(source, /评分卡/, '答辩主区缺少评分卡标题')
  assert.match(source, /答辩时间线/, '答辩主区缺少轮次时间线标题')
  assert.match(source, /总结与动作项/, '答辩主区缺少总结与动作区')
  assert.match(source, /contestClockSnapshot/, '答辩主区未计算比赛倒计时与状态快照')
  assert.match(source, /sessionTimelineEntries/, '答辩主区未接入会话时间轴数据')
  assert.match(source, /personaStageItems/, '答辩主区未接入 persona 状态阵列')
  assert.match(source, /emit\('openAgentDef'\)/, '答辩主区缺少打开 AgentDef 动作')
  assert.match(source, /emit\('startRealtime'\)/, '答辩主区缺少发起语音答辩动作')
  assert.match(source, /emit\('generateSummary'\)/, '答辩主区缺少生成总结动作')
  assert.doesNotMatch(source, /WorkspaceTabStrip|WorkspaceMainPanelChrome/, '答辩主区仍残留研发 tabs 语义')
})
