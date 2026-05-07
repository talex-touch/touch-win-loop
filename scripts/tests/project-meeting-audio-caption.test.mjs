import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const WEB_CLIENT_FILE = resolve(process.cwd(), 'app/components/meeting/ProjectMeetingWebClient.vue')
const SHARE_PAGE_FILE = resolve(process.cwd(), 'app/pages/meeting/share/[shareKey].vue')
const FRAME_API_FILE = resolve(process.cwd(), 'server/api/meetings/[meetingId]/captions/frame.post.ts')
const MEETING_SERVICE_FILE = resolve(process.cwd(), 'server/services/meeting/project-meeting.ts')
const MEETING_END_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/meetings/[meetingId]/end.post.ts')
const PROVIDER_EVENTS_FILE = resolve(process.cwd(), 'server/api/internal/meetings/provider-events.post.ts')
const DEV_BRIDGE_FILE = resolve(process.cwd(), 'scripts/meeting-asr-dev-bridge.mjs')
const MEETING_SETUP_DOC_FILE = resolve(process.cwd(), 'docs/meeting-runtime-setup.md')
const MEETING_DEPLOY_DOC_FILE = resolve(process.cwd(), 'deploy/meeting/README.zh-CN.md')
const ASR_GATEWAY_FILE = resolve(process.cwd(), 'server/services/meeting/asr-gateway.ts')
const ASR_EVENTS_FILE = resolve(process.cwd(), 'server/api/internal/meetings/asr-events.post.ts')

