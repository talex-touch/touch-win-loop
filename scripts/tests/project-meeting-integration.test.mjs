import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const REALTIME_EVENTS_FILE = resolve(process.cwd(), 'server/utils/realtime-events.ts')
const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain.ts')
const README_FILE = resolve(process.cwd(), 'README.md')

const API_FILES = [
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/index.get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/index.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId].get.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/join.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/start.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/end.post.ts'),
  resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/utterances.get.ts'),
  resolve(process.cwd(), 'server/api/internal/meetings/provider-events.post.ts'),
  resolve(process.cwd(), 'server/api/internal/meetings/asr-events.post.ts'),
]

it('会议领域模型、数据库表与实时事件已接入项目工作区', async () => {
  const [domainSource, dbSource, realtimeSource] = await Promise.all([
    readFile(DOMAIN_FILE, 'utf8'),
    readFile(DB_FILE, 'utf8'),
    readFile(REALTIME_EVENTS_FILE, 'utf8'),
  ])

  assert.match(domainSource, /export interface ProjectMeeting \{/, '缺少 ProjectMeeting 领域模型')
  assert.match(domainSource, /export interface ProjectMeetingDetail extends ProjectMeeting \{/, '缺少 ProjectMeetingDetail 领域模型')
  assert.match(domainSource, /export interface ProjectMeetingInvitee \{/, '缺少 ProjectMeetingInvitee 领域模型')
  assert.match(domainSource, /export interface ProjectMeetingUtterance \{/, '缺少 ProjectMeetingUtterance 领域模型')
  assert.match(domainSource, /export type WorkspaceMeetingTabId = `meeting:\$\{string\}`/, '缺少会议详情动态 tab 共享类型')
  assert.match(domainSource, /export type WorkspaceMeetingCreateTabId = 'meeting-create:audio' \| 'meeting-create:video'/, '缺少会议创建页 tab 共享类型')
  assert.match(domainSource, /export type ProjectMeetingStatus = 'scheduled' \| 'active' \| 'ended' \| 'failed'/, '会议状态未扩展 scheduled')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS project_meetings\b/, '缺少 project_meetings 表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS project_meeting_invitees\b/, '缺少 project_meeting_invitees 表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS project_meeting_participants\b/, '缺少 project_meeting_participants 表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS project_meeting_utterances\b/, '缺少 project_meeting_utterances 表')
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS project_meeting_jobs\b/, '缺少 project_meeting_jobs 表')
  assert.match(realtimeSource, /'meeting\.state\.updated'/, '实时事件缺少 meeting.state.updated')
  assert.match(realtimeSource, /'meeting\.participant\.updated'/, '实时事件缺少 meeting.participant.updated')
  assert.match(realtimeSource, /'meeting\.caption\.partial'/, '实时事件缺少 meeting.caption.partial')
  assert.match(realtimeSource, /'meeting\.caption\.final'/, '实时事件缺少 meeting.caption.final')
  assert.match(realtimeSource, /'meeting\.summary\.ready'/, '实时事件缺少 meeting.summary.ready')
})

it('项目工作区主面板已拆分会议总览、创建页和详情页三类 tab', async () => {
  const source = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')

  assert.match(source, /type WorkspaceFixedTabId = SharedWorkspaceFixedTabId/, '主面板未复用共享的 meeting 固定页签类型')
  assert.match(source, /title: '项目会议'/, '主面板缺少“项目会议”页签标题')
  assert.match(source, /tabId\.startsWith\('meeting:'\)/, '主面板未支持会议详情动态 tab')
  assert.match(source, /tabId\.startsWith\('meeting-create:'\)/, '主面板未支持会议创建页 tab')
  assert.match(source, /<WorkspaceMeetingOverviewPanel[\s\S]*@open-meeting="emit\('selectMeeting', \$event\)"/, '主面板未挂载会议总览页')
  assert.match(source, /<WorkspaceMeetingCreatePanel[\s\S]*@quick-create="emit\('quickCreateMeeting', \$event\)"[\s\S]*@submit-create="emit\('submitMeetingCreate', \$event\)"[\s\S]*@open-meeting-overview="ensureFixedTabOpen\('meeting'\)"/, '主面板未挂载会议创建页或未透传创建事件')
  assert.match(source, /<WorkspaceMeetingPanel[\s\S]*:active-meeting="activeMeeting"[\s\S]*@start-meeting="emit\('startMeeting', \$event\)"/, '主面板未挂载会议详情页或未透传开始事件')
  assert.match(source, /@open-resource="emit\('openMeetingResource', \$event\)"/, '主面板未透传会议资源打开事件')
})

it('左侧栏已提供会议一级入口、发起按钮和最近会议列表', async () => {
  const source = await readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8')

  assert.match(source, /type WorkspaceLeftModuleId = 'resource_manager' \| 'meeting' \| 'analysis' \| 'project_config' \| 'issue_center'/, '左侧栏未注册 meeting 模块')
  assert.match(source, /title: '项目会议'/, '左侧栏缺少“项目会议”入口')
  assert.match(source, /emit\('openMeetingPanel'\)/, '左侧栏未提供打开会议面板事件')
  assert.match(source, /emit\('createMeeting', \{ mode \}\)/, '左侧栏未透传发起会议事件')
  assert.match(source, /发起视频会议/, '左侧栏缺少发起视频会议按钮')
  assert.match(source, /发起语音会议/, '左侧栏缺少发起语音会议按钮')
  assert.ok(!source.includes('打开面板'), '左侧栏仍残留单独的“打开面板”按钮文案')
  assert.match(source, /最近会议/, '左侧栏缺少最近会议列表区')
})

it('项目页已接入会议创建页、详情页、start\/join 链路与 tab 恢复逻辑', async () => {
  const source = await readFile(WORKSPACE_DETAIL_FILE, 'utf8')

  assert.match(source, /const projectMeetings = ref<ProjectMeeting\[\]>\(\[\]\)/, '项目页缺少会议列表状态')
  assert.match(source, /const activeMeetingDetail = ref<ProjectMeetingDetail \| null>\(null\)/, '项目页缺少当前会议详情状态')
  assert.match(source, /const meetingLiveCaptions = ref<WorkspaceMeetingCaptionItem\[\]>\(\[\]\)/, '项目页缺少实时字幕状态')
  assert.match(source, /async function loadProjectMeetings\([\s\S]*fallbackToFirst\?: boolean[\s\S]*\): Promise<void> \{/, '项目页缺少会议列表加载函数')
  assert.match(source, /function createMeetingCreateTabId\(mode: ProjectMeetingMode\): WorkspaceMeetingCreateLocalTabId \{/, '项目页缺少会议创建页 tab id 构造函数')
  assert.match(source, /function ensureMeetingCreateTabOpen\(mode: ProjectMeetingMode, options: \{ activate\?: boolean \} = \{\}\): WorkspaceMeetingCreateLocalTabId \{/, '项目页缺少会议创建页打开函数')
  assert.match(source, /async function createProjectMeeting\(payload: \{ mode: ProjectMeetingMode \}\): Promise<void> \{/, '项目页缺少创建会议函数')
  assert.match(source, /async function submitProjectMeetingCreate\(payload: ProjectMeetingCreatePayload\): Promise<void> \{/, '项目页缺少会议创建提交函数')
  assert.match(source, /async function joinProjectMeeting\(meetingId: string\): Promise<void> \{/, '项目页缺少加入会议函数')
  assert.match(source, /async function startProjectMeeting\(meetingId: string\): Promise<void> \{/, '项目页缺少启动会议函数')
  assert.match(source, /async function endProjectMeeting\(meetingId: string\): Promise<void> \{/, '项目页缺少结束会议函数')
  assert.match(source, /endpoint\(`\/projects\/\$\{projectId\}\/meetings\/\$\{targetMeetingId\}\/join`\)/, '项目页未调用 join API')
  assert.match(source, /endpoint\(`\/projects\/\$\{projectId\}\/meetings\/\$\{targetMeetingId\}\/start`\)/, '项目页未调用 start API')
  assert.match(source, /messageType === 'meeting\.caption\.partial'/, '项目页未处理实时 partial 字幕事件')
  assert.match(source, /messageType === 'meeting\.caption\.final'/, '项目页未处理实时 final 字幕事件')
  assert.match(source, /messageType === 'meeting\.summary\.ready'/, '项目页未处理会议纪要完成事件')
  assert.match(source, /function createMeetingTabId\(meetingId: string\): WorkspaceMeetingTabId \{/, '项目页缺少会议详情 tab id 构造函数')
  assert.match(source, /activeMainTabId\.value = normalizedTabId/, '项目页未提供通用 tab 打开能力')
  assert.match(source, /ensureMeetingDetailTabOpen\(targetMeetingId\)/, '项目页未在选择会议时打开独立会议 tab')
  assert.match(source, /const panel = normalizeQueryParam\(route\.query\.panel\)\.toLowerCase\(\)/, '项目页未读取 panel query')
  assert.match(source, /panel === 'members' \|\| panel === 'settings' \|\| panel === 'meeting'/, '项目页未支持 meeting panel query')
  assert.match(source, /:meetings="projectMeetings"/, '项目页未向左侧栏透传会议列表')
  assert.match(source, /@open-meeting-panel="openMeetingFromLeftSidebar"/, '项目页未接收左侧栏打开会议事件')
  assert.match(source, /@create-meeting="createProjectMeeting"/, '项目页未接收左侧栏发起会议事件')
  assert.match(source, /@select-meeting="selectProjectMeeting"/, '项目页未接收左侧栏会议选择事件')
  assert.match(source, /:meetings="projectMeetings"/, '项目页未向主面板透传会议列表')
  assert.match(source, /:meeting-plan-tier="currentWorkspaceMeetingPlanTier"/, '项目页未向主面板透传会议套餐层级')
  assert.match(source, /@quick-create-meeting="submitProjectMeetingCreate"/, '项目页未接收快速创建会议事件')
  assert.match(source, /@submit-meeting-create="submitProjectMeetingCreate"/, '项目页未接收创建页提交事件')
  assert.match(source, /@start-meeting="startProjectMeeting"/, '项目页未接收启动会议事件')
  assert.match(source, /@open-meeting-resource="openProjectResourcePreview"/, '项目页未把会议资源打开事件接到现有资源预览链路')
})

it('会议 API 路由与 README 环境变量说明已落地', async () => {
  await Promise.all(API_FILES.map(file => access(file)))

  const readmeSource = await readFile(README_FILE, 'utf8')
  assert.match(readmeSource, /## 会议能力环境变量/, 'README 缺少会议能力环境变量章节')
  assert.match(readmeSource, /WINLOOP_MEETING_RTC_PROVIDER=mock/, 'README 缺少 RTC provider 环境变量示例')
  assert.match(readmeSource, /WINLOOP_MEETING_ASR_PROVIDER=mock/, 'README 缺少 ASR provider 环境变量示例')
  assert.match(readmeSource, /WINLOOP_MEETING_WORKER_ENABLED=true/, 'README 缺少会议 worker 环境变量示例')
})
