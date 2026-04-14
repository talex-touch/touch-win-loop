import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_MEETING_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMeetingPanel.vue')
const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_MEETING_SIDEBAR_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMeetingSidebarPanel.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const PUBLIC_SHARE_PAGE_FILE = resolve(process.cwd(), 'app/pages/meeting/share/[shareKey].vue')
const WEB_CLIENT_FILE = resolve(process.cwd(), 'app/components/meeting/ProjectMeetingWebClient.vue')
const REALTIME_EVENTS_FILE = resolve(process.cwd(), 'server/utils/realtime-events.ts')
const REALTIME_HUB_FILE = resolve(process.cwd(), 'server/utils/realtime-hub.ts')
const REALTIME_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceRealtime.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MEETING_TYPES_FILE = resolve(process.cwd(), 'shared/types/meeting.ts')
const PROJECT_MEETINGS_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectMeetings.ts')
const WORKSPACE_SHELL_FILE = resolve(process.cwd(), 'app/composables/useWorkspaceProjectShell.ts')
const README_FILE = resolve(process.cwd(), 'README.md')

const API_FILES = [
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/index.get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/index.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId].get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/join.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/start.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/end.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/utterances.get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/guest-share.get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/guest-share.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/guest-share.delete.ts'),
  resolve(process.cwd(), 'server/api/share/meetings/[shareKey].get.ts'),
  resolve(process.cwd(), 'server/api/share/meetings/[shareKey]/join.post.ts'),
  resolve(process.cwd(), 'server/api/internal/meetings/provider-events.post.ts'),
  resolve(process.cwd(), 'server/api/internal/meetings/asr-events.post.ts'),
]

it('会议领域模型、数据库表与实时事件已接入项目工作区', async () => {
  const [meetingTypeSource, schemaSource, realtimeSource, realtimeHubSource, realtimeComposableSource] = await Promise.all([
    readFile(MEETING_TYPES_FILE, 'utf8'),
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(REALTIME_EVENTS_FILE, 'utf8'),
    readFile(REALTIME_HUB_FILE, 'utf8'),
    readFile(REALTIME_COMPOSABLE_FILE, 'utf8'),
  ])

  assert.match(meetingTypeSource, /ProjectMeeting,/, '缺少 ProjectMeeting 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingDetail,/, '缺少 ProjectMeetingDetail 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingInvitee,/, '缺少 ProjectMeetingInvitee 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingUtterance,/, '缺少 ProjectMeetingUtterance 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingGuestShare,/, '缺少 ProjectMeetingGuestShare 领域模型导出')
  assert.match(meetingTypeSource, /SharedProjectMeetingSnapshot,/, '缺少 SharedProjectMeetingSnapshot 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingGuestJoinSession,/, '缺少 ProjectMeetingGuestJoinSession 领域模型导出')
  assert.match(meetingTypeSource, /ProjectMeetingStatus,/, '会议状态导出缺失')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meetings\b/, '缺少 project_meetings 表')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meeting_invitees\b/, '缺少 project_meeting_invitees 表')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meeting_participants\b/, '缺少 project_meeting_participants 表')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meeting_utterances\b/, '缺少 project_meeting_utterances 表')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meeting_jobs\b/, '缺少 project_meeting_jobs 表')
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_meeting_guest_shares\b/, '缺少 project_meeting_guest_shares 表')
  assert.match(realtimeSource, /'meeting\.state\.updated'/, '实时事件缺少 meeting.state.updated')
  assert.match(realtimeSource, /'meeting\.participant\.updated'/, '实时事件缺少 meeting.participant.updated')
  assert.match(realtimeSource, /'meeting\.caption\.partial'/, '实时事件缺少 meeting.caption.partial')
  assert.match(realtimeSource, /'meeting\.caption\.final'/, '实时事件缺少 meeting.caption.final')
  assert.match(realtimeSource, /'meeting\.summary\.ready'/, '实时事件缺少 meeting.summary.ready')
  assert.match(realtimeHubSource, /function sanitizeGuestMeetingPayload\(/, '实时 hub 未对 guest meeting payload 做脱敏')
  assert.match(realtimeComposableSource, /type: 'meeting\.subscribe'/, '前端实时通道未新增 meeting.subscribe')
})

