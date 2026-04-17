import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const AI_TYPES_FILE = resolve(process.cwd(), 'shared/types/ai.ts')
const ENV_FILE = resolve(process.cwd(), 'server/utils/env.ts')
const DEFENSE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-defense-store.ts')
const DEFENSE_REALTIME_UTIL_FILE = resolve(process.cwd(), 'server/utils/defense-realtime.ts')
const CREATE_REALTIME_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/realtime-sessions/index.post.ts')
const BOOTSTRAP_REALTIME_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/realtime-sessions/[sessionId]/bootstrap.post.ts')
const EVENTS_REALTIME_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/realtime-sessions/[sessionId]/events.post.ts')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const DEFENSE_WORKBENCH_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceDefenseWorkbench.vue')
const RIGHT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceRightSidebar.vue')
const MEETING_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMeetingPanel.vue')
const MEETING_WEB_CLIENT_FILE = resolve(process.cwd(), 'app/components/meeting/ProjectMeetingWebClient.vue')
const MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const BRIDGE_FILE = resolve(process.cwd(), 'app/utils/defense-realtime-bridge.ts')
const MEDIA_CONTROLLER_FILE = resolve(process.cwd(), 'app/utils/defense-realtime-media-controller.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-04-17-defense-realtime-session-meta.sql')
const WORKSPACE_CONFIG_FILE = resolve(process.cwd(), 'pnpm-workspace.yaml')
const PACKAGE_FILE = resolve(process.cwd(), 'package.json')
const QWEN_RELAY_FILE = resolve(process.cwd(), 'server/api/projects/[id]/defense/realtime-sessions/[sessionId]/qwen-relay.get.ts')

