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
const DEFENSE_REALTIME_SESSIONS_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/realtime-sessions/index.post.ts')
const PROJECT_MEETING_SERVICE_FILE = resolve(process.cwd(), 'server/services/meeting/project-meeting.ts')

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
  assert.match(workspaceSource, /<WorkspaceDefenseSidebar[\s\S]*:session-meta="defenseSessionMetaSnapshot"[\s\S]*:session-state="defenseSessionStateSnapshot"[\s\S]*@import-personas="importDefensePersonas"[\s\S]*@save-persona="saveDefensePersona"[\s\S]*@delete-persona="deleteDefensePersona"/, '答辩左栏未复用统一答辩会话状态或人设编辑动作')
  assert.match(workspaceSource, /<WorkspaceDefenseWorkbench[\s\S]*:contest="selectedContest"[\s\S]*:contest-timelines="defenseContestTimelines"[\s\S]*:session-meta="defenseSessionMetaSnapshot"[\s\S]*:session-state="defenseSessionStateSnapshot"[\s\S]*:personas="defensePersonas"[\s\S]*:turns="defenseTurns"/, '答辩主区未接入比赛 timeline、persona 和 turn 历史')
  assert.doesNotMatch(workspaceSource, /<WorkspaceDefenseWorkbench[\s\S]*:summary="defenseSummary"/, '会话总结不应再透传到答辩主区')
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