it('项目工作区主面板已拆分会议总览、创建页和详情页三类 tab', async () => {
  const source = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')

  assert.match(source, /title: '项目会议'/, '主面板缺少“项目会议”页签标题')
  assert.match(source, /type WorkspaceMeetingTabId = `meeting:\$\{string\}`/, '主面板缺少会议详情动态 tab 类型')
  assert.match(source, /WorkspaceMeetingCreateTabId,/, '主面板缺少会议创建页 tab 共享类型引用')
  assert.match(source, /tabId\.startsWith\('meeting:'\)/, '主面板未支持会议详情动态 tab')
  assert.match(source, /tabId\.startsWith\('meeting-create:'\)/, '主面板未支持会议创建页 tab')
  assert.match(source, /<WorkspaceMeetingOverviewPanel[\s\S]*@open-meeting="emit\('selectMeeting', \$event\)"/, '主面板未挂载会议总览页')
  assert.match(source, /<WorkspaceMeetingCreatePanel[\s\S]*@quick-create="emit\('quickCreateMeeting', \$event\)"[\s\S]*@submit-create="emit\('submitMeetingCreate', \$event\)"[\s\S]*@open-meeting-overview="ensureFixedTabOpen\('meeting'\)"/, '主面板未挂载会议创建页或未透传创建事件')
  assert.match(source, /<WorkspaceMeetingPanel[\s\S]*:active-meeting="(?:activeMeeting|props\.activeMeeting)"[\s\S]*@start-meeting="emit\('startMeeting', \$event\)"/, '主面板未挂载会议详情页或未透传开始事件')
  assert.match(source, /@open-resource="emit\('openMeetingResource', \$event\)"/, '主面板未透传会议资源打开事件')
})

it('左侧栏已提供会议一级入口、发起按钮和最近会议列表', async () => {
  const [source, meetingSidebarSource] = await Promise.all([
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
    readFile(WORKSPACE_MEETING_SIDEBAR_PANEL_FILE, 'utf8'),
  ])

  assert.match(source, /type WorkspaceLeftModuleId = 'resource_manager' \| 'meeting' \| 'analysis' \| 'project_config' \| 'issue_center'/, '左侧栏未注册 meeting 模块')
  assert.match(source, /title: '项目会议'/, '左侧栏缺少“项目会议”入口')
  assert.match(source, /emit\('openMeetingPanel'\)/, '左侧栏未提供打开会议面板事件')
  assert.match(source, /emit\('createMeeting', \{ mode \}\)/, '左侧栏未透传发起会议事件')
  assert.match(meetingSidebarSource, /发起视频会议/, '左侧栏缺少发起视频会议按钮')
  assert.match(meetingSidebarSource, /发起语音会议/, '左侧栏缺少发起语音会议按钮')
  assert.ok(!meetingSidebarSource.includes('打开面板'), '左侧栏仍残留单独的“打开面板”按钮文案')
  assert.match(meetingSidebarSource, /最近会议/, '左侧栏缺少最近会议列表区')
})

