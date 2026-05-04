import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const RTC_PROVIDER_FILE = resolve(process.cwd(), 'server/services/meeting/rtc-provider.ts')
const PROVIDER_EVENTS_FILE = resolve(process.cwd(), 'server/api/internal/meetings/provider-events.post.ts')
const MEETING_END_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/end.post.ts')
const MEETING_ARTIFACTS_FILE = resolve(process.cwd(), 'server/services/meeting/meeting-artifacts.ts')
const PROJECT_RESOURCE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-store.ts')
const DOCUMENT_STORAGE_FILE = resolve(process.cwd(), 'server/storage/document-storage.ts')
const RUNTIME_CONFIG_STORE_FILE = resolve(process.cwd(), 'server/utils/platform-runtime-config-store.ts')
const RUNTIME_SETTINGS_API_FILE = resolve(process.cwd(), 'server/api/admin/runtime-settings.patch.ts')
const STORAGE_TEST_API_FILE = resolve(process.cwd(), 'server/api/admin/storage-service/test.post.ts')
const STORAGE_SERVICE_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/storage-service.vue')
const RUNTIME_SETTINGS_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/runtime-settings.vue')
const PLATFORM_RUNTIME_CACHE_PLUGIN_FILE = resolve(process.cwd(), 'server/plugins/platform-runtime-config-cache.ts')
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

it('录制资源支持后台 S3/MinIO 存储配置、远端 URL 重试导入与存储探针', async () => {
  const [
    meetingArtifactsSource,
    workerSource,
    storageSource,
    runtimeStoreSource,
    runtimeApiSource,
    storageTestSource,
    runtimePageSource,
    runtimeCachePluginSource,
    setupDocSource,
    deployDocSource,
  ] = await Promise.all([
    readFile(MEETING_ARTIFACTS_FILE, 'utf8'),
    readFile(resolve(process.cwd(), 'server/plugins/project-meeting-job-worker.ts'), 'utf8'),
    readFile(DOCUMENT_STORAGE_FILE, 'utf8'),
    readFile(RUNTIME_CONFIG_STORE_FILE, 'utf8'),
    readFile(RUNTIME_SETTINGS_API_FILE, 'utf8'),
    readFile(STORAGE_TEST_API_FILE, 'utf8'),
    readFile(STORAGE_SERVICE_PAGE_FILE, 'utf8'),
    readFile(PLATFORM_RUNTIME_CACHE_PLUGIN_FILE, 'utf8'),
    readFile(SETUP_DOC_FILE, 'utf8'),
    readFile(DEPLOY_DOC_FILE, 'utf8'),
  ])

  assert.match(meetingArtifactsSource, /MEETING_RECORDING_DOWNLOAD_RETRY_COUNT = 3/, '会议录制远端 URL 导入缺少重试次数')
  assert.match(meetingArtifactsSource, /AbortController/, '会议录制远端 URL 导入缺少超时控制')
  assert.match(meetingArtifactsSource, /artifactDownloadUrl: input\.artifact\.downloadUrl \? sanitizeArtifactDownloadUrl/, '会议录制 metadata 未记录脱敏后的下载来源')
  assert.match(meetingArtifactsSource, /sourceStorageProvider: storage\.channelId/, '会议录制 metadata 未记录实际存储 channel')
  assert.match(meetingArtifactsSource, /sourceStorageProviderType: storage\.provider/, '会议录制 metadata 未记录实际存储 provider')
  assert.match(workerSource, /runtime,[\s\S]*\}\)/, '会议 worker 未把 effective runtime 传入录制持久化')
  assert.match(storageSource, /export function invalidateDocumentStorage\(\): void/, '文档存储层缺少配置变更失效入口')
  assert.match(storageSource, /getCachedPlatformRuntimeOverridesSnapshot/, '文档存储层未读取后台 runtime storage override')
  assert.match(runtimeCachePluginSource, /readEffectivePlatformRuntimeSettings\(\)/, '平台 runtime override 未在服务启动时预热缓存')
  assert.match(runtimeStoreSource, /storage\?: \{[\s\S]*provider\?: string[\s\S]*accessKey\?: string[\s\S]*secretKey\?: string/, '平台 runtime override 未纳入 storage 配置')
  assert.match(runtimeStoreSource, /encryptConfigSecret\(value\)/, 'storage 密钥未进入加密保存流程')
  assert.match(runtimeApiSource, /storage\?: \{[\s\S]*accessKeyMode\?: 'keep' \| 'replace' \| 'clear'/, 'runtime 设置接口未支持 storage 密钥替换模式')
  assert.match(runtimeApiSource, /invalidateDocumentStorage\(\)/, 'runtime 设置保存后未失效文档存储缓存')
  assert.match(storageTestSource, /storage-probe/, '缺少对象存储写读删探针')
  assert.match(storageTestSource, /putObject[\s\S]*getObjectBuffer[\s\S]*deleteObject/, '对象存储探针未覆盖写读删')
  assert.match(runtimePageSource, /\/admin\/storage-service/, '后台存储服务页未暴露对象存储配置区')
  assert.match(runtimePageSource, /\/admin\/storage-service\/test/, '后台存储服务页未接入对象存储探针接口')
  assert.match(setupDocSource, /\/admin\/storage-service[\s\S]*`local`、`s3` 或 `minio`/, '会议运行说明未描述后台 Storage 配置')
  assert.match(deployDocSource, /\/admin\/storage-service[\s\S]*`local`、`s3` 或 `minio`/, '部署说明未描述后台 Storage 配置')
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