it('会议 Web 客户端已接入字幕音频上行链路', async () => {
  const [webClientSource, sharePageSource] = await Promise.all([
    readFile(WEB_CLIENT_FILE, 'utf8'),
    readFile(SHARE_PAGE_FILE, 'utf8'),
  ])

  assert.match(webClientSource, /captionUploadState = ref<'idle' \| 'capturing' \| 'error'>\('idle'\)/, 'Web 客户端缺少字幕上行状态')
  assert.match(webClientSource, /async function syncCaptionCapture\(\): Promise<void> \{/, 'Web 客户端缺少麦克风字幕采集同步逻辑')
  assert.match(webClientSource, /fetch\(endpoint\(`\/meetings\/\$\{meetingId\}\/captions\/frame`\)/, 'Web 客户端未调用字幕音频帧上传接口')
  assert.match(webClientSource, /audio\/pcm;rate=\$\{captionSampleRate\};channels=1;encoding=s16le/, 'Web 客户端未声明 PCM 音频格式')
  assert.match(sharePageSource, /:meeting-guest-token="guestJoinSession\.meetingGuestToken"/, 'guest 分享页未向 Web 客户端透传 meetingGuestToken')
})

it('内置 ASR 会先广播 partial，final 才落库并计量', async () => {
  const [asrGatewaySource, asrEventsSource, setupDocSource, deployDocSource] = await Promise.all([
    readFile(ASR_GATEWAY_FILE, 'utf8'),
    readFile(ASR_EVENTS_FILE, 'utf8'),
    readFile(MEETING_SETUP_DOC_FILE, 'utf8'),
    readFile(MEETING_DEPLOY_DOC_FILE, 'utf8'),
  ])

  assert.match(asrGatewaySource, /eventType\?: 'partial' \| 'final'/, '内置 ASR 回调未支持 partial/final 事件类型')
  assert.match(asrGatewaySource, /text: '正在识别\.\.\.'/, '内置 ASR 未在转写前广播 pending partial')
  assert.match(asrEventsSource, /isFinal: eventType !== 'partial'/, 'ASR events 未保持 partial 不落库')
  assert.match(asrEventsSource, /teamConsumeAiQuota/, 'ASR final 未执行配额计量')
  assert.match(asrEventsSource, /eventCode: 'ai\.meeting\.asr'/, 'ASR final 未记录 billing usage 事件')
  assert.match(setupDocSource, /pending partial/, '会议运行说明未描述内置 ASR partial')
  assert.match(deployDocSource, /pending partial/, '本地部署说明未描述内置 ASR partial')
})

it('服务端已接入字幕音频帧鉴权与 ASR session 结束链路', async () => {
  await access(FRAME_API_FILE)

  const [frameApiSource, meetingServiceSource, endApiSource, providerEventsSource] = await Promise.all([
    readFile(FRAME_API_FILE, 'utf8'),
    readFile(MEETING_SERVICE_FILE, 'utf8'),
    readFile(MEETING_END_API_FILE, 'utf8'),
    readFile(PROVIDER_EVENTS_FILE, 'utf8'),
  ])

  assert.match(frameApiSource, /resolveProjectMeetingAudioFrameTarget/, '字幕音频帧接口未走会议服务鉴权解析')
  assert.match(frameApiSource, /getMeetingAsrGateway\(runtime\)/, '字幕音频帧接口未调用 ASR gateway')
  assert.match(frameApiSource, /meetingGuestToken \? undefined : \(await requireAuth\(event\)\)\.user/, '字幕音频帧接口未区分 guest token 与成员登录态')
  assert.match(meetingServiceSource, /export async function resolveProjectMeetingAudioFrameTarget\(/, '会议服务缺少字幕音频目标解析函数')
  assert.match(meetingServiceSource, /export async function finalizeProjectMeetingAsrSession\(/, '会议服务缺少 ASR finishSession 封装')
  assert.match(endApiSource, /finalizeProjectMeetingAsrSession/, '手动结束会议接口未触发 ASR finishSession')
  assert.match(providerEventsSource, /finalizeProjectMeetingAsrSession/, 'provider room_finished 回调未触发 ASR finishSession')
})

it('asr dev bridge 已支持真实转写适配器模式', async () => {
  const [devBridgeSource, setupDocSource, deployDocSource] = await Promise.all([
    readFile(DEV_BRIDGE_FILE, 'utf8'),
    readFile(MEETING_SETUP_DOC_FILE, 'utf8'),
    readFile(MEETING_DEPLOY_DOC_FILE, 'utf8'),
  ])

  assert.match(devBridgeSource, /MEETING_ASR_DEV_TRANSCRIBE_URL/, 'ASR dev bridge 未支持转写后端地址配置')
  assert.match(devBridgeSource, /MEETING_ASR_DEV_TRANSCRIBE_MODEL_FALLBACKS/, 'ASR dev bridge 未支持转写模型回退配置')
  assert.match(devBridgeSource, /whisper-large-v3-turbo/, 'ASR dev bridge 未将默认模型切到 whisper-large-v3-turbo')
  assert.match(devBridgeSource, /whisper-large-v3/, 'ASR dev bridge 未内置 Groq 回退模型')
  assert.match(devBridgeSource, /MEETING_ASR_DEV_CALLBACK_URL/, 'ASR dev bridge 未支持 asr-events 回调地址配置')
  assert.match(devBridgeSource, /buildWavBuffer\(/, 'ASR dev bridge 未把 PCM 转成 wav')
  assert.match(devBridgeSource, /audio\/wav/, 'ASR dev bridge 未按 wav 上传转写请求')
  assert.match(devBridgeSource, /emitCaptionEvent\(/, 'ASR dev bridge 未回调应用字幕事件')
  assert.match(setupDocSource, /MEETING_ASR_DEV_TRANSCRIBE_URL/, '会议运行说明未描述真实转写适配器模式')
  assert.match(setupDocSource, /api\.groq\.com\/openai\/v1\/audio\/transcriptions/, '会议运行说明未给出 Groq 作为默认开发接法')
  assert.match(deployDocSource, /MEETING_ASR_DEV_TRANSCRIBE_URL/, '本地部署说明未描述真实转写适配器模式')
  assert.match(deployDocSource, /MEETING_ASR_DEV_TRANSCRIBE_MODEL_FALLBACKS/, '本地部署说明未描述转写模型回退配置')
})
