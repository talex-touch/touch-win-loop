import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RTC_PROVIDER_FILE = resolve(process.cwd(), 'server/services/meeting/rtc-provider.ts')
const PROVIDER_EVENTS_FILE = resolve(process.cwd(), 'server/api/internal/meetings/provider-events.post.ts')
const MEETING_END_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/end.post.ts')
const MEETING_ARTIFACTS_FILE = resolve(process.cwd(), 'server/services/meeting/meeting-artifacts.ts')
const PROJECT_RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const COMPOSE_FILE = resolve(process.cwd(), 'deploy/meeting/compose.yaml')
const LIVEKIT_CONFIG_FILE = resolve(process.cwd(), 'deploy/meeting/livekit.yaml.example')
const EGRESS_CONFIG_FILE = resolve(process.cwd(), 'deploy/meeting/egress.yaml.example')
const DEPLOY_DOC_FILE = resolve(process.cwd(), 'deploy/meeting/README.zh-CN.md')
const SETUP_DOC_FILE = resolve(process.cwd(), 'docs/meeting-runtime-setup.md')

it('livekit RTC provider 已接入 egress 录制与原生 webhook 校验', async () => {
  const rtcProviderSource = await readFile(RTC_PROVIDER_FILE, 'utf8')

  assert.match(rtcProviderSource, /StartRoomCompositeEgress/, 'RTC provider 未调用 LiveKit Egress API')
  assert.match(rtcProviderSource, /buildMeetingProviderWebhookUrl\(/, 'RTC provider 未生成 provider webhook 回调地址')
  assert.match(rtcProviderSource, /host\.docker\.internal/, 'RTC provider 未将本地 loopback webhook 地址改写为 Docker 可回调地址')
  assert.match(rtcProviderSource, /verifyLiveKitWebhookToken\(/, 'RTC provider 未校验原生 LiveKit webhook JWT')
  assert.match(rtcProviderSource, /payload\.sha256/, 'RTC provider 未校验 webhook body sha256')
  assert.match(rtcProviderSource, /localFilePath\?: string/, 'RTC recording artifact 未支持本地文件路径')
})

it('provider webhook 路由已归一化 LiveKit 原生事件并支持本地录制 artifact', async () => {
  const [providerEventsSource, meetingArtifactsSource] = await Promise.all([
    readFile(PROVIDER_EVENTS_FILE, 'utf8'),
    readFile(MEETING_ARTIFACTS_FILE, 'utf8'),
  ])

  assert.match(providerEventsSource, /readRawBody/, 'provider webhook 路由未读取 raw body')
  assert.match(providerEventsSource, /normalizeLiveKitWebhookBody\(/, 'provider webhook 路由未归一化 LiveKit 原生事件')
  assert.match(providerEventsSource, /track_published/, 'provider webhook 路由未处理 track_published')
  assert.match(providerEventsSource, /egress_ended/, 'provider webhook 路由未处理 egress_ended')
  assert.match(providerEventsSource, /const hasArtifact = Boolean\([\s\S]*artifact\.downloadUrl[\s\S]*artifact\.localFilePath/, 'provider webhook 未在 egress_ended 时按 artifact 可用性判定录制就绪')
  assert.match(providerEventsSource, /recording_started/, 'provider webhook 路由未处理 recording_started')
  assert.match(meetingArtifactsSource, /artifact\.localFilePath/, '会议录制落库未支持读取本地文件 artifact')
})

it('结束会议时会主动停止 LiveKit egress 并关闭房间，避免录制卡在 pending 状态', async () => {
  const [rtcProviderSource, endApiSource] = await Promise.all([
    readFile(RTC_PROVIDER_FILE, 'utf8'),
    readFile(MEETING_END_API_FILE, 'utf8'),
  ])

  assert.match(rtcProviderSource, /StopEgress/, 'RTC provider 未接入主动停止录制能力')
  assert.match(rtcProviderSource, /DeleteRoom/, 'RTC provider 未接入主动关闭房间能力')
  assert.match(endApiSource, /getRtcProviderGateway/, '结束会议接口未接入 RTC gateway 收尾')
  assert.match(endApiSource, /stopRecording\(\{ recordingId, roomName \}\)/, '结束会议接口未主动停止录制')
  assert.match(endApiSource, /deleteRoom\(\{ roomName \}\)/, '结束会议接口未主动关闭房间')
})

it('会议纪要与录制会自动汇总到项目级会议 memory 文档', async () => {
  const [meetingArtifactsSource, projectResourceStoreSource] = await Promise.all([
    readFile(MEETING_ARTIFACTS_FILE, 'utf8'),
    readFile(PROJECT_RESOURCE_STORE_FILE, 'utf8'),
  ])

  assert.match(projectResourceStoreSource, /PROJECT_MEETING_MEMORY_RESOURCE_TITLE = '会议纪要总览'/, '项目资源存储层缺少统一的会议 memory 文档标题')
  assert.match(projectResourceStoreSource, /export async function ensureProjectMeetingMemoryResource\(/, '项目资源存储层缺少会议 memory 文档兜底创建逻辑')
  assert.match(projectResourceStoreSource, /meetingMemory: true/, '会议 memory 文档缺少稳定元数据标记')
  assert.match(meetingArtifactsSource, /ensureProjectMeetingMemoryResource/, '会议产物沉淀链路未复用项目级会议 memory 文档')
  assert.match(meetingArtifactsSource, /parentResourceId: meetingMemory\.id/, '会议录制未自动收纳到会议 memory 文档下')
  assert.match(meetingArtifactsSource, /MEETING_MEMORY_AUTO_SECTION_TITLE/, '会议纪要未构建自动汇总区块')
  assert.match(meetingArtifactsSource, /buildMeetingMemorySummary/, '会议纪要未生成项目级总体摘要')
  assert.match(meetingArtifactsSource, /latestMeetingId: input\.meeting\.id/, '会议 memory 文档未记录最近一次会议上下文')
})

it('本地 bring-up 已补齐 egress 服务与录制说明', async () => {
  const [composeSource, livekitConfigSource, egressConfigSource, deployDocSource, setupDocSource] = await Promise.all([
    readFile(COMPOSE_FILE, 'utf8'),
    readFile(LIVEKIT_CONFIG_FILE, 'utf8'),
    readFile(EGRESS_CONFIG_FILE, 'utf8'),
    readFile(DEPLOY_DOC_FILE, 'utf8'),
    readFile(SETUP_DOC_FILE, 'utf8'),
  ])

  assert.match(composeSource, /\begress:\b/, '本地 compose 未新增 egress 服务')
  assert.match(composeSource, /\/tmp\/winloop-meeting-egress/, '本地 compose 未挂载录制输出目录')
  assert.match(livekitConfigSource, /provider-events/, 'LiveKit 示例配置未包含会议 provider webhook')
  assert.match(egressConfigSource, /ws_url: ws:\/\/livekit:7880/, 'egress 示例配置未指向本地 LiveKit')
  assert.match(deployDocSource, /会议录制/, '本地部署说明未描述录制导入结果')
  assert.match(setupDocSource, /LiveKit Egress/, '会议运行说明未描述 LiveKit Egress 录制链路')
})