it('答辩左栏承载评委席、人设编辑与评分卡，保持线性 aside 结构', async () => {
  const source = await readFile(DEFENSE_SIDEBAR_FILE, 'utf8')

  assert.match(source, /data-testid="workspace-defense-sidebar"/, '答辩左栏缺少测试锚点')
  assert.match(source, /data-testid="workspace-defense-persona-list"/, '答辩左栏缺少评委列表锚点')
  assert.match(source, /data-testid="workspace-defense-scorecard"/, '答辩左栏缺少评分卡锚点')
  assert.match(source, /当前答辩席/, '答辩左栏缺少当前答辩席标题')
  assert.match(source, /评分卡/, '答辩左栏缺少评分卡标题')
  assert.match(source, /scorecard\?: AiDefenseScorecard \| null/, '答辩左栏未接收最新评分卡')
  assert.match(source, /defineEmits<\{[\s\S]*importPersonas: \[\][\s\S]*savePersona:[\s\S]*deletePersona:/, '答辩左栏未承载人设导入、新增、编辑或删除动作')
  assert.match(source, /openCreatePersonaForm|openEditPersonaForm|quickTogglePersona|submitPersonaForm/, '答辩左栏缺少人设编辑表单逻辑')
  assert.match(source, /workspace-defense-sidebar__persona-popover[\s\S]*role="tooltip"/, '答辩席位缺少 hover\/focus persona popover')
  assert.match(source, /persona\.scoringRubric\.map\(item => item\.name\)\.join\('、'\)/, 'persona popover 未展示评分维度明细')
  assert.match(source, />\s*导入\s*<\/button>[\s\S]*>\s*新增\s*<\/button>/, '答辩席标题右侧未改为导入和新增动作')
  assert.match(source, /resolvePersonaBadge/, '答辩左栏未根据当前轮次或启用态生成评委状态标识')
  assert.match(source, /当前项目还没有答辩评委人设。可在这里导入比赛预设或新增评委。/, '答辩左栏空态文案未切到本栏编辑语义')
  assert.match(source, /\.workspace-defense-sidebar \{[\s\S]*padding: 0;|\.workspace-defense-sidebar \{[\s\S]*background: #f8fafc;/, '答辩左栏应保持 aside 级简约背景')
  assert.match(source, /\.workspace-defense-sidebar__scorecard \{[\s\S]*border-top: 1px solid #e5edf7;/, '评分卡应放在答辩席下方并用线条分隔')
  assert.doesNotMatch(source, /\.workspace-defense-sidebar__personas \{[\s\S]*border: 1px[\s\S]*border-radius: 12px[\s\S]*background: #ffffff;/, '答辩左栏不应再把评委区做成卡片')
  const personaRule = source.match(/\.workspace-defense-sidebar__persona \{[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(personaRule, /border-radius:|border: 1px/, '答辩席条目不应再使用卡片边框')
  assert.doesNotMatch(source, /data-testid="workspace-defense-sidebar-overview"|AgentDef 评委席|模拟答辩/, '答辩左栏不应再保留概述状态卡')
})

it('答辩主区切成无 tabs 的比赛状态驾驶舱，并提供主动作入口', async () => {
  const source = await readFile(DEFENSE_WORKBENCH_FILE, 'utf8')

  assert.match(source, /data-testid="workspace-defense-workbench"/, '答辩主区缺少测试锚点')
  assert.match(source, /data-testid="workspace-defense-actions"/, '答辩主区缺少动作区锚点')
  assert.match(source, /class="workspace-defense-workbench__actions workspace-defense-workbench__actions--floating"/, '答辩主动作未移动到底部悬浮控制器')
  assert.match(source, /data-testid="workspace-defense-agentdef-status"/, '答辩主区缺少 AgentDef 状态区')
  assert.match(source, /data-testid="workspace-defense-rounds"/, '答辩主区缺少轮次时间线锚点')
  assert.match(source, /\.workspace-defense-workbench \{[\s\S]*position: relative;[\s\S]*display: flex;[\s\S]*flex-direction: column;[\s\S]*min-height: 100%;/, '答辩主区应形成可承载居中预览并把控制器推到底部的纵向布局')
  assert.match(source, /\.workspace-defense-workbench__content-grid \{[\s\S]*flex: 1 1 auto;[\s\S]*grid-template-areas:[\s\S]*'flow timeline'/, '答辩主内容未保持无 tabs 的主栏网格语义')
  assert.match(source, /const agentDefStatus = computed\(\(\) => \{/, '答辩主区缺少 AgentDef 状态计算')
  assert.match(source, /workspace-defense-workbench__floating-controller/, '答辩主区缺少底部悬浮控制器样式')
  assert.match(source, /position: sticky;[\s\S]*bottom: 10px/, '答辩实时控制器未悬浮到底部')
  assert.match(source, /\.workspace-defense-workbench__floating-controller \{[\s\S]*margin: auto auto 0;/, '答辩实时控制器没有被推到主栏底部')
  assert.match(source, /\.workspace-defense-workbench__floating-controller \{[\s\S]*display: flex;[\s\S]*flex-wrap: nowrap;[\s\S]*align-items: center;/, '底部悬浮控制器未做成桌面横向一排')
  assert.match(source, /realtimeSettingsOpen = ref\(false\)/, '答辩底部控制器缺少设置弹窗状态')
  assert.match(source, /id="workspace-defense-realtime-settings-popover"[\s\S]*role="dialog"/, '实时链路、媒体与预览状态未收进设置弹窗')
  assert.match(source, /\.workspace-defense-workbench__settings-popover \{[\s\S]*position: absolute;[\s\S]*bottom: calc\(100% \+ 10px\);/, '设置弹窗未从底部控制器上方展开')
  assert.match(source, /实时答辩设置[\s\S]*实时链路[\s\S]*媒体模式[\s\S]*麦克风[\s\S]*摄像头/, '设置弹窗缺少链路、媒体或设备状态')
  assert.match(source, /v-show="realtimeState\?\.videoEnabled === true"[\s\S]*class="workspace-defense-workbench__corner-preview"[\s\S]*id="workspace-defense-realtime-preview"[\s\S]*workspace-defense-workbench__corner-audio-meter/, '摄像头开启后缺少右下角本地预览或竖向收音条')
  assert.match(source, /\.workspace-defense-workbench__corner-preview \{[\s\S]*position: sticky;[\s\S]*bottom: 78px;[\s\S]*left: 50%;[\s\S]*align-self: center;[\s\S]*transform: translateX\(-50%\);/, '本地视频预览未 sticky 到答辩主栏中间')
  assert.match(source, /\.workspace-defense-workbench__corner-audio-meter span \{[\s\S]*bottom: 0;[\s\S]*height: var\(--workspace-defense-audio-level, 0%\);/, '竖向收音条未按实时音量从底部增长')
  assert.match(source, /\.workspace-defense-workbench__actions \{[\s\S]*flex-wrap: nowrap;/, '底部主动作按钮未保持横向排列')
  assert.match(source, /emit\('interruptRealtime'\)/, '底部控制器缺少中断动作')
  assert.match(source, /emit\('reconnectRealtime'\)/, '底部控制器缺少重连动作')
  assert.match(source, /\.workspace-defense-workbench__realtime-live \{[\s\S]*display: flex;/, '实时预览与设备状态未保持横向排列')
  assert.match(source, /workspace-defense-workbench__toggle-icon[\s\S]*mic[\s\S]*mic_off/, '麦克风开关未做成纯图标切换')
  assert.match(source, /workspace-defense-workbench__toggle-icon[\s\S]*videocam[\s\S]*videocam_off/, '摄像头开关未做成纯图标切换')
  assert.match(source, /:aria-label="realtimeState\?\.audioEnabled !== false \? '关闭麦克风' : '开启麦克风'"/, '麦克风图标按钮缺少可访问标签')
  assert.match(source, /:aria-label="realtimeState\?\.videoEnabled === true \? '关闭摄像头' : '开启摄像头'"/, '摄像头图标按钮缺少可访问标签')
  assert.doesNotMatch(source, /麦克风 \{\{ realtimeState\?\.audioEnabled !== false \? '开' : '关' \}\}/, '麦克风开关仍保留可见文字状态')
  assert.doesNotMatch(source, /摄像头 \{\{ realtimeState\?\.videoEnabled === true \? '开' : '关' \}\}/, '摄像头开关仍保留可见文字状态')
  assert.doesNotMatch(source, /workspace-defense-workbench__floating-header/, '底部悬浮控制器不应再保留独立标题行')
  assert.doesNotMatch(source, /grid-column: 2;[\s\S]*grid-row: 1 \/ span 3;/, '实时预览仍残留旧侧栏网格定位')
  assert.doesNotMatch(source, /grid-template-areas:[\s\S]*'actions(?: actions)?'/, '答辩主动作仍占用顶部网格区域')
  assert.doesNotMatch(source, /data-testid="workspace-defense-status-panel"/, '答辩主区不应再展示比赛状态面板')
  assert.doesNotMatch(source, /workspace-defense-workbench__clock-panel|workspace-defense-workbench__signal-strip|workspace-defense-workbench__schedule-list/, '答辩主区仍残留比赛赛程状态模块')
  assert.doesNotMatch(source, /contestClockSnapshot|contestTimelineEntries/, '答辩主区仍残留比赛赛程状态计算')
  assert.doesNotMatch(source, /data-testid="workspace-defense-mock-status"|data-testid="workspace-defense-persona-stage"|mockDefenseStatus|stageSummaryItems|personaStageItems/, '答辩主区仍残留不需要的 mock 或阶段摘要模块')
  assert.doesNotMatch(source, /Provider 诊断[\s\S]*状态与日志/, 'Provider 诊断不应再占用主栏卡片')
  assert.doesNotMatch(source, /data-testid="workspace-defense-scorecard"|workspace-defense-workbench__score-panel|workspace-defense-workbench__score-grid|scorecard\?: AiDefenseScorecard \| null|'score timeline'/, '评分卡不应再占用答辩主区')
  assert.doesNotMatch(source, /data-testid="workspace-defense-summary"|summary\?: AiDefenseSummary \| null|总结与动作项|summary summary/, '会话总结应嵌入右侧 AI，不应再占用答辩主区')
  assert.match(source, /答辩时间线/, '答辩主区缺少轮次时间线标题')
  assert.match(source, /sessionTimelineEntries/, '答辩主区未接入会话时间轴数据')
  assert.match(source, /emit\('openAgentDef'\)/, '答辩主区缺少打开 AgentDef 动作')
  assert.doesNotMatch(source, />\s*打开 AgentDef\s*<\/button>/, '底部控制器不应再显示打开 AgentDef 主按钮')
  assert.doesNotMatch(source, /qwenRuntimeSummary|cozeRuntimeSummary|workspace-defense-workbench__hint|百炼实时语音未绑定到 defense 渠道/, '底部控制器不应再显示 provider 配置提示文案')
  assert.match(source, /emit\('startRealtime'\)/, '答辩主区缺少发起语音答辩动作')
  assert.match(source, /emit\('generateSummary'\)/, '答辩主区缺少生成总结动作')
  assert.doesNotMatch(source, /WorkspaceTabStrip|WorkspaceMainPanelChrome/, '答辩主区仍残留研发 tabs 语义')
})

it('实时答辩会议标记为答辩工作台专属，并复用会议接入能力', async () => {
  const [workspaceSource, realtimeApiSource, meetingServiceSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(DEFENSE_REALTIME_SESSIONS_FILE, 'utf8'),
    readFile(PROJECT_MEETING_SERVICE_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /title: `答辩工作台专属 · \$\{mediaMode === 'audio' \? '语音' : '音视频'\}会话`/, '前端发起实时答辩未显式使用答辩工作台专属会议标题')
  assert.match(workspaceSource, /source: 'defense_workbench'/, '前端发起实时答辩未声明 defense workbench 来源')
  assert.match(realtimeApiSource, /const source = normalizeString\(body\?\.source\) \|\| 'defense_workbench'/, '实时答辩接口未规范化答辩工作台来源')
  assert.match(realtimeApiSource, /const sessionTitle = normalizeString\(body\?\.title\) \|\| `答辩工作台专属 · \$\{meetingMode === 'audio' \? '语音' : '音视频'\}会话`/, '实时答辩接口未使用答辩工作台专属默认标题')
  assert.match(realtimeApiSource, /createProjectMeetingSession\(db, \{[\s\S]*providerMetadata: \{[\s\S]*scope: 'defense_workbench'[\s\S]*visibleInMeetingHub: false[\s\S]*答辩工作台专属会议，仅复用会议的 RTC、转写与录制能力。/, '实时答辩会议未用 metadata 标记为工作台专属或未说明复用会议能力')
  assert.match(meetingServiceSource, /providerMetadata\?: Record<string, unknown>/, '会议服务未允许调用方传入 providerMetadata')
  assert.match(meetingServiceSource, /providerMetadata: normalizeRecord\(input\.providerMetadata\)/, '会议服务未将答辩工作台 metadata 写入会议记录')
})