it('项目页已接入会议创建页、详情页、start\/join 链路与 tab 恢复逻辑', async () => {
  const [source, meetingComposableSource, shellSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(PROJECT_MEETINGS_COMPOSABLE_FILE, 'utf8'),
    readFile(WORKSPACE_SHELL_FILE, 'utf8'),
  ])

  assert.match(source, /useWorkspaceProjectMeetings\(/, '项目页未接入会议状态 composable')
  assert.match(source, /projectMeetings,[\s\S]*activeMeetingDetail,[\s\S]*meetingLiveCaptions,[\s\S]*loadProjectMeetings,/, '项目页未从 composable 解构会议核心状态')
  assert.match(meetingComposableSource, /const projectMeetings = ref<ProjectMeeting\[\]>\(\[\]\)/, '会议 composable 缺少会议列表状态')
  assert.match(meetingComposableSource, /const activeMeetingDetail = ref<ProjectMeetingDetail \| null>\(null\)/, '会议 composable 缺少当前会议详情状态')
  assert.match(meetingComposableSource, /const meetingLiveCaptions = ref<WorkspaceMeetingCaptionItem\[\]>\(\[\]\)/, '会议 composable 缺少实时字幕状态')
  assert.match(meetingComposableSource, /async function loadProjectMeetings\([\s\S]*fallbackToFirst\?: boolean[\s\S]*\): Promise<void> \{/, '会议 composable 缺少会议列表加载函数')
  assert.match(shellSource, /function createMeetingCreateTabId\(mode: ProjectMeetingMode\): WorkspaceMeetingCreateLocalTabId \{/, '工作区壳缺少会议创建页 tab id 构造函数')
  assert.match(shellSource, /function ensureMeetingCreateTabOpen\(mode: ProjectMeetingMode, payload: \{ activate\?: boolean \} = \{\}\): WorkspaceMeetingCreateLocalTabId \{/, '工作区壳缺少会议创建页打开函数')
  assert.match(meetingComposableSource, /async function createProjectMeeting\(payload: \{ mode: ProjectMeetingMode \}\): Promise<void> \{/, '会议 composable 缺少创建会议函数')
  assert.match(meetingComposableSource, /async function submitProjectMeetingCreate\(payload: ProjectMeetingCreatePayload\): Promise<void> \{/, '会议 composable 缺少会议创建提交函数')
  assert.match(meetingComposableSource, /async function joinProjectMeeting\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少加入会议函数')
  assert.match(meetingComposableSource, /async function startProjectMeeting\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少启动会议函数')
  assert.match(meetingComposableSource, /async function endProjectMeeting\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少结束会议函数')
  assert.match(meetingComposableSource, /async function createProjectMeetingGuestShare\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少生成 guest share 函数')
  assert.match(meetingComposableSource, /async function regenerateProjectMeetingGuestShare\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少重建 guest share 函数')
  assert.match(meetingComposableSource, /async function revokeProjectMeetingGuestShare\(meetingId: string\): Promise<void> \{/, '会议 composable 缺少撤销 guest share 函数')
  assert.match(meetingComposableSource, /endpoint\(`\/projects\/\$\{projectId\}\/meetings\/\$\{targetMeetingId\}\/join`\)/, '会议 composable 未调用 join API')
  assert.match(meetingComposableSource, /endpoint\(`\/projects\/\$\{projectId\}\/meetings\/\$\{targetMeetingId\}\/start`\)/, '会议 composable 未调用 start API')
  assert.match(source, /messageType === 'meeting\.caption\.partial'/, '项目页未处理实时 partial 字幕事件')
  assert.match(source, /messageType === 'meeting\.caption\.final'/, '项目页未处理实时 final 字幕事件')
  assert.match(source, /messageType === 'meeting\.summary\.ready'/, '项目页未处理会议纪要完成事件')
  assert.match(shellSource, /function createMeetingTabId\(meetingId: string\): WorkspaceMeetingTabId \{/, '工作区壳缺少会议详情 tab id 构造函数')
  assert.match(shellSource, /function ensureWorkspaceMainTabOpen\(tabId: WorkspaceMainTabId, payload: \{ activate\?: boolean \} = \{\}\): void \{[\s\S]*options\.activeMainTabId\.value = normalizedTabId/, '工作区壳未提供通用 tab 打开能力')
  assert.match(meetingComposableSource, /async function selectProjectMeeting\(meetingId: string\): Promise<void> \{[\s\S]*options\.ensureMeetingDetailTabOpen\(targetMeetingId\)/, '会议 composable 未在选择会议时打开独立会议 tab')
  assert.match(shellSource, /const panel = normalizeQueryParam\(route\.query\.panel\)\.toLowerCase\(\)/, '工作区壳未读取 panel query')
  assert.match(shellSource, /panel === 'members' \|\| panel === 'settings' \|\| panel === 'meeting'/, '工作区壳未支持 meeting panel query')
  assert.match(source, /:meetings="projectMeetings"/, '项目页未向左侧栏透传会议列表')
  assert.match(source, /@open-meeting-panel="openMeetingFromLeftSidebar"/, '项目页未接收左侧栏打开会议事件')
  assert.match(source, /@create-meeting="createProjectMeeting"/, '项目页未接收左侧栏发起会议事件')
  assert.match(source, /@select-meeting="selectProjectMeeting"/, '项目页未接收左侧栏会议选择事件')
  assert.match(source, /:meetings="projectMeetings"/, '项目页未向主面板透传会议列表')
  assert.match(source, /:meeting-plan-tier="currentWorkspaceMeetingPlanTier"/, '项目页未向主面板透传会议套餐层级')
  assert.match(source, /@quick-create-meeting="submitProjectMeetingCreate"/, '项目页未接收快速创建会议事件')
  assert.match(source, /@submit-meeting-create="submitProjectMeetingCreate"/, '项目页未接收创建页提交事件')
  assert.match(source, /@start-meeting="startProjectMeeting"/, '项目页未接收启动会议事件')
  assert.match(source, /@create-meeting-guest-share="createProjectMeetingGuestShare"/, '项目页未接收生成 guest share 事件')
  assert.match(source, /@regenerate-meeting-guest-share="regenerateProjectMeetingGuestShare"/, '项目页未接收重建 guest share 事件')
  assert.match(source, /@revoke-meeting-guest-share="revokeProjectMeetingGuestShare"/, '项目页未接收撤销 guest share 事件')
  assert.match(source, /@open-meeting-resource="openProjectResourcePreview"/, '项目页未把会议资源打开事件接到现有资源预览链路')
})

it('会议详情页、公开分享页与 Web 客户端已接入 guest share 能力', async () => {
  const [meetingPanelSource, publicShareSource, webClientSource] = await Promise.all([
    readFile(WORKSPACE_MEETING_PANEL_FILE, 'utf8'),
    readFile(PUBLIC_SHARE_PAGE_FILE, 'utf8'),
    readFile(WEB_CLIENT_FILE, 'utf8'),
  ])

  assert.match(meetingPanelSource, /import ProjectMeetingWebClient from '~\/components\/meeting\/ProjectMeetingWebClient\.vue'/, '会议详情页未接入站内 Web 客户端')
  assert.match(meetingPanelSource, /guestShare\?: ProjectMeetingGuestShare \| null/, '会议详情页缺少 guest share props')
  assert.match(meetingPanelSource, /emit\('createGuestShare', props\.activeMeeting\.id\)/, '会议详情页未透传生成 guest share 事件')
  assert.match(meetingPanelSource, /复制外部参会链接/, '会议详情页缺少复制外部参会链接能力')
  assert.match(meetingPanelSource, /严格脱敏/, '会议详情页缺少外部分享安全提示')

  assert.match(publicShareSource, /definePageMeta\(\{\s*layout: false,\s*\}\)/, '公开分享页未关闭工作区壳')
  assert.match(publicShareSource, /endpoint\(`\/share\/meetings\/\$\{shareKey\}`\)/, '公开分享页未读取分享快照')
  assert.match(publicShareSource, /endpoint\(`\/share\/meetings\/\$\{shareKey\}\/join`\)/, '公开分享页未调用 guest join API')
  assert.match(publicShareSource, /useWorkspaceRealtime\(\{\s*guestToken: session\.meetingGuestToken,\s*forceIsolated: true,\s*\}\)/, '公开分享页未使用 guest token 建立隔离实时连接')
  assert.match(publicShareSource, /<ProjectMeetingWebClient/, '公开分享页未复用站内 Web 客户端')

  assert.match(webClientSource, /await import\('livekit-client'\)/, 'Web 客户端未接入 livekit-client')
  assert.match(webClientSource, /setMicrophoneEnabled/, 'Web 客户端未支持麦克风开关')
  assert.match(webClientSource, /setCameraEnabled/, 'Web 客户端未支持摄像头开关')
  assert.match(webClientSource, /实时字幕/, 'Web 客户端未展示字幕面板')
})

it('会议 API 路由与 README 配置说明已落地', async () => {
  await Promise.all(API_FILES.map(file => access(file)))

  const readmeSource = await readFile(README_FILE, 'utf8')
  assert.match(readmeSource, /## 会议能力配置/, 'README 缺少会议能力配置章节')
  assert.match(readmeSource, /后台维护/, 'README 未说明会议配置改为后台维护')
  assert.match(readmeSource, /不再默认回退 `mock`/, 'README 未说明会议配置不再回退 mock')
  assert.match(readmeSource, /WINLOOP_CONFIG_MASTER_KEY/, 'README 未说明会议密钥根密钥要求')
  assert.match(readmeSource, /admin\/meeting-providers/, 'README 未说明后台会议配置入口')
})