it('答辩 realtime 领域类型、环境配置与 defense session state 扩展已落地', async () => {
  const [domainSource, aiSource, envSource, storeSource, schemaSource, migrationSource, workspaceConfigSource, packageSource] = await Promise.all([
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
    readFile(AI_TYPES_FILE, 'utf8'),
    readFile(ENV_FILE, 'utf8'),
    readFile(DEFENSE_STORE_FILE, 'utf8'),
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(MIGRATION_FILE, 'utf8'),
    readFile(WORKSPACE_CONFIG_FILE, 'utf8'),
    readFile(PACKAGE_FILE, 'utf8'),
  ])

  assert.match(domainSource, /export type DefenseRealtimeProvider = 'qwen' \| 'coze'/, '缺少答辩 realtime provider 类型')
  assert.match(domainSource, /export type DefenseRealtimeMediaMode = 'audio' \| 'audio_video'/, '缺少答辩 realtime media mode 类型')
  assert.match(domainSource, /export interface DefenseRealtimeBootstrapPayload \{/, '缺少答辩 realtime bootstrap payload 类型')
  assert.match(domainSource, /export interface DefenseRealtimeNormalizedEvent \{/, '缺少答辩 realtime 标准事件类型')
  assert.match(domainSource, /realtime\?: DefenseRealtimeSessionMeta \| null/, '答辩 session state 未扩展 realtime 元数据')
  assert.match(aiSource, /DefenseRealtimeBootstrapPayload,/, 'AI 类型导出未透传 realtime bootstrap payload')
  assert.match(aiSource, /DefenseRealtimeSessionMeta,/, 'AI 类型导出未透传 realtime session meta')
  assert.match(envSource, /defenseRealtime: \{[\s\S]*qwen: \{[\s\S]*baseWsUrl:[\s\S]*coze: \{[\s\S]*botId:[\s\S]*connectorId:/, '运行时配置缺少独立 defenseRealtime 段或 Coze connectorId')
  assert.match(storeSource, /realtime_meta_json: unknown/, 'defense session store 未增加 realtime_meta_json 映射')
  assert.match(storeSource, /function normalizeRealtimeSessionMeta\(value: unknown\): DefenseRealtimeSessionMeta \| null \{/, 'defense session store 缺少 realtime 元数据归一化')
  assert.match(storeSource, /realtime: normalizeRealtimeSessionMeta\(row\.realtime_meta_json\)/, 'defense session state 未从数据库映射 realtime 元数据')
  assert.match(schemaSource, /ALTER TABLE IF EXISTS project_defense_session_state[\s\S]*ADD COLUMN IF NOT EXISTS realtime_meta_json JSONB NOT NULL DEFAULT '\{\}'::JSONB;/, 'bootstrap schema 未补齐 defense realtime 元数据列')
  assert.match(migrationSource, /ALTER TABLE IF EXISTS project_defense_session_state[\s\S]*realtime_meta_json/, '缺少 defense realtime 元数据迁移脚本')
  assert.match(workspaceConfigSource, /trustPolicyExclude:\s*[\r\n]+\s*-\s*ua-parser-js@0\.7\.41/, 'pnpm workspace 未为 Coze 传递依赖补齐精确 trust 豁免')
  assert.match(packageSource, /"@coze\/realtime-api": "\^1\.3\.2"/, 'package.json 未将 Coze realtime SDK 声明为正式依赖')
})

it('答辩 realtime 后端已拆成创建会话、bootstrap 和 events 三层编排', async () => {
  const [createSource, bootstrapSource, eventsSource, realtimeUtilSource] = await Promise.all([
    readFile(CREATE_REALTIME_FILE, 'utf8'),
    readFile(BOOTSTRAP_REALTIME_FILE, 'utf8'),
    readFile(EVENTS_REALTIME_FILE, 'utf8'),
    readFile(DEFENSE_REALTIME_UTIL_FILE, 'utf8'),
  ])

  assert.match(createSource, /provider\?: DefenseRealtimeProvider/, '创建实时会话接口未接收 provider')
  assert.match(createSource, /mediaMode\?: DefenseRealtimeMediaMode/, '创建实时会话接口未接收 mediaMode')
  assert.match(createSource, /const provider = normalizeDefenseRealtimeProvider\(body\?\.provider\)/, '创建实时会话接口未归一化 provider')
  assert.match(createSource, /const mediaMode = normalizeDefenseRealtimeMediaMode\(body\?\.mediaMode\)/, '创建实时会话接口未归一化 mediaMode')
  assert.match(createSource, /realtime: \{[\s\S]*provider,[\s\S]*mediaMode,[\s\S]*connectionState: 'bootstrapping'/, '创建实时会话时未初始化 realtime session meta')
  assert.match(bootstrapSource, /createQwenTemporaryToken/, 'bootstrap 接口未通过服务端 broker 生成千问临时 token')
  assert.match(bootstrapSource, /qwen-relay/, 'bootstrap 接口未将千问连接地址切到本地 relay')
  assert.match(bootstrapSource, /conversationId = normalizeString\(nextRealtime\.conversationId\) \|\| randomUUID\(\)/, 'bootstrap 接口未为 Coze 维持 conversationId')
  assert.match(bootstrapSource, /connectorId: runtime\.defenseRealtime\.coze\.connectorId/, 'bootstrap 接口未向 Coze 透传 connectorId')
  assert.match(bootstrapSource, /buildDefenseRealtimePersonaPack/, 'bootstrap 接口未编译答辩 persona pack')
  assert.match(bootstrapSource, /return ok\(\{\s*bootstrap: payload\.payload,\s*state: payload\.state,\s*session: payload\.session,\s*\}/, 'bootstrap 接口未返回统一 bootstrap/state/session 结构')
  assert.match(eventsSource, /normalizeEvents\(body: DefenseRealtimeEventsBody\): DefenseRealtimeNormalizedEvent\[\]/, 'events 接口未支持批量标准事件')
  assert.match(eventsSource, /appendProjectMeetingUtterance\(/, 'events 接口未将最终 transcript 写入 meeting utterance')
  assert.match(eventsSource, /createProjectDefenseTurns\(/, 'events 接口未将评委最终发言同步到 defense turn')
  assert.match(eventsSource, /upsertProjectDefenseSessionState\(/, 'events 接口未回写 defense session state')
  assert.match(realtimeUtilSource, /export function mergeDefenseRealtimeSessionMeta\(/, '缺少 defense realtime session meta 合并工具')
  assert.match(realtimeUtilSource, /export function buildDefenseRealtimeEventKey\(/, '缺少 defense realtime 事件去重 key 生成工具')
})

it('项目页、驾驶舱和 AgentDef 右栏已共用同一份答辩 realtime 状态与操作事件', async () => {
  const [workspaceSource, workbenchSource, sidebarSource] = await Promise.all([
    readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
    readFile(DEFENSE_WORKBENCH_FILE, 'utf8'),
    readFile(RIGHT_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /const defenseRealtimeProviderDraft = ref<DefenseRealtimeProvider>\('qwen'\)/, '项目页缺少 defense realtime provider 草稿状态')
  assert.match(workspaceSource, /const defenseRealtimeMediaModeDraft = ref<DefenseRealtimeMediaMode>\('audio_video'\)/, '项目页缺少 defense realtime media mode 草稿状态')
  assert.match(workspaceSource, /const defenseRealtimeBootstrapState = ref<'idle' \| 'bootstrapping' \| 'ready' \| 'error'>\('idle'\)/, '项目页缺少 defense realtime bootstrap 状态')
  assert.match(workspaceSource, /const defenseRealtimeLogs = ref<Array<\{[\s\S]*message: string/, '项目页缺少 defense realtime 日志状态')
  assert.match(workspaceSource, /const DEFENSE_REALTIME_DEFERRED_EVENT_TYPES = new Set<DefenseRealtimeNormalizedEvent\['type'\]>\(/, '项目页缺少 defense realtime 延迟事件队列定义')
  assert.match(workspaceSource, /const defenseRealtimeSessionMetaSnapshot = computed<DefenseRealtimeSessionMeta \| null>\(\(\) => \{/, '项目页缺少统一的 defense realtime 状态快照')
  assert.match(workspaceSource, /async function bootstrapDefenseRealtimeSidecar\(sessionId: string\): Promise<void> \{/, '项目页缺少 defense realtime bootstrap 入口')
  assert.match(workspaceSource, /createDefenseRealtimeMediaController\(/, '项目页未创建共享媒体控制层')
  assert.match(workspaceSource, /body: \{[\s\S]*events: payloads,[\s\S]*\}/, '项目页未将 defense realtime 事件批量回写到 events 接口')
  assert.match(workspaceSource, /createDefenseRealtimeProviderBridge\(bootstrap\.provider, bootstrap\)/, '项目页未通过统一 provider bridge 工厂创建 sidecar')
  assert.match(workspaceSource, /body: \{[\s\S]*provider,[\s\S]*mediaMode,[\s\S]*\}/, '项目页发起实时答辩时未提交 provider + mediaMode')
  assert.match(workspaceSource, /:realtime-state="defenseRealtimeSessionMetaSnapshot"/, '项目页未向答辩驾驶舱透传 realtime 状态')
  assert.match(workspaceSource, /:defense-realtime-state="defenseRealtimeSessionMetaSnapshot"/, '项目页未向 AgentDef 右栏透传 realtime 状态')
  assert.match(workspaceSource, /@update-realtime-provider="updateDefenseRealtimeProvider"/, '项目页未接入驾驶舱 provider 切换事件')
  assert.match(workspaceSource, /@update-defense-realtime-provider="updateDefenseRealtimeProvider"/, '项目页未接入 AgentDef provider 切换事件')
  assert.match(workbenchSource, /data-testid="workspace-defense-realtime-console"/, '答辩驾驶舱缺少实时控制台锚点')
  assert.match(workbenchSource, /Provider \/ 音视频 \/ 诊断/, '答辩驾驶舱未切到实时控制台语义')
  assert.match(workbenchSource, /emit\('updateRealtimeProvider'/, '答辩驾驶舱缺少 provider 切换事件')
  assert.match(workbenchSource, /emit\('toggleRealtimeAudio'/, '答辩驾驶舱缺少音频开关事件')
  assert.match(workbenchSource, /workspace-defense-realtime-preview/, '答辩驾驶舱缺少本地预览容器')
  assert.match(sidebarSource, /Provider 诊断/, 'AgentDef 右栏缺少 provider 诊断区')
  assert.match(sidebarSource, /'updateDefenseRealtimeProvider': \[provider: DefenseRealtimeProvider\]/, 'AgentDef 右栏缺少 provider 切换事件')
  assert.match(sidebarSource, /'toggleDefenseRealtimeVideo': \[enabled: boolean\]/, 'AgentDef 右栏缺少视频开关事件')
  assert.match(sidebarSource, /Provider 日志/, 'AgentDef 右栏缺少 provider 日志区')
})

it('答辩 provider bridge、会议详情 sidecar 容器和透传链路已落地', async () => {
  const [bridgeSource, mediaControllerSource, relaySource, mainPanelSource, meetingPanelSource, webClientSource] = await Promise.all([
    readFile(BRIDGE_FILE, 'utf8'),
    readFile(MEDIA_CONTROLLER_FILE, 'utf8'),
    readFile(QWEN_RELAY_FILE, 'utf8'),
    readFile(MAIN_PANEL_FILE, 'utf8'),
    readFile(MEETING_PANEL_FILE, 'utf8'),
    readFile(MEETING_WEB_CLIENT_FILE, 'utf8'),
  ])

  assert.match(bridgeSource, /export interface DefenseRealtimeProviderBridge \{[\s\S]*bootstrap\(\): Promise<DefenseRealtimeBootstrapPayload>[\s\S]*connect\(mediaController: DefenseRealtimeMediaController\): Promise<void>[\s\S]*disconnect\(\): Promise<void>[\s\S]*interrupt\(\): Promise<void>[\s\S]*setAudioEnabled\(enabled: boolean\): Promise<void>[\s\S]*setVideoEnabled\(enabled: boolean\): Promise<void>[\s\S]*onEvent\(listener:/, '前端缺少统一的 defense realtime provider bridge 接口或未改为消费媒体控制层')
  assert.match(bridgeSource, /class QwenBridge extends BaseDefenseRealtimeBridge \{/, '前端缺少 Qwen bridge')
  assert.match(bridgeSource, /class CozeBridge extends BaseDefenseRealtimeBridge \{/, '前端缺少 Coze bridge')
  assert.match(bridgeSource, /private buildQwenStartPayload\(\): Record<string, unknown> \{[\s\S]*action: 'run-task'/, 'Qwen bridge 未发送 Start 消息')
  assert.match(bridgeSource, /directive: 'UpdateInfo'/, 'Qwen bridge 未通过 UpdateInfo 上传视频帧')
  assert.match(bridgeSource, /connectorId,/, 'Coze bridge 未接入 connectorId')
  assert.match(bridgeSource, /const cozeRealtimeModuleId = '@coze\/realtime-api'[\s\S]*await import\(\/\* @vite-ignore \*\/ cozeRealtimeModuleId\)/, 'Coze bridge 未接入官方 realtime SDK 的动态导入')
  assert.match(mediaControllerSource, /export class DefenseRealtimeMediaController \{/, '缺少共享媒体控制层实现')
  assert.match(mediaControllerSource, /navigator\.mediaDevices\?\.getUserMedia/, '共享媒体控制层未申请浏览器音视频设备权限')
  assert.match(mediaControllerSource, /onAudioChunk\(listener:/, '共享媒体控制层缺少音频采样订阅')
  assert.match(mediaControllerSource, /onVideoFrame\(listener:/, '共享媒体控制层缺少视频帧抽样订阅')
  assert.match(relaySource, /new UpstreamWebSocket\(runtime\.defenseRealtime\.qwen\.baseWsUrl, \{[\s\S]*Authorization: `Bearer \$\{runtime\.defenseRealtime\.qwen\.apiKey\}`/, '千问 relay 未通过服务端添加上游鉴权头')
  assert.match(relaySource, /resolveProjectRealtimeAccess/, '千问 relay 未校验项目实时访问权限')
  assert.match(mainPanelSource, /defenseRealtimeState\?: DefenseRealtimeSessionMeta \| null/, '主面板缺少 defense realtime 状态透传入参')
  assert.match(mainPanelSource, /:defense-realtime-state="props\.defenseRealtimeState"/, '主面板未向会议详情透传 defense realtime 状态')
  assert.match(meetingPanelSource, /defenseRealtimeState\?: DefenseRealtimeSessionMeta \| null/, '会议详情面板缺少 defense realtime 状态入参')
  assert.match(meetingPanelSource, /:defense-realtime-state="defenseRealtimeState"/, '会议详情面板未向 Web 客户端透传 defense realtime 状态')
  assert.match(webClientSource, /showDefenseRealtimeSidecar = computed\(\(\) => \{/, '会议 Web 客户端缺少 defense sidecar 可见态')
  assert.match(webClientSource, /Defense Sidecar/, '会议 Web 客户端缺少 defense sidecar 面板')
  assert.match(webClientSource, /sidecar 异常：/, '会议 Web 客户端缺少 sidecar 异常提示')
})
